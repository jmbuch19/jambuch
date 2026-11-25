"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmPayment, startAdvance } from "./pay-actions";
import h from "../../home.module.css";
import c from "../creators.module.css";

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; on: (ev: string, fn: (r: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

// Razorpay's own checkout window (card, UPI, net banking). Loaded only when the writer
// presses the button, so no Razorpay script runs on the page otherwise.
function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function PayAdvance({ id, advance }: { id: string; advance: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [paid, setPaid] = useState(false);

  async function pay() {
    setBusy(true);
    setMessage("");
    const co = await startAdvance(id);
    if ("error" in co) {
      setBusy(false);
      return setMessage(co.error);
    }
    if (!(await loadCheckout()) || !window.Razorpay) {
      setBusy(false);
      return setMessage("The payment window couldn’t load. Please check your connection and try again.");
    }
    const rzp = new window.Razorpay({
      key: co.key,
      order_id: co.orderId,
      amount: co.amount,
      currency: "INR",
      name: "Creator’s Space · jambuch.in",
      description: co.description,
      prefill: { name: co.name, email: co.email, contact: co.contact },
      theme: { color: "#0B5A36" },
      modal: { ondismiss: () => setBusy(false) },
      handler: async (r: RazorpayResponse) => {
        const res = await confirmPayment(r.razorpay_order_id, r.razorpay_payment_id, r.razorpay_signature);
        setBusy(false);
        if (res.ok) {
          setPaid(true);
          router.refresh();
        } else setMessage(res.error ?? "");
      },
    });
    rzp.on("payment.failed", (r) => setMessage(r.error?.description ? `Payment failed: ${r.error.description}. You can try again.` : "Payment failed. You can try again."));
    rzp.open();
  }

  if (paid) return <b>Advance paid. Thank you: work on your story begins.</b>;
  return (
    <span className={c.inlineForm}>
      <button type="button" className={h.ideaSend} onClick={pay} disabled={busy}>
        {busy ? "Opening payment…" : `Approve the sample and pay the 50% advance (₹${advance.toLocaleString("en-IN")})`}
      </button>
      {message && (
        <span className={h.ideaError} role="alert">
          {message}
        </span>
      )}
    </span>
  );
}
