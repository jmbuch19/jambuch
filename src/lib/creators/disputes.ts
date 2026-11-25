import "server-only";
import { adminClient } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";

// Bank disputes (chargebacks) reported by Razorpay's payment.dispute.* webhook events. Each one
// is stored and the studio is emailed a link to the request's evidence page, which collects
// everything a dispute needs (consents, approved plan, payments, delivery) in one place.

export type DisputeEntity = {
  id?: string;
  payment_id?: string;
  amount?: number;
  reason_code?: string;
  status?: string;
  respond_by?: number;
};

export async function recordDispute(event: string, d: DisputeEntity) {
  if (!d.id || !d.payment_id) return;
  const db = adminClient();
  const { data: pay } = await db.from("creator_payments").select("request_id").eq("razorpay_payment_id", d.payment_id).maybeSingle();
  const status = d.status ?? event.replace("payment.dispute.", "");
  await db.from("creator_disputes").upsert(
    {
      razorpay_dispute_id: d.id,
      razorpay_payment_id: d.payment_id,
      request_id: pay?.request_id ?? null,
      amount_paise: d.amount ?? null,
      reason_code: d.reason_code ?? null,
      status,
      respond_by: d.respond_by ? new Date(d.respond_by * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "razorpay_dispute_id" },
  );
  const admin = process.env.ADMIN_EMAIL;
  if (admin) {
    await sendEmail({
      to: admin,
      subject: `Creator's Space: bank dispute ${status} (${d.reason_code ?? "no reason code"})`,
      text: [
        `Razorpay reports a dispute on payment ${d.payment_id}: ${event}, status ${status}.`,
        d.amount ? `Amount: ₹${(d.amount / 100).toLocaleString("en-IN")}` : "",
        d.respond_by ? `Respond by: ${new Date(d.respond_by * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : "",
        "",
        pay?.request_id
          ? `Evidence (consents, approved plan, payments, delivery): https://jambuch.in/admin/creators/${pay.request_id}/evidence`
          : "This payment is not one of Creator's Space's.",
        "Answer it in the Razorpay dashboard (Disputes) before the deadline.",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }
}
