import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const pageUrl = new URL('../world.html', import.meta.url);
const html = readFileSync(pageUrl, 'utf8');

test('BOTKET World has a usable standalone browser entry', () => {
  assert.match(html, /<title>BOTKET World — Robot City Phase 1 Preview<\/title>/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /<main id="main-content" tabindex="-1">/);
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

// Accessibility regression for keyboard users and touch navigation on the World preview.
test('BOTKET World provides skip navigation and touch-friendly home link', () => {
  assert.match(html, /class="skip-link" href="#main-content">Skip to main content<\/a>/);
  assert.match(html, /<main id="main-content" tabindex="-1">/);
  assert.match(html, /\.skip-link:focus\{top:8px\}/);
  assert.match(html, /class="home-link" href="index\.html"/);
  assert.match(html, /\.home-link\{[^}]*min-height:44px/);
  assert.match(html, /a:focus-visible\{outline:3px solid/);
});

// Guard against broken standalone navigation before the preview is linked from the main site.
test('BOTKET World local navigation and accessible heading references remain valid', () => {
  const ids = [...html.matchAll(/\\bid="([^"]+)"/g)].map(([, id]) => id);
  assert.equal(new Set(ids).size, ids.length, 'Element IDs must be unique');
  assert.equal((html.match(/<main\\b/g) ?? []).length, 1, 'Exactly one main landmark is required');
  assert.equal((html.match(/<h1\\b/g) ?? []).length, 1, 'Exactly one page-level heading is required');

  for (const [, references] of html.matchAll(/\\baria-labelledby="([^"]+)"/g)) {
    for (const id of references.trim().split(/\\s+/)) {
      assert.ok(ids.includes(id), 'aria-labelledby must resolve: ' + id);
    }
  }
  for (const [, href] of html.matchAll(/<a\\b[^>]*\\bhref="([^"]+)"/g)) {
    assert.doesNotMatch(href, /^(?:https?:|\\/\\/|javascript:)/i, 'Preview links must stay local');
    if (href.startsWith('#')) {
      assert.ok(ids.includes(href.slice(1)), 'Anchor target must exist: ' + href);
    } else {
      assert.ok(existsSync(new URL('../' + href, import.meta.url)), 'Local link must exist: ' + href);
    }
  }
});
