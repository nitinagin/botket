import test from 'node:test';
import assert from 'node:assert/strict';

// Proposal-only contract validation: not imported by either game implementation.
function validateCollisionConfig({ cooldownMs, penalty = 5, initialScore = 30 }) {
  for (const [name, value] of Object.entries({ cooldownMs, penalty, initialScore })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a nonnegative safe integer`);
    }
  }
  if (cooldownMs === 0) throw new RangeError('cooldownMs must be positive');
  return { cooldownMs, penalty, initialScore };
}

test('valid candidate configurations are accepted', () => {
  assert.deepEqual(validateCollisionConfig({ cooldownMs: 500 }), { cooldownMs: 500, penalty: 5, initialScore: 30 });
  assert.deepEqual(validateCollisionConfig({ cooldownMs: 750, penalty: 0, initialScore: 0 }), { cooldownMs: 750, penalty: 0, initialScore: 0 });
});

test('invalid cooldown is rejected before processing events', () => {
  for (const cooldownMs of [undefined, null, NaN, Infinity, -1, 0, 0.5, Number.MAX_SAFE_INTEGER + 1, '500']) {
    assert.throws(() => validateCollisionConfig({ cooldownMs }), RangeError);
  }
});

test('invalid penalty is rejected', () => {
  for (const penalty of [null, NaN, Infinity, -1, 1.5, '5', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateCollisionConfig({ cooldownMs: 500, penalty }), RangeError);
  }
});

test('invalid initial score is rejected', () => {
  for (const initialScore of [null, NaN, Infinity, -1, 1.5, '30', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateCollisionConfig({ cooldownMs: 500, initialScore }), RangeError);
  }
});
