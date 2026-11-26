# Team members: joining and leaving

Status: **checklists for future use.** Written 26 Nov 2026. Nobody else is on the team yet; today
every role (admin, director, reviewer) is the owner. Companion to `ENGINE_ACCESS_PLAN.md` and
`REPO_SECURITY.md`. Do not start anyone before `ENGINE_ACCESS_PLAN.md` §6 steps 2, 4, 5 and 6
are done (agreement, `/studio`, Studio API, client commands).

## Roles

| Role | Does | Sees |
|---|---|---|
| Admin | Runs the service: settings, refunds, team, legal entity | Everything in `/admin` |
| Director | Directs assigned Varta Vishva Directors orders: calls the writer within 2 days, makes the sample and the work on their PC | Their assigned orders in `/studio`; `vv-engine` read only |
| Reviewer | Checks orders before delivery; the on-duty reviewer gets "needs your eye" alerts | Orders under review |

Weekly cap per director: 1 new order a week in their first month of directing, then 2
(`creators.flow.directed`).

## Joining

### Before any access
- [ ] Signs the **confidentiality and ownership agreement** (lawyer-checked): writers' stories
      and data stay confidential; all order work and any engine improvements belong to Varta
      Vishva; no copying of the engine, library or rules; return or delete everything on leaving.
- [ ] Credit name agreed (it appears in "Directed by <name>, Varta Vishva Directors ·
      AI-assisted voices and illustrations").
- [ ] Hourly rate agreed (default ₹1,000/h; the Team page holds it).

### Accounts
- [ ] Added on **Admin → Creator's Space → Team and roles**: name, email, roles, the
      **confidentiality signed** date (no orders or access before it), "directing since" date.
- [ ] `/studio` sign-in works with their email; they see no orders until one is assigned.
- [ ] GitHub: their own account with **two-factor login**; added to the organisation team
      `directors` (read only on `vv-engine`); never on the Ramayana repo or the site repo.

### Their PC (checked on a call, screen shared)
- [ ] Windows account with a password; screen lock; antivirus on; updates on.
- [ ] **BitLocker on** for the drive that will hold `D:\clients\`.
- [ ] `D:\clients\` is outside any git repository and outside OneDrive / Google Drive / Dropbox.
- [ ] `vv-engine` installed from the repo (read only) or the package; `client-purge` scheduled
      daily.
- [ ] `client-import` test on a sample order passes its own checks (BitLocker, folder, sign-in).
- [ ] No provider keys on the PC (the Studio API holds them).

### First order
- [ ] Shadowed: the reviewer follows the whole order (call, plan, sample, final) and checks it.
- [ ] Hours logged on the request page; compared with the hours in the price.

## Leaving (same day)

- [ ] **Team page: mark inactive** (cuts `/studio` and every Studio API call at once).
- [ ] GitHub: removed from the organisation.
- [ ] Open orders re-assigned to another director (request page → Director → Assign); writers
      told who their new director is, in the team voice.
- [ ] Purge log shows every `D:\clients\<id>\` folder of theirs deleted; any not yet due is
      deleted now and logged.
- [ ] Written confirmation that nothing was kept (as the agreement requires).
- [ ] Any key that may have touched their machine is rotated (should be none after the key
      broker exists).
- [ ] Recorded in `docs/PROGRESS.md` (date, who handed over what; no personal details beyond the
      name).

## Every month

- [ ] Review the story access log and Studio API costs per member.
- [ ] Review the GitHub audit log (members, access changes).
- [ ] Spot-check one director's PC purge log against delivered orders.
