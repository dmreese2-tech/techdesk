# Handoff — finishing the department merge

Written at the end of the session that did the data migration. Two items remain,
and they have to happen in this order.

---

## Where things stand

Four migrations are **applied and verified** against live data:

| File | What it did |
|---|---|
| `supabase/15-departments-pass1.sql` | Built the merged `org_settings.departments`, rewrote nothing |
| `supabase/16-departments-pass2.sql` | Deleted `light_op`/`sound_op`/`stage_hand`; derived departments from job titles for 10 staff |
| `supabase/17-departments-leadership.sql` | Added `leadership` (Production office); placed 3 Producers + 1 Technical Director |
| `supabase/18-office-merge.sql` | Folded the stray `office` key into `back_office` |

**The data is clean.** Every person is filed under a department that exists.
Verified by the orphan query at the bottom of `18-office-merge.sql` — keep that
query; it states the invariant without needing a list of bad keys, which is why
it caught what pass two missed.

Staff distribution as of the last run (19 assignments, 9 departments):

```
back_office 4   leadership 4   directing 2   props 2   sm 2
wardrobe 2      band 1         electrics 1   sound 1
```

There are **no cues, no inventory items, and no crew/actor/musician assignments**
with a department value. The merge landed before the data did. That means the
remaining work carries almost no data risk — it is all client code.

### The merged department shape

`org_settings.departments` is a jsonb object, key → `{label, cue?, color, stock}`.
`cue` present means the department calls cues; `stock: true` means it can hold
inventory.

| key | label | cue | stock |
|---|---|---|---|
| `electrics` | Electrics | LX | yes |
| `sound` | Sound | SND | yes |
| `scenic` | Scenic | SCENE | yes |
| `rigging` | Rigging | FLY | yes |
| `sm` | Stage management | SM | no |
| `props` | Props | — | yes |
| `wardrobe` | Wardrobe | — | yes |
| `consumables` | Consumables | — | yes |
| `general` | General hands | — | no |
| `directing` | Directing | — | no |
| `back_office` | Back office | — | no |
| `band` | Band | — | no |
| `leadership` | Production office | — | no |

Decisions already settled, do not relitigate:

- **`people.kind` is the section** (Crew, Staff, Actors, Musicians). The old
  staff area "Technical" was a worse second copy of the Crew roster and is not a
  department.
- **Band sections stay unfolded** — they become *positions* under the single
  `band` department, not departments.
- **Light Op / Sound Op / Stage Hand are positions**, not departments.
- **Production office** holds the company-wide roles (Producer, Co-Producer,
  Technical Director, General Manager). They sit over the departments rather than
  inside one, which is why they get a department of their own instead of being
  forced into Back office.

---

## ⚠ The trap: `inventoryCategories` means two different things

This will cause a permissions bug if missed, and both meanings appear in the
same file.

1. **The taxonomy** — `org_settings.inventory_categories`, the list of stock
   categories. **This is what the merge replaces** (by `departments` entries with
   `stock: true`).
2. **The grant list** — `position_permissions.inventory_categories`, an array of
   category keys a given position is allowed to write. **This must not be
   touched.** It is load-bearing for who can edit stock.

Where each appears:

- `permissions.js:86, 99, 119, 140` — **all four are the grant list.** Leave alone.
- `PositionPermissions.jsx` — **both.** `draft.inventoryCategories` and
  `value.inventoryCategories` are the grant list. The `inventoryCategories` prop
  (line 51, 191) and `categories` memo (line 216) are the taxonomy, passed in
  from `Settings.jsx:619`. Only the prop side changes.
- `importSpecs.jsx:215–222` — taxonomy.
- `TechDeskDashboard.jsx:521, 621` — `canWrite.inventoryCategories` is a `Set`
  derived from the grant list. Leave alone.

---

## Item 1 — client refactor (do this first) — **DONE, not yet shipped**

Built and lint-clean; steps 4–6 of the verification checklist need a browser and
are still open. What actually changed is at the bottom, under
"Item 1 as built". Two things found on the way out are flagged there — one of
them is a pass-three blocker that is not in Item 2 as written.

Point the four superseded lists at `departments`. **70 references across 10
files.** Nothing is dropped from the database in this step, so the app keeps
working throughout and can be shipped mid-way.

The four lists and what replaces them:

| Old | Replacement |
|---|---|
| `staffAreas` / `staff_areas` | `departments` |
| `cueDepts` / `cue_depts` | `departments` (the `cue` and `color` fields) |
| `inventoryCategories` (taxonomy only) | `departments` filtered to `stock: true` |
| `musicSections` / `music_sections` | positions under the `band` department |

Call sites, by file:

- **`persistence.js:169, 187–193, 361–367`** — read/write mapping and
  `DEFAULT_TAXONOMY_JSON`. Start here; it defines the shape everything else sees.
- **`TechDeskDashboard.jsx`** (27 refs) — four `useState` declarations
  (458–464), hydrate block (527–533), save block (665–668), the memo dep list
  (678–679), and the props threaded into Musicians, Staff, Audio, Inventory, Set,
  RunOfShow, Script and Settings (1058–1154). The modules take screaming-case
  props (`STAFF_AREAS`, `CUE_DEPTS`, `INVENTORY_CATEGORIES`); simplest path is to
  keep the prop names and change what feeds them, then rename in a second pass.
