import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const browserBinary = () => {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const result = spawnSync('which', [name], { encoding: 'utf8' });
    if (result.status === 0) return result.stdout.trim();
  }
  throw new Error('Chrome or Chromium is required for the browser journey test.');
};
async function until(fn, message, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const value = await fn(); if (value) return value; } catch { /* Page may be navigating. */ }
    await sleep(100);
  }
  throw new Error('Timed out: ' + message);
}
async function openCDP(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const response = JSON.parse(String(event.data));
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    clearTimeout(request.timer);
    if (response.error) request.reject(new Error(response.error.message));
    else request.resolve(response.result);
  });
  return {
    socket,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const next = ++id;
        const timer = setTimeout(() => {
          pending.delete(next);
          reject(new Error('CDP timed out: ' + method));
        }, 10000);
        pending.set(next, { resolve, reject, timer });
        socket.send(JSON.stringify({ id: next, method, params }));
      });
    }
  };
}

test('real Chrome mobile journey stays demo-only from Discover through Services', { timeout: 60000 }, async () => {
  const root = process.cwd();
  const assets = {
    '/consumer.html': { file: join(root, 'consumer.html'), type: 'text/html; charset=utf-8' },
    '/assets/botket-logo.svg': { file: join(root, 'assets/botket-logo.svg'), type: 'image/svg+xml' }
  };
  const server = createServer((request, response) => {
    const asset = assets[request.url?.split('?')[0]];
    if (!asset) {
      response.writeHead(404); response.end(); return;
    }
    response.writeHead(200, { 'content-type': asset.type });
    response.end(readFileSync(asset.file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const dir = mkdtempSync(join(tmpdir(), 'botket-browser-'));
  let chrome, cdp;
  try {
    chrome = spawn(browserBinary(), [
      '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--remote-allow-origins=*', '--remote-debugging-port=0',
      '--user-data-dir=' + dir, 'about:blank'
    ], { stdio: 'ignore' });
    const portFile = join(dir, 'DevToolsActivePort');
    const port = await until(() => {
      if (chrome.exitCode !== null) throw new Error('Chrome exited before debugging started.');
      return existsSync(portFile) && Number(readFileSync(portFile, 'utf8').split('\n')[0]);
    }, 'Chrome DevTools port', 20000);
    const tab = await until(async () => {
      const response = await fetch('http://127.0.0.1:' + port + '/json/list');
      const pages = await response.json();
      return pages.find(page => page.type === 'page' && page.webSocketDebuggerUrl);
    }, 'Chrome tab');
    cdp = await openCDP(tab.webSocketDebuggerUrl);
    const send = cdp.send;
    const evaluate = async expression => {
      const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) throw new Error('Browser JS exception: ' + response.exceptionDetails.text);
      return response.result.value;
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    const measureControls = selector => evaluate(`(() => {
      const nav = document.querySelector('.tabs').getBoundingClientRect();
      return {
        scrollY: window.scrollY,
        controls: [...document.querySelectorAll(${JSON.stringify(selector)})]
          .filter(el => !el.hidden && getComputedStyle(el).display !== 'none')
          .map(el => {
            const rect = el.getBoundingClientRect();
            return { height: rect.height, width: rect.width, gap: nav.top - rect.bottom };
          })
      };
    })()`);
    const assertAboveNav = (measured, label) => {
      assert.equal(measured.scrollY, 0, label + ' must be measured on first paint');
      assert.ok(measured.controls.length > 0, label + ' controls missing');
      for (const control of measured.controls) {
        assert.ok(control.gap >= 0, label + ' overlaps the bottom nav by ' + (-control.gap).toFixed(2) + 'px');
        assert.ok(control.height >= 44 && control.width >= 44, label + ' tap target is ' + control.width.toFixed(1) + 'x' + control.height.toFixed(1));
      }
    };
    const bringAboveNav = selector => evaluate(`(() => {
      const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .filter(el => !el.hidden && getComputedStyle(el).display !== 'none');
      const nav = () => document.querySelector('.tabs').getBoundingClientRect();
      const measured = nodes.map(el => {
        window.scrollTo(0, 0);
        let rect = el.getBoundingClientRect();
        let overlap = rect.bottom - nav().top;
        if (overlap > 0) window.scrollBy(0, Math.ceil(overlap));
        rect = el.getBoundingClientRect();
        overlap = rect.bottom - nav().top;
        if (overlap > 0) window.scrollBy(0, Math.ceil(overlap));
        rect = el.getBoundingClientRect();
        const bar = nav();
        return { height: rect.height, width: rect.width, gap: bar.top - rect.bottom, top: rect.top };
      });
      window.scrollTo(0, 0);
      return measured;
    })()`);
    const assertReachable = (measured, label) => {
      assert.ok(measured.length > 0, label + ' controls missing');
      for (const control of measured) {
        assert.ok(control.top >= 0, label + ' is clipped by the top of the viewport');
        assert.ok(control.gap >= 0, label + ' overlaps the bottom nav by ' + (-control.gap).toFixed(2) + 'px');
        assert.ok(control.height >= 44 && control.width >= 44, label + ' tap target is ' + control.width.toFixed(1) + 'x' + control.height.toFixed(1));
      }
    };

    await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/consumer.html' });
    await until(() => evaluate("document.querySelector('header img')?.naturalHeight > 0 && Boolean(document.querySelector('#products [data-add]'))"), 'Discover concepts rendered');
    assert.equal(await evaluate("document.querySelector('#store').hidden"), false);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.tabs')).position"), 'fixed');
    const discoverFilters = await measureControls('#store .store-filters button, #store #robotSearch');
    assert.equal(discoverFilters.controls.length, 5, 'Discover shows four category chips and search');
    assertAboveNav(discoverFilters, 'Discover filters and search');
    assertAboveNav(await measureControls('#products article:first-child .concept-actions button'), 'Discover first concept actions');
    assertReachable(await bringAboveNav('#products .concept-actions button'), 'Discover concept actions');
    await evaluate("document.querySelector('#robotSearch').value='home'; document.querySelector('#robotSearch').dispatchEvent(new Event('input', { bubbles: true }))");
    await until(() => evaluate("document.querySelector('#clearRobotSearch').hidden === false && document.querySelectorAll('#products .concept-actions button').length === 2"), 'Discover search match shown');
    assertAboveNav(await measureControls('#store #clearRobotSearch, #products .concept-actions button'), 'Discover search match');
    await evaluate("document.querySelector('#robotSearch').value='zzzz-no-match'; document.querySelector('#robotSearch').dispatchEvent(new Event('input', { bubbles: true }))");
    await until(() => evaluate("document.querySelector('#resetDiscoverFilters').hidden === false"), 'Discover no-match recovery shown');
    const discoverRecovery = await measureControls('#store #clearRobotSearch, #store #resetDiscoverFilters');
    assert.equal(discoverRecovery.controls.length, 2, 'Discover shows Clear search and Show all');
    assertAboveNav(discoverRecovery, 'Discover clear and reset');
    await evaluate("document.querySelector('#resetDiscoverFilters').click()");
    await until(() => evaluate("document.querySelectorAll('#products [data-add]').length === 3 && document.querySelector('#robotSearch').value === ''"), 'Discover filters restored');
    await evaluate('window.scrollTo(0, 0)');

    await evaluate("document.querySelector('[data-tab=cart]').click()");
    await until(() => evaluate("document.querySelector('#cart').hidden === false"), 'Empty checkout opened');
    assertAboveNav(await measureControls('#items [data-cart-browse], #items [data-cart-robots], #clearCart'), 'Empty checkout');
    await evaluate("document.querySelector('[data-tab=store]').click()");
    await until(() => evaluate("document.querySelector('#store').hidden === false"), 'Discover restored');

    await evaluate("document.querySelector('#products [data-add]').click()");
    assert.equal(await evaluate("document.querySelector('#cart').hidden"), false);
    assert.equal(await evaluate("document.querySelector('#count').textContent"), '1');
    assert.equal(await evaluate("document.querySelector('#clearCart').textContent"), 'Clear all 1 demo cart item');
    assert.equal(await evaluate("document.querySelector('#result').textContent"), 'Added robot concept "Home Robot Concept" to demo cart. 1 demo item in cart. Preview again to continue. No order was placed.');
    assert.equal(await evaluate("document.querySelector('#result').getAttribute('role')"), 'status');
    assert.equal(await evaluate("document.querySelector('#result').getAttribute('aria-live')"), 'polite');
    assert.equal(await evaluate("document.activeElement.tagName"), 'H2', 'Adding a concept keeps the checkout heading handoff');
    assert.equal(await evaluate("document.querySelector('#items').getAttribute('aria-live')"), null);
    assert.equal(await evaluate("document.querySelector('#cartSummary').getAttribute('role')"), null);
    assertAboveNav(await measureControls('#items [data-cart-remove], #browseFromCheckout, #clearCart'), 'One-item checkout');

    await evaluate("document.querySelector('[data-tab=store]').click()");
    await until(() => evaluate("document.querySelector('#store').hidden === false && document.querySelector('#reviewDiscoverCart').hidden === false"), 'Discover cart review shown');
    assertReachable(await bringAboveNav('#reviewDiscoverCart'), 'Discover review cart');
    await evaluate("document.querySelector('#reviewDiscoverCart').click()");
    await until(() => evaluate("document.querySelector('#cart').hidden === false && document.querySelector('#result').textContent.includes('Reviewing demo cart: 1 demo item')"), 'Review demo cart announced');
    assert.equal(await evaluate("document.querySelector('#result').textContent"), 'Reviewing demo cart: 1 demo item. This is an order preview only. No payment, reservation or order submission occurred.');
    assert.equal(await evaluate("document.activeElement.tagName"), 'H2', 'Review demo cart keeps the checkout heading handoff');

    await evaluate("document.querySelector('[data-tab=services]').click()");
    await until(() => evaluate("document.querySelector('#services').hidden === false"), 'Services opened');
    await evaluate("document.querySelector('#servicecards [data-add]').click()");
    await until(() => evaluate("document.querySelector('#count').textContent === '2' && document.querySelector('#cart').hidden === false"), 'Two-item checkout opened');
    assert.equal(await evaluate("document.querySelector('#result').textContent"), 'Added service preview "Robot Setup" to demo cart. 2 demo items in cart. Preview again to continue. No order was placed.');
    const multiRemove = await measureControls('#items [data-cart-remove]');
    assert.equal(multiRemove.scrollY, 0, 'Two-item checkout must be measured on first paint');
    assert.equal(multiRemove.controls.length, 2, 'Two-item checkout keeps both Remove actions');
    for (const control of multiRemove.controls) {
      assert.ok(control.gap >= 0, 'Two-item Remove overlaps the bottom nav by ' + (-control.gap).toFixed(2) + 'px');
      assert.ok(control.height >= 44 && control.width >= 44, 'Two-item Remove tap target is ' + control.width.toFixed(1) + 'x' + control.height.toFixed(1));
    }
    await evaluate("document.querySelector('#clearCart').focus()");
    const multiClear = await measureControls('#clearCart');
    assert.equal(multiClear.controls.length, 1);
    assert.ok(multiClear.controls[0].gap >= 0, 'Two-item Clear all overlaps the bottom nav by ' + (-multiClear.controls[0].gap).toFixed(2) + 'px after scroll');
    assert.ok(multiClear.controls[0].height >= 44 && multiClear.controls[0].width >= 44, 'Two-item Clear all tap target is ' + multiClear.controls[0].width.toFixed(1) + 'x' + multiClear.controls[0].height.toFixed(1));
    await evaluate("document.querySelectorAll('#items [data-cart-remove]')[1].click()");
    await until(() => evaluate("document.querySelector('#count').textContent === '1'"), 'Returned to one demo item');
    assert.match(await evaluate("document.querySelector('#result').textContent"), /Removed service preview "Robot Setup" from demo cart\. 1 demo item remaining\. Preview again to continue\. No order was placed\./);

    await evaluate("document.querySelector('#name').focus(); document.querySelector('#name').value='Temp nick'; document.querySelector('#name').dispatchEvent(new Event('input', { bubbles: true }))");
    await until(() => evaluate("document.querySelector('#clearPreviewName').hidden === false && document.querySelector('#checkoutToRobots').hidden === true"), 'Clear preview name shown before any order preview');
    await evaluate("document.querySelector('#clearPreviewName').click()");
    assert.equal(await evaluate("document.querySelector('#name').value"), '');
    assert.equal(await evaluate("document.querySelector('#result').textContent"), 'Preview name cleared. This is an on-page demo preview; no order or personal details are submitted.');
    assert.equal(await evaluate("document.activeElement.id"), 'name', 'Clear preview name returns to the nickname field');

    await evaluate("document.querySelector('#preview').click()");
    assert.match(await evaluate("document.querySelector('#result').textContent"), /No payment or order submission occurred/);
    await evaluate("document.querySelector('#checkoutToRobots').click()");
    assert.equal(await evaluate("document.querySelector('#robots').hidden"), false);
    assert.match(await evaluate("document.querySelector('#robotMessage').textContent"), /does not confirm purchase/);

    await evaluate("document.querySelector('#robotNickname').value='Browser Test Robot'; document.querySelector('#robotBrand').value='Example Maker'; document.querySelector('#robotModel').value='Model A'; document.querySelector('#registerRobot').requestSubmit()");
    assert.match(await evaluate("document.querySelector('#profileCount').textContent"), /1 of 30/);
    assert.match(await evaluate("document.querySelector('#robotMessage').textContent"), /Compatibility not verified; no device connected/);
    assert.equal(await evaluate("document.querySelector('#robotMessage').getAttribute('role')"), 'status');
    const filledRobots = '#robots #openSkillsFromRobots, #robots #robotNickname, #robots #robotBrand, #robots #robotModel, #robots #saveDemoProfile, #robots #profileSearch, #robots #clearProfiles, #robots #myrobots button, #robots #reviewRobotsCart';
    const savedRobots = await bringAboveNav(filledRobots);
    assert.equal(savedRobots.length, 11, 'Filled My Robots shows the skills handoff, profile form, search, clear, profile actions, and cart review');
    assertReachable(savedRobots, 'Filled My Robots');
    const savedOverflow = await evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth");
    assert.equal(savedOverflow, 0, 'Filled My Robots overflows horizontally by ' + savedOverflow + 'px');
    await evaluate("document.querySelector('#openSkillsFromRobots').click()");
    assert.equal(await evaluate("document.querySelector('#skills').hidden"), false);
    assert.match(await evaluate("document.querySelector('#skillsRobotSummary').textContent"), /Compatibility has not been checked; installation is unavailable/);
    assert.equal(await evaluate("document.querySelector('#skillsRobotSummary').getAttribute('role')"), 'status');
    await evaluate("document.querySelector('#skillRobotSelect').focus(); document.querySelector('#skillRobotSelect').value=''; document.querySelector('#skillRobotSelect').dispatchEvent(new Event('change', { bubbles: true }))");
    assert.match(await evaluate("document.querySelector('#skillsRobotSummary').textContent"), /1 local demo robot profile\(s\) saved/);
    assert.match(await evaluate("document.querySelector('#skillsRobotSummary').textContent"), /installation is unavailable/);
    assert.equal(await evaluate("document.activeElement.id"), 'skillRobotSelect', 'Changing the skill preview keeps focus on the profile select');
    await evaluate("document.querySelector('#skillRobotSelect').value=document.querySelector('#skillRobotSelect').options[1].value; document.querySelector('#skillRobotSelect').dispatchEvent(new Event('change', { bubbles: true }))");
    assert.match(await evaluate("document.querySelector('#skillsRobotSummary').textContent"), /Viewing generic skill previews for local demo profile: Browser Test Robot/);
    await evaluate('window.scrollTo(0, 0)');
    const filledSkills = '#skills #openServicesFromSkills, #skills #skillRobotSelect, #skills #openRobotsFromSkills, #skills #skillcards button';
    const skillsHandoff = await measureControls('#skills #openServicesFromSkills, #skills #skillRobotSelect, #skills #openRobotsFromSkills');
    assert.equal(skillsHandoff.controls.length, 3, 'Filled Skills shows the services handoff, profile select, and robots handoff on first paint');
    assertAboveNav(skillsHandoff, 'Filled Skills handoff');
    const savedSkills = await bringAboveNav(filledSkills);
    assert.equal(savedSkills.length, 5, 'Filled Skills shows the handoffs, profile select, and both install previews');
    assertReachable(savedSkills, 'Filled Skills');
    const skillsOverflow = await evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth");
    assert.equal(skillsOverflow, 0, 'Filled Skills overflows horizontally by ' + skillsOverflow + 'px');
    await evaluate("document.querySelector('#openServicesFromSkills').click()");
    assert.equal(await evaluate("document.querySelector('#services').hidden"), false);
    assert.match(await evaluate("document.querySelector('#serviceRobotContext').textContent"), /eligibility and compatibility are unverified/i);
    assert.equal(await evaluate("document.querySelector('#servicecards [data-add]') !== null"), true);
    assert.match(await evaluate("document.querySelector('#services > p.muted').textContent"), /No bookings/);
    await evaluate('window.scrollTo(0, 0)');
    const filledServices = '#services #serviceRobotSelect, #services #openSkillsFromServices, #services #openRobotsFromServices, #services #servicecards button';
    const servicesHandoff = await measureControls('#services #serviceRobotSelect, #services #openSkillsFromServices, #services #openRobotsFromServices');
    assert.equal(servicesHandoff.controls.length, 3, 'Filled Services shows the profile select and both handoffs on first paint');
    assertAboveNav(servicesHandoff, 'Filled Services handoff');
    const savedServices = await bringAboveNav(filledServices);
    assert.equal(savedServices.length, 5, 'Filled Services shows the profile select, handoffs, and both demo service actions');
    assertReachable(savedServices, 'Filled Services');
    const servicesOverflow = await evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth");
    assert.equal(servicesOverflow, 0, 'Filled Services overflows horizontally by ' + servicesOverflow + 'px');

    // Demo robot profiles are local browser data, unlike the ephemeral demo cart.
    // A reload must restore the profile without implying a purchase or device link.
    await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/consumer.html' });
    await until(() => evaluate("document.querySelector('#store')?.hidden === false && document.querySelector('#profileCount')?.textContent.includes('1 of 30')"), 'saved demo profile restored after reload');
    assert.equal(await evaluate("document.querySelector('#count').textContent"), '0', 'Demo cart must not become a persisted order');
    await evaluate("document.querySelector('[data-tab=robots]').click()");
    assert.match(await evaluate("document.querySelector('#myrobots').textContent"), /Browser Test Robot/);
    assert.match(await evaluate("document.querySelector('#myrobots').textContent"), /Example Maker/);
    assert.match(await evaluate("document.querySelector('#robots > p.muted').textContent"), /does not verify ownership or connect hardware/);
    const restoredRobots = await bringAboveNav('#robots #openSkillsFromRobots, #robots #robotNickname, #robots #robotBrand, #robots #robotModel, #robots #saveDemoProfile, #robots #profileSearch, #robots #clearProfiles, #robots #myrobots button');
    assert.equal(restoredRobots.length, 10, 'Reloaded My Robots keeps the saved profile actions without the unsaved cart');
    assertReachable(restoredRobots, 'Reloaded My Robots');
    const restoredOverflow = await evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth");
    assert.equal(restoredOverflow, 0, 'Reloaded My Robots overflows horizontally by ' + restoredOverflow + 'px');
    assert.equal(await evaluate("document.querySelector('#reviewRobotsCart').hidden"), true, 'A reload must not turn the demo cart into a saved order');

    // Canceling a profile deletion must preserve it; confirming must persist removal.
    await evaluate("window.confirm = () => false; document.querySelector('#myrobots [data-remove]').click()");
    assert.match(await evaluate("document.querySelector('#myrobots').textContent"), /Browser Test Robot/, 'Cancel keeps the saved profile');
    await evaluate("window.confirm = () => true; document.querySelector('#myrobots [data-remove]').click()");
    assert.match(await evaluate("document.querySelector('#profileCount').textContent"), /^0 of 30/, 'Confirm removes the profile');
    assert.match(await evaluate("document.querySelector('#robotMessage').textContent"), /Demo profile removed from this browser/);

    // A canceled cart clear must not change the cart; confirming clears only demo state.
    await evaluate("document.querySelector('[data-tab=store]').click(); document.querySelector('#products [data-add]').click()");
    assert.equal(await evaluate("document.querySelector('#count').textContent"), '1');
    await evaluate("window.confirm = () => false; document.querySelector('#clearCart').click()");
    assert.equal(await evaluate("document.querySelector('#count').textContent"), '1', 'Cancel keeps the demo cart');
    await evaluate("window.confirm = () => true; document.querySelector('#clearCart').click()");
    assert.equal(await evaluate("document.querySelector('#count').textContent"), '0', 'Confirm empties the demo cart');
    assert.equal(await evaluate("document.querySelector('#preview').disabled"), true, 'Empty demo cart cannot preview an order');
    assert.match(await evaluate("document.querySelector('#result').textContent"), /Cart cleared\. No order was placed/);

    await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/consumer.html' });
    await until(() => evaluate("document.querySelector('#profileCount')?.textContent.startsWith('0 of 30')"), 'deleted demo profile stays deleted after reload');
    assert.equal(await evaluate("document.querySelector('#count').textContent"), '0', 'Cleared demo cart remains ephemeral');

  } finally {
    cdp?.socket.close();
    if (chrome && chrome.exitCode === null) {
      const exited = new Promise(resolve => chrome.once('exit', resolve));
      chrome.kill();
      await Promise.race([exited, sleep(1500)]);
    }
    await new Promise(resolve => server.close(resolve));
    // Chrome subprocesses may briefly recreate profile files after the launcher exits.
    // A temporary-profile cleanup race must not fail an otherwise successful journey.
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (error) {
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
      console.warn('Chrome temporary profile cleanup deferred:', error.code);
    }
  }
});

test('mobile section handoffs open at the heading for pointer and keyboard users', { timeout: 60000 }, async () => {
  const root = process.cwd();
  const assets = {
    '/consumer.html': { file: join(root, 'consumer.html'), type: 'text/html; charset=utf-8' },
    '/assets/botket-logo.svg': { file: join(root, 'assets/botket-logo.svg'), type: 'image/svg+xml' }
  };
  const server = createServer((request, response) => {
    const asset = assets[request.url?.split('?')[0]];
    if (!asset) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': asset.type });
    response.end(readFileSync(asset.file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const dir = mkdtempSync(join(tmpdir(), 'botket-handoff-'));
  let chrome, cdp;
  try {
    chrome = spawn(browserBinary(), [
      '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--remote-allow-origins=*', '--remote-debugging-port=0',
      '--user-data-dir=' + dir, 'about:blank'
    ], { stdio: 'ignore' });
    const portFile = join(dir, 'DevToolsActivePort');
    const port = await until(() => {
      if (chrome.exitCode !== null) throw new Error('Chrome exited before debugging started.');
      return existsSync(portFile) && Number(readFileSync(portFile, 'utf8').split('\n')[0]);
    }, 'Chrome DevTools port', 20000);
    const tab = await until(async () => {
      const response = await fetch('http://127.0.0.1:' + port + '/json/list');
      const pages = await response.json();
      return pages.find(page => page.type === 'page' && page.webSocketDebuggerUrl);
    }, 'Chrome tab');
    cdp = await openCDP(tab.webSocketDebuggerUrl);
    const send = cdp.send;
    const evaluate = async expression => {
      const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) throw new Error('Browser JS exception: ' + response.exceptionDetails.text);
      return response.result.value;
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/consumer.html' });
    await until(() => evaluate("document.querySelector('#products [data-add]') !== null && matchMedia('(prefers-reduced-motion: reduce)').matches"), 'Discover ready under reduced motion');

    const handoff = async (selector, destination, label) => {
      const measured = await evaluate(`(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const beforeTop = document.querySelector('main section:not([hidden]) h2').getBoundingClientRect().top;
        const control = document.querySelector(${JSON.stringify(selector)});
        if (!control || control.hidden || getComputedStyle(control).display === 'none') return { missing: true };
        control.click();
        const section = [...document.querySelectorAll('main section')].find(node => !node.hidden);
        const heading = section.querySelector('h2');
        const rect = heading.getBoundingClientRect();
        const nav = document.querySelector('.tabs').getBoundingClientRect();
        const header = document.querySelector('header');
        const headerRect = header.getBoundingClientRect();
        const active = document.activeElement;
        const headingText = heading.textContent.trim();
        const lives = [...section.querySelectorAll('[aria-live], [role="status"], [role="alert"]')];
        return {
          beforeTop,
          section: section.id,
          headingTop: rect.top,
          headingBottom: rect.bottom,
          navTop: nav.top,
          headerPosition: getComputedStyle(header).position,
          headerBottom: headerRect.bottom,
          activeTag: active.tagName,
          sameHeading: active === heading,
          tabindex: heading.getAttribute('tabindex'),
          focusVisible: active.matches(':focus-visible'),
          aria: [...document.querySelectorAll('[aria-current="page"]')].map(node => node.dataset.tab),
          inLive: Boolean(heading.closest('[aria-live], [role="status"], [role="alert"]')),
          liveDuplicate: lives.some(node => node.textContent.trim() === headingText),
          scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
          overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth
        };
      })()`);
      assert.notEqual(measured.missing, true, label + ' control missing: ' + selector);
      assert.ok(measured.beforeTop < 0, label + ' must start mid-page, heading top was ' + measured.beforeTop.toFixed(1));
      assert.equal(measured.section, destination, label);
      assert.equal(measured.activeTag, 'H2', label + ' focus stayed on ' + measured.activeTag);
      assert.equal(measured.sameHeading, true, label + ' focused a different heading');
      assert.equal(measured.tabindex, '-1', label + ' heading is not programmatically focusable');
      assert.ok(measured.headingTop >= 0, label + ' heading is clipped above the viewport by ' + (-measured.headingTop).toFixed(1) + 'px');
      assert.ok(measured.headingBottom <= measured.navTop, label + ' heading is behind the bottom nav by ' + (measured.headingBottom - measured.navTop).toFixed(1) + 'px');
      assert.equal(measured.overflow, 0, label + ' overflows horizontally by ' + measured.overflow + 'px');
      if (measured.headerPosition === 'fixed' || measured.headerPosition === 'sticky') {
        assert.ok(measured.headingTop >= measured.headerBottom - 0.5, label + ' heading is under the sticky header');
      }
      assert.equal(measured.focusVisible, false, label + ' shows a focus ring after pointer activation');
      assert.deepEqual(measured.aria, [destination], label + ' aria-current');
      assert.equal(measured.inLive, false, label + ' announces the heading from a live region as well as focus');
      assert.equal(measured.liveDuplicate, false, label + ' live region repeats the heading');
      assert.equal(measured.scrollBehavior, 'auto', label + ' should not smooth-scroll');
    };

    await handoff('[data-tab=cart]', 'cart', 'Bottom nav Discover to Checkout');
    await handoff('[data-tab=robots]', 'robots', 'Bottom nav Checkout to My Robots');
    await handoff('[data-tab=skills]', 'skills', 'Bottom nav My Robots to Skills');
    await handoff('[data-tab=services]', 'services', 'Bottom nav Skills to Services');
    await handoff('[data-tab=store]', 'store', 'Bottom nav Services to Discover');

    await handoff('[data-tab=cart]', 'cart', 'Empty Checkout');
    await handoff('#items [data-cart-browse]', 'store', 'Empty Checkout browse robots');
    await handoff('[data-tab=cart]', 'cart', 'Return to empty Checkout');
    await handoff('#items [data-cart-robots]', 'robots', 'Empty Checkout open My Robots');
    await handoff('#openDiscoverFromRobots', 'store', 'Empty My Robots explore concepts');
    await handoff('[data-tab=robots]', 'robots', 'Return to empty My Robots');
    await handoff('#openSkillsFromRobots', 'skills', 'Empty My Robots explore skills');
    await handoff('[data-tab=robots]', 'robots', 'Return to empty My Robots list');
    await handoff('#myrobots button', 'store', 'Empty My Robots list recovery');
    await handoff('[data-tab=skills]', 'skills', 'Bottom nav to Skills recovery');
    await handoff('#openServicesFromSkills', 'services', 'Skills to Services');
    await handoff('#openSkillsFromServices', 'skills', 'Services recovery to Skills');
    await handoff('#openServicesFromSkills', 'services', 'Return to Services');
    await handoff('#openRobotsFromServices', 'robots', 'Services recovery to My Robots');
    await handoff('[data-tab=skills]', 'skills', 'Return to Skills');
    await handoff('#openRobotsFromSkills', 'robots', 'Skills manage robots recovery');

    await handoff('[data-tab=services]', 'services', 'Open Services before adding a preview');
    await handoff('#servicecards [data-add]', 'cart', 'Services add to Checkout');
    await evaluate("document.querySelector('#preview').click()");
    await handoff('#checkoutToRobots', 'services', 'Service-only Checkout continue');
    assert.match(await evaluate("document.querySelector('#serviceRobotContext').textContent"), /no service was booked and no payment was taken/i);

    await handoff('[data-tab=store]', 'store', 'Discover before adding a concept');
    await handoff('#products [data-add]', 'cart', 'Discover add to Checkout');
    await handoff('#browseFromCheckout', 'store', 'Checkout continue browsing');
    await handoff('#reviewDiscoverCart', 'cart', 'Discover review demo cart');
    await evaluate("document.querySelector('#preview').click()");
    await handoff('#checkoutToRobots', 'robots', 'Checkout continue to My Robots');
    assert.match(await evaluate("document.querySelector('#robotMessage').textContent"), /does not confirm purchase/i);
    await handoff('#openSkillsFromRobots', 'skills', 'My Robots explore skill previews');
    await handoff('#openServicesFromSkills', 'services', 'Filled Skills to Services');

    const profile = await evaluate(`(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      document.querySelector('[data-tab=store]').click();
      window.scrollTo(0, document.documentElement.scrollHeight);
      document.querySelector('#products [data-robot]').click();
      const active = document.activeElement;
      const rect = active.getBoundingClientRect();
      const nav = document.querySelector('.tabs').getBoundingClientRect();
      const section = [...document.querySelectorAll('main section')].find(node => !node.hidden);
      return {
        section: section.id,
        id: active.id,
        top: rect.top,
        bottom: rect.bottom,
        navTop: nav.top,
        focusVisible: active.matches(':focus-visible'),
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches
      };
    })()`);
    assert.equal(profile.section, 'robots', 'Create demo profile opens My Robots');
    assert.equal(profile.id, 'robotBrand', 'Create demo profile lands in the brand field');
    assert.ok(profile.top >= 0 && profile.bottom <= profile.navTop, 'Brand field is outside the visible area above the bottom nav');
    assert.equal(profile.focusVisible, false, 'Create demo profile shows a focus ring after pointer activation');
    assert.equal(profile.reduced, true);

    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    const press = async key => {
      const spec = key === 'Enter'
        ? { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' }
        : { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, text: ' ' };
      await send('Input.dispatchKeyEvent', { type: 'keyDown', ...spec });
      if (key === ' ') await send('Input.dispatchKeyEvent', { type: 'char', ...spec });
      const { text, ...rest } = spec;
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...rest });
    };
    const keyboardLanding = async (selector, destination, key, label) => {
      await evaluate(`(() => { window.scrollTo(0, document.documentElement.scrollHeight); document.querySelector(${JSON.stringify(selector)}).focus(); })()`);
      await press(key);
      await sleep(50);
      const measured = await evaluate(`(() => {
        const section = [...document.querySelectorAll('main section')].find(node => !node.hidden);
        const heading = section.querySelector('h2');
        const rect = heading.getBoundingClientRect();
        const nav = document.querySelector('.tabs').getBoundingClientRect();
        const active = document.activeElement;
        return {
          section: section.id,
          sameHeading: active === heading,
          headingTop: rect.top,
          headingBottom: rect.bottom,
          navTop: nav.top,
          focusVisible: active.matches(':focus-visible'),
          aria: document.querySelector('[aria-current="page"]')?.dataset.tab
        };
      })()`);
      assert.equal(measured.section, destination, label);
      assert.equal(measured.sameHeading, true, label + ' did not move focus to the heading');
      assert.ok(measured.headingTop >= 0 && measured.headingBottom <= measured.navTop, label + ' heading is not fully visible');
      assert.equal(measured.focusVisible, true, label + ' keyboard focus has no visible indicator');
      assert.equal(measured.aria, destination, label + ' aria-current');
    };
    await keyboardLanding('[data-tab=services]', 'services', ' ', 'Space on Services nav');
    await keyboardLanding('#openRobotsFromServices', 'robots', 'Enter', 'Enter on Services manage robots');

    const box = await evaluate(`(() => { const rect = document.querySelector('[data-tab=store]').getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await sleep(50);
    const pointer = await evaluate(`(() => {
      const section = [...document.querySelectorAll('main section')].find(node => !node.hidden);
      const heading = section.querySelector('h2');
      const rect = heading.getBoundingClientRect();
      const nav = document.querySelector('.tabs').getBoundingClientRect();
      return {
        section: section.id,
        sameHeading: document.activeElement === heading,
        focusVisible: document.activeElement.matches(':focus-visible'),
        headingTop: rect.top,
        headingBottom: rect.bottom,
        navTop: nav.top
      };
    })()`);
    assert.equal(pointer.section, 'store');
    assert.equal(pointer.sameHeading, true);
    assert.equal(pointer.focusVisible, false, 'Mouse activation shows a focus ring on the heading');
    assert.ok(pointer.headingTop >= 0 && pointer.headingBottom <= pointer.navTop);
  } finally {
    cdp?.socket.close();
    if (chrome && chrome.exitCode === null) {
      const exited = new Promise(resolve => chrome.once('exit', resolve));
      chrome.kill();
      await Promise.race([exited, sleep(1500)]);
    }
    await new Promise(resolve => server.close(resolve));
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (error) {
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
      console.warn('Chrome temporary profile cleanup deferred:', error.code);
    }
  }
});

test('Discover concept cards stay inside 320 and 390 phone widths', { timeout: 60000 }, async () => {
  const root = process.cwd();
  const assets = {
    '/consumer.html': { file: join(root, 'consumer.html'), type: 'text/html; charset=utf-8' },
    '/assets/botket-logo.svg': { file: join(root, 'assets/botket-logo.svg'), type: 'image/svg+xml' }
  };
  const server = createServer((request, response) => {
    const asset = assets[request.url?.split('?')[0]];
    if (!asset) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': asset.type });
    response.end(readFileSync(asset.file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const dir = mkdtempSync(join(tmpdir(), 'botket-concepts-'));
  let chrome, cdp;
  try {
    chrome = spawn(browserBinary(), [
      '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--remote-allow-origins=*', '--remote-debugging-port=0',
      '--user-data-dir=' + dir, 'about:blank'
    ], { stdio: 'ignore' });
    const portFile = join(dir, 'DevToolsActivePort');
    const port = await until(() => {
      if (chrome.exitCode !== null) throw new Error('Chrome exited before debugging started.');
      return existsSync(portFile) && Number(readFileSync(portFile, 'utf8').split('\n')[0]);
    }, 'Chrome DevTools port', 20000);
    const tab = await until(async () => {
      const response = await fetch('http://127.0.0.1:' + port + '/json/list');
      const pages = await response.json();
      return pages.find(page => page.type === 'page' && page.webSocketDebuggerUrl);
    }, 'Chrome tab');
    cdp = await openCDP(tab.webSocketDebuggerUrl);
    const send = cdp.send;
    const evaluate = async expression => {
      const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) throw new Error('Browser JS exception: ' + response.exceptionDetails.text);
      return response.result.value;
    };
    await send('Page.enable');
    await send('Runtime.enable');
    const measure = `(() => {
      const text = value => (value || '').replace(/\\s+/g, ' ').trim();
      const cards = [...document.querySelectorAll('#products .concept-card')].map(card => {
        const cardRect = card.getBoundingClientRect();
        const heading = card.querySelector('h3');
        const parts = [...card.querySelectorAll('h3, .concept-price, .concept-label, .concept-actions button')].map(el => {
          const rect = el.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(el);
          const lines = [...range.getClientRects()]
            .filter(line => line.width > 0.5)
            .map(line => ({ left: line.left, right: line.right }));
          const kind = el.matches('h3') ? 'heading'
            : el.classList.contains('concept-price') ? 'price'
            : el.classList.contains('concept-label') ? 'badge' : 'button';
          return {
            kind,
            text: text(el.innerText),
            aria: el.getAttribute('aria-label') || '',
            width: rect.width,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            scrollGap: el.scrollWidth - el.clientWidth,
            lines
          };
        });
        return {
          name: text(heading ? heading.textContent : card.getAttribute('aria-label')),
          text: text(card.innerText),
          arias: parts.map(part => part.aria).filter(Boolean).join(' '),
          images: [...card.querySelectorAll('img')].map(img => ({
            alt: img.getAttribute('alt'),
            hidden: img.getAttribute('aria-hidden'),
            role: img.getAttribute('role')
          })),
          cardLeft: cardRect.left,
          cardRight: cardRect.right,
          parts
        };
      });
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        width: window.innerWidth,
        cards
      };
    })()`;
    const names = ['Home Robot Concept', 'Companion Robot Concept', 'Educational Robotics Kit Concept'];
    const forbidden = /buy now|purchase|place order|payment|works with|compatible with|connect your robot|verified compatibility/i;
    const assertCards = (measured, label, firstButtons) => {
      assert.equal(measured.overflow, 0, label + ' overflows horizontally by ' + measured.overflow + 'px');
      assert.equal(measured.cards.length, 3, label + ' concept cards');
      measured.cards.forEach((card, index) => {
        const where = label + ' ' + names[index];
        assert.equal(card.name, names[index], where + ' accessible name');
        assert.match(card.text, /illustrative price/i, where + ' price');
        assert.match(card.text, /concept only/i, where + ' demo label');
        assert.match(card.text, /demo cart/i, where);
        assert.match(card.text, /demo profile/i, where);
        assert.match(card.arias, /preview only/i, where);
        assert.match(card.arias, /ownership and compatibility not verified/i, where);
        assert.doesNotMatch(card.text + ' ' + card.arias, forbidden, where);
        assert.ok(card.cardLeft >= -1 && card.cardRight <= measured.width + 1, where + ' card reaches ' + card.cardRight.toFixed(1) + 'px');
        for (const image of card.images) {
          const decorative = image.alt === '' || image.hidden === 'true' || image.role === 'presentation' || image.role === 'none';
          const meaningful = typeof image.alt === 'string' && image.alt.trim().length > 0;
          assert.ok(decorative || meaningful, where + ' image needs alt text or must be decorative');
        }
        assert.deepEqual(card.parts.map(part => part.kind), ['heading', 'price', 'badge', 'button', 'button'], where + ' parts');
        assert.equal(card.parts[3].text, firstButtons[index], where + ' primary action');
        for (const part of card.parts) {
          const piece = where + ' ' + part.kind + ' "' + part.text + '"';
          assert.ok(part.left >= card.cardLeft - 1 && part.right <= card.cardRight + 1, piece + ' leaves the card at ' + part.right.toFixed(1) + 'px');
          assert.ok(part.left >= -1 && part.right <= measured.width + 1, piece + ' leaves the viewport at ' + part.right.toFixed(1) + 'px');
          assert.ok(part.scrollGap <= 1, piece + ' clips horizontally by ' + part.scrollGap.toFixed(1) + 'px');
          for (const line of part.lines) {
            assert.ok(line.left >= part.left - 1 && line.right <= part.right + 1, piece + ' text runs to ' + line.right.toFixed(1) + 'px');
          }
          if (part.kind === 'button') {
            assert.ok(part.width >= 44 && part.height >= 44, piece + ' tap target is ' + part.width.toFixed(1) + 'x' + part.height.toFixed(1));
          }
        }
      });
    };
    const show = async (width, height) => {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await until(() => evaluate('window.innerWidth === ' + width + ' && document.querySelectorAll("#products .concept-card").length === 3'), width + ' layout');
      await evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
      await evaluate('window.scrollTo(0, 0)');
      return evaluate(measure);
    };

    await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/consumer.html' });
    await until(() => evaluate("document.querySelectorAll('#products .concept-card').length === 3"), 'Discover concepts rendered');
    const addToCart = names.map(() => 'Add to demo cart');
    assertCards(await show(320, 640), '320x640', addToCart);
    assertCards(await show(390, 844), '390x844', addToCart);

    await show(320, 640);
    await evaluate("document.querySelector('#products [data-add]').click()");
    await until(() => evaluate("document.querySelector('#count').textContent === '1'"), 'demo cart has the first concept');
    await evaluate("document.querySelector('[data-tab=store]').click()");
    await until(() => evaluate("document.querySelector('#store').hidden === false && document.querySelector('#products button[disabled]') !== null"), 'Discover shows the concept already in the demo cart');
    const inCart = ['In demo cart', 'Add to demo cart', 'Add to demo cart'];
    assertCards(await show(320, 640), '320x640 in demo cart', inCart);
    assertCards(await show(390, 844), '390x844 in demo cart', inCart);
  } finally {
    cdp?.socket.close();
    if (chrome && chrome.exitCode === null) {
      const exited = new Promise(resolve => chrome.once('exit', resolve));
      chrome.kill();
      await Promise.race([exited, sleep(1500)]);
    }
    await new Promise(resolve => server.close(resolve));
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (error) {
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
      console.warn('Chrome temporary profile cleanup deferred:', error.code);
    }
  }
});

test('empty Checkout, My Robots, Skills, and Services stay inside 320 and 390 phone widths', { timeout: 60000 }, async () => {
  const root = process.cwd();
  const assets = {
    '/consumer.html': { file: join(root, 'consumer.html'), type: 'text/html; charset=utf-8' },
    '/assets/botket-logo.svg': { file: join(root, 'assets/botket-logo.svg'), type: 'image/svg+xml' }
  };
  const server = createServer((request, response) => {
    const asset = assets[request.url?.split('?')[0]];
    if (!asset) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': asset.type });
    response.end(readFileSync(asset.file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const dir = mkdtempSync(join(tmpdir(), 'botket-empty-'));
  let chrome, cdp;
  try {
    chrome = spawn(browserBinary(), [
      '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--remote-allow-origins=*', '--remote-debugging-port=0',
      '--user-data-dir=' + dir, 'about:blank'
    ], { stdio: 'ignore' });
    const portFile = join(dir, 'DevToolsActivePort');
    const port = await until(() => {
      if (chrome.exitCode !== null) throw new Error('Chrome exited before debugging started.');
      return existsSync(portFile) && Number(readFileSync(portFile, 'utf8').split('\n')[0]);
    }, 'Chrome DevTools port', 20000);
    const tab = await until(async () => {
      const response = await fetch('http://127.0.0.1:' + port + '/json/list');
      const pages = await response.json();
      return pages.find(page => page.type === 'page' && page.webSocketDebuggerUrl);
    }, 'Chrome tab');
    cdp = await openCDP(tab.webSocketDebuggerUrl);
    const send = cdp.send;
    const evaluate = async expression => {
      const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) throw new Error('Browser JS exception: ' + response.exceptionDetails.text);
      return response.result.value;
    };
    await send('Page.enable');
    await send('Runtime.enable');
    const states = [
      {
        tab: 'cart',
        label: 'empty Checkout',
        heading: 'Demo checkout',
        messages: [
          ['#cart > p.muted', 'not a real checkout'],
          ['#cartSummary', 'Demo cart is empty. No order placed.'],
          ['#items > p', 'No order was placed']
        ],
        actions: [
          ['#items [data-cart-browse]', 'Browse demo robots →', true],
          ['#items [data-cart-robots]', 'Open My Robots (demo profiles) →. No order is placed and no device is connected.', true]
        ]
      },
      {
        tab: 'robots',
        label: 'empty My Robots',
        heading: 'My Robots',
        messages: [
          ['#robots > p.muted', 'does not verify ownership or connect hardware'],
          ['#myrobots > p:first-of-type', 'No demo robots added yet.'],
          ['#myrobots > p.hint', 'verifies ownership, compatibility, or connects a device']
        ],
        actions: [
          ['#openDiscoverFromRobots', 'Explore robot concepts →', true],
          ['#openSkillsFromRobots', 'Explore skill previews →', true],
          ['#myrobots .next-step', 'Explore robot concepts →', false]
        ]
      },
      {
        tab: 'skills',
        label: 'Skills with no demo profile',
        heading: 'Skills',
        messages: [
          ['#skills > p.muted', 'installation is unavailable'],
          ['#skillsRobotSummary', 'No demo robot profiles saved']
        ],
        actions: [
          ['#openServicesFromSkills', 'Explore service previews →', true],
          ['#openRobotsFromSkills', 'Manage demo robots →', true]
        ]
      },
      {
        tab: 'services',
        label: 'Services with no demo profile',
        heading: 'Services',
        messages: [
          ['#services > p.muted', 'No bookings, service requests or payments are available'],
          ['#serviceRobotContext', 'compatibility are unverified']
        ],
        actions: [
          ['#openSkillsFromServices', 'Explore generic skill previews →', true],
          ['#openRobotsFromServices', 'Manage demo robots →', true]
        ]
      }
    ];
    const forbidden = /buy now|place order|payment method|card number|connect your robot|verified compatible|compatibility is verified|book a service|install now/i;
    const headingSelector = { cart: '#cart h2', robots: '#robots h2', skills: '#skills h2', services: '#services h2' };
    const measure = spec => evaluate(`(() => {
      window.scrollTo(0, 0);
      const text = value => (value || '').replace(/\\s+/g, ' ').trim();
      const navBox = () => document.querySelector('.tabs').getBoundingClientRect();
      const piece = selector => {
        const el = document.querySelector(selector);
        if (!el || el.hidden || getComputedStyle(el).display === 'none') return null;
        const rect = el.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el);
        const lines = [...range.getClientRects()].filter(line => line.width > 0.5 || line.height > 0.5).map(line => ({
          left: line.left, right: line.right, top: line.top, bottom: line.bottom
        }));
        const parent = el.parentElement.getBoundingClientRect();
        return {
          text: text(el.innerText || el.textContent),
          name: text(el.getAttribute('aria-label') || el.innerText || el.textContent),
          disabled: Boolean(el.disabled),
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
          right: rect.right,
          gap: navBox().top - rect.bottom,
          scrollGap: el.scrollWidth - el.clientWidth,
          parentLeft: parent.left,
          parentRight: parent.right,
          lines
        };
      };
      const reach = selector => {
        const el = document.querySelector(selector);
        window.scrollTo(0, 0);
        let rect = el.getBoundingClientRect();
        let overlap = rect.bottom - navBox().top;
        if (overlap > 0) window.scrollBy(0, Math.ceil(overlap));
        rect = el.getBoundingClientRect();
        overlap = rect.bottom - navBox().top;
        if (overlap > 0) window.scrollBy(0, Math.ceil(overlap));
        rect = el.getBoundingClientRect();
        const bar = navBox();
        const result = { top: rect.top, gap: bar.top - rect.bottom, scrollY: window.scrollY, width: rect.width, height: rect.height };
        window.scrollTo(0, 0);
        return result;
      };
      const spec = ${JSON.stringify({
        heading: headingSelector[spec.tab],
        messages: spec.messages.map(([selector]) => selector),
        actions: spec.actions.map(([selector]) => selector)
      })};
      return {
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
        width: window.innerWidth,
        scrollY: window.scrollY,
        navTop: navBox().top,
        count: document.querySelector('#count').textContent,
        heading: piece(spec.heading),
        messages: spec.messages.map(piece),
        actions: spec.actions.map(selector => ({ box: piece(selector), reached: reach(selector) }))
      };
    })()`);
    const assertInside = (box, label, width) => {
      assert.ok(box, label + ' is missing');
      assert.ok(box.left >= -1 && box.right <= width + 1, label + ' leaves the viewport at ' + box.right.toFixed(1) + 'px');
      assert.ok(box.left >= box.parentLeft - 1 && box.right <= box.parentRight + 1, label + ' leaves its box at ' + box.right.toFixed(1) + 'px');
      assert.ok(box.scrollGap <= 1, label + ' clips text by ' + box.scrollGap.toFixed(1) + 'px');
      assert.ok(box.lines.length > 0, label + ' has no text');
      for (const line of box.lines) {
        assert.ok(line.left >= box.left - 1 && line.right <= box.right + 1, label + ' text runs to ' + line.right.toFixed(1) + 'px');
        assert.ok(line.top >= box.top - 1 && line.bottom <= box.top + box.height + 1, label + ' text leaves its box vertically');
      }
    };
    const openWidth = async (width, height) => {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await evaluate("document.querySelector('[data-tab=store]').click()");
      await until(() => evaluate('window.innerWidth === ' + width + ' && document.querySelector("#store").hidden === false && document.querySelector("#count").textContent === "0"'), width + ' Discover');
      for (const spec of states) {
        await evaluate('document.querySelector("[data-tab=' + spec.tab + ']").click()');
        await until(() => evaluate('document.querySelector("#' + spec.tab + '").hidden === false'), spec.label);
        await evaluate('window.scrollTo(0, 0)');
        const layout = await measure(spec);
        assert.equal(layout.overflow, 0, width + ' ' + spec.label + ' overflows horizontally by ' + layout.overflow + 'px');
        assert.equal(layout.scrollY, 0, width + ' ' + spec.label + ' must be measured on first paint');
        assert.equal(layout.width, width, spec.label + ' viewport');
        assert.equal(layout.count, '0', spec.label + ' cart');
        assert.equal(layout.heading.text, spec.heading, spec.label + ' heading');
        assertInside(layout.heading, width + ' ' + spec.label + ' heading', width);
        assert.equal(layout.messages.length, spec.messages.length, spec.label + ' messages');
        layout.messages.forEach((message, index) => {
          const [selector, expected] = spec.messages[index];
          const where = width + ' ' + spec.label + ' ' + selector;
          assert.ok(message, where + ' missing');
          assert.ok(message.text.includes(expected), where + ' text was ' + message.text);
          assertInside(message, where, width);
        });
        assert.equal(layout.actions.length, spec.actions.length, spec.label + ' actions');
        layout.actions.forEach((action, index) => {
          const [selector, name, firstPaintAt390] = spec.actions[index];
          const where = width + ' ' + spec.label + ' ' + selector;
          assert.ok(action.box, where + ' missing');
          assert.equal(action.box.disabled, false, where + ' is disabled');
          assert.equal(action.box.name, name, where + ' accessible name');
          assertInside(action.box, where, width);
          assert.ok(action.box.width >= 44 && action.box.height >= 44, where + ' tap target is ' + action.box.width.toFixed(1) + 'x' + action.box.height.toFixed(1));
          const onFirstPaint = action.box.top >= 0 && action.box.gap >= 0;
          const reached = action.reached.top >= 0 && action.reached.gap >= 0 && action.reached.width >= 44 && action.reached.height >= 44;
          assert.ok(onFirstPaint || reached, where + ' is not above the bottom nav on first paint (gap ' + action.box.gap.toFixed(1) + 'px) or after scrolling (gap ' + action.reached.gap.toFixed(1) + 'px, top ' + action.reached.top.toFixed(1) + 'px)');
          if (width === 390 && firstPaintAt390) {
            assert.ok(onFirstPaint, where + ' regressed below the bottom nav at 390px by ' + (-action.box.gap).toFixed(1) + 'px');
          }
        });
        const copy = [layout.heading.text, ...layout.messages.map(message => message.text), ...layout.actions.map(action => action.box.name)].join(' ');
        assert.doesNotMatch(copy, forbidden, spec.label + ' implies a real purchase, connection, or verified compatibility');
        await evaluate("document.querySelector('[data-tab=store]').click()");
        await until(() => evaluate('document.querySelector("#store").hidden === false'), 'Discover between empty states');
      }
    };

    await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/consumer.html' });
    await until(() => evaluate("document.querySelector('#products [data-add]') !== null && document.querySelector('#count').textContent === '0'"), 'Discover ready with an empty demo cart');
    await openWidth(320, 640);
    await openWidth(390, 844);
  } finally {
    cdp?.socket.close();
    if (chrome && chrome.exitCode === null) {
      const exited = new Promise(resolve => chrome.once('exit', resolve));
      chrome.kill();
      await Promise.race([exited, sleep(1500)]);
    }
    await new Promise(resolve => server.close(resolve));
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (error) {
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
      console.warn('Chrome temporary profile cleanup deferred:', error.code);
    }
  }
});

test('filled Checkout, My Robots, Skills, and Services stay inside 320 and 390 phone widths', { timeout: 60000 }, async () => {
  const root = process.cwd();
  const assets = {
    '/consumer.html': { file: join(root, 'consumer.html'), type: 'text/html; charset=utf-8' },
    '/assets/botket-logo.svg': { file: join(root, 'assets/botket-logo.svg'), type: 'image/svg+xml' }
  };
  const server = createServer((request, response) => {
    const asset = assets[request.url?.split('?')[0]];
    if (!asset) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': asset.type });
    response.end(readFileSync(asset.file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const dir = mkdtempSync(join(tmpdir(), 'botket-filled-'));
  let chrome, cdp;
  try {
    chrome = spawn(browserBinary(), [
      '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--remote-allow-origins=*', '--remote-debugging-port=0',
      '--user-data-dir=' + dir, 'about:blank'
    ], { stdio: 'ignore' });
    const portFile = join(dir, 'DevToolsActivePort');
    const port = await until(() => {
      if (chrome.exitCode !== null) throw new Error('Chrome exited before debugging started.');
      return existsSync(portFile) && Number(readFileSync(portFile, 'utf8').split('\n')[0]);
    }, 'Chrome DevTools port', 20000);
    const tab = await until(async () => {
      const response = await fetch('http://127.0.0.1:' + port + '/json/list');
      const pages = await response.json();
      return pages.find(page => page.type === 'page' && page.webSocketDebuggerUrl);
    }, 'Chrome tab');
    cdp = await openCDP(tab.webSocketDebuggerUrl);
    const send = cdp.send;
    const evaluate = async expression => {
      const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) {
        const detail = response.exceptionDetails;
        throw new Error('Browser JS exception: ' + detail.text + ' ' + (detail.exception?.description || ''));
      }
      return response.result.value;
    };
    await send('Page.enable');
    await send('Runtime.enable');
    const forbidden = /buy now|place order|payment method|card number|connect your robot|verified compatible|compatibility is verified|book a service|install now/i;
    const measure = `(() => {
      window.scrollTo(0, 0);
      const text = value => (value || '').replace(/\\s+/g, ' ').trim();
      const navBar = () => document.querySelector('.tabs').getBoundingClientRect();
      const visible = el => {
        if (!el || el.hidden || el.closest('[hidden]')) return false;
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && (el.getBoundingClientRect().width > 0 || el.getBoundingClientRect().height > 0);
      };
      const linesOf = el => {
        try {
          const range = document.createRange();
          range.selectNodeContents(el);
          return [...range.getClientRects()].filter(line => line.width > 0.5 && line.height > 0.5).map(line => ({
            left: line.left, right: line.right, top: line.top, bottom: line.bottom
          }));
        } catch { return []; }
      };
      const accessibleName = el => {
        const explicit = text(el.getAttribute('aria-label'));
        if (explicit) return explicit;
        if (el.labels && el.labels.length) {
          const fromLabel = text([...el.labels].map(label => [...label.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join(' ')).join(' '));
          if (fromLabel) return fromLabel;
        }
        return text(el.innerText || el.textContent || el.getAttribute('title') || el.getAttribute('alt') || '');
      };
      const boxOf = el => {
        const rect = el.getBoundingClientRect();
        const parent = el.parentElement ? el.parentElement.getBoundingClientRect() : rect;
        return {
          text: text(el.innerText || el.textContent || '').slice(0, 180),
          left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
          width: rect.width, height: rect.height,
          gap: navBar().top - rect.bottom,
          parentLeft: parent.left, parentRight: parent.right, parentTop: parent.top, parentBottom: parent.bottom,
          scrollGap: el.scrollWidth - el.clientWidth,
          lines: linesOf(el)
        };
      };
      const reach = el => {
        window.scrollTo(0, 0);
        let rect = el.getBoundingClientRect();
        let overlap = rect.bottom - navBar().top;
        if (overlap > 0) window.scrollBy(0, Math.ceil(overlap));
        rect = el.getBoundingClientRect();
        overlap = rect.bottom - navBar().top;
        if (overlap > 0) window.scrollBy(0, Math.ceil(overlap));
        rect = el.getBoundingClientRect();
        const bar = navBar();
        const result = { top: rect.top, gap: bar.top - rect.bottom, width: rect.width, height: rect.height };
        window.scrollTo(0, 0);
        return result;
      };
      const section = [...document.querySelectorAll('main section')].find(node => !node.hidden);
      const textSelector = 'h2, h3, #cartSummary, .cart-row span, #total, #result, #robotMessage, #profileCount, #profileSearchSummary, #skillsRobotSummary, #serviceRobotContext, #myrobots .status, #myrobots p, #skillcards p, #servicecards p';
      const textEls = [...new Set([document.querySelector('main > h1'), ...section.querySelectorAll(textSelector)].filter(visible))];
      const controlEls = [...section.querySelectorAll('button, a[href], input, select, textarea')].filter(visible);
      const navEls = [...document.querySelectorAll('.tabs button')].filter(visible);
      const footerEls = [...document.querySelectorAll('footer a')].filter(visible);
      const described = controlEls.map(el => ({ el, box: boxOf(el), name: accessibleName(el), reached: reach(el) }));
      const painted = textEls.map(el => ({ el, box: boxOf(el) }));
      const overlapEntries = [
        ...painted.map(entry => ({ el: entry.el, text: entry.box.text, lines: entry.box.lines })),
        ...described.filter(entry => entry.el.matches('button, a[href]')).map(entry => ({ el: entry.el, text: entry.name, lines: entry.box.lines }))
      ];
      const overlaps = [];
      for (let i = 0; i < overlapEntries.length; i++) {
        for (let j = i + 1; j < overlapEntries.length; j++) {
          const a = overlapEntries[i], b = overlapEntries[j];
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          for (const la of a.lines) for (const lb of b.lines) {
            const x = Math.min(la.right, lb.right) - Math.max(la.left, lb.left);
            const y = Math.min(la.bottom, lb.bottom) - Math.max(la.top, lb.top);
            if (x > 2 && y > 8) overlaps.push({ a: a.text.slice(0, 60), b: b.text.slice(0, 60), x: Math.round(x), y: Math.round(y) });
          }
        }
      }
      return {
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
        width: window.innerWidth,
        scrollY: window.scrollY,
        section: section.id,
        count: document.querySelector('#count').textContent,
        navTop: navBar().top,
        copy: text(section.innerText),
        h1: boxOf(document.querySelector('main > h1')),
        heading: boxOf(section.querySelector('h2')),
        texts: painted.map(entry => entry.box),
        controls: described.map(entry => ({ id: entry.el.id, disabled: Boolean(entry.el.disabled), name: entry.name, reached: entry.reached, ...entry.box })),
        nav: navEls.map(el => ({ ...boxOf(el), name: accessibleName(el) })),
        footer: footerEls.map(el => ({ ...boxOf(el), name: accessibleName(el), reached: reach(el) })),
        overlaps: overlaps.slice(0, 8)
      };
    })()`;
    const round = value => Math.round(value * 10) / 10;
    const assertInside = (box, label, width) => {
      assert.ok(box, label + ' is missing');
      assert.ok(box.left >= -1 && box.right <= width + 1, label + ' leaves the viewport at ' + round(box.right) + 'px');
      assert.ok(box.left >= box.parentLeft - 1 && box.right <= box.parentRight + 1, label + ' leaves its box (' + round(box.left) + '..' + round(box.right) + ' vs ' + round(box.parentLeft) + '..' + round(box.parentRight) + ')');
      assert.ok(box.scrollGap <= 1, label + ' clips text by ' + round(box.scrollGap) + 'px');
      assert.ok(box.lines.length > 0, label + ' has no text');
      for (const line of box.lines) {
        assert.ok(line.left >= box.left - 1 && line.right <= box.right + 1, label + ' text runs to ' + round(line.right) + 'px outside ' + round(box.right) + 'px');
        assert.ok(line.top >= box.top - 4 && line.bottom <= box.bottom + 4, label + ' text leaves its box vertically (' + round(line.top) + '..' + round(line.bottom) + ' vs ' + round(box.top) + '..' + round(box.bottom) + ')');
      }
    };
    const assertControl = (control, label, width) => {
      assert.ok(control.name.length > 0, label + ' has an empty accessible name');
      assert.ok(control.width >= 44 && control.height >= 44, label + ' tap target is ' + round(control.width) + 'x' + round(control.height));
      assert.ok(control.left >= -1 && control.right <= width + 1, label + ' leaves the viewport at ' + round(control.right) + 'px');
      assert.ok(control.left >= control.parentLeft - 1 && control.right <= control.parentRight + 1, label + ' leaves its box');
      if (control.lines.length) {
        assert.ok(control.scrollGap <= 1, label + ' clips text by ' + round(control.scrollGap) + 'px');
        for (const line of control.lines) {
          assert.ok(line.left >= control.left - 1 && line.right <= control.right + 1, label + ' text runs to ' + round(line.right) + 'px');
          assert.ok(line.top >= control.top - 4 && line.bottom <= control.bottom + 4, label + ' text leaves its box vertically (' + round(line.top) + '..' + round(line.bottom) + ' vs ' + round(control.top) + '..' + round(control.bottom) + ')');
        }
      }
      const onFirstPaint = control.top >= -0.5 && control.gap >= -0.5;
      const reached = control.reached.top >= -0.5 && control.reached.gap >= -0.5 && control.reached.width >= 44 && control.reached.height >= 44;
      assert.ok(onFirstPaint || reached, label + ' is not above the bottom nav on first paint (gap ' + round(control.gap) + 'px) or after scrolling (gap ' + round(control.reached.gap) + 'px, top ' + round(control.reached.top) + 'px)');
      return onFirstPaint;
    };
    const audit = async (label, expects) => {
      await evaluate('window.scrollTo(0, 0)');
      const layout = await evaluate(measure);
      assert.equal(layout.overflow, 0, label + ' overflows horizontally by ' + layout.overflow + 'px');
      assert.equal(layout.scrollY, 0, label + ' must be measured on first paint');
      assert.equal(layout.section, expects.section, label);
      assert.equal(layout.heading.text, expects.heading, label + ' heading');
      assert.ok(layout.heading.top >= -0.5 && layout.heading.bottom <= layout.navTop + 0.5, label + ' heading is not fully above the bottom nav');
      assertInside(layout.h1, label + ' page heading', layout.width);
      assertInside(layout.heading, label + ' heading', layout.width);
      for (const item of layout.texts) {
        if (!item.text) continue;
        assertInside(item, label + ' item "' + item.text.slice(0, 70) + '"', layout.width);
      }
      assert.equal(layout.overlaps.length, 0, label + ' text overlaps: ' + JSON.stringify(layout.overlaps));
      assert.ok(layout.controls.length >= expects.minControls, label + ' controls');
      for (const control of layout.controls) assertControl(control, label + ' ' + (control.id || control.name.slice(0, 70)), layout.width);
      for (const control of layout.nav) {
        const where = label + ' nav ' + control.name;
        assert.ok(control.name.length > 0, where + ' has an empty accessible name');
        assert.ok(control.width >= 44 && control.height >= 44, where + ' tap target is ' + round(control.width) + 'x' + round(control.height));
        assertInside(control, where, layout.width);
      }
      for (const control of layout.footer) {
        assertControl(control, label + ' footer ' + control.name, layout.width);
        assertInside(control, label + ' footer ' + control.name, layout.width);
      }
      if (expects.firstPaint) {
        for (const name of expects.firstPaint) {
          assert.ok(layout.controls.some(control => control.name.includes(name) && control.top >= -0.5 && control.gap >= -0.5), label + ' lost the 390px first-paint action "' + name + '"');
        }
      }
      assert.doesNotMatch(layout.copy + ' ' + layout.controls.map(control => control.name).join(' '), forbidden, label + ' implies a real purchase, connection, or verified compatibility');
      for (const phrase of expects.phrases) assert.ok(layout.copy.includes(phrase) || layout.controls.some(control => control.name.includes(phrase)), label + ' missing demo copy: ' + phrase);
      console.log('MEASURE ' + label + ' overflow=' + layout.overflow + ' ' + layout.controls.map(control => (control.id || control.name.slice(0, 42)) + ' ' + round(control.width) + 'x' + round(control.height) + ' gap=' + round(control.gap) + ' reach=' + round(control.reached.gap)).join(' | '));
      return layout;
    };

    const runJourney = async (width, height) => {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/consumer.html' });
      await until(() => evaluate('window.innerWidth === ' + width + ' && document.querySelector("#products [data-add]") !== null'), width + ' page ready');
      await evaluate("localStorage.clear()");
      await send('Page.reload', { ignoreCache: true });
      await until(() => evaluate('window.innerWidth === ' + width + ' && document.querySelector("#products [data-add]") !== null && document.querySelector("#count").textContent === "0" && document.querySelector("#profileCount").textContent.startsWith("0 of 30")'), width + ' fresh demo');
      const at = label => width + 'x' + height + ' ' + label;
      const keep390 = names => width === 390 ? names : null;

      await evaluate("document.querySelector('#products [data-add]').click()");
      await until(() => evaluate("document.querySelector('#cart').hidden === false && document.querySelector('#count').textContent === '1'"), 'one demo robot in checkout');
      const checkoutOne = await audit(at('checkout-1'), {
        section: 'cart',
        heading: 'Demo checkout',
        minControls: 5,
        firstPaint: keep390(['Remove robot concept', 'Continue browsing robot concepts', 'Clear all 1 demo cart item']),
        phrases: ['not a real checkout', 'no order placed', 'demo only', 'No order was placed']
      });

      await evaluate("document.querySelector('[data-tab=store]').click()");
      await until(() => evaluate("document.querySelector('#store').hidden === false && document.querySelector('#reviewDiscoverCart').hidden === false && document.querySelector('#products [data-add]:not([disabled])') !== null"), 'Discover shows the first concept in the demo cart');
      await evaluate("document.querySelector('#products [data-add]:not([disabled])').click()");
      await until(() => evaluate("document.querySelector('#cart').hidden === false && document.querySelector('#count').textContent === '2' && document.querySelectorAll('#items [data-cart-remove]').length === 2"), 'two demo robots in checkout');
      await audit(at('checkout-2'), {
        section: 'cart',
        heading: 'Demo checkout',
        minControls: 6,
        firstPaint: keep390(['Remove robot concept']),
        phrases: ['not a real checkout', 'robot concept(s)', 'Illustrative prices only', 'demo only']
      });

      await evaluate("document.querySelector('#name').value='Demo nick'; document.querySelector('#name').dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#preview').click()");
      await until(() => evaluate("document.querySelector('#clearPreviewName').hidden === false && document.querySelector('#checkoutToRobots').hidden === false"), 'preview nickname and My Robots handoff shown');
      const preview = await audit(at('checkout-preview'), {
        section: 'cart',
        heading: 'Demo checkout',
        minControls: 7,
        firstPaint: null,
        phrases: ['No payment or order submission occurred', 'not a real checkout']
      });
      assert.ok(preview.controls.some(control => control.id === 'name' && control.height >= 44), 'Preview nickname is below 44px');
      assert.ok(preview.controls.some(control => control.id === 'clearPreviewName' && control.name === 'Clear checkout preview nickname' && control.height >= 44), 'Clear preview name is below 44px or unnamed');
      assert.ok(preview.controls.some(control => control.id === 'checkoutToRobots' && control.name === 'Continue to My Robots (demo) →'), 'Missing demo My Robots handoff');

      await evaluate("document.querySelector('#checkoutToRobots').click()");
      await until(() => evaluate("document.querySelector('#robots').hidden === false"), 'My Robots opened from checkout');
      assert.match(await evaluate("document.querySelector('#robotMessage').textContent"), /does not confirm purchase/);
      await evaluate("document.querySelector('#robotNickname').value='Home helper'; document.querySelector('#robotBrand').value='Example Robotics'; document.querySelector('#robotModel').value='Model A'; document.querySelector('#registerRobot').requestSubmit()");
      await until(() => evaluate("document.querySelector('#profileCount').textContent.includes('1 of 30') && document.querySelector('#myrobots h3') !== null"), 'demo profile saved');
      await audit(at('robots'), {
        section: 'robots',
        heading: 'My Robots',
        minControls: 8,
        firstPaint: keep390(['Explore skill previews']),
        phrases: ['does not verify ownership or connect hardware', 'Compatibility not verified', 'Not connected', 'Home helper', 'Example Robotics']
      });

      await evaluate("document.querySelector('#openSkillsFromRobots').click()");
      await until(() => evaluate("document.querySelector('#skills').hidden === false && document.querySelector('#skillsRobotSummary').textContent.includes('Home helper')"), 'Skills opened with the demo profile');
      const skills = await audit(at('skills'), {
        section: 'skills',
        heading: 'Skills',
        minControls: 6,
        firstPaint: keep390(['Explore service previews', 'Preview for demo profile', 'Manage demo robots']),
        phrases: ['installation is unavailable', 'Compatibility has not been checked', 'Home helper', 'Example Robotics', 'Model A']
      });
      assert.ok(skills.controls.some(control => control.id === 'reviewSkillsCart' && control.height >= 44 && control.name.includes('Review demo cart')), 'Skills review action is below 44px');
      assert.ok(skills.controls.some(control => control.name.includes('Install unavailable') && control.name.includes('compatibility not verified') && control.disabled), 'Install preview is missing its demo-only name');

      await evaluate("document.querySelector('#openServicesFromSkills').click()");
      await until(() => evaluate("document.querySelector('#services').hidden === false && document.querySelector('#serviceRobotContext').textContent.includes('Home helper')"), 'Services opened with the demo profile');
      const services = await audit(at('services'), {
        section: 'services',
        heading: 'Services',
        minControls: 6,
        firstPaint: keep390(['Preview for demo profile', 'Explore generic skill previews', 'Manage demo robots']),
        phrases: ['No bookings', 'eligibility and compatibility are unverified', 'no booking is available', 'Home helper']
      });
      assert.ok(services.controls.some(control => control.id === 'reviewServicesCart' && control.height >= 44 && control.name.includes('Review demo cart')), 'Services review action is below 44px');
      assert.equal(services.controls.filter(control => control.name.includes('no booking') && !control.disabled).length, 2, 'Both demo service actions should stay available');
      const order = await evaluate(`(() => {
        const preview = document.querySelector('#preview');
        const hint = document.querySelector('#previewNameHint');
        const button = document.querySelector('#servicecards .preview-list-card button');
        const detail = button.closest('article').querySelector('p.muted');
        const following = Node.DOCUMENT_POSITION_FOLLOWING;
        return {
          previewAfterHint: Boolean(hint.compareDocumentPosition(preview) & following),
          buttonAfterDetail: Boolean(detail.compareDocumentPosition(button) & following),
          narrowClass: document.querySelector('#cart > .card').classList.contains('narrow-preview-first'),
          hint: hint.textContent,
          detail: detail.textContent,
          context: document.querySelector('#serviceRobotContext').textContent
        };
      })()`);
      assert.match(order.hint, /use a nickname rather than your real name/);
      assert.match(order.hint, /no order or personal details are submitted/);
      assert.match(order.detail, /no technician is assigned or appointment booked/);
      assert.match(order.context, /eligibility and compatibility are unverified/);
      assert.match(order.context, /no booking is available/);
      const previewControl = checkoutOne.controls.find(control => control.id === 'preview');
      const addService = services.controls.find(control => control.name.includes('Add Robot Setup'));
      if (width === 390) {
        assert.equal(order.previewAfterHint, true, '390px moved Preview order ahead of the nickname hint');
        assert.equal(order.buttonAfterDetail, true, '390px moved Add demo service ahead of the service detail');
        assert.equal(order.narrowClass, false, '390px applied the narrow checkout layout');
        assert.ok(previewControl.gap < 0 && previewControl.reached.gap >= -1, '390px Preview order must remain reachable below the fold; gap ' + previewControl.gap.toFixed(1));
        assert.ok(previewControl.width < 160 && previewControl.height >= 44, '390px Preview order size changed to ' + previewControl.width.toFixed(1) + 'x' + previewControl.height.toFixed(1));
        assert.ok(addService.gap < 0 && addService.reached.gap >= -1, '390px Add demo service must remain reachable below the fold; gap ' + addService.gap.toFixed(1));
        assert.ok(addService.width < 180 && addService.height >= 44, '390px Add demo service size changed to ' + addService.width.toFixed(1) + 'x' + addService.height.toFixed(1));
      } else {
        assert.equal(order.previewAfterHint, false, '320px left Preview order after the nickname hint');
        assert.equal(order.buttonAfterDetail, false, '320px left Add demo service after the service detail');
        assert.equal(order.narrowClass, true, '320px did not mark the filled checkout card');
      }
    };

    await runJourney(320, 640);
    await runJourney(390, 844);
  } finally {
    cdp?.socket.close();
    if (chrome && chrome.exitCode === null) {
      const exited = new Promise(resolve => chrome.once('exit', resolve));
      chrome.kill();
      await Promise.race([exited, sleep(1500)]);
    }
    await new Promise(resolve => server.close(resolve));
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (error) {
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
      console.warn('Chrome temporary profile cleanup deferred:', error.code);
    }
  }
});

test('320px section handoffs start at the heading and keep the next demo action above the bottom nav', { timeout: 60000 }, async () => {
  const root = process.cwd();
  const assets = {
    '/consumer.html': { file: join(root, 'consumer.html'), type: 'text/html; charset=utf-8' },
    '/assets/botket-logo.svg': { file: join(root, 'assets/botket-logo.svg'), type: 'image/svg+xml' }
  };
  const server = createServer((request, response) => {
    const asset = assets[request.url?.split('?')[0]];
    if (!asset) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': asset.type });
    response.end(readFileSync(asset.file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const dir = mkdtempSync(join(tmpdir(), 'botket-320-handoff-'));
  let chrome, cdp;
  try {
    chrome = spawn(browserBinary(), [
      '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--remote-allow-origins=*', '--remote-debugging-port=0',
      '--user-data-dir=' + dir, 'about:blank'
    ], { stdio: 'ignore' });
    const portFile = join(dir, 'DevToolsActivePort');
    const port = await until(() => {
      if (chrome.exitCode !== null) throw new Error('Chrome exited before debugging started.');
      return existsSync(portFile) && Number(readFileSync(portFile, 'utf8').split('\n')[0]);
    }, 'Chrome DevTools port', 20000);
    const tab = await until(async () => {
      const response = await fetch('http://127.0.0.1:' + port + '/json/list');
      const pages = await response.json();
      return pages.find(page => page.type === 'page' && page.webSocketDebuggerUrl);
    }, 'Chrome tab');
    cdp = await openCDP(tab.webSocketDebuggerUrl);
    const send = cdp.send;
    const evaluate = async expression => {
      const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) throw new Error('Browser JS exception: ' + response.exceptionDetails.text);
      return response.result.value;
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/consumer.html' });
    await until(() => evaluate("document.querySelector('#products [data-add]') !== null && window.innerWidth === 320 && matchMedia('(prefers-reduced-motion: reduce)').matches"), 'Discover ready at 320px');

    const handoff = async (selector, destination, label, visible, reachable = [], arrival = []) => {
      const measured = await evaluate(`(() => {
        const text = value => (value || '').replace(/\\s+/g, ' ').trim();
        const nameOf = el => text(el.getAttribute('aria-label') || el.innerText || el.textContent);
        const navBox = () => document.querySelector('.tabs').getBoundingClientRect();
        const describe = el => {
          if (!el || el.hidden || getComputedStyle(el).display === 'none' || !el.getClientRects().length) return null;
          const box = el.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(el);
          const lines = [...range.getClientRects()].filter(line => line.width > 0.5 && line.height > 0.5).map(line => ({
            left: line.left, right: line.right, top: line.top, bottom: line.bottom
          }));
          return {
            name: nameOf(el),
            top: box.top,
            bottom: box.bottom,
            height: box.height,
            width: box.width,
            left: box.left,
            right: box.right,
            gap: navBox().top - box.bottom,
            scrollGap: el.scrollWidth - el.clientWidth,
            lines
          };
        };
        const reach = selector => {
          const el = document.querySelector(selector);
          if (!describe(el)) return null;
          let overlap = describe(el).bottom - navBox().top;
          if (overlap > 0) window.scrollBy(0, Math.ceil(overlap));
          overlap = describe(el).bottom - navBox().top;
          if (overlap > 0) window.scrollBy(0, Math.ceil(overlap));
          return describe(el);
        };
        window.scrollTo(0, document.documentElement.scrollHeight);
        const beforeTop = document.querySelector('main section:not([hidden]) h2').getBoundingClientRect().top;
        const control = document.querySelector(${JSON.stringify(selector)});
        if (!control || control.hidden || getComputedStyle(control).display === 'none') return { missing: true };
        control.click();
        const section = [...document.querySelectorAll('main section')].find(node => !node.hidden);
        const heading = section.querySelector('h2');
        const rect = heading.getBoundingClientRect();
        const nav = navBox();
        const active = document.activeElement;
        return {
          beforeTop,
          section: section.id,
          headingTop: rect.top,
          headingBottom: rect.bottom,
          navTop: nav.top,
          scrollY: window.scrollY,
          focused: active === heading,
          focusVisible: active.matches(':focus-visible'),
          overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
          visible: ${JSON.stringify(visible)}.map(item => describe(document.querySelector(item))),
          arrival: ${JSON.stringify(arrival)}.map(item => describe(document.querySelector(item))),
          reached: ${JSON.stringify(reachable)}.map(reach),
          navButtons: [...document.querySelectorAll('.tabs button')].map(describe)
        };
      })()`);
      assert.notEqual(measured.missing, true, label + ' control missing: ' + selector);
      assert.ok(measured.beforeTop < 0, label + ' must start from the bottom of the previous section');
      assert.equal(measured.section, destination, label);
      assert.equal(measured.focused, true, label + ' did not focus the destination heading');
      assert.equal(measured.focusVisible, false, label + ' shows a focus ring after pointer activation');
      assert.ok(measured.headingTop >= 0 && measured.headingBottom <= measured.navTop, label + ' heading is not fully above the bottom nav');
      assert.ok(measured.headingTop < 2 || measured.scrollY === 0, label + ' is scrolled mid-page (scroll ' + measured.scrollY + ', heading ' + measured.headingTop.toFixed(1) + 'px)');
      assert.equal(measured.overflow, 0, label + ' overflows horizontally by ' + measured.overflow + 'px');
      const assertAction = (action, where) => {
        assert.ok(action, where + ' is missing');
        assert.ok(action.name.length > 0, where + ' has no accessible name');
        assert.ok(action.width >= 44 && action.height >= 44, where + ' is ' + action.width.toFixed(1) + 'x' + action.height.toFixed(1));
        assert.ok(action.left >= -1 && action.right <= 321, where + ' leaves the 320px viewport at ' + action.right.toFixed(1));
        assert.ok(action.scrollGap <= 1, where + ' clips its label by ' + action.scrollGap.toFixed(1) + 'px');
        assert.ok(action.top >= -0.5 && action.gap >= -0.5, where + ' is not fully above the bottom nav (top ' + action.top.toFixed(1) + 'px, gap ' + action.gap.toFixed(1) + 'px)');
        for (const line of action.lines) {
          assert.ok(line.left >= action.left - 1 && line.right <= action.right + 1, where + ' text runs to ' + line.right.toFixed(1));
        }
      };
      assert.equal(measured.arrival.length, arrival.length, label + ' arrival actions');
      assert.equal(measured.visible.length, visible.length, label + ' visible actions');
      measured.visible.forEach((action, index) => assertAction(action, label + ' ' + visible[index]));
      assert.equal(measured.reached.length, reachable.length, label + ' reachable actions');
      measured.reached.forEach((action, index) => assertAction(action, label + ' reached ' + reachable[index]));
      assert.equal(measured.navButtons.length, 5, label + ' bottom nav');
      measured.navButtons.forEach(action => {
        const where = label + ' bottom nav ' + (action ? action.name : '');
        assert.ok(action, where + ' is missing');
        assert.ok(action.name.length > 0, where + ' has no accessible name');
        assert.ok(action.width >= 44 && action.height >= 44, where + ' is ' + action.width.toFixed(1) + 'x' + action.height.toFixed(1));
        assert.ok(action.left >= -1 && action.right <= 321 && action.top >= 0 && action.bottom <= 641, where + ' leaves the 320px viewport');
        assert.ok(action.scrollGap <= 1, where + ' clips its label by ' + action.scrollGap.toFixed(1) + 'px');
        for (const line of action.lines) {
          assert.ok(line.left >= action.left - 1 && line.right <= action.right + 1, where + ' text runs to ' + line.right.toFixed(1));
          assert.ok(line.top >= action.top - 1 && line.bottom <= action.bottom + 1, where + ' text leaves the nav button vertically');
        }
      });
      const names = [...measured.visible, ...measured.reached, ...measured.navButtons].map(action => action ? action.name : '').join(' ');
      assert.doesNotMatch(names, /buy now|place order|payment method|card number|connect your robot|verified compatible|book a service|install now/i);
      return measured;
    };

    const checkoutRecovery = ['#items [data-cart-browse]', '#items [data-cart-robots]'];
    const robotHandoffs = ['#openDiscoverFromRobots', '#openSkillsFromRobots'];
    const skillHandoffs = ['#openServicesFromSkills', '#openRobotsFromSkills'];
    const serviceHandoffs = ['#openSkillsFromServices', '#openRobotsFromServices'];
    const discoverHandoffs = ['#products [data-add]', '#products [data-robot]'];

    let landing = await handoff('[data-tab=cart]', 'cart', 'Bottom nav Discover to Checkout', checkoutRecovery, ['#preview']);
    assert.equal(landing.visible[0].name, 'Browse demo robots →');
    assert.equal(landing.visible[1].name, 'Open My Robots (demo profiles) →. No order is placed and no device is connected.');
    assert.equal(landing.reached[0].name, 'Preview order');

    landing = await handoff('[data-tab=robots]', 'robots', 'Bottom nav Checkout to My Robots', robotHandoffs);
    assert.equal(landing.visible[0].name, 'Explore robot concepts →');
    assert.equal(landing.visible[1].name, 'Explore skill previews →');

    landing = await handoff('[data-tab=skills]', 'skills', 'Bottom nav My Robots to Skills', skillHandoffs);
    assert.equal(landing.visible[0].name, 'Explore service previews →');
    assert.equal(landing.visible[1].name, 'Manage demo robots →');

    landing = await handoff('[data-tab=services]', 'services', 'Bottom nav Skills to Services', serviceHandoffs, ['#servicecards [data-add]'], ['#servicecards [data-add]', '#services > p.muted', '#serviceRobotContext', '#servicecards p.muted']);
    assert.equal(landing.visible[0].name, 'Explore generic skill previews →');
    assert.equal(landing.visible[1].name, 'Manage demo robots →');
    assert.equal(landing.reached[0].name, 'Add Robot Setup service preview to demo cart (no booking)');
    assert.equal(landing.arrival[0].name, 'Add Robot Setup service preview to demo cart (no booking)');
    assert.ok(landing.arrival[0].top >= -0.5 && landing.arrival[0].gap >= -0.5, 'Add demo service is below the first 320x640 screen by ' + (-landing.arrival[0].gap).toFixed(1) + 'px');
    assert.ok(landing.arrival[0].height >= 44 && landing.arrival[0].width >= 44, 'Add demo service tap target is ' + landing.arrival[0].width.toFixed(1) + 'x' + landing.arrival[0].height.toFixed(1));
    assert.ok(landing.arrival[1].top >= -0.5 && landing.arrival[1].gap >= -0.5, 'Services demo disclaimer is not fully above the bottom nav');
    assert.match(landing.arrival[1].name, /No bookings, service requests or payments are available/);
    assert.ok(landing.arrival[2].top >= -0.5 && landing.arrival[2].gap >= -0.5, 'Service preview note is not fully above the bottom nav');
    assert.match(landing.arrival[2].name, /eligibility and compatibility are unverified/);
    assert.match(landing.arrival[2].name, /no booking is available/);
    assert.match(landing.arrival[3].name, /no technician is assigned or appointment booked/);
    assert.ok(landing.arrival[3].height >= 48, 'Per-service detail was shortened to ' + landing.arrival[3].height.toFixed(1) + 'px');

    landing = await handoff('[data-tab=store]', 'store', 'Bottom nav Services to Discover', discoverHandoffs);
    assert.equal(landing.visible[0].name, 'Add Home Robot Concept to demo cart (preview only)');
    assert.equal(landing.visible[1].name, 'Create local demo profile for Home Robot Concept (ownership and compatibility not verified)');

    landing = await handoff('#products [data-add]', 'cart', 'Discover add to Checkout', ['#items [data-cart-remove]', '#browseFromCheckout'], ['#preview'], ['#preview', '#cart > p.muted', '#previewNameHint']);
    assert.equal(landing.visible[0].name, 'Remove robot concept Home Robot Concept from demo cart');
    assert.equal(landing.visible[1].name, 'Continue browsing robot concepts →');
    assert.equal(landing.reached[0].name, 'Preview order');
    assert.equal(landing.arrival[0].name, 'Preview order');
    assert.ok(landing.arrival[0].top >= -0.5 && landing.arrival[0].gap >= -0.5, 'Preview order is below the first 320x640 screen by ' + (-landing.arrival[0].gap).toFixed(1) + 'px');
    assert.ok(landing.arrival[0].height >= 44 && landing.arrival[0].width >= 44, 'Preview order tap target is ' + landing.arrival[0].width.toFixed(1) + 'x' + landing.arrival[0].height.toFixed(1));
    assert.ok(landing.arrival[1].top >= -0.5 && landing.arrival[1].gap >= -0.5, 'Checkout demo disclaimer is not fully above the bottom nav');
    assert.match(landing.arrival[1].name, /This is an order preview, not a real checkout\. No payment, reservation or order submission occurs\./);
    assert.match(landing.arrival[2].name, /use a nickname rather than your real name/);
    assert.match(landing.arrival[2].name, /no order or personal details are submitted/);
    assert.ok(landing.arrival[2].height >= 80, 'Checkout nickname hint was shortened to ' + landing.arrival[2].height.toFixed(1) + 'px');

    await evaluate("document.querySelector('#preview').click()");
    landing = await handoff('#checkoutToRobots', 'robots', 'Checkout continue to My Robots', robotHandoffs);
    assert.match(await evaluate("document.querySelector('#robotMessage').textContent"), /does not confirm purchase, ownership, compatibility or hardware connection/);
    assert.equal(landing.visible[1].name, 'Explore skill previews →');

    landing = await handoff('#openSkillsFromRobots', 'skills', 'My Robots explore skill previews', skillHandoffs);
    assert.equal(landing.visible[0].name, 'Explore service previews →');

    landing = await handoff('#openServicesFromSkills', 'services', 'Skills explore service previews', serviceHandoffs, ['#servicecards [data-add]']);
    assert.equal(landing.visible[0].name, 'Explore generic skill previews →');
    assert.match(await evaluate("document.querySelector('#serviceRobotContext').textContent"), /compatibility are unverified/i);

    await evaluate(`(() => {
      document.querySelector('[data-tab=robots]').click();
      document.querySelector('#robotNickname').value = 'Home helper';
      document.querySelector('#robotBrand').value = 'Example Robotics';
      document.querySelector('#robotModel').value = 'Model A';
      document.querySelector('#registerRobot').requestSubmit();
      document.querySelector('[data-tab=cart]').click();
      document.querySelector('#preview').click();
    })()`);
    assert.match(await evaluate("document.querySelector('#profileCount').textContent"), /1 of 30/, 'Filled My Robots handoff needs a saved demo profile');
    landing = await handoff('#checkoutToRobots', 'robots', 'Filled Checkout continue to My Robots', ['#openSkillsFromRobots'], [], ['#openSkillsFromRobots', '#robots > p.muted']);
    assert.equal(await evaluate("document.querySelector('#openDiscoverFromRobots').hidden"), true, 'Filled My Robots hides the empty Discover route');
    assert.equal(landing.visible[0].name, 'Explore skill previews →');
    assert.equal(landing.arrival[0].name, 'Explore skill previews →');
    assert.ok(landing.arrival[0].top >= -0.5 && landing.arrival[0].gap >= -0.5, 'Explore skill previews is below the first 320x640 screen by ' + (-landing.arrival[0].gap).toFixed(1) + 'px');
    assert.ok(landing.arrival[0].height >= 44 && landing.arrival[0].width >= 44, 'Explore skill previews tap target is ' + landing.arrival[0].width.toFixed(1) + 'x' + landing.arrival[0].height.toFixed(1));
    assert.ok(landing.arrival[1].top >= -0.5 && landing.arrival[1].gap >= -0.5, 'My Robots demo disclaimer is not fully above the bottom nav');
    assert.match(landing.arrival[1].name, /does not verify ownership or connect hardware/);
    assert.match(await evaluate("document.querySelector('#robotMessage').textContent"), /does not confirm purchase, ownership, compatibility or hardware connection/);
    assert.equal(landing.overflow, 0, 'Filled My Robots overflows horizontally by ' + landing.overflow + 'px');

    landing = await handoff('#openSkillsFromRobots', 'skills', 'Filled My Robots explore skill previews', skillHandoffs, [], ['#openServicesFromSkills', '#skills > p.muted', '#skillsRobotSummary']);
    assert.equal(landing.visible[0].name, 'Explore service previews →');
    assert.equal(landing.visible[1].name, 'Manage demo robots →');
    assert.equal(landing.arrival[0].name, 'Explore service previews →');
    assert.ok(landing.arrival[0].top >= -0.5 && landing.arrival[0].gap >= -0.5, 'Explore service previews is below the first 320x640 screen by ' + (-landing.arrival[0].gap).toFixed(1) + 'px');
    assert.ok(landing.arrival[0].height >= 44 && landing.arrival[0].width >= 44, 'Explore service previews tap target is ' + landing.arrival[0].width.toFixed(1) + 'x' + landing.arrival[0].height.toFixed(1));
    assert.ok(landing.arrival[1].top >= -0.5 && landing.arrival[1].gap >= -0.5, 'Skills demo disclaimer is not fully above the bottom nav');
    assert.match(landing.arrival[1].name, /Compatibility is not verified, and installation is unavailable/);
    assert.match(landing.arrival[2].name, /Home helper — Example Robotics/);
    assert.match(landing.arrival[2].name, /Compatibility has not been checked/);
    assert.match(landing.arrival[2].name, /installation is unavailable/);
    assert.equal(landing.overflow, 0, 'Filled Skills overflows horizontally by ' + landing.overflow + 'px');

    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await evaluate("window.scrollTo(0, document.documentElement.scrollHeight); document.querySelector('[data-tab=store]').focus()");
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, text: ' ' });
    await send('Input.dispatchKeyEvent', { type: 'char', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, text: ' ' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
    await sleep(50);
    const keyboard = await evaluate(`(() => {
      const section = [...document.querySelectorAll('main section')].find(node => !node.hidden);
      const heading = section.querySelector('h2');
      const rect = heading.getBoundingClientRect();
      const nav = document.querySelector('.tabs').getBoundingClientRect();
      return {
        section: section.id,
        focused: document.activeElement === heading,
        headingTop: rect.top,
        headingBottom: rect.bottom,
        navTop: nav.top,
        focusVisible: document.activeElement.matches(':focus-visible'),
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth
      };
    })()`);
    assert.equal(keyboard.section, 'store');
    assert.equal(keyboard.focused, true, 'Space on Discover did not focus the heading');
    assert.equal(keyboard.focusVisible, true, 'Keyboard handoff has no visible focus indicator');
    assert.ok(keyboard.headingTop >= 0 && keyboard.headingTop < 2, 'Keyboard heading starts ' + keyboard.headingTop.toFixed(1) + 'px below the top');
    assert.ok(keyboard.headingBottom <= keyboard.navTop);
    assert.equal(keyboard.overflow, 0);
  } finally {
    cdp?.socket.close();
    if (chrome && chrome.exitCode === null) {
      const exited = new Promise(resolve => chrome.once('exit', resolve));
      chrome.kill();
      await Promise.race([exited, sleep(1500)]);
    }
    await new Promise(resolve => server.close(resolve));
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (error) {
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
      console.warn('Chrome temporary profile cleanup deferred:', error.code);
    }
  }
});
