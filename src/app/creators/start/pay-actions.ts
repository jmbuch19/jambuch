"use server";

import { revalidatePath } from "next/cache";
import { sessionClient } from "@/lib/supabase-server";
import { adminClient } from "@/lib/supabase-admin";
import { flowSettings } from "@/lib/creators/flow";
import { createOrder, paymentSignatureValid, razorpayKeyId, razorpayReady } from "@/lib/creators/razorpay";
import { advancePaid } from "@/lib/creators/orders";
import type { Quote } from "@/lib/creators/pricing";

// The 50% advance after the writer has heard the free sample (brief §1, §4 step 7).
// The amount comes from the quote saved with the approved plan; nothing from the browser.

async function signedInUser() {
  const {
    data: { user },
  } = await (await sessionClient()).auth.getUser();
  return user?.email ? { id: user.id, email: user.email.toLowerCase() } : null;
}

export type Checkout = { key: string; orderId: string; amount: number; name: string; email: string; contact: string; description: string } | { error: string };

export async function startAdvance(requestId: string): Promise<Checkout> {
  const user = await signedInUser();
  if (!user) return { error: "Please sign in again." };
  const settings = await flowSettings();
  if (!settings.payments_enabled || !razorpayReady()) return { error: "Online payment is not open yet. Please reply to the studio’s email." };

  const db = adminClient();
  const { data: r } = await db
    .from("creator_requests")
    .select("id, user_id, state, sample_state, quote, name, email, whatsapp")
    .eq("id", requestId)
    .maybeSingle();
  if (!r || r.user_id !== user.id) return { error: "This request isn’t yours." };
  if (r.state !== "submitted" || r.sample_state !== "sent") return { error: "The advance is paid after your free sample is ready." };
  const quote = r.quote as Quote | null;
  if (!quote?.advance) return { error: "Your quote is missing. Please reply to the studio’s email." };
  const amountPaise = Math.round(quote.advance * 100);

  // An unpaid order for the same amount is reused (the writer closed the window and came back).
  const { data: open } = await db
    .from("creator_payments")
    .select("razorpay_order_id, amount_paise, status")
    .eq("request_id", requestId)
    .eq("kind", "advance")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open?.status === "paid") return { error: "Your advance is already paid. Thank you." };
  let orderId = open && open.status === "created" && open.amount_paise === amountPaise ? open.razorpay_order_id : "";

  if (!orderId) {
    try {
      const order = await createOrder({
        amountPaise,
        receipt: `adv-${requestId.slice(0, 8)}-${Date.now().toString(36)}`,
        notes: { request_id: requestId, kind: "advance" },
      });
      orderId = order.id;
    } catch (e) {
      console.error("creators: Razorpay order failed for", requestId, e instanceof Error ? e.message : e);
      return { error: "The payment couldn’t be started just now. Please try again in a minute." };
    }
    const { error } = await db
      .from("creator_payments")
      .insert({ request_id: requestId, user_id: user.id, kind: "advance", amount_paise: amountPaise, razorpay_order_id: orderId });
    if (error) return { error: "Something went wrong on our side. Please try again." };
  }

  return {
    key: razorpayKeyId(),
    orderId,
    amount: amountPaise,
    name: r.name || "",
    email: r.email,
    contact: r.whatsapp || "",
    description: `Creator's Space · 50% advance`,
  };
}

// The checkout's success callback. The signature proves the payment belongs to our order;
// advancePaid() then asks Razorpay that the full amount was paid.
export async function confirmPayment(orderId: string, paymentId: string, signature: string): Promise<{ ok: boolean; error?: string }> {
  const user = await signedInUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (!paymentSignatureValid(orderId, paymentId, signature)) return { ok: false, error: "We couldn’t confirm this payment. If money was taken, it will be confirmed by Razorpay within minutes." };
  const { data: p } = await adminClient().from("creator_payments").select("user_id").eq("razorpay_order_id", orderId).maybeSingle();
  if (!p || p.user_id !== user.id) return { ok: false, error: "This payment isn’t yours." };
  try {
    const res = await advancePaid(orderId, paymentId, "checkout");
    revalidatePath("/creators/start");
    return res.ok ? { ok: true } : { ok: false, error: "Razorpay hasn’t confirmed the full amount yet. It usually does within minutes; we’ll email you." };
  } catch (e) {
    console.error("creators: payment confirm failed", orderId, e instanceof Error ? e.message : e);
    return { ok: false, error: "We couldn’t confirm the payment just now. If money was taken, Razorpay confirms it to us within minutes and we’ll email you." };
  }
}
