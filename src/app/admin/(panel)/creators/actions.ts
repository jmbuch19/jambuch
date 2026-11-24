"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { adminClient } from "@/lib/supabase-admin";

// Close a request once the studio has answered it, or refuse a borderline one after reading it.
// Closed and refused requests stop counting toward the writer's 3 open requests.
export async function setRequestState(form: FormData) {
  await requireAdmin();
  const state = String(form.get("state") ?? "");
  if (!["closed", "refused"].includes(state)) return;
  await adminClient()
    .from("creator_requests")
    .update({ state, updated_at: new Date().toISOString() })
    .eq("id", String(form.get("id") ?? ""));
  revalidatePath("/admin/creators");
}
