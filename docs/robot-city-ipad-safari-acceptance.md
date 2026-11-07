# Robot City Phase 1 — iPad Safari acceptance checklist (draft)

Scope: browser prototype in PR #102 only. This checklist is **not** evidence that Safari testing has occurred. Do not merge or deploy based on Chrome emulation alone.

## Manual test setup
- Record iPad model, iPadOS version, Safari version, portrait/landscape orientation, test date, browser URL/commit SHA, and tester.
- Use the isolated preview of `robot-city.html` from the PR branch; do not modify the consumer prototype.
- Record actual outcome (PASS / FAIL / NOT RUN), screenshot or video for failures, and reproduction steps.

## Acceptance cases
1. Open the page in iPad Safari; verify the canvas, score, deliveries, mode, and status are visible without clipping in portrait and landscape.
2. Press and hold **Drive**: robot moves. Release: robot stops. Repeat with Reverse and both Turn buttons.
3. While holding Drive, slide finger off the button or interrupt touch; verify motion stops (pointercancel / lostpointercapture safety).
4. Drive to blue pickup; verify carrying state and exactly +10 score. Drive to green delivery; verify +100 more and deliveries +1.
5. Drive into obstacle; verify score never goes negative and repeated contact respects the 0.5-second penalty cooldown.
6. Toggle Scripted AI on; verify mode and pressed state, observe a complete pickup-to-delivery loop without manual input, and record any stuck waypoint.
7. Toggle Scripted AI off mid-route; verify manual control resumes without stuck inputs.
8. Press Restart during manual movement and during Scripted AI; verify score 0, deliveries 0, no carried package, Manual mode, and no held input.
9. Switch tabs, lock screen, or background Safari while holding Drive; on return verify no runaway movement.
10. Check readable controls and 44px minimum tap targets at 320px/430px viewport-equivalent widths where applicable; test VoiceOver focus labels and announce changes.
11. Run for 5 minutes and record frame-rate impression, overheating, and battery/performance concerns; note that these are manual observations, not benchmark data.

## Cross-platform release gates
- Align collision penalty, cooldown, mission count, reset and time limit against the approved versioned contract (#99 / #115); current proposals are not final.
- Roblox PR #103 requires **Roblox Studio import and playtest**, not only Luau syntax checks. Do not attribute authorship to Grok without commit/PR evidence.
- Verify a working iPhone/iPad game URL separately before sharing it as playable.
- No trained AI, robotics simulator, marketplace payments, or hardware integration is in this scope.
- Phase 1 budget ceiling THB 20,000; no spending or vendor commitments authorized by this document.

## Evidence log (fill only after real-device execution)
| Device / OS / Safari | Commit | Date | Cases passed | Failures | Evidence |
| --- | --- | --- | --- | --- | --- |
| NOT RUN | — | — | 0 | — | — |
