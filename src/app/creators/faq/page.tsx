import type { Metadata } from "next";
import Link from "next/link";
import { adminClient } from "@/lib/supabase-admin";
import { EPISODE_CHARS, flowSettings, storedPricingSettings } from "@/lib/creators/flow";
import { faqSections, type FaqLang } from "@/lib/creators/faq";
import { legalEntity } from "@/lib/creators/legal";
import { LIMITS } from "@/lib/creators/limits";
import { COLOUR_LABELS, STYLE_LABELS } from "@/lib/creators/questions";
import { directedSettings } from "@/lib/creators/team";
import LibraryHeader from "../../library/header";
import h from "../../home.module.css";
import c from "../creators.module.css";

export const metadata: Metadata = {
  title: "Questions and answers · Creator's Space · jambuch.in",
  description: "How our studio turns your story into narrated audio and illustrated video: what we make, prices, timing, rights, privacy and refunds.",
};

// Settings can change (prices, days, feature switches): refresh every few minutes.
export const revalidate = 300;

const LANGS: Record<FaqLang, string> = { en: "English", gu: "ગુજરાતી", hi: "हिन्दी" };
const LOCALE: Record<FaqLang, string> = { en: "en-IN", gu: "gu-IN", hi: "hi-IN" };
const HEAD: Record<FaqLang, { title: string; lede: string; draft: string; back: string; start: string }> = {
  en: {
    title: "Questions and answers",
    lede: "How our studio turns your story into narrated audio and illustrated video. The terms are the binding text; this page explains them in plain words.",
    draft: "",
    back: "← Back to Creator’s Space",
    start: "Start your story",
  },
  gu: {
    title: "પ્રશ્નો અને જવાબો",
    lede: "અમારો સ્ટુડિયો તમારી વાર્તાને ઓડિયો અને ચિત્રોવાળા વીડિયોમાં કેવી રીતે ફેરવે છે. બંધનકર્તા લખાણ શરતો છે; આ પેજ તેને સરળ શબ્દોમાં સમજાવે છે.",
    draft: "ગુજરાતી અનુવાદ ચકાસણી હેઠળ છે; કોઈ ફરક હોય તો અંગ્રેજી લખાણ માન્ય.",
    back: "← ક્રિએટર્સ સ્પેસ પર પાછા",
    start: "તમારી વાર્તા શરૂ કરો",
  },
  hi: {
    title: "प्रश्न और उत्तर",
    lede: "हमारा स्टूडियो आपकी कहानी को ऑडियो और चित्रों वाले वीडियो में कैसे बदलता है। बाध्यकारी लेख शर्तें हैं; यह पेज उन्हें सरल शब्दों में समझाता है।",
    draft: "हिन्दी अनुवाद जाँच में है; कोई अंतर हो तो अंग्रेज़ी लेख मान्य है।",
    back: "← क्रिएटर्स स्पेस पर वापस",
    start: "अपनी कहानी शुरू करें",
  },
};

