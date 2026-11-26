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

## 25 Nov 2026 — the guided question flow (docs/CREATORS_QUESTION_FLOW.md), branch `creators-space`

Decisions (Jaydeep, recorded at the end of the spec): sample stays FREE; festival/TV/cinema
stops and waits for Jaydeep; build everything; paths stay `creators/<id>/`; tags from
vocabulary.ts.

Built (not live until merged):
- `src/lib/creators/questions.ts`: every question, EN/GU/HI, the cascade (`showIf`), stops,
  level presets. Wording can be changed there without touching logic.
- `/creators/start` is now one question per screen with a progress bar, a language switch,
  autosave (this browser before sign-in, the server after). Stage 0 has no Claude call; the
  18+ tick moved to sign-in; the old two-step form is gone.
- Story: paste, or upload .docx/.txt/.pdf (mammoth, unpdf; broken Gujarati/Hindi PDFs are
  caught and the writer is asked for Word or text); language detected in code; up to
  120,000 characters, split into ~20,000-character episodes the writer can move.
- Claude steps, each metered per request against `creators.flow.claude_cap_usd` (over the
  cap → waits for Jaydeep): screening (now also checks the declared origin), characters and
  setting (Haiku), look suggestions, follow-up questions (multiple choice + "you decide",
  max 2 rounds × 5, plus the pronunciation list), the creative plan (Opus, up to 3 changes,
  then "Let's discuss"), free sound/avoid words → tags.
- `src/lib/creators/firewall.ts`: the prompt firewall (clean, quote, flag instruction-like text).
- `src/lib/creators/pricing.ts`: the pricing engine (brief §5), settings `creators.pricing`;
  stage-0 price range, per-level prices, fixed quote per episode; prices end in 99, ₹999 minimum.
- Plan approval = `plan_baseline` consent → `submitted` → the existing free audio sample.
- Admin: list shows why a request waits, quote, Claude cost; request page shows choices, the
  writer's words, characters, Saathi's questions, pronunciation, episodes, pictures, plan,
  quote breakdown; "Let the writer continue"; "50% advance received" builds the order pack
  (`creators/<id>/order_pack.json`) until Razorpay exists; JSON editors for pricing and flow.
- Daily job: reminder on day 3, abandoned drafts withdrawn and deleted on day 14; purge now
  deletes everything under `creators/<id>/` (new `listPrivate` in r2.ts).

Before it can go live (Jaydeep):
1. Run `20261125000000_creator_flow.sql` in the SQL editor (states, `answers` etc., the
   `creators.pricing` and `creators.flow` settings). Then Claude verifies and merges.
2. Check the Gujarati and Hindi wording in questions.ts and steps.tsx.
3. Set the pricing assumptions in /admin/creators: ₹ per $ (85), review hours per level,
   render ₹/minute, motion clip credits, add-on prices, Hindi/English characters per minute.
4. Voice notes are built but OFF (`creators.flow.voice_notes`): each note costs ElevenLabs
   credits. Switch on only when you agree to the cost.

Razorpay (added the same day; LIVE keys RAZORPAY_KEY_ID / _KEY_SECRET / _WEBHOOK_SECRET are
in Vercel, Production): after the free sample is sent, the writer sees "Approve the sample and
pay the 50% advance" on /creators/start → Razorpay checkout → signature checked → Razorpay
asked that the full amount was paid → order pack built, request `ordered`, emails to writer and
studio. Webhook /api/razorpay/webhook (order.paid, payment.captured, payment.failed) does the
same if the page was closed; repeats are harmless. Table `creator_payments` (in the same
migration). **Switched OFF** (`creators.flow.payments_enabled` false) until brief §2 is done:
Vercel Pro, GST answer from the CA, Razorpay KYC as an individual seller, one full test order.
"50% advance received" in admin stays for payments outside Razorpay.

