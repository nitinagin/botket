import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const pageUrl = new URL('../world.html', import.meta.url);
const html = readFileSync(pageUrl, 'utf8');

test('BOTKET World has a usable standalone browser entry', () => {
  assert.match(html, /<title>BOTKET World — Robot City Phase 1 Preview<\/title>/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /<main>/);
  assert.match(html, /href="robot-city\.html"/);
  assert.ok(existsSync(new URL('../robot-city.html', import.meta.url)), 'Browser game link must resolve in the repository');
  assert.match(html, /min-height:48px/, 'Preview link should have a touch-friendly target');
});

test('BOTKET World accurately labels Phase 1 limits', () => {
  assert.match(html, /One city, one robot model/);
  assert.match(html, /scripted waypoint driving/);
  assert.match(html, /real iPad Safari QA has not been completed/);
  assert.match(html, /Roblox Studio playtesting and publishing have not been verified/);
  assert.match(html, /no playable Roblox link yet/);
  assert.match(html, /not a released game or investor-ready demo/);
});

test('standalone entry has no data collection, payment or remote scripts', () => {
  assert.doesNotMatch(html, /<script\b|<form\b|<iframe\b|<input\b/i);
  assert.doesNotMatch(html, /\b(?:fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage)\s*\(/i);
  assert.doesNotMatch(html, /href="https?:\/\//i);
  assert.match(html, /href="index\.html"/);
});
