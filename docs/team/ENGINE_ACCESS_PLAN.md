# Engine access for team members (directors)

Status: **plan, not built.** Written 26 Nov 2026 (owner's decision to plan for a team). Read with
`docs/CREATORS_SPACE_BRIEF.md` §1A (voice, roles, legal entity), §3A (Varta Vishva Directors),
§6F (cloud engine) and §6J (directed orders on a director's PC). Companion documents:
`REPO_SECURITY.md` (repos and GitHub) and `JOINING_AND_LEAVING.md` (checklists).

## 1. The principle

A team member gets the engine as a **tool**, never its **secrets**. What is valuable, and what
would hurt if it leaked, is not the engine's code but:

1. **API keys** (ElevenLabs, Claude, image generation): money.
2. **The Ramayana work**: chapters, cast voices, the narrator, paintings, Ramayana-only docs.
3. **The sound library and the rules** (asset cards, narration pauses, levels, the sound guide).
4. **Writers' stories** (confidential client data, 7-day deletion promise).

None of these sits on a team member's computer, except one assigned order's files, for as long
as that order lasts.

## 2. Today (26 Nov 2026)

| Thing | Where it is | Who has it |
|---|---|---|
| Engine + Ramayana (`jambuch-audio-pilot`, private) | Home PC owns it; office PC has a read-only clone | Owner only |
| Site (`jambuch`) | GitHub, **public** (see `REPO_SECURITY.md`) | Owner |
| Provider keys | Vercel env (site), home PC env (engine) | Owner |
| Admin | Single sign-in (ADMIN_EMAIL) | Owner |
| Team table, roles, story access log | Built (`creator_team`, `creator_story_access`) | No members yet; every role = owner |

## 3. Target design

### 3.1 Split the engine (home PC, on the `engine-split` branch)

| Repo | Contents | Access |
|---|---|---|
| `vv-engine` (new, private) | The general engine: voicing, segment joining, mixing, sound placement and levels, painting pipeline, camera, grades, quality checks, `client-import` / `client-export` / `client-purge` | Directors: **read only** |
| `jambuch-audio-pilot` (existing) | Ramayana chapters (`video/chNN`), cast and narrator voices, tribute, Ramayana-only docs, the owner's own projects | **Owner only** (home PC) |
| `jambuch` (site) | Site, admin, `/studio`, Studio API | Owner (later a hired developer, by agreement) |

- The engine reads **rules as data** (exported to private R2, as the site already does):
  `media/rules/narration.json` (pauses, levels, loudness) and `media/assets/catalog.json`
  (client-ready + client-cleared asset cards only). No rule document is copied into `vv-engine`.
- `vv-engine` refuses to run with Ramayana cast or narrator voice ids (a deny list in the export),
  which enforces "no Ramayana characters, cast voices or narrator" in client work.
- Timing: after ch75 (~11 Dec 2026), so daily Ramayana uploads are never delayed.

### 3.2 The key broker: the Studio API (on the site)

A director's engine **never holds a provider key**. Every paid call goes through the site:

```
director's PC (vv-engine)  ──(short-lived team token)──▶  Studio API on jambuch.in
                                                          │ checks: member active, cleared,
                                                          │ order assigned to them, budget left
                                                          ▼
                                     ElevenLabs (client key) · Claude · image generation
```

- **Sign-in:** the engine's CLI signs in with the member's team account (device-code login: the
  CLI shows a code, the member confirms it on `/studio`). The token lasts a few hours and is
  scoped to that member.
- **Scope:** each call names an order id; the API refuses orders not assigned to the member.
- **Keys:** only the server holds them. Client work always uses the **separate client
  ElevenLabs key and quota**, never the Ramayana key.
- **Budget:** a cap per order (derived from the quote's tool cost × a margin) and per member per
  day; over the cap, the call is refused and the admin is alerted.
- **Logging:** every call goes to the cost log with member, order, provider, units and cost.
- **Revocation:** marking a member inactive on the Team page stops everything at once; no key
  ever needs rotating because of a person leaving.
- Endpoints (first set): `voice` (TTS with previous/next text), `stt-check`, `claude` (only the
  engine's fixed step names, never free prompts), `image`, `asset-url` (signed link to one
  catalog asset), `order-files` (signed links to one order's story/brief/plan),
  `upload-result`, `log-access`.

### 3.3 Order files, one order at a time

- `client-import <order id>`:
  1. signs in (3.2), checks the order is assigned to this member;
  2. refuses unless `D:\clients\` is on a BitLocker-encrypted drive, outside any git repository
     and outside OneDrive / Google Drive / Dropbox folders;
  3. creates `D:\clients\<id>\` and downloads only that order's story, brief, approved plan,
     order pack and the catalog assets it needs (short-lived signed links);
  4. logs "order import" in `creator_story_access` (member, PC name, time).
- `client-export <order id>`: uploads the sample or deliverables to `creators/<id>/directed/`;
  the request page offers "Use as the sample"; the reviewer checks and sends.
- `client-purge` (daily, scheduled task): deletes each order folder 7 days after delivery (date
  from the Studio API), logs each deletion (order, folder, file count, time, PC); the log joins
  the order's deletion certificate (brief §6B).

### 3.4 The team sign-in: `/studio` (site)

- A separate area from `/admin`. A member signs in with their own email (one-time code, as
  writers do) and must be an active, cleared row in `creator_team`.
- Lists **only their assigned orders**: brief, plan, writer's contact for the 2-day call, due
  dates, the director's sample upload status, hours log.
- Every story view is logged (who, role, what, when).
- `/admin` stays the owner's (and later any member with the `admin` role).
- Database: row-level security so a member's session can read only rows where
  `director_id = their id` (or reviewer assignments), never the whole table.

### 3.5 Contributions to the engine

- Directors may propose improvements as pull requests on `vv-engine`.
- Only the owner merges (code owners + protected `main`); the home PC pulls.
- The agreement assigns engine improvements and all order work to Varta Vishva.

## 4. Later: directing in the browser

When the cloud engine (brief §6F) runs production, directing moves into `/studio`: listen to a
segment, retake a line, move or change a sound, approve a painting, all in the browser. The
engine runs in the cloud; nothing at all sits on a director's PC, and 3.1–3.3 become a fallback
for heavy work only.

## 5. What cannot be fully prevented

- Anyone who can run the engine can copy its code; JavaScript cannot be truly hidden.
- Covered by: the agreement (confidentiality + ownership of work and improvements), the code being
  of little use without keys, library and rules (all server-side), and the logs.
- Story leaks: limited to assigned orders, logged, deleted on a schedule, encrypted at rest.

## 6. Build order

| # | When | Where | What | Status |
|---|---|---|---|---|
| 1 | Now | Office PC | `REPO_SECURITY.md` steps 1–4 (secret scan, site repo private, GitHub protections) | Decision pending |
| 2 | Now | Owner + lawyer | Confidentiality + ownership agreement (with the terms review) | Not started |
| 3 | After ch75 (~11 Dec) | Home PC | Engine split → `vv-engine`; rules and catalog exports; Ramayana deny list | Not started |
| 4 | Before the first member joins | Site | `/studio` sign-in, row-level security, assigned orders only | Not started |
| 5 | Before the first member joins | Site | Studio API (key broker, budgets, logs) | Not started |
| 6 | Before the first member joins | `vv-engine` | `client-import` / `client-export` / `client-purge` against the Studio API | Spec only (brief §6J) |
| 7 | With the cloud engine | Site + cloud | Directing in the browser | Later |

## 7. Decisions still open

- Make the `jambuch` site repo private? (Recommended; see `REPO_SECURITY.md`.)
- GitHub plan for the organisation (protected branches on private repos need a paid plan;
  check the current price before buying).
- Per-member daily spending cap (suggested: the day's planned orders' tool cost × 1.5).
- Whether reviewers (not only directors) also get `/studio` access.
