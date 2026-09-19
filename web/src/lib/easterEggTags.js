// EASTER EGG TAGS (deliberately left out of the User Guide and release notes).
//
// When a tag with one of these names exists (any capitalisation), the day view
// shows a link under "+ New entry" to a special page listing every entry that
// uses the tag, newest first. That page shows the same cards as the day view,
// but plain white (no tint).
//
// To add another easter egg tag, add one item here:
//   slug      the page address: /tag/<slug>
//   tagName   the tag name to look for, lower case
//   label     link text under "+ New entry"
//   title     heading on the special page
//   tintClass optional CSS class that tints the card in the normal day view
//             (defined in styles/index.css); the special page never applies it
export const EASTER_EGG_TAGS = [
  {
    slug: 'incident',
    tagName: 'incident',
    label: 'Incidents',
    title: 'Incidents',
    tintClass: 'entry-incident',
  },
];

const norm = (name) => String(name || '').trim().toLowerCase();

export function findEasterEgg(slug) {
  return EASTER_EGG_TAGS.find((egg) => egg.slug === slug) || null;
}

// The easter eggs whose tag has been built (exists in the tag list).
export function activeEasterEggs(allTags) {
  const names = new Set((allTags || []).map((t) => norm(t.name)));
  return EASTER_EGG_TAGS.filter((egg) => names.has(egg.tagName));
}

// The tint class for an entry in the normal day view, or ''.
export function entryTintClass(entry) {
  const names = new Set(entry.tags.map((t) => norm(t.name)));
  const egg = EASTER_EGG_TAGS.find((e) => e.tintClass && names.has(e.tagName));
  return egg ? egg.tintClass : '';
}
