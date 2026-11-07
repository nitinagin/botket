// Source-level guard only; does not replace browser/iPad gameplay testing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.resolve(__dirname, '../robot-city.html'), 'utf8');
function check(label, regex) {
  assert.match(html, regex, label);
  process.stdout.write(`PASS ${label}\n`);
}
check('one canvas arena', /<canvas\s+id="game"[^>]*width="960"[^>]*height="600"/);
check('manual touch controls', /bind\('forward','forward'\)/);
check('scripted navigation toggle', /id="auto"[^>]*aria-pressed="false"/);
check('pickup adds 10 points', /carrying=true;autoWaypoint=0;score\+=10/);
check('delivery adds 100 points', /deliveries\+\+;score\+=100/);
check('collision penalty clamped at zero', /score=Math\.max\(0,score-1\)/);
check('collision cooldown 0.5 seconds', /cooldown=\.5;update\(\)/);
check('reset clears score and deliveries', /score=0;deliveries=0;carrying=false/);
check('no trained AI claim', /it is not trained machine learning/);
console.log('Source smoke assertions passed; gameplay and cross-platform parity NOT verified.');
