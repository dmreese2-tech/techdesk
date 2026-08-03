# Per-module permissions — design

What we're building: a member's write access is decided per module, per production,
derived from the positions they hold, with a per-person override. Cast and musicians
get accounts too, read-only, seeing only what concerns them. Postgres enforces all of
it — the UI hides what you can't touch, but the database is what says no.

This document is the plan of record. It is written to be argued with before any of it
is built.

---

## 1. What has to change first

Two things in the current schema make the feature impossible as-is.

**Modules are columns, not tables.** `schedule`, `acts`, `characters`, `choreography`,
`costumes`, `props`, `set_pieces` and `sound_effects` are all JSONB columns on a single
`shows` row. Postgres row-level security decides whether you may write *a row* — it has
no opinion about which columns you touched. So "props only" cannot be expressed until
those columns become rows.

This is worth doing for its own sake. Today the client saves the whole show row on every
edit, so the props master and the costume designer working at the same time overwrite
each other's module, silently, with no conflict and no warning. Splitting the columns out
fixes the permission problem and the clobbering problem with the same change.

**People aren't linked to logins.** `people` has a `name` and an `email`, but nothing
that ties Sarah-the-props-master the person to the account Sarah signs in with. Deriving
permission from someone's production role requires that link.

---

## 2. The shape

### 2.1 Modules

Eighteen sections, of which sixteen are permission subjects. `dashboard` is a read-only
view of everything else, and `script` is one PDF per show.

| Module key | Section | Data lives in |
|---|---|---|
| `production` | Production board — title, venue, director, dates, phase | `shows` scalar columns |
| `schedule` | Schedule | `show_items` |
| `scenes` | Scenes | `show_items` |
| `characters` | Characters | `show_items` |
| `choreography` | Choreography | `show_items` |
| `costumes` | Costumes | `show_items` |
| `props` | Props | `show_items` |
| `set` | Set | `show_items` |
| `audio` | Audio | `show_items` |
| `crew` | Crew | `people` |
| `actors` | Actors | `people` |
| `musicians` | Musicians | `people` |
| `staff` | Staff | `people` |
| `calls` | Calls | `calls` |
| `inventory` | Inventory | `inventory_items` |
| `runofshow` | Run of Show | `cues` |
| `script` | Script | Storage + `shows.script_meta` |
| `settings` | Settings — venues, positions, taxonomies | `org_settings` |

`settings` is admin-only and not grantable. Everything else can be granted.

### 2.2 One table for the show's contents

Following the pattern `people` already uses — a discriminator column instead of eight
near-identical tables:

```sql
create table show_items (
  id          text primary key default gen_random_uuid()::text,
  org_id      uuid not null references orgs(id) on delete cascade,
  show_id     text not null references shows(id) on delete cascade,
  module      text not null check (module in
                ('schedule','scenes','characters','choreography',
                 'costumes','props','set','audio')),
  data        jsonb not null default '{}',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on show_items (org_id, show_id, module, sort_order);
```

Each row is one prop, one costume, one scene, one schedule entry. `data` keeps the shape
the app already uses, so the modules themselves barely change — what changes is the
persistence layer underneath them.

Writes become per item rather than per show, which is what ends the clobbering.

### 2.3 Positions carry defaults

```sql
create table position_permissions (
  org_id        uuid not null references orgs(id) on delete cascade,
  position_kind text not null check (position_kind in ('crew','musician','staff','actor')),
  position      text not null,
  modules       jsonb not null default '[]',
  -- Inventory is company stock, so it is granted by category rather than
  -- wholesale. A props master writes the Props shelves and nothing else.
  inventory_categories jsonb not null default '[]',
  -- Leadership holds the whole company, not one production. A Technical
  -- Director doesn't stop being one on a show they aren't assigned to.
  company_wide  boolean not null default false,
  primary key (org_id, position_kind, position)
);
```

Positions already exist as company-level lists in Settings. This hangs a set of writable
modules off each one. Suggested defaults, editable per company:

| Position | Scope | Writes | Inventory |
|---|---|---|---|
| Producer, Co-Producer | company | everything except `settings` | all categories |
| Technical Director | company | everything except `settings` | all categories |
| Director, Assistant Director | company | `production`, `scenes`, `characters`, `actors`, `schedule` | — |
| Production / Stage Manager | per show | `schedule`, `calls`, `runofshow`, `scenes`, `script` | — |
| Props Master | per show | `props` | Props |
| Costume Designer, Wardrobe | per show | `costumes` | Wardrobe |
| Master Electrician | per show | `runofshow` | Electrics, Rigging |
| Sound Engineer | per show | `audio`, `runofshow` | Sound |
| Scenic, Carpenter | per show | `set` | Scenic |
| Choreographer | per show | `choreography`, `scenes` | — |
| Music Director | per show | `musicians`, `scenes` | — |
| Actor, Musician (any) | — | nothing — read only | — |

`inventory` in the `modules` list means every category; anything narrower goes in
`inventory_categories`, which draws from the same taxonomy the Inventory module filters
by. Granting `props` says nothing about the warehouse — the two are separate keys, and
the props master gets the Props shelves because that category is listed, not because
the module is.

A `company_wide` position ignores show assignments: those five roles write their modules
on every production the company has, present and future, without anyone remembering to
assign them.

### 2.4 Per-person override

```sql
create table member_permissions (
  org_id   uuid not null references orgs(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  show_id  text references shows(id) on delete cascade,   -- null = every show
  granted  jsonb not null default '[]',
  revoked  jsonb not null default '[]',
  primary key (org_id, user_id, coalesce(show_id, ''))
);
```

