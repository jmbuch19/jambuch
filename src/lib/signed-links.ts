import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Personal links without stored tokens: "<id>.<signature>", where the
// signature is an HMAC of the purpose, the id and (optionally) a version, keyed
// with a server-only secret. Changing the version kills older links.

function secret() {
  const s = process.env.LINK_SECRET || process.env.CRON_SECRET;
  if (!s) throw new Error("No secret for signing links (set LINK_SECRET or CRON_SECRET).");
  return s;
}

function sign(purpose: string, id: string, version: number | string) {
  return createHmac("sha256", secret()).update(`${purpose}:${id}:${version}`).digest("base64url").slice(0, 32);
}

export function makeLink(purpose: string, id: string, version: number | string = 1) {
  return `${id}.${sign(purpose, id, version)}`;
}

// The id inside a link, once its signature checks out; null otherwise. The
// caller supplies the version for that id (read from the database).
export function linkId(token: string) {
  const [id, sig] = token.split(".");
  return id && sig && /^[0-9a-f-]{36}$/i.test(id) ? { id, sig } : null;
}

export function linkValid(purpose: string, token: string, version: number | string = 1) {
  const parts = linkId(token);
  if (!parts) return false;
  const expected = Buffer.from(sign(purpose, parts.id, version));
  const given = Buffer.from(parts.sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
