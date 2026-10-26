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


test('clearing all demo profiles requires confirmation and resets skill selection', () => {
  const source = app.match(/byId\('clearProfiles'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  assert.ok(source, 'Expected the clear demo profiles handler');
  const elements = {
    profileSearch: { value: 'search term' },
    robotMessage: { textContent: '' },
    robotNickname: { focus() { focused = true; } }
  };
  let focused = false, confirmed = false, saves = 0, renders = 0, summaries = 0, prompts = 0;
  const context = {
    mine: [{ id: 'demo-1', name: 'Test robot', brand: 'Demo', model: 'A' }],
    selectedRobotId: 'demo-1',
    byId: id => elements[id],
    window: { confirm: () => { prompts++; return confirmed; } },
    saveRobots: () => { saves++; return true; },
    renderMyRobots: () => { renders++; },
    updateSkillsRobotSummary: () => { summaries++; }
  };
  const clear = new Script('(' + source[1] + ')').runInNewContext(context);

  clear();
  assert.equal(context.mine.length, 1, 'Cancel must preserve demo profiles');
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
      'profileSearchSummary', 'robotMessage', 'robotNickname'].map(id => [id, node()])
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
  assert.match(summary.textContent, /Viewing generic skill previews from Study helper/);
  assert.match(summary.textContent, /Compatibility has not been checked/);
  assert.match(summary.textContent, /installation is unavailable/i);

  context.selectedRobotId = 'deleted-profile';
  context.document.activeElement = null;
  update();
  assert.equal(context.selectedRobotId, null, 'Deleted profiles must not remain selected');
  assert.equal(picker.value, '');
  assert.match(summary.textContent, /2 local demo robot profile\(s\) saved/);
  assert.equal(focusCalls, 1, 'Do not steal focus from another control');

  context.mine = [];
  update();
  assert.equal(picker.disabled, true, 'No profiles means no selectable robot');
  assert.deepEqual(picker.children.map(option => option.value), ['']);
  assert.match(summary.textContent, /No demo robot profiles saved/);
  assert.match(summary.textContent, /does not verify compatibility/);
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
  const profileContext = {
    robots: [{ id: 'r2', name: 'Companion Robot Concept' }],
    b: { dataset: { robot: 'r2' } },
    byId: id => fields[id],
    show: tab => { destination = tab; }
  };
  const prefill = new Script('(' + profileSource[1] + ')').runInNewContext(profileContext);
  prefill();
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
  const sections = Object.fromEntries(ids.map(id => [id, {
    hidden: false,
    querySelector: selector => selector === 'h2' ? {
      focus() { focusCounts[id]++; }
    } : null
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
      querySelectorAll: selector => selector === '[data-tab]' ? tabs : []
    },
    byId: id => sections[id],
    render: () => { renders++; }
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
  show('services');
  checkVisible('services');
  assert.equal(context.lastBrowseTab, 'services', 'Services becomes the checkout browse destination');
  show('cart');
  checkVisible('cart');
  assert.equal(context.lastBrowseTab, 'services', 'Checkout must retain the last browsed catalog');
  show('store', true);
  checkVisible('store');
  assert.equal(context.lastBrowseTab, 'store');
  assert.equal(focusCounts.store, 1, 'Explicit tab navigation focuses the heading');
  assert.equal(renders, 4, 'Each navigation rerenders the active demo state');

  for (const [id, expected] of [
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
  const handoffSource = app.match(/byId\('checkoutToRobots'\)\.onclick=(\(\)=>show\([^\n]*\));/);
  assert.ok(addSource && previewSource && handoffSource, 'Expected service cart and preview handlers');

  const service = { id: 's2', name: 'Maintenance', price: 1300 };
  const robot = { id: 'r1', name: 'Robot Concept', price: 34900 };
  const elements = {
    name: { value: '' },
    result: { textContent: '' },
    checkoutToRobots: { hidden: true, textContent: '' }
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
  assert.equal(elements.checkoutToRobots.hidden, true, 'Changed nickname must block stale handoff');
  assert.match(elements.result.textContent, /Name changed\. Preview again to continue/);

  preview();
  assert.equal(elements.checkoutToRobots.hidden, false, 'Fresh preview restores handoff');
  assert.match(elements.result.textContent, /Preview for Alex:/);
  assert.match(elements.result.textContent, /No payment or order submission occurred/);
});

test('mixed robot and service preview routes to My Robots without claiming ownership', () => {
  const addSource = app.match(/document\.querySelectorAll\('\[data-add\]'\)\.forEach\(b=>b\.onclick=(\(\)=>\{[^\n]*\})\);/);
  const previewSource = app.match(/byId\('preview'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  const handoffSource = app.match(/byId\('checkoutToRobots'\)\.onclick=(\(\)=>show\([^\n]*\));/);
  assert.ok(addSource && previewSource && handoffSource, 'Expected mixed cart and preview handlers');

  const robot = { id: 'r1', name: 'Home Robot Concept', price: 34900 };
  const service = { id: 's2', name: 'Maintenance', price: 1300 };
  const elements = {
    name: { value: '' },
    result: { textContent: '' },
    checkoutToRobots: { hidden: true, textContent: '' }
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
    children: [],
    replaceChildren() { this.children = []; },
    append(...nodes) { this.children.push(...nodes); }
  };
  const elements = {
    myrobots: root,
    profileCount: { textContent: '' },
    clearProfiles: { hidden: true },
    profileSearch: {
      value: '  hOmE     helper  ', disabled: false,
      focus() { this.focused = true; }
    },
    profileSearchSummary: { textContent: '' }
  };
  const createElement = tag => ({
    tagName: tag, children: [], textContent: '',
    setAttribute() {},
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
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].children[0].textContent, 'Home   Helper');
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
  root.children[1].onclick();
  assert.equal(elements.profileSearch.value, '');
  assert.equal(elements.profileSearch.focused, true, 'Clearing search restores keyboard focus');
  assert.equal(root.children.length, 2);
  assert.match(elements.profileSearchSummary.textContent, /Showing all 2 demo profile/);
});
