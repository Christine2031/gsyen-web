const assert = require('node:assert/strict');
const test = require('node:test');
const { sanitizeOfficeHtml } = require('./sanitize-office-html.cjs');

test('removes executable Office HTML while preserving document structure', () => {
  const dirty = [
    '<h1 onclick="steal()">Title</h1>',
    '<script>steal()</script>',
    '<a href="javascript:steal()">bad</a>',
    '<table><tr><td colspan="2">safe</td></tr></table>',
    '<img src="data:image/png;base64,AAAA" onerror="steal()">',
    '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9c3RlYWwoKT4=">',
  ].join('');
  const clean = sanitizeOfficeHtml(dirty);

  assert.match(clean, /<h1>Title<\/h1>/);
  assert.match(clean, /<table>/);
  assert.match(clean, /colspan="2"/);
  assert.doesNotMatch(clean, /script|onclick|onerror|javascript:/i);
  assert.doesNotMatch(clean, /image\/svg\+xml/i);
});
