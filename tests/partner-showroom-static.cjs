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
assert.match(html, /href="robot-city\.html"/, 'Robot City prototype link');
console.log('PASS: 9 showroom static regression checks');