// The writers' FAQ (src/lib/creators/faq.ts): grouped, each question collapsible, in English,
// Gujarati or Hindi (?lang=). Every number comes from settings or shared constants, and an
// answer about a feature shows only while that feature's switch is on.
export default async function FaqPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang: raw } = await searchParams;
  const lang: FaqLang = raw === "gu" || raw === "hi" ? raw : "en";
  const [pricing, flow, directed, legal, footerEmail] = await Promise.all([
    storedPricingSettings(),
    flowSettings(),
    directedSettings(),
    legalEntity(),
    adminClient()
      .from("site_text")
      .select("en")
      .eq("key", "footer.email")
      .maybeSingle()
      .then((r) => r.data?.en?.trim() || null, () => null),
  ]);
  const opens = new Date(`${directed.opens_on}T00:00:00Z`);
  const opensOn = Object.fromEntries(
    (Object.keys(LANGS) as FaqLang[]).map((l) => [l, opens.toLocaleDateString(LOCALE[l], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })]),
  ) as Record<FaqLang, string>;
  const sections = faqSections({
    minimum: pricing.minimum_inr,
    sampleStudio: pricing.sample_fee_inr,
    sampleDirected: pricing.directed_sample_fee_inr,
    episodeChars: EPISODE_CHARS,
    days: flow.delivery_days,
    deleteDays: LIMITS.deleteDaysAfterDelivery,
    sampleRefundDays: LIMITS.sampleRefundDays,
    unfinishedReminderDay: LIMITS.unfinishedReminderDays,
    unfinishedDeleteDays: LIMITS.unfinishedDeleteDays,
    freeChangePercent: LIMITS.freeChangePercent,
    newOrderPercent: LIMITS.newOrderPercent,
    rechecks: LIMITS.rechecks,
    replyDays: LIMITS.replyWorkingDays,
    directedOpen: Date.now() >= opens.getTime(),
    opensOn,
    voiceNotes: flow.voice_notes,
    features: flow.features,
    styles: Object.values(STYLE_LABELS),
    colours: Object.values(COLOUR_LABELS),
    contact: legal.contact_email || footerEmail,
  });
  const hd = HEAD[lang];
  const gu = lang === "gu" ? "gu" : "";

  return (
    <>
      <LibraryHeader cta={{ href: "/creators/start", label: "Start your story" }} />
      <main className={`${c.page} ${c.terms} ${c.faq}`} lang={lang}>
        <section className={c.block}>
          <p className={h.eyebrow}>Creator’s Space · Varta Vishva Studio</p>
          <h1 className={`${c.h2} ${gu}`}>{hd.title}</h1>
          <p className={`${c.text} ${gu}`}>{hd.lede}</p>
          <p className={c.small}>
            {(Object.keys(LANGS) as FaqLang[]).map((l, i) => (
              <span key={l}>
                {i > 0 && " · "}
                {l === lang ? <b>{LANGS[l]}</b> : <Link href={l === "en" ? "/creators/faq" : `/creators/faq?lang=${l}`}>{LANGS[l]}</Link>}
              </span>
            ))}
          </p>
          {hd.draft && <p className={`${c.small} ${gu}`}>{hd.draft}</p>}

          <nav className={`${c.small} ${gu}`} aria-label={hd.title}>
            {sections.map((s, i) => (
              <span key={s.id}>
                {i > 0 && " · "}
                <a href={`#${s.id}`}>{s.title[lang]}</a>
              </span>
            ))}
          </nav>

          {sections.map((s) => (
            <div key={s.id} id={s.id}>
              <h2 className={gu}>{s.title[lang]}</h2>
              {s.items.map((it) => (
                <details key={it.id} id={`${s.id}-${it.id}`} className={c.faqItem}>
                  <summary className={gu}>{it.q[lang]}</summary>
                  <div className={`${c.text} ${gu}`}>
                    {it.a.map((b, n) =>
                      "p" in b ? (
                        <p key={n}>
                          {b.p[lang]}
                          {b.link && (
                            <>
                              {b.p[lang] ? " " : ""}
                              <Link href={b.link.href}>{b.link.label[lang]} →</Link>
                            </>
                          )}
                        </p>
                      ) : "ul" in b ? (
                        <ul key={n}>
                          {b.ul.map((x, k) => (
                            <li key={k}>{x[lang]}</li>
                          ))}
                        </ul>
                      ) : (
                        <ol key={n}>
                          {b.ol.map((x, k) => (
                            <li key={k}>{x[lang]}</li>
                          ))}
                        </ol>
                      ),
                    )}
                  </div>
                </details>
              ))}
            </div>
          ))}

          <div className={h.buttons} style={{ marginTop: "2rem" }}>
            <Link href="/creators/start" className={h.btnAccent}>
              {hd.start}
            </Link>
          </div>
          <p className={c.apart}>
            <Link href="/creators">{hd.back}</Link> · <Link href="/creators/terms">Terms</Link> ·{" "}
            <Link href="/creators/privacy">Privacy</Link>
          </p>
        </section>
      </main>
    </>
  );
}
