// The choices in the "Request a sample" form (shared by the form and its server action).
export const LANGUAGES = { gu: "Gujarati", hi: "Hindi", en: "English", two: "Two languages (bilingual)" } as const;
export const MAKES = {
  audio: "An audio story (narration, voices, music and sound)",
  video: "An illustrated video for YouTube",
  shorts: "A video with Shorts",
  unsure: "Not sure yet: please suggest",
} as const;
export const LENGTHS = {
  short: "Short: under 5 minutes to read aloud",
  medium: "Medium: 5–20 minutes",
  long: "Long or a series: more than 20 minutes",
} as const;
// "Will this be shown at a film festival, on TV or in a cinema?" (brief §3B question 1b).
export const BIG_SCREEN = {
  no: "No: online and offline publishing only (YouTube, Spotify, websites, social media, personal use)",
  yes: "Yes: a film festival, TV, cinema, or a game or app",
  unsure: "Not sure yet",
} as const;
