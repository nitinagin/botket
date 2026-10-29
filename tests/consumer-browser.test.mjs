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
  const html = readFileSync(join(process.cwd(), 'consumer.html'));
  const server = createServer((request, response) => {
    if (request.url?.split('?')[0] !== '/consumer.html') {
      response.writeHead(404); response.end(); return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
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
    await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/consumer.html' });
    await until(() => evaluate("Boolean(document.querySelector('#products [data-add]'))"), 'Discover concepts rendered');
    assert.equal(await evaluate("document.querySelector('#store').hidden"), false);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.tabs')).position"), 'fixed');

    await evaluate("document.querySelector('#products [data-add]').click()");
    assert.equal(await evaluate("document.querySelector('#cart').hidden"), false);
    assert.equal(await evaluate("document.querySelector('#count').textContent"), '1');
    assert.match(await evaluate("document.querySelector('#result').textContent"), /No order was placed/);

    await evaluate("document.querySelector('#preview').click()");
    assert.match(await evaluate("document.querySelector('#result').textContent"), /No payment or order submission occurred/);
    await evaluate("document.querySelector('#checkoutToRobots').click()");
    assert.equal(await evaluate("document.querySelector('#robots').hidden"), false);
    assert.match(await evaluate("document.querySelector('#robotMessage').textContent"), /does not confirm purchase/);

    await evaluate("document.querySelector('#robotNickname').value='Browser Test Robot'; document.querySelector('#robotBrand').value='Example Maker'; document.querySelector('#robotModel').value='Model A'; document.querySelector('#registerRobot').requestSubmit()");
    assert.match(await evaluate("document.querySelector('#profileCount').textContent"), /1 of 30/);
    assert.match(await evaluate("document.querySelector('#robotMessage').textContent"), /Compatibility not verified/);
    await evaluate("document.querySelector('#openSkillsFromRobots').click()");
    assert.equal(await evaluate("document.querySelector('#skills').hidden"), false);
    assert.match(await evaluate("document.querySelector('#skillsRobotSummary').textContent"), /Compatibility has not been checked/);
    await evaluate("document.querySelector('#openServicesFromSkills').click()");
    assert.equal(await evaluate("document.querySelector('#services').hidden"), false);
    assert.match(await evaluate("document.querySelector('#serviceRobotContext').textContent"), /eligibility and compatibility are unverified/i);
    assert.equal(await evaluate("document.querySelector('#servicecards [data-add]') !== null"), true);
    assert.match(await evaluate("document.querySelector('#services > p.muted').textContent"), /No bookings/);
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
