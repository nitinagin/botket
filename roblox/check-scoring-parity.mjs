import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source check only. This does not run Roblox Studio or execute Luau.

const root = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(readFileSync(resolve(root, 'scoring-contract.json'), 'utf8'));
const configSource = readFileSync(resolve(root, 'src/shared/ChallengeConfig.luau'), 'utf8');
const serverSource = readFileSync(resolve(root, 'src/server/DeliveryManager.server.luau'), 'utf8');
const clientSource = readFileSync(resolve(root, 'src/client/RobotController.client.luau'), 'utf8');

function assignments(block) {
  const fields = {};
  for (const match of block.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^,\n]+)/gm)) {
    fields[match[1]] = match[2].trim();
  }
  return fields;
}

function scoringFields(source) {
  const match = source.match(/scoring\s*=\s*\{([\s\S]*?)\n\t\}/);
  assert.ok(match, 'ChallengeConfig scoring table was not found');
  return assignments(match[1]);
}

function literal(value) {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  const numeric = Number(value);
  assert.equal(Number.isNaN(numeric), false, `expected a number, got ${value}`);
  return numeric;
}

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing ${endMarker} after ${startMarker}`);
  return source.slice(start, end);
}

function applyCollision(score, lastAt, now, penalty, cooldownSeconds) {
  if (now - lastAt < cooldownSeconds) {
    return { score, lastAt, applied: false };
  }
  return {
    score: Math.max(contract.scoreFloor, score - penalty),
    lastAt: now,
    applied: true,
  };
}

test('ChallengeConfig constants match the browser scoring contract', () => {
  const scoring = scoringFields(configSource);
  assert.deepEqual(Object.keys(scoring).sort(), [
    'collisionCooldownSeconds',
    'collisionPenalty',
    'final',
    'pointsOnPickup',
    'pointsPerDelivery',
  ]);
  assert.equal(literal(scoring.pointsOnPickup), contract.pointsOnPickup);
  assert.equal(literal(scoring.pointsPerDelivery), contract.pointsPerDelivery);
  assert.equal(literal(scoring.collisionPenalty), contract.collisionPenalty);
  assert.equal(literal(scoring.collisionCooldownSeconds), contract.collisionCooldownSeconds);
  assert.equal(literal(scoring.final), contract.scoringFinal);
  assert.equal(contract.collisionCooldownSeconds * 1000, 500);
  assert.equal(contract.roundTimeLimitSeconds, null);
  assert.equal(contract.deliveriesLoop, true);
  assert.equal(contract.fixedMissionCountEnd, false);

  const top = assignments(configSource);
  assert.equal(literal(top.rulesVersion), contract.rulesVersion);
  assert.equal(literal(top.demoOnly), contract.demoOnly);
  assert.equal(configSource.includes('timeLimitSeconds'), false);
  assert.equal(configSource.includes('collisionDebounceSeconds'), false);
  assert.match(configSource, /name = "West street to east street"/);
  assert.match(configSource, /name = "North street to south street"/);
  assert.match(configSource, /name = "Southwest corner to northeast corner"/);
});

test('server applies the contract and does not end the round', () => {
  assert.match(serverSource, /math\.max\(0, record\.score - config\.scoring\.collisionPenalty\)/);
  assert.match(
    serverSource,
    /now - record\.lastCollisionAt < config\.scoring\.collisionCooldownSeconds/
  );
  assert.match(serverSource, /record\.score \+= config\.scoring\.pointsOnPickup/);
  assert.match(serverSource, /record\.score \+= config\.scoring\.pointsPerDelivery/);
  assert.match(serverSource, /if nextIndex > #config\.missions then/);
  assert.match(serverSource, /nextIndex = 1/);
  assert.match(serverSource, /missions must include at least one delivery/);
  assert.equal(serverSource.includes('more than one delivery'), false);
  assert.equal(serverSource.includes('config.scoring.timeLimitSeconds'), false);
  assert.match(serverSource, /scoring\.timeLimitSeconds is not used/);
  assert.equal(serverSource.includes('All deliveries are complete'), false);
  assert.equal(serverSource.includes('Time is up'), false);
  assert.equal(serverSource.includes('collisionDebounceSeconds'), false);
  assert.match(serverSource, /rulesVersion must be robot-city-demo-v1/);
  assert.match(serverSource, /scoring\.final must be false/);

  const pickup = between(serverSource, 'local function completePickup', 'local function completeDropOff');
  const dropOff = between(serverSource, 'local function completeDropOff', 'local function onZoneTouched');
  const collision = between(serverSource, 'local function onHullTouched', 'local function recordFromHit');
  assert.equal(pickup.includes('driveMode'), false);
  assert.equal(dropOff.includes('driveMode'), false);
  assert.equal(collision.includes('driveMode'), false);

  const heartbeat = between(serverSource, 'RunService.Heartbeat:Connect', 'Players.PlayerAdded:Connect');
  assert.match(heartbeat, /scriptedDrive\(record\)/);
  assert.match(heartbeat, /completePickup\(record\)/);
  assert.match(heartbeat, /completeDropOff\(record\)/);
  assert.equal(heartbeat.includes('timeLimit'), false);

  const restart = between(serverSource, 'local function restartRound', 'local function hullInsideZone');
  assert.match(restart, /record\.score = 0/);
  assert.match(restart, /record\.carrying = false/);
  assert.match(restart, /record\.lastCollisionAt = 0/);
  assert.match(restart, /record\.driveMode = "manual"/);
  assert.match(restart, /placeRobotAtSpawn\(record\)/);
});

test('HUD keeps Phase 1 controls and drops the countdown and mission counter', () => {
  assert.match(clientSource, /Score %d {4}Deliveries %d {4}Collisions %d/);
  assert.match(clientSource, /Elapsed %ds {4}Carrying %s/);
  assert.equal(clientSource.includes('Time left'), false);
  assert.equal(clientSource.includes('Mission %d/%d'), false);
  assert.equal(clientSource.includes('timeLimit'), false);
  assert.match(clientSource, /Name = "Joystick"/);
  assert.match(clientSource, /TouchEnabled/);
  assert.match(clientSource, /Scripted AI: Off/);
  assert.match(clientSource, /makeButton\("Restart", "Restart"/);
  assert.match(clientSource, /restartEvent:FireServer\(\)/);
  assert.match(clientSource, /FireServer\(throttle, steer\)/);
});

test('collision cooldown and score floor follow the 500 ms contract', () => {
  const penalty = contract.collisionPenalty;
  const cooldown = contract.collisionCooldownSeconds;
  assert.equal(penalty, 1);
  assert.equal(cooldown, 0.5);

  let state = applyCollision(0, 0, 1, penalty, cooldown);
  assert.deepEqual(state, { score: 0, lastAt: 1, applied: true });

  state = applyCollision(10, 0, 1, penalty, cooldown);
  assert.equal(state.score, 9);
  const blocked = applyCollision(state.score, state.lastAt, state.lastAt + 0.499, penalty, cooldown);
  assert.equal(blocked.applied, false);
  assert.equal(blocked.score, 9);
  const allowed = applyCollision(state.score, state.lastAt, state.lastAt + 0.5, penalty, cooldown);
  assert.equal(allowed.applied, true);
  assert.equal(allowed.score, 8);

  let score = contract.pointsOnPickup + contract.pointsPerDelivery;
  assert.equal(score, 110);
  score = Math.max(contract.scoreFloor, score - penalty);
  assert.equal(score, 109);
});
