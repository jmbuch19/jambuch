# Creator's Space: pricing calibration, step 1 (21 Nov 2026)

For: Jaydeep. Phase 1, step 1 of docs/CREATORS_SPACE_BRIEF.md §13. Nothing is priced yet: this compares the
brief's cost formula (§5) with what Ramayana chapters 38–44 really cost us, so you can set the rates.
Script: `D:\jambuch-audio-pilot\scripts\calibrate-pricing.mjs` · data: `D:\jambuch-audio-pilot\docs\pricing-calibration.json`.

## 1. First, a correction to our own cost data

The image ledger records each painting's cost as the account balance before minus after. When several
chapters paint at the same time, each one also counts the others' charges. Checked against ElevenLabs' own
usage figures (`GET /v1/usage/character-stats`):

| UTC day | Our ledger | ElevenLabs actual (image model) |
|---|---|---|
| 15–19 Nov | 21.7k · 27.6k · 110k · 33.6k · 77.1k | 20.6k · 28.1k · 116.2k · 42.9k · 84.5k |
| **20 Nov** (ch45–48 painted in parallel) | **210,346** | **72,243** (2.9× overcount) |
| 21 Nov (ch49) | 15,736 | 15,786 |

**A 2K painting costs about 920 credits**, not ~2,500 (corrected this morning's note, the cost-rules doc and memory).
A ~20-still chapter is about 18–20k credits. To do: make the ledger reconcile each run with the usage API.

## 2. Real cost against the brief's estimate (measured rates)

Standard level as the brief defines it (moving stills ~1 per 50 s, dramatised, narrator + character voices,
library music and effects). Credits = ElevenLabs credits (images + narration + speech-to-text checks).

| ch | characters | voices | minutes real / est | stills real / est | credits real | credits est | est ÷ real | render h (home PC) |
|---|---|---|---|---|---|---|---|---|
| 38 | 9,613 | 3 | 13.2 / 13.7 | 17 / 18 | 27,355 | 26,291 | 0.96 | 1.8 |
| 39 | 8,527 | 4 | 12.6 / 12.2 | 15 / 16 | 18,553 | 23,866 | 1.29 | 2.3 |
| 40 | 15,256 | 6 | 21.8 / 21.8 | 18 / 28 | 22,585 | 43,897 | 1.94 | 3.6 |
| 41 | 5,064 | 4 | 7.1 / 7.2 | 11 / 10 | 18,074 | 14,678 | 0.81 | 3.4 |
| 42 | 8,595 | 4 | 12.2 / 12.3 | 13 / 16 | 20,527 | 23,928 | 1.17 | 1.7 |
| 43 | 9,681 | 3 | 13.9 / 13.8 | 16 / 18 | 22,428 | 26,348 | 1.17 | 1.7 |
| 44 | 8,780 | 6 | 13.0 / 12.5 | 14 / 17 | 16,712 | 26,160 | 1.57 | 1.5 |
| **all** | | | | | **146,234** | **185,168** | **1.27** | |

- The estimate runs **27% above the real cost overall**, which works as a cushion.
- **Why the chapters differ:**
  - The spread is our own uneven picture pace: ch40 used 1 still per 73 s and ch41 1 per 39 s.
  - A client order at Standard gets the promised 1 per 50 s, so the estimate matches what we would actually make.
- ch38 was drafted (old flow) and cost more per still.
- **Duration:** minutes are estimated from characters, and that is now accurate to within ±4%.

## 3. Rates measured, and what changed from the brief

| Setting | Brief default | Measured on our work | Use |
|---|---|---|---|
| Characters per minute (Gujarati, dramatised) | 900 | **698** | 700 |
| Credits per character (eleven_v4) | — | 0.48 (ch49, ch50) | 0.48 |
| Retake factor, dramatised | 1.6 | **1.10** on ch50, ~1.2 on ch49 | 1.25 |
| Credits per painting (2K high) | ~1,230 | **921** | 920 |
| Paintings per still (finals + fixes) | — | 1.07 | 1.1 |
| Seconds per still (Standard) | 50 | 54 (Ramayana average) | 50 (the promise) |
| Render hours per narration minute | — | 0.17 (home PC) | measure on the cloud worker |

## 4. What this means in rupees (assumptions to confirm)

- **Credit price:** ElevenLabs Pro is $99 for 600k credits. At **₹85 per $ (an assumption: set the real rate)**,
  1,000 credits ≈ ₹14. A typical 12-minute chapter's tools cost about **₹300–370 in credits**.
- **Not yet measured:**
  - render cost on a cloud worker (the home PC is free but slow: ~2 h a chapter);
  - Claude API tokens for script prep, directions, shot lists and vision checks (Phase 2 measures them on a real job);
  - the Razorpay fee (about 2% + GST).
- **The brief's formula, worked once for a 12-minute Standard story**, with tool cost about ₹400 including a render
  estimate:
  - 2 × ₹400 = ₹800, plus **review hours × ₹1,000**, then grossed up for the gateway fee and rounded up to ₹99.
  - With 1.5 h of review: about **₹2,376**. With 3 h: about **₹3,960**.
  - **Your review time, not the tools, decides the price.** The review hours per level are the key settings for you to set.

## 5. Decisions for you before step 2 (settings tables)

1. The rupee rate for credits (₹ per $), and whether client work uses a separate ElevenLabs subscription (brief §2.9).
2. Review hours per level and mode (Basic / Standard / Premium, Self-serve / Assisted).
3. Whether to keep the 27% cushion as it is, or set the retry buffer differently.
4. A render-cost assumption until a cloud worker run is measured (or keep rendering on the home PC at first).
