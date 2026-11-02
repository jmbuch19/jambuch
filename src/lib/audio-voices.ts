// The voices a chapter can be listened in (Microsoft Azure neural voices).
// Shared by the admin (making the audio) and the reader's player.

export const VOICES = {
  niranjan: { azure: "gu-IN-NiranjanNeural", gu: "નિરંજન", en: "Niranjan" },
  dhwani: { azure: "gu-IN-DhwaniNeural", gu: "ધ્વનિ", en: "Dhwani" },
} as const;

export type VoiceKey = keyof typeof VOICES;
export const VOICE_KEYS = Object.keys(VOICES) as VoiceKey[];
export const isVoice = (v: unknown): v is VoiceKey => typeof v === "string" && v in VOICES;

// Uploaded productions: the audio play (cast, music, sound effects) and the
// same performance without music and effects.
export const PRODUCTIONS = {
  play: { gu: "🎭 નાટ્યરૂપ", en: "Audio play" },
  spoken: { gu: "🗣 ફક્ત અવાજ", en: "Voice only" },
} as const;

export type ProductionKey = keyof typeof PRODUCTIONS;
export const PRODUCTION_KEYS = Object.keys(PRODUCTIONS) as ProductionKey[];
export const isProduction = (v: unknown): v is ProductionKey => typeof v === "string" && v in PRODUCTIONS;

// Uploaded files go up in pieces: the site accepts at most 4.5 MB per request.
export const PIECE_BYTES = 3.5 * 1024 * 1024;

export type TrackKey = VoiceKey | ProductionKey;
export const trackLabel = (k: TrackKey) => (isVoice(k) ? VOICES[k] : PRODUCTIONS[k]);

// One chapter's recording, as the player gets it.
export type Track = {
  voice: TrackKey;
  url: string;
  paragraphMs: number[]; // where each paragraph of the text starts
  durationMs: number;
};
