import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const chromeBinary = () => {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  for (const name of ['google-chrome', 'chromium', 'chromium-browser']) {
    const found = spawnSync('which', [name], { encoding: 'utf8' });
    if (found.status === 0) return found.stdout.trim();
  }
  throw new Error('Chrome/Chromium is required for Robot City browser QA');
};
async function waitFor(fn, label, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const result = await fn(); if (result) return result; } catch { /* Browser still loading. */ }
    await sleep(100);
  }
  throw new Error('Timed out waiting for ' + label);
}
async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  return {
    socket,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const next = ++id;
        const timer = setTimeout(() => {
          pending.delete(next);
          reject(new Error('CDP timed out: ' + method));
        }, 12000);
        pending.set(next, { resolve, reject, timer });
        socket.send(JSON.stringify({ id: next, method, params }));
      });
    }
  };
}

test('real headless Chrome verifies Robot City mobile touch and desktop controls', { timeout: 60000 }, async () => {
  const gameHtml = readFileSync(new URL('../robot-city.html', import.meta.url), 'utf8');
  const profile = mkdtempSync(join(tmpdir(), 'botket-robot-city-'));
  let chrome, cdp;
  try {
    chrome = spawn(chromeBinary(), [
      '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
      '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
      '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
    ], { stdio: 'ignore' });
    const portFile = join(profile, 'DevToolsActivePort');
    const port = await waitFor(() => {
      if (chrome.exitCode !== null) throw new Error('Chrome exited before CDP startup');
      return existsSync(portFile) && Number(readFileSync(portFile, 'utf8').split('\n')[0]);
    }, 'Chrome DevTools port');
    const tab = await waitFor(async () => {
      const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      return pages.find(page => page.type === 'page' && page.webSocketDebuggerUrl);
    }, 'Chrome page');
    cdp = await connect(tab.webSocketDebuggerUrl);
    const send = cdp.send;
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true });
      if (result.exceptionDetails) throw new Error('Chrome JS error: ' + result.exceptionDetails.text);
      return result.result.value;
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__robotPose = null;
      window.__robotErrors = [];
      window.addEventListener('error', event => window.__robotErrors.push(event.message));
      const originalTranslate = CanvasRenderingContext2D.prototype.translate;
      CanvasRenderingContext2D.prototype.translate = function(x, y) {
        window.__robotPose = { x, y };
        return originalTranslate.call(this, x, y);
      };
    ` });
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: 'about:blank' });
    await evaluate('document.open(); document.write(atob(' + JSON.stringify(Buffer.from(gameHtml).toString('base64')) + ')); document.close()');
    await waitFor(() => evaluate('document.readyState === "complete" && Boolean(window.__robotPose)'), 'Robot City initial frame');

    const mobile = await evaluate(`(() => ({
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      canvasWidth: document.getElementById('game').getBoundingClientRect().width,
      controls: [...document.querySelectorAll('.controls button')].map(button => ({
        id: button.id, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height
      })),
      score: document.getElementById('score').textContent,
      errors: window.__robotErrors
    }))()`);
    assert.ok(mobile.documentWidth <= mobile.viewport + 1, 'Mobile must not scroll horizontally');
    assert.ok(mobile.canvasWidth <= mobile.viewport, 'Canvas must fit mobile viewport');
    assert.equal(mobile.controls.length, 6);
    for (const button of mobile.controls) {
      assert.ok(button.width >= 44 && button.height >= 44, `${button.id} tap target is too small`);
    }
    assert.equal(mobile.score, 'Score: 0');
    assert.deepEqual(mobile.errors, []);

    const startY = await evaluate('window.__robotPose.y');
    await evaluate(`document.getElementById('forward').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 11, pointerType: 'touch' }))`);
    await sleep(400);
    await evaluate(`document.getElementById('forward').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 11, pointerType: 'touch' }))`);
    const movedY = await evaluate('window.__robotPose.y');
    assert.ok(movedY < startY - 15, `Touch Drive did not move robot (${startY} -> ${movedY})`);
    await sleep(150);
    assert.equal(await evaluate('window.__robotPose.y'), movedY, 'Touch release must stop movement');

    await evaluate(`document.getElementById('back').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 12, pointerType: 'touch' }))`);
    await sleep(250);
    await evaluate(`document.getElementById('back').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 12, pointerType: 'touch' }))`);
    assert.ok(await evaluate('window.__robotPose.y') > movedY + 10, 'Touch Reverse must move robot backward');

    await evaluate(`document.getElementById('reset').click(); document.getElementById('auto').click()`);
    assert.equal(await evaluate('document.getElementById("auto").getAttribute("aria-pressed")'), 'true');
    assert.equal(await evaluate('document.getElementById("mode").textContent'), 'Mode: Scripted AI');
    await evaluate('document.getElementById("reset").click()');
    assert.equal(await evaluate('document.getElementById("auto").getAttribute("aria-pressed")'), 'false');

    await send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 2, mobile: true });
    const tablet = await evaluate(`({ viewport: innerWidth, width: document.documentElement.scrollWidth, canvas: document.getElementById('game').getBoundingClientRect().width })`);
    assert.ok(tablet.width <= tablet.viewport + 1 && tablet.canvas <= tablet.viewport, 'iPad-sized Chrome viewport must fit');

    await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
    const desktop = await evaluate(`({ viewport: innerWidth, width: document.documentElement.scrollWidth })`);
    assert.ok(desktop.width <= desktop.viewport + 1, 'Desktop must not scroll horizontally');
    const desktopStart = await evaluate('window.__robotPose.y');
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true }))`);
    await sleep(350);
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp', bubbles: true }))`);
    assert.ok(await evaluate('window.__robotPose.y') < desktopStart - 15, 'Desktop ArrowUp must move robot');
    assert.deepEqual(await evaluate('window.__robotErrors'), []);

    // Browser-level gameplay acceptance: the scripted route must complete a
    // real pickup and delivery, not merely toggle the mode label.
    await evaluate('document.getElementById("reset").click(); document.getElementById("auto").click()');
    const autoDelivery = await waitFor(async () => {
      const state = await evaluate(`({
        deliveries: document.getElementById('deliveries').textContent,
        score: document.getElementById('score').textContent,
        mode: document.getElementById('mode').textContent,
        errors: window.__robotErrors
      })`);
      return state.deliveries === 'Deliveries: 1' ? state : null;
    }, 'scripted AI delivery in real Chrome', 25000);
    assert.equal(autoDelivery.score, 'Score: 110', 'One scripted delivery must award 110 points');
    assert.equal(autoDelivery.mode, 'Mode: Scripted AI');
    assert.deepEqual(autoDelivery.errors, [], 'Scripted delivery must not throw browser errors');
    await evaluate('document.getElementById("reset").click()');
    assert.equal(await evaluate('document.getElementById("score").textContent'), 'Score: 0');
    assert.equal(await evaluate('document.getElementById("deliveries").textContent'), 'Deliveries: 0');
    assert.equal(await evaluate('document.getElementById("mode").textContent'), 'Mode: Manual');
  } finally {
    if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
      const exited = new Promise(resolve => chrome.once('exit', resolve));
      try { cdp?.socket.send(JSON.stringify({ id: 0, method: 'Browser.close' })); } catch {}
      await Promise.race([exited, sleep(1800)]);
      if (chrome.exitCode === null && chrome.signalCode === null) {
        chrome.kill('SIGTERM');
        await Promise.race([exited, sleep(1500)]);
      }
      if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
    }
    cdp?.socket.close();
    rmSync(profile, { recursive: true, force: true, maxRetries: 15, retryDelay: 250 });
  }
});
