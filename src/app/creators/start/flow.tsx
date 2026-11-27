"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  QUESTIONS,
  STAGE_NAMES,
  UI,
  fill,
  t,
  visibleQuestions,
  type Answer,
  type Answers,
  type Ctx,
  type Lang,
  type Question,
  type Stop,
} from "@/lib/creators/questions";
import { abandonDraft, createDraft, saveAnswers, saveText, saveYou, type ClientDraft } from "./flow-actions";
import {
  CharactersStep,
  ConsentStep,
  EpisodesStep,
  FollowUpsStep,
  LengthCheck,
  LevelStep,
  LookStep,
  PicturesStep,
  PlanStep,
  PriceRange,
  StoryStep,
  VoiceNote,
  type StepProps,
} from "./steps";
import SignInForm from "./sign-in-form";
import { CONSENT_LANGS } from "@/lib/creators/terms";
import h from "../../home.module.css";
import c from "../creators.module.css";

// The guided flow (docs/CREATORS_QUESTION_FLOW.md): one question per screen, a progress bar,
// every answer saved as it is given (this browser + the server), and the cascade from
// questions.ts deciding what comes next.

export type FlowInitial = {
  id: string;
  answers: Answers;
  currentStep: string | null;
  name: string;
  whatsapp: string;
  storyChars: number;
  storyLang: string | null;
  screened: boolean;
  draft: ClientDraft;
} | null;

const LOCAL = "creators.flow.v1";
const EMPTY_CD: ClientDraft = { text: {}, characters: [], looks: [], followups: [], followups_done: false, pronunciation: [], episodes: [], pictures: [] };

type Local = { answers: Answers; qid: string; age18: boolean };
const readLocal = (): Local => {
  try {
    return { answers: {}, qid: "lang", age18: false, ...(JSON.parse(localStorage.getItem(LOCAL) ?? "{}") as Partial<Local>) };
  } catch {
    return { answers: {}, qid: "lang", age18: false };
  }
};
const writeLocal = (l: Local) => {
  try {
    localStorage.setItem(LOCAL, JSON.stringify(l));
  } catch {
    /* private mode: the server copy is enough */
  }
};

