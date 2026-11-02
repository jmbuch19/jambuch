"use client";

import { startTransition, useActionState, useEffect, type FormEvent } from "react";
import { submitIdea, type IdeaState } from "./ideas-action";
import { SpamCheckBox, sendLabel, useSpamCheck } from "./spam-check";
import s from "./home.module.css";

export default function IdeaForm() {
  const [state, action, pending] = useActionState<IdeaState, FormData>(submitIdea, { status: "idle" });
  // "interaction-only": the check runs unseen and shows itself only when the
  // visitor must tick something. Otherwise its "Success!" box looked as if the
  // idea had already been sent.
  const check = useSpamCheck("idea");

  // Submitted by hand rather than <form action>, because React clears a form
  // after an action and the visitor would lose their text if a check failed.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  // A token works only once, so get a fresh one after a failed attempt.
  useEffect(() => {
    if (state.status === "error") check.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the result changes
  }, [state]);

  if (state.status === "sent") {
    return (
      <div className={s.ideaSent} role="status">
        <p>Thank you — it’s in the notebook.</p>
        <span>I read every idea myself.</span>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={s.ideaForm}>
      <div className={s.fieldRow}>
        <label className={s.field}>
          Your name
          <input type="text" name="name" maxLength={200} autoComplete="name" />
        </label>
        <label className={s.field}>
          Email (optional)
          <input type="email" name="email" maxLength={320} autoComplete="email" />
        </label>
      </div>
      <label className={s.field}>
        What kind of idea?
        <select name="category" defaultValue="book_to_translate">
          <option value="book_to_translate">A book to translate</option>
          <option value="app">An app or website</option>
          <option value="civic">A civic or social idea</option>
          <option value="other">Something else</option>
        </select>
      </label>
      <label className={s.field}>
        Your idea
        <textarea name="message" rows={4} required maxLength={5000} />
      </label>
      <label className={s.honeypot} aria-hidden="true">
        Leave this empty
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <SpamCheckBox check={check} noteClass={s.ideaError} />
      {state.status === "error" && (
        <p className={s.ideaError} role="alert">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending || check.status !== "ready"} className={s.ideaSend}>
        {sendLabel(check, pending, "Send idea")}
      </button>
    </form>
  );
}
