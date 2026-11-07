// Robot City scripted-delivery behavioral regression (Node built-ins only).
// Run: node tests/robot-city-scripted-delivery.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'robot-city.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'inline Robot City script exists');

const elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    const listeners = {};
    const node = {
      textContent: '', attributes: {},
      addEventListener(name, fn) { (listeners[name] ??= []).push(fn); },
      setAttribute(name, value) { this.attributes[name] = value; },
      click() { for (const fn of listeners.click || []) fn({preventDefault() {}}); },
      getContext() { return ctx; },
      width: 960, height: 600,
      setPointerCapture() {}
    };
    elements.set(id, node);
  }
  return elements.get(id);
}
const ctx = new Proxy({}, {get(_target, key) {
  if (['beginPath','arc','fill','fillRect','clearRect','strokeRect','fillText','save','translate','rotate','restore'].includes(key)) return () => {};
  return undefined;
}, set() { return true; }});
let nextFrame;
const document = {getElementById: element, hidden: false, addEventListener() {}};
const window = {addEventListener() {}};
vm.runInNewContext(script, {document, window, requestAnimationFrame(fn) { nextFrame = fn; }, Math, Set, Object});
assert.equal(element('score').textContent, 'Score: 0');
element('auto').click();
assert.equal(element('mode').textContent, 'Mode: Scripted AI');
let delivered = false;
for (let i = 1; i <= 3600; i++) {
  assert.equal(typeof nextFrame, 'function', 'animation callback scheduled');
  const fn = nextFrame; nextFrame = undefined;
  fn(i * (1000 / 60));
  if (element('deliveries').textContent === 'Deliveries: 1') {
    delivered = true;
    break;
  }
}
assert.ok(delivered, 'scripted robot completes pickup and delivery within 60 simulated seconds');
assert.equal(element('score').textContent, 'Score: 110', 'pickup +10 and delivery +100 without collision penalties');
element('reset').click();
assert.equal(element('score').textContent, 'Score: 0');
assert.equal(element('deliveries').textContent, 'Deliveries: 0');
assert.equal(element('mode').textContent, 'Mode: Manual');
console.log('PASS: scripted pickup, delivery, score and restart (Node VM behavioral test)');
