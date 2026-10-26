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

test('demo checkout preview and handoff handle robot, service, mixed and empty carts', () => {
  const preview = app.match(/byId\('preview'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  const handoff = app.match(/byId\('checkoutToRobots'\)\.onclick=(\(\)=>show\([^\n]*\));/);
  assert.ok(preview && handoff, 'Expected both demo checkout handlers');

  const robot = { id: 'r1', price: 34900 };
  const service = { id: 's1', price: 1500 };
  const cases = [
    { label: 'robot-only guest', items: [robot], name: '', expected: 'Preview for Guest: 1 robot concept(s), 0 service preview(s), total ฿34,900', destination: 'robots' },
    { label: 'service-only named', items: [service], name: 'Alex', expected: 'Preview for Alex: 0 robot concept(s), 1 service preview(s), total ฿1,500', destination: 'services' },
    { label: 'mixed guest', items: [robot, service], name: '', expected: 'Preview for Guest: 1 robot concept(s), 1 service preview(s), total ฿36,400', destination: 'robots' },
    { label: 'empty cart', items: [], name: '', expected: 'Add an item to preview a demo order.', destination: null }
  ];

  for (const scenario of cases) {
    const elements = {
      name: { value: scenario.name },
      result: { textContent: '' },
      checkoutToRobots: { hidden: true, textContent: '' }
    };
    let destination;
    const context = {
      cart: scenario.items,
      robots: [robot],
      byId: id => elements[id],
      money: n => '฿' + n.toLocaleString('en-US'),
      show: tab => { destination = tab; }
    };
    new Script('(' + preview[1] + ')').runInNewContext(context)();
    assert.ok(elements.result.textContent.includes(scenario.expected), scenario.label);
    assert.equal(elements.checkoutToRobots.hidden, !scenario.items.length, scenario.label);
    if (scenario.destination) {
      new Script('(' + handoff[1] + ')').runInNewContext(context)();
      assert.equal(destination, scenario.destination, scenario.label);
    }
  }
});

test('demo cart add handler rejects duplicates, unknown items and the 20-item limit', () => {
  const match = app.match(/document\.querySelectorAll\('\[data-add\]'\)\.forEach\(b=>b\.onclick=(\(\)=>\{[^\n]*\})\);/);
  assert.ok(match, 'Expected the demo cart add handler');

  const robot = { id: 'r1', price: 34900 };
  const anotherRobot = { id: 'r2', price: 24900 };
  const service = { id: 's1', price: 1500 };
  const cart = [];
  const button = { dataset: { add: robot.id } };
  const result = { textContent: '' };
  const destinations = [];
  const context = {
    cart,
    robots: [robot, anotherRobot],
    services: [service],
    b: button,
    lastBrowseTab: 'store',
    show: tab => destinations.push(tab),
    byId: id => id === 'result' ? result : undefined
  };
  const addItem = new Script('(' + match[1] + ')').runInNewContext(context);

  addItem();
  assert.equal(cart.length, 1, 'First robot concept should be added');
  assert.equal(cart[0].id, robot.id);
  assert.equal(destinations.at(-1), 'cart');

  addItem();
  assert.equal(cart.length, 1, 'Repeated click must not duplicate the item');
  assert.match(result.textContent, /already in your cart/i);

  button.dataset.add = service.id;
  addItem();
  assert.equal(cart.length, 2, 'A different service preview can be added');
  assert.equal(cart[1].id, service.id);

  button.dataset.add = 'unknown';
  addItem();
  assert.equal(cart.length, 2, 'Unknown catalog IDs must be ignored');

  cart.push(...Array.from({ length: 18 }, (_, i) => ({ id: 'placeholder-' + i })));
  button.dataset.add = anotherRobot.id;
  addItem();
  assert.equal(cart.length, 20, 'Cart must not exceed the demo limit');
  assert.match(result.textContent, /limit reached/i);
});
