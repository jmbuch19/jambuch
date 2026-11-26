# Repository and account security

Status: **plan, not done.** Written 26 Nov 2026. Companion to `ENGINE_ACCESS_PLAN.md` and
`JOINING_AND_LEAVING.md`. No secret, key, address or account id belongs in this file.

## 1. The repositories

| Repo | Today | Target |
|---|---|---|
| `jambuch` (site, admin, Creator's Space) | **Public** | **Private** (recommended) |
| `jambuch-audio-pilot` (engine + Ramayana) | Private; home PC owns it; office PC has a read-only clone | Private, owner only |
| `vv-engine` (general engine, after the split) | Does not exist yet | Private; directors read only |

### Why the site repo should be private

Public today means anyone can read the pricing formula, the screening and fix-it prompts, the
firewall rules, the brief (business plan, suppliers, processes) and the admin's structure. None
of it is a key, but together it is a ready-made copy of the business and a map for abuse (how
screening decides, where the limits are). Vercel deploys from a private repo the same way.
Nothing else changes for the site.

## 2. Rules that already hold

- No key, token or password is ever committed. Keys live in Vercel env (site), Doppler or the
  home PC env (engine); `.env*` files are git-ignored.
- Engine documents (e.g. the asset library doc) are never copied into the site repo; the site
  reads the engine's rules as exported data from private storage.
- The office PC never commits to the engine repo; the home PC owns it.
- Work goes to `creators-space`, then fast-forwards `main`; `main` deploys to production.

## 3. Steps

### Step 1: secret scan (both repos, full history)

- Run a secret scanner (gitleaks) over the whole history of `jambuch` and
  `jambuch-audio-pilot` (read-only on the engine repo).
- Any key ever committed is **rotated** at the provider, even if the commit was later deleted
  (history keeps it, and a public repo may already have been copied).
- Record the result (date, findings, rotations) in `docs/PROGRESS.md`.

### Step 2: make `jambuch` private

- GitHub → repository settings → change visibility to private.
- Check the Vercel deploy still triggers on push (it should; the Vercel GitHub app has access).
- Any public links to files in the repo stop working; none are known to be in use.

### Step 3: GitHub account and organisation

- **Two-factor login required** for every account with access (owner first).
- Move the repos into a GitHub **organisation** owned by the owner, so members are added to
  teams (`directors`: read on `vv-engine`; nobody else on the Ramayana repo) instead of being
  personal collaborators.
- **Secret scanning with push protection** on every repo (blocks a push that contains a key).
- **Dependabot alerts** on (vulnerable packages).
- Fine-grained access tokens only, with expiry; no classic tokens.

### Step 4: protect `main`

- No direct pushes and no force pushes to `main` on `vv-engine` and the site (owner may keep a
  bypass for the fast-forward workflow, or switch to merging pull requests).
- Code owners: the owner approves every change to `vv-engine` and the site.
- Required status check: the type check and build must pass before merge.
- Note: protected branches on private repos need a paid GitHub plan; check the current price
  before buying.

### Step 5: keys

- Separate keys per purpose: Ramayana ElevenLabs key ≠ client ElevenLabs key; site Claude key ≠
  engine Claude key; each with its own spending limit at the provider where offered.
- After the key broker exists (`ENGINE_ACCESS_PLAN.md` §3.2), **no provider key on any team
  member's PC**; the client keys live only in Vercel env.
- Rotate a key at once if it may have been exposed (a laptop lost, a member left with access to
  a machine that held it, a scanner finding).

### Step 6: machines

- Owner's PCs: BitLocker on, Windows sign-in, screen lock, antivirus on; the engine repo outside
  any synced folder.
- Directors' PCs: the checks in `JOINING_AND_LEAVING.md`; `client-import` refuses to run when
  BitLocker is off or the folder is synced.

### Step 7: monitoring

- GitHub audit log (organisation) reviewed monthly: new members, access changes, token use.
- Studio API cost log and the story access log reviewed weekly by the admin (part of the Monday
  summary, brief §12).
- Provider dashboards (ElevenLabs, Anthropic Console, image provider): usage alerts on.

## 4. If something goes wrong

1. Revoke first: mark the member inactive (Team page), remove them from GitHub, rotate any key
   that may be exposed.
2. Check the logs: story access, Studio API calls, GitHub audit log.
3. If a writer's story may have left our control: tell the writer, as the privacy policy
   requires, and record it.
4. Write it up in `docs/PROGRESS.md` with what changed so it can't happen again.
