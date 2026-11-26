import Link from "next/link";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/lib/admin";
import { flowSettings } from "@/lib/creators/flow";
import { deleteEngineTest, engineTestView, startEngineTest } from "./engine-test";
import a from "../../../admin.module.css";

// The production agent on Anthropic Managed Agents (brief §6F), read-only. Uses the site's
// own ANTHROPIC_API_KEY, so if this page loads the agent, the site can also start sessions
// for it. Nothing here creates, changes, runs or deletes anything.
export const dynamic = "force-dynamic";

// The studio's agent (25 Nov 2026). Can be overridden with "agent_id" in the flow settings.
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
  const test = ready ? await engineTestView() : null;
  const ag = d?.agent;

  return (
    <>
      <p className={a.crumb}>
        <Link href="/admin/creators">← Creator’s Space requests</Link>
      </p>
      <h1 className={a.title}>Production agent</h1>
      <p className={a.intro}>
        The Managed Agent that will make paid orders (brief §6F). The settings below are read-only; only the test button starts a run. If the agent
        shows below, it is in the same Anthropic account as the site’s key, so the site can start runs for it.
      </p>

      {!ready && <p className={a.error}>ANTHROPIC_API_KEY is not set on this deployment.</p>}
      {d?.agentError && (
        <p className={a.error}>
          Couldn’t read {agentId}: {d.agentError}. If it says “not found”, the agent is in a different Anthropic account or
          workspace than the site’s key.
        </p>
      )}

      <h2 className={a.gapTop}>One-day test, part 1: render only</h2>
      <p className={a.intro}>
        Runs once in the test container with a hard <b>$5</b> limit (Claude and running time; it pauses at the limit).
        No client story, no ElevenLabs, no image service: the agent makes test pictures and sound itself, renders a
        12-minute 1080p moving-pictures video the Ramayana way, reports how long each part took, then deletes its files.
        Your agent is not changed: this run alone gets its own instructions and runs commands without asking.
      </p>
      {!test ? (
        <form action={startEngineTest}>
          <button type="submit" className={a.primary}>
            Run the render-only test ($5 limit)
          </button>
        </form>
      ) : (
        <>
          <p>
            Session {test.id} · <b>{test.status}</b> · cost so far {test.cost}
            {test.active_seconds !== null ? ` · ${Math.round(test.active_seconds / 60)} min running` : ""} · started{" "}
            {test.started_at ? new Date(test.started_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}
          </p>
          {test.error && <p className={a.error}>{test.error}</p>}
          <p className={a.mutedSmall}>Reload this page to see progress.</p>
          <div style={{ maxHeight: 520, overflowY: "auto", border: "1px solid #ddd", padding: 12, borderRadius: 6 }}>
            {test.lines.map((l, i) => (
              <pre key={i} style={{ ...pre, margin: "0 0 8px", opacity: l.kind === "tool" ? 0.65 : 1, fontWeight: l.kind === "agent" ? 500 : 400 }}>
                {l.kind === "agent" ? "Agent: " : l.kind === "tool" ? "› " : l.kind === "error" ? "ERROR: " : "· "}
                {l.text}
              </pre>
            ))}
          </div>
          <form action={deleteEngineTest} style={{ marginTop: 12 }}>
            <button type="submit" className={a.secondary}>
              Delete this test session (transcript and container)
            </button>
          </form>
        </>
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
