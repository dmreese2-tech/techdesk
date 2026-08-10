# Tech Desk Dashboard — project knowledge

**Upload this to the Claude project knowledge.** It replaces the picture in the
project's current `memory.md`, which is stale: that file still names the
`sb_publishable_` API key failure as the immediate blocker (long resolved) and
knows nothing about the permissions model or the department merge, which are now
the centre of the app.

Last updated: August 2026.

---

## What this is

**Tech Desk Dashboard** — a production-management app for a working theatre
company (InterACT), built and used professionally, not a demo. It manages shows,
rosters (crew / cast / staff / musicians) with per-show assignments, scheduling,
acts and scenes, choreography and blocking, costumes, props, callboard, audio
plots, inventory with conflict detection, set pieces, run of show with cues, and
script PDFs with cue placement.

- React 18 + Vite 5, base path hardcoded to `/techdesk/`
- Supabase: Postgres with RLS, Auth, Storage, Realtime
- GitHub Actions → GitHub Pages, behind Cloudflare
- Live at `https://apps.upstage.systems/techdesk/`
- Repo `dmreese2-tech/techdesk`; Supabase project ref `kuvqyxqymucausiceazc`
- IndexedDB holds per-device state only (current show, sign-in identity).
  Supabase holds all shared production data.

## Current state (August 2026)

The permissions system is built and enforced. The department merge is complete on
the data side. What remains is tracked in `docs/handoff-department-merge.md` —
read that for the live task list; it is more specific than this file.

Recent migrations, all applied: `10-scripts-bucket` through
`19-writable-inventory-departments`. Numbered files in `supabase/` are
incremental migrations against the live project. **`schema.sql` is for standing
up a *fresh* project and is not applied to production** — a bucket described only
there once caused every script upload to fail for weeks.

---

## The permissions model

This is the most important thing to understand and the least obvious.

**Three tiers** on `org_members.tier`: `admin`, `staff`, `cast`. Tier sets the
floor — cast read less than staff — but tier is not what grants editing.

**Editing is granted per module, by position.** A props master edits Props and
nothing else. The grant lives in `position_permissions`, keyed by
`kind:position` (e.g. `staff:Props Creator`), and lists which modules that
position may write plus which inventory categories.

**Company-wide positions** — Producer, Co-Producer, Director, Assistant
Director, Technical Director — write across all productions rather than one.

**`can_write(org, show, module)`** is the single database-side answer to "may
this user edit this?" Storage policies for the `scripts` and `references`
buckets call it, which is why file paths are shaped
`{orgId}/{showId}/{module}/{id}` — the path carries what the policy needs.

Settled rulings, documented in `docs/permissions.md`:

- Cast see **all** scene memberships, not just their own roles. The only cast
  redaction is **contact details**, via `people_view`.
- Inventory is company stock. **Props and Costumes are separate categories** and
  do not grant access to inventory as a whole.
- Staff read everything. Cast do not.
- Director and Producer may edit staff positions and link users, but **may not
  make anyone an admin** (`protect_tier_changes()` trigger enforces this).
- Scripts: staff and admins publish versions; cast view and download only.

**Joining is by rotatable invite code** (`join_org_by_code`), not by org UUID.
The old path let any signed-in user who learned a company's UUID add themselves
at `staff` tier — that hole is closed and the UUID is no longer displayed.

## The department model

One list, `org_settings.departments`: key → `{label, cue?, color, stock}`.
Presence of `cue` means the department calls cues; `stock: true` means it can
hold inventory. Thirteen keys — see `docs/handoff-department-merge.md` for the
table.

It replaced four lists that described the same real-world departments and had
drifted apart: crew rosters, staff areas, inventory categories, cue departments.

Settled:

- **`people.kind` is the section** — Crew, Staff, Actors, Musicians. The old
  staff area "Technical" was a second, worse copy of the Crew roster and is not a
  department.
- **Light Op / Sound Op / Stage Hand are positions**, not departments.
- **Band sections are positions** under one `band` department.
- **Production office** (`leadership`) holds the company-wide roles. They sit
  over the departments rather than inside one.
- Cue numbers are plain integers **scoped per department** — LX 1 and SND 1 are
  independent sequences.

---

## Traps that have already caused outages

**`inventoryCategories` names two unrelated things.** The taxonomy of stock
categories (being replaced by `departments` with `stock: true`) and
`position_permissions.inventory_categories`, the list of categories a position
may write. Both appear in `PositionPermissions.jsx`. A find-and-replace across
that file silently rewrites who can edit stock, and neither the build nor the
linter objects.

