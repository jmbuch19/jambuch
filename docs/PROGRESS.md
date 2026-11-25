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
- ~~Jaydeep: run `20261124100000_creator_requests_big_screen.sql` in the SQL editor
  before this branch goes live.~~ Done 24 Nov 2026 (verified live).

## 24 Nov 2026 — consent ticks

- Brief §7 rewritten: four separate unticked boxes at story submission (terms +
  refund, rights and origin, data processing, 18+) under a 5-line summary; later
  ticks (own voice, publication choice, plan as baseline, deletion before download).
  Jaydeep confirmed the sample stays free (the "₹499 deducted" line was not used).
- Built: `src/lib/creators/terms.ts` (EN/GU/HI texts, TERMS_VERSION 2026-11-24),
  ticks with a language switch on /creators/start (send disabled until all four),
  server re-check, rows in `creator_consents` before any AI call, full terms at
  /creators/terms (#en #gu #hi #refund #licence), consent column in admin.
- ~~Jaydeep: run `20261124200000_creator_consents.sql` in the SQL editor before this
  branch goes live.~~ Done (verified live 24 Nov 2026). Check the Gujarati and
  Hindi wording.

## Open note (24 Nov 2026) — story copy in the studio email

The data-processing tick promises the story "is deleted 7 days after delivery",
but every request emails Jaydeep the full story, and that copy stays in his inbox.
Options: (a) store the story privately in R2 with automatic 7-day deletion and
email only a link, or (b) Jaydeep deletes those emails himself. Jaydeep: "not
right now" — decide before the branch goes live.

Still open before going live: check the
Gujarati/Hindi wording; first live test of the Claude calls (nothing has run yet);
replace the draft style words in vocabulary.ts with the real asset-catalog ids
(asset_usage shows ids like music-apsara, sfx-armour-on; catalog is on the home PC);
merge `creators-space` into main.

## 24 Nov 2026 — batch mode planned for later (brief §6G)

- Brief: §6G batch mode for full-production Claude steps, LATER (Phase 3, after the
  first 50 orders); §6C rule 11 (every production step is a queued job with a mode);
  §5 per-step `batch` flag, all off at launch; 2-hour timeout then real-time rerun;
  worst case about 13 hours for 6 chained steps; batch deletion + logging rule;
  retention added to §2 item 7, §6B certificate, §14 item 4.
- Checked on Anthropic's pages: batch = 50% (combines with caching), results kept
  29 days, not zero-data-retention eligible. (Corrected below: the normal API is
  NOT "nothing by default" for our account.) Open: does
  `DELETE /v1/messages/batches/{id}` remove the stored data?
- New `docs/licences.md` (Anthropic filled in; other providers to record).
- Claude prices go in the settings table, not the brief or code: Jaydeep runs
  `20261124300000_settings_claude_prices.sql` (key `creators.claude_prices`).

## 24 Nov 2026 — Anthropic retention, quoted (correction)

- `docs/licences.md` now quotes Anthropic word for word, with links and the date.
- **Correction:** for our account (standard self-serve API, no zero data retention
  agreement) assume Anthropic keeps inputs and outputs **up to 30 days**: its
  privacy article for API users says so. The docs' "not retained by default" line
  is a general commitment, and that page sends non-ZDR customers to the privacy
  article. Earlier notes saying "nothing by default" were wrong; the brief (§2
  item 7, §6B, §6G) is fixed. Ask Anthropic support for a definite answer.
- Managed Agents: hosted session transcripts are kept until we delete them; session
  logs, container files and what remains after deletion are unknown (Test 6 list).
- Consequence: the data-processing tick says the story "is deleted 7 days after
  delivery". The consent text and privacy policy must say providers may keep data
  longer under their own policies (up to 30 days for Anthropic), with a new
  TERMS_VERSION, before launch.

## 24 Nov 2026 — data tick reworded, privacy policy, provider deletion

- Data-processing tick reworded (EN/GU/HI), TERMS_VERSION `2026-11-24.2`. The
  proposed sentence about providers' 30-day limit and no training was LEFT OUT:
  ElevenLabs has no fixed period (history kept until deleted) and trains by
  default unless "Improve the models for everyone" is off. Anthropic supports both.
- New privacy policy at /creators/privacy (linked beside the ticks and from the
  terms); grievance contact = site_text `footer.email`.
- Brief §6B: ElevenLabs history and order voices deleted through the API at order
  close; Managed Agents session and files deleted at order close (within 7 days);
  every provider deletion logged; new deletion-certificate text.
- docs/licences.md: ElevenLabs, Resend (30 days), Supabase (we're on Free: no
  backups, 1-day logs), R2 (delete is irreversible), Razorpay (no period published).
- Jaydeep, before the first real order: (1) switch OFF "Improve the models for
  everyone" in the client ElevenLabs account; (2) delete studio request emails
  when a request closes (the privacy policy promises it); (3) ask Razorpay's DPO
  for its retention period.
- Done 24 Nov 2026: `creators.claude_prices` setting is live (Opus, Sonnet, Haiku 5.5;
  checked 2026-11-24; batch multiplier 0.5), verified in the database.

## 24 Nov 2026 — વાર્તા વિશ્વ – Story Tube page (/vartavishva)

- Brand page for the YouTube channel @Vartavishva-Storytube at /vartavishva: logo,
  name, tagline, welcome text, newest videos from the channel's public feed (hourly,
  no API key), Ramayana playlist/Spotify, "Get your story made" → jambuch.in/creators,
  follow links. Always dark, with the logo's colours.
