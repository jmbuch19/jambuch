"use client";

import { useActionState } from "react";
import { makeSampleAction, type MakeState } from "../actions";
import a from "../../../admin.module.css";

// Making a sample takes about a minute: say so, and keep the button busy meanwhile.
export default function MakeSampleButton({ id, again }: { id: string; again: boolean }) {
  const [state, action, pending] = useActionState<MakeState, FormData>(makeSampleAction, { status: "idle" });
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={again ? a.secondary : a.primary}>
        {pending ? "Making the sample… (about a minute)" : again ? "Make it again" : "Make sample"}
      </button>
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
    </form>
  );
}
