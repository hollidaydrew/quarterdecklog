// Shared helper: lists every production (non-dev) package installed under a
// folder, transitive dependencies included, with its license and license files.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function productionPackages(dir) {
  let out;
  try {
    out = execSync('npm ls --omit=dev --all --json --long', { cwd: dir, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (err) {
    out = err.stdout; // npm ls exits non-zero for benign warnings; the JSON is still valid
  }
  const tree = JSON.parse(out.toString());
  const found = new Map();

  (function walk(deps) {
    for (const dep of Object.values(deps || {})) {
      if (dep.path && dep.name && dep.version && !found.has(`${dep.name}@${dep.version}`)) {
        found.set(`${dep.name}@${dep.version}`, readPackage(dep.path));
      }
      walk(dep.dependencies);
    }
  })(tree.dependencies);

  return [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function readPackage(pkgPath) {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgPath, 'package.json'), 'utf8'));
  let license = pkg.license || (pkg.licenses && pkg.licenses.map((l) => l.type).join(' OR ')) || 'UNKNOWN';
  if (typeof license === 'object') license = license.type || 'UNKNOWN';
  const files = fs
    .readdirSync(pkgPath)
    .filter((f) => /^(licen[cs]e|copying|notice|unlicense)/i.test(f) && fs.statSync(path.join(pkgPath, f)).isFile())
    .sort()
    .map((f) => ({ file: f, text: fs.readFileSync(path.join(pkgPath, f), 'utf8').replace(/\r\n/g, '\n').trim() }));
  const author = typeof pkg.author === 'string' ? pkg.author.replace(/\s*<[^>]*>/, '').replace(/\s*\([^)]*\)/, '') : pkg.author && pkg.author.name;
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository && pkg.repository.url;
  return { id: `${pkg.name}@${pkg.version}`, name: pkg.name, version: pkg.version, license, files, author: author || '', repo: repo || pkg.homepage || '' };
}
