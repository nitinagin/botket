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

test('all five consumer sections are named screen-reader regions', () => {
  const sections = [
    ['store', 'Explore robots'],
    ['cart', 'Demo checkout'],
    ['robots', 'My Robots'],
    ['skills', 'Skills'],
    ['services', 'Services']
  ];
  for (const [id, title] of sections) {
    assert.match(page, new RegExp('<section id="' + id + '" aria-labelledby="' + id + '-title"'));
    assert.match(page, new RegExp('<h2 id="' + id + '-title">' + title + '<\\/h2>'));
  }
});

test('static HTML element IDs are unique', () => {
  const ids = [...page.matchAll(/<[a-z][^>]*\sid="([^"]+)"/gi)].map(([, id]) => id);
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length);
});


test('keyboard users can skip directly to the consumer workflow', () => {
  assert.match(page, /<body>\s*<a class="skip-link" href="#main-content">Skip to consumer platform<\/a>\s*<header>/);
  assert.match(page, /<main id="main-content" tabindex="-1">/);
  assert.match(page, /\.skip-link\{[^}]*position:absolute;[^}]*top:-80px;[^}]*z-index:200/);
  assert.match(page, /\.skip-link:focus-visible\{top:12px\}/);
});

test('mobile focus targets clear the fixed bottom navigation', () => {
  assert.match(page, /@media \(max-width: 640px\)/);
  assert.match(page, /html \{ scroll-padding-bottom: calc\(116px \+ env\(safe-area-inset-bottom\)\); \}/);
  assert.match(page, /section input:focus, section select:focus, section button:focus \{/);
  assert.match(page, /scroll-margin-bottom: calc\(116px \+ env\(safe-area-inset-bottom\)\)/);
});

test('buttons, fields, selects, and links keep a 3px keyboard focus ring', () => {
  assert.match(page, /button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible\{outline:3px solid #1b874e;outline-offset:2px\}/);
  const hrefs = [...page.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map(([, href]) => href);
  assert.deepEqual(hrefs, ['#main-content', 'academy.html']);
  assert.doesNotMatch(app, /createElement\((['"])a\1\)/);
  assert.match(page, /\.skip-link\{[^}]*position:absolute;[^}]*top:-80px;[^}]*z-index:200/);
  assert.match(page, /\.skip-link:focus-visible\{top:12px\}/);
  assert.doesNotMatch(page, /a:focus(?:-visible)?\{[^}]*outline:\s*(?:none|0)\b/);
});

test('mobile bottom navigation keeps whole labels, a non-color current section and safe-area insets', () => {
  const nav = page.match(/<nav class="tabs"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav, 'Expected the platform section navigation');
  for (const label of ['Discover', 'Checkout', 'My Robots', 'Skills', 'Services']) {
    assert.match(nav, new RegExp(`<span class="nav-label">${label}</span>`));
  }
  assert.match(nav, /<button\b[^>]*\bdata-tab="cart"[^>]*>[\s\S]*<span class="nav-count">\(<span id="count">0<\/span>\)<\/span>/);
  assert.match(nav, /data-tab="store"[^>]*aria-current="page"/);
  assert.match(page, /\.tabs button\.active::after,\.tabs button\[aria-current=page\]::after\{content:"";position:absolute;top:4px;left:8px;right:8px;height:4px;border-radius:2px;background:#111;pointer-events:none\}/);
  assert.match(page, /\.tabs button:focus-visible\{outline:3px solid #111;outline-offset:2px\}/);
  assert.match(page, /@media \(forced-colors: active\)\{\.tabs button\[aria-current=page\]::after\{background:Highlight\}\}/);

  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  assert.match(mobile, /padding: 8px max\(6px, env\(safe-area-inset-right\)\) calc\(8px \+ env\(safe-area-inset-bottom\)\) max\(6px, env\(safe-area-inset-left\)\)/);
  assert.match(mobile, /min-height: 48px/);
  assert.match(mobile, /box-sizing: border-box/);
  assert.match(mobile, /container-type: inline-size/);
  assert.match(mobile, /overflow-wrap: normal/);
  assert.match(mobile, /word-break: normal/);
  assert.match(mobile, /hyphens: none/);
  assert.match(mobile, /font-size: 10px;\s*font-size: clamp\(10px, 18cqi, 13px\)/);
  assert.match(mobile, /\.tabs button:focus-visible \{\s*outline: 3px solid #111;\s*outline-offset: 1px;\s*\}/);
  assert.doesNotMatch(mobile, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(mobile, /transition:|animation:/);
});

test('Discover results expose list semantics only for matching robot concepts', () => {
  assert.match(page, /id="products" aria-label="Robot concept search results"/);
  const renderSource = app.match(/function render\(\)\{[^\n]*/)?.[0];
  assert.ok(renderSource, 'Expected Discover renderer');
  assert.match(renderSource, /byId\('products'\)\.setAttribute\('role',visibleRobots\.length\?'list':'group'\)/);
  const cardSource = app.match(/function card\(x,action,variant=''\)\{[^\n]*\}/)?.[0];
  assert.ok(cardSource, 'Expected shared preview card renderer');
  const renderCard = new Script('(' + cardSource + ')').runInNewContext({ money: n => '฿' + n });
  const concept = renderCard({ name: 'Home Robot Concept', price: 1 }, '', 'concept-card');
  const generic = renderCard({ name: 'Robot Setup', price: 1 }, '');
  assert.match(concept, /^<article role="listitem" class="card concept-card">/);
  assert.doesNotMatch(generic, /role="listitem"/, 'Service cards should keep their existing semantics');
});

test('Discover and My Robots search inputs identify their result lists and live summaries', () => {
  assert.match(page, /id="robotSearch"[^>]*aria-describedby="filterSummary" aria-controls="products"/);
  assert.match(page, /id="profileSearch"[^>]*aria-describedby="profileSearchSummary" aria-controls="myrobots"/);
  assert.match(page, /id="filterSummary"[^>]*role="status" aria-live="polite"/);
  assert.match(page, /id="profileSearchSummary"[^>]*role="status" aria-live="polite"/);
  assert.match(page, /id="products" aria-label="Robot concept search results"/);
  assert.match(page, /id="myrobots" class="grid" aria-label="Saved demo robot profiles"/);
});

test('demo checkout cart exposes list semantics only when populated', () => {
  assert.match(page, /id="items" aria-label="Demo cart items"/);
  assert.doesNotMatch(page, /id="items"[^>]*aria-live/, 'Rebuilding the cart list must not announce every row and Remove button');
  assert.doesNotMatch(page, /id="cartSummary"[^>]*(?:role="status"|aria-live)/, 'The visible cart summary must not repeat the checkout status');
  assert.match(app, /root\.setAttribute\('role',cart\.length\?'list':'group'\)/);
  assert.match(app, /row\.setAttribute\('role','listitem'\)/);
});

test('checkout and skills clearly remain demos', () => {
  assert.match(page, /This is an order preview, not a real checkout/i);
  assert.match(page, /No payment, reservation or order submission occurs/i);
  assert.match(page, /Compatibility is not verified, and installation is unavailable/i);
  assert.match(page, /disabled aria-disabled="true"[^>]*>Install unavailable/);
  assert.match(page, /Leave blank to preview as Guest/);
});

test('checkout preview and follow-up buttons expose the no-payment warning to assistive technology', () => {
  const cart = page.match(/<section id="cart"[\s\S]*?<\/section>/)?.[0];
  assert.ok(cart, 'Expected the demo checkout section');
  const notice = cart.match(/<p id="checkoutDemoNotice" class="muted">([^<]+)<\/p>/);
  assert.ok(notice, 'Expected the visible checkout disclaimer');
  assert.match(notice[1], /order preview, not a real checkout/i);
  assert.match(notice[1], /No payment, reservation or order submission occurs/i);
  for (const id of ['preview', 'checkoutToRobots']) {
    const button = cart.match(new RegExp('<button\\b[^>]*\\bid="' + id + '"[^>]*>'))?.[0];
    assert.ok(button, 'Missing checkout action: ' + id);
    assert.match(button, /aria-describedby="checkoutDemoNotice"/,
      id + ' must reference the existing visible demo disclaimer');
  }
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
  const handoff = app.match(/byId\('checkoutToRobots'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  assert.ok(preview && handoff, 'Expected both demo checkout handlers');

  const robot = { id: 'r1', name: 'Home Robot Concept', price: 34900 };
  const secondRobot = { id: 'r2', name: 'Companion Robot Concept', price: 24900 };
  const service = { id: 's1', name: 'Robot Setup', price: 1500 };
  const cases = [
    { label: 'robot-only guest', items: [robot], name: '', expected: 'Preview for Guest: 1 robot concept(s), 0 service preview(s), total ฿34,900', destination: 'robots' },
    { label: 'service-only named', items: [service], name: 'Alex', expected: 'Preview for Alex: 0 robot concept(s), 1 service preview(s), total ฿1,500', destination: 'services' },
    { label: 'mixed guest', items: [robot, service], name: '', expected: 'Preview for Guest: 1 robot concept(s), 1 service preview(s), total ฿36,400', destination: 'robots' },
    { label: 'two robot concepts', items: [robot, secondRobot], name: '', expected: 'Preview for Guest: 2 robot concept(s), 0 service preview(s), total ฿59,800', destination: 'robots' },
    { label: 'empty cart', items: [], name: '', expected: 'Add an item to preview a demo order.', destination: null }
  ];

  for (const scenario of cases) {
    const elements = {
      name: { value: scenario.name },
      result: { textContent: '' },
      checkoutToRobots: { hidden: true, textContent: '' },
      robotMessage: { textContent: '' },
      serviceRobotContext: { textContent: '' }
    };
    let destination;
    const context = {
      cart: scenario.items,
      robots: [robot, secondRobot],
      byId: id => elements[id],
      money: n => '฿' + n.toLocaleString('en-US'),
      show: tab => { destination = tab; }
    };
    new Script('(' + preview[1] + ')').runInNewContext(context)();
    assert.ok(elements.result.textContent.includes(scenario.expected), scenario.label);
    if (scenario.items.length) {
      assert.ok(elements.result.textContent.includes('Items: ' + scenario.items.map(item => item.name + ' (' + context.money(item.price) + ')').join(', ') + '.'), scenario.label + ' lists the demo cart items');
      assert.match(elements.result.textContent, /No payment or order submission occurred/);
    } else {
      assert.doesNotMatch(elements.result.textContent, /Items:/, 'Empty cart should not show itemized preview');
    }
    assert.equal(elements.checkoutToRobots.hidden, !scenario.items.length, scenario.label);
    if (scenario.destination) {
      new Script('(' + handoff[1] + ')').runInNewContext(context)();
      assert.equal(destination, scenario.destination, scenario.label);
      const robotCount = scenario.items.filter(item => item.id === robot.id || item.id === secondRobot.id).length;
      if (robotCount) {
        assert.ok(elements.robotMessage.textContent.includes('demo preview for ' + robotCount + ' robot concept' + (robotCount === 1 ? '' : 's')), scenario.label);
        assert.match(elements.robotMessage.textContent, /does not confirm purchase, ownership, compatibility or hardware connection/i);
      } else {
        assert.equal(elements.robotMessage.textContent, '', 'Service-only handoff does not alter robot profile status');
        assert.match(elements.serviceRobotContext.textContent, /Service-only demo checkout preview: no service was booked and no payment was taken/);
        assert.match(elements.serviceRobotContext.textContent, /eligibility and compatibility remain unverified/);
      }
    }
  }
});

test('demo cart add handler rejects duplicates, unknown items and the 20-item limit', () => {
  const match = app.match(/document\.querySelectorAll\('\[data-add\]'\)\.forEach\(b=>b\.onclick=(\(\)=>\{[^\n]*\})\);/);
  assert.ok(match, 'Expected the demo cart add handler');

  const robot = { id: 'r1', name: 'Home Robot Concept', price: 34900 };
  const anotherRobot = { id: 'r2', name: 'Companion Robot Concept', price: 24900 };
  const service = { id: 's1', name: 'Robot Setup', price: 1500 };
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
  assert.equal(result.textContent, 'Added robot concept "Home Robot Concept" to demo cart. 1 demo item in cart. Preview again to continue. No order was placed.');

  addItem();
  assert.equal(cart.length, 1, 'Repeated click must not duplicate the item');
  assert.match(result.textContent, /already in your cart/i);

  button.dataset.add = service.id;
  addItem();
  assert.equal(cart.length, 2, 'A different service preview can be added');
  assert.equal(cart[1].id, service.id);
  assert.equal(result.textContent, 'Added service preview "Robot Setup" to demo cart. 2 demo items in cart. Preview again to continue. No order was placed.');

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
      'preview', 'checkoutToRobots', 'name', 'clearPreviewName', 'result', 'reviewServicesCart', 'reviewDiscoverCart', 'reviewRobotsCart', 'reviewSkillsCart'].map(id => [id, node()])
  );
  const robot = { id: 'r1', name: 'Robot Concept', price: 34900 };
  const service = { id: 's1', name: 'Service Preview', price: 1500 };
  let confirmed = false, confirmationMessage = '';
  const context = {
    cart: [robot, service], robots: [robot], services: [service],
    lastBrowseTab: 'store', byId: id => elements[id],
    money: n => '฿' + n.toLocaleString('en-US'),
    document: { createElement: node },
    window: { confirm: message => { confirmationMessage = message; return confirmed; } },
    show: () => {}
  };
  context.renderCart = new Script('(' + renderSource[0] + ')').runInNewContext(context);
  const render = () => context.renderCart();
  elements.name.value = 'Guest nickname';
  elements.checkoutToRobots.hidden = false;
  render();
  assert.equal(elements.items.attributes.role, 'list');
  assert.equal(elements.items.children[0].attributes.role, 'listitem');
  assert.equal(elements.total.textContent, 'Total: ฿36,400');
  assert.equal(elements.count.textContent, 2);
  assert.equal(elements.clearCart.textContent, 'Clear all 2 demo cart items');
  assert.equal(elements.reviewServicesCart.hidden, false);
  assert.equal(elements.reviewServicesCart.textContent, 'Review demo cart (2 items) →');
  assert.equal(elements.checkoutToRobots.hidden, true);

  // A changed cart invalidates an existing preview and announces the removed item.
  elements.checkoutToRobots.hidden = false;
  elements.items.children[0].children[1].onclick();
  assert.deepEqual(context.cart.map(item => item.id), ['s1']);
  assert.equal(elements.checkoutToRobots.hidden, true);
  assert.match(elements.result.textContent, /Removed robot concept "Robot Concept" from demo cart\. 1 demo item remaining\. Preview again to continue\. No order was placed\./);
  assert.equal(elements.total.textContent, 'Total: ฿1,500');
  assert.equal(elements.count.textContent, 1);
  assert.equal(elements.clearCart.textContent, 'Clear all 1 demo cart item');
  assert.equal(elements.reviewServicesCart.textContent, 'Review demo cart (1 item) →');
  assert.equal(focused, elements.items.children[0].children[1]);

  elements.items.children[0].children[1].onclick();
  assert.equal(context.cart.length, 0);
  assert.match(elements.result.textContent, /Removed service preview "Service Preview" from demo cart\. 0 demo items remaining\. Preview again to continue\. No order was placed\./);
  assert.equal(elements.items.attributes.role, 'group');
  assert.equal(elements.total.textContent, 'Total: ฿0');
  assert.equal(elements.reviewServicesCart.hidden, true);
  assert.equal(elements.preview.disabled, true);
  assert.equal(elements.clearCart.textContent, 'Clear cart');
  assert.equal(elements.name.value, '');
  assert.equal(focused, elements.items.children[1]);

  context.cart = [robot, service];
  elements.name.value = 'Guest nickname';
  render();
  elements.checkoutToRobots.hidden = false;
  elements.result.textContent = 'Preview for Guest nickname';
  const clear = new Script('(' + clearSource[1] + ')').runInNewContext(context);
  clear();
  assert.equal(context.cart.length, 2, 'Cancel preserves cart');
  assert.equal(elements.checkoutToRobots.hidden, false, 'Cancel preserves the existing demo preview');
  assert.match(confirmationMessage, /Clear all 2 demo cart items \(1 robot concept, 1 service preview\)/);
  assert.match(confirmationMessage, /This cannot be undone\. No order has been placed/);
  assert.equal(elements.clearCart.textContent, 'Clear all 2 demo cart items');
  confirmed = true;
  clear();
  assert.equal(context.cart.length, 0);
  assert.equal(elements.count.textContent, 0);
  assert.equal(elements.preview.disabled, true);
  assert.equal(elements.checkoutToRobots.hidden, true, 'Clearing invalidates the demo preview');
  assert.equal(elements.name.value, '');
  assert.match(elements.result.textContent, /Cart cleared\. No order was placed/i);

  context.cart = [service];
  confirmed = false;
  render();
  clear();
  assert.equal(context.cart.length, 1, 'Cancel preserves a service-only demo cart');
  assert.match(confirmationMessage, /Clear all 1 demo cart item \(0 robot concepts, 1 service preview\)/);
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


test('clearing all demo profiles requires confirmation and resets skill selection', () => {
  const source = app.match(/byId\('clearProfiles'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  assert.ok(source, 'Expected the clear demo profiles handler');
  const elements = {
    profileSearch: { value: 'search term' },
    robotMessage: { textContent: '' },
    robotNickname: { focus() { focused = true; } }
  };
  let focused = false, confirmed = false, saves = 0, renders = 0, summaries = 0, prompts = 0, promptText = '';
  const context = {
    mine: [{ id: 'demo-1', name: 'Test robot', brand: 'Demo', model: 'A' }],
    selectedRobotId: 'demo-1',
    byId: id => elements[id],
    window: { confirm: message => { promptText = message; prompts++; return confirmed; } },
    saveRobots: () => { saves++; return true; },
    renderMyRobots: () => { renders++; },
    updateSkillsRobotSummary: () => { summaries++; }
  };
  const clear = new Script('(' + source[1] + ')').runInNewContext(context);

  clear();
  assert.equal(context.mine.length, 1, 'Cancel must preserve demo profiles');
  assert.match(promptText, /including profiles hidden by your search/i, 'Filtered clear-all must warn about hidden profiles');
  assert.equal(context.selectedRobotId, 'demo-1');
  assert.equal(elements.profileSearch.value, 'search term');
  assert.equal(saves, 0);
  assert.equal(renders, 0);

  confirmed = true;
  clear();
  assert.equal(context.mine.length, 0);
  assert.equal(context.selectedRobotId, null, 'Clearing removes the skills selection');
  assert.equal(elements.profileSearch.value, '');
  assert.equal(saves, 1);
  assert.equal(renders, 1);
  assert.equal(summaries, 1);
  assert.equal(focused, true, 'Keyboard focus returns to the robot nickname field');
  assert.match(elements.robotMessage.textContent, /No devices were affected/i);

  clear();
  assert.equal(prompts, 2, 'An empty profile list should not prompt again');
  assert.equal(saves, 1);

  const storageUnavailable = {
    mine: [{ id: 'session-1' }], selectedRobotId: 'session-1',
    byId: id => elements[id],
    window: { confirm: () => true },
    saveRobots: () => false,
    renderMyRobots: () => {},
    updateSkillsRobotSummary: () => {}
  };
  const clearSession = new Script('(' + source[1] + ')').runInNewContext(storageUnavailable);
  clearSession();
  assert.equal(storageUnavailable.mine.length, 0);
  assert.equal(storageUnavailable.selectedRobotId, null);
  assert.match(elements.robotMessage.textContent, /profiles may reappear after a reload/i);
});

test('removing one demo profile preserves remaining profiles, selection and keyboard focus', () => {
  const source = app.match(/function renderMyRobots\(\)\{[^\n]*\}/);
  assert.ok(source, 'Expected the demo robot profile renderer');
  let focused, confirmed = false, prompts = 0, saves = 0, summaries = 0;
  const node = () => ({
    children: [], attributes: {},
    replaceChildren(...items) { this.children = items; },
    append(...items) { this.children.push(...items); },
    setAttribute(key, value) { this.attributes[key] = value; },
    querySelectorAll(selector) {
      const key = selector.slice(1, -1);
      const walk = item => [item, ...(item.children || []).flatMap(walk)];
      return this.children.flatMap(walk).filter(item => Object.hasOwn(item.attributes || {}, key));
    },
    focus() { focused = this; }
  });
  const elements = Object.fromEntries(
    ['myrobots', 'profileCount', 'clearProfiles', 'profileSearch',
      'profileSearchSummary', 'clearProfileSearch', 'robotMessage', 'robotNickname'].map(id => [id, node()])
  );
  elements.profileSearch.value = '';
  const first = { id: 'demo-1', name: 'First robot', brand: 'Example', model: 'A' };
  const second = { id: 'demo-2', name: 'Second robot', brand: 'Example', model: 'B' };
  const context = {
    mine: [first, second], selectedRobotId: first.id,
    byId: id => elements[id],
    document: { createElement: node },
    window: { confirm: () => { prompts++; return confirmed; } },
    saveRobots: () => { saves++; return true; },
    updateSkillsRobotSummary: () => { summaries++; },
    show: () => {}
  };
  context.renderMyRobots = new Script('(' + source[0] + ')').runInNewContext(context);
  context.renderMyRobots();
  const removeNewest = elements.myrobots.children[0].children.at(-1);

  removeNewest.onclick();
  assert.deepEqual(context.mine.map(robot => robot.id), ['demo-1', 'demo-2']);
  assert.equal(context.selectedRobotId, first.id);
  assert.equal(saves, 0, 'Cancel must not write to browser storage');

  confirmed = true;
  removeNewest.onclick();
  assert.deepEqual(context.mine.map(robot => robot.id), ['demo-1']);
  assert.equal(context.selectedRobotId, first.id, 'Removing another profile preserves selection');
  assert.equal(saves, 1);
  assert.equal(summaries, 1);
  assert.equal(focused, elements.myrobots.querySelectorAll('[data-remove]')[0],
    'Focus moves to the remaining remove button');

  elements.myrobots.querySelectorAll('[data-remove]')[0].onclick();
  assert.equal(context.mine.length, 0);
  assert.equal(context.selectedRobotId, null, 'Removing the selected profile clears skill selection');
  assert.equal(elements.clearProfiles.hidden, true);
  assert.equal(focused, elements.robotNickname, 'Focus returns to the add-profile form');
  assert.equal(saves, 2);
  assert.equal(summaries, 2);
  assert.equal(prompts, 3);
  assert.match(elements.robotMessage.textContent, /removed from this browser/i);
});

test('skills picker reflects selected demo profiles and keeps compatibility warnings visible', () => {
  const source = app.match(/function updateSkillsRobotSummary\(\)\{[^\n]*\}/);
  assert.ok(source, 'Expected the demo skills selector renderer');

  let focusCalls = 0;
  const picker = {
    children: [], value: '', disabled: false,
    replaceChildren(...items) { this.children = items; },
    append(...items) { this.children.push(...items); },
    focus() { focusCalls++; }
  };
  const summary = { textContent: '' };
  const first = { id: 'demo-1', name: 'Home helper', brand: 'Example', model: 'A' };
  const second = { id: 'demo-2', name: 'Study helper', brand: 'Example', model: 'B' };
  const context = {
    mine: [first, second], selectedRobotId: second.id,
    byId: id => id === 'skillRobotSelect' ? picker : summary,
    document: {
      activeElement: picker,
      createElement: () => ({ value: '', textContent: '' })
    }
  };
  const update = new Script('(' + source[0] + ')').runInNewContext(context);

  update();
  assert.deepEqual(picker.children.map(option => option.value), ['', first.id, second.id]);
  assert.equal(picker.value, second.id);
  assert.equal(picker.disabled, false);
  assert.equal(focusCalls, 1, 'Rebuilding the selector must preserve keyboard focus');
  assert.match(summary.textContent, /Viewing generic skill previews for local demo profile: Study helper — Example · B/);
  context.mine[0].name = 'Study helper';
  context.selectedRobotId = first.id;
  update();
  assert.match(summary.textContent, /Study helper — Example · A/, 'Same-nickname profiles must show the selected brand and model');
  assert.doesNotMatch(summary.textContent, /Study helper — Example · B/, 'Do not display another profile with the same nickname');
  assert.match(summary.textContent, /Compatibility has not been checked/);
  assert.match(summary.textContent, /installation is unavailable/i);

  const focusCallsBeforeBlur = focusCalls;
  context.selectedRobotId = 'deleted-profile';
  context.document.activeElement = null;
  update();
  assert.equal(context.selectedRobotId, null, 'Deleted profiles must not remain selected');
  assert.equal(picker.value, '');
  assert.match(summary.textContent, /2 local demo robot profile\(s\) saved/);
  assert.equal(focusCalls, focusCallsBeforeBlur, 'Do not steal focus from another control');

  context.mine = [];
  update();
  assert.equal(picker.disabled, true, 'No profiles means no selectable robot');
  assert.deepEqual(picker.children.map(option => option.value), ['']);
  assert.match(page, /id="openRobotsFromSkills">Manage demo robots →</);
  assert.equal(summary.textContent, 'No demo robot profiles saved. Press Explore service previews for generic service previews, or press Manage demo robots to add a demo robot profile. Compatibility has not been checked; installation is unavailable.');
  assert.match(page, /id="openServicesFromSkills">Explore service previews →/);
  assert.match(page, /id="openRobotsFromSkills">Manage demo robots →/);
  assert.doesNotMatch(summary.textContent, /to get started/);
});

test('discover filters and concept-to-profile handoff preserve demo-only behavior', () => {
  const filterSource = app.match(/document\.querySelectorAll\('\[data-category\]'\)\.forEach\(b=>b\.addEventListener\('click',(\(\)=>\{[^\n]*\})\)\);/);
  const profileSource = app.match(/document\.querySelectorAll\('\[data-robot\]'\)\.forEach\(b=>b\.onclick=(\(\)=>\{[^\n]*\})\);/);
  assert.ok(filterSource && profileSource, 'Expected Discover filter and concept profile handlers');

  const buttons = ['all', 'home', 'education'].map(category => ({
    dataset: { category }, pressed: '',
    setAttribute(name, value) {
      if (name === 'aria-pressed') this.pressed = value;
    }
  }));
  let renders = 0;
  const filterContext = {
    selectedCategory: 'all', b: buttons[2],
    document: { querySelectorAll: () => buttons },
    render: () => { renders++; }
  };
  const filter = new Script('(' + filterSource[1] + ')').runInNewContext(filterContext);
  filter();
  assert.equal(filterContext.selectedCategory, 'education');
  assert.deepEqual(buttons.map(button => button.pressed), ['false', 'false', 'true']);
  assert.equal(renders, 1, 'Changing a category rerenders Discover');

  filterContext.b = buttons[0];
  filter();
  assert.equal(filterContext.selectedCategory, 'all');
  assert.deepEqual(buttons.map(button => button.pressed), ['true', 'false', 'false']);
  assert.equal(renders, 2);

  let focused = false, destination;
  const fields = {
    robotNickname: { value: '' },
    robotBrand: { value: 'Old brand', focus() { focused = true; } },
    robotModel: { value: 'Old model' },
    robotMessage: { textContent: '' }
  };
  let overwritePrompts = 0, draftRefreshes = 0;
  const profileContext = {
    robots: [{ id: 'r2', name: 'Companion Robot Concept' }], mine: [],
    updateRobotDraftAction: () => { draftRefreshes++; },
    b: { dataset: { robot: 'r2' } },
    byId: id => fields[id],
    window: { confirm: () => { overwritePrompts++; return true; } },
    show: tab => { destination = tab; }
  };
  const prefill = new Script('(' + profileSource[1] + ')').runInNewContext(profileContext);
  prefill();
  assert.equal(overwritePrompts, 1, 'Prefilling over an unsaved draft requires confirmation');
  assert.equal(draftRefreshes, 1, 'Prefilling refreshes the unsaved draft indicator');
  assert.equal(fields.robotNickname.value, 'Companion Robot Concept');
  assert.equal(fields.robotBrand.value, '', 'Never infer a real manufacturer from a concept');
  assert.equal(fields.robotModel.value, '', 'Never infer a compatible device model');
  assert.equal(destination, 'robots');
  assert.equal(focused, true, 'Focus should move to the brand field');
  assert.match(fields.robotMessage.textContent, /Ownership and compatibility are not verified/i);

  profileContext.b.dataset.robot = 'unknown';
  prefill();
  assert.equal(fields.robotNickname.value, 'Companion Robot Concept', 'Unknown concepts must not overwrite the form');
});

test('section navigation and Skills ↔ Services handoffs keep demo routes accessible', () => {
  const source = app.match(/function show\(tab,focusHeading=false\)\{[^\n]*\}/);
  assert.ok(source, 'Expected the shared section navigation function');

  const ids = ['store', 'cart', 'robots', 'skills', 'services'];
  const focusCounts = Object.fromEntries(ids.map(id => [id, 0]));
  const headings = {};
  const sections = Object.fromEntries(ids.map(id => [id, {
    hidden: false,
    querySelector: selector => {
      if (selector !== 'h2') return null;
      return headings[id] ??= {
        focus(options) { focusCounts[id]++; this.focusOptions = options; },
        getBoundingClientRect() { return { top: -80.2, bottom: -47 }; }
      };
    }
  }]));
  const tabs = ids.map(id => {
    const tab = {
      dataset: { tab: id }, active: false, current: null,
      setAttribute(key, value) { if (key === 'aria-current') this.current = value; },
      removeAttribute(key) { if (key === 'aria-current') this.current = null; }
    };
    tab.classList = { toggle(key, enabled) { if (key === 'active') tab.active = enabled; } };
    return tab;
  });
  let renders = 0;
  const context = {
    lastBrowseTab: 'store',
    document: {
      activeElement: { closest: () => ({ id: 'robots' }) },
      querySelectorAll: selector => selector === '[data-tab]' ? tabs : [],
      querySelector(selector) {
        if (selector === '.tabs') return { getBoundingClientRect() { return { top: 600 }; } };
        return null;
      }
    },
    byId: id => sections[id],
    render: () => { renders++; },
    window: { scrollY: 500, scrollTo(x, y) { context.scrolled = [x, y]; } }
  };
  const show = new Script('(' + source[0] + ')').runInNewContext(context);
  const checkVisible = expected => {
    assert.deepEqual(ids.filter(id => !sections[id].hidden), [expected]);
    assert.deepEqual(tabs.filter(tab => tab.active).map(tab => tab.dataset.tab), [expected]);
    assert.deepEqual(tabs.filter(tab => tab.current === 'page').map(tab => tab.dataset.tab), [expected]);
  };

  show('skills');
  checkVisible('skills');
  assert.equal(focusCounts.skills, 1, 'Cross-section navigation focuses the destination heading');
  assert.equal(headings.skills.tabIndex, -1, 'The destination heading is focusable without entering tab order');
  show('services');
  checkVisible('services');
  assert.equal(focusCounts.services, 1, 'The services heading is focused once');
  assert.equal(headings.services.tabIndex, -1);
  assert.equal(context.lastBrowseTab, 'services', 'Services becomes the checkout browse destination');
  show('cart');
  checkVisible('cart');
  assert.equal(focusCounts.cart, 1, 'The checkout heading is focused once');
  assert.equal(headings.cart.tabIndex, -1);
  assert.equal(context.lastBrowseTab, 'services', 'Checkout must retain the last browsed catalog');
  show('store', true);
  checkVisible('store');
  assert.equal(context.lastBrowseTab, 'store');
  assert.equal(focusCounts.store, 1, 'Explicit tab navigation focuses the heading');
  assert.equal(headings.store.tabIndex, -1);
  assert.equal(renders, 4, 'Each navigation rerenders the active demo state');
  assert.equal([...source[0].matchAll(/heading\.focus\(\{preventScroll:true\}\)/g)].length, 1, 'A section change focuses its heading once without the browser centering it');
  assert.equal(headings.store.focusOptions.preventScroll, true);
  assert.deepEqual(context.scrolled, [0, 419], 'An off-screen destination heading is aligned to the top of the viewport');
  assert.doesNotMatch(source[0], /scrollIntoView|behavior:\s*['"]smooth['"]/);

  for (const [id, expected] of [
    ['openDiscoverFromRobots', 'store'],
    ['openSkillsFromRobots', 'skills'],
    ['openRobotsFromSkills', 'robots'],
    ['openServicesFromSkills', 'services'],
    ['openSkillsFromServices', 'skills'],
    ['openRobotsFromServices', 'robots']
  ]) {
    const handler = app.split("byId('" + id + "').onclick=")[1]?.split(';')[0];
    assert.ok(handler, 'Missing demo handoff: ' + id);
    let destination;
    new Script('(' + handler + ')').runInNewContext({
      show: tab => { destination = tab; }
    })();
    assert.equal(destination, expected, 'Incorrect destination for ' + id);
  }
});

test('service-only journey returns to Services without suggesting a real booking', () => {
  const addSource = app.match(/document\.querySelectorAll\('\[data-add\]'\)\.forEach\(b=>b\.onclick=(\(\)=>\{[^\n]*\})\);/);
  const previewSource = app.match(/byId\('preview'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  const handoffSource = app.match(/byId\('checkoutToRobots'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  assert.ok(addSource && previewSource && handoffSource, 'Expected service cart and preview handlers');

  const service = { id: 's2', name: 'Maintenance', price: 1300 };
  const robot = { id: 'r1', name: 'Robot Concept', price: 34900 };
  const elements = {
    name: { value: '' },
    result: { textContent: '' },
    checkoutToRobots: { hidden: true, textContent: '' },
    robotMessage: { textContent: '' },
    serviceRobotContext: { textContent: '' }
  };
  const visited = [];
  const context = {
    cart: [], robots: [robot], services: [service],
    lastBrowseTab: 'services', b: { dataset: { add: service.id } },
    byId: id => elements[id],
    money: amount => '฿' + amount.toLocaleString('en-US'),
    show: section => visited.push(section)
  };
  const addService = new Script('(' + addSource[1] + ')').runInNewContext(context);
  const previewOrder = new Script('(' + previewSource[1] + ')').runInNewContext(context);
  const returnToServices = new Script('(' + handoffSource[1] + ')').runInNewContext(context);

  addService();
  assert.deepEqual(context.cart.map(item => item.id), ['s2']);
  assert.equal(context.lastBrowseTab, 'services');
  assert.equal(visited.at(-1), 'cart');
  assert.match(elements.result.textContent, /No order was placed/i);

  previewOrder();
  assert.match(elements.result.textContent, /Preview for Guest: 0 robot concept\(s\), 1 service preview\(s\), total ฿1,300/);
  assert.match(elements.result.textContent, /No payment or order submission occurred/);
  assert.equal(elements.checkoutToRobots.hidden, false);
  assert.equal(elements.checkoutToRobots.textContent, 'Return to service previews →');

  returnToServices();
  assert.equal(visited.at(-1), 'services');
  assert.equal(elements.robotMessage.textContent, '', 'Service-only preview does not suggest robot ownership');
  assert.match(elements.serviceRobotContext.textContent, /no service was booked and no payment was taken/);
  assert.match(elements.serviceRobotContext.textContent, /eligibility and compatibility remain unverified/);
  addService();
  assert.equal(context.cart.length, 1, 'Returning to Services must not allow a duplicate');
  assert.match(elements.result.textContent, /already in your cart/i);
});

test('editing checkout nickname invalidates stale preview before handoff', () => {
  const previewSource = app.match(/byId\('preview'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  const nameSource = app.match(/byId\('name'\)\.addEventListener\('input',(\(\)=>\{[^\n]*\})\);/);
  assert.ok(previewSource && nameSource, 'Expected preview and nickname input handlers');

  const robot = { id: 'r1', price: 34900 };
  const elements = {
    name: { value: '' },
    clearPreviewName: { hidden: true },
    result: { textContent: '' },
    checkoutToRobots: { hidden: true, textContent: '' }
  };
  const context = {
    cart: [robot], robots: [robot],
    byId: id => elements[id],
    money: amount => '฿' + amount.toLocaleString('en-US')
  };
  const preview = new Script('(' + previewSource[1] + ')').runInNewContext(context);
  const onNameInput = new Script('(' + nameSource[1] + ')').runInNewContext(context);

  preview();
  assert.equal(elements.checkoutToRobots.hidden, false);
  assert.match(elements.result.textContent, /Preview for Guest:/);

  elements.name.value = 'Alex';
  onNameInput();
  assert.equal(elements.clearPreviewName.hidden, false, 'Typed nickname exposes privacy clear control');
  assert.equal(elements.checkoutToRobots.hidden, true, 'Changed nickname must block stale handoff');
  assert.match(elements.result.textContent, /Name changed\. Preview again to continue\. No order was placed\./);

  preview();
  assert.equal(elements.checkoutToRobots.hidden, false, 'Fresh preview restores handoff');
  assert.match(elements.result.textContent, /Preview for Alex:/);
  assert.match(elements.result.textContent, /No payment or order submission occurred/);
});

test('checkout nickname can be cleared without submitting an order or leaving stale preview', () => {
  assert.match(page, /id="clearPreviewName" hidden aria-label="Clear checkout preview nickname"/);
  const source = app.match(/byId\('clearPreviewName'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  assert.ok(source, 'Expected checkout nickname clear handler');
  let focused = false;
  const elements = {
    name: { value: 'Alex', focus() { focused = true; } },
    clearPreviewName: { hidden: false },
    checkoutToRobots: { hidden: false },
    result: { textContent: 'Preview for Alex' }
  };
  const clear = new Script('(' + source[1] + ')').runInNewContext({ byId: id => elements[id] });
  clear();
  assert.equal(elements.name.value, '');
  assert.equal(elements.clearPreviewName.hidden, true);
  assert.equal(elements.checkoutToRobots.hidden, true, 'Clearing nickname invalidates preview handoff');
  assert.match(elements.result.textContent, /Name cleared\. Preview again to continue\. No order or personal details were submitted\./);
  assert.equal(focused, true, 'Focus returns to nickname field');

  elements.checkoutToRobots.hidden = true;
  elements.name.value = 'Alex';
  elements.result.textContent = 'Added robot concept "Home Robot Concept" to demo cart.';
  elements.clearPreviewName.hidden = false;
  focused = false;
  clear();
  assert.equal(elements.name.value, '');
  assert.equal(elements.checkoutToRobots.hidden, true, 'Clearing a nickname before preview does not open a handoff');
  assert.equal(elements.result.textContent, 'Preview name cleared. This is an on-page demo preview; no order or personal details are submitted.');
  assert.equal(focused, true, 'Focus still returns to the nickname field');
});

test('demo state changes announce once from a polite live region already in the page', () => {
  const openingTag = id => {
    const tag = page.match(new RegExp('<[a-z][^>]*\\sid="' + id + '"[^>]*>', 'i'))?.[0];
    assert.ok(tag, 'Expected a static live region for ' + id);
    return tag;
  };
  const politeStatus = tag => {
    assert.match(tag, /role="status"/);
    assert.doesNotMatch(tag, /aria-live="(?:off|assertive)"/);
  };
  politeStatus(openingTag('result'));
  assert.match(openingTag('result'), /aria-live="polite"/);
  politeStatus(openingTag('robotMessage'));
  politeStatus(openingTag('skillsRobotSummary'));
  assert.doesNotMatch(openingTag('cartSummary'), /role="status"|aria-live/);
  assert.doesNotMatch(openingTag('items'), /aria-live|role="status"|role="alert"/);
  assert.doesNotMatch(app, /createElement\([^)]*\)[^;]{0,80}id=.result|setAttribute\('id','result'\)/);

  const add = app.match(/document\.querySelectorAll\('\[data-add\]'\)\.forEach\(b=>b\.onclick=(\(\)=>\{[^\n]*\})\);/)?.[1] ?? '';
  const addedAt = add.lastIndexOf("byId('result').textContent='Added ");
  assert.ok(addedAt > add.lastIndexOf("show('cart')"), 'Add announces only after checkout is visible');
  assert.match(add, /Added '\+kind\+' "'\+x\.name\+'" to demo cart\./);
  assert.match(add, /No order was placed\./);
  assert.doesNotMatch(add, /\.focus\(/);
  assert.match(add, /robot concept':'service preview/);

  const remove = app.match(/remove\.onclick=\(\)=>\{cart\.splice\(i,1\);[^\n]*\}/)?.[0] ?? '';
  assert.match(remove, /byId\('result'\)\.textContent='Removed '\+kind\.toLowerCase\(\)\+' "'\+x\.name\+'" from demo cart\./);
  assert.match(remove, /No order was placed\./);

  const preview = app.match(/byId\('preview'\)\.onclick=(\(\)=>\{[^\n]*\});/)?.[1] ?? '';
  assert.match(preview, /byId\('result'\)\.textContent=/);
  assert.match(preview, /No payment or order submission occurred/);
  assert.doesNotMatch(preview, /\.focus\(/);

  const review = app.match(/function reviewDemoCart\(\)\{[^\n]*\}/)?.[0] ?? '';
  assert.match(review, /show\('cart'\)/);
  assert.doesNotMatch(review, /\.focus\(/, 'Review keeps the existing checkout heading handoff and does not move focus again');
  let visits = 0;
  const result = { textContent: '' };
  const runReview = cart => {
    visits = 0;
    new Script('(' + review + ')').runInNewContext({
      cart,
      show: tab => { visits += tab === 'cart' ? 1 : 0; },
      byId: id => id === 'result' ? result : null
    })();
  };
  runReview([{ id: 'r1' }]);
  assert.equal(visits, 1);
  assert.equal(result.textContent, 'Reviewing demo cart: 1 demo item. This is an order preview only. No payment, reservation or order submission occurred.');
  runReview([{ id: 'r1' }, { id: 's1' }]);
  assert.equal(result.textContent, 'Reviewing demo cart: 2 demo items. This is an order preview only. No payment, reservation or order submission occurred.');

  const save = app.match(/function addDemoRobot\(name,brand,model\)\{[^\n]*\}/)?.[0] ?? '';
  assert.match(save, /byId\('robotMessage'\)\.textContent=/);
  assert.match(save, /Compatibility not verified; no device connected\./);
  assert.doesNotMatch(save, /\.focus\(/);

  const profileRemove = app.match(/remove\.onclick=\(\)=>\{if\(!window\.confirm\([^\n]*\}/)?.[0] ?? '';
  assert.match(profileRemove, /byId\('robotMessage'\)\.textContent=saved\?'Demo profile removed from this browser\.'/);
  assert.match(profileRemove, /no device connected|removed from this browser/i);

  const nickname = app.match(/byId\('name'\)\.addEventListener\('input',(\(\)=>\{[^\n]*\})\);/)?.[1] ?? '';
  assert.match(nickname, /Name changed\. Preview again to continue\. No order was placed\./);
  assert.doesNotMatch(nickname, /\.focus\(/);
  const clearName = app.match(/byId\('clearPreviewName'\)\.onclick=(\(\)=>\{[^\n]*\});/)?.[1] ?? '';
  assert.match(clearName, /Name cleared\. Preview again to continue\. No order or personal details were submitted\./);
  assert.match(clearName, /Preview name cleared\. This is an on-page demo preview; no order or personal details are submitted\./);
  assert.match(clearName, /byId\('name'\)\.focus\(\)/);
  assert.doesNotMatch(clearName, /show\(/);

  const skillsChange = app.match(/byId\('skillRobotSelect'\)\.addEventListener\('change',(e=>\{[^\n]*\})\);/)?.[1] ?? '';
  assert.match(skillsChange, /updateSkillsRobotSummary\(\)/);
  assert.doesNotMatch(skillsChange, /\.focus\(|show\(/);
  const skillsSummary = app.match(/function updateSkillsRobotSummary\(\)\{[^\n]*\}/)?.[0] ?? '';
  assert.match(skillsSummary, /byId\('skillsRobotSummary'\)\.textContent=/);
  assert.match(skillsSummary, /Compatibility has not been checked; installation is unavailable\./);
  assert.doesNotMatch(page, /id="skillcards"[^>]*aria-live/);
});

test('Escape clears checkout nickname, blocks stale preview handoff and preserves other keys', () => {
  const source = app.match(/byId\('name'\)\.addEventListener\('keydown',(e=>\{[^\n]*\})\);/);
  assert.ok(source, 'Expected checkout nickname Escape handler');
  let clears = 0;
  let prevented = 0;
  const elements = {
    name: { value: 'Alex' },
    clearPreviewName: { onclick() { clears++; elements.name.value = ''; elements.checkoutToRobots.hidden = true; } },
    checkoutToRobots: { hidden: false }
  };
  const handler = new Script('(' + source[1] + ')').runInNewContext({ byId: id => elements[id] });
  handler({ key: 'Enter', preventDefault() { prevented++; } });
  assert.equal(clears, 0, 'Other keys must not clear nickname');
  handler({ key: 'Escape', preventDefault() { prevented++; } });
  assert.equal(clears, 1, 'Escape must invoke the existing privacy clear action');
  assert.equal(prevented, 1, 'Escape should not propagate to browser search behavior');
  assert.equal(elements.name.value, '');
  assert.equal(elements.checkoutToRobots.hidden, true, 'Escape must invalidate the stale handoff');
  handler({ key: 'Escape', preventDefault() { prevented++; } });
  assert.equal(clears, 1, 'Escape with an empty nickname must be a no-op');
  assert.equal(prevented, 1);
});

test('mixed robot and service preview routes to My Robots without claiming ownership', () => {
  const addSource = app.match(/document\.querySelectorAll\('\[data-add\]'\)\.forEach\(b=>b\.onclick=(\(\)=>\{[^\n]*\})\);/);
  const previewSource = app.match(/byId\('preview'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  const handoffSource = app.match(/byId\('checkoutToRobots'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  assert.ok(addSource && previewSource && handoffSource, 'Expected mixed cart and preview handlers');

  const robot = { id: 'r1', name: 'Home Robot Concept', price: 34900 };
  const service = { id: 's2', name: 'Maintenance', price: 1300 };
  const elements = {
    name: { value: '' },
    result: { textContent: '' },
    checkoutToRobots: { hidden: true, textContent: '' },
    robotMessage: { textContent: '' }
  };
  const visited = [];
  const context = {
    cart: [], mine: [], robots: [robot], services: [service],
    b: { dataset: { add: robot.id } }, lastBrowseTab: 'store',
    byId: id => elements[id],
    money: amount => '฿' + amount.toLocaleString('en-US'),
    show: tab => visited.push(tab)
  };
  const addItem = new Script('(' + addSource[1] + ')').runInNewContext(context);
  const previewOrder = new Script('(' + previewSource[1] + ')').runInNewContext(context);
  const continueFromCheckout = new Script('(' + handoffSource[1] + ')').runInNewContext(context);

  addItem();
  context.b.dataset.add = service.id;
  addItem();
  assert.deepEqual(context.cart.map(item => item.id), ['r1', 's2']);
  assert.equal(context.lastBrowseTab, 'services');
  assert.equal(visited.at(-1), 'cart');

  previewOrder();
  assert.match(elements.result.textContent, /1 robot concept\(s\), 1 service preview\(s\), total ฿36,200/);
  assert.match(elements.result.textContent, /No payment or order submission occurred/);
  assert.equal(elements.checkoutToRobots.hidden, false);
  assert.equal(elements.checkoutToRobots.textContent, 'Continue to My Robots (demo) →');

  continueFromCheckout();
  assert.equal(visited.at(-1), 'robots', 'Mixed carts should lead to optional local profiles');
  assert.match(elements.robotMessage.textContent, /does not confirm purchase, ownership, compatibility or hardware connection/i);
  assert.equal(context.mine.length, 0, 'Previewing an order must never create or verify ownership');
});

test('stored demo profiles reject malformed entries and duplicate IDs or details without changing valid profiles', () => {
  const validator = app.split('\n').find(line => line.startsWith('function validDemoProfile('));
  const loader = app.split('\n').find(line => line.startsWith("try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)"));
  assert.ok(validator && loader, 'Expected guarded local demo profile storage loader');

  const read = storage => new Script(
    "const STORAGE_KEY='botket-demo-robots-v1'; let mine=[];\n" +
    validator + '\n' + loader + '\nmine;'
  ).runInNewContext({ localStorage: storage });

  const valid = { id: 'demo-1', name: 'Home helper', brand: 'Example Maker', model: 'A' };
  const saved = [
    valid,
    { ...valid, name: 'Duplicate ID' },
    { id: 'demo-duplicate', name: '  HOME   helper ', brand: 'example maker', model: 'a' },
    { id: ' ', name: 'Blank ID', brand: 'Example', model: 'A' },
    { id: 'blank', name: '   ', brand: 'Example', model: 'A' },
    { id: 'oversize', name: 'X'.repeat(41), brand: 'Example', model: 'A' },
    { id: 'wrong-type', name: 'Robot', brand: 123, model: 'A' },
    ...Array.from({ length: 35 }, (_, i) => ({
      id: 'demo-' + (i + 2), name: 'Robot ' + i, brand: 'Example', model: 'B'
    }))
  ];
  const loaded = read({ getItem: () => JSON.stringify(saved) });
  assert.equal(loaded.length, 30, 'Only 30 valid unique profiles are loaded');
  assert.equal(loaded[0].name, 'Home helper', 'Valid saved details are preserved');
  assert.equal(new Set(loaded.map(x => x.id)).size, 30);
  assert.equal(loaded.some(x => x.id === 'demo-duplicate'), false, 'Normalized duplicate details are ignored');
  assert.ok(loaded.every(x => x.name.trim() && x.brand.trim() && x.model.trim()));
  assert.equal(read({ getItem: () => '{broken json' }).length, 0, 'Corrupt JSON is ignored');
  assert.equal(read({ getItem: () => { throw Error('Storage disabled'); } }).length, 0);
});

test('generated demo profile IDs use full UUIDs and avoid collisions when randomness is unavailable', () => {
  const source = app.match(/let demoIdCounter=0;\s*function demoId\(\)\{[^\n]*\}/);
  assert.ok(source, 'Expected the demo ID generator and collision-safe fallback');
  const generate = (mine, crypto) => new Script(source[0] + '\nconst first=demoId(); mine.push({id:first}); [first, demoId()]').runInNewContext({
    mine, crypto, Date: { now: () => 123456 }
  });
  const uuid = '12345678-1234-1234-1234-123456789abc';
  const fullId = 'DEMO-' + uuid.toUpperCase();
  const normal = generate([], { randomUUID: () => uuid });
  assert.equal(normal[0], fullId, 'Keep the complete UUID rather than truncating it');
  assert.notEqual(normal[1], fullId, 'A repeated UUID must not duplicate an existing ID in this session');
  const storedCollision = generate([{ id: fullId }], { randomUUID: () => uuid });
  assert.notEqual(storedCollision[0], fullId, 'A stored profile ID collision must use a fallback');
  assert.equal(new Set(storedCollision).size, 2, 'Fallback IDs must be unique');
  const fallback = generate([], undefined);
  assert.equal(new Set(fallback).size, 2, 'Fixed timestamps must not create duplicate IDs');
  assert.ok(fallback.every(id => id.startsWith('DEMO-')));
});

test('stored demo profile loader stops scanning after 30 valid profiles', () => {
  const validator = app.split('\n').find(line => line.startsWith('function validDemoProfile('));
  const loader = app.split('\n').find(line => line.startsWith("try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)"));
  assert.ok(validator && loader, 'Expected guarded demo profile loader');
  let readPastLimit = false;
  const saved = [
    { id: 'invalid', name: '', brand: 'Example', model: 'A' },
    ...Array.from({ length: 30 }, (_, i) => ({
      id: 'demo-' + i, name: 'Robot ' + i, brand: 'Example', model: 'A'
    })),
    { id: 'extra', name: 'Extra robot', brand: 'Example', model: 'A' }
  ];
  Object.defineProperty(saved, 31, {
    get() {
      readPastLimit = true;
      return { id: 'extra', name: 'Extra robot', brand: 'Example', model: 'A' };
    }
  });
  const loaded = new Script(
    "const STORAGE_KEY='botket-demo-robots-v1'; let mine=[];\n" +
    validator + '\n' + loader + '\nmine;'
  ).runInNewContext({
    localStorage: { getItem: () => '[]' },
    JSON: { parse: () => saved, stringify: JSON.stringify }
  });
  assert.equal(loaded.length, 30, 'Malformed entries do not count toward the 30-profile limit');
  assert.equal(loaded[0].id, 'demo-0', 'Preserve the first valid profile');
  assert.equal(readPastLimit, false, 'Stop reading storage entries after reaching the limit');
});

test('My Robots search normalizes whitespace and case without changing saved details', () => {
  const source = app.match(/function renderMyRobots\(\)\{[^\n]*\}/);
  assert.ok(source, 'Expected the My Robots rendering function');

  const mine = [
    { id: 'p1', name: 'Home   Helper', brand: 'Example Robotics', model: 'A-1' },
    { id: 'p2', name: 'Study Bot', brand: 'Sample Maker', model: 'B-2' }
  ];
  const root = {
    children: [], attributes: {},
    replaceChildren() { this.children = []; },
    append(...nodes) { this.children.push(...nodes); },
    setAttribute(key, value) { this.attributes[key] = value; }
  };
  const elements = {
    myrobots: root,
    profileCount: { textContent: '' },
    clearProfiles: { hidden: true },
    profileSearch: {
      value: '  hOmE     helper  ', disabled: false,
      focus() { this.focused = true; }
    },
    profileSearchSummary: { textContent: '' },
    clearProfileSearch: { hidden: true }
  };
  const createElement = tag => ({
    tagName: tag, children: [], textContent: '', attributes: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    append(...nodes) { this.children.push(...nodes); },
    focus() {}
  });
  const context = {
    mine, selectedRobotId: null,
    byId: id => elements[id],
    document: { createElement },
    window: { confirm: () => true },
    saveRobots: () => true,
    show: () => {},
    updateSkillsRobotSummary: () => {}
  };
  const render = new Script('(' + source[0] + ')').runInNewContext(context);

  render();
  assert.match(elements.profileSearchSummary.textContent, /Showing 1 of 2 matching/);
  assert.match(elements.clearProfiles.textContent, /Clear all 2 demo profiles \(including profiles hidden by search\)/, 'Clear-all label must warn while filtered');
  assert.equal(elements.clearProfileSearch.hidden, false, 'Clear search is available with matching results');
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].children[0].textContent, 'Home   Helper');
  assert.equal(root.attributes.role, 'list', 'Matching saved profiles form an accessible list');
  assert.equal(root.children[0].attributes.role, 'listitem', 'Each saved profile is a list item');
  assert.equal(mine[0].name, 'Home   Helper', 'Searching must not mutate saved profiles');

  elements.profileSearch.value = '  sAMpLE    mAkEr ';
  render();
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].children[0].textContent, 'Study Bot');

  elements.profileSearch.value = '  EXAMPLE    a-1 ';
  render();
  assert.equal(root.children.length, 1, 'Terms should match across brand and model');
  assert.equal(root.children[0].children[0].textContent, 'Home   Helper');

  elements.profileSearch.value = 'maker study';
  render();
  assert.equal(root.children.length, 1, 'Search terms may appear in any order');
  assert.equal(root.children[0].children[0].textContent, 'Study Bot');

  elements.profileSearch.value = 'study missing';
  render();
  assert.match(elements.profileSearchSummary.textContent, /Showing 0 of 2 matching/,
    'Every search term must match');

  elements.profileSearch.value = 'not present';
  render();
  assert.match(elements.profileSearchSummary.textContent, /Showing 0 of 2 matching/);
  assert.equal(root.children.length, 2, 'No matches shows a message and clear-search button');
  assert.equal(root.attributes.role, 'group', 'Empty search results are not announced as list items');
  root.children[1].onclick();
  assert.equal(elements.profileSearch.value, '');
  assert.equal(elements.profileSearch.focused, true, 'Clearing search restores keyboard focus');
  assert.equal(root.children.length, 2);
  assert.match(elements.profileSearchSummary.textContent, /Showing all 2 demo profile/);
  assert.equal(elements.clearProfiles.textContent, 'Clear all 2 demo profiles', 'Unfiltered clear-all label remains concise');
  assert.equal(elements.clearProfileSearch.hidden, true, 'Clear search hides when query is empty');
  assert.equal(root.attributes.role, 'list', 'Clearing the filter restores list semantics');
});

test('My Robots clear-search control resets matching results and preserves input focus', () => {
  assert.match(page, /id="clearProfileSearch" hidden aria-label="Clear demo profile search"/);
  const source = app.match(/byId\('clearProfileSearch'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  assert.ok(source, 'Expected the clear-search button handler');
  const search = { value: 'study robot', focusCalled: false, focus() { this.focusCalled = true; } };
  let rerenders = 0;
  const handler = new Script('(' + source[1] + ')').runInNewContext({
    byId: id => id === 'profileSearch' ? search : undefined,
    renderMyRobots: () => { rerenders++; }
  });
  handler();
  assert.equal(search.value, '');
  assert.equal(rerenders, 1);
  assert.equal(search.focusCalled, true);
});

test('Escape clears My Robots search while leaving other keys alone', () => {
  const source = app.match(/byId\('profileSearch'\)\.addEventListener\('keydown',(e=>\{[^\n]*\})\);/);
  assert.ok(source, 'Expected the Escape keyboard shortcut handler');
  const search = { value: 'maker study', focused: false, focus() { this.focused = true; } };
  let renders = 0, prevented = 0;
  const handler = new Script('(' + source[1] + ')').runInNewContext({
    byId: id => id === 'profileSearch' ? search : undefined,
    renderMyRobots: () => { renders++; }
  });
  handler({ key: 'Enter', preventDefault() { prevented++; } });
  assert.equal(search.value, 'maker study', 'Other keys must preserve the query');
  assert.equal(renders, 0);
  handler({ key: 'Escape', preventDefault() { prevented++; } });
  assert.equal(search.value, '');
  assert.equal(renders, 1, 'Clearing must refresh visible results');
  assert.equal(prevented, 1, 'Prevent the browser from also handling Escape');
  assert.equal(search.focused, true, 'Search focus remains available for another query');
  handler({ key: 'Escape', preventDefault() { prevented++; } });
  assert.equal(renders, 1, 'Empty queries do not trigger redundant rerenders');
});

test('robot concept to checkout to local profile to skills to services stays demo-only', () => {
  const addSource = app.match(/document\.querySelectorAll\('\[data-add\]'\)\.forEach\(b=>b\.onclick=(\(\)=>\{[^\n]*\})\);/);
  const previewSource = app.match(/byId\('preview'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  const checkoutSource = app.match(/byId\('checkoutToRobots'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  const registerSource = app.match(/function addDemoRobot\(name,brand,model\)\{[^\n]*\}/);
  const skillsSource = app.match(/function updateSkillsRobotSummary\(\)\{[^\n]*\}/);
  const servicesSource = app.split("byId('openServicesFromSkills').onclick=")[1]?.split(';')[0];
  assert.ok(addSource && previewSource && checkoutSource && registerSource && skillsSource && servicesSource,
    'Expected the existing demo funnel handlers');

  const robot = { id: 'r1', name: 'Home Robot Concept', price: 34900 };
  const service = { id: 's2', name: 'Maintenance', price: 1300 };
  const picker = {
    children: [], value: '', disabled: false,
    replaceChildren(...nodes) { this.children = nodes; },
    append(...nodes) { this.children.push(...nodes); },
    focus() {}
  };
  const elements = {
    name: { value: '' },
    result: { textContent: '' },
    checkoutToRobots: { hidden: true, textContent: '' },
    profileSearch: { value: '' },
    robotMessage: { textContent: '' },
    skillRobotSelect: picker,
    skillsRobotSummary: { textContent: '' }
  };
  const visited = [];
  let saves = 0;
  const context = {
    cart: [], mine: [], robots: [robot], services: [service],
    selectedRobotId: null, lastBrowseTab: 'store',
    b: { dataset: { add: robot.id } },
    byId: id => elements[id],
    money: amount => '฿' + amount.toLocaleString('en-US'),
    demoId: () => 'DEMO-local-1',
    saveRobots: () => { saves++; return true; },
    show: section => visited.push(section),
    document: {
      activeElement: null,
      createElement: () => ({ value: '', textContent: '' })
    }
  };
  const run = source => new Script('(' + source + ')').runInNewContext(context);
  const add = run(addSource[1]);
  const preview = run(previewSource[1]);
  const checkout = run(checkoutSource[1]);
  const register = run(registerSource[0]);
  const updateSkills = run(skillsSource[0]);
  const openServices = run(servicesSource);

  add();
  assert.equal(visited.at(-1), 'cart', 'Discover sends a robot concept to demo checkout');
  preview();
  assert.match(elements.result.textContent, /Preview for Guest: 1 robot concept\(s\), 0 service preview\(s\), total ฿34,900/);
  assert.match(elements.result.textContent, /No payment or order submission occurred/);
  checkout();
  assert.equal(visited.at(-1), 'robots');
  assert.match(elements.robotMessage.textContent, /does not confirm purchase, ownership, compatibility or hardware connection/i);
  assert.equal(context.mine.length, 0, 'Checkout never grants ownership or creates a profile');

  assert.equal(register('Home helper', 'Example Maker', 'Model A'), true);
  assert.equal(context.mine.length, 1, 'Registration is an explicit separate action');
  assert.equal(saves, 1);
  assert.equal(context.selectedRobotId, 'DEMO-local-1');
  assert.match(elements.robotMessage.textContent, /Compatibility not verified; no device connected/);
  updateSkills();
  assert.equal(picker.value, 'DEMO-local-1');
  assert.match(elements.skillsRobotSummary.textContent, /Compatibility has not been checked/);
  assert.match(elements.skillsRobotSummary.textContent, /installation is unavailable/);

  openServices();
  assert.equal(visited.at(-1), 'services');
  context.b.dataset.add = service.id;
  add();
  assert.equal(visited.at(-1), 'cart');
  preview();
  assert.match(elements.result.textContent, /1 robot concept\(s\), 1 service preview\(s\), total ฿36,200/);
  assert.match(elements.result.textContent, /No payment or order submission occurred/);
  assert.equal(context.mine.length, 1, 'Adding a service does not create another robot profile');
  assert.equal(saves, 1, 'Checkout and service previews never write robot profiles');
  assert.match(page, /No bookings, service requests or payments are available/);
});

test('Discover concept search combines category filters, normalized terms and accessible clearing', () => {
  assert.match(page, /id="robotSearch" type="search"[^>]*aria-describedby="filterSummary"/);
  assert.match(page, /id="clearRobotSearch" hidden aria-label="Clear robot concept search"/);
  const source = app.match(/function render\(\)\{[\s\S]*?\n(?=function show\()/);
  const clearSource = app.match(/byId\('clearRobotSearch'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  const escapeSource = app.match(/byId\('robotSearch'\)\.addEventListener\('keydown',(e=>\{[^\n]*\})\);/);
  assert.ok(source && clearSource && escapeSource, 'Expected Discover search, clear and Escape handlers');

  const catalog = [
    { id: 'r1', name: 'Home Robot Concept', category: 'home' },
    { id: 'r2', name: 'Companion Robot Concept', category: 'companion' },
    { id: 'r3', name: 'Educational Robotics Kit Concept', category: 'education' }
  ];
  const elements = {
    robotSearch: { value: '  HOME    ROBOT ', focused: false, focus() { this.focused = true; } },
    clearRobotSearch: { hidden: true },
    resetDiscoverFilters: { hidden: true },
    filterSummary: { textContent: '' },
    products: { innerHTML: '', role: '', setAttribute(name, value) { if (name === 'role') this.role = value; } },
    skillcards: { innerHTML: '' },
    servicecards: { innerHTML: '' }
  };
  const context = {
    robots: catalog, skills: [], services: [], selectedCategory: 'all', cart: [],
    byId: id => elements[id],
    card: x => '<article>' + x.name + '</article>',
    renderMyRobots: () => {}, updateSkillsRobotSummary: () => {}, updateServicesContext: () => {}, renderCart: () => {},
    document: { querySelectorAll: () => [] }
  };
  const render = new Script('(' + source[0].trim() + ')').runInNewContext(context);
  const clear = new Script('(' + clearSource[1] + ')').runInNewContext({ byId: context.byId, render });
  const onKey = new Script('(' + escapeSource[1] + ')').runInNewContext({ byId: context.byId, render });
  render();
  assert.match(elements.products.innerHTML, /Home Robot Concept/);
  assert.equal(elements.products.role, 'list', 'Matching results form a screen-reader list');
  assert.doesNotMatch(elements.products.innerHTML, /Companion Robot Concept/);
  assert.match(elements.filterSummary.textContent, /Showing 1 of 3/);
  assert.equal(elements.clearRobotSearch.hidden, false);

  context.selectedCategory = 'education';
  render();
  assert.equal(elements.products.innerHTML, '<p class="muted">No robot concepts match. Try another search or press Show all robot concepts.</p>');
  assert.doesNotMatch(elements.products.innerHTML, /choose All robots/);
  assert.equal(elements.products.role, 'group', 'Empty results are not announced as a list');
  assert.match(elements.filterSummary.textContent, /Showing 0 of 3 robot concepts in education/);

  elements.robotSearch.value = '  educational   KIT ';
  render();
  assert.match(elements.products.innerHTML, /Educational Robotics Kit Concept/);
  assert.doesNotMatch(elements.products.innerHTML, /Home Robot Concept/);

  clear();
  assert.equal(elements.robotSearch.value, '');
  assert.equal(elements.robotSearch.focused, true);
  assert.equal(elements.clearRobotSearch.hidden, true);
  assert.match(elements.filterSummary.textContent, /Showing 1 of 3 robot concepts in education/);

  context.selectedCategory = 'all';
  elements.robotSearch.value = 'companion';
  let prevented = 0;
  onKey({ key: 'Enter', preventDefault() { prevented++; } });
  assert.equal(elements.robotSearch.value, 'companion');
  onKey({ key: 'Escape', preventDefault() { prevented++; } });
  assert.equal(elements.robotSearch.value, '');
  assert.equal(prevented, 1);
  assert.match(elements.filterSummary.textContent, /Showing 3 of 3 robot concepts/);
  assert.equal(elements.products.role, 'list', 'Clearing filters restores list semantics');
  assert.equal(catalog.length, 3, 'Filtering never modifies the concept catalog');
});

test('Discover no-results recovery clears both filters and restores all demo concepts', () => {
  assert.match(page, /id="resetDiscoverFilters" hidden>Show all robot concepts/);
  assert.match(page, /No robot concepts match\. Try another search or press Show all robot concepts\./);
  assert.doesNotMatch(page, /choose All robots/);
  const source = app.match(/function render\(\)\{[\s\S]*?\n(?=function show\()/);
  const resetSource = app.match(/byId\('resetDiscoverFilters'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  assert.ok(source && resetSource, 'Discover recovery and renderer must exist');
  const catalog = [
    { id: 'r1', name: 'Home Robot Concept', category: 'home' },
    { id: 'r2', name: 'Companion Robot Concept', category: 'companion' }
  ];
  const categoryButtons = ['all', 'home', 'companion', 'education'].map(category => ({
    dataset: { category }, pressed: null,
    setAttribute(name, value) { if (name === 'aria-pressed') this.pressed = value; }
  }));
  const elements = {
    robotSearch: { value: 'home', focused: false, focus() { this.focused = true; } },
    clearRobotSearch: { hidden: true }, resetDiscoverFilters: { hidden: true },
    filterSummary: { textContent: '' }, products: { innerHTML: '', role: '', setAttribute(name, value) { if (name === 'role') this.role = value; } },
    skillcards: { innerHTML: '' }, servicecards: { innerHTML: '' }
  };
  const context = {
    robots: catalog, skills: [], services: [], selectedCategory: 'companion', cart: [],
    byId: id => elements[id], card: x => '<article>' + x.name + '</article>',
    renderMyRobots: () => {}, updateSkillsRobotSummary: () => {}, updateServicesContext: () => {}, renderCart: () => {},
    document: { querySelectorAll: selector => selector === '[data-category]' ? categoryButtons : [] }
  };
  const render = new Script('(' + source[0].trim() + ')').runInNewContext(context);
  context.render = render;
  const reset = new Script('(' + resetSource[1] + ')').runInNewContext(context);
  render();
  assert.equal(elements.resetDiscoverFilters.hidden, false, 'No matches shows recovery');
  assert.equal(elements.products.innerHTML, '<p class="muted">No robot concepts match. Try another search or press Show all robot concepts.</p>');
  assert.doesNotMatch(elements.products.innerHTML, /All robots/);
  reset();
  assert.equal(context.selectedCategory, 'all');
  assert.equal(elements.robotSearch.value, '');
  assert.equal(elements.robotSearch.focused, true, 'Focus returns to search');
  assert.equal(elements.resetDiscoverFilters.hidden, true, 'Recovery hides once results return');
  assert.equal(categoryButtons[0].pressed, 'true');
  assert.ok(categoryButtons.slice(1).every(button => button.pressed === 'false'));
  assert.match(elements.filterSummary.textContent, /Showing 2 of 2 robot concepts/);
  assert.match(elements.products.innerHTML, /Home Robot Concept/);
  assert.match(elements.products.innerHTML, /Companion Robot Concept/);
  assert.equal(catalog.length, 2, 'Recovery must not modify catalog');
});

test('demo registration rejects invalid details before changing saved profiles', () => {
  const source = app.match(/function addDemoRobot\(name,brand,model\)\{[^\n]*\}/);
  assert.ok(source, 'Expected demo registration guard');
  const mine = [];
  const elements = {
    robotMessage: { textContent: '' },
    profileSearch: { value: 'existing search' }
  };
  let saves = 0, visits = 0, ids = 0;
  const context = {
    mine, selectedRobotId: null,
    byId: id => elements[id],
    demoId: () => { ids++; return 'DEMO-1'; },
    saveRobots: () => { saves++; return true; },
    show: () => { visits++; }
  };
  const add = new Script('(' + source[0] + ')').runInNewContext(context);
  const invalid = [
    ['', 'Maker', 'A'], ['   ', 'Maker', 'A'],
    ['Home', '', 'A'], ['Home', 'Maker', '   '],
    ['x'.repeat(41), 'Maker', 'A'],
    ['Home', 'x'.repeat(41), 'A'],
    ['Home', 'Maker', 'x'.repeat(61)],
    [null, 'Maker', 'A']
  ];
  for (const details of invalid) {
    assert.equal(add(...details), false, 'Invalid details must be rejected');
    assert.equal(mine.length, 0, 'Invalid registration must not add a profile');
  }
  assert.equal(saves, 0, 'Invalid details must not write browser storage');
  assert.equal(ids, 0, 'Invalid details must not allocate a profile ID');
  assert.equal(visits, 0, 'Invalid details must not navigate');
  assert.equal(elements.profileSearch.value, 'existing search');
  assert.match(elements.robotMessage.textContent, /No demo profile was saved/);

  assert.equal(add('Home', 'Maker', 'A'), true, 'Valid demo details still work');
  assert.equal(mine.length, 1);
  assert.equal(saves, 1);
  assert.equal(ids, 1);
  assert.equal(visits, 1);
});

test('Services shows selected demo profile without implying verified service compatibility', () => {
  assert.match(page, /id="serviceRobotContext"[^>]*role="status"[^>]*aria-live="polite"/);
  const source = app.match(/function updateServicesContext\(\)\{[^\n]*\}/);
  assert.ok(source, 'Expected generic service context renderer');
  const notice = { textContent: '' };
  const context = {
    mine: [{ id: 'demo-1', name: 'Study Helper', brand: 'Example Robotics', model: 'A-1' },
      { id: 'demo-2', name: 'Study Helper', brand: 'Sample Maker', model: 'B-2' }],
    selectedRobotId: 'demo-1',
    byId: id => id === 'serviceRobotContext' ? notice : undefined
  };
  const update = new Script('(' + source[0] + ')').runInNewContext(context);
  update();
  assert.match(notice.textContent, /Selected local demo profile: Study Helper/);
  assert.match(notice.textContent, /Example Robotics · A-1/, 'Show model to distinguish matching nicknames');
  context.selectedRobotId = 'demo-2';
  update();
  assert.match(notice.textContent, /Sample Maker · B-2/, 'Service context follows the selected demo profile');
  assert.doesNotMatch(notice.textContent, /Example Robotics · A-1/);
  assert.match(notice.textContent, /not matched to this robot/i);
  assert.match(notice.textContent, /compatibility are unverified/i);
  assert.match(notice.textContent, /no booking is available/i);

  context.selectedRobotId = 'deleted-profile';
  update();
  assert.match(notice.textContent, /not matched to any robot/i);
  assert.doesNotMatch(notice.textContent, /Study Helper/);

  context.mine = [];
  context.selectedRobotId = null;
  update();
  assert.match(notice.textContent, /not matched to any robot/i);
  assert.equal(context.mine.length, 0, 'Services must not create robot profiles');
});

test('My Robots opens generic Services with the chosen demo profile, without compatibility claims', () => {
  const source = app.match(/function renderMyRobots\(\)\{[^\n]*\}/);
  const contextSource = app.match(/function updateServicesContext\(\)\{[^\n]*\}/);
  assert.ok(source && contextSource, 'Expected profile and Services context renderers');
  const node = () => ({
    children: [], attributes: {},
    replaceChildren(...items) { this.children = items; },
    append(...items) { this.children.push(...items); },
    setAttribute(key, value) { this.attributes[key] = value; },
    focus() {}
  });
  const elements = Object.fromEntries(
    ['myrobots', 'profileCount', 'clearProfiles', 'profileSearch',
      'profileSearchSummary', 'clearProfileSearch'].map(id => [id, node()])
  );
  elements.profileSearch.value = '';
  const visits = [];
  const context = {
    mine: [
      { id: 'demo-1', name: 'Study Helper', brand: 'Example Robotics', model: 'A-1' },
      { id: 'demo-2', name: 'Study Helper', brand: 'Sample Maker', model: 'B-2' }
    ],
    selectedRobotId: null,
    byId: id => elements[id],
    document: { createElement: node },
    show: tab => visits.push(tab)
  };
  const renderProfiles = new Script('(' + source[0] + ')').runInNewContext(context);
  const updateContext = new Script('(' + contextSource[0] + ')').runInNewContext(context);
  renderProfiles();
  const newest = elements.myrobots.children[0];
  const servicesButton = newest.children.find(child =>
    child.textContent === 'Explore generic service previews (demo) →');
  assert.ok(servicesButton, 'Each profile should offer a direct generic Services route');
  assert.match(servicesButton.attributes['aria-label'], /compatibility not verified/i);
  assert.equal(newest.children.at(-1).textContent, 'Remove profile',
    'Existing removal control stays available');
  servicesButton.onclick();
  assert.equal(context.selectedRobotId, 'demo-2', 'Choose the clicked profile, not another with the same nickname');
  assert.deepEqual(visits, ['services']);
  elements.serviceRobotContext = { textContent: '' };
  updateContext();
  assert.match(elements.serviceRobotContext.textContent, /Sample Maker · B-2/);
  assert.doesNotMatch(elements.serviceRobotContext.textContent, /Example Robotics · A-1/);
  assert.match(elements.serviceRobotContext.textContent, /compatibility are unverified/i);
  assert.match(elements.serviceRobotContext.textContent, /no booking is available/i);
  assert.equal(context.mine.length, 2, 'Navigation must not modify saved profiles');
});


test('Services offers a demo cart review route only when items exist', () => {
  assert.match(page, /id="reviewServicesCart" hidden>Review demo cart/);
  assert.match(app, /byId\('reviewServicesCart'\)\.onclick=reviewDemoCart/);
  const source = app.match(/function reviewDemoCart\(\)\{[^\n]*\}/);
  assert.ok(source, 'Expected Services-to-Checkout handler');
  let destination;
  const result = { textContent: '' };
  new Script('(' + source[0] + ')').runInNewContext({
    cart: [{ id: 's1' }],
    show: tab => { destination = tab; },
    byId: id => id === 'result' ? result : null
  })();
  assert.equal(destination, 'cart');
  assert.match(result.textContent, /Reviewing demo cart: 1 demo item\./);
  assert.match(result.textContent, /No payment, reservation or order submission occurred/);
  assert.match(app, /byId\('reviewServicesCart'\)\.hidden=!cart\.length/);
  assert.match(page, /No bookings, service requests or payments are available/);
});


test('duplicate nicknames have distinct profile action labels and a specific removal confirmation', () => {
  const source = app.match(/function renderMyRobots\(\)\{[^\n]*\}/);
  assert.ok(source, 'Expected My Robots profile renderer');
  const node = () => ({
    children: [], attributes: {},
    replaceChildren(...items) { this.children = items; },
    append(...items) { this.children.push(...items); },
    setAttribute(key, value) { this.attributes[key] = value; },
    querySelectorAll(selector) {
      const key = selector.slice(1, -1);
      const walk = item => [item, ...(item.children || []).flatMap(walk)];
      return this.children.flatMap(walk).filter(item => Object.hasOwn(item.attributes || {}, key));
    },
    focus() {}
  });
  const elements = Object.fromEntries(
    ['myrobots', 'profileCount', 'clearProfiles', 'profileSearch',
      'profileSearchSummary', 'clearProfileSearch', 'robotMessage', 'robotNickname'].map(id => [id, node()])
  );
  elements.profileSearch.value = '';
  let prompt = '', approved = false, saves = 0;
  const context = {
    mine: [
      { id: 'demo-1', name: 'Study Helper', brand: 'Example Robotics', model: 'A-1' },
      { id: 'demo-2', name: 'Study Helper', brand: 'Sample Maker', model: 'B-2' }
    ],
    selectedRobotId: null,
    byId: id => elements[id],
    document: { createElement: node },
    window: { confirm: message => { prompt = message; return approved; } },
    saveRobots: () => { saves++; return true; },
    updateSkillsRobotSummary: () => {},
    show: () => {}
  };
  context.renderMyRobots = new Script('(' + source[0] + ')').runInNewContext(context);
  context.renderMyRobots();
  const [newest, oldest] = elements.myrobots.children;
  for (const index of [4, 5, 6]) {
    assert.match(newest.children[index].attributes['aria-label'], /Sample Maker · B-2/);
    assert.match(oldest.children[index].attributes['aria-label'], /Example Robotics · A-1/);
  }
  newest.children[6].onclick();
  assert.match(prompt, /Study Helper — Sample Maker · B-2/);
  assert.equal(context.mine.length, 2, 'Cancelling must preserve both profiles');
  assert.equal(saves, 0, 'Cancelling must not write browser storage');
  approved = true;
  newest.children[6].onclick();
  assert.deepEqual(context.mine.map(profile => profile.id), ['demo-1']);
  assert.equal(saves, 1, 'Confirming removes only the named profile');
});

test('Services picker changes local demo context without suggesting compatibility or bookings', () => {
  assert.match(page, /id="serviceRobotSelect"[^>]*aria-describedby="serviceRobotContext"/);
  const source = app.match(/function updateServicesContext\(\)\{[^\n]*\}/);
  const handler = app.match(/byId\('serviceRobotSelect'\)\.addEventListener\('change',(e=>\{[^\n]*\})\);/);
  assert.ok(source && handler, 'Expected Services selector renderer and change handler');

  let focusCalls = 0, skillsUpdates = 0;
  const picker = {
    children: [], value: '', disabled: false,
    replaceChildren() { this.children = []; },
    append(option) { this.children.push(option); },
    focus() { focusCalls++; }
  };
  const notice = { textContent: '' };
  const first = { id: 'demo-1', name: 'Helper', brand: 'Example Maker', model: 'A' };
  const second = { id: 'demo-2', name: 'Helper', brand: 'Another Maker', model: 'B' };
  const context = {
    mine: [first, second], selectedRobotId: second.id,
    byId: id => id === 'serviceRobotSelect' ? picker : notice,
    document: { activeElement: picker, createElement: () => ({ value: '', textContent: '' }) },
    updateSkillsRobotSummary: () => { skillsUpdates++; }
  };
  context.updateServicesContext = new Script('(' + source[0] + ')').runInNewContext(context);
  const onChange = new Script('(' + handler[1] + ')').runInNewContext(context);

  context.updateServicesContext();
  assert.deepEqual(picker.children.map(option => option.value), ['', first.id, second.id]);
  assert.equal(picker.value, second.id);
  assert.equal(picker.disabled, false);
  assert.match(notice.textContent, /Another Maker · B/);
  assert.match(notice.textContent, /compatibility are unverified/);
  assert.match(notice.textContent, /no booking is available/);
  assert.equal(focusCalls, 1, 'Rebuilding the picker preserves keyboard focus');

  onChange({ target: { value: first.id } });
  assert.equal(context.selectedRobotId, first.id);
  assert.equal(picker.value, first.id);
  assert.match(notice.textContent, /Example Maker · A/);
  assert.doesNotMatch(notice.textContent, /Another Maker · B/);
  assert.equal(skillsUpdates, 1, 'Skills must use the same selected demo profile');

  onChange({ target: { value: '' } });
  assert.equal(context.selectedRobotId, null);
  assert.equal(picker.value, '');
  assert.match(notice.textContent, /not matched to any robot/);
  assert.equal(skillsUpdates, 2);

  context.mine = [];
  context.updateServicesContext();
  assert.equal(picker.disabled, true);
  assert.deepEqual(picker.children.map(option => option.value), ['']);
  assert.match(notice.textContent, /compatibility are unverified/);
  assert.equal(context.mine.length, 0, 'Preview selection must not create profiles');
});

test('Discover concept actions and Services demo add buttons have distinct accessible names', () => {
  const source = app.match(/function render\(\)\{[\s\S]*?\n(?=function show\()/);
  assert.ok(source, 'Expected the shared catalog renderer');
  const actions = {};
  const elements = {
    robotSearch: { value: '' },
    clearRobotSearch: { hidden: true },
    resetDiscoverFilters: { hidden: true },
    filterSummary: { textContent: '' },
    products: { innerHTML: '', role: '', setAttribute(name, value) { if (name === 'role') this.role = value; } },
    skillcards: { innerHTML: '' },
    servicecards: { innerHTML: '' }
  };
  const context = {
    robots: [{ id: 'r1', name: 'Home Robot Concept', category: 'home' }],
    services: [{ id: 's1', name: 'Robot Setup', detail: 'Illustrative only' }],
    skills: [], selectedCategory: 'all', cart: [],
    byId: id => elements[id],
    card: (item, action) => { actions[item.id] = action; return '<article></article>'; },
    renderMyRobots: () => {}, updateSkillsRobotSummary: () => {},
    updateServicesContext: () => {}, renderCart: () => {},
    document: { querySelectorAll: () => [] }
  };
  new Script('(' + source[0].trim() + ')').runInNewContext(context)();
  assert.match(actions.r1, /type="button"[^>]*aria-label="Add Home Robot Concept to demo cart \(preview only\)"/);
  assert.match(actions.s1, /type="button"[^>]*aria-label="Add Robot Setup service preview to demo cart \(no booking\)"/);
  assert.match(actions.r1, /type="button" data-robot="r1" aria-label="Create local demo profile for Home Robot Concept \(ownership and compatibility not verified\)"/);
  assert.match(actions.r1, />Add to demo cart<\/button>/);
  assert.match(actions.s1, />Add demo service<\/button>/);
  assert.match(page, /No bookings, service requests or payments are available/);
});

test('Services warns that demo profile selection does not establish eligibility', () => {
  const servicesSection = page.match(/<section id="services"[\s\S]*?<\/section>/)?.[0];
  assert.ok(servicesSection, 'Expected the Services section');
  assert.match(servicesSection, /Selecting a demo profile does not verify service eligibility/);
  assert.match(servicesSection, /No bookings, service requests or payments are available/);
  assert.match(servicesSection, /id="serviceRobotSelect" aria-describedby="serviceRobotContext"/);
});

test('Services actions announce the existing unverified eligibility context', () => {
  const serviceLine = app.split('\n').find(line => line.includes("byId('servicecards').innerHTML="));
  assert.ok(serviceLine, 'Expected service preview cards');
  assert.match(page, /id="serviceRobotContext"[^>]*role="status"/);
  assert.match(serviceLine, /disabled aria-disabled="true" aria-describedby="serviceRobotContext" aria-label=/);
  assert.match(serviceLine, /aria-describedby="serviceRobotContext" aria-label="Add /);
});

test('Discover offers a synchronized demo cart review shortcut without real checkout', () => {
  assert.match(page, /id="reviewDiscoverCart" hidden>Review demo cart/);
  assert.match(app, /byId\('reviewDiscoverCart'\)\.onclick=reviewDemoCart/);
  const handler = app.match(/function reviewDemoCart\(\)\{[^\n]*\}/);
  assert.ok(handler, 'Expected Discover-to-Checkout handler');
  let destination;
  new Script('(' + handler[0] + ')').runInNewContext({
    cart: [{ id: 'r1' }, { id: 's1' }],
    show: tab => { destination = tab; },
    byId: () => ({ textContent: '' })
  })();
  assert.equal(destination, 'cart');

  const source = app.match(/function renderCart\(\)\{[^\n]*\}/);
  assert.ok(source, 'Expected demo cart renderer');
  const node = () => ({
    children: [], attributes: {}, textContent: '',
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    setAttribute(name, value) { this.attributes[name] = value; }
  });
  const elements = Object.fromEntries(
    ['items', 'cartSummary', 'total', 'count', 'reviewServicesCart',
      'reviewDiscoverCart', 'reviewRobotsCart', 'reviewSkillsCart', 'clearCart', 'browseFromCheckout',
      'preview', 'checkoutToRobots', 'result'].map(id => [id, node()])
  );
  elements.checkoutToRobots.hidden = true;
  const robot = { id: 'r1', name: 'Home Robot Concept', price: 34900 };
  const service = { id: 's1', name: 'Robot Setup', price: 1500 };
  const context = {
    cart: [], robots: [robot], services: [service], lastBrowseTab: 'store',
    byId: id => elements[id], document: { createElement: node },
    money: value => '฿' + value.toLocaleString('en-US'),
    show: () => {}
  };
  const render = new Script('(' + source[0] + ')').runInNewContext(context);
  render();
  assert.equal(elements.reviewDiscoverCart.hidden, true);
  assert.equal(elements.reviewServicesCart.hidden, true);
  context.cart = [robot];
  render();
  assert.equal(elements.reviewDiscoverCart.hidden, false);
  assert.equal(elements.reviewDiscoverCart.textContent, 'Review demo cart (1 item) →');
  assert.equal(elements.reviewDiscoverCart.textContent, elements.reviewServicesCart.textContent);
  context.cart = [robot, service];
  render();
  assert.equal(elements.reviewDiscoverCart.textContent, 'Review demo cart (2 items) →');
  context.cart = [];
  render();
  assert.equal(elements.reviewDiscoverCart.hidden, true);
  assert.match(page, /No products are available to order through this demo/i);
});

test('Discover and Services mark already-added demo items without duplicating checkout actions', () => {
  const source = app.match(/function render\(\)\{[\s\S]*?\n(?=function show\()/);
  assert.ok(source, 'Expected the shared demo catalog renderer');
  const actions = {};
  const elements = {
    robotSearch: { value: '' }, clearRobotSearch: { hidden: true },
    resetDiscoverFilters: { hidden: true }, filterSummary: { textContent: '' },
    products: { innerHTML: '', role: '', setAttribute(name, value) { if (name === 'role') this.role = value; } }, skillcards: { innerHTML: '' }, servicecards: { innerHTML: '' }
  };
  const robot = { id: 'r1', name: 'Home Robot Concept', category: 'home' };
  const otherRobot = { id: 'r2', name: 'Companion Robot Concept', category: 'companion' };
  const service = { id: 's1', name: 'Robot Setup', detail: 'Illustrative only' };
  const cart = [];
  const context = {
    robots: [robot, otherRobot], services: [service], skills: [], cart,
    selectedCategory: 'all', byId: id => elements[id],
    card: (item, action) => { actions[item.id] = action; return '<article></article>'; },
    renderMyRobots: () => {}, updateSkillsRobotSummary: () => {},
    updateServicesContext: () => {}, renderCart: () => {},
    document: { querySelectorAll: () => [] }
  };
  const render = new Script('(' + source[0].trim() + ')').runInNewContext(context);
  render();
  assert.match(actions.r1, /aria-label="Add Home Robot Concept to demo cart \(preview only\)"/);
  assert.match(actions.s1, /aria-label="Add Robot Setup service preview to demo cart \(no booking\)"/);
  assert.doesNotMatch(actions.r1, / disabled /);

  cart.push(robot, service);
  render();
  for (const id of ['r1', 's1']) {
    assert.match(actions[id], / disabled aria-disabled="true"/, 'Added items must not be addable twice');
    assert.match(actions[id], />In demo cart<\/button>/);
    assert.match(actions[id], /already in demo cart/);
  }
  assert.doesNotMatch(actions.r2, / disabled /, 'Unselected robot remains addable');
  assert.match(actions.r2, />Add to demo cart<\/button>/);

  cart.splice(0);
  render();
  assert.doesNotMatch(actions.r1, / disabled /, 'Removed robot can be added again');
  assert.doesNotMatch(actions.s1, / disabled /, 'Removed service can be added again');
  assert.match(actions.r1, />Add to demo cart<\/button>/);
  assert.match(actions.s1, />Add demo service<\/button>/);
  assert.match(page, /No payment, reservation or order submission occurs/);
});

test('My Robots offers a synchronized demo cart review shortcut without real checkout', () => {
  assert.match(page, /id="reviewRobotsCart" hidden>Review demo cart/);
  assert.match(app, /byId\('reviewRobotsCart'\)\.onclick=reviewDemoCart/);
  const handler = app.match(/function reviewDemoCart\(\)\{[^\n]*\}/);
  assert.ok(handler, 'Expected My Robots-to-Checkout handler');
  let destination;
  new Script('(' + handler[0] + ')').runInNewContext({
    cart: [{ id: 'r1' }],
    show: tab => { destination = tab; },
    byId: () => ({ textContent: '' })
  })();
  assert.equal(destination, 'cart');

  const source = app.match(/function renderCart\(\)\{[^\n]*\}/);
  assert.ok(source, 'Expected cart renderer');
  const node = () => ({
    children: [], textContent: '', hidden: false,
    replaceChildren(...items) { this.children = items; },
    append(...items) { this.children.push(...items); },
    setAttribute() {}
  });
  const elements = Object.fromEntries(
    ['items', 'cartSummary', 'total', 'count', 'reviewServicesCart',
      'reviewDiscoverCart', 'reviewRobotsCart', 'reviewSkillsCart', 'clearCart', 'browseFromCheckout',
      'preview', 'checkoutToRobots', 'result'].map(id => [id, node()])
  );
  elements.checkoutToRobots.hidden = true;
  const robot = { id: 'r1', name: 'Home Robot Concept', price: 34900 };
  const context = {
    cart: [], robots: [robot], services: [], lastBrowseTab: 'store',
    byId: id => elements[id], document: { createElement: node },
    money: value => '฿' + value.toLocaleString('en-US'),
    show: () => {}
  };
  const render = new Script('(' + source[0] + ')').runInNewContext(context);
  render();
  assert.equal(elements.reviewRobotsCart.hidden, true, 'Empty cart hides the shortcut');
  context.cart = [robot];
  render();
  assert.equal(elements.reviewRobotsCart.hidden, false);
  assert.equal(elements.reviewRobotsCart.textContent, 'Review demo cart (1 item) →');
  assert.equal(elements.reviewRobotsCart.textContent, elements.reviewDiscoverCart.textContent);
  assert.equal(elements.reviewRobotsCart.textContent, elements.reviewServicesCart.textContent);
  context.cart = [];
  render();
  assert.equal(elements.reviewRobotsCart.hidden, true, 'Removing items hides the shortcut');
  assert.match(page, /No payment, reservation or order submission occurs/);
});

test('Skills offers a synchronized demo cart review shortcut without real checkout', () => {
  assert.match(page, /id="reviewSkillsCart" hidden>Review demo cart/);
  assert.match(app, /byId\('reviewSkillsCart'\)\.onclick=reviewDemoCart/);
  const handler = app.match(/function reviewDemoCart\(\)\{[^\n]*\}/);
  assert.ok(handler, 'Expected Skills-to-Checkout handler');
  let destination;
  new Script('(' + handler[0] + ')').runInNewContext({
    cart: [{ id: 'r1' }],
    show: tab => { destination = tab; },
    byId: () => ({ textContent: '' })
  })();
  assert.equal(destination, 'cart');

  const source = app.match(/function renderCart\(\)\{[^\n]*\}/);
  assert.ok(source, 'Expected demo cart renderer');
  const node = () => ({
    children: [], textContent: '', hidden: false,
    replaceChildren(...items) { this.children = items; },
    append(...items) { this.children.push(...items); },
    setAttribute() {}
  });
  const elements = Object.fromEntries(
    ['items', 'cartSummary', 'total', 'count', 'reviewServicesCart',
      'reviewDiscoverCart', 'reviewRobotsCart', 'reviewSkillsCart', 'clearCart',
      'browseFromCheckout', 'preview', 'checkoutToRobots', 'result'].map(id => [id, node()])
  );
  elements.checkoutToRobots.hidden = true;
  const robot = { id: 'r1', name: 'Home Robot Concept', price: 34900 };
  const service = { id: 's1', name: 'Robot Setup', price: 1500 };
  const context = {
    cart: [], robots: [robot], services: [service], lastBrowseTab: 'store',
    byId: id => elements[id], document: { createElement: node },
    money: value => '฿' + value.toLocaleString('en-US'),
    show: () => {}
  };
  const render = new Script('(' + source[0] + ')').runInNewContext(context);
  render();
  assert.equal(elements.reviewSkillsCart.hidden, true, 'Empty cart hides the shortcut');
  context.cart = [robot];
  render();
  assert.equal(elements.reviewSkillsCart.hidden, false);
  assert.equal(elements.reviewSkillsCart.textContent, 'Review demo cart (1 item) →');
  assert.equal(elements.reviewSkillsCart.textContent, elements.reviewRobotsCart.textContent);
  context.cart = [robot, service];
  render();
  assert.equal(elements.reviewSkillsCart.textContent, 'Review demo cart (2 items) →');
  context.cart = [];
  render();
  assert.equal(elements.reviewSkillsCart.hidden, true, 'Removing items hides the shortcut');
  assert.match(page, /Compatibility is not verified, and installation is unavailable/);
  assert.match(page, /No payment, reservation or order submission occurs/);
});

test('Skills disabled install buttons identify each preview without claiming compatibility', () => {
  const source = app.match(/function render\(\)\{[\s\S]*?\n(?=function show\()/);
  assert.ok(source, 'Expected shared demo catalog renderer');
  const skills = [
    { name: 'Home Patrol', price: 199, detail: 'Example only' },
    { name: 'Object Delivery', price: 299, detail: 'Example only' }
  ];
  const actions = [];
  const elements = {
    robotSearch: { value: '' }, clearRobotSearch: { hidden: true },
    resetDiscoverFilters: { hidden: true }, filterSummary: { textContent: '' },
    products: { innerHTML: '', role: '', setAttribute(name, value) { if (name === 'role') this.role = value; } }, skillcards: { innerHTML: '' },
    servicecards: { innerHTML: '' }
  };
  const context = {
    robots: [], services: [], skills, selectedCategory: 'all', cart: [],
    byId: id => elements[id],
    card: (item, action) => { if (skills.includes(item)) actions.push(action); return '<article></article>'; },
    renderMyRobots: () => {}, updateSkillsRobotSummary: () => {},
    updateServicesContext: () => {}, renderCart: () => {},
    document: { querySelectorAll: () => [] }
  };
  new Script('(' + source[0].trim() + ')').runInNewContext(context)();
  assert.equal(actions.length, 2);
  assert.match(actions[0], /disabled aria-disabled="true" aria-label="Install unavailable for Home Patrol \(preview only; compatibility not verified\)"/);
  assert.match(actions[1], /disabled aria-disabled="true" aria-label="Install unavailable for Object Delivery \(preview only; compatibility not verified\)"/);
  for (const action of actions) {
    assert.match(action, /aria-describedby="skillsRobotSummary"/, 'Unavailable install actions must explain selected demo profile and unverified compatibility');
    assert.match(action, />Install unavailable<\/button>/);
    assert.doesNotMatch(action, /data-install|onclick=/);
  }
  assert.match(page, /Compatibility is not verified, and installation is unavailable/);
});


test('demo profile fields opt out of browser autofill to reduce unintended personal data entry', () => {
  for (const id of ['robotNickname', 'robotBrand', 'robotModel']) {
    assert.match(page, new RegExp('<input id="' + id + '"[^>]*autocomplete="off"'));
  }
});

test('My Robots warns against entering sensitive information in local demo profiles', () => {
  const robots = page.match(/<section id="robots"[\s\S]*?<\/section>/)?.[0];
  assert.ok(robots, 'Expected My Robots section');
  assert.match(robots, /Do not enter serial numbers, account credentials, payment details or other personal information\./);
  assert.match(robots, /id="saveDemoProfile" type="submit" aria-describedby="profileCount profilePrivacyNotice"/);
});

test('My Robots warns at the first profile field before entering sensitive data', () => {
  const robots = page.match(/<section id="robots"[\s\S]*?<\/section>/)?.[0];
  assert.ok(robots, 'Expected My Robots section');
  assert.match(robots, /Create a local demo profile for any robot/);
  const nickname = robots.match(/<input id="robotNickname"[^>]*>/)?.[0];
  assert.ok(nickname, 'Expected demo profile nickname input');
  assert.match(nickname, /aria-describedby="profilePrivacyNotice"/);
  assert.match(robots, /<p id="profilePrivacyNotice"[^>]*>[^<]*Do not enter serial numbers, account credentials, payment details or other personal information\./);
});

test('My Robots save action explains browser-local storage and unverified manufacturer registration', () => {
  const robots = page.match(/<section id="robots"[\s\S]*?<\/section>/)?.[0];
  assert.ok(robots, 'Expected My Robots section');
  assert.match(robots, /id="saveDemoProfile" type="submit" aria-describedby="profileCount profilePrivacyNotice"/);
  assert.match(robots, /<p id="profilePrivacyNotice" class="hint">Saved only in this browser\.[^<]*Clearing this browser's site data removes these local demo profiles; they are not registered with a manufacturer\.<\/p>/);
});

test('My Robots disables profile submission at 30 saved demos and re-enables it after removal', () => {
  assert.match(page, /id="saveDemoProfile" type="submit" aria-describedby="profileCount profilePrivacyNotice"/);
  assert.match(app, /function renderMyRobots\(\)\{[^\n]*const remaining=30-mine.length;const save=/);
  const source = app.match(/const save=byId\('saveDemoProfile'\);if\(save\)\{[^}]+\}/);
  assert.ok(source, 'Expected save-button limit guard in My Robots renderer');
  const button = { disabled: false, textContent: '' };
  const update = (remaining, available = true) => new Script(source[0]).runInNewContext({
    remaining, byId: id => id === 'saveDemoProfile' && available ? button : null
  });
  update(30);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, 'Save demo profile');
  update(1);
  assert.equal(button.disabled, false);
  update(0);
  assert.equal(button.disabled, true, 'A full collection must block futile submissions');
  assert.equal(button.textContent, 'Demo profile limit reached (30)');
  update(1);
  assert.equal(button.disabled, false, 'Removing one profile must restore the save action');
  assert.equal(button.textContent, 'Save demo profile');
  assert.doesNotThrow(() => update(0, false), 'Minimal test DOMs without this button remain supported');
});


test('Discover concept handoff protects unsaved profile fields when 30 demo profiles are saved', () => {
  const source = app.match(/document\.querySelectorAll\('\[data-robot\]'\)\.forEach\(b=>b\.onclick=(\(\)=>\{[^\n]*\})\);/);
  assert.ok(source, 'Expected Discover concept profile action');
  let destination = null, focused = null;
  const fields = {
    robotNickname: { value: 'Unsaved nickname' },
    robotBrand: { value: 'Unsaved brand', focus() { focused = 'brand'; } },
    robotModel: { value: 'Unsaved model' },
    robotMessage: { textContent: '' },
    clearProfiles: { focus() { focused = 'manage'; } }
  };
  let confirmed = false, prompts = 0, draftRefreshes = 0;
  const context = {
    robots: [{ id: 'r1', name: 'Home Robot Concept' }],
    mine: Array.from({ length: 30 }, (_, i) => ({ id: 'demo-' + i })),
    updateRobotDraftAction: () => { draftRefreshes++; },
    b: { dataset: { robot: 'r1' } },
    byId: id => fields[id],
    window: { confirm: () => { prompts++; return confirmed; } },
    show: tab => { destination = tab; }
  };
  const handoff = new Script('(' + source[1] + ')').runInNewContext(context);
  handoff();
  assert.equal(destination, 'robots');
  assert.equal(focused, 'manage', 'Focus must reach the control for managing full profiles');
  assert.deepEqual([fields.robotNickname.value, fields.robotBrand.value, fields.robotModel.value],
    ['Unsaved nickname', 'Unsaved brand', 'Unsaved model'], 'Do not overwrite unsaved entries at capacity');
  assert.match(fields.robotMessage.textContent, /limit reached \(30\).*Remove a saved profile/i);
  assert.equal(context.mine.length, 30, 'No profile is added or removed automatically');

  assert.equal(prompts, 0, 'At capacity no overwrite confirmation is needed');
  context.mine.pop();
  focused = null;
  destination = null;
  handoff();
  assert.equal(prompts, 1, 'Unsaved form entries require confirmation before replacement');
  assert.equal(destination, null, 'Cancelling must leave the user on Discover');
  assert.deepEqual([fields.robotNickname.value, fields.robotBrand.value, fields.robotModel.value],
    ['Unsaved nickname', 'Unsaved brand', 'Unsaved model'], 'Cancel preserves every unsaved field');
  assert.equal(focused, null, 'Cancel must not steal keyboard focus');
  confirmed = true;
  handoff();
  assert.equal(prompts, 2, 'Confirming permits a deliberate replacement');
  assert.equal(fields.robotNickname.value, 'Home Robot Concept', 'Normal prefill still works below the limit');
  assert.equal(fields.robotBrand.value, '');
  assert.equal(fields.robotModel.value, '');
  assert.equal(focused, 'brand');
  assert.equal(draftRefreshes, 1, 'Confirmed prefill refreshes the unsaved draft indicator once');
});


test('My Robots can discard unsaved fields without removing saved demo profiles', () => {
  assert.match(page, /id="clearRobotDraft" type="button" hidden/);
  assert.match(app, /byId\('registerRobot'\)\.addEventListener\('input',updateRobotDraftAction\)/);
  assert.match(app, /updateRobotDraftAction\(\);show\('robots'\)/, 'Discover prefill refreshes discard visibility');
  assert.match(app, /e\.target\.reset\(\);updateRobotDraftAction\(\)/, 'Saving refreshes discard visibility');
  const helper = app.match(/function updateRobotDraftAction\(\)\{[^\n]*\}/);
  const handler = app.match(/byId\('clearRobotDraft'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  assert.ok(helper && handler, 'Expected local draft-only clear action');
  const saved = [{ id: 'existing', name: 'Existing robot' }];
  let focused = false, accepted = false, prompts = 0;
  const fields = {
    robotNickname: { value: 'Unsaved nickname', focus() { focused = true; } },
    robotBrand: { value: 'Unsaved brand' },
    robotModel: { value: 'Unsaved model' },
    robotMessage: { textContent: '' },
    clearRobotDraft: { hidden: true },
    robotDraftStatus: { textContent: '' }
  };
  const form = { reset() {
    fields.robotNickname.value = '';
    fields.robotBrand.value = '';
    fields.robotModel.value = '';
  } };
  const context = {
    byId: id => id === 'registerRobot' ? form : fields[id],
    window: { confirm: () => { prompts++; return accepted; } }
  };
  const update = new Script('(' + helper[0] + ')').runInNewContext(context);
  context.updateRobotDraftAction = update;
  const discard = new Script('(' + handler[1] + ')').runInNewContext(context);
  update();
  assert.equal(fields.clearRobotDraft.hidden, false, 'Filled draft shows discard action');
  assert.match(fields.robotDraftStatus.textContent, /Unsaved demo profile fields.*No profile has been saved or connected/);
  discard();
  assert.equal(prompts, 1);
  assert.equal(fields.robotNickname.value, 'Unsaved nickname', 'Cancel preserves draft');
  assert.equal(focused, false);
  accepted = true;
  discard();
  assert.equal(prompts, 2);
  assert.deepEqual([fields.robotNickname.value, fields.robotBrand.value, fields.robotModel.value], ['', '', '']);
  assert.equal(fields.clearRobotDraft.hidden, true, 'Cleared draft hides discard action');
  assert.equal(fields.robotDraftStatus.textContent, '', 'Discarding removes the unsaved status');
  assert.equal(focused, true, 'Focus returns to the first field');
  assert.match(fields.robotMessage.textContent, /Saved profiles were not changed/);
  assert.equal(saved.length, 1, 'Saved profiles remain untouched');
  fields.robotBrand.value = 'Another brand';
  update();
  assert.equal(fields.clearRobotDraft.hidden, false, 'Typing again restores discard action');
  assert.match(fields.robotDraftStatus.textContent, /Unsaved demo profile fields/, 'Typing again restores the draft warning');
});


test('My Robots announces draft state only while unsaved fields exist', () => {
  assert.match(page, /id="robotDraftStatus" class="hint" role="status" aria-live="polite"/);
  const helper = app.match(/function updateRobotDraftAction\(\)\{[^\n]*\}/);
  assert.ok(helper);
  const fields = {
    robotNickname: { value: '' }, robotBrand: { value: '' }, robotModel: { value: '' },
    clearRobotDraft: { hidden: true }, robotDraftStatus: { textContent: '' }
  };
  const update = new Script('(' + helper[0] + ')').runInNewContext({ byId: id => fields[id] });
  update();
  assert.equal(fields.robotDraftStatus.textContent, '', 'Empty form must not warn about unsaved data');
  fields.robotNickname.value = 'Example concept';
  update();
  assert.equal(fields.clearRobotDraft.hidden, false);
  assert.match(fields.robotDraftStatus.textContent, /Unsaved demo profile fields.*No profile has been saved or connected/);
  fields.robotNickname.value = '';
  update();
  assert.equal(fields.robotDraftStatus.textContent, '', 'Clearing the last draft field removes the warning');
});

test('Enter in checkout nickname triggers preview only for nonempty demo carts', () => {
  assert.match(page, /Enter does not preview while the cart is empty\. Press Escape to clear the nickname/);
  assert.match(page, /cart\.length\?'Press Enter to preview or Escape to clear the nickname\.':'Enter does not preview while the cart is empty\. Press Escape to clear the nickname\.'\)/);
  assert.match(page, /Press Enter to preview or Escape to clear the nickname/);
  const source = app.match(/byId\('name'\)\.addEventListener\('keydown',(e=>\{if\(e\.key==='Enter'[^\n]*\})\);/);
  assert.ok(source, 'Expected a dedicated Enter preview handler');
  const cart = [{ id: 'r1' }];
  let clicked = 0, prevented = 0;
  const preview = { click() { clicked++; } };
  const handler = new Script('(' + source[1] + ')').runInNewContext({
    cart, byId: id => id === 'preview' ? preview : undefined
  });
  const event = (key, isComposing = false) => ({
    key, isComposing, preventDefault() { prevented++; }
  });
  handler(event('Enter'));
  assert.equal(clicked, 1, 'Enter should activate the existing preview button');
  assert.equal(prevented, 1, 'Prevent implicit submission or navigation');
  handler(event('Escape'));
  assert.equal(clicked, 1, 'Escape remains handled by the separate privacy shortcut');
  cart.pop();
  handler(event('Enter'));
  assert.equal(clicked, 1, 'An empty cart must never preview');
  assert.equal(prevented, 1, 'Empty cart Enter remains a no-op');
  cart.push({ id: 'r1' });
  handler(event('Enter', true));
  assert.equal(clicked, 1, 'IME composition must not trigger an accidental preview');
  assert.equal(prevented, 1);
});

test('empty checkout says no order was placed and opens My Robots without a cart or preview', () => {
  assert.match(page, /Your cart is empty\. No order was placed\. Press Open My Robots \(demo profiles\)\. This does not connect a device\./);
  assert.doesNotMatch(page, /empty\.textContent='Your cart is empty\.'/);
  assert.match(page, /openRobots\.textContent='Open My Robots \(demo profiles\) →'/);
  assert.match(page, /aria-label','Open My Robots \(demo profiles\) →\. No order is placed and no device is connected\.'/);
  assert.match(page, /openRobots\.onclick=\(\)=>show\('robots'\)/);
  assert.match(page, /#items > button\{[^}]*min-height:44px/);
  assert.match(page, /#items > button\[data-cart-robots\]\{[^}]*background:#e4efe7;color:#111/);
  const source = app.match(/function renderCart\(\)\{[^\n]*\}/);
  assert.ok(source, 'Expected demo cart renderer');
  const node = () => ({
    children: [], attributes: {}, textContent: '', hidden: false, disabled: false,
    replaceChildren(...items) { this.children = items; },
    append(...items) { this.children.push(...items); },
    setAttribute(name, value) { this.attributes[name] = value; }
  });
  const elements = Object.fromEntries(
    ['items', 'cartSummary', 'total', 'count', 'clearCart', 'browseFromCheckout',
      'preview', 'checkoutToRobots', 'result', 'reviewServicesCart', 'reviewDiscoverCart',
      'reviewRobotsCart', 'reviewSkillsCart', 'previewNameHint'].map(id => [id, node()])
  );
  elements.checkoutToRobots.hidden = true;
  const robot = { id: 'r1', name: 'Home Robot Concept', price: 34900 };
  const service = { id: 's1', name: 'Robot Setup', price: 1500 };
  const destinations = [];
  const guestHint = 'Leave blank to preview as Guest, or use a nickname rather than your real name. This is an on-page demo preview; no order or personal details are submitted. ';
  const context = {
    cart: [], robots: [robot], services: [service], lastBrowseTab: 'store',
    byId: id => elements[id],
    document: { createElement: node },
    money: value => '฿' + value.toLocaleString('en-US'),
    show: tab => { destinations.push(tab); }
  };
  const render = new Script('(' + source[0] + ')').runInNewContext(context);
  const robotsButton = () => elements.items.children.find(child => Object.hasOwn(child.attributes, 'data-cart-robots'));

  render();
  assert.equal(elements.cartSummary.textContent, 'Demo cart is empty. No order placed.');
  assert.equal(elements.items.children[0].textContent, 'Your cart is empty. No order was placed. Press Open My Robots (demo profiles). This does not connect a device.');
  assert.equal(elements.items.children[1].textContent, 'Browse demo robots →');
  assert.equal(elements.items.children[1].attributes['data-cart-browse'], '');
  assert.equal(elements.items.children[1].className, 'buy');
  const emptyRobots = robotsButton();
  assert.equal(emptyRobots, elements.items.children[2], 'My Robots stays a separate control from browsing');
  assert.equal(emptyRobots.type, 'button');
  assert.equal(emptyRobots.textContent, 'Open My Robots (demo profiles) →');
  assert.equal(emptyRobots.attributes['aria-label'], 'Open My Robots (demo profiles) →. No order is placed and no device is connected.');
  assert.equal(elements.previewNameHint.textContent, guestHint + 'Enter does not preview while the cart is empty. Press Escape to clear the nickname.');
  assert.doesNotMatch(elements.previewNameHint.textContent, /Press Enter to preview/);
  assert.equal(elements.preview.disabled, true);
  assert.equal(elements.checkoutToRobots.hidden, true, 'Empty My Robots path does not wait for a preview');
  emptyRobots.onclick();
  assert.deepEqual(destinations, ['robots']);
  assert.equal(context.cart.length, 0, 'My Robots opens with an empty cart');
  assert.equal(elements.result.textContent, '', 'Opening My Robots does not create an order preview');
  elements.items.children[1].onclick();
  assert.deepEqual(destinations, ['robots', 'store']);

  context.lastBrowseTab = 'services';
  render();
  assert.equal(elements.items.children[1].textContent, 'Browse service previews →');
  assert.equal(robotsButton().textContent, 'Open My Robots (demo profiles) →');
  elements.items.children[1].onclick();
  robotsButton().onclick();
  assert.deepEqual(destinations, ['robots', 'store', 'services', 'robots']);

  context.cart = [robot];
  context.lastBrowseTab = 'store';
  render();
  assert.equal(robotsButton(), undefined, 'A nonempty cart keeps the existing preview handoff');
  assert.equal(elements.preview.disabled, false);
  assert.equal(elements.previewNameHint.textContent, guestHint + 'Press Enter to preview or Escape to clear the nickname.');
  context.cart = [service];
  render();
  assert.equal(robotsButton(), undefined);
  assert.match(elements.previewNameHint.textContent, /Press Enter to preview or Escape to clear the nickname\./);
  context.cart = [];
  render();
  assert.equal(robotsButton().textContent, 'Open My Robots (demo profiles) →');
  assert.equal(elements.previewNameHint.textContent, guestHint + 'Enter does not preview while the cart is empty. Press Escape to clear the nickname.');
  assert.equal(elements.checkoutToRobots.hidden, true);
});

test('Escape keeps IME composition intact in Discover, My Robots and Checkout', () => {
  for (const id of ['robotSearch', 'profileSearch', 'name']) {
    const line = app.split('\n').find(x => x.startsWith("byId('" + id + "').addEventListener('keydown',e=>{if(e.key==='Escape'"));
    assert.ok(line, 'Expected Escape handler for ' + id);
    const source = line.match(/,(e=>\{.*\})\);$/);
    assert.ok(source, 'Expected keyboard callback for ' + id);
    let prevented = 0, rendered = 0, cleared = 0;
    const field = { value: '中文', focus() {} };
    const elements = {
      [id]: field,
      clearPreviewName: { onclick() { cleared++; field.value = ''; } }
    };
    const handler = new Script('(' + source[1] + ')').runInNewContext({
      byId: key => elements[key],
      render: () => { rendered++; },
      renderMyRobots: () => { rendered++; }
    });
    const event = isComposing => ({
      key: 'Escape', isComposing, preventDefault() { prevented++; }
    });
    handler(event(true));
    assert.equal(field.value, '中文', id + ' must preserve text while composing');
    assert.equal(prevented, 0, id + ' must not swallow IME Escape');
    assert.equal(rendered + cleared, 0, id + ' must not trigger a clear action during composition');
    handler(event(false));
    assert.equal(field.value, '', id + ' must still clear on a normal Escape');
    assert.equal(prevented, 1, id + ' must prevent browser Escape after clearing');
    assert.equal(rendered + cleared, 1, id + ' must trigger exactly one clear action');
  }
});

test('leaving with an unsaved My Robots draft requests a browser warning without affecting empty forms', () => {
  assert.match(page, /Unsaved fields are not stored\. Reloading or leaving may discard them/);
  const detector = app.match(/function hasUnsavedRobotDraft\(\)\{[^\n]*\}/);
  const listener = app.match(/window\.addEventListener\('beforeunload',(e=>\{[^\n]*\})\);/);
  assert.ok(detector && listener, 'Expected a shared draft detector and beforeunload handler');
  const fields = Object.fromEntries(['robotNickname', 'robotBrand', 'robotModel'].map(id => [id, { value: '' }]));
  const hasUnsavedRobotDraft = new Script('(' + detector[0] + ')').runInNewContext({
    byId: id => fields[id]
  });
  const onBeforeUnload = new Script('(' + listener[1] + ')').runInNewContext({ hasUnsavedRobotDraft });
  const dispatch = () => {
    let prevented = 0;
    const event = { returnValue: undefined, preventDefault() { prevented++; } };
    onBeforeUnload(event);
    return { prevented, returnValue: event.returnValue };
  };
  assert.deepEqual(dispatch(), { prevented: 0, returnValue: undefined }, 'Empty form must not warn');
  fields.robotNickname.value = '   ';
  assert.deepEqual(dispatch(), { prevented: 0, returnValue: undefined }, 'Whitespace-only form must not warn');
  fields.robotNickname.value = 'My study robot';
  assert.deepEqual(dispatch(), { prevented: 1, returnValue: '' }, 'Unsaved nickname should request a warning');
  fields.robotNickname.value = '';
  fields.robotModel.value = 'Model A';
  assert.deepEqual(dispatch(), { prevented: 1, returnValue: '' }, 'Any unsaved field should request a warning');
  fields.robotModel.value = '';
  assert.deepEqual(dispatch(), { prevented: 0, returnValue: undefined }, 'Discarding or saving cleared fields must not warn');
});

test('Skills and Services expose preview cards as labelled lists without compatibility claims', () => {
  assert.match(page, /id="skillcards" role="list" aria-label="Generic skill previews"/);
  assert.match(page, /id="servicecards" role="list" aria-label="Generic service previews"/);
  const skillLine = app.split('\n').find(line => line.includes("byId('skillcards').innerHTML="));
  const serviceLine = app.split('\n').find(line => line.includes("byId('servicecards').innerHTML="));
  assert.ok(skillLine?.includes("'preview-list-card'"));
  assert.ok(serviceLine?.includes("'preview-list-card'"));
  const cardSource = app.match(/function card\(x,action,variant=''\)\{[^\n]*\}/)?.[0];
  assert.ok(cardSource, 'Expected shared preview card renderer');
  const renderCard = new Script('(' + cardSource + ')').runInNewContext({ money: n => '฿' + n });
  const preview = renderCard({ name: 'Generic Skill', price: 100 }, '<p>Preview only</p>', 'preview-list-card');
  const plain = renderCard({ name: 'Generic Skill', price: 100 }, '');
  assert.match(preview, /^<article role="listitem" class="card preview-list-card">/);
  assert.doesNotMatch(plain, /role="listitem"/);
  assert.match(page, /Compatibility is not verified, and installation is unavailable/);
  assert.match(page, /No bookings, service requests or payments are available/);
});

test('My Robots and Skills show a labelled demo next step before the long mobile content', () => {
  const robots = page.match(/<section id="robots"[\s\S]*?<\/section>/)?.[0];
  const skills = page.match(/<section id="skills"[\s\S]*?<\/section>/)?.[0];
  assert.ok(robots && skills, 'Expected My Robots and Skills sections');

  const robotsButton = robots.indexOf('id="openSkillsFromRobots"');
  const robotsForm = robots.indexOf('<form id="registerRobot"');
  const robotsList = robots.indexOf('id="myrobots"');
  assert.ok(robotsButton > 0 && robotsButton < robotsForm && robotsForm < robotsList,
    'Explore skill previews stays above the registration form and saved-profile list');
  assert.match(robots, /<h2 id="robots-title">My Robots<\/h2><p class="muted">[^<]*does not verify ownership or connect hardware\.<\/p><p><button type="button" class="next-step" id="openDiscoverFromRobots">Explore robot concepts →<\/button> <button type="button" class="buy next-step" id="openSkillsFromRobots">Explore skill previews →<\/button><\/p>/);
  assert.ok(robots.indexOf('id="openDiscoverFromRobots"') < robotsButton,
    'The empty-state route back to Discover stays with the labelled next step');
  assert.equal(robots.match(/id="openDiscoverFromRobots"/g).length, 1);
  assert.equal(robots.match(/id="openSkillsFromRobots"/g).length, 1);

  const skillsButton = skills.indexOf('id="openServicesFromSkills"');
  const skillsCard = skills.indexOf('id="skillcards"');
  assert.ok(skillsButton > 0 && skillsButton < skillsCard,
    'Explore service previews stays above the skill preview list');
  assert.match(skills, /<h2 id="skills-title">Skills<\/h2><p class="muted">[^<]*installation is unavailable\.<\/p><p><button type="button" class="buy next-step" id="openServicesFromSkills">Explore service previews →<\/button><\/p>/);
  assert.equal(skills.match(/id="openServicesFromSkills"/g).length, 1);

  assert.match(page, /\.next-step\{[^}]*box-sizing:border-box;[^}]*min-height:44px;[^}]*min-width:44px/);
  assert.match(page, /\.next-step:focus-visible\{outline:3px solid #111;outline-offset:2px\}/);
  assert.match(page, /@media \(forced-colors: active\)\{\.next-step:focus-visible\{outline-color:Highlight\}\}/);
  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  assert.match(mobile, /\.buy\.next-step \{ width: 100%; \}/);

  const source = app.match(/function renderMyRobots\(\)\{[^\n]*\}/);
  assert.ok(source, 'Expected My Robots renderer');
  const node = () => ({
    children: [], attributes: {}, className: '', hidden: false, disabled: false, textContent: '',
    replaceChildren(...items) { this.children = items; },
    append(...items) { this.children.push(...items); },
    setAttribute(key, value) { this.attributes[key] = value; }
  });
  const elements = Object.fromEntries(
    ['myrobots', 'saveDemoProfile', 'profileCount', 'clearProfiles', 'profileSearch',
      'clearProfileSearch', 'profileSearchSummary'].map(id => [id, node()])
  );
  elements.profileSearch.value = '';
  const visits = [];
  const context = {
    mine: [],
    byId: id => elements[id],
    document: { createElement: node },
    show: tab => visits.push(tab)
  };
  new Script('(' + source[0] + ')').runInNewContext(context)();
  assert.equal(elements.myrobots.children[0].textContent, 'No demo robots added yet.');
  assert.equal(elements.myrobots.children[1].textContent, 'Press Explore skill previews for generic skill previews, or press Explore robot concepts. You can also use Save demo profile in the form above. None of these actions verifies ownership, compatibility, or connects a device.');
  assert.doesNotMatch(elements.myrobots.children[1].textContent, /illustrative robot concepts/);
  const browse = elements.myrobots.children[2];
  assert.equal(browse.textContent, 'Explore robot concepts →');
  assert.equal(browse.className, 'next-step');
  assert.equal(browse.type, 'button');
  browse.onclick();
  assert.deepEqual(visits, ['store']);
  assert.match(app, /Press Browse generic skills \(demo\) on this saved profile\. Compatibility not verified; no device connected\./);
  assert.match(app, /preview\.className='next-step'/);
});

test('mobile Discover keeps the first concept card actions above the fixed bottom nav', () => {
  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  assert.match(mobile, /At 390px the first concept card sat under the fixed bottom nav/);
  assert.match(mobile, /body:has\(#store:not\(\[hidden\]\)\) header \{ padding: 8px 16px; \}/);
  assert.match(mobile, /main:has\(#store:not\(\[hidden\]\)\) \{ padding-top: 8px; \}/);
  assert.match(mobile, /main:has\(#store:not\(\[hidden\]\)\) > h1 \{\s*font-size: 28px;\s*line-height: 1\.15;\s*margin: 0 0 8px;\s*\}/);
  assert.match(mobile, /main:has\(#store:not\(\[hidden\]\)\) > p \{ margin: 0 0 8px; \}/);
  assert.match(mobile, /#store > h2 \{ margin: 8px 0 4px; \}/);
  assert.match(mobile, /#store > p\.muted \{ margin: 0 0 6px; \}/);
  assert.match(mobile, /#store \.store-filters \{ margin: 0 0 6px; \}/);
  assert.match(mobile, /#store > label \{ margin: 0 0 4px; \}/);
  assert.match(mobile, /#store #filterSummary \{ margin: 2px 0 4px; \}/);
  assert.match(mobile, /#store > \.grid \{ margin-top: 4px; \}/);
  assert.match(mobile, /\.concept-card \{ gap: 8px; padding: 12px 14px; \}/);
  assert.match(mobile, /\.concept-card h3 \{ margin: 0; \}/);
  assert.match(page, /\.concept-actions button\{[^}]*min-height:44px/);

  const store = page.match(/<section id="store"[\s\S]*?<\/section>/)?.[0];
  assert.ok(store, 'Expected the Discover section');
  assert.ok(store.indexOf('id="robotSearch"') < store.indexOf('id="products"'), 'Search stays before the concept cards');
  assert.ok(store.indexOf('id="products"') < store.indexOf('id="reviewDiscoverCart"'), 'Review demo cart stays after the concept cards');
  assert.match(store, /Illustrative concepts only\. No products are available to order through this demo\./);
  assert.match(page, /Prototype only: sample listings and prices\. Checkout creates an order preview only; no purchases, payments, verified compatibility or device connections\./);
  assert.match(app, /Illustrative price/);
  assert.match(app, /Add to demo cart/);
  assert.match(app, /Concept only/);
});

test('mobile Discover keeps search, category filters, and recovery actions at least 44px', () => {
  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  assert.match(mobile, /At 390px Discover category chips were 39px tall, concept search was 37px tall, and Clear search, Show all, and Review demo cart were 39px/);
  assert.match(mobile, /#store \.store-filters button,\s*#store #robotSearch,\s*#store #clearRobotSearch,\s*#store #resetDiscoverFilters,\s*#store #reviewDiscoverCart \{\s*box-sizing: border-box;\s*min-height: 44px;\s*min-width: 44px;\s*\}/);
  assert.match(mobile, /#store:has\(#clearRobotSearch:not\(\[hidden\]\)\) > h2 \{ margin: 4px 0 2px; \}/);
  assert.match(mobile, /#store:has\(#clearRobotSearch:not\(\[hidden\]\)\) > p\.muted \{ margin-bottom: 2px; \}/);
  assert.match(mobile, /#store:has\(#clearRobotSearch:not\(\[hidden\]\)\) \.store-filters \{ margin-bottom: 2px; \}/);
  assert.match(mobile, /#store:has\(#clearRobotSearch:not\(\[hidden\]\)\) #filterSummary \{ margin: 0 0 2px; \}/);
  assert.match(mobile, /#store:has\(#clearRobotSearch:not\(\[hidden\]\)\) > \.grid \{ margin-top: 0; \}/);
  assert.match(mobile, /#store:has\(#clearRobotSearch:not\(\[hidden\]\)\) \.concept-card \{\s*gap: 4px;\s*padding-top: 4px;\s*\}/);

  const store = page.match(/<section id="store"[\s\S]*?<\/section>/)?.[0];
  assert.ok(store, 'Expected the Discover section');
  assert.match(store, /Illustrative concepts only\. No products are available to order through this demo\./);
  assert.match(store, /data-category="all"[^>]*aria-pressed="true">All robots/);
  assert.match(store, /data-category="home"/);
  assert.match(store, /data-category="companion"/);
  assert.match(store, /data-category="education"/);
  assert.match(store, /id="robotSearch" type="search"/);
  assert.match(store, /id="clearRobotSearch" hidden aria-label="Clear robot concept search"/);
  assert.match(store, /id="resetDiscoverFilters" hidden>Show all robot concepts/);
  assert.match(store, /id="reviewDiscoverCart" hidden>Review demo cart/);
  assert.match(page, /\.concept-actions button\{[^}]*min-height:44px/);
  assert.doesNotMatch(store, /payment method|place order|buy now|card number/i);
});


test('Services shows recovery routes before generic cards and names them without claiming compatibility', () => {
  const services = page.match(/<section id="services"[\s\S]*?<\/section>/)?.[0];
  assert.ok(services, 'Expected Services section');
  const notice = services.indexOf('id="serviceRobotContext"');
  const skills = services.indexOf('id="openSkillsFromServices"');
  const robots = services.indexOf('id="openRobotsFromServices"');
  const cards = services.indexOf('id="servicecards"');
  assert.ok(notice > 0 && notice < skills && skills < robots && robots < cards,
    'Recovery actions stay after context and before long service cards');
  assert.equal(services.match(/id="openSkillsFromServices"/g).length, 1);
  assert.equal(services.match(/id="openRobotsFromServices"/g).length, 1);
  assert.match(services, /class="next-step" id="openSkillsFromServices">Explore generic skill previews →/);
  assert.match(services, /class="next-step" id="openRobotsFromServices">Manage demo robots →/);
  assert.match(page, /\.next-step\{[^}]*min-height:44px;min-width:44px/);
  const source = app.match(/function updateServicesContext\(\)\{[^\n]*\}/);
  assert.ok(source, 'Expected Services context function');
  const noticeElement = { textContent: '' };
  const context = { mine: [], selectedRobotId: null,
    byId: id => id === 'serviceRobotContext' ? noticeElement : null };
  new Script('(' + source[0] + ')').runInNewContext(context)();
  assert.match(noticeElement.textContent, /Press Manage demo robots/);
  assert.match(noticeElement.textContent, /Explore generic skill previews/);
  assert.match(noticeElement.textContent, /eligibility and compatibility are unverified/);
  assert.match(noticeElement.textContent, /no booking is available/);
});

test('empty My Robots keeps a 44px route back to Discover above the registration form', () => {
  const robots = page.match(/<section id="robots"[\s\S]*?<\/section>/)?.[0];
  assert.ok(robots, 'Expected My Robots section');
  const discover = robots.indexOf('id="openDiscoverFromRobots"');
  const skills = robots.indexOf('id="openSkillsFromRobots"');
  const form = robots.indexOf('<form id="registerRobot"');
  const list = robots.indexOf('id="myrobots"');
  assert.ok(discover > 0 && discover < skills && skills < form && form < list,
    'Explore robot concepts stays above skill previews, the form, and the saved-profile list');
  assert.match(robots, /class="next-step" id="openDiscoverFromRobots">Explore robot concepts →/);
  assert.match(robots, /does not verify ownership or connect hardware/);
  assert.equal(robots.match(/id="openDiscoverFromRobots"/g).length, 1);
  assert.match(page, /byId\('openDiscoverFromRobots'\)\.onclick=\(\)=>show\('store'\)/);
  assert.match(page, /\.next-step\{[^}]*min-height:44px;[^}]*min-width:44px/);
  assert.match(page, /\.next-step\[hidden\]\{display:none\}/);
  assert.match(app, /const discoverRoute=byId\('openDiscoverFromRobots'\);if\(discoverRoute\)discoverRoute\.hidden=mine\.length>0;/);

  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  assert.match(mobile, /#robots > p:has\(\.next-step\) \{ display: grid; gap: 8px; margin: 8px 0; \}/);
  assert.match(mobile, /#robots > p:has\(\.next-step\) \.next-step \{ width: 100%; \}/);

  const source = app.match(/function renderMyRobots\(\)\{[^\n]*\}/);
  assert.ok(source, 'Expected My Robots renderer');
  const node = () => ({
    children: [], attributes: {}, className: '', hidden: false, disabled: false, textContent: '',
    replaceChildren(...items) { this.children = items; },
    append(...items) { this.children.push(...items); },
    setAttribute(key, value) { this.attributes[key] = value; }
  });
  const elements = Object.fromEntries(
    ['myrobots', 'saveDemoProfile', 'profileCount', 'clearProfiles', 'profileSearch',
      'clearProfileSearch', 'profileSearchSummary', 'openDiscoverFromRobots'].map(id => [id, node()])
  );
  elements.profileSearch.value = '';
  const visits = [];
  const context = {
    mine: [],
    selectedRobotId: null,
    byId: id => elements[id],
    document: { createElement: node },
    show: tab => visits.push(tab)
  };
  const render = new Script('(' + source[0] + ')').runInNewContext(context);
  render();
  assert.equal(elements.openDiscoverFromRobots.hidden, false, 'No saved profiles keeps Discover visible');
  assert.equal(elements.myrobots.children[2].textContent, 'Explore robot concepts →');
  elements.myrobots.children[2].onclick();
  assert.deepEqual(visits, ['store'], 'The list recovery still opens Discover');

  context.mine = [{ id: 'demo-1', name: 'Study Helper', brand: 'Example', model: 'A' }];
  render();
  assert.equal(elements.openDiscoverFromRobots.hidden, true, 'Saved profiles keep the existing skills-first route');
  assert.equal(elements.myrobots.children[0].children[0].textContent, 'Study Helper');
  context.mine = [];
  render();
  assert.equal(elements.openDiscoverFromRobots.hidden, false, 'Clearing the last profile shows Discover again');
});

test('mobile Services keeps both recovery actions readable before the preview list', () => {
  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  assert.ok(mobile.includes('body:has(#services:not([hidden])) header { padding: 8px 16px; }'));
  assert.ok(mobile.includes('main:has(#services:not([hidden])) { padding-top: 8px; }'));
  assert.ok(mobile.includes('main:has(#services:not([hidden])) > h1 { font-size: 28px; line-height: 1.15; margin: 0 0 8px; }'));
  assert.ok(mobile.includes('#services > p:has(.next-step) { display: grid; gap: 8px; margin: 6px 0; }'));
  assert.ok(mobile.includes('#services .next-step { width: 100%; }'));
  assert.ok(mobile.includes('#services > .grid { margin-top: 8px; }'));
  const services = page.match(/<section id="services"[\s\S]*?<\/section>/)?.[0];
  assert.ok(services, 'Expected Services section');
  assert.ok(services.indexOf('id="openSkillsFromServices"') < services.indexOf('id="servicecards"'));
  assert.ok(services.indexOf('id="openRobotsFromServices"') < services.indexOf('id="servicecards"'));
  assert.match(services, /No bookings, service requests or payments are available/);
  assert.match(services, /Generic service previews/);
});

test('mobile empty Checkout keeps both recovery actions above the fixed bottom nav', () => {
  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  assert.match(mobile, /At 390px both empty Checkout recovery actions sat under the fixed bottom nav/);
  assert.match(mobile, /body:has\(#cart:not\(\[hidden\]\)\) header \{ padding: 8px 16px; \}/);
  assert.match(mobile, /main:has\(#cart:not\(\[hidden\]\)\) \{ padding-top: 8px; \}/);
  assert.match(mobile, /main:has\(#cart:not\(\[hidden\]\)\) > h1 \{ font-size: 28px; line-height: 1\.15; margin: 0 0 8px; \}/);
  assert.match(mobile, /main:has\(#cart:not\(\[hidden\]\)\) > p \{ margin: 0 0 8px; \}/);
  assert.match(mobile, /#cart > h2 \{ margin: 8px 0 4px; \}/);
  assert.match(mobile, /#cart > p\.muted \{ margin: 0 0 6px; \}/);
  assert.match(page, /#items > button\{[^}]*box-sizing:border-box;[^}]*min-height:44px/);
  assert.match(page, /browse\.textContent=lastBrowseTab==='services'\?'Browse service previews →':'Browse demo robots →'/);
  assert.match(page, /browse\.setAttribute\('data-cart-browse',''\);browse\.onclick=\(\)=>show\(lastBrowseTab\)/);
  assert.match(page, /openRobots\.textContent='Open My Robots \(demo profiles\) →'/);
  assert.match(page, /openRobots\.setAttribute\('data-cart-robots',''\);openRobots\.setAttribute\('aria-label','Open My Robots \(demo profiles\) →\. No order is placed and no device is connected\.'\);openRobots\.onclick=\(\)=>show\('robots'\)/);
  assert.match(page, /This is an order preview, not a real checkout/);
  assert.doesNotMatch(page, /payment method|place order|buy now|card number/i);
});

test('mobile Skills keeps My Robots and Services actions above the fixed bottom nav', () => {
  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  assert.match(mobile, /At 390px Manage demo robots in Skills sat under the fixed bottom nav/);
  assert.match(mobile, /body:has\(#skills:not\(\[hidden\]\)\) header \{ padding: 8px 16px; \}/);
  assert.match(mobile, /main:has\(#skills:not\(\[hidden\]\)\) \{ padding-top: 8px; \}/);
  assert.match(mobile, /main:has\(#skills:not\(\[hidden\]\)\) > h1 \{ font-size: 28px; line-height: 1\.15; margin: 0 0 8px; \}/);
  assert.match(mobile, /main:has\(#skills:not\(\[hidden\]\)\) > p \{ margin: 0 0 8px; \}/);
  assert.match(mobile, /#skills > h2 \{ margin: 8px 0 4px; \}/);
  assert.match(mobile, /#skills > p\.muted \{ margin: 0 0 6px; \}/);
  assert.match(mobile, /#skills > p:has\(\.next-step\) \{ display: grid; gap: 8px; margin: 6px 0; \}/);
  assert.match(mobile, /#skills \.next-step \{ width: 100%; \}/);
  assert.match(mobile, /#skills > \.card \{ padding: 12px 14px; \}/);
  assert.match(mobile, /#skills #openRobotsFromSkills \{ box-sizing: border-box; min-height: 44px; min-width: 44px; width: 100%; \}/);
  assert.match(page, /\.next-step\{[^}]*min-height:44px;[^}]*min-width:44px/);

  const skills = page.match(/<section id="skills"[\s\S]*?<\/section>/)?.[0];
  assert.ok(skills, 'Expected Skills section');
  const services = skills.indexOf('id="openServicesFromSkills"');
  const robots = skills.indexOf('id="openRobotsFromSkills"');
  const cards = skills.indexOf('id="skillcards"');
  assert.ok(services > 0 && services < robots && robots < cards,
    'Services and My Robots actions stay above the skill preview list');
  assert.match(skills, /class="buy next-step" id="openServicesFromSkills">Explore service previews →/);
  assert.match(skills, /id="openRobotsFromSkills">Manage demo robots →/);
  assert.equal(skills.match(/id="openServicesFromSkills"/g).length, 1);
  assert.equal(skills.match(/id="openRobotsFromSkills"/g).length, 1);
  assert.match(skills, /Compatibility is not verified, and installation is unavailable/);
  assert.match(page, /byId\('openServicesFromSkills'\)\.onclick=\(\)=>show\('services'\)/);
  assert.match(page, /byId\('openRobotsFromSkills'\)\.onclick=\(\)=>show\('robots'\)/);
  assert.match(app, /No demo robot profiles saved\. Press Explore service previews for generic service previews, or press Manage demo robots to add a demo robot profile\. Compatibility has not been checked; installation is unavailable\./);
  assert.doesNotMatch(skills, /install now|compatible with your robot|book a service|payment/i);
});

test('mobile filled Checkout keeps preview, remove, and Discover actions at least 44px above the bottom nav', () => {
  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  assert.match(mobile, /At 390px the filled Checkout Preview order and My Robots handoff buttons were 39px tall/);
  assert.match(mobile, /#cart #preview,\s*#cart #checkoutToRobots \{ box-sizing: border-box; min-height: 44px; min-width: 44px; \}/);
  assert.match(mobile, /main \{ padding: 20px 16px 116px; \}/);
  assert.match(mobile, /html \{ scroll-padding-bottom: calc\(116px \+ env\(safe-area-inset-bottom\)\); \}/);
  assert.match(page, /\.cart-row button\{[^}]*min-height:44px/);
  assert.match(page, /\.cart-actions button\{[^}]*min-height:44px/);

  const cart = page.match(/<section id="cart"[\s\S]*?<\/section>/)?.[0];
  assert.ok(cart, 'Expected the Checkout section');
  const notice = cart.indexOf('This is an order preview, not a real checkout. No payment, reservation or order submission occurs.');
  const items = cart.indexOf('id="items"');
  const browse = cart.indexOf('id="browseFromCheckout"');
  const preview = cart.indexOf('id="preview"');
  const handoff = cart.indexOf('id="checkoutToRobots"');
  const disclaimer = cart.indexOf('No purchase, service booking or ownership verification occurs.');
  assert.ok(notice > 0 && notice < items && items < browse && browse < preview && preview < handoff && handoff < disclaimer,
    'Filled checkout keeps the no-payment notice, remove row, Discover return, preview, and My Robots handoff in reach order');
  assert.match(cart, /id="browseFromCheckout"[^>]*>Continue browsing robot concepts →/);
  assert.match(cart, /id="preview">Preview order/);
  assert.match(cart, /id="checkoutToRobots"[^>]*>Continue to My Robots \(demo\) →/);
  assert.match(page, /remove\.textContent='Remove'/);
  assert.match(page, /remove\.setAttribute\('data-cart-remove',''\)/);
  assert.match(page, /byId\('browseFromCheckout'\)\.hidden=!cart\.length/);
  assert.match(page, /byId\('browseFromCheckout'\)\.textContent=lastBrowseTab==='services'\?'Continue browsing service previews →':'Continue browsing robot concepts →'/);
  assert.match(page, /byId\('browseFromCheckout'\)\.onclick=\(\)=>show\(lastBrowseTab\)/);
  assert.match(page, /byId\('checkoutToRobots'\)\.textContent=robotCount\?'Continue to My Robots \(demo\) →':'Return to service previews →'/);
  assert.match(app, /show\('robots'\);byId\('robotMessage'\)\.textContent='Checkout was a demo preview for '/);
  assert.match(app, /this does not confirm purchase, ownership, compatibility or hardware connection/);
  assert.doesNotMatch(cart, /payment method|place order|buy now|card number/i);
});

test('mobile one-item Checkout keeps Clear all fully above the fixed bottom nav', () => {
  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  assert.match(mobile, /At 390px one robot concept in Checkout put Clear all about 1\.9px under the fixed bottom nav/);
  assert.match(mobile, /#cart #total \{ margin: 8px 0; \}/);
  assert.match(mobile, /#cart \.cart-actions button \{ box-sizing: border-box; min-height: 44px; min-width: 44px; margin-top: 0; \}/);
  assert.match(mobile, /main \{ padding: 20px 16px 116px; \}/);
  assert.match(mobile, /body \{ padding-bottom: calc\(100px \+ env\(safe-area-inset-bottom\)\); \}/);
  assert.match(page, /\.cart-actions button\{[^}]*min-height:44px/);
  assert.match(page, /byId\('clearCart'\)\.textContent=cart\.length\?'Clear all '\+cart\.length\+' demo cart item'\+\(cart\.length===1\?'':'s'\):'Clear cart'/);
  assert.match(page, /byId\('clearCart'\)\.disabled=!cart\.length/);
  assert.match(page, /This is an order preview, not a real checkout/);
  assert.doesNotMatch(page, /payment method|place order|buy now|card number/i);
});

test('mobile filled My Robots keeps profile actions, handoffs, and the profile form at least 44px', () => {
  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  assert.match(mobile, /At 390px filled My Robots nickname, brand, model, and profile search were 37px tall, and Save, Discard, Clear search, Clear all, the Services handoff, Remove, and Review demo cart were 39px/);
  assert.match(mobile, /#robots #robotNickname,\s*#robots #robotBrand,\s*#robots #robotModel,\s*#robots #saveDemoProfile,\s*#robots #clearRobotDraft,\s*#robots #profileSearch,\s*#robots #clearProfileSearch,\s*#robots #clearProfiles,\s*#robots #myrobots button:not\(\.next-step\),\s*#robots #reviewRobotsCart \{\s*box-sizing: border-box;\s*min-height: 44px;\s*min-width: 44px;\s*\}/);
  assert.match(page, /\.next-step\{[^}]*box-sizing:border-box;[^}]*min-height:44px;[^}]*min-width:44px/);

  const robots = page.match(/<section id="robots"[\s\S]*?<\/section>/)?.[0];
  assert.ok(robots, 'Expected My Robots section');
  const skills = robots.indexOf('id="openSkillsFromRobots"');
  const nickname = robots.indexOf('id="robotNickname"');
  const brand = robots.indexOf('id="robotBrand"');
  const model = robots.indexOf('id="robotModel"');
  const save = robots.indexOf('id="saveDemoProfile"');
  const discard = robots.indexOf('id="clearRobotDraft"');
  const search = robots.indexOf('id="profileSearch"');
  const clearSearch = robots.indexOf('id="clearProfileSearch"');
  const clearAll = robots.indexOf('id="clearProfiles"');
  const list = robots.indexOf('id="myrobots"');
  const review = robots.indexOf('id="reviewRobotsCart"');
  assert.ok(skills > 0 && skills < nickname && nickname < brand && brand < model && model < save && save < discard && discard < search && search < clearSearch && clearSearch < clearAll && clearAll < list && list < review,
    'Filled My Robots keeps the skills handoff, profile form, search, and saved-profile actions in reach order');
  assert.match(robots, /class="buy next-step" id="openSkillsFromRobots">Explore skill previews →/);
  assert.match(robots, /id="saveDemoProfile" type="submit"[^>]*>Save demo profile/);
  assert.match(robots, /id="clearRobotDraft" type="button" hidden>Discard unsaved fields/);
  assert.match(robots, /id="profileSearch" type="search"/);
  assert.match(robots, /id="clearProfileSearch" hidden aria-label="Clear demo profile search"/);
  assert.match(robots, /id="clearProfiles" hidden>Clear all demo profiles/);
  assert.match(robots, /id="reviewRobotsCart" hidden>Review demo cart →/);
  assert.match(robots, /does not verify ownership or connect hardware/);
  assert.match(robots, /No serial numbers, warranty, ownership or compatibility verification/);

  assert.match(app, /preview\.className='next-step'/);
  assert.match(app, /preview\.textContent='Browse generic skills \(demo\) →'/);
  assert.match(app, /servicesPreview\.textContent='Explore generic service previews \(demo\) →'/);
  assert.match(app, /servicesPreview\.setAttribute\('aria-label','Explore generic service previews with '/);
  assert.match(app, /remove\.textContent='Remove profile'/);
  assert.match(app, /remove\.setAttribute\('data-remove',''\)/);
  assert.match(app, /clearSearch\.textContent='Clear search'/);
  assert.match(app, /compatibility not verified/);
  assert.match(app, /byId\('reviewRobotsCart'\)\.hidden=!cart\.length/);
  assert.match(app, /byId\('reviewRobotsCart'\)\.onclick=reviewDemoCart/);
  assert.doesNotMatch(robots, /payment method|place order|buy now|card number|book a service|install now/i);
});

test('mobile filled Skills and Services keep profile pickers and preview actions at least 44px', () => {
  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  assert.match(mobile, /At 390px filled Skills profile select and Install unavailable were 39px tall, and filled Services profile select and Add demo service were 39px/);
  assert.match(mobile, /#skills #skillRobotSelect,\s*#skills #skillcards button,\s*#services #serviceRobotSelect,\s*#services #servicecards button \{\s*box-sizing: border-box;\s*min-height: 44px;\s*min-width: 44px;\s*\}/);
  assert.match(page, /\.next-step\{[^}]*box-sizing:border-box;[^}]*min-height:44px;[^}]*min-width:44px/);
  assert.match(mobile, /#skills #openRobotsFromSkills \{ box-sizing: border-box; min-height: 44px; min-width: 44px; width: 100%; \}/);

  const skills = page.match(/<section id="skills"[\s\S]*?<\/section>/)?.[0];
  const services = page.match(/<section id="services"[\s\S]*?<\/section>/)?.[0];
  assert.ok(skills && services, 'Expected Skills and Services sections');
  const skillServices = skills.indexOf('id="openServicesFromSkills"');
  const skillSelect = skills.indexOf('id="skillRobotSelect"');
  const skillRobots = skills.indexOf('id="openRobotsFromSkills"');
  const skillCards = skills.indexOf('id="skillcards"');
  assert.ok(skillServices > 0 && skillServices < skillSelect && skillSelect < skillRobots && skillRobots < skillCards,
    'Filled Skills keeps the services handoff, profile select, and robots handoff above the preview list');
  assert.match(skills, /class="buy next-step" id="openServicesFromSkills">Explore service previews →/);
  assert.match(skills, /id="skillRobotSelect"/);
  assert.match(skills, /id="openRobotsFromSkills">Manage demo robots →/);
  assert.match(skills, /Compatibility is not verified, and installation is unavailable/);
  assert.match(app, /aria-label="Install unavailable for '\+x\.name\+' \(preview only; compatibility not verified\)">Install unavailable<\/button>/);
  assert.match(app, /installation is unavailable/);

  const serviceSelect = services.indexOf('id="serviceRobotSelect"');
  const serviceSkills = services.indexOf('id="openSkillsFromServices"');
  const serviceRobots = services.indexOf('id="openRobotsFromServices"');
  const serviceCards = services.indexOf('id="servicecards"');
  assert.ok(serviceSelect > 0 && serviceSelect < serviceSkills && serviceSkills < serviceRobots && serviceRobots < serviceCards,
    'Filled Services keeps the profile select and both handoffs above the preview list');
  assert.match(services, /id="serviceRobotSelect"/);
  assert.match(services, /class="next-step" id="openSkillsFromServices">Explore generic skill previews →/);
  assert.match(services, /class="next-step" id="openRobotsFromServices">Manage demo robots →/);
  assert.match(services, /No bookings, service requests or payments are available/);
  assert.match(app, /aria-label="Add '\+x\.name\+' service preview to demo cart \(no booking\)">Add demo service/);
  assert.match(app, /eligibility and compatibility are unverified/);
  assert.doesNotMatch(skills + services, /payment method|place order|buy now|card number|book a service|install now/i);
});

test('mobile bottom navigation keeps 44px targets, the current section, and a visible focus style', () => {
  const nav = page.match(/<nav class="tabs"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav, 'Expected the platform section navigation');
  const labels = ['Discover', 'Checkout', 'My Robots', 'Skills', 'Services'];
  const buttons = [...nav.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  assert.deepEqual(buttons.map(([, , body]) => body.match(/class="nav-label">([^<]+)/)?.[1]), labels);
  assert.ok(buttons.every(([, attrs]) => /type="button"/.test(attrs)), 'Each nav item is a button hit target');
  assert.equal([...nav.matchAll(/aria-current="page"/g)].length, 1, 'Exactly one section is current on first paint');
  assert.match(buttons[0][1], /data-tab="store"/);
  assert.match(buttons[0][1], /aria-current="page"/);
  assert.match(app, /document\.querySelectorAll\('\[data-tab\]'\)\.forEach\(b=>b\.onclick=\(\)=>show\(b\.dataset\.tab,true\)\)/);
  assert.match(app, /b\.classList\.toggle\('active',active\);if\(active\)b\.setAttribute\('aria-current','page'\);else b\.removeAttribute\('aria-current'\)/);

  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  const tabsRule = mobile.match(/\.tabs \{[^}]+\}/)?.[0];
  const buttonRule = mobile.match(/\.tabs button \{[^}]+\}/)?.[0];
  assert.ok(tabsRule && buttonRule, 'Expected the fixed mobile navigation rules');
  assert.match(tabsRule, /display: grid/);
  assert.match(tabsRule, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(buttonRule, /box-sizing: border-box/);
  assert.match(buttonRule, /width: 100%/);
  const columns = Number(tabsRule.match(/repeat\((\d+), minmax\(0, 1fr\)\)/)?.[1]);
  const gap = Number(tabsRule.match(/gap: (\d+)px/)?.[1]);
  const side = Number(tabsRule.match(/max\((\d+)px, env\(safe-area-inset-left\)\)/)?.[1]);
  const minHeight = Number(buttonRule.match(/min-height: (\d+)px/)?.[1]);
  const itemWidth = (390 - side * 2 - gap * (columns - 1)) / columns;
  assert.equal(columns, 5);
  assert.ok(minHeight >= 44, 'Nav item min-height is ' + minHeight + 'px');
  assert.ok(itemWidth >= 44, 'At 390px each nav item is ' + itemWidth.toFixed(1) + 'px wide');
  assert.match(page, /\.tabs button\.active::after,\.tabs button\[aria-current=page\]::after\{content:"";position:absolute;top:4px;left:8px;right:8px;height:4px;border-radius:2px;background:#111;pointer-events:none\}/);
  assert.match(mobile, /\.tabs button:focus-visible \{\s*outline: 3px solid #111;\s*outline-offset: 1px;\s*\}/);
  assert.doesNotMatch(buttonRule, /outline:\s*none|outline:\s*0/);
});

test('Discover concept cards name each demo concept without purchase, integration, or compatibility claims', () => {
  const cardSource = app.match(/function card\(x,action,variant=''\)\{[^\n]*\}/)?.[0];
  const renderSource = app.match(/function render\(\)\{[\s\S]*?\n(?=function show\()/)?.[0];
  assert.ok(cardSource && renderSource, 'Expected the Discover concept card renderer');

  const catalog = [
    { id: 'r1', name: 'Home Robot Concept', price: 34900, category: 'home' },
    { id: 'r2', name: 'Companion Robot Concept', price: 24900, category: 'companion' },
    { id: 'r3', name: 'Educational Robotics Kit Concept', price: 6900, category: 'education' }
  ];
  const elements = {
    robotSearch: { value: '' },
    clearRobotSearch: { hidden: true },
    resetDiscoverFilters: { hidden: true },
    filterSummary: { textContent: '' },
    products: { innerHTML: '', role: '', setAttribute(name, value) { if (name === 'role') this.role = value; } },
    skillcards: { innerHTML: '' },
    servicecards: { innerHTML: '' }
  };
  const context = {
    robots: catalog, skills: [], services: [], selectedCategory: 'all', cart: [],
    byId: id => elements[id],
    money: n => '฿' + n.toLocaleString('en-US'),
    renderMyRobots: () => {}, updateSkillsRobotSummary: () => {},
    updateServicesContext: () => {}, renderCart: () => {},
    document: { querySelectorAll: () => [] }
  };
  context.card = new Script('(' + cardSource + ')').runInNewContext(context);
  const render = new Script('(' + renderSource.trim() + ')').runInNewContext(context);
  const forbidden = /buy now|purchase|place order|payment|add to cart\b|works with|compatible with|connect your|verified compatible|real robot|in stock/i;

  const assertCards = (mode) => {
    const cards = elements.products.innerHTML.match(/<article role="listitem" class="card concept-card">[\s\S]*?<\/article>/g);
    assert.equal(cards?.length, 3, mode);
    cards.forEach((card, index) => {
      const robot = catalog[index];
      const label = robot.category.charAt(0).toUpperCase() + robot.category.slice(1);
      assert.match(card, new RegExp('^<article role="listitem" class="card concept-card"><h3>' + robot.name + '</h3>'), mode + ' heading is the accessible name');
      assert.match(card, new RegExp('class="concept-price">฿' + robot.price.toLocaleString('en-US') + ' · Illustrative price</p>'), mode);
      assert.match(card, new RegExp('class="concept-label">' + label + ' · Concept only</p>'), mode);
      assert.match(card, new RegExp('aria-label="Create local demo profile for ' + robot.name + ' \\(ownership and compatibility not verified\\)"'), mode);
      assert.doesNotMatch(card, /<img\b/i, mode + ' has no image that would need alt text');
      assert.doesNotMatch(card, forbidden, mode + ' implies a real offer');
    });
  };

  render();
  assertCards('available concept');
  assert.match(elements.products.innerHTML, /aria-label="Add Home Robot Concept to demo cart \(preview only\)">Add to demo cart/);
  assert.match(elements.products.innerHTML, /aria-label="Add Educational Robotics Kit Concept to demo cart \(preview only\)">Add to demo cart/);
  assert.doesNotMatch(elements.products.innerHTML, /disabled/);

  context.cart = [catalog[0]];
  render();
  assertCards('concept already in the demo cart');
  assert.match(elements.products.innerHTML, /disabled aria-disabled="true" aria-label="Home Robot Concept already in demo cart \(preview only\)">In demo cart/);
  assert.match(elements.products.innerHTML, /aria-label="Add Companion Robot Concept to demo cart \(preview only\)">Add to demo cart/);

  assert.match(page, /\.concept-actions\{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto\}/);
  assert.match(page, /\.concept-actions button\{flex:1 1 150px;min-height:44px\}/);
  assert.doesNotMatch(page, /\.concept-(?:card|price|label|actions)[^{]*\{[^}]*white-space:\s*nowrap/);
  assert.doesNotMatch(page, /\.concept-(?:card|price|label)[^{]*\{[^}]*overflow(?:-x)?:\s*hidden/);
  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  assert.match(mobile, /\.grid \{ grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 220px\), 1fr\)\); \}/);
});

test('narrow empty states keep named demo recovery actions at least 44px and scrollable clear of the bottom nav', () => {
  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  assert.match(mobile, /main \{ padding: 20px 16px 116px; \}/);
  assert.match(mobile, /html \{ scroll-padding-bottom: calc\(116px \+ env\(safe-area-inset-bottom\)\); \}/);
  assert.match(mobile, /body \{ padding-bottom: calc\(100px \+ env\(safe-area-inset-bottom\)\); \}/);
  assert.match(page, /\.next-step\{[^}]*box-sizing:border-box;[^}]*min-height:44px;[^}]*min-width:44px/);
  assert.match(page, /#items > button\{[^}]*box-sizing:border-box;[^}]*min-height:44px;[^}]*max-width:100%/);
  assert.match(mobile, /#skills #openRobotsFromSkills \{ box-sizing: border-box; min-height: 44px; min-width: 44px; width: 100%; \}/);
  assert.doesNotMatch(page, /#items > button\{[^}]*white-space:\s*nowrap/);
  assert.doesNotMatch(page, /\.next-step\{[^}]*white-space:\s*nowrap/);
  assert.doesNotMatch(page, /#items > button\{[^}]*overflow(?:-x)?:\s*hidden/);

  const cart = page.match(/<section id="cart"[\s\S]*?<\/section>/)?.[0];
  const robots = page.match(/<section id="robots"[\s\S]*?<\/section>/)?.[0];
  const skills = page.match(/<section id="skills"[\s\S]*?<\/section>/)?.[0];
  const services = page.match(/<section id="services"[\s\S]*?<\/section>/)?.[0];
  assert.ok(cart && robots && skills && services, 'Expected Checkout, My Robots, Skills, and Services');
  assert.match(cart, /This is an order preview, not a real checkout\. No payment, reservation or order submission occurs\./);
  assert.match(app, /empty\.textContent='Your cart is empty\. No order was placed\. Press Open My Robots \(demo profiles\)\. This does not connect a device\.'/);
  assert.match(app, /browse\.textContent=lastBrowseTab==='services'\?'Browse service previews →':'Browse demo robots →'/);
  assert.match(app, /openRobots\.textContent='Open My Robots \(demo profiles\) →'/);
  assert.match(app, /openRobots\.setAttribute\('aria-label','Open My Robots \(demo profiles\) →\. No order is placed and no device is connected\.'\)/);
  assert.match(robots, /does not verify ownership or connect hardware/);
  assert.match(robots, /id="openDiscoverFromRobots">Explore robot concepts →/);
  assert.match(robots, /id="openSkillsFromRobots">Explore skill previews →/);
  assert.ok(robots.indexOf('id="openDiscoverFromRobots"') < robots.indexOf('id="openSkillsFromRobots"'));
  assert.ok(robots.indexOf('id="openSkillsFromRobots"') < robots.indexOf('<form id="registerRobot"'));
  assert.match(app, /empty\.textContent='No demo robots added yet\.'/);
  assert.match(app, /None of these actions verifies ownership, compatibility, or connects a device\./);
  assert.match(app, /browse\.textContent='Explore robot concepts →';browse\.onclick=\(\)=>show\('store'\)/);
  assert.match(skills, /Compatibility is not verified, and installation is unavailable/);
  assert.match(skills, /id="openServicesFromSkills">Explore service previews →/);
  assert.match(skills, /id="openRobotsFromSkills">Manage demo robots →/);
  assert.match(app, /No demo robot profiles saved\. Press Explore service previews for generic service previews, or press Manage demo robots to add a demo robot profile\. Compatibility has not been checked; installation is unavailable\./);
  assert.match(services, /No bookings, service requests or payments are available/);
  assert.match(services, /id="openSkillsFromServices">Explore generic skill previews →/);
  assert.match(services, /id="openRobotsFromServices">Manage demo robots →/);
  assert.match(app, /These are generic service previews, not matched to any robot\. Press Manage demo robots to add a local demo profile, or Explore generic skill previews to browse skills\. Service eligibility and compatibility are unverified; no booking is available\./);

  const emptyCopy = [
    cart, robots, skills, services,
    "Your cart is empty. No order was placed. Press Open My Robots (demo profiles). This does not connect a device.",
    'Browse demo robots →',
    'Open My Robots (demo profiles) →. No order is placed and no device is connected.',
    'No demo robots added yet.',
    'None of these actions verifies ownership, compatibility, or connects a device.',
    'No demo robot profiles saved. Press Explore service previews for generic service previews, or press Manage demo robots to add a demo robot profile. Compatibility has not been checked; installation is unavailable.',
    'These are generic service previews, not matched to any robot. Press Manage demo robots to add a local demo profile, or Explore generic skill previews to browse skills. Service eligibility and compatibility are unverified; no booking is available.'
  ].join('\n');
  assert.doesNotMatch(emptyCopy, /buy now|place order|payment method|card number|connect your robot|verified compatible|compatibility is verified|book a service|install now/i);
});

test('narrow filled Checkout, Skills, and Services keep nickname and review actions at least 44px', () => {
  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  assert.match(mobile, /At 320x640 filled Checkout the preview nickname was 37px tall and Clear preview name was 39px/);
  assert.match(mobile, /#cart #name,\s*#cart #clearPreviewName \{ box-sizing: border-box; min-height: 44px; min-width: 44px; \}/);
  assert.match(mobile, /At 320x640 filled Skills and Services, Review demo cart was 39px tall/);
  assert.match(mobile, /#skills #reviewSkillsCart,\s*#services #reviewServicesCart \{ box-sizing: border-box; min-height: 44px; min-width: 44px; \}/);
  assert.match(mobile, /#cart #preview,\s*#cart #checkoutToRobots \{ box-sizing: border-box; min-height: 44px; min-width: 44px; \}/);
  assert.match(mobile, /#robots #reviewRobotsCart \{\s*box-sizing: border-box;\s*min-height: 44px;\s*min-width: 44px;\s*\}/);

  const cart = page.match(/<section id="cart"[\s\S]*?<\/section>/)?.[0];
  const skills = page.match(/<section id="skills"[\s\S]*?<\/section>/)?.[0];
  const services = page.match(/<section id="services"[\s\S]*?<\/section>/)?.[0];
  assert.ok(cart && skills && services, 'Expected Checkout, Skills, and Services');
  assert.match(cart, /id="name"[^>]*maxlength="80"/);
  assert.match(cart, /id="clearPreviewName" hidden aria-label="Clear checkout preview nickname"/);
  assert.match(cart, /This is an order preview, not a real checkout\. No payment, reservation or order submission occurs\./);
  assert.match(skills, /id="reviewSkillsCart" hidden>Review demo cart →/);
  assert.match(services, /id="reviewServicesCart" hidden>Review demo cart →/);
  assert.match(app, /byId\('reviewSkillsCart'\)\.hidden=!cart\.length/);
  assert.match(app, /byId\('reviewServicesCart'\)\.onclick=reviewDemoCart/);
  assert.match(app, /function reviewDemoCart\(\)\{[^}]*show\('cart'\)/);
  assert.match(app, /No payment or order submission occurred/);
  assert.match(app, /this does not confirm purchase, ownership, compatibility or hardware connection/);
  assert.doesNotMatch(cart + skills + services, /buy now|place order|payment method|card number|connect your robot|verified compatible|compatibility is verified|book a service|install now/i);
});

test('narrow phone handoffs align the destination heading to the top of the viewport', () => {
  const show = app.match(/function show\(tab,focusHeading=false\)\{[^\n]*\}/)?.[0] ?? '';
  assert.match(show, /heading\.focus\(\{preventScroll:true\}\)/);
  assert.match(show, /if\(rect\.top<0\|\|rect\.bottom>nav\|\|box&&\(box\.top<0\|\|box\.bottom>nav\)\)window\.scrollTo\(0,Math\.max\(0,Math\.floor\(rect\.top\+window\.scrollY\)\)\)/);
  assert.match(show, /openSkillsFromRobots/);
  assert.doesNotMatch(show, /scrollIntoView|behavior:\s*['"]smooth['"]/);
  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  assert.match(mobile, /At 320x640, with the section heading at the top, Create demo profile sat about 14px under the fixed bottom nav/);
  assert.match(mobile, /@media \(max-width: 359px\) \{\s*#store > p\.muted \{ margin-bottom: 2px; \}\s*#store \.store-filters \{ margin-bottom: 2px; \}\s*#store > \.grid \{ margin-top: 0; \}\s*\.concept-card \{ gap: 4px; padding: 4px 12px 8px; \}\s*\}/);
  assert.match(page, /\.concept-actions button\{[^}]*min-height:44px/);
  assert.match(page, /\.next-step\{[^}]*min-height:44px;[^}]*min-width:44px/);
  assert.match(page, /#items > button\{[^}]*min-height:44px/);
  assert.match(app, /aria-label="Add '\+x\.name\+' to demo cart \(preview only\)"/);
  assert.match(app, /aria-label="Create local demo profile for '\+x\.name\+' \(ownership and compatibility not verified\)"/);
  assert.match(page, /openRobots\.setAttribute\('aria-label','Open My Robots \(demo profiles\) →\. No order is placed and no device is connected\.'\)/);
  assert.match(page, /id="openSkillsFromRobots">Explore skill previews →/);
  assert.match(page, /id="openServicesFromSkills">Explore service previews →/);
  assert.match(page, /id="openSkillsFromServices">Explore generic skill previews →/);
  assert.match(page, /id="checkoutToRobots" hidden>Continue to My Robots \(demo\) →/);
  assert.doesNotMatch(page, /buy now|place order|payment method|card number|connect your robot|verified compatible/i);
});

test('section changes move focus to the heading once and do not smooth-scroll or announce it twice', () => {
  assert.match(app, /heading\.tabIndex=-1;heading\.focus\(\{preventScroll:true\}\)/);
  assert.match(app, /window\.scrollTo\(0,Math\.max\(0,Math\.floor\(rect\.top\+window\.scrollY\)\)\)/);
  assert.doesNotMatch(app, /scrollIntoView|behavior:\s*['"]smooth['"]|scroll-behavior:\s*smooth/);
  assert.doesNotMatch(page, /scroll-behavior:\s*smooth/);
  const show = app.match(/function show\(tab,focusHeading=false\)\{[^\n]*\}/)?.[0] ?? '';
  assert.equal([...show.matchAll(/heading\.focus\(\{preventScroll:true\}\)/g)].length, 1);
  for (const id of ['store', 'robots', 'skills', 'services', 'cart']) {
    const section = page.match(new RegExp('<section id="' + id + '"[^>]*>[\\s\\S]*?</section>'))?.[0];
    assert.ok(section, 'Missing section ' + id);
    const heading = section.match(/<h2[^>]*>[^<]+<\/h2>/)?.[0];
    assert.ok(heading, id + ' needs a heading for keyboard and screen reader entry');
    assert.doesNotMatch(heading, /aria-live|role="status"|role="alert"/);
    assert.doesNotMatch(section.slice(0, section.indexOf('<h2')), /aria-live|role="status"|role="alert"/);
  }
});

test('narrow phones put primary demo actions ahead of long explanations without dropping demo wording', () => {
  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  const narrowBlocks = [...mobile.matchAll(/@media \(max-width: 359px\) \{([\s\S]*?)\n  \}/g)].map(match => match[1]);
  assert.equal(narrowBlocks.length, 2, 'Expected the Discover tightening block and the primary-action block');
  assert.match(narrowBlocks[1], /#services #serviceRobotContext \{ margin: 0; padding: 4px 8px; line-height: 1\.25; \}/);
  assert.match(narrowBlocks[1], /#cart > \.card\.narrow-preview-first > p:has\(#preview\) \{ margin: 8px 0 0; \}/);
  assert.doesNotMatch(mobile.slice(0, mobile.indexOf('@media (max-width: 359px)')), /narrow-preview-first|line-height: 1\.25/);
  assert.match(mobile, /#services > \.grid \{ margin-top: 8px; \}/);
  assert.match(mobile, /#services #serviceRobotContext \{ margin: 4px 0; padding: 8px 10px; \}/);

  const cart = page.match(/<section id="cart"[\s\S]*?<\/section>/)?.[0];
  assert.ok(cart.indexOf('id="previewNameHint"') < cart.indexOf('id="preview"'), 'Source order keeps the nickname hint before Preview order');
  assert.match(cart, /This is an order preview, not a real checkout\. No payment, reservation or order submission occurs\./);
  assert.match(cart, /Leave blank to preview as Guest, or use a nickname rather than your real name\. This is an on-page demo preview; no order or personal details are submitted\./);
  assert.match(app, /aria-label="Add '\+x\.name\+' service preview to demo cart \(no booking\)">Add demo service/);
  assert.match(app, /<p class="muted">'\+x\.detail\+'<\/p><button/);
  assert.match(page, /No bookings, service requests or payments are available/);
  assert.match(app, /Service eligibility and compatibility are unverified; no booking is available/);
  assert.match(app, /no technician is assigned or appointment booked/);
  assert.doesNotMatch(page, /buy now|place order|payment method|card number|connect your robot|verified compatible|book a service/i);

  const source = app.match(/function placeNarrowPrimaryActions\(\)\{[^\n]*\}/)?.[0];
  assert.ok(source, 'Expected the narrow primary-action placement');
  assert.match(app, /if\(typeof placeNarrowPrimaryActions==='function'\)placeNarrowPrimaryActions\(\)/);
  assert.match(source, /matchMedia\('\(max-width: 359px\)'\)/);

  const make = (tag, attrs = {}) => {
    const node = { tag, id: attrs.id || '', children: [], parentElement: null, className: attrs.className || '' };
    node.classList = {
      toggle(name, force) {
        const names = new Set(node.className.split(/\s+/).filter(Boolean));
        const next = force === undefined ? !names.has(name) : Boolean(force);
        if (next) names.add(name); else names.delete(name);
        node.className = [...names].join(' ');
        return next;
      },
      contains(name) { return node.className.split(/\s+/).includes(name); }
    };
    node.after = other => {
      const from = other.parentElement;
      if (from) from.children.splice(from.children.indexOf(other), 1);
      const siblings = node.parentElement.children;
      siblings.splice(siblings.indexOf(node) + 1, 0, other);
      other.parentElement = node.parentElement;
    };
    node.querySelectorAll = selector => {
      const all = [];
      const walk = current => { all.push(current); current.children.forEach(walk); };
      walk(node);
      return all.filter(current => current !== node && matches(current, selector));
    };
    node.querySelector = selector => node.querySelectorAll(selector)[0] || null;
    return node;
  };
  const matches = (node, selector) => {
    if (selector === 'button') return node.tag === 'button';
    if (selector === 'p.muted') return node.tag === 'p' && node.classList.contains('muted');
    if (selector === 'p:not(.muted)') return node.tag === 'p' && !node.classList.contains('muted');
    if (selector === '.cart-actions') return node.classList.contains('cart-actions');
    return false;
  };
  const append = (parent, child) => { parent.children.push(child); child.parentElement = parent; return child; };
  const checkout = make('section', { id: 'cart' });
  const card = append(checkout, make('div', { className: 'card' }));
  const actions = append(card, make('div', { className: 'cart-actions' }));
  const label = append(card, make('label'));
  const hint = append(card, make('p', { id: 'previewNameHint' }));
  hint.textContent = 'Leave blank to preview as Guest, or use a nickname rather than your real name. This is an on-page demo preview; no order or personal details are submitted.';
  const previewP = append(card, make('p'));
  const preview = append(previewP, make('button', { id: 'preview' }));
  const services = make('div', { id: 'servicecards' });
  const serviceCard = append(services, make('article', { className: 'card preview-list-card' }));
  append(serviceCard, make('h3'));
  append(serviceCard, make('p'));
  const detail = append(serviceCard, make('p', { className: 'muted' }));
  detail.textContent = 'Illustrative setup guidance concept; no technician is assigned or appointment booked.';
  const button = append(serviceCard, make('button'));
  let narrow = false;
  const context = {
    cart: [],
    byId: id => id === 'preview' ? preview : id === 'previewNameHint' ? hint : null,
    matchMedia: () => ({ matches: narrow }),
    document: {
      querySelector(selector) {
        return selector === '#cart > .card' ? card : null;
      },
      querySelectorAll(selector) {
        return selector === '#servicecards .preview-list-card' ? [serviceCard] : [];
      }
    }
  };
  const place = new Script('(' + source + ')').runInNewContext(context);
  const ids = () => card.children.map(child => child.id || child.className || child.tag);
  const serviceOrder = () => serviceCard.children.map(child => child.tag + (child.className ? '.' + child.className : ''));
  place();
  assert.deepEqual(ids(), ['cart-actions', 'label', 'previewNameHint', 'p'], 'A wide empty cart keeps Preview order after the hint');
  assert.deepEqual(serviceOrder(), ['h3', 'p', 'p.muted', 'button'], 'A wide Services card keeps the detail before the action');
  assert.equal(card.classList.contains('narrow-preview-first'), false);
  narrow = true;
  place();
  assert.deepEqual(ids(), ['cart-actions', 'label', 'previewNameHint', 'p'], 'An empty narrow cart does not move Preview order');
  assert.deepEqual(serviceOrder(), ['h3', 'p', 'button', 'p.muted'], 'A narrow Services card puts Add demo service before the detail');
  assert.equal(card.classList.contains('narrow-preview-first'), false);
  context.cart = [{ id: 'r1' }];
  place();
  assert.deepEqual(ids(), ['cart-actions', 'p', 'label', 'previewNameHint'], 'A filled narrow cart puts Preview order before the nickname explanation');
  assert.equal(preview.parentElement, previewP);
  assert.equal(card.classList.contains('narrow-preview-first'), true);
  assert.equal(hint.textContent, 'Leave blank to preview as Guest, or use a nickname rather than your real name. This is an on-page demo preview; no order or personal details are submitted.');
  assert.equal(detail.textContent, 'Illustrative setup guidance concept; no technician is assigned or appointment booked.');
  narrow = false;
  place();
  assert.deepEqual(ids(), ['cart-actions', 'label', 'previewNameHint', 'p'], 'Leaving the narrow width restores Preview order');
  assert.deepEqual(serviceOrder(), ['h3', 'p', 'p.muted', 'button'], 'Leaving the narrow width restores the service detail');
  assert.equal(card.classList.contains('narrow-preview-first'), false);
  assert.equal(actions.className, 'cart-actions');
  assert.equal(label.tag, 'label');
  assert.equal(button.tag, 'button');
});

test('narrow filled My Robots and Skills keep the next demo handoff ahead of the long copy', () => {
  const robots = page.match(/<section id="robots"[\s\S]*?<\/section>/)?.[0];
  const skills = page.match(/<section id="skills"[\s\S]*?<\/section>/)?.[0];
  assert.ok(robots && skills, 'Expected My Robots and Skills sections');

  const robotsHandoff = robots.indexOf('id="openSkillsFromRobots"');
  const robotsForm = robots.indexOf('<form id="registerRobot"');
  const robotsList = robots.indexOf('id="myrobots"');
  assert.ok(robotsHandoff > 0 && robotsHandoff < robotsForm && robotsForm < robotsList,
    'Explore skill previews stays above the registration form and saved-profile list');
  assert.match(robots, /<h2 id="robots-title">My Robots<\/h2><p class="muted">[^<]*does not verify ownership or connect hardware\.<\/p><p><button type="button" class="next-step" id="openDiscoverFromRobots">Explore robot concepts →<\/button> <button type="button" class="buy next-step" id="openSkillsFromRobots">Explore skill previews →<\/button><\/p>/);
  assert.match(robots, /Saved only in this browser\. No serial numbers, warranty, ownership or compatibility verification\./);

  const skillsHandoff = skills.indexOf('id="openServicesFromSkills"');
  const skillsSummary = skills.indexOf('id="skillsRobotSummary"');
  const skillsList = skills.indexOf('id="skillcards"');
  assert.ok(skillsHandoff > 0 && skillsHandoff < skillsSummary && skillsSummary < skillsList,
    'Explore service previews stays above the filled profile summary and skill preview list');
  assert.match(skills, /<h2 id="skills-title">Skills<\/h2><p class="muted">[^<]*Compatibility is not verified, and installation is unavailable\.<\/p><p><button type="button" class="buy next-step" id="openServicesFromSkills">Explore service previews →<\/button><\/p>/);
  assert.match(skills, /id="openRobotsFromSkills">Manage demo robots →/);

  assert.match(page, /\.next-step\{[^}]*box-sizing:border-box;[^}]*min-height:44px;[^}]*min-width:44px/);
  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  assert.match(mobile, /#robots > p:has\(\.next-step\) \.next-step \{ width: 100%; \}/);
  assert.match(mobile, /#skills \.next-step \{ width: 100%; \}/);
  assert.match(mobile, /#skills #openRobotsFromSkills \{ box-sizing: border-box; min-height: 44px; min-width: 44px; width: 100%; \}/);
  const narrowBlocks = [...mobile.matchAll(/@media \(max-width: 359px\) \{([\s\S]*?)\n  \}/g)].map(match => match[1]);
  assert.equal(narrowBlocks.length, 2);
  assert.doesNotMatch(narrowBlocks.join('\n'), /#(?:robots|skills)\b|openSkillsFromRobots|openServicesFromSkills/);

  const show = app.match(/function show\(tab,focusHeading=false\)\{[^\n]*\}/)?.[0] ?? '';
  assert.match(show, /robots:'openSkillsFromRobots',skills:'openServicesFromSkills'/);
  assert.match(app, /const discoverRoute=byId\('openDiscoverFromRobots'\);if\(discoverRoute\)discoverRoute\.hidden=mine\.length>0;/);
  assert.doesNotMatch(app, /byId\('openSkillsFromRobots'\)\.hidden|byId\('openServicesFromSkills'\)\.hidden/);
  assert.match(app, /preview\.textContent='Browse generic skills \(demo\) →'/);
  assert.match(app, /aria-label','Browse generic skill previews for '\+x\.name\+' — '\+x\.brand\+' · '\+x\.model\+'; compatibility not verified'/);
  assert.match(app, /Viewing generic skill previews for local demo profile: /);
  assert.match(app, /Compatibility has not been checked; installation is unavailable\./);
  assert.doesNotMatch(robots + '\n' + skills, /buy now|place order|payment method|card number|connect your robot|verified compatible|install now/i);

  const source = app.match(/function renderMyRobots\(\)\{[^\n]*\}/);
  const summarySource = app.match(/function updateSkillsRobotSummary\(\)\{[^\n]*\}/);
  assert.ok(source && summarySource, 'Expected filled My Robots and Skills renderers');
  const node = () => ({
    children: [], attributes: {}, className: '', hidden: false, disabled: false, textContent: '', value: '',
    replaceChildren(...items) { this.children = items; },
    append(...items) { this.children.push(...items); },
    setAttribute(key, value) { this.attributes[key] = value; },
    focus() {}
  });
  const elements = Object.fromEntries(
    ['myrobots', 'saveDemoProfile', 'profileCount', 'clearProfiles', 'profileSearch',
      'clearProfileSearch', 'profileSearchSummary', 'openDiscoverFromRobots', 'openSkillsFromRobots',
      'skillRobotSelect', 'skillsRobotSummary'].map(id => [id, node()])
  );
  elements.profileSearch.value = '';
  const profile = { id: 'demo-1', name: 'Home helper', brand: 'Example Robotics', model: 'Model A' };
  const visits = [];
  const context = {
    mine: [profile],
    selectedRobotId: profile.id,
    byId: id => elements[id],
    document: { createElement: node, activeElement: null },
    show: tab => visits.push(tab)
  };
  new Script('(' + source[0] + ')').runInNewContext(context)();
  assert.equal(elements.openDiscoverFromRobots.hidden, true, 'A saved profile hides only the empty Discover route');
  assert.equal(elements.openSkillsFromRobots.hidden, false, 'Filled My Robots must keep Explore skill previews');
  assert.equal(elements.myrobots.children.length, 1);
  const card = elements.myrobots.children[0];
  assert.equal(card.children[4].textContent, 'Browse generic skills (demo) →');
  assert.match(card.children[4].attributes['aria-label'], /Home helper — Example Robotics · Model A/);
  assert.match(card.children[4].attributes['aria-label'], /compatibility not verified/);
  card.children[4].onclick();
  assert.deepEqual(visits, ['skills']);

  new Script('(' + summarySource[0] + ')').runInNewContext(context)();
  assert.match(elements.skillsRobotSummary.textContent, /Viewing generic skill previews for local demo profile: Home helper — Example Robotics · Model A\./);
  assert.match(elements.skillsRobotSummary.textContent, /Compatibility has not been checked; installation is unavailable\./);
  assert.equal(elements.skillRobotSelect.disabled, false);
});

test('reduced motion keeps section jumps, the skip link, cards, buttons, and status text free of animation', () => {
  const style = page.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  assert.ok(style.includes('.skip-link{'), 'Expected the consumer stylesheet');
  assert.doesNotMatch(page, /scroll-behavior\s*:/);
  assert.doesNotMatch(page, /@keyframes\b/);
  assert.doesNotMatch(page, /(?:^|[;{\s])(?:animation|transition)(?:-[a-z-]+)?\s*:/);
  assert.doesNotMatch(app, /scrollIntoView|scroll-behavior\s*:\s*smooth|behavior\s*:\s*['"]smooth['"]|requestAnimationFrame|\.animate\s*\(/);

  const show = app.match(/function show\(tab,focusHeading=false\)\{[^\n]*\}/)?.[0] ?? '';
  assert.equal([...show.matchAll(/heading\.focus\(\{preventScroll:true\}\)/g)].length, 1);
  assert.match(show, /window\.scrollTo\(0,Math\.max\(0,Math\.floor\(rect\.top\+window\.scrollY\)\)\)/);
  assert.doesNotMatch(show, /\{behavior\s*:|scrollIntoView/);
  assert.match(app, /\.querySelectorAll\('\[data-tab\]'\)\.forEach\(b=>b\.onclick=\(\)=>show\(b\.dataset\.tab,true\)\)/);
  assert.match(app, /if\(!robotCount\)\{show\('services'\);/);
  assert.match(app, /show\('robots'\);byId\('robotMessage'\)/);
  assert.match(app, /byId\('openSkillsFromRobots'\)\.onclick=\(\)=>show\('skills'\)/);
  assert.match(app, /byId\('openServicesFromSkills'\)\.onclick=\(\)=>show\('services'\)/);
  assert.match(app, /cart\.push\(x\);show\('cart'\)/);

  assert.match(page, /\.skip-link\{[^}]*position:absolute;[^}]*top:-80px;[^}]*\}/);
  assert.match(page, /\.skip-link:focus-visible\{top:12px\}/);
  assert.doesNotMatch(page, /\.skip-link[^{]*\{[^}]*(?:transition|animation)\s*:/);
  assert.match(page, /id="result" role="status" aria-live="polite"/);
  assert.match(page, /id="robotMessage" role="status"/);
  assert.match(app, /badge\.className='status'/);
  assert.doesNotMatch(style, /\.card[^{]*\{[^}]*(?:transition|animation)\s*:/);
  assert.doesNotMatch(style, /\.status[^{]*\{[^}]*(?:transition|animation)\s*:/);
  assert.doesNotMatch(style, /button[^{]*\{[^}]*(?:transition|animation)\s*:/);
});

test('mobile consumer text and field boundaries meet WCAG 2.2 AA contrast', () => {
  const channel = value => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const rgb = hex => {
    const raw = hex.slice(1);
    const full = raw.length === 3 ? raw.replace(/./g, digit => digit + digit) : raw;
    return [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16));
  };
  const contrast = (foreground, background) => {
    const hi = Math.max(lum(rgb(foreground)), lum(rgb(background)));
    const lo = Math.min(lum(rgb(foreground)), lum(rgb(background)));
    return (hi + 0.05) / (lo + 0.05);
  };
  const assertContrast = (foreground, background, minimum, label) => {
    const ratio = contrast(foreground, background);
    assert.ok(ratio >= minimum, label + ': ' + foreground + ' on ' + background + ' is ' + ratio.toFixed(2) + ':1, needs ' + minimum + ':1');
  };

  assert.match(page, /body\{background:#fffdf5;color:#111\}/);
  assert.match(page, /\.muted\{color:#68786d\}/);
  assert.match(page, /\.hint\{font-size:13px;color:#627468\}/);
  assert.match(page, /\.category\{font-size:13px;color:#496653;font-weight:650\}/);
  assert.match(page, /\.status\{font-size:13px;color:#80601c;background:#fff3d8;/);
  assert.match(page, /\.tabs button\{background:#e4efe7\}/);
  assert.match(page, /\.tabs button\.active,\.buy\{background:#10b847;color:#111\}/);
  assert.match(page, /\.store-filters button\{background:#e4efe7\}/);
  assert.match(page, /\.store-filters button\[aria-pressed=true\]\{background:#ffdb23;color:#111\}/);
  assert.match(page, /\.cart-row button\{background:#f2e8e8;color:#6b2626;/);
  assert.match(page, /\.cart-actions button\{background:#e4efe7;color:#193321;/);
  assert.match(page, /\.concept-card\{[^}]*background:#fff\}/);
  assert.match(page, /\.concept-label\{[^}]*font-size:13px;font-weight:800;/);
  assert.match(page, /\.concept-price\{[^}]*background:#ffdb23;font-size:1\.2rem;font-weight:900\}/);
  assert.match(page, /\.academy-note\{background:#edf7ef;/);
  assert.match(page, /input,select\{[^}]*border:1px solid #8a8a8a;[^}]*background:#fff;color:#111\}/);
  assert.match(page, /input::placeholder,input:disabled::placeholder\{color:#616b66;opacity:1\}/);
  assert.match(page, /input:disabled,select:disabled,#skillcards button:disabled\{opacity:1;color:#111;background:#efefef;-webkit-text-fill-color:#111\}/);
  assert.match(page, /<strong style="color:#0fa741;font-size:25px">BOTKET<\/strong>/);
  assert.match(page, /button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible\{outline:3px solid #1b874e;outline-offset:2px\}/);
  assert.match(page, /\.tabs button:focus-visible\{outline:3px solid #111;outline-offset:2px\}/);
  assert.match(page, /\.next-step:focus-visible\{outline:3px solid #111;outline-offset:2px\}/);
  assert.doesNotMatch(page, /#6b7d70|border:1px solid #ccc|color:#10b847/);

  const mobile = page.slice(page.indexOf('@media (max-width: 640px)'), page.indexOf('/* Keyboard-first'));
  assert.doesNotMatch(mobile, /::placeholder|:disabled|\.hint\{|color:#627468|color:#616b66|color:#0fa741|#6b7d70|#8a8a8a/);
  assert.match(mobile, /\.tabs button:focus-visible \{\s*outline: 3px solid #111;\s*outline-offset: 1px;\s*\}/);

  const normal = [
    ['#68786d', '#fffdf5', 'muted demo copy on the page'],
    ['#68786d', '#ffffff', 'muted demo copy on a card'],
    ['#627468', '#fffdf5', 'hint text on the page'],
    ['#627468', '#ffffff', 'hint text on a card'],
    ['#496653', '#ffffff', 'category chip text'],
    ['#80601c', '#fff3d8', 'demo status badge'],
    ['#111111', '#fffdf5', 'body text, empty states, and nav labels on the page'],
    ['#111111', '#ffffff', 'body text and concept labels on white'],
    ['#111111', '#edf7ef', 'service demo note'],
    ['#111111', '#e4efe7', 'inactive nav labels and category chips'],
    ['#111111', '#10b847', 'active nav, buy, and disabled buy labels'],
    ['#111111', '#ffdb23', 'selected chip and illustrative price'],
    ['#111111', '#efefef', 'disabled fields and Install unavailable'],
    ['#6b2626', '#f2e8e8', 'cart remove label'],
    ['#193321', '#e4efe7', 'cart action label'],
    ['#616b66', '#ffffff', 'placeholder on an enabled field'],
    ['#616b66', '#efefef', 'placeholder on a disabled field']
  ];
  for (const [foreground, background, label] of normal) assertContrast(foreground, background, 4.5, label);

  assertContrast('#0fa741', '#ffffff', 3, 'footer wordmark (25px)');
  assertContrast('#8a8a8a', '#fffdf5', 3, 'field border against the page');
  assertContrast('#8a8a8a', '#ffffff', 3, 'field border against white');
  for (const background of ['#fffdf5', '#ffffff', '#ffdb23']) {
    assertContrast('#1b874e', background, 3, 'green focus ring on ' + background);
  }
  for (const background of ['#fffdf5', '#ffffff', '#e4efe7', '#10b847', '#ffdb23']) {
    assertContrast('#111111', background, 3, 'black focus ring on ' + background);
  }
});

test('mobile consumer header logo and non-text indicators meet WCAG 2.2 AA contrast', () => {
  const channel = value => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const rgb = hex => {
    const raw = hex.slice(1);
    const full = raw.length === 3 ? raw.replace(/./g, digit => digit + digit) : raw;
    return [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16));
  };
  const contrast = (foreground, background) => {
    const hi = Math.max(lum(rgb(foreground)), lum(rgb(background)));
    const lo = Math.min(lum(rgb(foreground)), lum(rgb(background)));
    return (hi + 0.05) / (lo + 0.05);
  };
  const assertContrast = (foreground, background, minimum, label) => {
    const ratio = contrast(foreground, background);
    assert.ok(ratio >= minimum, label + ': ' + foreground + ' on ' + background + ' is ' + ratio.toFixed(2) + ':1, needs ' + minimum + ':1');
    return ratio;
  };

  const logo = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../assets/botket-logo.svg'), 'utf8');
  const fills = [...logo.matchAll(/fill="#([0-9a-fA-F]{6})"/g)].map(match => '#' + match[1].toLowerCase());
  assert.deepEqual(fills, ['#10ac39', '#fa202a']);
  assert.match(page, /header\{background:white;/);
  assert.match(page, /<header><img src="assets\/botket-logo\.svg" alt="BOTKET"/);
  assert.doesNotMatch(page, /type="(?:checkbox|radio)"/);

  const previousGreen = contrast('#10ad39', '#ffffff');
  assert.ok(previousGreen < 3, 'the previous logo green #10ad39 on white is ' + previousGreen.toFixed(2) + ':1 and must stay below 3 so the regression stays visible');
  const logoGreen = assertContrast('#10ac39', '#ffffff', 3, 'header logo green on the white header');
  const logoRed = assertContrast('#fa202a', '#ffffff', 3, 'header logo red mark on the white header');
  assert.ok(logoGreen < contrast('#10ab39', '#ffffff'), 'logo green should be the smallest step above 3:1');
  assert.ok(logoRed > logoGreen);

  assert.match(page, /\.tabs button\{border:2px solid #111;/);
  assert.match(page, /\.tabs button\.active::after,\.tabs button\[aria-current=page\]::after\{[^}]*background:#111;/);
  assert.match(page, /\.status\{font-size:13px;color:#80601c;background:#fff3d8;[^}]*\}/);
  assert.doesNotMatch(page, /\.status\{[^}]*(?:border|outline)\s*:/);
  assert.match(page, /\.tabs button,button\{[^}]*border:0;/);
  assert.doesNotMatch(page, /\.store-filters button\{[^}]*border\s*:/);

  const indicators = [
    ['#111111', '#10b847', 'bottom nav current bar on the active tab'],
    ['#111111', '#e4efe7', 'bottom nav border on an inactive tab'],
    ['#111111', '#fffdf5', 'bottom nav border on the page'],
    ['#111111', '#ffffff', 'card and price borders on white'],
    ['#111111', '#ffdb23', 'illustrative price border on yellow'],
    ['#087d3c', '#edf7ef', 'service note accent on the note background'],
    ['#087d3c', '#fffdf5', 'service note accent on the page']
  ];
  for (const [foreground, background, label] of indicators) assertContrast(foreground, background, 3, label);
});