export default function Flow({ signedIn, initial, voiceNotes }: { signedIn: boolean; initial: FlowInitial; voiceNotes: boolean }) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(initial?.id ?? null);
  const [answers, setAnswers] = useState<Answers>(initial?.answers ?? {});
  const [cd, setCd] = useState<ClientDraft>(initial?.draft ?? EMPTY_CD);
  const [ctx, setCtx] = useState<Ctx>({ storyChars: initial?.storyChars ?? 0, storyLang: initial?.storyLang ?? null, characters: initial?.draft.characters.length ?? 0 });
  const [screened, setScreened] = useState(!!initial?.screened);
  const [qid, setQid] = useState<string>(initial?.currentStep ?? (initial ? "you" : "lang"));
  const [age18, setAge18] = useState(false);
  const [stop, setStop] = useState<Stop | null>(null);
  const [final, setFinal] = useState<{ kind: string; message: string } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(!!initial);
  const creating = useRef(false);
  const lang: Lang = (["gu", "hi", "en"].includes(String(answers.lang)) ? answers.lang : "gu") as Lang;

  // Before sign-in, stage 0 lives in this browser only.
  useEffect(() => {
    if (initial) return;
    const l = readLocal();
    setAnswers(l.answers);
    setQid(l.qid || "lang");
    setAge18(l.age18);
    setHydrated(true);
  }, [initial]);

  // Signed in with no draft yet: create it from the stage-0 answers.
  useEffect(() => {
    if (!hydrated || !signedIn || id || creating.current) return;
    const l = readLocal();
    if (l.qid !== "signin" || !l.age18) return;
    creating.current = true;
    createDraft({ answers: l.answers, age18: l.age18 }).then((res) => {
      if (res.id) {
        writeLocal({ answers: {}, qid: "lang", age18: false });
        router.refresh();
      } else {
        setError(res.error ?? "");
        creating.current = false;
      }
    });
  }, [hydrated, signedIn, id, router, age18, qid]);

  useEffect(() => setCtx((x) => ({ ...x, characters: cd.characters.length })), [cd.characters.length]);

  const all = useMemo(() => visibleQuestions(answers, ctx), [answers, ctx]);
  // After sign-in the writer works from stage 1; stage 0 stays as answered.
  const steps = useMemo(() => (id ? all.filter((q) => q.stage >= 1) : all.filter((q) => q.stage === 0)), [all, id]);
  const index = Math.max(0, steps.findIndex((q) => q.id === qid));
  const q: Question | undefined = steps[index] ?? steps[0];

  if (!hydrated) return null;

  function go(to: Question | undefined) {
    if (!to) return;
    setQid(to.id);
    setError("");
    if (!id) writeLocal({ answers, qid: to.id, age18 });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Next question after `patch` is applied (the cascade may change what comes next).
  function nextAfter(next: Answers, from: string) {
    const list = visibleQuestions(next, ctx).filter((x) => (id ? x.stage >= 1 : x.stage === 0));
    const i = list.findIndex((x) => x.id === from);
    return list[i + 1];
  }

  async function answer(patch: Answers, advance = true) {
    const next = { ...answers, ...patch };
    for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
    setAnswers(next);
    const s = q?.stop?.(next) ?? null;
    if (!id) {
      writeLocal({ answers: next, qid: q?.id ?? "lang", age18 });
      if (s) return setStop(s);
      if (advance) go(nextAfter(next, q!.id));
      return;
    }
    setSaving(true);
    const to = nextAfter(next, q!.id);
    const res = await saveAnswers(id, patch, to?.id ?? q!.id);
    setSaving(false);
    if (!res.ok) return setError(res.error ?? "");
    if (res.answers) setAnswers(res.answers);
    if (res.stopped) return setStop(s ?? { kind: res.stopped, message: { en: "", gu: "", hi: "" } });
    if (advance) go(to);
  }

  const props: StepProps = {
    id,
    lang,
    answers,
    cd,
    setCd: (d) => setCd(d),
    onAnswers: (p) => answer(p, false),
    onDone: (patch) => (patch ? answer(patch) : go(nextAfter(answers, q!.id))),
    onFinal: (kind, message) => setFinal({ kind, message }),
  };

  // ------------------------------------------------------------ end screens

  if (final) {
    return (
      <div className={final.kind === "refused" ? c.refused : h.ideaSent} role="status">
        <p>{final.message}</p>
      </div>
    );
  }
  if (stop) {
    return (
      <div className={stop.kind === "needs_human" ? h.ideaSent : c.refused} role="status">
        <p>{t(stop.message, lang)}</p>
        {stop.kind === "end" && (
          <button
            type="button"
            className={c.navBack}
            onClick={async () => {
              if (id) await abandonDraft(id);
              writeLocal({ answers: { lang }, qid: "ready", age18: false });
              setStop(null);
              setId(null);
              setAnswers({ lang });
              setQid("ready");
              router.refresh();
            }}
          >
            {t(UI.startOver, lang)}
          </button>
        )}
      </div>
    );
  }
  if (!q) return null;

  // ------------------------------------------------------------ one question

  const progress = steps.length ? Math.round(((index + 1) / steps.length) * 100) : 0;
  const back = index > 0 ? steps[index - 1] : null;

  return (
    <div className={c.flow} lang={lang}>
      <div className={c.flowTop}>
        <p className={c.stageName}>{t(STAGE_NAMES[q.stage], lang)}</p>
        <div className={c.langSwitch} role="group" aria-label="Language">
          {(Object.keys(CONSENT_LANGS) as Lang[]).map((l) => (
            <button key={l} type="button" aria-pressed={l === lang} onClick={() => answer({ lang: l }, false)}>
              {CONSENT_LANGS[l]}
            </button>
          ))}
        </div>
      </div>
      <div className={c.progress} aria-hidden>
        <span style={{ width: `${progress}%` }} />
      </div>
      <p className={c.progressText}>{fill(t(UI.step, lang), { n: index + 1, t: steps.length })}</p>

      <h2 className={c.q}>{t(q.label, lang)}</h2>
      {q.help && <p className={c.help}>{t(q.help, lang)}</p>}

      <QuestionBody
        q={q}
        props={props}
        answers={answers}
        answer={answer}
        signedIn={signedIn}
        age18={age18}
        setAge18={(v) => {
          setAge18(v);
          writeLocal({ answers, qid: q.id, age18: v });
        }}
        initial={initial}
        ctx={ctx}
        setCtx={setCtx}
        screened={screened}
        setScreened={setScreened}
        voiceNotes={voiceNotes}
        cd={cd}
        setCd={setCd}
        go={() => go(nextAfter(answers, q.id))}
        setError={setError}
      />

      {error && (
        <p className={h.ideaError} role="alert">
          {error}
        </p>
      )}
      <div className={c.nav}>
        {back && back.special !== "consent" && (
          <button type="button" className={c.navBack} onClick={() => go(back)}>
            ← {t(UI.back, lang)}
          </button>
        )}
        {saving && <span className={c.saved}>…</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the body of one question

function QuestionBody(p: {
  q: Question;
  props: StepProps;
  answers: Answers;
  answer: (patch: Answers, advance?: boolean) => Promise<void>;
  signedIn: boolean;
  age18: boolean;
  setAge18: (v: boolean) => void;
  initial: FlowInitial;
  ctx: Ctx;
  setCtx: (c: Ctx) => void;
  screened: boolean;
  setScreened: (v: boolean) => void;
  voiceNotes: boolean;
  cd: ClientDraft;
  setCd: (d: ClientDraft) => void;
  go: () => void;
  setError: (s: string) => void;
}) {
  const { q, props, answers, answer } = p;
  const lang = props.lang;

  if (q.kind === "single") {
    const cur = answers[q.id] ?? q.default;
    return (
      <div className={c.opts} role="radiogroup" aria-label={t(q.label, lang)}>
        {q.options!.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={cur === o.id} className={`${c.opt} ${cur === o.id ? c.optOn : ""}`} onClick={() => answer({ [q.id]: o.id })}>
            <span>{t(o.label, lang)}</span>
            {o.hint && <span className={c.optHint}>{t(o.hint, lang)}</span>}
          </button>
        ))}
        {q.optional && (
          <button type="button" className={c.linkButton} onClick={() => props.onDone()}>
            {t(UI.skip, lang)}
          </button>
        )}
      </div>
    );
  }

  if (q.kind === "multi") return <Multi q={q} lang={lang} value={(answers[q.id] as string[] | undefined) ?? (q.default as string[] | undefined) ?? []} onSave={(v) => answer({ [q.id]: v })} onSkip={() => props.onDone()} />;

  if (q.kind === "text")
    return (
      <TextQ
        key={q.id}
        q={q}
        lang={lang}
        id={props.id}
        initial={p.cd.text[q.id] ?? ""}
        voiceNotes={p.voiceNotes}
        onSave={async (text) => {
          if (!props.id) return;
          const res = await saveText(props.id, q.id, text);
          if (!res.ok) return p.setError(res.error ?? "");
          p.setCd({ ...p.cd, text: { ...p.cd.text, [q.id]: res.text ?? "" } });
          p.go();
        }}
      />
    );

  switch (q.special) {
    case "price_range":
      return <PriceRange {...props} />;
    case "signin":
      return <SignInStep lang={lang} signedIn={p.signedIn} age18={p.age18} setAge18={p.setAge18} />;
    case "you":
      return <YouStep id={props.id} lang={lang} name={p.initial?.name ?? ""} whatsapp={p.initial?.whatsapp ?? ""} onDone={p.go} />;
    case "story":
      return (
        <StoryStep
          {...props}
          screened={p.screened}
          initial={{ chars: p.ctx.storyChars, lang: p.ctx.storyLang }}
          onSaved={(chars, storyLang) => p.setCtx({ ...p.ctx, storyChars: chars, storyLang })}
          onDone={() => {
            p.go();
          }}
        />
      );
    case "consent":
      return (
        <ConsentStep
          {...props}
          onDone={() => {
            p.setScreened(true);
            p.go();
          }}
        />
      );
    case "level":
      return <LevelStep {...props} />;
    case "length_check":
      return <LengthCheck {...props} chars={p.ctx.storyChars} storyLang={p.ctx.storyLang} />;
    case "look":
      return <LookStep {...props} />;
    case "characters":
      return <CharactersStep {...props} />;
    case "pictures":
      return <PicturesStep {...props} />;
    case "episodes":
      return <EpisodesStep {...props} />;
    case "followups":
      return <FollowUpsStep {...props} />;
    case "plan":
      return <PlanStep {...props} />;
  }
  return null;
}

function Multi({ q, lang, value, onSave, onSkip }: { q: Question; lang: Lang; value: string[]; onSave: (v: Answer) => void; onSkip: () => void }) {
  const [picked, setPicked] = useState<string[]>(value);
  const max = q.max ?? q.options!.length;
  return (
    <>
      <div className={c.opts} role="group" aria-label={t(q.label, lang)}>
        {q.options!.map((o) => {
          const on = picked.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              className={`${c.opt} ${on ? c.optOn : ""}`}
              disabled={!on && picked.length >= max}
              onClick={() => setPicked(on ? picked.filter((x) => x !== o.id) : [...picked, o.id])}
            >
              <span>
                {on ? "✓ " : ""}
                {t(o.label, lang)}
              </span>
              {o.hint && <span className={c.optHint}>{t(o.hint, lang)}</span>}
            </button>
          );
        })}
      </div>
      <div className={c.nav}>
        <button type="button" className={h.ideaSend} disabled={!q.optional && !picked.length} onClick={() => onSave(picked)}>
          {t(UI.next, lang)}
        </button>
        {q.optional && (
          <button type="button" className={c.linkButton} onClick={onSkip}>
            {t(UI.skip, lang)}
          </button>
        )}
      </div>
    </>
  );
}