- **`Settings.jsx:619`** — taxonomy into `PositionPermissionsPanel`.
- **`shared.jsx:955–958`** — `deptColor(deptKey, cueDepts)` → takes `departments`.
- **`importSpecs.jsx:132, 138, 215–222, 244–250`** — CSV import label matching.
- **`People.jsx:776`**, **`Inventory.jsx:599`**, **`RunOfShow.jsx:285`** — import
  call sites passing taxonomy context.
- **`PositionPermissions.jsx`** — prop side only. See the trap above.

Also in this item, the UI the merge exists to enable:

- **Departments editor in Settings** — name, cue prefix, colour, keeps-stock.
  Replaces the four separate taxonomy editors.
- **Positions gains a department column**, and absorbs the "What each position
  can edit" panel.
- Note `serializeTaxonomy`/`deserializeTaxonomy` in `TechDeskDashboard.jsx`
  already carry `color` and tolerate the old bare-string form. They need `cue`
  and `stock` added, with the same tolerance.

## Item 2 — pass three (only after Item 1 ships)

Five lines: drop `staff_areas`, `inventory_categories`, `cue_depts`,
`music_sections` from `org_settings`.

> ⚠ **It is not five lines. `my_writable_inventory()` reads
> `inventory_categories`.** It is a `security definer` function in the database,
> not client code, so nothing in Item 1 touched it and grepping the client will
> never find it. Drop the column and the function fails; the Inventory module
> asks it what is editable, so the breakage lands in exactly the place this
> handoff warns about. `supabase/19-writable-inventory-departments.sql` repoints
> it at the stock departments — **run and verify that first**, then pass three.

**Do not run this before Item 1.** Dropping them while the client still reads
them does not fail loudly — it hands `undefined` to code expecting an object,
which is the exact shape of the two black screens this project has already had,
and one of the affected files decides who can edit what.

Before running: re-run the orphan query from `18-office-merge.sql` and confirm
zero rows.

---

## Project mechanics that will bite

- **Never commit from the sandbox.** It sees CRLF vs LF and reports every file
  modified. Push only via GitHub Desktop on Windows.
- **Normalise to CRLF before structural edits.** Mixed endings broke
  line-indexed edits repeatedly.
- **The Supabase SQL editor renders stale when its tab is backgrounded.** It has
  shown a previous query's result and silently swallowed Run clicks. Verify every
  migration independently — via PostgREST (`/rest/v1/...`) or by re-querying with
  the tab focused. A migration that *looks* applied may not be.
- **`create or replace function` cannot widen a return type** (42P13). Needs
  `drop function if exists ...` first.
- **`alter table storage.objects enable row level security` fails** with
  `42501: must be owner` and takes the whole migration down. Supabase already
  enables it. Never include it.
- **RLS gates rows, not columns.** This is why `show_items` is split and why
  `people_view` redacts contacts.
- **`vite build` catches syntax, not undefined identifiers.** Run ESLint
  `no-undef` too — but note it does **not** catch an undefined identifier used as
  a JSX attribute value (`orgId={orgId}` with no `orgId` in scope shipped three
  times this way). Hand-check props threaded into modules.
- **Scan for use-before-declaration.** Two black screens were TDZ errors from a
  block referencing a `const` declared later in the same component.
- **GitHub Actions can stall on runner availability**, not repo config. "Waiting
  for a runner to pick up this job" with all-green GitHub status means wait or
  fire `workflow_dispatch` manually.

## Verification checklist for Item 1

1. `vite build` clean.
2. ESLint `no-undef` clean.
3. Hand-check every prop renamed in `TechDeskDashboard.jsx` actually exists in
   scope — ESLint will not catch these in JSX attribute position.
4. Load the app as an **admin** and as a **non-admin staff member**; confirm
   Settings renders and the right things are read-only.
5. Open Inventory, Run of Show, Script, Staff, Musicians, Set — every module that
   took a taxonomy prop.
6. Confirm `position_permissions.inventory_categories` still round-trips: change
   a position's stock grant, save, reload, verify it stuck.

## Unexercised UI carried over

Built but never used in anger — worth a pass when convenient: the invite code
panel and join-by-code flow, CSV import buttons on all 12 modules, the reference
image picker, costume grouping chips (NOT CAST / NO ROLE), the base/markup script
model, and the Director's view of Settings.

## Context

- Repo `dmreese2-tech/techdesk`, deployed to `https://apps.upstage.systems/techdesk/`
- Supabase project ref `kuvqyxqymucausiceazc`, org "InterACT"
- Design of record for permissions: `docs/permissions.md`

---

# Item 1 as built

Written at the end of the session that did the client refactor. `vite build`
clean, ESLint `no-undef` clean, `no-use-before-define` clean. Nothing was run
against the database.

## The shape everything now hangs off

`INITIAL_DEPARTMENTS` in `shared.jsx` is the merged thirteen, matching migrations
15–17 key for key, including `leadership`. An entry is
`{ label, icon, cue?, color, stock }`.

