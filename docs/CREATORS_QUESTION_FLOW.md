# Creator's Space: the question flow (cascading brief)

Spec for Claude Code. Put this file at `docs/CREATORS_QUESTION_FLOW.md`, next to
`docs/CREATORS_SPACE_BRIEF.md`. It replaces nothing: it turns sections 3, 3A, 3B,
4 and 7C of the brief into one guided flow, and defines the **order pack** that the
production agent/worker receives.

Gujarati wording below is a first draft. **Jaydeep checks every Gujarati and Hindi
line before launch.**

---

## 1. Principles

1. **One question per screen on a phone**, with a progress bar ("Step 3 of 9").
   Most writers will use a phone, many are elders.
2. **Every question has a default or "Suggest for me".** Nobody gets stuck.
   "Skip if unsure" wherever a skip is safe.
3. **Each answer decides what comes next.** Questions that don't apply are never
   shown (that is the "cascade").
4. **Type or speak.** Every free-text answer accepts a voice note (transcribed,
   shown back for confirmation).
5. **Target time: 8–12 minutes** for a Standard order, including the follow-ups.
6. **Autosave the draft** after every answer (browser + server). The writer can
   leave and return. The story text itself is stored only in private R2, never in
   a database table.
7. **No AI cost before sign-in.** Stage 0 uses no Claude call. Claude is first
   called after sign-in (screening, character list, follow-ups).
8. **Writer text is a wish, never an instruction.** Free-text answers are turned
   into asset-library tags by Claude; raw writer text never reaches any music,
   sound, image or voice prompt (brief 6A safeguards).
9. **Same flow in Gujarati, Hindi and English.** The writer picks the language on
   the first screen; they can switch at any time.
10. **Everything feeds one creative plan.** The answers are not sent to the agent
    one by one. Claude turns them into the one-page plan; the writer approves it;
    the plan + story + choices become the order pack (section 9).

---

## 2. Stage 0: Before sign-in (no Claude calls, no cost)

**0.1 Language** · ભાષા
> In which language should we talk? Gujarati / Hindi / English

**0.2 Is your story ready?** · તમારી વાર્તા તૈયાર છે?
- Yes, it's written → continue
- I'm still writing it → "Come back when it's ready. Save this page." (end)
- I have an idea, not a written story → "We work from finished text. If you'd like
  help writing it, use Assisted mode later." (end, link to Assisted info)

**0.3 What would you like to make?** · તમે શું બનાવવા માંગો છો?
(Cards with a 15-second example each)
- Audio story (narration) · ઑડિયો વાર્તા
- Video with paintings (moving stills) · ચિત્રો સાથે વીડિયો
- Video with one picture · એક ચિત્ર સાથે વીડિયો
- Not sure, show me the levels → shows the 3 finish levels side by side

