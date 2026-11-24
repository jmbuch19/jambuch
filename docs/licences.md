# Licences and provider data retention (Creator's Space)

Required by docs/CREATORS_SPACE_BRIEF.md §2 items 2, 7 and 8, and §14 items 3–4.
For each provider: may we deliver its output to paying clients, how long it keeps
what we send, and whether its API can delete it. The deletion certificate (§6B) and
the privacy policy must match what is written here. Record the date and the source
of every line.

## Anthropic (Claude API)

Read on **24 Nov 2026**. Quotes are copied word for word from the pages named.

### Our account type
A standard self-serve Console account for the Anthropic API, with **no zero data
retention (ZDR) agreement** and no other special agreement. We use Opus 5.5,
Sonnet 5.5 and Haiku 5.5, which are **not** "Covered Models".

### Conclusion: what applies to us
**Assume Anthropic keeps our API inputs and outputs for up to 30 days.** The
privacy article below is the one written for "the Anthropic API", and it gives 30
days as the standard. The developer docs say conversation content "is not retained
by default", but that sentence is a general design commitment. It doesn't name our
account type, and the same page sends standard (non-ZDR) customers to the privacy
article for "standard retention policies". The two pages don't reconcile this, so we
use the longer figure (30 days) and never claim less in the certificate or the
privacy policy. ZDR, which stores nothing after the response, applies **only with
a ZDR agreement**, and we don't have one. To get a definite answer, ask Anthropic
support. Until then, this conclusion stands.

### Standard retention (applies to our account)
Source: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
(article dated July 1, 2026).

> "This article is about our commercial products such as Claude for Work and the
> Anthropic API."

Under "Standard Retention Timeframe":

> "For Anthropic API users, we automatically delete inputs and outputs on our
> backend within 30 days of receipt or generation, except:
> - When you use a service with longer retention under your control (e.g. Files API)
> - When you and we have agreed otherwise (e.g. zero data retention agreement)
> - If we need to retain them for longer to enforce our Usage Policy (UP)
> - In compliance with the law"

Under "Usage Policy Violations":

> "We retain inputs and outputs for up to 2 years and trust and safety
> classification scores for up to 7 years if your chat is flagged by our automated
> trust and safety systems as violating our Usage Policy."

### What the developer docs say
Source: https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention.md
(canonical: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention;
no page date shown).

Intro:

> "For Anthropic’s standard retention policies outside these arrangements, see the
> commercial data retention policy and the consumer data retention policy."

Under "How Anthropic approaches data retention" (a list of design commitments; not
under the ZDR heading):

> "Only what is technically necessary for the feature to work is retained.
> Conversation content (your prompts and Claude’s outputs) is not retained by
> default; the exception is Covered Models, which require 30-day retention."

Under "Zero data retention (ZDR)" (applies only with a ZDR agreement):

> "Under a ZDR arrangement, Anthropic does not store customer prompts or responses
> at rest after the API response is returned."

Under "Retention regardless of arrangement":

> "Even with ZDR or HIPAA arrangements in place, Anthropic may retain data where
> required by law or where it has been flagged by Anthropic’s automated trust and
> safety systems. As a result, if a chat or session is flagged, Anthropic may retain
> inputs and outputs for up to 2 years."

### Batch API (brief §6G, not in use)
Source: the "Platform features" table on the api-and-data-retention page above.
Row "Batch processing" (`/v1/messages/batches`): Legacy ZDR eligible "No"; details:

> "29-day retention; async storage required."

Same page, FAQ:

> "Features marked “No” for ZDR are fundamentally stateful: the Batch API stores
> your jobs, the Files API stores your files, and code execution runs in persistent
> containers."

- So batch (29 days from creation) is about the same as our standard 30 days. The
  difference is that it is stored data we can see and, possibly, delete.
