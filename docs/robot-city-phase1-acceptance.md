# Robot City Phase 1 — release acceptance checklist (draft)

Tracking: [#101](https://github.com/nitinagin/botket/issues/101), browser [#102](https://github.com/nitinagin/botket/pull/102), Roblox [#103](https://github.com/nitinagin/botket/pull/103), schema [#99](https://github.com/nitinagin/botket/issues/99), Guild [#97](https://github.com/nitinagin/botket/pull/97).

**Status: not approved for merge, deployment, or investor demonstration.** This checklist is documentation only and does not attest that tests passed.

## Scope and safeguards

- [ ] One arena/city, one robot model, pickup/drop-off, score, reset, basic *scripted* navigation only.
- [ ] No trained AI, physics-accurate simulation, real robot control, payments, or live marketplace claims.
- [ ] No paid services, purchases, or commitments without separate approval; total authorized ceiling THB 20,000.
- [ ] Consumer prototype regression suite stays green and existing routes remain intact.

## Browser / iPad acceptance

- [ ] Latest PR #102 HEAD: smoke, browser, World-entry, and consumer regression tests pass; link the **specific run and SHA**.
- [ ] Real iPad Safari (not Chrome emulation): portrait and landscape; touch steering; two-finger simultaneous inputs; release and pointer cancellation; page blur/app switch stops motion.
- [ ] Keyboard: WASD/arrows; losing focus stops motion; restart resets delivery count, score, and controls.
- [ ] Manual ↔ scripted transitions: no stuck motion or duplicated scoring; scripted behavior clearly labelled.
- [ ] Pickup/drop-off and collision scoring verified against written rules, including repeat pickup and restart.
- [ ] Accessibility: visible focus, readable HUD, appropriate controls and reduced-motion review.
- [ ] Performance on actual target iPad documented (device, OS, browser, observations).
- [ ] Demo URL and deployed commit verified *after* explicit merge/deploy approval.

## Roblox acceptance

- [ ] Record importer, commit SHA, Roblox Studio version, date, and reproducible import steps for PR #103.
- [ ] Test WASD and mobile joystick in Studio; ensure control release stops motion.
- [ ] Test three deliveries, collision penalties, timer, restart, and manual ↔ scripted transitions.
- [ ] Capture logs/screenshots and identify failures. **Source-only Luau lint is not Studio playtest.**
- [ ] Attribute Grok authorship only when supported by an identifiable commit, PR, or direct submission.

## Cross-platform scoring / Guild

- [ ] Compare scoring formulas and time limits between browser and Roblox; differences documented before any leaderboard claim.
- [ ] Agree versioned challenge rules and schema in #99; do not represent draft schema as implemented.
- [ ] Keep #97 clearly demo-only: no enrollment, prizes, verified compatibility, or submitted transactions.

## Evidence log template

| Date/time (timezone) | Surface/device | Commit SHA | Test / steps | Result | Evidence link | Blocker |
| --- | --- | --- | --- | --- | --- | --- |
| _pending_ | _pending_ | _pending_ | _pending_ | NOT RUN | _pending_ | _pending_ |

No checklist item should be checked without evidence. A green CI run alone does not satisfy real-device acceptance.
