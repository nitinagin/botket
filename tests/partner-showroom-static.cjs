// Standalone static regression checks for the accelerator showroom preview.
// Run: node tests/partner-showroom-static.cjs
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'partner-showroom.html'), 'utf8');
const count = (pattern) => (html.match(pattern) || []).length;
assert.equal(count(/<article class="card">/g), 3, 'exactly three concept cards');
assert.equal(count(/<svg viewBox=/g), 3, 'all artwork is inline SVG');
assert.match(html, /CONCEPT PREVIEW · NOT INTEGRATED/, 'concept-only disclosure');
assert.match(html, /MANUFACTURER REFERENCE/, 'manufacturer reference label');
assert.match(html, /@media\(max-width:800px\)/, 'responsive breakpoint');
assert.doesNotMatch(html, /<img\b/i, 'no externally hosted image assets');
assert.doesNotMatch(html, /<script\b/i, 'static page without JavaScript');
assert.match(html, /no AI training, physics-accurate simulation/i, 'capability limitations');
assert.match(html, /href="https:\/\/github\.com\/nitinagin\/botket\/pull\/102"/, 'Robot City development PR link');
assert.match(html, /no verified X2 Ultra specifications or 3D model assets/i, 'no unverified AgiBot specifications');
assert.match(html, /not confirmed partner products/i, 'generic robots not represented as partners');
assert.match(html, /href="https:\/\/www\.agibot\.com\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/, 'manufacturer link uses safe new-tab attributes');
assert.match(html, /href="https:\/\/github\.com\/nitinagin\/botket\/issues\/119"[^>]*rel="noopener noreferrer"/, 'public verification tracker is linked safely');

// Guard against accidental third-party asset loads or unsafe external navigation.
assert.doesNotMatch(html, /<(?:iframe|video|audio|object|embed|link|source)\b/i, 'no embedded remote assets or stylesheets');
const externalAnchors = [...html.matchAll(/<a\b[^>]*href="https?:\/\/[^\"]+"[^>]*>/gi)];
assert.ok(externalAnchors.length >= 3, 'reference and tracker links exist');
for (const [anchor] of externalAnchors) {
  assert.match(anchor, /target="_blank"/, 'external links open in a new tab');
  assert.match(anchor, /rel="noopener noreferrer"/, 'external links protect opener and referrer');
}
console.log('PASS: 15 showroom static regression checks');
