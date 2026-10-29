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
    assert.match(await evaluate("document.querySelector('#result').textContent"), /No order was placed/);
    assertAboveNav(await measureControls('#items [data-cart-remove], #browseFromCheckout, #clearCart'), 'One-item checkout');

    await evaluate("document.querySelector('[data-tab=store]').click()");
    await until(() => evaluate("document.querySelector('#store').hidden === false && document.querySelector('#reviewDiscoverCart').hidden === false"), 'Discover cart review shown');
    assertReachable(await bringAboveNav('#reviewDiscoverCart'), 'Discover review cart');

    await evaluate("document.querySelector('[data-tab=services]').click()");
    await until(() => evaluate("document.querySelector('#services').hidden === false"), 'Services opened');
    await evaluate("document.querySelector('#servicecards [data-add]').click()");
    await until(() => evaluate("document.querySelector('#count').textContent === '2' && document.querySelector('#cart').hidden === false"), 'Two-item checkout opened');
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

    await evaluate("document.querySelector('#preview').click()");
    assert.match(await evaluate("document.querySelector('#result').textContent"), /No payment or order submission occurred/);
    await evaluate("document.querySelector('#checkoutToRobots').click()");
    assert.equal(await evaluate("document.querySelector('#robots').hidden"), false);
    assert.match(await evaluate("document.querySelector('#robotMessage').textContent"), /does not confirm purchase/);

    await evaluate("document.querySelector('#robotNickname').value='Browser Test Robot'; document.querySelector('#robotBrand').value='Example Maker'; document.querySelector('#robotModel').value='Model A'; document.querySelector('#registerRobot').requestSubmit()");
    assert.match(await evaluate("document.querySelector('#profileCount').textContent"), /1 of 30/);
    assert.match(await evaluate("document.querySelector('#robotMessage').textContent"), /Compatibility not verified/);
    const filledRobots = '#robots #openSkillsFromRobots, #robots #robotNickname, #robots #robotBrand, #robots #robotModel, #robots #saveDemoProfile, #robots #profileSearch, #robots #clearProfiles, #robots #myrobots button, #robots #reviewRobotsCart';
    const savedRobots = await bringAboveNav(filledRobots);
    assert.equal(savedRobots.length, 11, 'Filled My Robots shows the skills handoff, profile form, search, clear, profile actions, and cart review');
    assertReachable(savedRobots, 'Filled My Robots');
    const savedOverflow = await evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth");
    assert.equal(savedOverflow, 0, 'Filled My Robots overflows horizontally by ' + savedOverflow + 'px');
    await evaluate("document.querySelector('#openSkillsFromRobots').click()");
    assert.equal(await evaluate("document.querySelector('#skills').hidden"), false);
    assert.match(await evaluate("document.querySelector('#skillsRobotSummary').textContent"), /Compatibility has not been checked/);
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
    assert.match(await evaluate("document.querySelector('#result').textContent"), /Cart cleared\\. No order was placed/);

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
