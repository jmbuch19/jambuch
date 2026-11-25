"use client";

import Link from "next/link";
import { CONSENT_LANGS, CONSENT_TEXT, CONSENT_UI, SUMMARY, TERMS_VERSION, type ConsentKind, type ConsentLang } from "@/lib/creators/terms";
import c from "../creators.module.css";

export type Ticks = Partial<Record<ConsentKind, boolean>>;
export const allTicked = (kinds: readonly ConsentKind[], t: Ticks) => kinds.every((k) => t[k]);

// The plain summary and separate, unticked boxes (brief §7). In the question flow, 18+ is
// asked at sign-in and the other three before the story is read (CREATORS_QUESTION_FLOW
// 0.5 and 1.3). The writer reads them in English, Gujarati or Hindi; the language shown is
// recorded with each tick.
export default function ConsentTicks({
  kinds,
  lang,
  setLang,
  ticks,
  setTicks,
  summary = true,
}: {
  kinds: readonly ConsentKind[];
  lang: ConsentLang;
  setLang?: (l: ConsentLang) => void;
  ticks: Ticks;
  setTicks: (t: Ticks) => void;
  summary?: boolean;
}) {
  const ui = CONSENT_UI[lang];
  return (
    <fieldset className={c.consent} lang={lang}>
      {summary && <legend>{ui.heading}</legend>}
      {setLang && (
        <div className={c.langSwitch} role="group" aria-label="Language">
          {(Object.keys(CONSENT_LANGS) as ConsentLang[]).map((l) => (
            <button key={l} type="button" aria-pressed={l === lang} onClick={() => setLang(l)}>
              {CONSENT_LANGS[l]}
            </button>
          ))}
        </div>
      )}
      {summary && (
        <>
          <ul className={c.summary}>
            {SUMMARY[lang].map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className={c.small}>
            <Link href={`/creators/terms#${lang}`} target="_blank">
              {ui.fullTerms} ↗
            </Link>
            {" · "}
            <Link href="/creators/privacy" target="_blank">
              {ui.privacy} ↗
            </Link>
          </p>
        </>
      )}
      {kinds.map((k) => (
        <label key={k} className={c.tick}>
          <input
            type="checkbox"
            name={`consent_${k}`}
            value="yes"
            checked={!!ticks[k]}
            onChange={(e) => setTicks({ ...ticks, [k]: e.target.checked })}
          />
          <span>{CONSENT_TEXT[k][lang]}</span>
        </label>
      ))}
      <input type="hidden" name="consent_lang" value={lang} />
      <input type="hidden" name="terms_version" value={TERMS_VERSION} />
    </fieldset>
  );
}
