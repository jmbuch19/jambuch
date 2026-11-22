// Runs the admin Podcast page's feed check from here (nothing is published).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z_0-9]+)=(.*)$/.exec(l);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "").trim();
}
const { checkFeed } = await import(process.argv[2]);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { xml, ...r } = await checkFeed(db, new Date());
console.log("problems:", JSON.stringify(r.problems, null, 1));
console.log("episodes:", r.episodes?.length, "xml:", xml ? xml.length : null);
const live = r.episodes?.filter((e: { isNew?: boolean }) => e.isNew).length;
console.log("new:", live);
console.log(Object.keys(r));
