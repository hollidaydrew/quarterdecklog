// Turns what a person typed into a safe full-text query, using common search
// habits:
//   disk full        every word must match, in any order
//   disk*  / dis     a word matches from its start (diskspace, disks)
//   "disk full"      exact phrase, words together and in order
//   incident -test   a leading minus leaves a word out
//   web-01           treated as the phrase "web 01"
// Case and accents are ignored (the index does that). Punctuation is ignored,
// and words such as AND, OR, NOT and NEAR are plain words, never search syntax:
// every word is wrapped in quotes and stripped down to letters and numbers
// first, so nothing a person types can change the shape of the query.

const MAX_TERMS = 12;
const MAX_WORDS_PER_TERM = 10;

const wordsOf = (text) => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, MAX_WORDS_PER_TERM);

// "w1 w2" as a quoted FTS phrase; prefix=true lets the last word match from its start.
const phrase = (words, prefix) => `"${words.join(' ')}"${prefix ? '*' : ''}`;

// Returns { match, terms } or { error }. terms is what to highlight:
// [{ text, phrase, prefix }]. match is bound as a parameter, never pasted into SQL.
export function parseSearchQuery(raw) {
  const positive = [];
  const negative = [];
  const re = /(-?)"([^"]*)"?|(-?)(\S+)/gu;
  let m;
  while ((m = re.exec(String(raw || ''))) !== null) {
    const quoted = m[2] !== undefined;
    const words = wordsOf(quoted ? m[2] : m[4]);
    if (words.length === 0) continue;
    const negate = (quoted ? m[1] : m[3]) === '-';
    const term = {
      text: words.join(' '),
      phrase: words.length > 1,
      // An exact phrase in quotes matches whole words; everything else matches word starts.
      prefix: !quoted,
      words,
    };
    (negate ? negative : positive).push(term);
  }
  if (positive.length === 0) return { error: 'Add at least one word to search for.' };
  if (positive.length + negative.length > MAX_TERMS) return { error: `Use at most ${MAX_TERMS} words or phrases.` };
  const fts = (t) => phrase(t.words, t.prefix);
  let match = positive.map(fts).join(' AND ');
  if (negative.length) match = `(${match}) NOT (${negative.map(fts).join(' OR ')})`;
  return { match, terms: positive.map(({ text, phrase: isPhrase, prefix }) => ({ text, phrase: isPhrase, prefix })) };
}
