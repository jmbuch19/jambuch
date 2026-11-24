"use client";

import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";
import { finishRequest, startRequest, type FinishState, type StartState } from "./actions";
import { LANGUAGES, LENGTHS, MAKES } from "../options";
import { SpamCheckBox, sendLabel, useSpamCheck } from "../../spam-check";
import h from "../../home.module.css";
import c from "../creators.module.css";

// Two steps on one page. 1: details + the story → screened → story-specific questions.
// 2: the answers → the studio. The story stays in this page between the steps (we don't
// store it), and the server checks that step 2 sends back the same story it screened.
export default function RequestWizard() {
  const [story, setStory] = useState("");
  const [about, setAbout] = useState("");
  const [started, start, starting] = useActionState<StartState, FormData>(startRequest, { status: "idle" });
  const [finished, finish, finishing] = useActionState<FinishState, FormData>(finishRequest, { status: "idle" });
  const check = useSpamCheck("creator");

  useEffect(() => {
    if (started.status === "error") check.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the result changes
  }, [started]);

  function onStart(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => start(data));
  }
  function onFinish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => finish(data));
  }

  if (finished.status === "sent") {
    return (
      <div className={h.ideaSent} role="status">
        <p>Thank you. Your request has reached the studio.</p>
        <span>We’ll reply by email, usually within two days, with a plan for your story.</span>
      </div>
    );
  }

  if (started.status === "refused" || started.status === "needs_human") {
    return (
      <div className={started.status === "refused" ? c.refused : h.ideaSent} role="status">
        <p>{started.status === "refused" ? "We can’t make this story." : "Thank you."}</p>
        <span>{started.message}</span>
      </div>
    );
  }

  if (started.status === "questions") {
    return (
      <form onSubmit={onFinish} className={`${h.ideaForm} ${c.form}`}>
        <p className={c.text}>
          Your story is with us. A few questions to help us make it well. Answer what you can; skip what you’re unsure
          of.
        </p>
        <input type="hidden" name="requestId" value={started.requestId} />
        <input type="hidden" name="sig" value={started.sig} />
        <input type="hidden" name="questions" value={JSON.stringify(started.questions)} />
        <input type="hidden" name="story" value={story} />
        <input type="hidden" name="about" value={about} />
        {started.questions.map((q) => (
          <label key={q.id} className={h.field}>
            {q.question}
            <textarea name={`answer_${q.id}`} rows={2} maxLength={600} placeholder={q.hint} />
          </label>
        ))}
        {finished.status === "error" && (
          <p className={h.ideaError} role="alert">
            {finished.message}
          </p>
        )}
        <button type="submit" disabled={finishing} className={h.ideaSend}>
          {finishing ? "Sending…" : "Send to the studio"}
        </button>
        <p className={c.formNote}>
          Your words about the look and sound are turned into our studio’s own style words; we never feed your text
          straight into the tools that make pictures, voices or music.
        </p>
      </form>
    );
  }

  const options = (map: Record<string, string>) =>
    Object.entries(map).map(([k, v]) => (
      <option key={k} value={k}>
        {v}
      </option>
    ));

  return (
    <form onSubmit={onStart} className={`${h.ideaForm} ${c.form}`}>
      <div className={h.fieldRow}>
        <label className={h.field}>
          Your name
          <input type="text" name="name" required maxLength={200} autoComplete="name" />
        </label>
        <label className={h.field}>
          WhatsApp number (optional)
          <input type="tel" name="whatsapp" maxLength={20} autoComplete="tel" inputMode="tel" />
        </label>
      </div>
      <div className={h.fieldRow}>
        <label className={h.field}>
          Language of the story
          <select name="language" defaultValue="gu">
            {options(LANGUAGES)}
          </select>
        </label>
        <label className={h.field}>
          What would you like?
          <select name="make" defaultValue="audio">
            {options(MAKES)}
          </select>
        </label>
      </div>
      <label className={h.field}>
        How long is it?
        <select name="length" defaultValue="medium">
          {options(LENGTHS)}
        </select>
      </label>
      <label className={h.field}>
        A note about your story (optional)
        <textarea
          name="about"
          rows={3}
          maxLength={1500}
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          placeholder="Who is it for, and where will you share it?"
        />
      </label>
      <label className={h.field}>
        The story ({story.length.toLocaleString("en-IN")} / 20,000 characters)
        <textarea
          name="story"
          rows={10}
          required
          minLength={200}
          maxLength={20000}
          value={story}
          onChange={(e) => setStory(e.target.value)}
          placeholder="Paste the story, or its opening if it is long. Please copy it from Word or Google Docs, not from a PDF."
        />
      </label>
      <p className={c.formNote}>
        Every story is checked first, by an automatic reader, against our content guidelines: no quoted song lyrics,
        nothing hateful or sexual, no real people shown in a harmful way. Your story is sent to an AI service for this
        check and for the questions that follow; it stays yours.
      </p>
      <SpamCheckBox check={check} noteClass={h.ideaError} />
      {started.status === "error" && (
        <p className={h.ideaError} role="alert">
          {started.message}
        </p>
      )}
      <button type="submit" disabled={starting || check.status !== "ready"} className={h.ideaSend}>
        {starting ? "Reading your story…" : sendLabel(check, starting, "Continue")}
      </button>
    </form>
  );
}
