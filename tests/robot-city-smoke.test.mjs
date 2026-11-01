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
  assert.match(app, /carrying=true;score\+=10/);
  assert.match(app, /deliveries\+\+;score\+=100/);
  assert.match(app, /score=Math\.max\(0,score-1\)/);
  assert.match(app, /function reset\(\)\{robot=\{/);
  assert.match(app, /score=0;deliveries=0;carrying=false;auto=false/);
  assert.match(app, /el\('reset'\)\.addEventListener\('click',reset\)/);
});

test('scripted avoidance is identified as a demo, not trained AI', () => {
  assert.match(app, /if\(auto\)\{const goal=carrying\?drop:pickup/);
  assert.match(app, /collision\(ax,ay\)/);
  assert.match(html, /simple scripted obstacle-avoidance demonstration, not trained machine learning/);
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
