// Run: node tests/partner-showroom-static.test.cjs
// Source-level safety checks only; not a browser/iPad acceptance test.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync('partner-showroom.html', 'utf8');
const checks = [
  ['concept and integration disclaimers', /CONCEPT[\s\S]*NOT INTEGRATED/i.test(html)],
  ['three named manufacturer references', ['AgiBot X2 family', 'Unitree G1', 'Universal Robots e-Series'].every(name => html.includes('<h2>' + name + '</h2>'))],
  ['three explicitly not integrated cards', (html.match(/MANUFACTURER REFERENCE · NOT INTEGRATED/g) || []).length === 3],
  ['Issue 119 traceability', html.includes('github.com/nitinagin/botket/issues/119')],
  ['manufacturer reference disclaimer', /manufacturer references only/i.test(html)],
  ['no remote hosted manufacturer imagery', !/<img\b[^>]*src\s*=\s*['\"]https?:/i.test(html)],
  ['no misleading checkout', !/<form\b[^>]*action\s*=\s*['\"]https?:/i.test(html)],
  ['official manufacturer source links', html.includes('https://www.agibot.com/') && html.includes('https://x2-aimdk.agibot.com/en/dev/get_sdk/index.html') && html.includes('https://www.unitree.com/g1/') && html.includes('https://www.universal-robots.com/products/')],
  ['three original inline SVG illustrations', (html.match(/<svg\\b/g) || []).length === 3 && !/<image\\b/i.test(html)],
  ['no executable script tags', !/<script\\b/i.test(html)],
  ['all external links use noopener noreferrer', [...html.matchAll(/<a\\b[^>]*target="_blank"[^>]*>/g)].every(([tag]) => /rel="noopener noreferrer"/.test(tag))],
  ['no claim of live robot city', /not a live playable deployment/i.test(html)],
];
for (const [name, pass] of checks) { console.log((pass ? 'PASS' : 'FAIL') + ': ' + name); assert.ok(pass, name); }
console.log('12/12 static showroom safety checks passed; browser and source verification still required.');
