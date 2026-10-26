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

test('demo cart remove and clear handlers keep totals and preview state consistent', () => {
  const renderSource = app.match(/function renderCart\(\)\{[^\n]*\}/);
  const clearSource = app.match(/byId\('clearCart'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  assert.ok(renderSource && clearSource, 'Expected both cart handlers');
  let focused;
  const node = () => ({
    children: [], attributes: {},
    replaceChildren(...items) { this.children = items; },
    append(...items) { this.children.push(...items); },
    setAttribute(key, value) { this.attributes[key] = value; },
    querySelectorAll(selector) {
      const key = selector.slice(1, -1);
      return this.children.flatMap(item => [item, ...(item.children || [])])
        .filter(item => Object.hasOwn(item.attributes || {}, key));
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    focus() { focused = this; }
  });
  const elements = Object.fromEntries(
    ['items', 'cartSummary', 'total', 'count', 'clearCart', 'browseFromCheckout',
      'preview', 'checkoutToRobots', 'name', 'result'].map(id => [id, node()])
  );
  const robot = { id: 'r1', name: 'Robot Concept', price: 34900 };
  const service = { id: 's1', name: 'Service Preview', price: 1500 };
  let confirmed = false;
  const context = {
    cart: [robot, service], robots: [robot], services: [service],
    lastBrowseTab: 'store', byId: id => elements[id],
    money: n => '฿' + n.toLocaleString('en-US'),
    document: { createElement: node },
    window: { confirm: () => confirmed },
    show: () => {}
  };
  context.renderCart = new Script('(' + renderSource[0] + ')').runInNewContext(context);
  const render = () => context.renderCart();
  elements.name.value = 'Guest nickname';
  elements.checkoutToRobots.hidden = false;
  render();
  assert.equal(elements.total.textContent, 'Total: ฿36,400');
  assert.equal(elements.count.textContent, 2);
  assert.equal(elements.checkoutToRobots.hidden, true);

  elements.items.children[0].children[1].onclick();
  assert.deepEqual(context.cart.map(item => item.id), ['s1']);
  assert.equal(elements.total.textContent, 'Total: ฿1,500');
  assert.equal(elements.count.textContent, 1);
  assert.equal(focused, elements.items.children[0].children[1]);

  elements.items.children[0].children[1].onclick();
  assert.equal(context.cart.length, 0);
  assert.equal(elements.total.textContent, 'Total: ฿0');
  assert.equal(elements.preview.disabled, true);
  assert.equal(elements.name.value, '');
  assert.equal(focused, elements.items.children[1]);

  context.cart = [robot, service];
  elements.name.value = 'Guest nickname';
  render();
  const clear = new Script('(' + clearSource[1] + ')').runInNewContext(context);
  clear();
  assert.equal(context.cart.length, 2, 'Cancel preserves cart');
  confirmed = true;
  clear();
  assert.equal(context.cart.length, 0);
  assert.equal(elements.count.textContent, 0);
  assert.equal(elements.preview.disabled, true);
  assert.equal(elements.name.value, '');
  assert.match(elements.result.textContent, /Cart cleared\. No order was placed/i);
});

test('demo robot profile registration selects new profiles and protects duplicates and the limit', () => {
  const source = app.match(/function addDemoRobot\(name,brand,model\)\{[^\n]*\}/);
  assert.ok(source, 'Expected the demo profile registration function');
  const elements = { profileSearch: { value: 'old filter' }, robotMessage: { textContent: '' } };
  let nextId = 0;
  let destination;
  const context = {
    mine: [], selectedRobotId: null,
    byId: id => elements[id],
    demoId: () => 'demo-' + ++nextId,
    saveRobots: () => true,
    show: tab => { destination = tab; }
  };
  const add = new Script('(' + source[0] + ')').runInNewContext(context);

  assert.equal(add('Study Robot', 'Example Maker', 'Model A'), true);
  assert.equal(context.mine.length, 1);
  assert.equal(context.selectedRobotId, 'demo-1');
  assert.equal(elements.profileSearch.value, '', 'Saving reveals the new profile');
  assert.equal(destination, 'robots');
  assert.match(elements.robotMessage.textContent, /compatibility not verified/i);

  assert.equal(add(' study   robot ', 'EXAMPLE MAKER', 'model a'), false);
  assert.equal(context.mine.length, 1, 'Normalized duplicate must not be saved');
  assert.equal(context.selectedRobotId, 'demo-1', 'Duplicate preserves selection');
  assert.match(elements.robotMessage.textContent, /already saved/i);

  for (let i = 1; i < 30; i++) {
    assert.equal(add('Robot ' + i, 'Example Maker', 'Model A'), true);
  }
  assert.equal(context.mine.length, 30);
  const selectedAtLimit = context.selectedRobotId;
  assert.equal(add('Robot 31', 'Example Maker', 'Model A'), false);
  assert.equal(context.mine.length, 30);
  assert.equal(context.selectedRobotId, selectedAtLimit);
  assert.match(elements.robotMessage.textContent, /limit: 30 profiles/i);

  const session = {
    mine: [], selectedRobotId: null,
    byId: id => elements[id],
    demoId: () => 'session-only',
    saveRobots: () => false,
    show: () => {}
  };
  const addSession = new Script('(' + source[0] + ')').runInNewContext(session);
  assert.equal(addSession('Offline', 'Example Maker', 'Model B'), true);
  assert.equal(session.selectedRobotId, 'session-only');
  assert.match(elements.robotMessage.textContent, /will not survive a reload/i);
});
