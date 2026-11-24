# Licences and provider data retention (Creator's Space)

Required by docs/CREATORS_SPACE_BRIEF.md §2 items 2, 7 and 8, and §14 items 3–4.
For each provider: may we deliver its output to paying clients, how long it keeps
what we send, and whether its API can delete it. The deletion certificate (§6B) and
the privacy policy must match what is written here. Record the date and the source
of every line.

## Anthropic (Claude API)

Checked 24 Nov 2026.

| Question | Answer | Source |
|---|---|---|
| Normal Messages API: are prompts and outputs kept? | Not by default, for the models we use (Opus 5.5, Sonnet 5.5, Haiku 5.5). "Covered Models" (Fable / Mythos family) need 30-day retention; we don't use them. | https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention.md |
| Exceptions | Content flagged by Anthropic's automated safety systems may be kept up to 2 years, and data may be kept where the law requires it, even under zero data retention. | same |
| Batch API (§6G, not in use) | Requests and results stored up to 29 days from batch creation. Not eligible for zero data retention. | https://platform.claude.com/docs/en/build-with-claude/batch-processing.md |
| Can a batch be deleted? | `DELETE /v1/messages/batches/{id}` exists, once the batch has ended (cancel first if running). **Open:** does it remove the stored requests and results, or only the listing? Confirm before §6G is switched on. | same (summary of the page; check the API reference) |
| Files API | Kept until deleted or expired. Not used. | api-and-data-retention page |
| Zero data retention | Per organisation, on request to Anthropic sales; covers the Messages API, not Batch, Files or Managed Agents. | api-and-data-retention page |
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
