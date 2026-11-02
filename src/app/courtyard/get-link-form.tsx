"use client";

import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";
import { SpamCheckBox, sendLabel, useSpamCheck } from "../spam-check";
import { resendMyLink, type ContributeState } from "./actions";
import y from "./courtyard.module.css";

// "Shared here before? Get your link again." Folded away until opened.
export default function GetLinkForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ContributeState, FormData>(resendMyLink, { status: "idle" });
  const check = useSpamCheck("getlink");

  useEffect(() => {
    if (open) check.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once the form is opened
  }, [open]);
  useEffect(() => {
    if (state.status === "error") check.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the result changes
  }, [state]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <div className={y.getLink}>
      {!open ? (
        <button type="button" className={y.getLinkToggle} onClick={() => setOpen(true)}>
          Shared here before? Get your personal link again →
        </button>
      ) : state.status === "sent" ? (
        <p className={y.followDone} role="status">
          If that address has shared here before, your personal link is on its way. Check your inbox (and Spam).
        </p>
      ) : (
        <form onSubmit={onSubmit} className={y.followForm}>
          <label className={y.honeypot} aria-hidden="true">
            Leave this empty
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
          <input type="email" name="email" required autoComplete="email" placeholder="The email you shared with" aria-label="Your email" />
          <button type="submit" className={y.send} disabled={pending || check.status !== "ready"}>
            {sendLabel(check, pending, "Email my link")}
          </button>
          <SpamCheckBox check={check} noteClass={y.error} />
          {state.status === "error" && (
            <p className={y.error} role="alert">
              {state.message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
