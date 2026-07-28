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

```bash
npm install
npm run dev
```

Then open the printed local URL. For a production build:

```bash
npm run build
npm run preview
```

## Notes on data

There is no backend or account system. All data (shows, rosters, inventory, the uploaded script, etc.) lives in the browser and autosaves to **IndexedDB** as you work — it survives closing the tab or restarting the browser, but it's local to that one browser on that one device: nothing syncs across devices, and clearing site data / browsing data for this app clears it too. Settings shows when it last saved, and has a one-click reset back to the sample board (which also overwrites what's saved).

First visit (or any browser/context where IndexedDB is unavailable, e.g. some private-browsing modes) falls back to the built-in sample data with a note in Settings that changes won't persist.

The Script section is the one part of the app that touches a file outside its own state at all — it reads a PDF you choose locally and lets you download an annotated copy. Nothing is uploaded anywhere.

## Stack

- [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- [lucide-react](https://lucide.dev/) for icons
- [pdfjs-dist](https://mozilla.github.io/pdf.js/) to render uploaded scripts
- [pdf-lib](https://pdf-lib.js.org/) to write cue placements into an exported PDF

## License

MIT — see [LICENSE](./LICENSE).
