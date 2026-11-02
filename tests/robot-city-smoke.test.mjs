import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html = readFileSync(new URL('../robot-city.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
const app = scripts[0]?.[1] ?? '';

test('Robot City has one self-contained, parseable application script', () => {
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Script(app, { filename: 'robot-city.html' }));
});

test('Phase 1 uses a single named canvas arena and visible status', () => {
  assert.match(html, /<canvas id="game" width="960" height="600" aria-label="[^"]+"/);
  assert.match(html, /id="status" role="status"/);
  for (const id of ['score', 'deliveries', 'mode', 'status', 'game', 'left', 'forward', 'back', 'right', 'auto', 'reset']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id);
  assert.equal(new Set(ids).size, ids.length, 'Element IDs must be unique');
});

test('Robot City provides keyboard skip navigation and touch-friendly home access', () => {
  assert.match(html, /class="skip-link" href="#main-content">Skip to main content<\/a>/);
  assert.match(html, /<main id="main-content" tabindex="-1">/);
  assert.match(html, /\.skip-link:focus\{top:8px\}/);
  assert.match(html, /class="home-link" href="index\.html"/);
  assert.match(html, /\.home-link\{[^}]*min-height:44px/);
  assert.match(html, /a:focus-visible,button:focus-visible\{outline:3px solid/);
});

test('keyboard and pointer controls support desktop and tablet', () => {
  assert.match(app, /ArrowUp:'forward'/);
  assert.match(app, /ArrowDown:'back'/);
  assert.match(app, /KeyW:'forward'/);
  assert.match(app, /KeyA:'left'/);
  assert.match(app, /bind\('back','back'\)/);
  assert.match(html, /id="back" aria-label="Reverse"/);
  assert.match(html, /Tablet: hold Drive, Reverse, or Turn controls\./);
  assert.match(app, /pointerdown/);
  assert.match(app, /pointerup/);
  assert.match(app, /pointercancel/);
  assert.match(app, /lostpointercapture/);
  assert.match(app, /window\.addEventListener\('blur'/);
  assert.match(html, /touch-action:none/);
});

test('pickup, delivery, collision penalty and reset are implemented', () => {
  assert.match(app, /const pickup=\{/);
  assert.match(app, /drop=\{/);
  assert.match(app, /carrying=true;autoWaypoint=0;score\+=10/);
  assert.match(app, /deliveries\+\+;score\+=100/);
  assert.match(app, /score=Math\.max\(0,score-1\)/);
  assert.match(app, /function reset\(\)\{robot=\{/);
  assert.match(app, /score=0;deliveries=0;carrying=false;auto=false/);
  assert.match(app, /el\('reset'\)\.addEventListener\('click',reset\)/);
});

test('scripted avoidance is identified as a demo, not trained AI', () => {
  assert.match(app, /if\(auto\)\{const route=carrying\?/);
  assert.match(app, /collision\(nx,ny\)/);
  assert.match(html, /Scripted AI follows fixed waypoints around obstacles in this arena; it is not trained machine learning/);
});

test('prototype has no backend, purchase flow or external dependency', () => {
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=|<iframe\b|<form\b/i);
  assert.doesNotMatch(app, /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|sendBeacon)\b/);
  assert.match(html, /No online scores, prizes, accounts, real robot connection, or marketplace transactions/);
});

test('animation uses bounded delta time', () => {
  assert.match(app, /Math\.min\(\.04,\(t-last\)\/1000\|\|0\)/);
  assert.match(app, /requestAnimationFrame\(frame\)/);
});

test('scripted AI toggle announces its state and reset restores manual mode', () => {
  assert.match(html, /id="auto" aria-pressed="false" aria-label="Toggle scripted AI driving"/);
  assert.match(html, /Basic scripted navigation/);
  const elements = new Map();
  function getElementById(id) {
    if (!elements.has(id)) {
      const handlers = new Map();
      const attrs = new Map();
      elements.set(id, {
        handlers, attrs, textContent: '',
        addEventListener(type, handler) { handlers.set(type, handler); },
        setAttribute(name, value) { attrs.set(name, value); },
        getContext() { return {}; },
      });
    }
    return elements.get(id);
  }
  new Script(app).runInNewContext({
    document: { getElementById },
    window: { addEventListener() {} },
    requestAnimationFrame() {},
  });
  const toggle = getElementById('auto');
  assert.equal(toggle.attrs.get('aria-pressed'), 'false');
  assert.equal(toggle.textContent, 'Scripted AI: Off');
  toggle.handlers.get('click')();
  assert.equal(toggle.attrs.get('aria-pressed'), 'true');
  assert.equal(toggle.textContent, 'Scripted AI: On');
  assert.equal(getElementById('mode').textContent, 'Mode: Scripted AI');
  getElementById('reset').handlers.get('click')();
  assert.equal(toggle.attrs.get('aria-pressed'), 'false');
  assert.equal(toggle.textContent, 'Scripted AI: Off');
  assert.equal(getElementById('mode').textContent, 'Mode: Manual');
});

test('manual driving picks up a parcel, handles an obstacle, and resets', () => {
  const elements = new Map();
  const listeners = new Map();
  const ctx = new Proxy({}, { get: () => () => {} });
  let nextFrame;
  function getElementById(id) {
    if (!elements.has(id)) {
      const handlers = new Map();
      elements.set(id, {
        width: 960, height: 600, textContent: '', handlers,
        getContext: () => ctx,
        addEventListener(type, fn) { handlers.set(type, fn); },
        setAttribute() {},
      });
    }
    return elements.get(id);
  }
  new Script(app).runInNewContext({
    document: { getElementById },
    window: { addEventListener(type, fn) { listeners.set(type, fn); } },
    requestAnimationFrame(fn) { nextFrame = fn; },
  });
  let time = 0;
  function frames(count) {
    for (let i = 0; i < count; i++) {
      time += 20;
      const callback = nextFrame;
      assert.equal(typeof callback, 'function');
      nextFrame = undefined;
      callback(time);
    }
  }
  function key(type, code) {
    listeners.get(type)({ code, preventDefault() {} });
  }
  frames(1);
  key('keydown', 'ArrowUp'); frames(107); key('keyup', 'ArrowUp');
  key('keydown', 'ArrowRight'); frames(27); key('keyup', 'ArrowRight');
  key('keydown', 'ArrowUp'); frames(12); key('keyup', 'ArrowUp');
  assert.equal(getElementById('score').textContent, 'Score: 10');
  assert.equal(getElementById('status').textContent, 'Deliver to the green zone');
  key('keydown', 'ArrowUp'); frames(60); key('keyup', 'ArrowUp');
  const scoreAfterCollision = Number(getElementById('score').textContent.split(': ')[1]);
  assert.ok(scoreAfterCollision >= 0 && scoreAfterCollision < 10, 'Obstacle must deduct points without making score negative');
  assert.equal(getElementById('deliveries').textContent, 'Deliveries: 0');
  getElementById('reset').handlers.get('click')();
  assert.equal(getElementById('score').textContent, 'Score: 0');
  assert.equal(getElementById('deliveries').textContent, 'Deliveries: 0');
  assert.equal(getElementById('status').textContent, 'Pick up the blue package');
});

test('manual controls complete a full pickup-to-delivery route and award 110 points', () => {
  const elements = new Map();
  const listeners = new Map();
  const canvasContext = new Proxy({}, { get: () => () => {} });
  let nextFrame;
  function getElementById(id) {
    if (!elements.has(id)) {
      const handlers = new Map();
      elements.set(id, {
        width: 960, height: 600, textContent: '', handlers,
        getContext: () => canvasContext,
        addEventListener(type, fn) { handlers.set(type, fn); },
        setAttribute() {},
      });
    }
    return elements.get(id);
  }
  new Script(app).runInNewContext({
    document: { getElementById },
    window: { addEventListener(type, fn) { listeners.set(type, fn); } },
    requestAnimationFrame(fn) { nextFrame = fn; },
  });
  let time = 0;
  function frames(count) {
    for (let i = 0; i < count; i++) {
      time += 20;
      const callback = nextFrame;
      assert.equal(typeof callback, 'function', 'Animation should continue');
      nextFrame = undefined;
      callback(time);
    }
  }
  function hold(code, count) {
    listeners.get('keydown')({ code, preventDefault() {} });
    frames(count);
    listeners.get('keyup')({ code, preventDefault() {} });
  }
  frames(1);
  // Drive east to align with pickup, then north to collect the package.
  hold('ArrowRight', 27);
  hold('ArrowUp', 13);
  hold('ArrowLeft', 27);
  hold('ArrowUp', 115);
  assert.equal(getElementById('score').textContent, 'Score: 10');
  assert.equal(getElementById('status').textContent, 'Deliver to the green zone');

  // Travel south of the buildings, east through the corridor, then south to drop-off.
  hold('ArrowRight', 54);
  hold('ArrowUp', 67);
  hold('ArrowLeft', 27);
  hold('ArrowUp', 231);
  hold('ArrowRight', 27);
  hold('ArrowUp', 54);
  assert.equal(getElementById('score').textContent, 'Score: 110');
  assert.equal(getElementById('deliveries').textContent, 'Deliveries: 1');
  assert.equal(getElementById('status').textContent, 'Pick up the blue package');
  getElementById('reset').handlers.get('click')();
  assert.equal(getElementById('score').textContent, 'Score: 0');
  assert.equal(getElementById('deliveries').textContent, 'Deliveries: 0');
});

test('scripted AI completes a delivery using fixed safe waypoints', () => {
  const elements = new Map();
  const ctx = new Proxy({}, { get: () => () => {} });
  let nextFrame;
  function getElementById(id) {
    if (!elements.has(id)) {
      const handlers = new Map();
      elements.set(id, {
        width: 960, height: 600, textContent: '', handlers,
        getContext: () => ctx,
        addEventListener(type, fn) { handlers.set(type, fn); },
        setAttribute() {},
      });
    }
    return elements.get(id);
  }
  new Script(app).runInNewContext({
    document: { getElementById },
    window: { addEventListener() {} },
    requestAnimationFrame(fn) { nextFrame = fn; },
  });
  getElementById('auto').handlers.get('click')();
  let deliveries = 0;
  for (let i = 1; i <= 1500; i++) {
    const callback = nextFrame;
    assert.equal(typeof callback, 'function');
    nextFrame = undefined;
    callback(i * 20);
    deliveries = Number(getElementById('deliveries').textContent.split(': ')[1]);
    if (deliveries > 0) break;
  }
  assert.equal(deliveries, 1, 'Scripted route should finish one delivery within 30 simulated seconds');
  assert.equal(getElementById('score').textContent, 'Score: 110');
});

test('touch controls drive, reverse and stop on release, cancel, lost capture and blur', () => {
  const elements = new Map();
  const listeners = new Map();
  let nextFrame, time = 0, robotPosition;
  const ctx = new Proxy({
    translate(x, y) { robotPosition = { x, y }; },
  }, { get(target, key) { return target[key] ?? (() => {}); } });
  function getElementById(id) {
    if (!elements.has(id)) {
      const handlers = new Map();
      elements.set(id, {
        width: 960, height: 600, textContent: '', handlers,
        getContext: () => ctx,
        addEventListener(type, fn) { handlers.set(type, fn); },
        setAttribute() {},
        setPointerCapture() {},
      });
    }
    return elements.get(id);
  }
  new Script(app).runInNewContext({
    document: { getElementById },
    window: { addEventListener(type, fn) { listeners.set(type, fn); } },
    requestAnimationFrame(fn) { nextFrame = fn; },
  });
  function frames(count) {
    for (let i = 0; i < count; i++) {
      time += 20;
      const callback = nextFrame;
      assert.equal(typeof callback, 'function');
      nextFrame = undefined;
      callback(time);
    }
  }
  function pointer(id, type, pointerId = 7) {
    const handler = getElementById(id).handlers.get(type);
    assert.equal(typeof handler, 'function');
    handler({ pointerId, preventDefault() {} });
  }
  frames(1);
  const startY = robotPosition.y;
  pointer('forward', 'pointerdown');
  frames(20);
  const forwardY = robotPosition.y;
  assert.ok(forwardY < startY - 30, 'Touch Drive should move the robot forward');

  pointer('forward', 'pointerup');
  frames(5);
  assert.equal(robotPosition.y, forwardY, 'Releasing Drive must stop movement');

  pointer('back', 'pointerdown');
  frames(10);
  const reverseY = robotPosition.y;
  assert.ok(reverseY > forwardY + 10, 'Touch Reverse should move the robot backward');
  pointer('back', 'pointercancel');
  frames(5);
  assert.equal(robotPosition.y, reverseY, 'Pointer cancellation must stop Reverse');

  pointer('forward', 'pointerdown');
  frames(4);
  const beforeLostCapture = robotPosition.y;
  getElementById('forward').handlers.get('lostpointercapture')();
  frames(5);
  assert.equal(robotPosition.y, beforeLostCapture, 'Lost pointer capture must stop Drive');

  pointer('back', 'pointerdown');
  frames(3);
  const beforeBlur = robotPosition.y;
  listeners.get('blur')();
  frames(5);
  assert.equal(robotPosition.y, beforeBlur, 'Leaving the browser window must stop movement');

  // Safari can fire pagehide during navigation without a corresponding blur.
  pointer('forward', 'pointerdown');
  frames(3);
  const beforePagehide = robotPosition.y;
  assert.equal(typeof listeners.get('pagehide'), 'function');
  listeners.get('pagehide')();
  frames(5);
  assert.equal(robotPosition.y, beforePagehide, 'Pagehide must release a held Drive control');

  // A two-finger tablet gesture must allow driving and turning together.
  // Different pointer IDs model separate touches on the two controls.
  getElementById('reset').handlers.get('click')();
  frames(1);
  const multiStart = { ...robotPosition };
  pointer('forward', 'pointerdown', 21);
  pointer('right', 'pointerdown', 22);
  frames(15);
  const multiEnd = { ...robotPosition };
  assert.ok(multiEnd.x > multiStart.x + 5, 'Two-finger Drive + Turn must steer to the right');
  assert.ok(multiEnd.y < multiStart.y - 15, 'Two-finger Drive + Turn must still move forward');
  pointer('right', 'pointerup', 22);
  pointer('forward', 'pointerup', 21);
  frames(5);
  assert.deepEqual(robotPosition, multiEnd, 'Releasing both touches must stop the robot');
});

test('manual pickup can hand off to scripted AI and return to manual safely', () => {
  const elements = new Map();
  const listeners = new Map();
  const ctx = new Proxy({}, { get: () => () => {} });
  let nextFrame;
  function getElementById(id) {
    if (!elements.has(id)) {
      const handlers = new Map();
      const attrs = new Map();
      elements.set(id, {
        width: 960, height: 600, textContent: '', handlers, attrs,
        getContext: () => ctx,
        addEventListener(type, fn) { handlers.set(type, fn); },
        setAttribute(name, value) { attrs.set(name, value); },
      });
    }
    return elements.get(id);
  }
  new Script(app).runInNewContext({
    document: { getElementById },
    window: { addEventListener(type, fn) { listeners.set(type, fn); } },
    requestAnimationFrame(fn) { nextFrame = fn; },
  });
  let time = 0;
  function frames(count) {
    for (let i = 0; i < count; i++) {
      time += 20;
      const callback = nextFrame;
      assert.equal(typeof callback, 'function', 'Animation must keep running');
      nextFrame = undefined;
      callback(time);
    }
  }
  function hold(code, count) {
    listeners.get('keydown')({ code, preventDefault() {} });
    frames(count);
    listeners.get('keyup')({ code, preventDefault() {} });
  }
  frames(1);
  // Reach the parcel manually using the existing proven pickup path.
  hold('ArrowRight', 27);
  hold('ArrowUp', 13);
  hold('ArrowLeft', 27);
  hold('ArrowUp', 115);
  assert.equal(getElementById('score').textContent, 'Score: 10');
  assert.equal(getElementById('status').textContent, 'Deliver to the green zone');

  // Switch modes while carrying; the fixed route must still finish delivery.
  getElementById('auto').handlers.get('click')();
  assert.equal(getElementById('auto').attrs.get('aria-pressed'), 'true');
  let completed = false;
  for (let i = 0; i < 1500; i++) {
    frames(1);
    if (getElementById('deliveries').textContent === 'Deliveries: 1') {
      completed = true;
      break;
    }
  }
  assert.ok(completed, 'Scripted AI must finish a manually started delivery');
  assert.equal(getElementById('score').textContent, 'Score: 110');

  getElementById('auto').handlers.get('click')();
  assert.equal(getElementById('auto').attrs.get('aria-pressed'), 'false');
  assert.equal(getElementById('mode').textContent, 'Mode: Manual');
  // Manual mode without held keys must not complete another delivery.
  frames(50);
  assert.equal(getElementById('deliveries').textContent, 'Deliveries: 1');
});

test('hidden browser tab releases held driving input without resuming on return', () => {
  const elements = new Map(), windowListeners = new Map(), documentListeners = new Map();
  let hidden = false, nextFrame, time = 0, robotPosition;
  const ctx = new Proxy({ translate(x, y) { robotPosition = { x, y }; } },
    { get(target, key) { return target[key] ?? (() => {}); } });
  function getElementById(id) {
    if (!elements.has(id)) {
      const handlers = new Map();
      elements.set(id, {
        width: 960, height: 600, textContent: '',
        getContext: () => ctx,
        addEventListener(type, fn) { handlers.set(type, fn); },
        setAttribute() {}, handlers,
      });
    }
    return elements.get(id);
  }
  new Script(app).runInNewContext({
    document: {
      getElementById,
      addEventListener(type, fn) { documentListeners.set(type, fn); },
      get hidden() { return hidden; },
    },
    window: { addEventListener(type, fn) { windowListeners.set(type, fn); } },
    requestAnimationFrame(fn) { nextFrame = fn; },
  });
  function frames(count) {
    for (let i = 0; i < count; i++) {
      const fn = nextFrame;
      assert.equal(typeof fn, 'function');
      nextFrame = undefined;
      fn(time += 20);
    }
  }
  frames(1);
  const startY = robotPosition.y;
  windowListeners.get('keydown')({ code: 'ArrowUp', preventDefault() {} });
  frames(10);
  assert.ok(robotPosition.y < startY - 10, 'Held key must move the robot');
  hidden = true;
  assert.equal(typeof documentListeners.get('visibilitychange'), 'function');
  documentListeners.get('visibilitychange')();
  const stoppedY = robotPosition.y;
  frames(10);
  assert.equal(robotPosition.y, stoppedY, 'Hidden tab must release held key');
  hidden = false;
  documentListeners.get('visibilitychange')();
  frames(5);
  assert.equal(robotPosition.y, stoppedY, 'Returning to tab must not resume stale key');
  windowListeners.get('keydown')({ code: 'ArrowUp', preventDefault() {} });
  frames(5);
  assert.ok(robotPosition.y < stoppedY - 5, 'A new keydown must still drive normally');

  // Backgrounding must also suspend scripted driving; clearing keys alone
  // is insufficient because autonomous waypoints do not read manual keys.
  for (const eventName of ['blur', 'pagehide', 'visibilitychange']) {
    getElementById('reset').handlers.get('click')();
    frames(1);
    const startPose = { ...robotPosition };
    getElementById('auto').handlers.get('click')();
    assert.equal(getElementById('mode').textContent, 'Mode: Scripted AI');
    frames(40);
    assert.notDeepEqual(robotPosition, startPose,
      'Scripted mode must move before ' + eventName + ' suspends it');
    const pausedPose = { ...robotPosition };
    if (eventName === 'visibilitychange') {
      hidden = true;
      documentListeners.get('visibilitychange')();
      hidden = false;
    } else {
      windowListeners.get(eventName)();
    }
    assert.equal(getElementById('mode').textContent, 'Mode: Manual',
      eventName + ' must visibly turn off scripted driving');
    frames(8);
    assert.deepEqual(robotPosition, pausedPose,
      eventName + ' must stop scripted movement until explicitly restarted');
  }
});
