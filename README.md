# Tech Desk Dashboard

A per-show production management tool for theater technical directors — built as a single React app that scopes everything (schedule, roster, gear, script) to whichever production you're currently working on.

On load, pick a show from the Dashboard (or work with no show selected to manage company-wide people, inventory, and settings). Everything else follows from there.

## Sections

- **Dashboard** — all productions at a glance, phase and status tracking
- **Schedule** — rehearsal/tech calendar with tech-week marking and attendance
- **Scenes** — the canonical Act/Scene list (including musical numbers), with cast assigned per scene; everything below references this instead of free-typed scene names
- **Crew / Actors / Musicians / Staff** — platform-level rosters with per-show role assignments and history, self-service sign-in, and reusable named groups (Leads, Ensemble 1, Electrics...)
- **Choreography** — blocking notes, reference video links, and click-to-place stage diagrams, tied to a scene
- **Costumes / Props** — acquisition tracking (from inventory, needs to buy, needs to build/bring in), acquired status, and location, tied to actor and/or scene
- **Calls** — the callboard: create/edit calls, assign people or whole groups to slots, track attendance, pull gear, and tag which scenes are being rehearsed
- **Audio** — auto-generated mic/DI/playback channel plot from cast and band assignments
- **Inventory** — stock tracking with per-unit status (broken/repaired/retired), cost and purchase history, and multi-show assignment with tech-week overlap conflict detection
- **Set** — the build list, with pieces composed of inventory components (e.g. a platform unit built from platform tops + legs)
- **Run of Show** — the calling script cue-by-cue, with department-scoped cue numbering (LX 1 and SND 1 are independent)
- **Script** — upload the show's PDF, click to place cues on the actual page, export an annotated copy
- **Settings** — venues, storage locations, instruments, and every category taxonomy (departments, cast types, staff areas, band sections, inventory categories, cue departments) are editable here and drive every picker in the app

## Getting started

This is now a real multi-user tool backed by Supabase — every signed-in member of your company shares the same production data, isolated per company via row-level security.

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Run the schema**: open the SQL editor in your project and run `supabase/schema.sql` from this repo. It creates every table, row-level security policy, and the private Storage bucket used for uploaded scripts.
3. **Copy your project's API values**: Project Settings → API, then:
   ```bash
   cp .env.example .env.local
   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
   ```
4. Install and run:
   ```bash
   npm install
   npm run dev
   ```
5. Create an account, then create your company (or join an existing one with its company ID, found in Settings → Company).

For a production build: `npm run build` then `npm run preview`, or deploy the `dist/` folder to any static host (Netlify and Cloudflare Pages both allow commercial use on their free tiers; Vercel's free tier is personal-use-only).

## Notes on data

Shared production data (shows, rosters, calls, inventory, cue sheets, taxonomies) lives in Supabase Postgres, scoped to your company by row-level security — verified by standing up a real local Postgres instance and confirming a simulated second company genuinely cannot read or write the first company's data, in either direction. Uploaded scripts are stored as files in Supabase Storage, not embedded in the database.

Multi-device sync is deliberately simple: when anyone changes shared data, everyone else's screen refetches and replaces its local copy — there's no field-level merge, so two people editing the exact same record at the exact same moment will have the later save win, same as most small-team tools.

A few things that are per-device, not shared, and stay in the browser's IndexedDB: which show you're currently looking at, and which identity (crew/cast/staff/band member) you're signed in as for the callboard. Those describe what *this device* is doing, not company data, so they don't sync.

**Before relying on this daily:** if you're on Supabase's free tier, note that free projects auto-pause after 7 days with no API traffic — a real consideration for a tool that goes quiet during dark weeks between productions. The paid tier removes that pause and adds backups. Also worth knowing: the JavaScript side of this integration (the persistence layer, auth flow, and realtime subscriptions) has been carefully written and the database schema has been verified against a real Postgres instance, but the app has not been exercised end-to-end against a live Supabase project — test the full signup → create company → add a show → sign in from a second browser flow yourself before trusting it with real production data.

## Stack

- [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- [lucide-react](https://lucide.dev/) for icons
- [pdfjs-dist](https://mozilla.github.io/pdf.js/) to render uploaded scripts
- [pdf-lib](https://pdf-lib.js.org/) to write cue placements into an exported PDF

## License

MIT — see [LICENSE](./LICENSE).
