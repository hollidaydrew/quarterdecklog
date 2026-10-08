// The release notes in the app report what changed in how QuarterDeckLog
// looks and works: things added, changed, fixed or removed. CHANGELOG.md
// holds more than that (security and dependency updates, and the steps for
// upgrading a server), and that stays on GitHub, so those parts are left out
// of the app for everyone.

// Only these sections are shown (Keep a Changelog names).
const SHOWN_SECTIONS = /^(added|changed|fixed|removed|deprecated)$/i;

// A sentence about running the server rather than using the app is dropped
// from a bullet that is otherwise about the app.
const SERVER_TALK = /docker|container|\.env\b|rebuild|restart|compose|README|MFA_|API_ENABLED|SESSION_SECRET/i;
const SENTENCE_BREAK = /(?<=[.!?])\s+/;

function withoutServerTalk(item) {
  return item
    .split(SENTENCE_BREAK)
    .filter((sentence) => !SERVER_TALK.test(sentence))
    .join(' ')
    .trim();
}

// releases: the output of parseChangelog.
export function releasesFor(releases) {
  return releases.map((release) => ({
    ...release,
    sections: release.sections
      .filter((section) => SHOWN_SECTIONS.test(section.title.trim()))
      .map((section) => ({ ...section, items: section.items.map(withoutServerTalk).filter(Boolean) }))
      .filter((section) => section.items.length > 0),
  }));
}
