"use client";

import { useEffect, useState } from "react";
import {
  canPrompt,
  hasFinishedOne,
  isDone,
  isInstalled,
  isIphone,
  isPhone,
  markDone,
  onInstallChange,
  promptInstall,
} from "./install-state";
import s from "./install.module.css";

type Platform = "prompt" | "iphone" | "android-menu" | "installed" | "other";

function platform(): Platform {
  if (isInstalled()) return "installed";
  if (canPrompt()) return "prompt";
  if (isIphone()) return "iphone";
  if (/Android/.test(navigator.userAgent)) return "android-menu";
  return "other";
}

// "Keep jambuch on your phone's home screen". As a card (end of a chapter) it
// appears only after the reader's first finished chapter, and once dismissed
// or installed never again on this device. On /install ("page") it always
// shows the way for this phone.
export default function InstallCard({ variant = "card" }: { variant?: "card" | "page" }) {
  const [kind, setKind] = useState<Platform | null>(null);
  const [visible, setVisible] = useState(variant === "page");

  useEffect(() => {
    const update = () => {
      setKind(platform());
      if (variant === "card") setVisible(hasFinishedOne() && !isDone() && (isPhone() || canPrompt()) && !isInstalled());
    };
    update();
    window.addEventListener("jambuch:finished-one", update);
    const off = onInstallChange(update);
    return () => {
      window.removeEventListener("jambuch:finished-one", update);
      off();
    };
  }, [variant]);

  if (!visible || !kind) return null;

  function dismiss() {
    markDone();
    setVisible(false);
  }

  async function install() {
    if (await promptInstall()) setVisible(variant === "page");
  }

  const card = variant === "card";
  return (
    <section className={card ? s.card : s.panel} aria-labelledby="install-title">
      {card && (
        <button type="button" className={s.close} onClick={dismiss} aria-label="Close, don’t show again">
          ×
        </button>
      )}
      <div className={s.head}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/maskable-192.png" alt="" width={56} height={56} className={s.icon} />
        <div>
          <h2 id="install-title" className={s.title}>
            {kind === "installed" ? "jambuch is on this phone" : "Keep jambuch on your phone’s home screen for one-tap reading"}
          </h2>
          <p className={`gu ${s.gu}`}>
            {kind === "installed"
              ? "હોમ સ્ક્રીન પરના આઇકનથી ખોલો: જ્યાં અટક્યા ત્યાંથી વાંચન ચાલુ થશે."
              : "એક ટૅપમાં વાંચન માટે jambuch ને ફોનની હોમ સ્ક્રીન પર રાખો."}
          </p>
        </div>
      </div>

      {kind === "installed" && (
        <p className={s.note}>Open it from the home-screen icon: it opens at the paragraph where you stopped.</p>
      )}

      {kind === "prompt" && (
        <>
          <p className={s.note}>It opens straight at the paragraph where you stopped, and chapters you’ve read work offline.</p>
          <button type="button" className={s.button} onClick={install}>
            Add to home screen · <span className="gu">હોમ સ્ક્રીન પર ઉમેરો</span>
          </button>
        </>
      )}

      {kind === "iphone" && <IphoneSteps />}

      {kind === "android-menu" && (
        <ol className={s.steps}>
          <li>
            <span className={s.stepPic} aria-hidden="true">
              <MenuDots />
            </span>
            <span>
              Tap the menu <strong>⋮</strong> at the top right of your browser.
            </span>
          </li>
          <li>
            <span className={s.stepPic} aria-hidden="true">
              <PlusSquare />
            </span>
            <span>
              Choose <strong>Add to Home screen</strong> (or <strong>Install app</strong>).
            </span>
          </li>
        </ol>
      )}

      {kind === "other" && (
        <p className={s.note}>
          Open <strong>jambuch.in</strong> on your phone to add it to the home screen. On a computer, look for the install
          icon at the right of the address bar.
        </p>
      )}

      {card && (
        <button type="button" className={s.notNow} onClick={dismiss}>
          No thanks
        </button>
      )}
    </section>
  );
}

// iPhone has no install button: Share, then "Add to Home Screen", shown as pictures.
function IphoneSteps() {
  return (
    <ol className={s.steps}>
      <li>
        <span className={s.stepPic} aria-hidden="true">
          <ShareIcon />
        </span>
        <span>
          Tap <strong>Share</strong> in Safari’s bar (at the bottom of the screen, or at the top on iPad).
        </span>
      </li>
      <li>
        <span className={s.stepPic} aria-hidden="true">
          <PlusSquare />
        </span>
        <span>
          Scroll down and tap <strong>Add to Home Screen</strong>.
        </span>
      </li>
      <li>
        <span className={`${s.stepPic} ${s.stepAdd}`} aria-hidden="true">
          Add
        </span>
        <span>
          Tap <strong>Add</strong> at the top right. The jambuch icon appears on your home screen.
        </span>
      </li>
    </ol>
  );
}

function ShareIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" />
    </svg>
  );
}

function PlusSquare() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

function MenuDots() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}
