import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { INVITE_DAYS } from "./invite-stages";

export * from "./invite-stages";

// Courtyard invite links: /courtyard/invite/<token>. The token is shown once
// (in the link) and only its SHA-256 hash is stored, so the database alone
// can't be used to build a working link.

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// A fresh link: the token for the URL, its hash for the database, and dates.
export function newInviteLink() {
  const token = randomBytes(32).toString("base64url");
  const sentAt = new Date();
  const expiresAt = new Date(sentAt.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  return {
    token,
    token_hash: hashToken(token),
    sent_at: sentAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  };
}

export function sameEmail(a: string | null | undefined, b: string | null | undefined) {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

// "j•••@gmail.com", so the invite page hints at the address without showing it.
export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!domain) return "•••";
  return `${user.slice(0, 1)}•••@${domain}`;
}
