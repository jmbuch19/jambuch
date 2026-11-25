import "server-only";
import { adminClient } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { orderPayments, razorpayReady } from "./razorpay";
import { paymentPaid } from "./orders";
import { refund } from "./refunds";

// Daily payment safety checks (Jaydeep, 25 Nov 2026):
//   reconcile  — an order Razorpay says is paid but we never recorded (missed confirmation)
//                is completed now; extra captured payments on one order are refunded
//   undelivered — a ₹499 sample paid more than 3 days ago and still not delivered is refunded
//                in full automatically, and the request closes

const DAY = 86400_000;
const SAMPLE_REFUND_DAYS = 3;

export async function reconcilePayments() {
  if (!razorpayReady()) return { checked: 0, completed: 0, duplicates: 0 };
  const db = adminClient();
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const { data: rows } = await db
    .from("creator_payments")
    .select("id, razorpay_order_id, razorpay_payment_id, amount_paise, status")
    .gte("created_at", since)
    .in("status", ["created", "failed", "paid"])
    .limit(200);
  let completed = 0;
  let duplicates = 0;
  for (const r of rows ?? []) {
    let pays;
    try {
      pays = await orderPayments(r.razorpay_order_id);
    } catch (e) {
      console.error("reconcile: lookup failed", r.razorpay_order_id, e instanceof Error ? e.message : e);
      continue;
    }
    const captured = pays.filter((x) => x.status === "captured").sort((a, b) => a.created_at - b.created_at);
    if (!captured.length) continue;
    if (r.status !== "paid") {
      const res = await paymentPaid(r.razorpay_order_id, captured[0].id, "webhook");
      if (res.ok && !res.already) completed++;
    }
    // Any captured payment other than the recorded one is a duplicate on this order.
    const { data: rec } = await db.from("creator_payments").select("razorpay_payment_id").eq("id", r.id).single();
    for (const extra of captured.filter((x) => x.id !== rec?.razorpay_payment_id)) {
      const { data: done } = await db.from("creator_refunds").select("id").eq("razorpay_payment_id", extra.id).in("status", ["pending", "processed"]).limit(1);
      if (done?.length) continue;
      const out = await refund({ paymentRowId: r.id, razorpayPaymentId: extra.id, amountPaise: extra.amount, reason: "duplicate_payment", by: "auto:duplicate-daily-check" });
      if (out.ok) duplicates++;
    }
  }
  return { checked: rows?.length ?? 0, completed, duplicates };
}

export async function refundUndeliveredSamples() {
  const db = adminClient();
  const cutoff = new Date(Date.now() - SAMPLE_REFUND_DAYS * DAY).toISOString();
  const { data: pays } = await db
    .from("creator_payments")
    .select("id, request_id, amount_paise, razorpay_payment_id, paid_at")
    .eq("kind", "sample")
    .eq("status", "paid")
    .lt("paid_at", cutoff)
    .limit(100);
  let refunded = 0;
  for (const p of pays ?? []) {
    const { data: r } = await db.from("creator_requests").select("id, state, sample_state, name, email").eq("id", p.request_id).maybeSingle();
    if (!r || r.sample_state === "sent" || r.state === "ordered" || r.state === "closed") continue;
    const { data: done } = await db.from("creator_refunds").select("id").eq("payment_id", p.id).in("status", ["pending", "processed"]).limit(1);
    if (done?.length) continue;
    const out = await refund({ paymentRowId: p.id, amountPaise: p.amount_paise, reason: "sample_not_delivered", by: `auto:sample-not-delivered-${SAMPLE_REFUND_DAYS}d` });
    if (out.ok) refunded++;
    else if (process.env.ADMIN_EMAIL) {
      await sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: "Creator's Space: automatic sample refund FAILED",
        text: [`${r.name} <${r.email}>: the sample wasn't delivered within ${SAMPLE_REFUND_DAYS} days, but the refund failed: ${out.message}`, "", `https://jambuch.in/admin/creators/${r.id}`].join("\n"),
      });
    }
  }
  return refunded;
}