function TextQ({ q, lang, id, initial, voiceNotes, onSave }: { q: Question; lang: Lang; id: string | null; initial: string; voiceNotes: boolean; onSave: (s: string) => Promise<void> }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <label className={h.field}>
        {(q.rows ?? 2) > 1 ? (
          <textarea aria-label={t(q.label, lang)} rows={q.rows} maxLength={q.maxLength} value={text} onChange={(e) => setText(e.target.value)} />
        ) : (
          <input aria-label={t(q.label, lang)} maxLength={q.maxLength} value={text} onChange={(e) => setText(e.target.value)} />
        )}
      </label>
      {voiceNotes && id && <VoiceNote id={id} lang={lang} onText={(s) => setText((x) => (x ? `${x} ${s}` : s))} />}
      <div className={c.nav}>
        <button
          type="button"
          className={h.ideaSend}
          disabled={busy || (!q.optional && !text.trim())}
          onClick={async () => {
            setBusy(true);
            await onSave(text);
            setBusy(false);
          }}
        >
          {t(UI.next, lang)}
        </button>
        {q.optional && !text.trim() && (
          <button
            type="button"
            className={c.linkButton}
            onClick={async () => {
              setBusy(true);
              await onSave("");
              setBusy(false);
            }}
          >
            {t(UI.skip, lang)}
          </button>
        )}
      </div>
    </>
  );
}

