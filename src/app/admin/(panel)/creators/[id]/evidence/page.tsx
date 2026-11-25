import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { readPlan } from "@/lib/creators/files";
import { CONSENT_TEXT, type ConsentKind, type ConsentLang } from "@/lib/creators/terms";
import { BY_ID } from "@/lib/creators/questions";
import type { Quote } from "@/lib/creators/pricing";
import { PlanView } from "@/app/creators/start/steps";
import a from "../../../../admin.module.css";

// Evidence for a bank dispute (chargeback) or a complaint, on one printable page: who agreed
// to what and when, the approved plan, the price, payments and refunds, and delivery. Print
// or save as PDF from the browser (Ctrl+P) to upload to Razorpay's dispute form.
export const dynamic = "force-dynamic";

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) + " IST" : "—";
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireAdmin();
  const { data: r } = await db.from("creator_requests").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();
  const [{ data: consents }, { data: payments }, { data: refunds }, { data: disputes }] = await Promise.all([
    db.from("creator_consents").select("kind, terms_version, language, accepted_at").eq("request_id", id).order("accepted_at"),
    db.from("creator_payments").select("kind, amount_paise, status, razorpay_order_id, razorpay_payment_id, created_at, paid_at").eq("request_id", id).order("created_at"),
    db.from("creator_refunds").select("amount_paise, reason, status, razorpay_refund_id, by, created_at").eq("request_id", id).order("created_at"),
    db.from("creator_disputes").select("razorpay_dispute_id, razorpay_payment_id, amount_paise, reason_code, status, respond_by").eq("request_id", id),
  ]);
  const plan = r.plan_version && !r.files_purged_at ? await readPlan(id, r.plan_version) : null;
  const quote = r.quote as Quote | null;
  const answers = (r.answers ?? {}) as Record<string, string | string[]>;
  const opt = (q: string) => {
    const v = answers[q];
    return typeof v === "string" ? (BY_ID[q]?.options?.find((o) => o.id === v)?.label.en ?? v) : "—";
  };

  return (
    <>
      <p className={a.crumb}>
        <Link href={`/admin/creators/${id}`}>← Request</Link>
      </p>
      <h1 className={a.title}>Evidence · Creator’s Space request</h1>
      <p className={a.intro}>
        Request {id} · created {when(r.created_at)} · state {r.state}. Prepared {when(new Date().toISOString())}. Print or save as
        PDF (Ctrl+P) for Razorpay’s dispute form.
      </p>

      <h2 className={a.gapTop}>1. The customer</h2>
      <p>
        {r.name || "—"} · {r.email} {r.whatsapp ? `· WhatsApp ${r.whatsapp}` : ""} · signed in by a one-time code sent to this email
        address.
      </p>

      <h2 className={a.gapTop}>2. What the customer agreed to</h2>
      <p className={a.mutedSmall}>
        Each box was ticked separately (none pre-ticked). The full terms for each version are at jambuch.in/creators/terms.
      </p>
      <ul>
        {(consents ?? []).map((c, i) => (
          <li key={i}>
            <b>{when(c.accepted_at)}</b> · terms version {c.terms_version} · shown in {c.language}:
            <br />“{CONSENT_TEXT[c.kind as ConsentKind]?.[c.language as ConsentLang] ?? c.kind}”
            {c.language !== "en" && CONSENT_TEXT[c.kind as ConsentKind] ? (
              <>
                <br />
                <span className={a.mutedSmall}>English (binding): “{CONSENT_TEXT[c.kind as ConsentKind].en}”</span>
              </>
            ) : null}
          </li>
        ))}
      </ul>

      <h2 className={a.gapTop}>3. Where the story came from (customer’s declaration)</h2>
      <p>
        Origin: {opt("origin")}
        {answers.permission ? ` · permission: ${opt("permission")}` : ""}
      </p>

      <h2 className={a.gapTop}>4. The approved plan and price</h2>
      <p>
        Plan version {r.plan_version || "—"} approved {when(r.plan_approved_at)} (with the “plan as baseline” tick above).
      </p>
      {quote && (
        <p>
          Fixed price {rupees(quote.total * 100)}: sample {rupees((quote.sample ?? 0) * 100)}, advance {rupees(quote.advance * 100)}, final{" "}
          {rupees(quote.final * 100)} · quoted {when(quote.made_at)}.
        </p>
      )}
      {plan ? <PlanView md={plan} /> : <p className={a.mutedSmall}>The plan text was deleted with the order’s files, as the terms promise.</p>}

      <h2 className={a.gapTop}>5. Payments and refunds</h2>
      <ul>
        {(payments ?? []).map((p) => (
          <li key={p.razorpay_order_id}>
            {p.kind} {rupees(p.amount_paise)} · {p.status} · Razorpay order {p.razorpay_order_id}
            {p.razorpay_payment_id ? `, payment ${p.razorpay_payment_id}` : ""} · {when(p.paid_at ?? p.created_at)}
          </li>
        ))}
        {(refunds ?? []).map((x, i) => (
          <li key={`r${i}`}>
            refund {rupees(x.amount_paise)} · {x.status} · {x.reason.replace(/_/g, " ")} · {x.razorpay_refund_id ?? "—"} · {when(x.created_at)}
          </li>
        ))}
        {!payments?.length && <li>No online payments.</li>}
      </ul>

      <h2 className={a.gapTop}>6. Delivery</h2>
      <ul>
        <li>Sample made: {when(r.sample_made_at)}</li>
        <li>Sample sent to the customer (email + signed-in page): {when(r.sample_sent_at)}</li>
        <li>Sample first opened by the customer: {when(r.sample_listened_at)}</li>
        <li>Files deleted after: {when(r.files_delete_at)}{r.files_purged_at ? ` (deleted ${when(r.files_purged_at)})` : ""}</li>
      </ul>

      {!!disputes?.length && (
        <>
          <h2 className={a.gapTop}>7. Disputes reported by Razorpay</h2>
          <ul>
            {disputes.map((d) => (
              <li key={d.razorpay_dispute_id}>
                {d.razorpay_dispute_id} on {d.razorpay_payment_id} · {d.status} · {d.reason_code ?? "—"}
                {d.amount_paise ? ` · ${rupees(d.amount_paise)}` : ""} · respond by {when(d.respond_by)}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
