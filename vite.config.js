import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves this project from https://apps.upstage.systems/techdesk/
// — a subpath, not the root — so Vite needs this to build correct asset
// paths. This is hardcoded rather than auto-detected from the repo name:
// on this org's GitHub Enterprise + custom-domain Pages setup, the
// auto-detected value didn't match the actual serving path and produced
// a white page (confirmed live, fixed by hardcoding this).
export default defineConfig({
  plugins: [react()],
  base: '/techdesk/',
});
