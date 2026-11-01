import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(resolve(root, 'challenges.html'), 'utf8');
const academy = readFileSync(resolve(root, 'academy.html'), 'utf8');
const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
const app = scripts[0]?.[1] ?? '';
const form = page.match(/<form\b[^>]*id="planner"[^>]*>([\s\S]*?)<\/form>/)?.[0] ?? '';

test('challenges page JavaScript parses', () => {
  assert.equal(scripts.length, 1, 'Expected one inline planner script');
  assert.doesNotThrow(() => new Script(app, { filename: 'challenges.html' }));
});

test('challenges page is mobile-ready', () => {
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.match(page, /\*\{box-sizing:border-box\}/, 'Form controls use border-box so width:100% cannot overflow');
  assert.match(page, /grid-template-columns:repeat\(auto-fit,minmax\(230px,1fr\)\)/, 'Card grid collapses to one column on phones');
  assert.match(page, /h1\{font-size:clamp\(/, 'Headline scales with viewport width');
});

test('every planner field has a matching label', () => {
  assert.ok(form, 'Planner form is present');
  const ids = [...form.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map(([, id]) => id);
  assert.deepEqual(ids, ['team', 'mode', 'concept']);
  for (const id of ids) assert.match(form, new RegExp('<label for="' + id + '">'), id + ' has a label');
});

test('planner validation attributes stay in place', () => {
  assert.match(form, /<input id="team" maxlength="80" required\b/);
  assert.match(form, /<textarea id="concept"[^>]*maxlength="1500"[^>]*required\b/);
  const options = [...form.matchAll(/<option>([^<]+)<\/option>/g)].map(([, option]) => option);
  assert.deepEqual(options, ['Virtual', 'Physical', 'Both'], 'Physical / Virtual / Both tracks');
  assert.match(form, /<button type="submit">Download draft \(\.txt\)<\/button>/);
  assert.match(form, /<p id="status" role="status" aria-live="polite"><\/p>/);
  assert.match(app, /e\.preventDefault\(\)/, 'Submitting never navigates or posts');
  assert.match(app, /\.value\.trim\(\)/, 'Whitespace-only answers are rejected');
  assert.match(app, /if\(!team\|\|!concept\)return;/);
});

test('planner stays local: no network calls, form action, or uploads', () => {
  assert.doesNotMatch(form, /\baction=|\bmethod=|type="file"/i);
  assert.doesNotMatch(app, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|navigator\.share/);
  assert.doesNotMatch(page, /<iframe\b|<script\b[^>]*\bsrc=/i, 'No third-party embeds or scripts');
});

test('local draft download is labelled draft only and not submitted', () => {
  assert.match(app, /new Blob\(\[content\],\{type:'text\/plain;charset=utf-8'\}\)/);
  assert.match(app, /a\.download='botket-challenge-draft\.txt'/);
  assert.match(app, /URL\.revokeObjectURL\(url\)/, 'Object URL is released');
  assert.match(app, /'BOTKET Guild Challenge #001 — DRAFT ONLY'/);
  assert.match(app, /'Not submitted to BOTKET\.'/);
  assert.match(app, /'Draft downloaded locally; no submission was made\.'/);
});

test('challenge page keeps demo-only boundaries', () => {
  assert.match(page, /no live simulation, entry submission, prize, or tournament is available yet/);
  assert.match(page, /This form does not register you for a competition, upload files, or send information to BOTKET\./);
  assert.match(page, /Hardware and simulation environments are not yet connected\./);
  assert.match(page, /Final rules are pending\./);
  assert.match(page, /No third-party commercial integration or partnership is implied\./);
  assert.doesNotMatch(page, /\b(certified|guaranteed|officially compatible|register now|win \$|prize pool|buy now)\b/i);
});

test('academy page links to the first challenge without losing the consumer link', () => {
  assert.match(academy, /<a class="buy" href="challenges\.html">Explore Guild Challenge #001 →<\/a>/);
  assert.match(academy, /<a href="consumer\.html">← Back to BOTKET Consumer<\/a>/);
  assert.match(academy, /No enrollment, teacher certification, kit reservation or payment is available in this demo\./);
  assert.match(page, /<a href="index\.html">Home<\/a>/);
  assert.match(page, /<a href="consumer\.html">Marketplace demo<\/a>/);
});
