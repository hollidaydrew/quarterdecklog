// The release notes come from CHANGELOG.md, which also holds instructions for
// whoever runs the server (rebuild the container, the .env settings, upgrade
// steps). Everyone can open the release notes, but only admins need those
// parts, so people who aren't admins see the notes without them.

// Words that mark a sentence as being about running the server.
const SERVER_TALK = /docker|container|\.env\b|rebuild|restart|compose|README|MFA_|API_ENABLED|SESSION_SECRET/i;

const SENTENCE_BREAK = /(?<=[.!?])\s+/;

// One bullet with its server-only sentences taken out ('' when nothing is left).
function withoutServerTalk(item) {
  return item
    .split(SENTENCE_BREAK)
    .filter((sentence) => !SERVER_TALK.test(sentence))
    .join(' ')
    .trim();
}

// releases: the output of parseChangelog. Admins get them unchanged.
export function releasesFor(releases, isAdmin) {
  if (isAdmin) return releases;
  return releases.map((release) => ({
    ...release,
    sections: release.sections
      // The "Upgrading from x.y.z" sections are server steps, start to finish.
      .filter((section) => !/^upgrading/i.test(section.title))
      .map((section) => ({ ...section, items: section.items.map(withoutServerTalk).filter(Boolean) }))
      .filter((section) => section.items.length > 0),
  }));
}
