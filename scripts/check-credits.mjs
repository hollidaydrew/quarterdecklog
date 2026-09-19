// Fails (exit 1) if the credits or license notices have drifted from the code:
//  1. every direct dependency in server/ and web/ is named in CREDITS.md
//  2. every production package installed in server/ and web/ is in THIRD_PARTY_NOTICES.md
//  3. every production package uses a permissive license (a list you can extend on purpose)
// Run:  npm run check:credits   (needs `npm ci` run in server/ and web/)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { productionPackages } from './npm-tree.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const credits = fs.readFileSync(`${root}CREDITS.md`, 'utf8').toLowerCase();
const notices = fs.readFileSync(`${root}THIRD_PARTY_NOTICES.md`, 'utf8');
const problems = [];

// Direct dependencies must be credited (matched by name, or by its GitHub path for scoped packages).
for (const part of ['server', 'web']) {
  const pkg = JSON.parse(fs.readFileSync(`${root}${part}/package.json`, 'utf8'));
  for (const name of [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]) {
    const short = name.replace(/^@[^/]+\//, '');
    if (!credits.includes(name.toLowerCase()) && !credits.includes(`[${short.toLowerCase()}]`) && !credits.includes(`/${short.toLowerCase()})`)) {
      problems.push(`CREDITS.md does not mention ${name} (${part}/package.json)`);
    }
  }
}

const ALLOWED = new Set([
  'MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'BlueOak-1.0.0', '0BSD', 'CC0-1.0',
  '(MPL-2.0 OR Apache-2.0)', '(MIT OR WTFPL)', '(BSD-2-Clause OR MIT OR Apache-2.0)',
]);
for (const part of ['server', 'web']) {
  for (const pkg of productionPackages(`${root}${part}`)) {
    if (!notices.includes(`- ${pkg.id} (`)) problems.push(`THIRD_PARTY_NOTICES.md is missing ${pkg.id} - run: npm run generate:notices`);
    if (!ALLOWED.has(pkg.license)) problems.push(`${pkg.id} uses "${pkg.license}", which is not on the reviewed license list in scripts/check-credits.mjs`);
  }
}

if (problems.length) {
  console.error(`Credits check failed:\n - ${problems.join('\n - ')}`);
  process.exit(1);
}
console.log('Credits check passed: every dependency is credited and every package has its license text.');
