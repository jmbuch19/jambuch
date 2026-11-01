// The voices a chapter can be listened in (Microsoft Azure neural voices).
// Shared by the admin (making the audio) and the reader's player.

export const VOICES = {
  niranjan: { azure: "gu-IN-NiranjanNeural", gu: "નિરંજન", en: "Niranjan" },
  dhwani: { azure: "gu-IN-DhwaniNeural", gu: "ધ્વનિ", en: "Dhwani" },
} as const;

export type VoiceKey = keyof typeof VOICES;
export const VOICE_KEYS = Object.keys(VOICES) as VoiceKey[];
export const isVoice = (v: unknown): v is VoiceKey => typeof v === "string" && v in VOICES;

// One chapter's recording in one voice, as the player gets it.
export type Track = {
  voice: VoiceKey;
  url: string;
  paragraphMs: number[]; // where each paragraph of the text starts
  durationMs: number;
};
