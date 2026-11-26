import type { Metadata } from "next";
import Link from "next/link";
import { legalEntity, legalLine } from "@/lib/creators/legal";
import { directedSettings } from "@/lib/creators/team";
import { CONSENT_LANGS, CONSENT_TEXT, SUBMISSION_CONSENTS, SUMMARY, TERMS_VERSION, type ConsentLang } from "@/lib/creators/terms";
import LibraryHeader from "../../library/header";
import h from "../../home.module.css";
import c from "../creators.module.css";

export const metadata: Metadata = {
  title: "Terms and refund policy · Creator's Space · jambuch.in",
  description: "The terms, refund policy and disclaimers for Creator's Space, the paid studio service on jambuch.in.",
};

// The full terms (docs/CREATORS_SPACE_BRIEF.md §7, §7B, §8). English is the binding text; the
// summary and the consent ticks are also given in Gujarati and Hindi. When the meaning of
// anything here changes, raise TERMS_VERSION in src/lib/creators/terms.ts. "We" means the legal
// entity in the settings row "creators.legal" (src/lib/creators/legal.ts).
export const revalidate = 300;

export default async function TermsPage() {
  const [legal, directed] = await Promise.all([legalEntity(), directedSettings()]);
  const opens = new Date(`${directed.opens_on}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  return (
    <>
      <LibraryHeader cta={{ href: "/creators/start", label: "Start your story" }} />
      <main className={`${c.page} ${c.terms}`}>
        <section className={c.block}>
          <p className={h.eyebrow}>Creator’s Space · a paid studio service</p>
          <h1 className={c.h2}>Terms and refund policy</h1>
          <p className={c.small}>
            Creator’s Space is provided by {legalLine(legal)}. In these terms, “we”, “our” and “us” mean{" "}
            {legal.entity}.
          </p>
          <p className={c.small}>
            Questions in plain words: <Link href="/creators/faq">questions and answers</Link>. Version {TERMS_VERSION}.
            The English text is the binding version. Each request and order is bound by the
            version accepted at the time.
          </p>
          <p className={c.small}>
            {(Object.keys(CONSENT_LANGS) as ConsentLang[]).map((l, i) => (
              <span key={l}>
                {i > 0 && " · "}
                <a href={`#${l}`}>{CONSENT_LANGS[l]}</a>
              </span>
            ))}
          </p>

          {(Object.keys(CONSENT_LANGS) as ConsentLang[]).map((l) => (
            <div key={l} id={l} lang={l}>
              <h2>
                {l === "en" ? "In short" : l === "gu" ? "ટૂંકમાં" : "संक्षेप में"} ({CONSENT_LANGS[l]})
              </h2>
              <ul className={c.text}>
                {SUMMARY[l].map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className={c.small}>
                {l === "en" ? "What you agree to when you send a story:" : l === "gu" ? "વાર્તા મોકલતી વખતે તમે આ સ્વીકારો છો:" : "कहानी भेजते समय आप इन बातों से सहमत होते हैं:"}
              </p>
              <ol className={c.text}>
                {SUBMISSION_CONSENTS.map((k) => (
                  <li key={k}>{CONSENT_TEXT[k][l]}</li>
                ))}
              </ol>
            </div>
          ))}

          <h2>1. The service</h2>
          <ul className={c.text}>
            <li>
              Creator’s Space turns a writer’s story into a narrated audio story or an illustrated video. It is a paid
              service, separate from the free Courtyard. Payments and invoices are in the name of {legal.entity}.
            </li>
            <li>
              There are two ways to make your story. <b>Studio-made</b>: our automatic studio makes it and our team
              checks it. <b>Varta Vishva Directors</b>: one of our directors calls you within 2 days of the sample fee,
              then directs your story scene by scene; Premium is always made this way. Our directors take a limited
              number of new stories each week, so the start date shown may be later than today.
            </li>
            <li>
              Every order starts with a 30–60 second sample (₹499; ₹999 with Varta Vishva Directors), made after you
              approve your creative plan: watermarked, in the story’s first language. The minimum order is ₹999.
            </li>
            <li>
              A directed work carries the credit “Directed by (the director’s name), Varta Vishva Directors ·
              AI-assisted voices and illustrations”.
            </li>
            <li>We may refuse any request or order, with a reason.</li>
          </ul>

          <h2>2. Payment</h2>
          <ul className={c.text}>
            <li>The price is fixed in your quote, which comes with your creative plan.</li>
            <li>The sample fee is paid after you approve the plan, before the sample is made.</li>
            <li>
              If you go ahead after the sample, the sample fee is deducted from the full price. Of the rest, about half is paid in
              advance and the remainder before the clean files are unlocked.
            </li>
          </ul>

          <h2 id="refund">3. Refund policy</h2>
          <ul className={c.text}>
            <li>
              The sample fee is not refunded if you decide to stop after hearing or seeing the sample: it paid for the
              sample.
            </li>
            <li>
              If your sample is not delivered within 3 days of paying for it, the sample fee is refunded in full automatically.
            </li>
            <li>
              If your sample does not follow your approved plan, we make it again once, free. A new wish that is not in the
              plan is a change, not a mistake.
            </li>
            <li>If you are charged twice for the same thing, the extra payment is refunded automatically.</li>
            <li>
              Varta Vishva Directors, from the day it opens ({opens}): if your director has not started your order by the
              start date we promised you, everything you paid for that order is refunded in full.
            </li>
            <li>The advance is not refundable once production has started, unless we cannot deliver; then it is refunded in full.</li>
            <li>There is no refund after the clean files are downloaded. You are asked to confirm before downloading.</li>
            <li>Nothing is charged for a story our checks or we refuse before the plan: payment starts only after you approve the plan.</li>
            <li>If a package is withdrawn because a provider changed or stopped, unused payments are refunded.</li>
            <li>Refunds go back through Razorpay to the original payment method.</li>
          </ul>

          <h2>4. Your files and their deletion</h2>
          <ul className={c.text}>
            <li>
              All creative files of an order (your story, scripts, narration, pictures, video, samples and previews) are
              permanently deleted 7 days after the most recent delivery to you. They cannot be recovered for any reason.
              Keeping copies is your responsibility.
            </li>
            <li>A cancelled or refused order is deleted at once.</li>
            <li>
              Until then your story is kept in private storage that only our team can open; it is read by an automatic
              checker and, when needed, by our team. It is never kept anywhere else on this site.
            </li>
            <li>
              With Varta Vishva Directors, your director works on your story on their own computer: in a folder for your
              order only, on an encrypted drive, never in a shared or backed-up folder, and deleted with everything else
              7 days after delivery.
            </li>
            <li>
              Everyone on our team signs a confidentiality agreement before they can open any story, and can open only
              the orders assigned to them. Every opening of your story is logged.
            </li>
            <li>General sounds and music created by the studio (such as rain or temple bells) may be reused in other works. Your story, narration, paintings and anything made only for you are never reused and are deleted as promised.</li>
            <li>Counts of which sounds and pairings were used and how they were rated (no content) may be kept.</li>
          </ul>

          <h2 id="licence">5. Where you may use the finished work</h2>
          <ul className={c.text}>
            <li>
              You own the finished work. It is licensed for online and offline publishing: YouTube, Spotify and other
              audio platforms, websites, social media, WhatsApp, and personal use, including showing it at home, in a
              school or at a community gathering.
            </li>
            <li>
              It is not licensed for film, TV broadcast, cinema or games, including film festival screenings and use
              inside a game or app. For those, the music replacement add-on (quoted separately) must be delivered before
              release. Without it, such use is outside the licence and your own responsibility.
            </li>
            <li>We deliver only the finished, mixed files, never separate music, voice or sound tracks.</li>
          </ul>

          <h2>6. Your promises</h2>
          <ul className={c.text}>
            <li>
              The story is your own work, or you hold the rights to it and to everything you send. It is not a
              translation or adaptation of someone else’s work unless you hold their written permission. Original
              creators are credited as you declare, and that credit cannot be removed.
            </li>
            <li>If anyone claims rights in what you sent, you are responsible and bear the cost, and we may stop the work and remove any copies.</li>
            <li>
              Your story and how you publish the finished work follow the law and the guidelines of the platforms where
              you publish it. You are responsible for what you publish. See{" "}
              <Link href="/creators#guidelines">what we don’t make</Link>.
            </li>
            <li>You are 18 or older.</li>
          </ul>

          <h2>7. AI and your data</h2>
          <ul className={c.text}>
            <li>
              Voices, pictures and video are made with AI tools. Results can vary; only errors you flag are corrected.
              Our mistakes are fixed free; your content changes are free up to 20% of the work in one round and charged
              above that.
            </li>
            <li>
              Your story is processed by AI service providers (Anthropic, ElevenLabs) to make your order. We never use
              it for anything else and never sell it. jambuch.in deletes your story and files from its storage 7 days
              after delivery. The providers keep some records under their own policies; what each keeps, for how long,
              and what we delete there is in the <Link href="/creators/privacy">privacy policy</Link>.
            </li>
            <li>Platforms may require you to label AI-made content when you upload it; doing so is your responsibility.</li>
          </ul>

          <h2>8. Later in an order</h2>
          <p className={c.text}>We ask for more ticks only when they apply:</p>
          <ul className={c.text}>
            <li>{CONSENT_TEXT.own_voice.en} (only if you send your own voice)</li>
            <li>
              Whether jambuch.in may publish the finished work, chosen when you approve the plan. You can withdraw
              permission at any time.
            </li>
            <li>{CONSENT_TEXT.plan_baseline.en}</li>
            <li>{CONSENT_TEXT.deletion_ack.en} (before the download)</li>
          </ul>

          <h2>9. Disclaimers</h2>
          <ul className={c.text}>
            <li>We do not promise views, subscribers, income, monetisation, awards, or that any platform will accept or keep the work.</li>
            <li>The opinions, facts and claims in a story are the writer’s. Making a work is not an endorsement of it.</li>
            <li>We do not give legal, copyright or tax advice.</li>
            <li>AI voices follow the approved pronunciation list; regional differences may remain. Voices are synthetic.</li>
            <li>AI pictures are new for each order but may by chance resemble existing works, places or people; any resemblance to real people is unintended.</li>
            <li>Delivery dates are estimates. We are not liable for delays from events outside our control.</li>
            <li>Our total liability for an order is limited to the amount paid for it. We are not liable for indirect losses.</li>
            <li>These terms are governed by Indian law; disputes go to the courts of Ahmedabad, Gujarat. We will first try to resolve any complaint by talking.</li>
          </ul>

          <p className={c.apart}>
            <Link href="/creators">← Back to Creator’s Space</Link>
          </p>
        </section>
      </main>
    </>
  );
}
