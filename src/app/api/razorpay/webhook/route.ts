import { webhookSignatureValid } from "@/lib/creators/razorpay";
import { advancePaid, paymentFailed } from "@/lib/creators/orders";

// Razorpay webhook (Dashboard → Webhooks: https://jambuch.in/api/razorpay/webhook, events
// order.paid, payment.captured, payment.failed; secret = RAZORPAY_WEBHOOK_SECRET).
// Confirms payments even when the writer closed the page before the checkout returned.
// Every event is checked against the signature first; the same payment twice is harmless.
export const dynamic = "force-dynamic";

type Event = {
  event: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; error_description?: string; status?: string } };
    order?: { entity?: { id?: string } };
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
      const res = await advancePaid(orderId, payment.id, "webhook");
      if (!res.ok) console.warn("razorpay webhook:", ev.event, orderId, res.reason);
    } else if (ev.event === "payment.failed" && orderId) {
      await paymentFailed(orderId, payment?.error_description ?? "failed");
    }
  } catch (e) {
    // A 500 makes Razorpay retry later, which is what we want for a passing failure.
    console.error("razorpay webhook failed:", ev.event, orderId, e instanceof Error ? e.message : e);
    return new Response("retry", { status: 500 });
  }
  return new Response("ok");
}
