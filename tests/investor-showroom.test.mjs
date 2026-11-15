import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const showroom = readFileSync(new URL('../investor-showroom.html', import.meta.url), 'utf8');
const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const logo = readFileSync(new URL('../assets/botket-logo.svg', import.meta.url), 'utf8');

test('investor showroom uses official BOTKET logo and existing site CI', () => {
  assert.match(showroom, /<img[^>]+src="assets\/botket-logo\.svg"[^>]+alt="BOTKET"/);
  assert.match(showroom, /#10b847|#07873d/);
  assert.match(logo, /#10ac39/i);
  assert.match(logo, /#fa202a/i);
});

test('homepage offers showroom navigation without changing consumer prototype', () => {
  assert.match(home, /href="investor-showroom\.html"/);
  assert.match(home, /href="consumer\.html"/);
});

test('three model cards remain explicitly manufacturer references', () => {
  for (const model of ['AgiBot X2 family', 'Unitree G1', 'Universal Robots e-Series']) {
    assert.ok(showroom.includes(model), model);
  }
  assert.equal((showroom.match(/MANUFACTURER REFERENCE · NOT INTEGRATED/g) || []).length, 3);
  assert.equal((showroom.match(/<svg\s/g) || []).length, 3);
  assert.doesNotMatch(showroom, /<img[^>]+src="https?:/);
});

test('showroom is mobile responsive and no purchase or integration is claimed', () => {
  assert.match(showroom, /name="viewport"/);
  assert.match(showroom, /@media\(max-width:760px\)/);
  assert.match(showroom, /No partnership, resale rights, inventory/);
});
