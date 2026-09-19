// Parses CHANGELOG.md (Keep a Changelog layout) into release objects:
//   ## [0.2.0] - 2026-09-18
//   ### Added
//   - Something new
// Only headings and "- " bullets are read; continuation lines are joined to
// the bullet above them.
export function parseChangelog(markdown) {
  const releases = [];
  let release = null;
  let section = null;

  for (const line of String(markdown || '').split(/\r?\n/)) {
    let m = line.match(/^##\s+\[?(\d+\.\d+\.\d+[^\]\s]*)\]?\s+-\s+(\d{4}-\d{2}-\d{2})\s*$/);
    if (m) {
      release = { version: m[1], date: m[2], sections: [] };
      releases.push(release);
      section = null;
      continue;
    }
    if (!release) continue;

    m = line.match(/^###\s+(.+?)\s*$/);
    if (m) {
      section = { title: m[1], items: [] };
      release.sections.push(section);
      continue;
    }
    if (!section) continue;

    m = line.match(/^[-*]\s+(.+)$/);
    if (m) {
      section.items.push(m[1].trim());
      continue;
    }
    if (section.items.length && /^\s{2,}\S/.test(line)) {
      section.items[section.items.length - 1] += ` ${line.trim()}`;
    }
  }
  return releases;
}
