import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// The app version comes from the root package.json and the release notes from
// the root CHANGELOG.md, so a release is one edit in each place and the footer
// and release-notes modal can never drift from them. In the Docker build both
// files are copied to /app, one level above this folder (see ../Dockerfile).
const rootDir = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(fs.readFileSync(`${rootDir}package.json`, 'utf8'));
const changelog = fs.readFileSync(`${rootDir}CHANGELOG.md`, 'utf8');

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __CHANGELOG__: JSON.stringify(changelog),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:7272',
    },
  },
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
  },
});
