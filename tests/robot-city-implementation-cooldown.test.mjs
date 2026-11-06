import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../robot-city.html', import.meta.url), 'utf8');
const source = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][0]?.[1];

function makeGame() {
  assert.ok(source, 'Robot City inline script is present');
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', setAttribute() {}, addEventListener() {},
      getContext() { return {}; }, width: 960, height: 600,
    });
    return elements.get(id);
  };
  const document = { getElementById: element, addEventListener() {}, hidden: false };
  const window = { addEventListener() {} };
  const sandbox = { document, window, requestAnimationFrame() {} };
  const instrumented = source.replace(
    'reset();requestAnimationFrame(frame);',
    'reset();globalThis.__game={step,reset,setRobot:(x,y,a)=>{robot={x,y,a}},setScore:n=>{score=n},getState:()=>({score,cooldown,robot:{...robot}}),hold:()=>{keys.ArrowUp=true}};requestAnimationFrame(frame);',
  );
  assert.notEqual(instrumented, source, 'Expected application initialization hook must exist');
  runInNewContext(instrumented, sandbox, { timeout: 2000 });
  return sandbox.__game;
}

test('real game step applies only one collision penalty during 500ms cooldown', () => {
  const game = makeGame();
  game.setRobot(20, 480, Math.PI);
  game.setScore(10);
  game.hold();
  game.step(0.01);
  assert.equal(game.getState().score, 9);
  assert.equal(game.getState().cooldown, 0.5);
  game.step(0.2);
  game.step(0.2);
  assert.equal(game.getState().score, 9, 'Repeated collision during cooldown is ignored');
  game.step(0.099);
  assert.equal(game.getState().score, 9, 'Still protected just before 500ms');
  game.step(0.002);
  assert.equal(game.getState().score, 8, 'Penalty resumes after cooldown');
});

test('real game collision never lowers score below zero and reset clears cooldown', () => {
  const game = makeGame();
  game.setRobot(20, 480, Math.PI);
  game.hold();
  game.step(0.01);
  assert.equal(game.getState().score, 0);
  assert.equal(game.getState().cooldown, 0.5);
  game.reset();
  assert.equal(game.getState().cooldown, 0);
  assert.equal(game.getState().score, 0);
});
