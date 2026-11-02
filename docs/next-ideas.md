# Next ideas (not built yet)

Agreed in conversation on 2 Nov 2026. Nothing here is built or paid for yet.
Ask before any spend.

## 1. YouTube videos of chapters: audio play + changing still pictures

The whole ElevenLabs audio play of a chapter, with still pictures that change
as the scene changes. No AI-animated video.

**Key fact:** each audio play's `timings.json` already holds the start time of
every paragraph (`paragraphMs` in `src/lib/audio.ts`). A scene is a range of
paragraphs, so each picture switches exactly when its first paragraph starts.
No hand timing.

Per chapter:

1. Group the chapter's paragraphs into scenes (about 10–25 per chapter).
2. Write one picture description per scene, plus a character and place look
   sheet so faces and places stay the same in every picture.
3. Make the stills with an AI image service. Compare first: Google Gemini
   image, OpenAI image, Flux (quality, Indian look and dress, keeping
   characters consistent, price).
4. On the PC, join audio and stills into an MP4 (ffmpeg): opening card with
   the green J logo, soft fades, end card "Read this chapter at jambuch.in".
   Free.
5. Upload to YouTube (by hand at first).

Bonus: the same stills can show on the chapter page on jambuch.in while
someone listens, changing with the paragraphs.

Cost: images cost cents each; confirm current prices before starting.

**Decide before anything is public:**

- **Copy protection:** anything public on YouTube can be downloaded.
  Recommended: short trailers (2–3 min) on YouTube that send people to
  jambuch.in for the full chapter. Alternative: full chapters as *unlisted*.
- **ElevenLabs plan** must allow YouTube / commercial use (free plans don't
  and need attribution).
- **Rights:** the Ramayana (Nalinkant Chhaya's) is fine. *Chasing the Monsoon*
  and *Ratanbabu* need the rights holders' permission for a public audio or
  video version, separate from translation permission.

**First step:** one Ramayana chapter that already has an audio play becomes a
test video; compare image services on it; Jaydeep reviews before anything goes
public. Still to choose: which chapter, and trailers vs unlisted full chapters.

(Considered and set aside for now: fully AI-animated film with Veo, Runway,
Kling, Luma or Sora. It costs far more, clips are only 5–10 seconds, and
keeping characters consistent is hard.)

## 2. Android app on Google Play

jambuch.in is already an installable web app (manifest, icons, offline
chapters), so it can be wrapped as a real Android app without a rebuild.

- **Simple wrapper (Trusted Web Activity):** the quickest option, and new
  chapters appear without app updates. Screenshots still possible.
- **Fuller wrapper (e.g. Capacitor):** a bit more work, but it can block
  screenshots and screen recording inside the app, which fits the content
  protection wish.
- Needs a Google Play developer account in Jaydeep's name: $25 one time.
- New personal accounts must run a closed test with 12 testers for 14 days
  before going public, so allow about 3 weeks.
- Store page needs screenshots, description and a privacy policy.
- iPhone later, if wanted: $99 a year, and Apple is stricter about apps that
  mainly show a website.

Still to choose: simple vs fuller wrapper.