- Links and texts are site_text rows `vartavishva.*` (empty = default or hidden):
  ~~Jaydeep runs `20261124400000_site_text_vartavishva.sql`~~ Done 24 Nov 2026 (7 rows,
  verified live). Jaydeep: fill Instagram etc. in Admin → Site text.
- Domain: vartavishva.in (and .com) are free (24 Nov 2026). next.config.ts already
  shows /vartavishva when a visit arrives for vartavishva.in. After buying it: add the
  domain to the Vercel project, set DNS, then add the redirect
  jambuch.in/vartavishva → https://vartavishva.in and set the page's canonical URL.

## 24 Nov 2026 — Phase 2a: automatic audio samples (brief §6H)

- Story and brief now stored in private R2 at submission; the studio email carries
  only a link to /admin/creators/<id>. Resolves the "story copy in the studio email"
  open note for new requests (older emails: delete by hand). Privacy policy updated,
  TERMS_VERSION 2026-11-24.3.
- /admin/creators/<id>: story, answers, screening, sample settings (voice picker from
  the ElevenLabs account, model, daily cap 5, on/off), "Make sample", player, credits,
  "Approve and send". Writer listens at /creators/start (15-minute link + download).
- Pipeline (src/lib/creators/sample.ts): opening passage → Claude sound plan
  (vocabulary only) → ElevenLabs → Freesound CC0 → FFmpeg mix (watermark tag, ducked
  music, cues, -16 LUFS) → private R2. Mix tested locally (27.3 s, -16.1 LUFS).
- Daily job deletes request files when due.
- Jaydeep: run `20261124500000_creator_samples.sql`; then on a request page pick
  the narrator voice and make the first sample. Jyot's request (sent before stories
  were stored) has no stored story: ask him to send it again, or test with a new one.

## For tomorrow (office PC), 25 Nov 2026

1. DONE 25 Nov: `20261124500000_creator_samples.sql` run by user, verified live (9
   columns, index, `creators.sample` setting); `creators-space` merged into main
   (9d3d9ee), deployed Ready.
2. DONE: site_text vartavishva rows live (7).
3. DONE 25 Nov: Cloudflare records added (first as Proxied → 525 error; switched to
   DNS only). Vercel certificate issued; jambuch.in/vartavishva → vartavishva.in
   redirect (308) turned on in next.config.ts. Records must stay DNS only (grey cloud).
4. First automatic sample: open a submitted request in /admin/creators, pick the
   narrator voice in "Sample settings", press "Make sample", listen. Jyot's request
   has no stored story (sent earlier): ask him to send again, or test with your own.
5. New spec filed: `docs/CREATORS_QUESTION_FLOW.md`. Its section 14 lists six
   open points to decide before building it (first: ₹499 vs free sample).
