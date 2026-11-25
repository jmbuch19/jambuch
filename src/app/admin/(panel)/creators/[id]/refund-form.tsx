"use client";

import { useActionState, useState, type FormEvent } from "react";
import { StopButton } from "./make-sample";
import { freeRemakeAction, refundAction, type MakeState, type RefundState } from "../actions";
import a from "../../../admin.module.css";

const REASONS: [string, string][] = [
  ["sample_not_delivered", "Sample not delivered"],
  ["duplicate_payment", "Duplicate payment"],
  ["our_mistake", "Our mistake"],
  ["goodwill", "Goodwill"],
  ["dispute_settled", "Dispute settled"],
  ["other", "Other"],
];

// One-click refund for one payment: amount (full by default), reason, a confirm tick that
// shows the exact amount. Money goes back through Razorpay to the writer's payment method.
export function RefundForm({ paymentId, requestId, left }: { paymentId: number; requestId: string; left: number }) {
  const [state, action, pending] = useActionState<RefundState, FormData>(refundAction, { status: "idle" });
  const [amount, setAmount] = useState(String(left / 100));
  const [open, setOpen] = useState(false);
  if (left <= 0) return <span> · fully refunded</span>;
  if (!open)
    return (
      <>
        {" · "}
        <button type="button" className={a.linkButton} onClick={() => setOpen(true)}>
          Refund…
        </button>
      </>
    );
  return (
    <form action={action} className={a.form} style={{ margin: "8px 0 12px", maxWidth: 520 }}>
      <input type="hidden" name="payment_id" value={paymentId} />
      <input type="hidden" name="request_id" value={requestId} />
      <label className={a.field}>
        Amount in ₹ (up to {(left / 100).toLocaleString("en-IN")})
        <input name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label className={a.field}>
        Reason
        <select name="reason" defaultValue="">
          <option value="" disabled>
            — choose —
          </option>
          {REASONS.map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className={a.field}>
        Note (optional, kept with the refund)
        <input name="note" maxLength={500} />
      </label>
      <label className={a.check}>
        <input type="checkbox" name="confirm" value="yes" /> Refund ₹{Number(amount || 0).toLocaleString("en-IN")} to the writer now
      </label>
      <button type="submit" className={a.primary} disabled={pending}>
        {pending ? "Refunding…" : "Refund"}
      </button>
      {state.status !== "idle" && (
        <p className={state.status === "error" ? a.error : a.notice} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}

// The one free remake, when the sample did not follow the approved plan.
export function FreeRemakeButton({ id, used }: { id: string; used: boolean }) {
  const [state, action, pending] = useActionState<MakeState, FormData>(freeRemakeAction, { status: "idle" });
  if (used) return <p className={a.mutedSmall}>The free remake has been used.</p>;
  return (
    <div>
      <form
        action={action}
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          if (!confirm("Use the one free remake? It makes the sample again from scratch (new sound plan and voice, about 900 ElevenLabs characters). The writer keeps the current sample if you stop or it fails.")) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button type="submit" className={a.secondary} disabled={pending}>
          {pending ? "Remaking… (about a minute)" : "Free remake (the sample missed the approved plan)"}
        </button>
      </form>
      {pending && <StopButton id={id} />}
      {state.status !== "idle" && (
        <p className={state.status === "error" ? a.error : a.notice} role="status">
          {state.message}
        </p>
      )}
    </div>
  );
}
