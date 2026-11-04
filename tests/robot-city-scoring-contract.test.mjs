// Proposal-only scoring reference. NOT a test of browser or Roblox gameplay.
import test from 'node:test';
import assert from 'node:assert/strict';

function evaluate(events) {
  let score = 0, mission = 0, carrying = false, ended = false;
  const scores = [];
  for (const item of events) {
    const [type, index] = Array.isArray(item) ? item : [item, undefined];
    if (type === 'restart') {
      score = 0; mission = 0; carrying = false; ended = false;
    } else if (!ended) {
      if (type === 'pickup' && index === mission && !carrying && mission < 3) {
        carrying = true; score += 10;
      } else if (type === 'delivery' && index === mission && carrying) {
        carrying = false; score += 100; mission += 1;
        if (mission === 3) ended = true;
      } else if (type === 'collision') {
        score = Math.max(0, score - 5);
      } else if (type === 'timeout') {
        ended = true;
      }
    }
    scores.push(score);
  }
  return scores;
}

const fixtures = [
  ['normal mission', [['pickup',0],['delivery',0]], [10,110]],
  ['premature delivery', [['delivery',0],['pickup',0],['delivery',0]], [0,10,110]],
  ['duplicates', [['pickup',0],['pickup',0],['delivery',0],['delivery',0]], [10,10,110,110]],
  ['collision floor', ['collision',['pickup',0],'collision',['delivery',0]], [0,10,5,105]],
  ['three missions', [['pickup',0],['delivery',0],['pickup',1],['delivery',1],['pickup',2],['delivery',2]], [10,110,120,220,230,330]],
  ['restart', [['pickup',0],['delivery',0],'restart',['pickup',0]], [10,110,0,10]],
  ['timeout', [['pickup',0],'timeout',['delivery',0]], [10,10,10]],
];
for (const [name, events, expected] of fixtures) {
  test(`draft scoring fixture: ${name}`, () => assert.deepEqual(evaluate(events), expected));
}
test('no scoring after third delivery until restart', () => {
  assert.deepEqual(evaluate([['pickup',0],['delivery',0],['pickup',1],['delivery',1],['pickup',2],['delivery',2],'collision',['pickup',2],'restart',['pickup',0]]), [10,110,120,220,230,330,330,330,0,10]);
});

test('reject out-of-order mission indices', () => {
  assert.deepEqual(evaluate([['pickup',1],['delivery',1],['pickup',0],['delivery',1],['delivery',0]]), [0,0,10,10,110]);
});
test('timeout blocks later events except restart', () => {
  assert.deepEqual(evaluate(['timeout',['pickup',0],'collision','restart',['pickup',0]]), [0,0,0,0,10]);
});
test('restart after completion re-enables mission zero', () => {
  assert.deepEqual(evaluate([['pickup',0],['delivery',0],['pickup',1],['delivery',1],['pickup',2],['delivery',2],'restart',['pickup',1],['pickup',0]]), [10,110,120,220,230,330,0,0,10]);
});

test('old mission events cannot farm points after advancement', () => {
  assert.deepEqual(evaluate([['pickup',0],['delivery',0],['pickup',0],['delivery',0],['pickup',1],['delivery',1]]), [10,110,110,110,120,220]);
});
test('restart while carrying clears cargo and rejects delivery until pickup', () => {
  assert.deepEqual(evaluate([['pickup',0],'restart',['delivery',0],['pickup',0],['delivery',0]]), [10,0,0,10,110]);
});
test('repeated collisions cannot make the score negative', () => {
  assert.deepEqual(evaluate([['pickup',0],...Array(4).fill('collision'),['delivery',0]]), [10,5,0,0,0,100]);
});
