"use client";

import { useActionState, useState, type FormEvent } from "react";
import { makeSampleAction, stopSampleAction, type MakeState } from "../actions";
import a from "../../../admin.module.css";

// Making a sample takes about a minute and spends ElevenLabs credits: ask first, then keep the
// button busy and offer Stop (the maker halts before its next step; nothing more is spent).
export default function MakeSampleButton({ id, again, label }: { id: string; again: boolean; label?: string }) {
  const [state, action, pending] = useActionState<MakeState, FormData>(makeSampleAction, { status: "idle" });
  return (
    <div>
      <form
        action={action}
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          if (!confirm(`${again ? "Make the sample again" : "Make the sample"}? This spends about 900 ElevenLabs voice characters if a new recording is needed.`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button type="submit" disabled={pending} className={again ? a.secondary : a.primary}>
          {pending ? "Making the sample… (about a minute)" : (label ?? (again ? "Make it again" : "Make sample"))}
        </button>
      </form>
      {pending && <StopButton id={id} />}
      {state.status === "error" && (
        <p className={a.error} role="alert">
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <p className={a.notice} role="status">
          {state.message}
        </p>
      )}
    </div>
  );
}

// Stop a sample being made: it halts before its next step. A sent sample stays with the writer.
export function StopButton({ id }: { id: string }) {
  const [asked, setAsked] = useState(false);
  return (
    <form
      action={async (data: FormData) => {
        setAsked(true);
        await stopSampleAction(data);
      }}
      style={{ marginTop: 8 }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={a.secondary} disabled={asked}>
        {asked ? "Stopping before the next step…" : "■ Stop"}
      </button>
    </form>
  );
}
