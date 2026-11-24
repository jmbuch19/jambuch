"use client";

import { startTransition, useActionState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { sendCode, verifyCode, type SignInState } from "./actions";
import { SpamCheckBox, sendLabel, useSpamCheck } from "../../spam-check";
import h from "../../home.module.css";
import c from "../creators.module.css";

const verifyInitial: SignInState = { status: "idle" };

// Email → a one-time code → signed in, without leaving the page (works on a phone where
// the email opens in another app). The email also carries a link that does the same.
export default function SignInForm() {
  const router = useRouter();
  const [sent, send, sending] = useActionState<SignInState, FormData>(sendCode, { status: "idle" });
  const [checked, verify, verifying] = useActionState<SignInState, FormData>(verifyCode, verifyInitial);
  const check = useSpamCheck("creator-signin");

  useEffect(() => {
    if (sent.status === "error") check.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the result changes
  }, [sent]);

  // verifyCode answers "idle" once the session is set: reload the page signed in.
  useEffect(() => {
    if (checked !== verifyInitial && checked.status === "idle") router.refresh();
  }, [checked, router]);

  function onSend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => send(data));
  }

  if (sent.status === "code") {
    return (
      <form action={verify} className={`${h.ideaForm} ${c.form}`}>
        <p className={c.text}>
          We’ve emailed a code to <b>{sent.email}</b>. Type it here (or open the link in the email).
        </p>
        <input type="hidden" name="email" value={sent.email} />
        <label className={h.field}>
          Code from the email
          <input
            type="text"
            name="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,12}"
            maxLength={12}
            autoFocus
          />
        </label>
        {checked.message && (
          <p className={h.ideaError} role="alert">
            {checked.message}
          </p>
        )}
        <button type="submit" disabled={verifying} className={h.ideaSend}>
          {verifying ? "Checking…" : "Sign in"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSend} className={`${h.ideaForm} ${c.form}`}>
      <label className={h.field}>
        Email
        <input type="email" name="email" required maxLength={320} autoComplete="email" defaultValue={sent.email} />
      </label>
      <SpamCheckBox check={check} noteClass={h.ideaError} />
      {sent.status === "error" && (
        <p className={h.ideaError} role="alert">
          {sent.message}
        </p>
      )}
      <button type="submit" disabled={sending || check.status !== "ready"} className={h.ideaSend}>
        {sendLabel(check, sending, "Email me a code")}
      </button>
    </form>
  );
}