Not built (needs a decision or something outside the code): the final 50% payment (needs the
production preview and clean download, Phase 2+); GST invoices (GST_ENABLED); the 15-second example clips (slot: `creators.flow.examples`); own-voice
recording upload (the add-on is asked; the recording is requested after the sample); test
pictures with the sample (the sample is audio only, Phase 2a).

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

## 25 Nov 2026 — pricing uses the day's USD→INR rate (no fixed ₹85)

Jaydeep: a fixed rupee rate is wrong practice. Now:
- `src/lib/fx.ts`: the daily job fetches USD→INR (Frankfurter / ECB reference rate, then
  open.er-api.com) into settings `fx.usd_inr` {rate, date, source}. A missing, absurd (outside
  ₹50–200) or >8% jump is refused: yesterday's rate stays and the admin gets an email.
  First use fetches it if none is stored. 25 Nov rate: ₹92.92 (was assumed ₹85).
- Pricing keeps dollar costs in dollars: `credit_usd_per_1000` (ElevenLabs Pro $99/600k =
  0.165), `render_usd_per_minute`, `other_flat_usd`, Claude prices; converted with the day's
  rate × (1 + `fx_markup`, default 0.0413 = card 3.5% + 18% GST on it). Only Jaydeep's own
  prices (hourly, minimum, add-ons) are in rupees. Retired keys (`inr_per_usd`,
  `credit_inr_per_1000`, `render_inr_per_minute`, `other_flat_inr`) are ignored and dropped on save.
- Each quote stores the rate it used (shown in admin). Example 12-min story: Standard
  ₹2,799 → ₹2,999 at today's rate.
- Jaydeep to set: `fx_markup` to his card's real forex charge.

## 25 Nov 2026 — fixed running costs in every price

- Settings `fixed_costs` (name, amount, USD/INR, month/year, share) and
  `expected_orders_per_month`; their monthly total (dollars at the day's rate + card markup)
  ÷ expected orders is added to each price as a cost (not doubled).
- Jaydeep's figures: Vercel Pro $20/month (share 1), Claude Pro $20/month (share 0.5,
  shared with his other projects), 5 orders a month → ₹2,903/month, ₹581 per order.
  ElevenLabs is prepaid for 12 months and already priced per credit; Claude API tokens are
  priced per order: neither is listed (would count twice).
- Each quote records the gateway fee and "left for you" (review time + margin, before GST
  and income tax). 12-min story: Basic ₹1,699 (left ₹814), Standard ₹3,599 (left ₹2,264),
  Premium ₹6,899 (left ₹5,131).


## 25 Nov 2026 — paid ₹499 sample, automatic sample + check, fix-it flow (branch, NOT live)

Jaydeep changed the sample to paid (₹499) and asked for step 1 of the hands-off pipeline.
- Flow: plan approved → state `sample_due` → ₹499 (Razorpay, or admin "received outside
  Razorpay") → `submitted` → /api/creators/sample-job (FFmpeg shipped with it) makes the
  sample → automatic check (20–90 s, −19…−13 LUFS, ≥60% of the passage's words heard back by
  ElevenLabs speech-to-text) → sent. A failed check is made once more; a second failure, no
  voice chosen or samples off waits for Jaydeep (the writer is told it takes a little
  longer). The daily cap defers to the daily job, which also restarts paid samples not made.
- Quote: `sample` (₹499, setting `sample_fee_inr`) counted toward the advance:
  sample + advance + final = price. Every "free sample" text replaced (landing, terms,
  summary ticks EN/GU/HI, home band, vartavishva, flow, emails); TERMS_VERSION 2026-11-25.1.
- Fix-it flow: fixable screening categories (lyrics, copied text, real-person harm, hate,
  mockery, violence/self-harm/dangerous detail, propaganda, misleading claims) get Opus
  suggestions that remove the problem (no disguises, no limits stated), the story editable on
  the page, and up to 3 re-checks; then the polite fresh-idea page. Sexual content, harm to
  children or 3 failed re-checks → that page at once. Unsure with no category → Jaydeep.
  The writer gets an email the first time.
- Review rule in settings (`creators.flow.review`); each order pack records
  `review: jaydeep | audit | auto`.
- Launch list (brief §2) gains: lawyer-checked terms (required), the move to vartavishva.in
  and Razorpay verifying that site.

Before merge (Jaydeep): run `20261125200000_creator_sample_fee.sql` (state `sample_due`,
payment kind `sample`, columns `sample_qc`, `rechecks`). Check the new Gujarati/Hindi lines.

## 25 Nov 2026 — shared sound library (site side built; waits for the home PC's export)

Jaydeep: one shared library = the engine's asset cards (private engine repo, home PC owns
it; this PC reads its clone at D:\jambuch-audio-pilot read-only and never commits there; the
card docs are never copied into this public repo).

