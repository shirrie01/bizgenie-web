const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

test('preview is explicitly isolated and not indexable', () => {
  assert.match(html, /name="robots" content="noindex"/);
  assert.match(html, /DEMO · No live account/);
  assert.match(html, /No data transmitted or saved/);
});

test('no live network, storage, payment or external script integration', () => {
  assert.doesNotMatch(html, /\bfetch\s*\(/);
  assert.doesNotMatch(html, /\bXMLHttpRequest\b/);
  assert.doesNotMatch(html, /\b(?:localStorage|sessionStorage)\b/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test('six-step state machine and demo-only safety text exist', () => {
  for (const step of ['Welcome','Business','Goal','Brand','Channels','Proposal']) {
    assert.match(html, new RegExp('\\b'+step+'\\b'));
  }
  assert.match(html, /No accounts are connected and nothing will publish/);
  assert.match(html, /No campaign has been generated, charged, saved, connected or published/);
});

test('responsive and reduced-motion basics exist', () => {
  assert.match(html, /name="viewport"/);
  assert.match(html, /@media\(max-width:850px\)/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /:focus-visible/);
});

test('text insertion has HTML escaping helper', () => {
  assert.match(html, /(?:const|function)\s+escapeHTML\s*=/);
  assert.match(html, /aria-live="polite"/);
});