Grant and revoke rather than a replacement list, so an admin can say "also let her edit
props on this one show" without restating everything the position already allows.

**The resolution rule, in one line:**

> writable = (union of the modules of every position this user holds — on this show, or
> anywhere if the position is company-wide) ∪ granted − revoked

Admins skip the calculation entirely; they can write everything. Inventory resolves the
same way against categories rather than modules.

### 2.5 Linking people to accounts

```sql
alter table people add column user_id uuid references auth.users(id) on delete set null;
alter table org_members add column tier text not null default 'staff'
  check (tier in ('admin', 'staff', 'cast'));
```

`org_members.role` (admin/member) is replaced by `tier`:

- **admin** — everything, plus the roster and Settings
- **staff** — reads the whole company; writes only the modules resolved above. Everyone
  who runs the show sits here: production staff, crew, designers, stage management.
- **cast** — reads a fixed subset (below); writes nothing

Musicians sit in `cast` alongside actors unless someone gives them a staff position —
a music director or a pit player doubling as a designer gets moved up by their position,
not by their instrument.

The link itself: an admin picks the account from a dropdown on the person's card, or the
person claims themselves — signing up with an email that matches an unclaimed `people`
row offers "You appear on the Graveyard Girls company list as Sarah Chen. Is that you?"

### 2.6 What cast can read

This is the part that needs your eye, because it's the part that decides whether an actor
finds the app useful or useless.

Proposed: the schedule; calls they are slotted into; scenes they appear in via their
characters; costumes and props attached to their characters; run of show; the script.

Not: other people's phone numbers and emails, the inventory, the full crew roster, the
audio plot, budgets or notes fields on anything.

Contact details are the sharpest edge — `people` currently carries `phone` and `email`
for everyone, and every org member can read the whole table. Cast reading that is a
privacy problem, not just a tidiness one.

---

## 3. Enforcement

A `security definer` function resolves the answer once, and every policy calls it:

```sql
create or replace function can_write(check_org_id uuid, check_show_id text, check_module text)
returns boolean language plpgsql security definer stable set search_path = public as $$
...
$$;
```

Then, per table:

```sql
create policy "write props etc." on show_items
  for all using (can_write(org_id, show_id, module))
  with check (can_write(org_id, show_id, module));
```

`people`, `calls`, `inventory_items` and `cues` get the same treatment against their
matching module key. `shows` scalar edits check `production`. `org_settings` checks admin.

Reads stay company-wide for admin and staff. Cast reads go through a narrower set of
select policies plus a view that omits contact columns.

**The trap to avoid:** `can_write` must be `stable` and cheap. It runs on every row of
every statement. It reads `member_permissions`, `position_permissions` and `people` —
all small, all indexed, but the query needs to be written once and written well rather
than composed of three separate lookups per row.

---

## 4. The client

- Permissions load with the rest of the org data and land in one `permissions` object.
- A `useCan(module)` hook answers for the current show.
- The sidebar hides sections you can neither read nor write; sections you can read but
  not write render with inputs disabled, Add buttons gone, and Export CSV still there.
- The persistence layer moves from "save the whole show row" to per-item writes against
  `show_items`. This is the largest single piece of app work in the project.
- A rejected write must surface. Today a failed save sets a quiet flag; a permission
  denial needs to say so, in words, next to the thing that wouldn't save.

---

## 5. Order of work

Each phase leaves the app working and shippable.

1. **Accounts and identity** — `people.user_id`, `org_members.tier`, the link UI, the
   claim flow on sign-up. Nothing is restricted yet; the wiring just exists.
2. **Split the show row** — create `show_items`, migrate the eight JSONB columns into it,
   rewrite the persistence layer, drop the old columns once the app runs clean on the new
   shape. No behaviour change visible to anyone. Fixes concurrent editing on its own.
3. **Permission tables and resolution** — `position_permissions`, `member_permissions`,
   `can_write()`, the Settings UI for editing position defaults, the per-person override
   on the member card. Still not enforced.
4. **Turn on enforcement** — replace the blanket "org members can do anything" policies
   with the module-aware ones. This is the moment things can break; it is also one small,
   reversible migration.
5. **Client gating** — hide and disable, and say why when a write is refused.
6. **Cast tier** — the narrow read policies, the contact-detail view, and a cast-shaped
   dashboard that shows a performer their calls and their scenes rather than a production
   overview they can't act on.

Phase 2 is the expensive one and carries the only real data risk. The good news is timing:
your org has one production and the module lists are nearly empty, so the migration is
close to free right now and gets more expensive every week.

---

## 6. Settled

- **Inventory is company stock**, granted by category, never per show. `props` and
  `costumes` are modules; Props and Wardrobe are inventory categories; holding one says
  nothing about the other.
- **Producer, Co-Producer, Director, Assistant Director and Technical Director are
  company-wide.** They write their modules on every production without an assignment.
  Every other position is scoped to the shows it's assigned on.
- **Staff read everything. Actors do not.** No second axis for staff reads — a theatre
  company that trusts you to run a department trusts you to see the notes.

## 7. Still open

**Who links an account to a person?** Admin-only is safer and auditable; self-claim on
sign-up is the only thing that scales to a cast of forty, twice a season. The likely
answer is both — self-claim proposes the link, an admin confirms it — but that is a
build decision for Phase 1 and it's the one thing left that changes what gets written.
