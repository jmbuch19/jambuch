import type { Metadata } from "next";
import Link from "next/link";
import { adminClient } from "@/lib/supabase-admin";
import { TERMS_VERSION } from "@/lib/creators/terms";
import { legalEntity, legalLine } from "@/lib/creators/legal";
import LibraryHeader from "../../library/header";
import h from "../../home.module.css";
import c from "../creators.module.css";

export const metadata: Metadata = {
  title: "Privacy policy · Creator's Space · jambuch.in",
  description: "What Creator's Space collects, why, who handles it, how long it is kept, and your rights.",
};

// Refresh the contact address (site_text "footer.email") every few minutes.
export const revalidate = 300;

// Creator's Space privacy policy (docs/CREATORS_SPACE_BRIEF.md §2 item 6). Every provider
// line must match docs/licences.md, which quotes each provider's own pages. When this text
// changes in meaning, raise TERMS_VERSION in src/lib/creators/terms.ts.
export default async function PrivacyPage() {
  const legal = await legalEntity();
  const contact = await adminClient()
    .from("site_text")
    .select("en")
    .eq("key", "footer.email")
    .maybeSingle()
    .then((r) => r.data?.en?.trim() || null, () => null);

  return (
    <>
      <LibraryHeader cta={{ href: "/creators", label: "Creator’s Space" }} />
      <main className={`${c.page} ${c.terms}`}>
        <section className={c.block}>
          <p className={h.eyebrow}>Creator’s Space · a paid studio service</p>
          <h1 className={c.h2}>Privacy policy</h1>
          <p className={c.small}>
            Version {TERMS_VERSION}. This policy covers Creator’s Space on jambuch.in, provided by {legalLine(legal)}.
            “We”, “our” and “us” mean {legal.entity}. It sits beside the <Link href="/creators/terms">terms</Link>.
          </p>

          <h2>1. What we collect</h2>
          <ul className={c.text}>
            <li>Your email address, to sign you in with a one-time code and to write to you.</li>
            <li>Your name and, if you give it, your WhatsApp number.</li>
            <li>Your story, your note about it, your answers to our questions and your choices for the creation.</li>
            <li>
              A record of each consent you tick (which one, the terms version, the language shown and the time), and the
              result of the automatic content check.
            </li>
            <li>For paid orders (later): payment details, handled by Razorpay. We never see your card or UPI details.</li>
          </ul>

          <h2>2. Why</h2>
          <p className={c.text}>
            Only to make what you order, talk to you about it, keep the records the law requires (payments, invoices)
            and keep proof of what you agreed to. We never sell your data, never use your story for anything else, and
            never publish it unless you choose that for a finished work.
          </p>

          <h2>3. What jambuch.in keeps, and for how long</h2>
          <ul className={c.text}>
            <li>
              <b>Your story and files</b> (your story, your answers, your sample): kept in private storage that only
              our team can open, and deleted 7 days after your sample or order is delivered, or within a day if a
              request is withdrawn, refused or closed. Our database holds no story text, only a fingerprint and its
              length. Your story is never sent by email; our team reads it in our private admin pages.
            </li>
            <li>
              <b>With Varta Vishva Directors:</b> your director also works on your story on their own computer, in a
              folder for your order only, on an encrypted drive, never in a shared, synced or backed-up folder. That
              folder is deleted by a logged script 7 days after delivery, with everything else, and is covered by the
              deletion record we keep.
            </li>
            <li>
              <b>Our team:</b> everyone signs a confidentiality agreement before they can open any story, and can open
              only the orders assigned to them. Every time someone on our team opens your story, it is logged.
            </li>
            <li>
              <b>Sounds made for the studio’s library:</b> General sounds and music created by the studio (such as rain or temple bells) may be reused in other works. Your story, narration, paintings and anything made only for you are never reused and are deleted as promised.
            </li>
            <li>
              <b>Records without story content</b> (your choices, the check result, style tags, consents, payments,
              invoices): kept as long as the law requires or as needed to settle a dispute.
            </li>
          </ul>

          <h2>4. Who else handles your data, and what they keep</h2>
          <p className={c.text}>
            These services work for us. Each keeps some data under its own policy, which we can’t shorten. What we
            delete there ourselves is stated.
          </p>
          <ul className={c.text}>
            <li>
              <b>Anthropic (Claude, AI):</b> reads your story to check it, ask questions and prepare the script. Its
              policy for API users: inputs and outputs are deleted within 30 days; content flagged by its safety systems
              may be kept up to 2 years, or longer if the law requires. Under its commercial terms Anthropic may not
              train its models on our content.
            </li>
            <li>
              <b>ElevenLabs (AI voices):</b> turns the approved script into speech. It keeps the text and audio in our
              account’s history until deleted; <b>we delete your order’s history through its API when your order
              closes</b>. ElevenLabs may use content to improve its models unless the account’s data-use setting is
              off; <b>we keep that setting off</b>. Its terms still give it a wider licence over content than that
              setting covers; see its own privacy policy.
            </li>
            <li>
              <b>Anthropic Managed Agents (cloud production, if used for your order):</b> keeps a production session
              until we delete it. <b>We delete your order’s session and its files when your order closes</b>, within 7
              days of delivery.
            </li>
            <li>
              <b>Resend (email):</b> sends our emails (sign-in codes, notices, replies; never your story). It keeps
              sent emails and their logs for 30 days.
            </li>
            <li>
              <b>Supabase (database and sign-in):</b> holds your account and the records above (no story text). On our
              current plan its technical logs are kept for 1 day and it makes no automatic backups; on a paid plan,
              backups and logs are kept for up to 7 days.
            </li>
            <li>
              <b>Cloudflare (file storage R2, spam check Turnstile):</b> holds your order’s files until we delete them;
              deleting is permanent.
            </li>
            <li>
              <b>Razorpay (payments, later):</b> keeps payment and identity records as Indian payment rules (RBI)
              require. Its privacy policy gives no fixed period.
            </li>
            <li>
              <b>Vercel (website hosting):</b> runs the website and keeps short technical logs.
            </li>
          </ul>

          <h2>5. Proof of deletion</h2>
          <p className={c.text}>
            When your order’s files are deleted, we email you a deletion certificate: what we deleted and when, what we
            deleted at ElevenLabs and Anthropic (with dates), and what each provider may still keep under its own policy,
            as listed above.
          </p>

          <h2>6. Your rights</h2>
          <p className={c.text}>
            Under India’s Digital Personal Data Protection Act, 2023, you may ask what we hold about you, correct it,
            have it erased (except records the law makes us keep), and withdraw a consent. Withdrawing consent stops
            further work on your order; it doesn’t undo work already done.
          </p>

          <h2>7. Contact and grievances</h2>
          <p className={c.text}>
            Write to us{" "}
            {legal.contact_email || contact ? (
              <>
                at <a href={`mailto:${legal.contact_email || contact}`}>{legal.contact_email || contact}</a>
              </>
            ) : (
              "through the contact address on the jambuch.in home page"
            )}
            . We reply within 7 days and settle a grievance within 30 days.
          </p>

          <p className={c.apart}>
            <Link href="/creators">← Back to Creator’s Space</Link>
          </p>
        </section>
      </main>
    </>
  );
}