**Database functions do not show up in a client grep.** `my_writable_inventory()`
reads `inventory_categories` and is `security definer` in the database. Planning
a column drop by grepping `src/` missed it entirely. Before dropping any
`org_settings` column, search the SQL too.

**RLS gates rows, not columns.** This is why `show_items` is split by module and
why contact redaction needs a separate view rather than a policy.

**The Supabase SQL editor renders stale when its tab is backgrounded.** It has
displayed a previous query's result and silently swallowed Run clicks. A
migration that looks applied may not be. Verify independently — PostgREST
(`/rest/v1/...`) or re-query with the tab focused.

**Two black screens were temporal dead zone errors** — a block referencing a
`const` declared later in the same component. `vite build` does not catch it.
Scan for use-before-declaration after moving code.

**ESLint `no-undef` does not catch an undefined identifier in JSX attribute
position.** `orgId={orgId}` with no `orgId` in scope shipped three times.
Hand-check props threaded into modules.

**Never commit from the sandbox.** It sees CRLF vs LF and reports every file as
modified. Push only via GitHub Desktop on Windows. Normalise to CRLF before
line-indexed edits.

**Postgres specifics:** `create or replace function` cannot widen a return type
(42P13) — `drop function` first. `alter table storage.objects enable row level
security` fails with `42501: must be owner` and takes the whole migration down;
Supabase already enables it, never include it. Newer Supabase projects need
explicit `GRANT`s that older ones handled automatically.

**Still true from earlier:** the `sb_publishable_...` key format does not behave
like the legacy `eyJ...` anon key for RLS-protected operations. Microsoft Safe
Links pre-consumes single-use email confirmation tokens, so email confirmation is
disabled in Auth settings. Vite's base path must be hardcoded for the custom
domain subpath.

---

## How to work on this

Douglas works in long iterative sessions and expects precise tracking of what is
done versus unfinished. Catch bugs mid-implementation rather than reporting them
after.

**Verification is the standard, not an extra.** In practice:

- `vite build` for syntax; ESLint `no-undef` for undefined identifiers; a
  use-before-declaration scan for TDZ; a JSX-component-import check for
  cross-file gaps.
- Prove RLS by impersonating a non-admin inside a rolled-back transaction:
  `set local role authenticated;` plus
  `select set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);`
- Verify every migration independently of the SQL editor's own output.
- Testing RLS as a superuser is meaningless — it bypasses RLS entirely.
- `tools/dept-title-mapping-test.py` is the pattern worth repeating: when logic
  is order-dependent and unreadable, build a dry-run harness and test it against
  realistic inputs before it touches live data. It caught two ordering bugs.

**Migrate in passes that rewrite nothing first.** The department merge ran as
pass one (build the new list, report what would move), then pass two (move it).
The report is what made pass two safe, and it is what revealed that no cues or
inventory existed yet.

**Prefer a reported blank to a plausible guess.** Migration 16 refuses to map
Producer or Technical Director to a department and lists those people for a human
instead. Once positions decide who can edit what, a wrong answer that looks right
is worse than an obvious gap.

**Check the invariant, not the known-bad values.** Pass two asked "who is on a
key I am removing?" and missed three people on a stray `office` key. The query
that finds this class of bug asks "who is on a key that is not a department?" —
it needs no list, so it cannot be incomplete. That query is at the bottom of
`supabase/18-office-merge.sql`; keep it.

---

## Files worth knowing

| Path | What it is |
|---|---|
| `docs/handoff-department-merge.md` | Live task state for the merge. Read first. |
| `docs/permissions.md` | Design of record for the permissions model. |
| `docs/project-knowledge.md` | This file. |
| `src/TechDeskDashboard.jsx` | App shell, ~1200 lines. State, hydrate, save, module routing. |
| `src/permissions.js` | Client side of `can_write`; the `canWrite` object. |
| `src/PositionPermissions.jsx` | Per-position module grants. Contains the naming trap. |
| `src/persistence.js` | Supabase read/write mapping. Defines the shape everything sees. |
| `src/csvImport.jsx`, `src/importSpecs.jsx` | CSV import across 12 modules. |
| `src/Script.jsx` | Base script + markup versions, cue placement, pdf.js. |
| `tools/dept-title-mapping-test.py` | Dry-run for the title→department CASE. |
| `supabase/NN-*.sql` | Incremental migrations, applied in order. |
| `supabase/schema.sql` | Fresh-project setup **only**. Not applied to production. |

## Unexercised UI

Built but never used in anger — worth a pass: the invite code panel and
join-by-code flow, CSV import on all 12 modules, the reference image picker,
costume grouping chips (NOT CAST / NO ROLE), the base/markup script model, and
the Director's view of Settings.
