// Per-account limits for sample requests (docs/CREATORS_SPACE_BRIEF.md §6A "Safeguards").
export const LIMITS = { open: 3, perDay: 5 } as const;

// States that still need something from the writer or the studio.
export const OPEN_STATES = ["draft", "screening", "questions", "plan", "sample_due", "submitted", "needs_human"];
