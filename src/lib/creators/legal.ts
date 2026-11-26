import "server-only";
import { adminClient } from "@/lib/supabase-admin";

// The legal entity named on the terms, the privacy page and invoices (settings row
// "creators.legal", editable in admin). "We" in those texts refers to it. Later the One
// Person Company replaces it; only the setting changes.
export type Legal = { entity: string; gstin: string; address: string; contact_email: string };
const FALLBACK: Legal = { entity: "Varta Vishva", gstin: "", address: "", contact_email: "" };

export async function legalEntity(): Promise<Legal> {
  const { data } = await adminClient().from("settings").select("value").eq("key", "creators.legal").maybeSingle();
  const v = (data?.value ?? {}) as Partial<Legal>;
  return {
    entity: String(v.entity || FALLBACK.entity),
    gstin: String(v.gstin ?? ""),
    address: String(v.address ?? ""),
    contact_email: String(v.contact_email ?? ""),
  };
}

// "Varta Vishva, a business of … (proprietor), GSTIN …" (GSTIN only once it is added).
export const legalLine = (l: Legal) => `${l.entity}${l.gstin ? `, GSTIN ${l.gstin}` : ""}`;
