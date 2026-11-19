# Robot City Phase 1 — web/Roblox scoring parity review (proposal)

**Status: review only, 2026-11-03.** This is a source-level comparison of draft PR #102 (browser) and draft PR #103 (Roblox). It is **not** an implemented shared schema, tested Roblox Studio build, published competition rule, or proof of cross-platform score comparability. Keep both PRs unmerged until their independent release gates pass.

## Source observations

| Dimension | Browser/iPad (PR #102, `robot-city.html`) | Roblox (PR #103, `roblox/src/shared/ChallengeConfig.luau`) | Parity |
| --- | --- | --- | --- |
| Arena | One 960 × 600 canvas coordinate arena | One 120 × 120 stud arena | Different units/layouts |
| Robot | One manually controlled/scripted robot | One robot configuration | Same concept; physics not equivalent |
| Delivery loop | One pickup/drop pair reused after each delivery | Three sequential pickup/drop missions | Different challenge length |
| Pickup reward | +10 points | +10 points | Matches |
| Delivery reward | +100 points | +100 points | Matches |
| Collision penalty | −1 point, minimum score 0, 0.5 s cooldown | Configured −5 points, 0.75 s debounce | **Mismatch** |
| Time limit | No round timer in current browser prototype | Configured 240 seconds | **Mismatch** |
| Automation | Fixed scripted waypoints, no trained model | Scripted waypoints with short raycasts (source claim) | Different implementations, unverified parity |
| Testing | Automated Node/headless Chrome checks; physical iPad Safari still unverified | Source syntax/lint reported in PR; Roblox Studio import/playtest unverified | Not equivalent evidence |

These are **implementation-specific demo scores**. Do not combine them into a leaderboard or claim a shared ranking. Neither build implements the versioned Challenge Schema proposed in issue #99.

## Proposed minimal Phase 1 scoring contract — requires review

1. Define a single `rulesVersion` and `challengeId` in the future schema, with explicit `demoOnly: true` and `scoring.final: false` until the rules are approved.
2. Keep the already matching base events as proposed values: pickup +10; successful delivery +100. Specify whether points apply once per mission and how a restart clears them.
3. **Decide** a common collision penalty, debounce window, and score floor before any parity claim. The existing −1/0.5 s and −5/0.75 s values are intentionally documented as a conflict, not silently reconciled.
4. **Decide** whether Phase 1 uses a timed round, a fixed number of deliveries, or both. The browser's repeatable single delivery and Roblox's three sequential missions are not comparable today.
5. Declare units, arena dimensions, collision geometry, spawn, route, and permitted manual/scripted controls separately for each platform. Do not claim equal difficulty from matching point values.
6. For each local score record, propose `platform`, `buildSha`, `rulesVersion`, `track`, `manualOrScripted`, `pickupCount`, `deliveryCount`, `collisionCount`, `elapsedSeconds`, and `score`. These are **future schema fields only**; no data is uploaded, verified, or stored today.
7. Use `declared-unverified` for any robot/skill compatibility until a defined verification process exists. Do not label scripted navigation as trained AI or a physics simulator.

## Verification gates before any shared scoring claim

- [ ] Approve the common scoring values, mission length, and rules version in issue #99; update both implementations in separate reviewed PRs.
- [ ] Add deterministic tests for pickup, delivery, collision cooldown/floor, restart, and manual/scripted mode in each implementation.
- [ ] Pass browser CI and real iPad Safari controls/performance/VoiceOver acceptance from `docs/robot-city-ipad-safari-qa.md`.
- [ ] Import Roblox source into Studio and record a real Playtest (touch controls, all missions, scoring, reset, scripted movement); attach build/commit evidence.
- [ ] Verify demo URLs independently; do not merge/deploy untested builds or change the consumer prototype.
- [ ] Record actual Phase 1 spend against the THB 20,000 ceiling; no purchases or commitments without explicit approval.

## Scope safeguards

No live simulation, model training, marketplace payment, physical robot integration, registration, or online leaderboard exists in this proposal. The source comparison does not establish that Grok authored PR #103. This document makes no purchase, vendor, or deployment commitment.

Related: issue #101 (approved Phase 1), issue #99 (schema proposal), draft PR #97 (Guild Challenge UI), draft PR #102 (browser), draft PR #103 (Roblox).
