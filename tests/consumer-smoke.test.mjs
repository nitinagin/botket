import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const page = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../consumer.html'), 'utf8');
const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
const app = scripts[0]?.[1] ?? '';

test('consumer application JavaScript parses', () => {
  assert.equal(scripts.length, 1, 'Expected one inline application script');
  assert.doesNotThrow(() => new Script(app, { filename: 'consumer.html' }));
});

test('all five navigation buttons point to real sections', () => {
  const expected = ['store', 'cart', 'robots', 'skills', 'services'];
  const tabs = [...page.matchAll(/<button\b[^>]*\bdata-tab="([^"]+)"[^>]*\baria-controls="([^"]+)"/g)]
    .map(([, tab, controls]) => ({ tab, controls }));
  assert.deepEqual(tabs.map(({ tab }) => tab), expected);
  assert.ok(tabs.every(({ tab, controls }) => tab === controls));
  const sections = [...page.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map(([, id]) => id);
  assert.deepEqual([...sections].sort(), [...expected].sort());
});

test('static HTML element IDs are unique', () => {
  const ids = [...page.matchAll(/<[a-z][^>]*\sid="([^"]+)"/gi)].map(([, id]) => id);
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length);
});

test('checkout and skills clearly remain demos', () => {
  assert.match(page, /This is an order preview, not a real checkout/i);
  assert.match(page, /No payment, reservation or order submission occurs/i);
  assert.match(page, /Compatibility is not verified, and installation is unavailable/i);
  assert.match(page, /disabled aria-disabled="true">Install unavailable/);
  assert.match(page, /Leave blank to preview as Guest/);
});

test('demo cart guards and section handoffs remain present', () => {
  assert.match(app, /cart\.some\(item=>item\.id===x\.id\)/);
  assert.match(app, /cart\.length>=20/);
  for (const id of [
    'openSkillsFromRobots',
    'openServicesFromSkills',
    'openSkillsFromServices',
    'checkoutToRobots'
  ]) {
    assert.ok(app.includes("byId('" + id + "').onclick"), 'Missing navigation handler: ' + id);
  }
});
