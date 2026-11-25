import "server-only";
import { adminClient } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { readDraft, savePack } from "./files";
import { orderPack } from "./flow";
import { fetchOrder } from "./razorpay";

const now = () => new Date().toISOString();

// A request becomes an order: the order pack is built and stored privately, and the 7-day
// sample clock stops (the files are needed for production). Used by the Razorpay
// confirmation and by Jaydeep's manual "advance received" button.
export async function buildOrder(requestId: string) {
  const db = adminClient();
  const { data: r } = await db
    .from("creator_requests")
    .select("id, state, language, answers, style_tags, quote, plan_version, sample_state")
    .eq("id", requestId)
    .maybeSingle();
  if (!r || r.state !== "submitted" || r.sample_state !== "sent" || !r.plan_version) return false;
  const { data: consents } = await db.from("creator_consents").select("kind, terms_version").eq("request_id", requestId);
  const version = (k: string) => consents?.find((c) => c.kind === k)?.terms_version ?? "";
  const pack = orderPack(r, await readDraft(requestId), {
    terms_version: version("terms_refund"),
    data_consent_version: version("data_processing"),
    own_voice: !!consents?.some((c) => c.kind === "own_voice"),
  });
  const key = await savePack(requestId, pack);
  await db
    .from("creator_requests")
    .update({ state: "ordered", order_pack_key: key, files_delete_at: null, updated_at: now() })
    .eq("id", requestId)
    .eq("state", "submitted");
  return true;
}

// The advance is paid: called from the checkout (signature checked) and from the webhook
// (signature checked). Safe to call twice: only the first call does anything.
export async function advancePaid(razorpayOrderId: string, paymentId: string, source: "checkout" | "webhook") {
  const db = adminClient();
  const { data: p } = await db
    .from("creator_payments")
    .select("id, request_id, kind, amount_paise, status")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();
  if (!p) return { ok: false, reason: "unknown order" };
  if (p.status === "paid") return { ok: true, already: true };

  // Ask Razorpay itself that the full amount was paid, before anything changes.
  const order = await fetchOrder(razorpayOrderId);
  if (order.amount_paid < p.amount_paise) return { ok: false, reason: `not fully paid (${order.amount_paid}/${p.amount_paise})` };

  const { data: claimed } = await db
    .from("creator_payments")
    .update({ status: "paid", razorpay_payment_id: paymentId, paid_at: now(), failure_reason: null })
    .eq("id", p.id)
    .neq("status", "paid")
    .select("id");
  if (!claimed?.length) return { ok: true, already: true };

  if (p.kind === "advance") await buildOrder(p.request_id);

  const { data: r } = await db.from("creator_requests").select("id, name, email, language, quote").eq("id", p.request_id).maybeSingle();
  if (r) {
    const rupees = `₹${(p.amount_paise / 100).toLocaleString("en-IN")}`;
    const gu = r.language === "gu";
    await sendEmail({
      to: r.email,
      subject: gu ? "એડવાન્સ મળી ગયું · Advance received" : "Creator's Space: your advance is received",
      text: [
        `Dear ${r.name || "writer"},`,
        "",
        gu ? `તમારું ${rupees}નું એડવાન્સ મળી ગયું. તમારી વાર્તાનું કામ હવે શરૂ થાય છે.` : "",
        `We have received your advance of ${rupees}. Work on your story now begins.`,
        `Razorpay payment: ${paymentId}`,
        "",
        "You can follow your order at https://jambuch.in/creators/start",
        "",
        "Jaydeep Buch",
        "Creator's Space · jambuch.in/creators",
      ]
        .filter((l, i, a) => l !== "" || a[i - 1] !== "")
        .join("\n"),
      replyTo: process.env.ADMIN_EMAIL,
    });
    const admin = process.env.ADMIN_EMAIL;
    if (admin) {
      await sendEmail({
        to: admin,
        subject: `Creator's Space: advance ${rupees} paid by ${r.name || r.email}`,
        text: [`${r.name} <${r.email}> paid the ${p.kind} (${rupees}) via ${source}.`, `Razorpay order ${razorpayOrderId}, payment ${paymentId}.`, "", `https://jambuch.in/admin/creators/${r.id}`].join("\n"),
        replyTo: r.email,
      });
    }
  }
  return { ok: true };
}

export async function paymentFailed(razorpayOrderId: string, reason: string) {
  await adminClient()
    .from("creator_payments")
    .update({ status: "failed", failure_reason: reason.slice(0, 300) })
    .eq("razorpay_order_id", razorpayOrderId)
    .eq("status", "created");
}
