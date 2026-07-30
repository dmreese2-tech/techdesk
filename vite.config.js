import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves a "project site" (not a custom domain) from
// https://<user>.github.io/<repo-name>/ — a subpath, not the root — so
// Vite needs to know that repo name to build correct asset paths.
// GITHUB_REPOSITORY is set automatically by GitHub Actions as "owner/repo";
// locally (npm run dev / a plain npm run build) it's unset and this just
// falls back to the root, which is what you want for local testing.
const repoName = process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.split('/')[1] : null;

export default defineConfig({
  plugins: [react()],
  base: repoName ? `/${repoName}/` : '/',
});
