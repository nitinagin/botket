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
console.log('PASS: 12 showroom static regression checks');
