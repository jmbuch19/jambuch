"use client";

import { useState, useTransition } from "react";
import { ROOM_TERMS } from "@/lib/invite-stages";
import { acceptInvite, sendInviteSignIn } from "./actions";
import y from "../../courtyard.module.css";

export function SignInButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "sent" | string>("idle");
  const [pending, start] = useTransition();
  if (state === "sent") {
    return (
      <p className={y.small} role="status">
        Check your inbox: open the sign-in link in this browser and you’ll come straight back here.
      </p>
    );
  }
  return (
    <>
      <button
        type="button"
        className={y.send}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await sendInviteSignIn(token);
            setState(res.ok ? "sent" : res.error);
          })
        }
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      {state !== "idle" && (
        <p className={y.error} role="alert">
          {state}
        </p>
      )}
    </>
  );
}

// The four room terms, each ticked on its own.
export function AcceptForm({ token, name }: { token: string; name: string }) {
  const [ticked, setTicked] = useState<boolean[]>(ROOM_TERMS.map(() => false));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const count = ticked.filter(Boolean).length;

  if (done) {
    return (
      <div className={y.done} role="status">
        <p>Welcome to the Courtyard, {name}.</p>
        <span>Jaydeep will be in touch to gather your work and shape your room. Nothing goes public until you say yes.</span>
      </div>
    );
  }

  return (
    <div className={y.inviteStep}>
      <p>Before your room is made, please read and agree to these four terms:</p>
      <div className={y.ticks}>
        {ROOM_TERMS.map((term, i) => (
          <label key={term}>
            <input
              type="checkbox"
              checked={ticked[i]}
              onChange={(e) => setTicked((t) => t.map((v, j) => (j === i ? e.target.checked : v)))}
            />
            <span>{term}</span>
          </label>
        ))}
      </div>
      {error && (
        <p className={y.error} role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className={y.send}
        disabled={pending || count < ROOM_TERMS.length}
        onClick={() =>
          start(async () => {
            const res = await acceptInvite(token, count);
            if (res.ok) setDone(true);
            else setError(res.error);
          })
        }
      >
        {pending ? "Accepting…" : "I agree: make my room"}
      </button>
    </div>
  );
}