**Handover the site expects (home PC, step 1):** in the private R2 bucket,
`media/assets/catalog.json` = `{ "exported_at": "...", "cards": [ ...cards ] }` holding ONLY
music and sfx cards with status `client-ready` and client_use `yes` or `yes-online`, same
fields as the card files (id, kind, file, source, licence, client_use, attribution, status,
mood_tags, instruments, energy, type, setting, use, length_s, prompt), with each audio file at
`card.file` (media/assets/<kind>/<id>.mp3) in the same bucket. The site re-checks the
licence rules on its side (NonCommercial never; CC BY only with an attribution line).

Built (`src/lib/creators/library.ts`, used by the sample):
- Picks music by the site's style words → card instruments and mood_tags; effects by words in
  the card id, type, setting and prompt. Order: match, not used by the last 20 orders, score
  (`asset_scores`), then a seed per request. Every placed sound is logged in `asset_usage`
  (source `order`, role `sample-bed` / `sample-cue`).
- Freesound only when the library has nothing for a word: CC0 first, CC BY with an automatic
  credit line (shown to the writer under the sample and in admin), NonCommercial or
  Sampling+ never.
- The spoken "Creator's Space sample" tag is made once per voice, model and language
  (`creators-shared/sample-tags/...` in private R2) and reused.
- Admin shows the library size and the style words with no client-safe sound.

