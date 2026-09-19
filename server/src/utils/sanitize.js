import sanitizeHtml from 'sanitize-html';

// Matches what the Trix editor produces (div lines, strong, em, del, a, h1,
// blockquote, pre, ul/ol/li) plus the tags older entries were saved with.
// Anything else (script, style, event handlers, iframes, data-* and class
// attributes, etc.) is stripped.
const OPTIONS = {
  allowedTags: [
    'div', 'p', 'br', 'strong', 'em', 'u', 's', 'del', 'code', 'pre',
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
