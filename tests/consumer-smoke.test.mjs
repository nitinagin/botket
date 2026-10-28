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

test('mobile focus targets clear the fixed bottom navigation', () => {
  assert.match(page, /@media \(max-width: 640px\)/);
  assert.match(page, /html \{ scroll-padding-bottom: calc\(116px \+ env\(safe-area-inset-bottom\)\); \}/);
  assert.match(page, /section input:focus, section select:focus, section button:focus \{/);
  assert.match(page, /scroll-margin-bottom: calc\(116px \+ env\(safe-area-inset-bottom\)\)/);
});

test('checkout and skills clearly remain demos', () => {
  assert.match(page, /This is an order preview, not a real checkout/i);
  assert.match(page, /No payment, reservation or order submission occurs/i);
  assert.match(page, /Compatibility is not verified, and installation is unavailable/i);
  assert.match(page, /disabled aria-disabled="true"[^>]*>Install unavailable/);
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
  const handoff = app.match(/byId\('checkoutToRobots'\)\.onclick=(\(\)=>\{[^\n]*\});/);
  assert.ok(preview && handoff, 'Expected both demo checkout handlers');

  const robot = { id: 'r1', price: 34900 };
  const secondRobot = { id: 'r2', price: 24900 };
  const service = { id: 's1', price: 1500 };
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
  assert.equal(elements.total.textContent, 'Total: ฿36,400');
  assert.equal(elements.count.textContent, 2);
  assert.equal(elements.clearCart.textContent, 'Clear all 2 demo cart items');
  assert.equal(elements.reviewServicesCart.hidden, false);
  assert.equal(elements.reviewServicesCart.textContent, 'Review demo cart (2 items) →');
  assert.equal(elements.checkoutToRobots.hidden, true);

  elements.items.children[0].children[1].onclick();
  assert.deepEqual(context.cart.map(item => item.id), ['s1']);
  assert.equal(elements.total.textContent, 'Total: ฿1,500');
  assert.equal(elements.count.textContent, 1);
  assert.equal(elements.clearCart.textContent, 'Clear all 1 demo cart item');
  assert.equal(elements.reviewServicesCart.textContent, 'Review demo cart (1 item) →');
  assert.equal(focused, elements.items.children[0].children[1]);

  elements.items.children[0].children[1].onclick();
  assert.equal(context.cart.length, 0);
  assert.equal(elements.total.textContent, 'Total: ฿0');
  assert.equal(elements.reviewServicesCart.hidden, true);
  assert.equal(elements.preview.disabled, true);
  assert.equal(elements.clearCart.textContent, 'Clear cart');
  assert.equal(elements.name.value, '');
  assert.equal(focused, elements.items.children[1]);

  context.cart = [robot, service];
  elements.name.value = 'Guest nickname';
  render();
  const clear = new Script('(' + clearSource[1] + ')').runInNewContext(context);
  clear();
  assert.equal(context.cart.length, 2, 'Cancel preserves cart');
  assert.match(confirmationMessage, /Clear all 2 demo cart items \(1 robot concept, 1 service preview\)/);
  assert.match(confirmationMessage, /This cannot be undone\. No order has been placed/);
  assert.equal(elements.clearCart.textContent, 'Clear all 2 demo cart items');
  confirmed = true;
  clear();
  assert.equal(context.cart.length, 0);
  assert.equal(elements.count.textContent, 0);
  assert.equal(elements.preview.disabled, true);
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
  assert.match(elements.result.textContent, /Name changed\. Preview again to continue/);

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
  assert.match(elements.result.textContent, /Name cleared\. Preview again to continue/);
  assert.equal(focused, true, 'Focus returns to nickname field');
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
    profileSearchSummary: { textContent: '' },
    clearProfileSearch: { hidden: true }
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
  assert.match(elements.clearProfiles.textContent, /Clear all 2 demo profiles \(including profiles hidden by search\)/, 'Clear-all label must warn while filtered');
  assert.equal(elements.clearProfileSearch.hidden, false, 'Clear search is available with matching results');
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
  assert.equal(elements.clearProfiles.textContent, 'Clear all 2 demo profiles', 'Unfiltered clear-all label remains concise');
  assert.equal(elements.clearProfileSearch.hidden, true, 'Clear search hides when query is empty');
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
    products: { innerHTML: '' },
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
  assert.doesNotMatch(elements.products.innerHTML, /Companion Robot Concept/);
  assert.match(elements.filterSummary.textContent, /Showing 1 of 3/);
  assert.equal(elements.clearRobotSearch.hidden, false);

  context.selectedCategory = 'education';
  render();
  assert.match(elements.products.innerHTML, /No robot concepts match/);
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
  assert.equal(catalog.length, 3, 'Filtering never modifies the concept catalog');
});

test('Discover no-results recovery clears both filters and restores all demo concepts', () => {
  assert.match(page, /id="resetDiscoverFilters" hidden>Show all robot concepts/);
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
    filterSummary: { textContent: '' }, products: { innerHTML: '' },
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
  assert.match(elements.products.innerHTML, /No robot concepts match/);
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
  const source = app.match(/byId\('reviewServicesCart'\)\.onclick=(\(\)=>show\('cart'\));/);
  assert.ok(source, 'Expected Services-to-Checkout handler');
  let destination;
  new Script('(' + source[1] + ')').runInNewContext({ show: tab => { destination = tab; } })();
  assert.equal(destination, 'cart');
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
    products: { innerHTML: '' },
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

test('Discover offers a synchronized demo cart review shortcut without real checkout', () => {
  assert.match(page, /id="reviewDiscoverCart" hidden>Review demo cart/);
  const handler = app.match(/byId\('reviewDiscoverCart'\)\.onclick=(\(\)=>show\('cart'\));/);
  assert.ok(handler, 'Expected Discover-to-Checkout handler');
  let destination;
  new Script('(' + handler[1] + ')').runInNewContext({ show: tab => { destination = tab; } })();
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
    products: { innerHTML: '' }, skillcards: { innerHTML: '' }, servicecards: { innerHTML: '' }
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
  const handler = app.match(/byId\('reviewRobotsCart'\)\.onclick=(\(\)=>show\('cart'\));/);
  assert.ok(handler, 'Expected My Robots-to-Checkout handler');
  let destination;
  new Script('(' + handler[1] + ')').runInNewContext({ show: tab => { destination = tab; } })();
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
  const handler = app.match(/byId\('reviewSkillsCart'\)\.onclick=(\(\)=>show\('cart'\));/);
  assert.ok(handler, 'Expected Skills-to-Checkout handler');
  let destination;
  new Script('(' + handler[1] + ')').runInNewContext({ show: tab => { destination = tab; } })();
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
    products: { innerHTML: '' }, skillcards: { innerHTML: '' },
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
    assert.match(action, />Install unavailable<\/button>/);
    assert.doesNotMatch(action, /data-install|onclick=/);
  }
  assert.match(page, /Compatibility is not verified, and installation is unavailable/);
});


test('My Robots disables profile submission at 30 saved demos and re-enables it after removal', () => {
  assert.match(page, /id="saveDemoProfile" type="submit" aria-describedby="profileCount"/);
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
