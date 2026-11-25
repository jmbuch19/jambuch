import { webhookSignatureValid } from "@/lib/creators/razorpay";
import { paymentPaid, paymentFailed } from "@/lib/creators/orders";
import { refundOutcome } from "@/lib/creators/refunds";
import { recordDispute, type DisputeEntity } from "@/lib/creators/disputes";

// Razorpay webhook (Dashboard → Webhooks: https://jambuch.in/api/razorpay/webhook, events
// order.paid, payment.captured, payment.failed, refund.processed, refund.failed and the
// payment.dispute.* events; secret = RAZORPAY_WEBHOOK_SECRET).
// Confirms payments even when the writer closed the page before the checkout returned.
// Every event is checked against the signature first; the same payment twice is harmless.
export const dynamic = "force-dynamic";

type Event = {
  event: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; error_description?: string; status?: string } };
    order?: { entity?: { id?: string } };
    refund?: { entity?: { id?: string; status?: string; payment_id?: string } };
    dispute?: { entity?: DisputeEntity };
  };
};

export async function POST(request: Request) {
  const raw = await request.text();
  if (!webhookSignatureValid(raw, request.headers.get("x-razorpay-signature") ?? "")) {
    return new Response("bad signature", { status: 400 });
  }
  let ev: Event;
  try {
    ev = JSON.parse(raw) as Event;
  } catch {
    return new Response("bad body", { status: 400 });
  }
  const payment = ev.payload?.payment?.entity;
  const orderId = ev.payload?.order?.entity?.id ?? payment?.order_id ?? "";
  try {
    if ((ev.event === "order.paid" || ev.event === "payment.captured") && orderId && payment?.id) {
      const res = await paymentPaid(orderId, payment.id, "webhook");
      if (!res.ok) console.warn("razorpay webhook:", ev.event, orderId, res.reason);
    } else if (ev.event === "payment.failed" && orderId) {
      await paymentFailed(orderId, payment?.error_description ?? "failed");
    } else if ((ev.event === "refund.processed" || ev.event === "refund.failed") && ev.payload?.refund?.entity?.id) {
      await refundOutcome(ev.payload.refund.entity.id, ev.event === "refund.processed" ? "processed" : "failed", ev.event === "refund.failed" ? "Razorpay: refund failed" : undefined);
    } else if (ev.event.startsWith("payment.dispute.") && ev.payload?.dispute?.entity) {
      await recordDispute(ev.event, ev.payload.dispute.entity);
    }
  } catch (e) {
    // A 500 makes Razorpay retry later, which is what we want for a passing failure.
    console.error("razorpay webhook failed:", ev.event, orderId, e instanceof Error ? e.message : e);
    return new Response("retry", { status: 500 });
  }
  return new Response("ok");
}
