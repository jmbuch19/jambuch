"use client";

import { startTransition, useActionState, useEffect, type FormEvent } from "react";
import { SpamCheckBox, sendLabel, useSpamCheck } from "../../../spam-check";
import { followSeries, type FollowState } from "../actions";
import y from "../../courtyard.module.css";

export default function FollowForm({ seriesId }: { seriesId: string }) {
  const [state, action, pending] = useActionState<FollowState, FormData>(followSeries, { status: "idle" });
  const check = useSpamCheck("follow");

  useEffect(() => {
    if (state.status === "error") check.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the result changes
  }, [state]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  if (state.status === "sent") {
    return (
      <p className={y.followDone} role="status">
        Almost there: check your email and open the link to confirm. (Not there? Look in Spam or Promotions.)
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className={y.followForm}>
      <input type="hidden" name="series_id" value={seriesId} />
      <label className={y.honeypot} aria-hidden="true">
        Leave this empty
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <input type="email" name="email" required autoComplete="email" placeholder="Your email" aria-label="Your email" />
      <button type="submit" className={y.send} disabled={pending || check.status !== "ready"}>
        {sendLabel(check, pending, "Follow")}
      </button>
      <SpamCheckBox check={check} noteClass={y.error} />
      {state.status === "error" && (
        <p className={y.error} role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
