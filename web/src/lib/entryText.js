import { formatDateTimeShort } from './dates.js';

const BLOCKS = new Set(['DIV', 'P', 'UL', 'OL', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE']);

// The text of an HTML node, one line per block, list items as "- item" lines
// and a link's address in brackets after its words. Only reads the parsed
// document; nothing here is ever put back into the page.
function nodeText(node) {
  if (node.nodeType === 3) return node.nodeValue;
  if (node.nodeType !== 1) return '';
  const tag = node.tagName;
  if (tag === 'BR') return '\n';
  const inner = Array.from(node.childNodes).map(nodeText).join('');
  if (tag === 'A') {
    const href = node.getAttribute('href');
    return href && href !== inner.trim() ? `${inner} (${href})` : inner;
  }
  if (tag === 'LI') return `- ${inner.trim()}\n`;
  if (BLOCKS.has(tag)) return `${inner.replace(/\n+$/, '')}\n`;
  return inner;
}

// An entry body (HTML) as plain text.
export function htmlToPlainText(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  return nodeText(doc.body).replace(/\n{3,}/g, '\n\n').trim();
}

// A whole card as plain text:
//   Alex Smith - 10-08-2026 3:12 PM
//   the entry text
//   Tags: Incident, FYI
export function entryToText(entry) {
  const lines = [`${entry.author_name} - ${formatDateTimeShort(entry.created_at)}`, htmlToPlainText(entry.body)];
  if (entry.tags && entry.tags.length) lines.push(`Tags: ${entry.tags.map((t) => t.name).join(', ')}`);
  return lines.join('\n');
}

// Copies text to the clipboard. The clipboard API only works on HTTPS or
// localhost, so on a plain-HTTP install fall back to a hidden text box.
// Returns true when it worked.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall through to the older way
  }
  try {
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand('copy');
    box.remove();
    return ok;
  } catch {
    return false;
  }
}