The four superseded lists are **derived, never stored**:

| Old | Now |
|---|---|
| `staffAreas` | `departments` (Staff files under a department, same as Crew) |
| `cueDepts` | `cueDepartments(departments, order)` — the ones with a `cue` |
| `inventoryCategories` (taxonomy) | `stockDepartments(departments, order)` — the ones with `stock` |
| `musicSections` | one `band` department; the sections are positions under it |

`cueDepartments()` presents the **cue prefix as `label`**, because `cueCode()` and
every cue picker read `.label` and a cue sheet says "LX 12", not "Electrics 12".
The department's own name survives as `.name`. Both derivations emit their keys
in `departmentOrder`, so a picker built from `Object.keys()` still reads in the
order the company chose.

Prop names were left alone as the handoff suggested — `STAFF_AREAS`, `CUE_DEPTS`,
`INVENTORY_CATEGORIES`, `MUSIC_SECTIONS` still arrive under those names, they are
just fed from `departments` now. Crew, Set, Script and Audio therefore have **no
diff at all**. Renaming them is still a second pass.

## Files touched

`shared.jsx` (the merged defaults + derivations), `persistence.js` (stopped
reading *and* writing the four columns), `TechDeskDashboard.jsx` (four `useState`
pairs deleted, four `useMemo`s in their place), `Settings.jsx` (new Departments
editor), `Positions.jsx` (department column), `PositionPermissions.jsx` (prop
side only), `importSpecs.jsx`, `People.jsx`, `Inventory.jsx`, `RunOfShow.jsx`,
`Set.jsx`, `permissions.js` (see below).

## Things found on the way that were not in the plan

**1. `my_writable_inventory()` reads `inventory_categories`.** The pass-three
blocker, written up above. `supabase/19-writable-inventory-departments.sql` is
prepared and **has not been run**.

**2. `POSITION_DEFAULTS` held labels where the database compares keys.** The
defaults said `inventory: ['Props']`; `can_write_inventory()` tests with jsonb
`?`, which is exact and case-sensitive, against keys like `props`. So "use the
usual permissions for a props master" has been silently granting **no stock at
all**, to every position, since the defaults were written. Changed to keys. This
touches `POSITION_DEFAULTS` only — the grant list itself
(`position_permissions.inventory_categories`, `permissions.js:86/99/119/140`) is
byte-for-byte untouched, as instructed. Anyone who already clicked the button has
a saved grant holding `'Props'` and needs re-ticking by hand.

**3. `crew_positions` / `musician_positions` / `staff_positions` exist in no
migration in this repo.** Not in `schema.sql`, not in 03–18. `persistence.js`
reads and writes all three. They presumably got added by hand in the SQL editor,
which is worth knowing on its own: the schema in this repo is not the whole
schema, and the next person to read `schema.sql` and believe it will be wrong in
the same way.

Positions now store `{ name, dept }` instead of a bare string, which needs those
columns to be `jsonb`. **Checked against the live database on 2026-08-10 — all
three are `jsonb`**, so no migration was needed and Item 1 shipped whole:

```sql
select column_name, data_type, udt_name
from information_schema.columns
where table_name = 'org_settings'
  and column_name in ('crew_positions','musician_positions','staff_positions');
-- crew_positions | jsonb | jsonb
-- musician_positions | jsonb | jsonb
-- staff_positions | jsonb | jsonb
```

Every read still goes through `positionList()`, which tolerates the bare strings
already stored, so a company that hasn't re-saved its settings is unaffected.

**4. A stale `department_order` would have hidden six departments.** The merge
added six; a company whose `department_order` still lists the original seven
would have had them filtered out of every roster and picker — present in the
data, invisible in the UI. Hydration now reconciles the two through `orderFor()`,
which appends anything the order doesn't mention rather than dropping it.

## Hardening, on the same principle as the orphan query

Places that would have thrown on a department that no longer exists, all of which
were reachable once departments became deletable in one editor rather than four:

- `Inventory.jsx` — `INVENTORY_CATEGORIES[item.category].icon` on an item whose
  department stopped keeping stock. Falls back to the raw key and a generic icon.
- `RunOfShow.jsx` — same for a cue whose department had its prefix cleared. The
  cue still renders, under its key, and stays selectable in the edit dropdown.
- `People.jsx` — the roster grouped **only** by `categoryOrder`, so anyone filed
  under an unknown department vanished from the on-show roster silently. They now
  get a group of their own, in amber, at the end. Silently dropping somebody from
  a roster is how a person misses a call.

## Still to do — needs a browser and a live org

Checklist items 4, 5 and 6 are untouched by this session:

4. Load as an **admin** and as a **non-admin staff member**; confirm Settings
   renders and the right things are read-only.
5. Open Inventory, Run of Show, Script, Staff, Musicians, Set.
6. Change a position's stock grant, save, reload, verify it stuck — this is the
   one that proves the grant list survived the refactor.

Worth adding to 4: the Departments editor is new UI. Tick STOCK off a department
that holds items and confirm Inventory degrades the way it's meant to rather than
going white.
