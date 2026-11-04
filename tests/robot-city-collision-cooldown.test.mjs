// Proposal-only collision debounce fixtures. Does not execute browser or Roblox code.
import test from 'node:test';
import assert from 'node:assert/strict';

function collisionScores(events, { cooldownMs, penalty = 5, initialScore = 30 }) {
  let score = initialScore;
  let lastAcceptedAt = null;
  let lastSeenAt = null;
  const scores = [];
  for (const event of events) {
    if (event.type === 'restart') {
      score = initialScore;
      lastAcceptedAt = null;
      lastSeenAt = null;
    } else if (event.type === 'collision') {
      if (!Number.isSafeInteger(event.elapsedMs) || event.elapsedMs < 0) {
        throw new RangeError('elapsedMs must be a nonnegative safe integer');
      }
      if (lastSeenAt !== null && event.elapsedMs < lastSeenAt) {
        throw new RangeError('collision timestamps must be monotonic');
      }
      lastSeenAt = event.elapsedMs;
      if (lastAcceptedAt === null || event.elapsedMs - lastAcceptedAt >= cooldownMs) {
        score = Math.max(0, score - penalty);
        lastAcceptedAt = event.elapsedMs;
      }
    } else {
      throw new TypeError('unknown event');
    }
    scores.push(score);
  }
  return scores;
}

const collisions = [0, 200, 600, 800].map(elapsedMs => ({ type: 'collision', elapsedMs }));
test('500ms candidate accepts collisions at 0 and 600ms', () => {
  assert.deepEqual(collisionScores(collisions, { cooldownMs: 500 }), [25, 25, 20, 20]);
});
test('750ms candidate accepts collisions at 0 and 800ms', () => {
  assert.deepEqual(collisionScores(collisions, { cooldownMs: 750 }), [25, 25, 25, 20]);
});
test('exact cooldown boundary is accepted', () => {
  assert.deepEqual(collisionScores([0, 499, 500].map(elapsedMs => ({ type: 'collision', elapsedMs })), { cooldownMs: 500 }), [25, 25, 20]);
});
test('restart clears cooldown state', () => {
  assert.deepEqual(collisionScores([{type:'collision',elapsedMs:0},{type:'restart'},{type:'collision',elapsedMs:0}], {cooldownMs:750}), [25,30,25]);
});
test('collision score cannot fall below zero', () => {
  assert.deepEqual(collisionScores([0, 500, 1000].map(elapsedMs => ({type:'collision',elapsedMs})), {cooldownMs:500,initialScore:6}), [1,0,0]);
});
test('invalid and decreasing timestamps are rejected', () => {
  assert.throws(() => collisionScores([{type:'collision',elapsedMs:-1}], {cooldownMs:500}), RangeError);
  assert.throws(() => collisionScores([{type:'collision',elapsedMs:100},{type:'collision',elapsedMs:99}], {cooldownMs:500}), RangeError);
});

test('rejected collision timestamps must still be monotonic', () => {
  assert.throws(() => collisionScores([0, 200, 150].map(elapsedMs => ({type:'collision',elapsedMs})), {cooldownMs:500}), RangeError);
});

test('same-timestamp duplicate collisions do not bypass cooldown', () => {
  assert.deepEqual(collisionScores([0, 0, 500].map(elapsedMs => ({ type: 'collision', elapsedMs })), { cooldownMs: 500 }), [25, 25, 20]);
});
test('non-finite, fractional, and unsafe timestamps are rejected', () => {
  for (const elapsedMs of [NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, null]) {
    assert.throws(() => collisionScores([{ type: 'collision', elapsedMs }], { cooldownMs: 500 }), RangeError);
  }
});
