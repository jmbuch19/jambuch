# Creator's Space — progress

## 24 Nov 2026 — safeguards before any Claude work (branch `creators-space`)

Built (brief §6A "Safeguards", §7A "Screening"):
- `/creators/start`: sign-in with an emailed code → details + story (Turnstile) →
  limits (3 open, 5 a day) → screening (Haiku) → story-specific questions (Opus) →
  answers → style tags → email to the studio. The old email-only form is gone.
- `src/lib/creators/claude.ts` (screening, questions, tags), `vocabulary.ts` (the only
  style words allowed into generation prompts), `delivery.ts` (finished mixes only,
  15-minute signed links; not wired to a page yet: no orders exist).
- `/admin/creators`: list of requests, Close / Refuse.
- Table `creator_requests` (migration `20261124000000_creator_requests.sql`): no story text.

Before it works live (Jaydeep):
1. ~~Run the migration SQL in the Supabase SQL editor.~~ Done 24 Nov 2026 (verified live).
2. ~~Supabase → Authentication → Email templates → "Magic Link": add the code,
   e.g. `Your code: {{ .Token }}`, so the email carries a code as well as the link.~~
   Done 24 Nov 2026 (template shows link + code).
3. Vercel env: `ANTHROPIC_API_KEY` (the client key for Creator's Space). Without it
   the page says requests are paused and calls nothing.

Not built yet: Jaydeep approving a `needs_human` request so the writer can continue
(for now he replies by email); the vocabulary must grow with the asset library.

## 24 Nov 2026 — licence scope and music replacement

- Brief: "Where the work may be used" (§3), music replacement add-on, question 1b in
  §3B ("Will this be shown at a film festival, on TV or in a cinema?"), terms tick 11
  and the "anywhere" line narrowed (§7), disclaimer 16 (§7B), exception in §6A, data
  fields (§11), open item 9a (§14: price and cleared music sources).
- Built: required question on /creators/start; "Yes" sets `music_replacement` on the
  request, puts "(music replacement)" in the email subject and a flag in admin;
  "Not sure" is noted in the email. Licence line on the /creators landing page.
- Jaydeep: run `20261124100000_creator_requests_big_screen.sql` in the SQL editor
  before this branch goes live (the form writes the new columns).
