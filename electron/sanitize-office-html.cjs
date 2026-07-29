const sanitizeHtml = require('sanitize-html');

const ALLOWED_TAGS = [
  'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'span', 'strong',
  'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
];

function sanitizeOfficeHtml(html) {
  return sanitizeHtml(String(html ?? ''), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['data'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    exclusiveFilter: frame =>
      frame.tag === 'img' &&
      typeof frame.attribs?.src === 'string' &&
      !/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(frame.attribs.src),
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...(attribs.href ? { href: attribs.href } : {}),
          ...(attribs.title ? { title: attribs.title } : {}),
          rel: 'noopener noreferrer',
        },
      }),
    },
  });
}

module.exports = { sanitizeOfficeHtml };
