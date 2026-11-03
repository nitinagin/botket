# Robot City Phase 1 — real-device acceptance record (unverified)

This is a **manual QA protocol**, not evidence that tests have been run. Complete on actual devices before considering PR #102 or #103 ready. Scope: one city, one robot, pickup/delivery, scoring, scripted waypoint mode. No trained AI, real-robot integration, online leaderboard, or marketplace.

## Evidence fields (fill after each run)

- Date/time and tester:
- Git commit SHA / PR:
- Device model and OS version:
- Browser version (Safari on iPad) or Roblox Studio version:
- Screen orientation and viewport:
- Screen recording or screenshots link (avoid personal data):
- Observed result, pass/fail, reproduction steps, and issue link:

## iPad Safari — PR #102

- [ ] Load prototype branch in a safe preview environment; verify the existing consumer site is unaffected.
- [ ] Portrait and landscape: canvas, HUD, score, restart and control buttons visible without horizontal overflow.
- [ ] Manual touch: drive, reverse, steering, pickup and delivery; record score and expected result.
- [ ] Two fingers on the same control: releasing one finger must not incorrectly stop the remaining held input.
- [ ] Keyboard + touch: releasing one input must not cancel the other; opposing directions must not cause unintended movement.
- [ ] Hold Drive, switch apps or background Safari, return: robot remains stopped until a new input.
- [ ] Restart while touching a control: robot remains stopped until a new input.
- [ ] Manual → scripted → manual: stale held touch/keyboard state does not resume movement.
- [ ] VoiceOver: game purpose, control instructions, score and mode are understandable; record any inaccessible interactions.
- [ ] Repeat 5 pickup/dropoff cycles; record crashes, freezes, unexpected score changes and responsiveness.
- [ ] Test offline/reload behavior and document limitations; do not imply persistence unless verified.

## Roblox Studio — PR #103 (source-only until proven otherwise)

- [ ] Record the exact Luau source commit imported and Roblox Studio version.
- [ ] Import all modules/scripts per roblox/README.md and capture Output errors.
- [ ] Verify one city, one robot, three delivery missions, touch and keyboard input.
- [ ] Verify restart resets mission, score and motion; check scripted waypoint mode and obstacle behavior.
- [ ] Record collision penalty, cooldown, time limit, and mission count from an actual Studio playtest.
- [ ] Attach a screen recording and issue links for failures; no published experience claim without a verified URL.
- [ ] Attribute Grok contribution only to a verifiable Grok-authored commit/PR or explicit provenance.

## Cross-platform release gate

- [ ] Issue #99 has an approved, versioned scoring contract, or both scores are explicitly marked **not comparable**.
- [ ] PR #102 latest-head CI green **and** real iPad Safari manual QA recorded.
- [ ] PR #103 Roblox Studio import/playtest evidence recorded.
- [ ] Consumer prototype regression checks and public demo URLs verified separately.
- [ ] No merge/deploy of unverified work; no spend or vendor commitment without explicit approval (Phase 1 ceiling THB 20,000).

Use **Not tested** rather than Pass whenever evidence is absent.
