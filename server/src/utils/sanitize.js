import sanitizeHtml from 'sanitize-html';

// Matches the formatting options exposed by the Tiptap editor toolbar.
// Anything else (script, style, event handlers, iframes, etc.) is stripped.
const OPTIONS = {
  allowedTags: [
    'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
    'ul', 'ol', 'li', 'blockquote',
    'h1', 'h2', 'h3', 'a',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
};

export function sanitizeEntryBody(html) {
  return sanitizeHtml(html || '', OPTIONS).trim();
}
