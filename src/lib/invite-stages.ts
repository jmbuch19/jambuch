// Courtyard invite stages and room terms, shared by server and browser code.

export const INVITE_DAYS = 14;
export const TERMS_VERSION = "2026-10";

export const ROOM_TERMS = [
  "My work stays mine, and I hold the rights to everything I put in my room.",
  "Jaydeep approves each piece before it is published.",
  "Jaydeep may take down anything from the room at any time.",
  "I can leave whenever I like and get all my files back.",
] as const;

export type InviteStage =
  | "invited"
  | "agreement_accepted"
  | "room_draft"
  | "needs_review"
  | "live"
  | "paused"
  | "expired"
  | "revoked"
  | "left";

export const STAGE_LABELS: Record<InviteStage, string> = {
  invited: "Invited",
  agreement_accepted: "Agreement accepted",
  room_draft: "Room in draft",
  needs_review: "Needs your review",
  live: "Live",
  paused: "Paused",
  expired: "Link expired",
  revoked: "Revoked",
  left: "Left",
};

// The stages where the next step is Jaydeep's.
export const WAITING_ON_ME: InviteStage[] = ["agreement_accepted", "needs_review", "expired"];
