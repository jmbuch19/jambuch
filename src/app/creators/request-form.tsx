"use client";

import { startTransition, useActionState, useEffect, type FormEvent } from "react";
import { requestSample, type RequestState } from "./request-action";
import { LANGUAGES, LENGTHS, MAKES } from "./options";
import { SpamCheckBox, sendLabel, useSpamCheck } from "../spam-check";
import h from "../home.module.css";
import c from "./creators.module.css";

// "Request a sample": the writer tells me about the story; I reply with a plan and a quote.
export default function RequestForm() {
  const [state, action, pending] = useActionState<RequestState, FormData>(requestSample, { status: "idle" });
  const check = useSpamCheck("creator");

  // Submitted by hand, so a failed check never clears what the writer typed.
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
      <div className={h.ideaSent} role="status">
        <p>Thank you. Your request has reached me.</p>
        <span>I’ll reply by email, usually within two days, with a plan for your story and a quote.</span>
      </div>
    );
  }

  const options = (map: Record<string, string>) =>
    Object.entries(map).map(([k, v]) => (
      <option key={k} value={k}>
        {v}
      </option>
    ));

  return (
    <form onSubmit={onSubmit} className={`${h.ideaForm} ${c.form}`}>
      <div className={h.fieldRow}>
        <label className={h.field}>
          Your name
          <input type="text" name="name" required maxLength={200} autoComplete="name" />
        </label>
        <label className={h.field}>
          Email
          <input type="email" name="email" required maxLength={320} autoComplete="email" />
        </label>
      </div>
      <div className={h.fieldRow}>
        <label className={h.field}>
          WhatsApp number (optional)
          <input type="tel" name="whatsapp" maxLength={20} autoComplete="tel" inputMode="tel" />
        </label>
        <label className={h.field}>
          Language of the story
          <select name="language" defaultValue="gu">
            {options(LANGUAGES)}
          </select>
        </label>
      </div>
      <div className={h.fieldRow}>
        <label className={h.field}>
          What would you like?
          <select name="make" defaultValue="audio">
            {options(MAKES)}
          </select>
        </label>
        <label className={h.field}>
          How long is it?
          <select name="length" defaultValue="medium">
            {options(LENGTHS)}
          </select>
        </label>
      </div>
      <label className={h.field}>
        About your story
        <textarea
          name="about"
          rows={4}
          required
          maxLength={1500}
          placeholder="What is it about, who is it for, and where will you share it? Please don’t paste the whole story yet."
        />
      </label>
      <label className={h.honeypot} aria-hidden="true">
        Leave this empty
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <SpamCheckBox check={check} noteClass={h.ideaError} />
      {state.status === "error" && (
        <p className={h.ideaError} role="alert">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending || check.status !== "ready"} className={h.ideaSend}>
        {sendLabel(check, pending, "Request a sample")}
      </button>
      <p className={c.formNote}>Nothing is paid now. Your story stays yours, and I never publish it unless you ask me to.</p>
    </form>
  );
}