**0.4 About how long is your story?**
- A short piece (up to 1 page, under ~3,000 characters)
- 2–5 pages
- 6–10 pages
- Longer (we'll make it as episodes)

→ Shows **"Typical price: ₹… to ₹…"** from the pricing engine for that format
and length. This is a range only, not a quote.

**0.5 Sign in to continue** · આગળ વધવા સાઇન ઇન કરો
- Email → one-time code (Supabase OTP). Turnstile check.
- Tick: **"I am 18 or older."** (recorded with terms version + time)
- Limits enforced here: max 3 open requests per account, max 5 new per day.

---

## 3. Stage 1: The story

**1.1 Add your story** · તમારી વાર્તા ઉમેરો
- Paste text, or upload .docx / .txt / .pdf (Unicode text only).
- Live character count. Language detected and shown: "We see your story is in
  Gujarati. Is that right?"
- If the PDF text extracts badly: "Please upload a Word or text file."
- **Over 20,000 characters:** "We'll make this as a series of episodes."
  Claude proposes split points later (stage 6); the writer accepts them.
- Stored in private R2 only.

**1.2 Where does this story come from?** · આ વાર્તા ક્યાંથી આવી છે? (required, brief 7C)
- I wrote it myself → 1.2a
- It's my translation of someone else's work → 1.2b
- It's adapted or retold from another work → 1.2b
- It's a traditional/folk story or scripture retelling → 1.2c
- Someone else wrote it and gave me permission → 1.2b
- We wrote it together → 1.2d

1.2a **Your name as it should appear in the credits.** (prefilled from account)
1.2b **Original work:** title, author, (translator), publisher, year. Then:
  "Do you have permission from the rights holder?" Yes, in writing / The author
  died more than 60 years ago (public domain) / No →
  "No" = **stop**: "We can only make works you have the right to use." (end)
1.2c **Which tradition or text?** (e.g. Panchatantra, a folk tale from Kutch).
  If it's a specific modern published retelling → treat as 1.2b.
1.2d **Co-writers' names**, and a tick: "My co-writers agree to this."

**1.3 Consent ticks** (four separate unticked boxes, each recorded with terms
version + time; full text one click away; plain 5-line summary above)
1. Terms + Refund policy (summary: paid service; ₹499 sample deducted from full
   fee; 50% advance, 50% before download; files deleted 7 days after delivery;
   licensed for online and offline publishing, **not film, TV or cinema**).
2. "This story is mine or I have permission, and what I declared about its origin
   is true."
3. Data consent (current wording from the brief, terms version noted).
4. (Already ticked at sign-in: 18+.)

**Automatic screening runs now** (cheap Claude model, real time, writer waits a
few seconds): prohibited content, quoted song lyrics, real people named in a
harmful way, origin mismatch (e.g. "I wrote it" but text matches a famous work).
- Clear → continue.
- Refused → plain reason, no charge, end.
- Borderline → "We'll get back to you within 2 days" → `needs_human`.

---

## 4. Stage 2: Purpose and audience

**2.1 What is it for?** · આ શેના માટે છે? (pick up to 2)
- YouTube video → 2.1a
- Shorts / Reels / WhatsApp status → suggests vertical format + Shorts pack
- WhatsApp sharing with family/friends → suggests shorter length, small file
- Podcast / Spotify → suggests audio only
- Classroom or children → 2.1b
- Family or community gathering → suggests larger captions
- Festival, event or screening → **2.1c**
- Personal keepsake / in memory of someone → 2.1d

2.1a **Will you earn money from it on YouTube (monetise)?** Yes / No / Not sure
  (recorded; affects nothing in price, shown in credits/licence note)
2.1b **Age group:** under 8 / 8–12 / teenagers → sets gentler tone rules
  (avoid list pre-filled: no frightening images, no violence).
2.1c **Film festival, TV or cinema?** Yes / No
  Yes → "Our music licence covers online and offline publishing, but not film
  festivals, TV or cinema. We can replace the music with a broadcast-licensed
  track (add-on)." → flags `music_replacement` + `needs_human`.
2.1d **Dedication:** "In memory of …" (goes on the ending card, 6.4)

**2.2 Who will watch or listen?** · કોણ જોશે કે સાંભળશે?
- Children · Young people · Adults · Elders → if Elders: larger captions,
  slightly slower narration, high-contrast caption band (all automatic)
- A particular community (free text, optional)

---

## 5. Stage 3: The creation

**3.1 Finish level** · ગુણવત્તા સ્તર
Three cards with the same demo story at each level, and a typical price:
- Basic · સરળ
- Standard · સુંદર (default)
- Premium · શ્રેષ્ઠ (always Assisted)
→ prefills 3.2–3.6; changes later show "Custom".

**3.2 Service** · સેવા
- Self-serve (default) · Assisted (30-min consultation with Jaydeep; shows next
  available start date if this week is full)

**3.3 What they see** (prefilled by level; only if video was chosen in 0.3)
- Moving stills · Single image · Audio only
- Add Shorts pack? (only if video) 3 / 5 / No

**3.4 What they hear**
- Narration only · + background music · + music and sound effects

**3.5 Who speaks**
- One narrator reads everything
- Narrator + separate voices for characters → character voices are chosen in
  stage 6 (after Claude lists the characters)
- (Add-on) An exclusive narrator voice made only for you → +₹…
- (Add-on) My own voice → own-voice consent tick + upload recording (brief rules)

**3.6 How it's spoken**
- Plain reading (clear and steady)
- Dramatised (emotion, pauses, whispers; you approve the directed script)
- If character voices + plain reading → hint: "Character voices sound best
  dramatised."

**3.7 Second language?**
- No (default) · Yes → which: Gujarati / Hindi / English (not the story's own)
  → "You'll approve the translation before narration."

---

## 6. Stage 4: Text handling (required)

**4.1 Should we narrate your text exactly as written?** · લખાણ જેમ છે તેમ વાંચીએ?
- **Yes, exactly as written** (default)
- You may shorten or adapt it for video → 4.2

**4.2 Target length:** 3 / 5 / 10 / 15 minutes / Let the story decide
→ "Any change to your words is shown to you in the script for approval. Nothing
changes without your OK."

**Automatic check:** estimated narration length (from character count and
language) vs. any target. Conflict → the writer chooses in plain words:
"Your text will take about 14 minutes to narrate. You chose 5 minutes.
Should we (a) narrate it all (14 min), (b) shorten to about 5 min, or
(c) make it as 3 episodes?"

---

## 7. Stage 5: Feel and look

**5.1 How should it feel?** · કેવી લાગણી જોઈએ? (up to 3)
warm · devotional · suspenseful · funny · sad · inspiring · nostalgic ·
mysterious · calm · dramatic
(Each maps directly to mood tags; no free text needed.)

**5.2 Look and colour** · દેખાવ અને રંગ (video only)
- **Suggest for me** (default) → Claude reads the story + answers so far and
  shows 2–3 style + colour pairings, each with a one-line reason and a library
  example. Writer picks one or chooses freely.
- Choose myself → style cards (7) then colour cards (6), each with examples.
- Note under it: "With your ₹499 sample you'll see one test picture of your own
  story in up to two of these looks."

**5.3 Where and when does your story happen?** · વાર્તા ક્યાં અને ક્યારે બને છે?
Prefilled by Claude from the story ("A village in Saurashtra, 1950s, monsoon").
Writer confirms or edits. Skip allowed.

---

## 8. Stage 6: Characters and details

**6.1 Your characters** · તમારાં પાત્રો
Claude lists the characters it found (max = level's character limit), each
prefilled from the story. For each, the writer confirms or edits:
- Name · role (main / minor) · approximate age · look and clothing (free text,
  optional) · voice type (if character voices chosen): warm / deep / young /
  old / gentle / sharp + preview buttons from client-ready voices only.
- "This character is a real person" → tick → follow-up: "Is this person alive?
  Do you have their permission?" → No permission for a living person = they
  appear only as narration, never as a likeness (brief rule).
- Deities and sacred figures → follow-up: "Should we show their face, or only
  symbols (feet, hands, light, objects)?" Default: as the writer's tradition
  allows; writer decides.

**6.2 Sounds and music wishes** (only if music/SFX chosen)
Pick-list first, free text optional:
- Music feel: Indian classical (flute, sitar, santoor) · folk · devotional ·
  soft piano/strings · cinematic · minimal · no music in sad parts
- Sound effects: nature (rain, birds, wind) · village life · city · temple ·
  "only a few" · "rich and full"
→ Free text is converted to tags; artist/film/song names are ignored with a note:
"We can't use a specific artist's style, but we'll match the feel."

**6.3 Anything to avoid?** · શું ટાળવું? (optional)
Pick-list (no blood · no frightening images · don't show god's face · no
English words in narration · no Hindi words in Gujarati narration) + free text.

**6.4 Ending card** · અંતિમ પાનું (optional)
Closing line, dedication (prefilled from 2.1d), or your name/contact for the end.

**6.5 Your own pictures** (optional, video only)
Upload up to 5 of **your own** photos or sketches as guidance (e.g. the real
village, grandmother's photo for the general look).
Tick: "These are my own photos/drawings, or I have permission."
Never: film stills, other artists' work, celebrity photos. Never used to copy a
real person's exact face.

**6.6 Episodes** (only if over 20,000 characters)
Claude shows proposed split points with episode titles; writer accepts or moves
them.

**6.7 Anything else you'd like us to know?** (optional, type or speak)

---

## 9. Stage 7: Claude's follow-up questions (the cascade's last layer)

Claude (real time, Opus-class model) reads the story + all answers and asks
**only the questions whose answers would change the plan.**

Rules:
- **Max 2 rounds, max 5 questions per round.** Most orders need 0–3 questions.
- Every question is **multiple choice + "You decide for me"**; free text optional.
- Never ask what's already answered; never ask about price or terms.
- Claude may not promise anything outside the level, format or engine limits
  ("what we can't do" list).
- If the writer picks "You decide" for everything, that's fine: the plan records
  Claude's choices for approval.

Typical triggers and example questions:
| Trigger in the story/answers | Example question |
|---|---|
| Two narrators or a frame story | "Your story has a grandmother telling a story inside the story. Should she have her own voice, different from the main narrator?" |
| Dialogue in a dialect | "Some lines are in Kutchi. Should the narrator read them in Kutchi style, or in standard Gujarati?" |
| A sad or open ending | "The story ends on a sad note. Should the music fade to silence, or end softly with hope?" |
| Many scene changes, few images at the level | "Your story moves through 12 places. At Standard we show about 8 pictures. Which places matter most to you?" (multi-pick) |
| A key object or symbol | "The red shawl appears four times. Should it appear in the pictures each time?" |
| Time jumps | "The story jumps from 1960 to today. Should the colour change too (e.g. sepia for the past)?" |
| Violence, death or illness in a children's order | "This story has a death. For children, should we show it only through symbols (an empty chair, a lamp going out)?" |
| Names with unusual pronunciation | "How do you say these names?" (list, with play buttons; writer can record) |
| Mixed-language text | "Some words are in English. Read them in English, or in Gujarati pronunciation?" |
| Real place names | "Should we show the real temple, or a general temple of that region?" |

The pronunciation list (names, places, rare words) is always collected here and
goes into the script approval step.

---

## 10. Stage 8: The creative plan and quote

1. Claude writes the **one-page creative plan** (brief 3B): purpose and audience,
   mood, look and colour, setting, characters (with voice choices), music and
   sound, pacing, text approach and length, episodes, things to avoid, ending
   card, add-ons.
2. Under it: the **fixed quote** (full price, ₹499 sample, advance, final),
   delivery estimate (worst case), and what's included.
3. The writer can **edit the plan** (up to 3 rounds of changes before the sample;
   each change re-quotes). After that: "Let's discuss" → Studio Saathi /
   `needs_human`.
4. Button: **"Approve plan and pay ₹499 for my sample"** (Razorpay).
   The approved plan + script + pronunciation list = the **baseline** (6E).

---

## 11. After the sample (from the brief, for completeness)

- Sample ready (watermarked) + up to two test pictures in the suggested looks.
- **Approve and pay 50%** → order pack goes to production.
- **Flag errors in the sample** (6E) → fix → sample again.
- **Stop here** → order closes; ₹499 not refunded (it paid for the sample);
  deletion clock starts.

---

## 12. The order pack (what the agent/worker receives)

Built by the website only after the 50% advance. JSON in private R2, at
`orders/<order_id>/order_pack.json`; referenced (not copied) by the job queue.

```json
{
  "order_id": "…",
  "engine_version": "engine-v1.x",
  "language": "gu",
  "second_language": null,
  "story_r2_key": "orders/<id>/story.txt",
  "origin": { "type": "own|translation|adaptation|traditional|permission|joint",
              "credits_block": "… (locked)" },
  "purpose": ["youtube"], "monetise": true, "broadcast_use": false,
  "audience": { "group": "adults", "elders_mode": false, "children_age": null },
  "level": "standard", "service": "self_serve",
  "format": { "visual": "moving_stills", "shorts": 3 },
  "sound": "narration_music_sfx",
  "voices": { "mode": "narrator_plus_characters",
              "narrator_voice_id": "…", "exclusive_voice": false,
              "own_voice": false,
              "characters": [ { "name": "Ba", "role": "main", "age": "70",
                                "look": "white sari, silver hair",
                                "voice_id": "…" } ] },
  "delivery_style": "dramatised",
  "text": { "mode": "exact", "target_minutes": null, "episodes": [] },
  "mood_tags": ["nostalgic", "warm"],
  "look": { "style": "soft_watercolour", "colour": "sepia",
            "setting": "Saurashtra village, 1950s, monsoon" },
  "music_tags": ["indian_classical", "flute", "no_music_in_sad_parts"],
  "sfx_tags": ["nature", "village_life", "few"],
  "avoid": ["no_blood"],
  "symbols_only_for": [],
  "ending_card": "In memory of my grandmother",
  "reference_images": ["orders/<id>/ref/1.jpg"],
  "pronunciation": [ { "word": "…", "say_as": "…", "audio_r2_key": null } ],
  "followup_answers": [ { "q": "…", "a": "…" } ],
  "approved_plan_r2_key": "orders/<id>/plan_v2.md",
  "approved_script_r2_key": "orders/<id>/script_v1.txt",
  "budget": { "quote_inr": 0, "tool_cap_inr": 0, "claude_cap_usd": 0 },
  "variation_seed": 0,
  "recent_recipes_ref": "for uniqueness check",
  "deadline_worst_case": "…",
  "consents": { "terms_version": "…", "data_consent_version": "…",
                "own_voice_consent": false, "publication_choice": "A|B" }
}
```

Rules for the pack:
- Only **tags and IDs** for music, sound, voices and styles (no free text from the
  writer reaches a generation prompt).
- Free-text fields (look, ending card, follow-up answers) are passed to Claude as
  **quoted data inside the shot-list step**, never to ElevenLabs or image models
  directly, and are checked by the prompt firewall.
- The pack is creative content: deleted with everything else at day 7 (or kept in
  Series Storage for a series).

---

## 13. Build notes for Claude Code

- Build the flow as a **state machine** (one table row per draft with
  `current_step` and an `answers` JSON that holds only non-creative choices;
  story, free text, voice notes and references live in R2).
- Each question is defined in one config file (`creators/questions.ts`): id,
  label in 3 languages, type, options, default, `showIf` condition, maps-to field.
  Jaydeep can edit wording without touching logic.
- Claude calls in this flow (all real time, all logged with cost per order):
  screening (cheap model) · character/setting extraction (cheap model) · style
  suggestions · follow-up questions (Opus-class) · creative plan (Opus-class).
  Per-draft Claude budget cap in settings; over cap → `needs_human`.
- Abandoned drafts: reminder at day 3; draft and story deleted at day 14
  (same as the inactivity rule).
- Tests: every `showIf` branch; conflict checks (length, level limits); a story
  that triggers each follow-up type; refusal paths; Gujarati/Hindi rendering on a
  360 px phone.

---

## 14. Open points before building (Claude Code, 24 Nov 2026)

Added when the spec was filed; nothing above was changed. Decide these first.

1. **₹499 sample vs free sample.** This spec charges ₹499 for the sample (1.3,
   5.2, 10.2, 10.4, 11). The brief says the sample is **free** (22 Nov 2026), and
   Jaydeep confirmed on 24 Nov 2026 to keep it free; the live terms, consent
   summary, landing page and home band all say free. Which one is right? A paid
   sample also needs Razorpay live (brief §2 item 5) before the sample step.
2. **What's already live** (/creators/start, brief §6A, §6H) covers 0.5, 1.1
   (paste only), 1.3, the screening, 2.1c (as "big screen"), a short version of
   stage 7, and an automatic **audio** sample (Phase 2a, made after Jaydeep's
   check, from the story's opening). The new flow replaces the form; existing
   requests, consents and the sample pipeline carry over. 18+ moves from the
   submission ticks to sign-in (0.5), as written here.
3. **Needs things not built yet:** the pricing engine (0.4 price range, 3.1
   prices, the fixed quote in 10), Razorpay (10.4, 11), .docx/.pdf text extraction
   (1.1), voice notes (principle 4: needs a speech-to-text provider, which must
   then be added to the privacy policy and `docs/licences.md`), the 15-second
   example clips (0.3, 3.1, 5.2), and the "prompt firewall" (12), which is named
   but not defined yet.
4. **Paths:** the pack uses `orders/<id>/…`; the live code stores requests under
   `creators/<request id>/…`. Pick one before building orders.
5. **2.1c Yes → `needs_human`:** today "Yes" only flags `music_replacement`; the
   request still gets questions and a sample. Confirm that it should now stop and
   wait for Jaydeep.
6. **Vocabulary:** 6.2 and the pack's tag names (`indian_classical`, `nature`,
   `village_life`, `few`, `soft_watercolour`) differ from
   `src/lib/creators/vocabulary.ts` (`music:flute`, `sound:rain`,
   `style:soft-watercolour`…). One vocabulary, ideally from the real asset
   catalog (open item in `docs/PROGRESS.md`).

### Decisions (Jaydeep, 25 Nov 2026)

1. **Sample stays free.** Every "₹499 sample" above reads as "free sample"; no
   payment before the sample. Razorpay is needed only for the 50% advance (step 11).
2. Accepted as written: the new flow replaces the form; 18+ moves to sign-in.
3. **Build everything**, including the pricing engine and .docx/.pdf extraction.
   Anything with a running cost (Razorpay account, speech-to-text provider for
   voice notes) is asked before it is switched on.
4. Paths stay `creators/<request id>/…` (Claude Code's default; the pack follows).
5. **2.1c Yes → stop: `needs_human`**, no automatic sample until Jaydeep approves.
6. Tags use `src/lib/creators/vocabulary.ts` until the real asset catalog exists.
