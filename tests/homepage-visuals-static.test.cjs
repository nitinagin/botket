// Homepage source-level regression checks. Not browser, Safari, or production acceptance.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
test('mobile viewport and original factory/Robot City art references', () => {
  assert.match(html, /name=["']viewport["']/);
  assert.match(html, /assets\/robot-factory-concept\.svg/);
  assert.match(html, /assets\/robot-city-concept\.svg/);
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
