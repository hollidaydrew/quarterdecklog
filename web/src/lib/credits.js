// Parses CREDITS.md into sections for the Credits tab:
//   ## Section title
//   Intro sentence(s) shown above the list.
//   - [Name](https://link) | License | What it is used for
// Items may also be plain text: - Name | License | What it is used for
export function parseCredits(markdown) {
  const sections = [];
  let section = null;

  for (const line of String(markdown || '').split(/\r?\n/)) {
    let m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      section = { title: m[1], intro: [], items: [] };
      sections.push(section);
      continue;
    }
    if (!section) continue;

    m = line.match(/^[-*]\s+(.+)$/);
    if (m) {
      const [first, license = '', purpose = ''] = m[1].split('|').map((part) => part.trim());
      const link = first.match(/^\[(.+?)\]\((https?:\/\/[^)\s]+)\)$/);
      section.items.push({
        name: link ? link[1] : first,
        url: link ? link[2] : null,
        license,
        purpose,
      });
      continue;
    }
    if (line.trim()) section.intro.push(line.trim());
  }
  return sections;
}
