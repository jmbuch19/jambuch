import Link from "next/link";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/lib/admin";
import { flowSettings } from "@/lib/creators/flow";
import a from "../../../admin.module.css";

// The production agent on Anthropic Managed Agents (brief §6F), read-only. Uses the site's
// own ANTHROPIC_API_KEY, so if this page loads the agent, the site can also start sessions
// for it. Nothing here creates, changes, runs or deletes anything.
export const dynamic = "force-dynamic";

// Jaydeep's agent (25 Nov 2026). Can be overridden with "agent_id" in the flow settings.
const DEFAULT_AGENT_ID = "agent_01CGNoo1zESuPHn573PPoD3F";

const pretty = (v: unknown) => JSON.stringify(v, null, 2);
const pre = { whiteSpace: "pre-wrap" as const, fontSize: 13, maxWidth: "100%", overflowX: "auto" as const };

async function load(agentId: string) {
  const client = new Anthropic({ maxRetries: 1, timeout: 20_000 });
  const out: {
    agent?: Awaited<ReturnType<typeof client.beta.agents.retrieve>>;
    agentError?: string;
    environments: { id: string; name: string; description: string | null; archived: boolean; config: unknown }[];
    environmentsError?: string;
    vaults: { id: string; name: string }[];
    vaultsError?: string;
  } = { environments: [], vaults: [] };

  try {
    out.agent = await client.beta.agents.retrieve(agentId);
  } catch (e) {
    out.agentError = e instanceof Error ? e.message : String(e);
  }
  try {
    for await (const env of client.beta.environments.list()) {
      out.environments.push({ id: env.id, name: env.name, description: env.description, archived: !!env.archived_at, config: env.config });
      if (out.environments.length >= 20) break;
    }
  } catch (e) {
    out.environmentsError = e instanceof Error ? e.message : String(e);
  }
  try {
    for await (const v of client.beta.vaults.list()) {
      const rec = v as unknown as { id: string; display_name?: string; name?: string };
      out.vaults.push({ id: rec.id, name: rec.display_name ?? rec.name ?? "" });
      if (out.vaults.length >= 20) break;
    }
  } catch (e) {
    out.vaultsError = e instanceof Error ? e.message : String(e);
  }
  return out;
}

export default async function ProductionAgentPage() {
  await requireAdmin();
  const flow = (await flowSettings()) as unknown as { agent_id?: string };
  const agentId = flow.agent_id || DEFAULT_AGENT_ID;
  const ready = !!process.env.ANTHROPIC_API_KEY;
  const d = ready ? await load(agentId) : null;
  const ag = d?.agent;

  return (
    <>
      <p className={a.crumb}>
        <Link href="/admin/creators">← Creator’s Space requests</Link>
      </p>
      <h1 className={a.title}>Production agent (read-only)</h1>
      <p className={a.intro}>
        The Managed Agent that will make paid orders (brief §6F). This page only reads; it never starts a run. If the agent
        shows below, it is in the same Anthropic account as the site’s key, so the site can start runs for it.
      </p>

      {!ready && <p className={a.error}>ANTHROPIC_API_KEY is not set on this deployment.</p>}
      {d?.agentError && (
        <p className={a.error}>
          Couldn’t read {agentId}: {d.agentError}. If it says “not found”, the agent is in a different Anthropic account or
          workspace than the site’s key.
        </p>
      )}

      {ag && (
        <>
          <h2 className={a.gapTop}>
            {ag.name} · version {ag.version}
            {ag.archived_at ? " · ARCHIVED" : ""}
          </h2>
          <p className={a.mutedSmall}>
            {ag.id} · updated {new Date(ag.updated_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
            {ag.description ? ` · ${ag.description}` : ""}
          </p>
          <h3>Model</h3>
          <pre style={pre}>{pretty(ag.model)}</pre>
          <h3>Instructions (system prompt)</h3>
          <pre style={pre}>{ag.system || "(none)"}</pre>
          <h3>Tools</h3>
          <pre style={pre}>{pretty(ag.tools)}</pre>
          {!!ag.skills?.length && (
            <>
              <h3>Skills</h3>
              <pre style={pre}>{pretty(ag.skills)}</pre>
            </>
          )}
          {!!ag.mcp_servers?.length && (
            <>
              <h3>MCP servers</h3>
              <pre style={pre}>{pretty(ag.mcp_servers)}</pre>
            </>
          )}
          {ag.multiagent && (
            <>
              <h3>Multi-agent</h3>
              <pre style={pre}>{pretty(ag.multiagent)}</pre>
            </>
          )}
        </>
      )}

      {d && (
        <>
          <h2 className={a.gapTop}>Environments (where runs happen)</h2>
          {d.environmentsError && <p className={a.error}>{d.environmentsError}</p>}
          {!d.environments.length && !d.environmentsError && <p className={a.mutedSmall}>None yet.</p>}
          {d.environments.map((e) => (
            <div key={e.id}>
              <p>
                <b>{e.name}</b> · {e.id}
                {e.archived ? " · archived" : ""}
                {e.description ? ` · ${e.description}` : ""}
              </p>
              <pre style={pre}>{pretty(e.config)}</pre>
            </div>
          ))}

          <h2 className={a.gapTop}>Vaults (stored keys; names only)</h2>
          {d.vaultsError && <p className={a.error}>{d.vaultsError}</p>}
          {!d.vaults.length && !d.vaultsError && <p className={a.mutedSmall}>None yet: the agent has no stored keys for ElevenLabs, images or R2.</p>}
          <ul>
            {d.vaults.map((v) => (
              <li key={v.id}>
                {v.name || "(no name)"} · {v.id}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
