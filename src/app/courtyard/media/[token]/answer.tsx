"use client";

import { useState, useTransition } from "react";
import { agreeMedia, declineMedia } from "../actions";
import y from "../../courtyard.module.css";

// Yes or no, only on a click: opening the email link changes nothing (mail
// scanners open links on their own).
export default function MediaAnswer({ token, current }: { token: string; current: "asked" | "agreed" | "declined" }) {
  const [result, setResult] = useState<"idle" | "yes" | "no" | "bad">("idle");
  const [pending, start] = useTransition();

  const choose = (yes: boolean) =>
    start(async () => {
      const r = await (yes ? agreeMedia : declineMedia)(token);
      setResult(r.ok ? (yes ? "yes" : "no") : "bad");
    });

  if (result === "yes") {
    return (
      <p className={y.followDone} role="status">
        Thank you! I’ll share it with you before it goes up. You can still change your mind from this page until then.
      </p>
    );
  }
  if (result === "no") {
    return (
      <p className={y.followDone} role="status">
        Understood: nothing will be made, and your piece stays in the Courtyard just as it is. Thank you for telling me.
      </p>
    );
  }
  return (
    <>
      {current !== "asked" && (
        <p className={y.small}>
          You answered {current === "agreed" ? "yes" : "no, thank you"} earlier. You can change it here.
        </p>
      )}
      <div className={y.mediaChoices}>
        <button type="button" className={y.send} disabled={pending} onClick={() => choose(true)}>
          {pending ? "One moment…" : "Yes, go ahead"}
        </button>
        <button type="button" className={y.secondaryButton} disabled={pending} onClick={() => choose(false)}>
          No, thank you
        </button>
      </div>
      {result === "bad" && (
        <p className={y.error} role="alert">
          This link no longer works. Please reply to my email instead.
        </p>
      )}
    </>
  );
}
