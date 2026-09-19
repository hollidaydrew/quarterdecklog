import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// The app version comes from the root package.json, the release notes from
// CHANGELOG.md, the Credits tab from CREDITS.md, and the full third-party
// license texts from THIRD_PARTY_NOTICES.md. All four live in the repo root so
// what the app shows can never drift from what is in the repo. In the Docker
// build they are copied to /app, one level above this folder (see ../Dockerfile).
const rootDir = fileURLToPath(new URL('..', import.meta.url));
const readRoot = (name) => fs.readFileSync(`${rootDir}${name}`, 'utf8');
const pkg = JSON.parse(readRoot('package.json'));

// Publishes THIRD_PARTY_NOTICES.md as /third-party-notices.txt so the license
// texts of everything bundled into the browser code ship with the app.
const thirdPartyNotices = {
  name: 'third-party-notices',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'third-party-notices.txt', source: readRoot('THIRD_PARTY_NOTICES.md') });
  },
};

export default defineConfig({
  plugins: [react(), thirdPartyNotices],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __CHANGELOG__: JSON.stringify(readRoot('CHANGELOG.md')),
    __CREDITS__: JSON.stringify(readRoot('CREDITS.md')),
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
