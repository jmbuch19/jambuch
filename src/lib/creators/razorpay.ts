import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Razorpay for Creator's Space (brief §1 "Payment", §2 item 5). Keys live only in Vercel env:
//   RAZORPAY_KEY_ID          public key id, sent to the checkout in the browser
//   RAZORPAY_KEY_SECRET      server only: creates orders, checks payment signatures
//   RAZORPAY_WEBHOOK_SECRET  server only: checks webhook signatures
// The amount is always taken from the quote on the server; the browser never sends one.

export function razorpayReady() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}
export const razorpayKeyId = () => process.env.RAZORPAY_KEY_ID ?? "";
export const isLiveKey = () => razorpayKeyId().startsWith("rzp_live_");

function auth() {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error("Razorpay keys are not set.");
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string };

// https://razorpay.com/docs/api/orders/create/
export async function createOrder(o: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<RazorpayOrder> {
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/json" },
    body: JSON.stringify({ amount: o.amountPaise, currency: "INR", receipt: o.receipt.slice(0, 40), notes: o.notes }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Razorpay order failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as RazorpayOrder;
}

// The order as Razorpay sees it now (used to double-check before marking paid).
export async function fetchOrder(orderId: string): Promise<RazorpayOrder & { amount_paid: number }> {
  const res = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: auth() },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Razorpay order lookup failed (${res.status})`);
  return (await res.json()) as RazorpayOrder & { amount_paid: number };
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Checkout success: signature = HMAC-SHA256(order_id + "|" + payment_id, key secret).
export function paymentSignatureValid(orderId: string, paymentId: string, signature: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !orderId || !paymentId || !signature) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqual(expected, signature);
}

// Webhooks: X-Razorpay-Signature = HMAC-SHA256(raw body, webhook secret).
export function webhookSignatureValid(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

// Every payment attempt on an order (https://razorpay.com/docs/api/orders/fetch-payments/).
export type RazorpayPayment = { id: string; order_id: string; amount: number; status: string; captured: boolean; created_at: number };
export async function orderPayments(orderId: string): Promise<RazorpayPayment[]> {
  const res = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}/payments`, {
    headers: { Authorization: auth() },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Razorpay payments lookup failed (${res.status})`);
  return ((await res.json()) as { items?: RazorpayPayment[] }).items ?? [];
}

// A refund, full or partial (https://razorpay.com/docs/api/refunds/create-normal/). Money goes
// back to the original payment method. Never call this twice for one decision: callers hold a
// pending row first (see refunds.ts).
export async function createRefund(paymentId: string, amountPaise: number, receipt: string, notes: Record<string, string>) {
  const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountPaise, speed: "normal", receipt: receipt.slice(0, 40), notes }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; status?: string; error?: { description?: string } };
  if (!res.ok || !body.id) throw new Error(body.error?.description ?? `Razorpay refund failed (${res.status})`);
  return { id: body.id, status: body.status ?? "pending" };
}
