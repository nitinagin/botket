# BOTKET Robot City — physical iPad Safari QA (Phase 1)

**Status: NOT TESTED on a physical iPad.** This is a manual acceptance checklist for draft PR #102, not evidence that any check has passed. Chrome device emulation and synthetic PointerEvents do not substitute for iPad Safari.

## Preconditions and evidence

- Test the exact preview build/commit SHA from PR #102, served over a temporary local or review URL. Record URL and SHA; do not merge or deploy to the public site just to run this checklist.
- Record device model, iPadOS version, Safari version (if available), orientation, date/time, and tester. Do not record personal accounts or identifying data.
- For each check, mark **PASS / FAIL / NOT RUN**, capture reproducible steps and screenshots/video if a failure occurs, and file an issue referencing the commit. Do not count NOT RUN as PASS.
- Run both portrait and landscape; test with standard text size and, where possible, enlarged text and VoiceOver.

## Required checks

| ID | Action on a physical iPad | Expected outcome |
| --- | --- | --- |
| IPAD-01 | Open `world.html`, follow Robot City link, and return via BOTKET link. | Links work, no blank page, and the existing consumer prototype is unaffected. |
| IPAD-02 | Rotate between portrait and landscape, including narrow Split View if supported. | No horizontal document scrolling; arena fits viewport; buttons remain usable and at least 44 × 44 CSS px. |
| IPAD-03 | Hold **Drive**, release; then hold **Reverse**, release. | Robot moves in correct direction while held and stops after release. |
| IPAD-04 | Hold **Drive** and **Turn right** simultaneously with two separate fingers; release one, then the other. Repeat with left turn. | Robot moves and turns together; releasing turn stops turning while drive remains held; releasing drive stops all motion. |
| IPAD-05 | Start moving, then interrupt the touch with Control Center, app switch, incoming notification, or tab navigation. | No stuck movement on return. A new deliberate touch is required to move again. |
| IPAD-06 | Drive to blue pickup, then green destination. | Pickup adds 10, delivery adds 100, delivery count increments; restart returns score/deliveries to zero. |
| IPAD-07 | Drive into an obstacle repeatedly. | Collision prevents passing through and does not reduce score below zero. |
| IPAD-08 | Turn on **Scripted AI**, then switch app/tab or navigate away and back. | Mode returns to Manual; scripted movement does not resume without explicit user action. |
| IPAD-09 | Restart while holding a movement control; switch Scripted AI on and off. | Held inputs do not become stuck or resume unexpectedly. |
| IPAD-10 | Use an external keyboard (if available), Tab and the Skip to main content link; try VoiceOver. | Focus indicator visible, skip link reachable, controls and state understandable. Record VoiceOver findings separately; automated Chrome tests are not a VoiceOver pass. |
| IPAD-11 | Play for at least 5 minutes, rotate twice, and background/restore twice. | No crashes, significant stutter, lost controls, or unexpected score reset. Note any heat/performance issue. |

## Result record

```text
Build/commit SHA:
Preview URL:
Device / iPadOS / Safari:
Tester / local date:
Orientation(s):
IPAD-01: NOT RUN
IPAD-02: NOT RUN
IPAD-03: NOT RUN
IPAD-04: NOT RUN
IPAD-05: NOT RUN
IPAD-06: NOT RUN
IPAD-07: NOT RUN
IPAD-08: NOT RUN
IPAD-09: NOT RUN
IPAD-10: NOT RUN
IPAD-11: NOT RUN
Defects / links to issues:
Decision: BLOCKED — real iPad QA not completed
```

## Release gate

Do **not** mark iPad Safari verified, merge, deploy, or advertise an investor-ready demo until critical touch safety, scoring, navigation, and backgrounding checks pass on a real device and failures are documented/resolved. Roblox Studio import/playtest is a separate unresolved gate under draft PR #103. Cross-platform scores are **not comparable** until the proposed schema in issue #99 is agreed and implemented. This is a scripted gameplay prototype, not trained AI, a physical-robot simulator, a live marketplace, or a hardware integration.
