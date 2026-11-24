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

### Other Anthropic items

| Question | Answer | Source |
|---|---|---|
| Files API | "Files retained until explicitly deleted or they reach their configured expiration." Not used. | api-and-data-retention page |
| Client commercial use of outputs | To record (§2 item 2). | |
| Separate client key | `ANTHROPIC_API_KEY` in Vercel Production (Creator's Space). Confirm it belongs to a separate client workspace (§2 item 9). | |

Prices are not kept here: settings row `creators.claude_prices`.

## ElevenLabs

To record: client commercial use on our plan; history and voice-sample retention;
deletion API (history items, uploaded voices).

## Image model

To record: which model, client commercial use, retention, deletion.

## Music and sound effects

To record per source: licence, whether it covers clients' online and offline
publishing, and whether it covers film, TV, cinema and games (it usually doesn't:
that is the music replacement add-on, brief §3 and §14 item 9a).

## Razorpay, Resend, Supabase, Cloudflare R2, Vercel

To record: what each keeps, where, and for how long (privacy policy, §2 item 6).
