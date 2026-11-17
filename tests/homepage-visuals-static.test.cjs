// Homepage source-level regression checks. Not browser, Safari, or production acceptance.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
test('mobile viewport and original factory/Robot City art references', () => {
  assert.match(html, /name=["']viewport["']/);
  assert.ok(html.includes('assets/robot-factory-concept.svg'));
  assert.ok(html.includes('assets/robot-city-concept.svg'));
});
test('manufacturer references have names and links', () => {
  for (const name of ['UR5e', 'CRX-10iA', 'Go2']) assert.ok(html.includes(name), name);
  for (const host of ['universal-robots.com', 'fanucamerica.com', 'unitree.com']) assert.ok(html.includes(host), host);
});
test('no Investor Concept heading or unsupported live capability copy', () => {
  assert.doesNotMatch(html, /Investor Concept/i);
  assert.doesNotMatch(html, /(?:live|working|fully integrated)\s+(?:AI training|robot deployment|hardware integration)/i);
});
test('internal fragment targets exist', () => {
  const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]));
  for (const m of html.matchAll(/href=["']#([^"']+)["']/g)) assert.ok(ids.has(m[1]), '#'+m[1]);
});

test('mobile navigation remains visible and horizontally scrollable', () => {
  assert.match(html, /@media\s*\(max-width:720px\)/);
  assert.match(html, /\.navlinks\s*\{display:flex;order:3;width:100%;gap:10px;overflow-x:auto/);
  for (const target of ['investor-showroom.html', 'consumer.html', 'intelligence.html', 'community.html']) {
    assert.ok(html.includes('href="' + target + '"'), target);
  }
});
test('Robot City and manufacturer references disclose unverified capabilities', () => {
  assert.match(html, /Playable deployment is not yet verified/);
  assert.match(html, /not a confirmed BOTKET partner/);
  assert.match(html, /not a playable screenshot/);
  assert.match(html, /No verified simulation, AI training, hardware compatibility or purchasing transactions/);
});

test('featured model illustrations are disclosed and stock photos remain removed', () => {
  assert.doesNotMatch(html, /pexels\.com|images\.unsplash\.com/i);
  assert.equal((html.match(/class="model-card"/g) || []).length, 3);
  for (const model of ['UR5e', 'CRX-10iA', 'Unitree Go2']) {
    assert.ok(html.includes('not an exact depiction of ' + model), model);
  }
});
