"use client";

import { useState, useTransition } from "react";
import { askToOpenRoom, leaveRoom, saveRoomAbout, sendRoomSignIn, type RoomResult } from "./actions";
import y from "../courtyard.module.css";

function Note({ result }: { result: RoomResult | null }) {
  if (!result) return null;
  return result.ok ? (
    result.message ? (
      <p className={y.small} role="status">
        {result.message}
      </p>
    ) : null
  ) : (
    <p className={y.error} role="alert">
      {result.error}
    </p>
  );
}

export function RoomSignIn() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<RoomResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className={y.followForm}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await sendRoomSignIn(email)));
      }}
    >
      <input
        type="email"
        required
        autoComplete="email"
        placeholder="The email your invitation came to"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="Your email"
      />
      <button type="submit" className={y.send} disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      <Note result={result} />
    </form>
  );
}

export function AboutForm({ about }: { about: string | null }) {
  const [text, setText] = useState(about ?? "");
  const [result, setResult] = useState<RoomResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className={y.form}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await saveRoomAbout(text)));
      }}
    >
      <label className={y.field}>
        A few lines about you <small>shown at the top of your room</small>
        <textarea rows={4} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <button type="submit" className={y.send} disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
      <Note result={result} />
    </form>
  );
}

export function AskToOpen() {
  const [result, setResult] = useState<RoomResult | null>(null);
  const [pending, start] = useTransition();
  if (result?.ok) {
    return (
      <p className={y.roomStatus} role="status">
        Sent. Jaydeep will look at your room and let you know when it opens.
      </p>
    );
  }
  return (
    <>
      <button type="button" className={y.send} disabled={pending} onClick={() => start(async () => setResult(await askToOpenRoom()))}>
        {pending ? "Sending…" : "Ask Jaydeep to open my room"}
      </button>
      <Note result={result} />
    </>
  );
}

// Leaving takes a tick first, so it can't happen by a stray tap.
export function LeaveRoom() {
  const [sure, setSure] = useState(false);
  const [result, setResult] = useState<RoomResult | null>(null);
  const [pending, start] = useTransition();
  if (result?.ok) {
    return (
      <p className={y.roomStatus} role="status">
        Your room is closed. A list of all your work is on its way to your inbox.
      </p>
    );
  }
  return (
    <>
      <label className={y.seriesToggle}>
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        <span>I want to close my room. I’ll get an email with all my work.</span>
      </label>
      <button
        type="button"
        className={y.send}
        disabled={!sure || pending}
        onClick={() => start(async () => setResult(await leaveRoom()))}
      >
        {pending ? "Closing…" : "Close my room"}
      </button>
      <Note result={result} />
    </>
  );
}