Coverage check against the cards on engine-split (4ade09a): today 0 client-safe (the 22
Freesound CC0 cards are still `trial`); once the ElevenLabs cards are `yes-online`, 129 sounds
cover every music word and mood and every effect word except **door, market, train** → step 2
is 2 CC0 Freesound sounds each for those three (6 for Jaydeep's approval), after the export.

## 25 Nov 2026 — refunds, disputes, payment checks, timeouts that cost nothing (branch)

Jaydeep's decisions: undelivered ₹499 sample → automatic full refund after 3 days; late full
orders → case by case; sample missing the approved plan → one free remake; build all four.
- **One-click refund** (admin request page, beside each paid payment): amount (full by
  default, never more than is left), reason, confirm tick; Razorpay Refunds API; one refund in
  flight per payment (unique index); writer emailed; table `creator_refunds`.
- **Payment checks** (daily job, `payment-checks.ts`): orders Razorpay says are paid but we
  never recorded are completed; extra captured payments on one order, or the same thing paid
  through a second order, are refunded automatically (`auto:duplicate-*`); a ₹499 paid >3 days
  ago with no delivered sample is refunded and the request closed (`auto:sample-not-delivered-3d`).
- **Disputes:** `payment.dispute.*` webhook events → `creator_disputes`, studio emailed with a
  link to `/admin/creators/<id>/evidence` (consents with exact text, terms version and time;
  origin; approved plan and time; quote; payments and refunds; sample made / sent / first
  opened). Print to PDF for Razorpay.
- **Free remake** button (once; `sample_remakes`): a fresh sound plan and a fresh voice.
- **Timeouts cost nothing twice:** the sound plan, the narration and the speech-to-text result
  are stored under `creators/<id>/work/` the moment they arrive (deleted with the request);
  retries reuse them. A voice our side timed out on is fetched from ElevenLabs' history instead
  of being paid again. Free steps (music, effects) run before the paid voice. A retry after a
  failed check happens only for a words-heard failure (with a new recording); at most 3 paid
  voices per request, then Jaydeep decides.
- Terms 2026-11-25.3: automatic sample refund after 3 days, one free remake, duplicates refunded.

Before merge (Jaydeep): run `20261125300000_creator_refunds_disputes.sql`; in Razorpay →
Webhooks add the events `refund.processed`, `refund.failed` and the `payment.dispute.*` events
(created, won, lost, closed, under_review, action_required).

## 25 Nov 2026 — sample opening, title/author, pauses from the engine's rules

Bug (Jaydeep): the title was read as part of the story with no pause.
- Question flow: required **Title** and **Author name** beside the story (kept in the private
  draft; author prefilled from the writer's name). A first line that matches the title
  (letters and digits only) is left out of the narration. Admin can set both for older requests.
- Sample script (`src/lib/creators/script.ts`): opening "વાર્તા: <title>. લેખક: <author>."
  (Hindi "कहानी: … लेखक: …", English "Story: … Written by …"), then the story's opening split
  into segments (paragraphs; narration ↔ dialogue changes; scene breaks = *** or blank lines,
  depending on the text's own layout). Each segment voiced separately with previous/next text
  for intonation, cached per segment (retries free).
- Pauses are real silences added when joining (FFmpeg), never left to the voice; the music bed
  swells softly (0.22 → 0.5) in the silence after the opening; the end pause comes before the
  closing tag; loudness from the rules.
- **Rules come from the engine, not this site** (`src/lib/creators/rules.ts`): read from
  private R2 `media/rules/narration.json` (to be exported by the home PC from docs/narration.md
  and sound-guide.md):
  `{ "source": "...", "pauses": { "join": 0.3, "paragraph": [0.6, 0.8], "scene_break": [...],
  "dialogue_change": [...], "title": ..., "author": ..., "title_swell": ..., "end": ... },
  "loudness": { "video_lufs": -16 } }`. Until it exists, stand-ins are used and admin marks them.
- **Missing from the engine's narration.md on 25 Nov** (home PC to add): title (stand-in 1.5 s),
  author (1.0 s), opening music swell (2.0 s), scene break (1.5–2 s), dialogue speaker change
  (0.3–0.5 s), end before the closing card (2.0 s). Present: join 0.3 s (narration.md),
  paragraph 0.6–0.8 s (sound-guide.md "action runs tight"; quiet scenes 1.2–2 s).
- Later, camera and colour rules for videos come from the engine the same way.

### 26 Nov 2026: the sample follows the engine's sound guide §0 ("Sounds are the Souls of the Story")
- **Voice clear of the background:** the mix also writes two measuring stems (voice and
  music+effects, both masked to the moments the narration speaks; pauses may rise) and measures
  them with volumedetect. Under the `voice_clear` level (stand-in 10 dB) the background comes down
  by the shortfall + 1 dB and it is mixed once more (free); still short → the automatic check
  fails ("voice only N dB above the music and sounds"). Admin shows the value, the lowering and the
  effect counts.
- **Fades and levels on every effect:** each effect's gain comes from its own measured mean
  (target `cue_present`, stand-in −32 dB); soft sounds in 0.6 s / out 1.2 s, sharp ones (door)
  in 0.05 s / out 0.3 s. An effect after a line ends 0.25 s before the next line starts, and the
  pause after that line is at least `cue_hold` (stand-in 1.5 s), so the words wait for it.
- **Similes under the words:** the sound plan (Claude) marks a cue `place: "under"` with the
  likened sound's `word` when a sentence likens a voice or sound to a sound (any language; no
  word list is copied from the engine). The sound rises from that word (in 0.5 s), plays under the
  rest of the line at `simile_under` (stand-in −33 dB), not ducked, and fades out over 2 s after
  the line. No word found in the sentence → the cue plays after the line instead.
- **For the home PC's `media/rules/narration.json`:** also `"pauses": { "cue_hold": ... }` and
  `"levels": { "cue_present": -32, "simile_under": -33, "voice_clear": 10 }`.