- **Deleting a batch: open.** The batch-processing page
  (https://platform.claude.com/docs/en/build-with-claude/batch-processing.md) was
  only read in summary for this point. That summary describes
  `DELETE /v1/messages/batches/{batch_id}` "at any time after processing", but
  doesn't say what it removes. Before §6G is switched on, confirm in the API
  reference, and quote it here.

### Managed Agents (brief §6F; Test 6 list)
Source: the "Managed Agents features" table on the api-and-data-retention page;
also https://platform.claude.com/docs/en/managed-agents/overview.md.

> "Not eligible for ZDR, except for self-hosted Managed Agents. Sessions are
> stateful resources; transcripts persist until you delete them."

Overview page, "Beta access":

> "You retain control over this data: you can delete sessions, and separately delete
> any files you uploaded, at any time through the API."

| Item | Retention |
|---|---|
| Session transcripts / event history (hosted) | **Kept until we delete them**. The docs give no time limit, so every session must be deleted when its job ends. |
| Session logs beyond the transcript, sandbox/container files, and what remains after a session is deleted | **Unknown.** Not stated on the pages read (24 Nov 2026). This is the Test 6 open item: ask Anthropic, or check the session-operations and events-and-streaming pages, and record the answer here. |
| Flagged content | Up to 2 years (the "regardless of arrangement" rule above). |

**Our rule (brief §6B):** delete each order's Managed Agents session, and any files
uploaded for it, through the API at order close, within 7 days of delivery. Log it
(session id, time, API response).

### Training (checked 24 Nov 2026)
Source: https://www.anthropic.com/legal/commercial-terms (effective Jun 17, 2025),
"B. Customer Content":

> "Anthropic may not train models on Customer Content from Services."

Source: https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training
(dated August 18, 2026):

> "By default, we will not use your inputs or outputs from our commercial products
> (e.g. Claude for Work, Anthropic API, Claude Gov, etc.) to train our models."

Exception: feedback or bug reports we send them, or if we opt in. We do neither.

### Other Anthropic items

| Question | Answer | Source |
|---|---|---|
| Files API | "Files retained until explicitly deleted or they reach their configured expiration." Not used. | api-and-data-retention page |
| Client commercial use of outputs | To record (§2 item 2). | |
| Separate client key | `ANTHROPIC_API_KEY` in Vercel Production (Creator's Space). Confirm it belongs to a separate client workspace (§2 item 9). | |

Prices are not kept here: settings row `creators.claude_prices`.

## ElevenLabs

Read on **24 Nov 2026**. Our account: a paid self-serve plan, not Enterprise. Quotes
are from the pages named; the fetch tool converts page text, so check a sentence
against the live page before using it in client-facing text.

### Conclusion
- **Retention: no fixed period.** History (the text we send and the audio made) is
  kept until we delete it. "Up to 30 days" is **not** supported.
- **Training: yes, by default.** ElevenLabs uses content to improve its models
  unless the account's "Improve the models for everyone" setting is off. Even with
  it off, its terms keep a wide licence over content.
- **What we do:** keep that setting **off** in the client account; delete every
  history item (and any order voice) through the API at order close, and log it
  (brief §6B).

### Quotes
Help article "Is my data used to improve ElevenLabs’ AI models?"
(https://elevenlabs.io/docs/help-center/legal/is-my-data-used-to-improve-eleven-labs-ai-models, no date):

> "ElevenLabs uses certain data you provide to us to improve the quality of our
> audio models for everyone."

> "By default, we don’t train on any data from our Enterprise customers, other than
> as may be necessary to provide services to such Enterprise customers."

> "Once the toggle is disabled, new data you submit to us won’t be used to train
> our models."

Terms of use, outside the EEA (https://elevenlabs.io/terms-of-use, last updated
09 October 2026), "4(d) License to Your Content":

> "You hereby grant to ElevenLabs a license to use, reproduce, modify, adapt,
> publish, translate, create derivative works from, distribute, publicly or
> otherwise perform and display, and use your Content to provide the Services
> (including the trust and safety features therein), to improve the Services, and
> to develop new services and products."

"4(i) Data Deletion and Opt Out":

> "you may opt out of our use of your Content for training at any time by
> navigating to the 'Data use' menu in the 'Terms and Privacy' section of your
> ElevenLabs account. Your Content will no longer be used to improve our Services
> (including the Models) once the request has been processed by our team, except as
> may be necessary to provide the Services to you, but does not affect any uses of
> (or materials resulting from uses of) your Content prior to that date."

Privacy policy (https://elevenlabs.io/privacy-policy, updated 9 October 2026),
"6. Data Retention":

> "We generally keep your personal information for as long as necessary to provide
> you with our Services or as otherwise required or permitted by law or to protect
> our rights."

Help article "What happens to my content after my subscription ends?" (no date):

> "The content you generated will also remain accessible to you for an unspecified
> amount of time."

API, "Create speech" (https://elevenlabs.io/docs/api-reference/text-to-speech/convert.md),
query parameter `enable_logging`:

> "When enable_logging is set to false zero retention mode will be used for the
> request. This will mean history features are unavailable for this request,
> including request stitching. Zero retention mode may only be used by enterprise
> customers."

Deletion endpoints: `DELETE https://api.elevenlabs.io/v1/history/{history_item_id}`
("Delete a history item by its ID") and `DELETE https://api.elevenlabs.io/v1/voices/{voice_id}`
("Deletes a voice by its ID"); both answer `"status": "ok"`.

Still to record: client commercial use on our plan (brief §2 item 2). The terms say
a paid user "may use the Services for commercial purposes".

## Image model

To record: which model, client commercial use, retention, deletion.

## Music and sound effects

To record per source: licence, whether it covers clients' online and offline
publishing, and whether it covers film, TV, cinema and games (it usually doesn't:
that is the music replacement add-on, brief §3 and §14 item 9a).

## Resend (email)

Read on **24 Nov 2026**. Pricing page (https://resend.com/pricing), "Data retention"
row ("Search your emails and logs to debug or troubleshoot deliverability issues"):
Free **30 days**, Pro **30 days**, Scale **30 days**, Enterprise "Flexible".

DPA (https://resend.com/legal/dpa, updated 2025-12-31), Exhibit A:

> "When the Customer terminates their use of the Services, we delete their
> user/customer data within 90 days of the account termination."

The data covered: "At a minimum, this includes metadata, email address and message
content." **No API to delete a sent email** was found; deletion is by request to
support@resend.com. Resend can turn off message-content storage (a $50/month add-on
for Pro or Scale teams that meet its conditions).

**For us:** every studio email (which carries the story) stays at Resend for 30 days.
Moving the story out of the email (open note in `docs/PROGRESS.md`) would fix this.

## Supabase (database and sign-in)

Read on **24 Nov 2026**. **Our plan: Free** (organisation "jambuch.in", checked
through the Supabase connector).

| Item | Free (ours) | Pro | Source |
|---|---|---|---|
| Automatic daily backups | none | last 7 days | https://supabase.com/docs/guides/platform/backups |
| API and database logs | 1 day | 7 days | https://supabase.com/docs/guides/telemetry/logs |
| Auth audit logs | 24 hours | 7 days | https://supabase.com/pricing |

> "Pro Plan projects can access the last 7 days of daily backups."

A deleted row can survive in a backup until that backup ages out; no page says so in
words. On Free there are no backups, so this doesn't apply now. Story text is never
stored in the database (brief §2 item 10).

## Cloudflare R2 (file storage) and Turnstile

Read on **24 Nov 2026**. Delete objects
(https://developers.cloudflare.com/r2/objects/delete-objects/):

> "Deleting objects from a bucket is irreversible."

Object lifecycles (https://developers.cloudflare.com/r2/buckets/object-lifecycles/):

> "Objects will typically be removed from a bucket within 24 hours of the
> `x-amz-expiration` value."

No versioning or default backup of objects was found. No timeline for a manual
delete is published. We delete through the API ourselves, and the deletion record
logs it.

## Razorpay (payments; not live yet)

Read on **24 Nov 2026**. Privacy policy (https://razorpay.com/privacy/, effective
February 23, 2026), section 3:

> "We may collect and store your Sensitive Personal Data or Information—such as
> financial information, including credit card details, debit card details, bank
> account information, and Know Your Customer ("KYC") documents as required by RBI
> regulations"

**No retention period is published.** Ask dpo@razorpay.com before live payments
(brief §14 item 5) and record the answer here.

## Vercel (hosting)

To record: what runtime logs it keeps and for how long, on our plan.
