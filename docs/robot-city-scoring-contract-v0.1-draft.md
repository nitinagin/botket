# Robot City Phase 1 — scoring contract v0.1 (PROPOSAL ONLY)

Status: **draft for review**, not adopted rules. Related: #99, #101, #102, #103. This document does not claim web/Roblox parity, device QA, or published gameplay.

## Scope and canonical events

One arena, one robot model, three sequential pickup/dropoff missions for the **comparison fixture**. Each implementation should emit an ordered event log with: `rulesVersion`, `missionIndex` (0-based), `eventType` (`pickup`, `delivery`, `collision`, `timeout`, `restart`), `elapsedMs` (integer >= 0), and `scoreAfter`. A pickup is valid only once per active mission; delivery requires its pickup. Duplicate pickup/delivery events do not award points. A restart resets mission progress, timer, collision counter and score. The log is local demo evidence, not a server submission.

## Proposed scoring fixture (NOT final)

- Valid pickup: +10 points, once per mission.
- Valid delivery: +100 points, once per mission.
- Collision: -5 points, with floor at 0; collision detection and debounce must be defined consistently before parity can be claimed.
- Timeout: stop the round, no further score changes. **Time limit TBD**; do not assume existing implementations agree.
- Three successful deliveries with no collision: 330 points.
- One successful pickup and delivery: 110 points (illustrative web result, not proof of Roblox equivalence).
- Example trace: pickup(10), collision(5), delivery(105), restart(0), pickup(10).
- Timer does not currently award bonus points. Ties, replay determinism, collision debounce and elapsed-time handling remain open decisions.

## Acceptance checklist

- [ ] Confirm current web and Roblox scoring constants and semantics against this proposal; record any differences rather than silently changing either.
- [ ] Agree `rulesVersion` and freeze an identical three-mission fixture across both implementations.
- [ ] Run fixture event sequences on both platforms and compare `scoreAfter` after every event, including duplicates, invalid delivery, collision at zero, timeout and restart.
- [ ] Test actual iPad Safari touch controls, focus loss and manual/scripted transitions.
- [ ] Import and playtest Roblox Luau in Roblox Studio, including touch controls and restart.
- [ ] Record test environment, commit SHA, screenshots/logs and reviewer signoff before merge or deploy.

## Explicit non-goals

No trained AI, simulation fidelity claim, leaderboard, backend, real hardware integration, payments, or marketplace. The scripted waypoint controller must be described as scripted automation, not AI training. Keep the consumer prototype unchanged. No spend or commitments authorized; Phase 1 cap THB 20,000.
