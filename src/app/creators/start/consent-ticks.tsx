"use client";

import Link from "next/link";
import { CONSENT_LANGS, CONSENT_TEXT, CONSENT_UI, SUBMISSION_CONSENTS, SUMMARY, TERMS_VERSION, type ConsentLang } from "@/lib/creators/terms";
import c from "../creators.module.css";

type Ticks = Record<(typeof SUBMISSION_CONSENTS)[number], boolean>;
export const NO_TICKS: Ticks = { terms_refund: false, rights_origin: false, data_processing: false, age_18: false };
export const allTicked = (t: Ticks) => SUBMISSION_CONSENTS.every((k) => t[k]);

// The plain summary and the four separate, unticked boxes at story submission (brief §7).
// The writer reads them in English, Gujarati or Hindi; the language shown is recorded.
export default function ConsentTicks({
  lang,
  setLang,
  ticks,
  setTicks,
}: {
  lang: ConsentLang;
  setLang: (l: ConsentLang) => void;
  ticks: Ticks;
  setTicks: (t: Ticks) => void;
}) {
  const ui = CONSENT_UI[lang];
  return (
    <fieldset className={c.consent} lang={lang}>
      <legend>{ui.heading}</legend>
      <div className={c.langSwitch} role="group" aria-label="Language">
        {(Object.keys(CONSENT_LANGS) as ConsentLang[]).map((l) => (
          <button key={l} type="button" aria-pressed={l === lang} onClick={() => setLang(l)}>
            {CONSENT_LANGS[l]}
          </button>
        ))}
      </div>
      <ul className={c.summary}>
        {SUMMARY[lang].map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className={c.small}>
        <Link href={`/creators/terms#${lang}`} target="_blank">
          {ui.fullTerms} ↗
        </Link>
      </p>
      {SUBMISSION_CONSENTS.map((k) => (
        <label key={k} className={c.tick}>
          <input
            type="checkbox"
            name={`consent_${k}`}
            value="yes"
            checked={ticks[k]}
            onChange={(e) => setTicks({ ...ticks, [k]: e.target.checked })}
          />
          <span>{CONSENT_TEXT[k][lang]}</span>
        </label>
      ))}
      <input type="hidden" name="consent_lang" value={lang} />
      <input type="hidden" name="terms_version" value={TERMS_VERSION} />
      {!allTicked(ticks) && <p className={c.formNote}>{ui.allRequired}</p>}
    </fieldset>
  );
}
