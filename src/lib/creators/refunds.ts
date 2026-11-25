import "server-only";
import { adminClient } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { createRefund } from "./razorpay";

// Refunds (Jaydeep, 25 Nov 2026): one shared path for the admin's one-click button and the
// automatic rules (duplicate payment; sample not delivered within 3 days).
// Order of work, so money can never go back twice:
//   1. check the amount against what was paid and already refunded
//   2. write a 'pending' row (a unique index allows one in flight per payment)
//   3. ask Razorpay; store its refund id (the webhook later marks it processed or failed)

export type RefundReason = "sample_not_delivered" | "duplicate_payment" | "our_mistake" | "goodwill" | "dispute_settled" | "other";

export const REASON_TEXT: Record<RefundReason, string> = {
  sample_not_delivered: "your sample could not be delivered in time",
  duplicate_payment: "you were charged twice for the same thing",
  our_mistake: "of a mistake on our side",
  goodwill: "of our goodwill",
  dispute_settled: "your concern has been settled",
  other: "of the reason we discussed with you",
};

const now = () => new Date().toISOString();

// Paid minus refunded (processed and pending) for one Razorpay payment, in paise.
export async function refundable(paymentRowId: number, razorpayPaymentId: string) {
  const db = adminClient();
  const [{ data: p }, { data: refunds }] = await Promise.all([
    db.from("creator_payments").select("id, amount_paise, status, razorpay_payment_id").eq("id", paymentRowId).maybeSingle(),
    db.from("creator_refunds").select("amount_paise, status").eq("razorpay_payment_id", razorpayPaymentId).in("status", ["pending", "processed"]),
  ]);
  if (!p) return 0;
  const paid = razorpayPaymentId === p.razorpay_payment_id ? (p.status === "paid" ? p.amount_paise : 0) : p.amount_paise; // a duplicate payment on the same order
  return Math.max(0, paid - (refunds ?? []).reduce((s, r) => s + r.amount_paise, 0));
}

export async function refund(o: {
  paymentRowId: number;
  razorpayPaymentId?: string; // defaults to the recorded payment; set for a duplicate
  amountPaise: number;
  reason: RefundReason;
  note?: string;
  by: string;
}): Promise<{ ok: boolean; message: string }> {
  const db = adminClient();
  const { data: p } = await db
    .from("creator_payments")
    .select("id, request_id, kind, amount_paise, status, razorpay_payment_id")
    .eq("id", o.paymentRowId)
    .maybeSingle();
  if (!p) return { ok: false, message: "Payment not found." };
  const rzpPaymentId = o.razorpayPaymentId ?? p.razorpay_payment_id;
  if (!rzpPaymentId) return { ok: false, message: "This payment has no Razorpay payment id (not paid online)." };
  const amount = Math.round(o.amountPaise);
  const left = await refundable(p.id, rzpPaymentId);
  if (!(amount > 0) || amount > left) return { ok: false, message: `Amount must be between ₹1 and ₹${(left / 100).toLocaleString("en-IN")}.` };

  const { data: row, error } = await db
    .from("creator_refunds")
    .insert({ payment_id: p.id, request_id: p.request_id, razorpay_payment_id: rzpPaymentId, amount_paise: amount, reason: o.reason, note: o.note?.slice(0, 500) || null, by: o.by })
    .select("id")
    .single();
  if (error || !row) return { ok: false, message: error?.code === "23505" ? "A refund for this payment is already in progress." : "Couldn't record the refund." };

  try {
    const r = await createRefund(rzpPaymentId, amount, `rf-${row.id}`, { request_id: p.request_id, reason: o.reason, by: o.by });
    await db
      .from("creator_refunds")
      .update({ razorpay_refund_id: r.id, status: r.status === "processed" ? "processed" : "pending", processed_at: r.status === "processed" ? now() : null })
      .eq("id", row.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("creator_refunds").update({ status: "failed", failure_reason: message.slice(0, 300) }).eq("id", row.id);
    return { ok: false, message: `Razorpay refused the refund: ${message}` };
  }

  // Tell the writer; tell the studio about automatic refunds.
  const { data: req } = await db.from("creator_requests").select("id, name, email, language").eq("id", p.request_id).maybeSingle();
  const rupees = `₹${(amount / 100).toLocaleString("en-IN")}`;
  if (req) {
    await sendEmail({
      to: req.email,
      subject: req.language === "gu" ? `રિફંડ ${rupees} · Refund of ${rupees}` : `Creator's Space: refund of ${rupees}`,
      text: [
        `Dear ${req.name || "writer"},`,
        "",
        `We have refunded ${rupees} because ${REASON_TEXT[o.reason]}. It goes back to the card, UPI or bank account you paid with; banks usually take 5–7 working days to show it.`,
        "",
        "Jaydeep Buch",
        "Creator's Space · jambuch.in/creators",
      ].join("\n"),
      replyTo: process.env.ADMIN_EMAIL,
    });
    if (o.by.startsWith("auto") && process.env.ADMIN_EMAIL) {
      await sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: `Creator's Space: automatic refund ${rupees} (${o.reason.replace(/_/g, " ")})`,
        text: [`${req.name} <${req.email}>: ${rupees} refunded automatically (${o.by}).`, "", `https://jambuch.in/admin/creators/${req.id}`].join("\n"),
      });
    }
  }
  // A refunded sample that was never delivered closes the request; its files go.
  if (p.kind === "sample" && o.reason === "sample_not_delivered") {
    await db.from("creator_requests").update({ state: "closed", files_delete_at: now(), updated_at: now() }).eq("id", p.request_id).neq("state", "ordered");
  }
  return { ok: true, message: `Refund of ${rupees} sent to Razorpay.` };
}

// The webhook reports the outcome.
export async function refundOutcome(razorpayRefundId: string, status: "processed" | "failed", reason?: string) {
  await adminClient()
    .from("creator_refunds")
    .update({ status, processed_at: status === "processed" ? now() : null, failure_reason: reason?.slice(0, 300) ?? null })
    .eq("razorpay_refund_id", razorpayRefundId);
}
