"use client";

import { useActionState } from "react";
import { sendLink, type LoginState } from "./actions";
import a from "../admin.module.css";

export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendLink, { status: "idle" });

  if (state.status === "sent") {
    return (
      <p className={a.notice} role="status">
        If that address is allowed in, a sign-in link is on its way. Open it in this browser.
      </p>
    );
  }

  return (
    <form action={action} className={a.form}>
      <label className={a.field}>
        Email
        <input type="email" name="email" required autoComplete="email" autoFocus />
      </label>
      {state.status === "error" && (
        <p className={a.error} role="alert">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className={a.primary}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