// 0.5: the 18+ tick, then sign-in by emailed code. After sign-in the page reloads and the
// draft is created from what this browser kept.
function SignInStep({ lang, signedIn, age18, setAge18 }: { lang: Lang; signedIn: boolean; age18: boolean; setAge18: (v: boolean) => void }) {
  const AGE: Record<Lang, string> = { en: "I am 18 or older.", gu: "મારી ઉંમર 18 વર્ષ કે તેથી વધુ છે.", hi: "मेरी उम्र 18 वर्ष या उससे अधिक है।" };
  const WHY: Record<Lang, string> = {
    en: "We send a short code to your email; no password is needed. Nothing is read or made until you have signed in.",
    gu: "અમે તમારા ઇમેઇલ પર એક નાનો કોડ મોકલીએ છીએ; પાસવર્ડની જરૂર નથી. સાઇન ઇન પહેલાં કંઈ વંચાતું કે બનતું નથી.",
    hi: "हम आपके ईमेल पर एक छोटा कोड भेजते हैं; पासवर्ड की ज़रूरत नहीं। साइन इन से पहले कुछ पढ़ा या बनाया नहीं जाता।",
  };
  const WAIT: Record<Lang, string> = { en: "Signed in. Preparing your request…", gu: "સાઇન ઇન થયું. તમારી વિનંતી તૈયાર કરીએ છીએ…", hi: "साइन इन हो गया। आपका अनुरोध तैयार कर रहे हैं…" };
  if (signedIn && age18) return <p className={c.working}>{WAIT[lang]}</p>;
  return (
    <>
      {!signedIn && <p className={c.text}>{WHY[lang]}</p>}
      <label className={c.tick}>
        <input type="checkbox" checked={age18} onChange={(e) => setAge18(e.target.checked)} />
        <span>{AGE[lang]}</span>
      </label>
      {age18 && <SignInForm />}
    </>
  );
}

function YouStep({ id, lang, name, whatsapp, onDone }: { id: string | null; lang: Lang; name: string; whatsapp: string; onDone: () => void }) {
  const [n, setN] = useState(name);
  const [wa, setWa] = useState(whatsapp);
  const [error, setError] = useState("");
  const L = {
    name: { en: "Your name, as it should appear in the credits", gu: "તમારું નામ, જેમ શ્રેયમાં દેખાવું જોઈએ", hi: "आपका नाम, जैसा श्रेय में दिखना चाहिए" },
    wa: { en: "WhatsApp number (optional)", gu: "WhatsApp નંબર (વૈકલ્પિક)", hi: "WhatsApp नंबर (वैकल्पिक)" },
  };
  return (
    <>
      <label className={h.field}>
        {L.name[lang]}
        <input value={n} maxLength={200} autoComplete="name" onChange={(e) => setN(e.target.value)} />
      </label>
      <label className={h.field}>
        {L.wa[lang]}
        <input value={wa} maxLength={20} inputMode="tel" autoComplete="tel" onChange={(e) => setWa(e.target.value)} />
      </label>
      {error && <p className={h.ideaError}>{error}</p>}
      <div className={c.nav}>
        <button
          type="button"
          className={h.ideaSend}
          disabled={!n.trim()}
          onClick={async () => {
            if (!id) return;
            const res = await saveYou(id, n, wa);
            if (res.ok) onDone();
            else setError(res.error ?? "");
          }}
        >
          {t(UI.next, lang)}
        </button>
      </div>
    </>
  );
}

// Every question in the flow is defined once in questions.ts.
export const QUESTION_COUNT = QUESTIONS.length;
