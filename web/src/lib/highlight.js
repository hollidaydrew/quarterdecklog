// Highlights the words a search matched, inside an entry's HTML. The entry HTML
// is already cleaned on the server; here it is parsed (nothing in it runs), the
// matching stretches of TEXT are wrapped in <mark> through the DOM, and the
// result is written back out, so the text is escaped by the browser and no
// entry markup is ever put together by hand.

// Lower-case and strip accents while keeping the same length, so a position in
// the folded text is the same position in the original.
function fold(text) {
  let out = '';
  for (const ch of text) {
    const f = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    out += f.length === ch.length ? f : ch;
  }
  return out;
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const START = '(?<![\\p{L}\\p{N}])';
const END = '(?![\\p{L}\\p{N}])';

// One regular expression per search term, following the same rules as the
// server: words match from the start of a word; a quoted phrase matches whole
// words, in order, separated by anything that isn't a letter or number.
function patternFor(term) {
  const words = fold(term.text).split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(escapeRegex);
  if (words.length === 0) return null;
  const body = words.join('[^\\p{L}\\p{N}]+');
  return new RegExp(`${START}${body}${term.prefix ? '' : END}`, 'giu');
}

// The [start, end) stretches of `text` that match any term, merged.
export function findRanges(text, terms) {
  const folded = fold(text);
  const ranges = [];
  for (const term of terms) {
    const re = patternFor(term);
    if (!re) continue;
    let m;
    while ((m = re.exec(folded)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      ranges.push([m.index, m.index + m[0].length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

export function highlightHtml(html, terms) {
  if (!terms || terms.length === 0 || !html) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.nodeValue;
    const ranges = findRanges(text, terms);
    if (ranges.length === 0) continue;
    const frag = doc.createDocumentFragment();
    let pos = 0;
    for (const [start, end] of ranges) {
      if (start > pos) frag.append(doc.createTextNode(text.slice(pos, start)));
      const mark = doc.createElement('mark');
      mark.textContent = text.slice(start, end);
      frag.append(mark);
      pos = end;
    }
    if (pos < text.length) frag.append(doc.createTextNode(text.slice(pos)));
    node.replaceWith(frag);
  }
  return doc.body.innerHTML;
}
