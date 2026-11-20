# Robot City Phase 1 — scoring contract proposal (NOT APPROVED)

Status: **proposal only**. Related: #99, #101, #102, #103, #106, #114. This document is not a live shared schema and does not change game behavior.

## Current observed mismatch (2026-11-07)

| Rule | Browser PR #102 | Roblox PR #103 |
| --- | --- | --- |
| Pickup | +10 | +10 |
| Delivery | +100 | +100 |
| Collision penalty | -1 | -5 |
| Collision cooldown | 500 ms | 750 ms |
| Mission completion | Repeating loop | Three deliveries |
| Round time limit | No equivalent verified | 240 seconds |

Do not compare scores across platforms until these differences are resolved and tested.

## Proposed common contract for review

- **Arena:** one city, one robot model, one pickup/dropoff mission type.
- **Score:** pickup +10; successful delivery +100; collision -1; clamp total to >= 0.
- **Collision cooldown:** 500 ms from the last penalized collision; collisions within the window do not subtract additional points.
- **Mission:** repeat pickup and delivery, counting completed deliveries. A finite three-delivery competition round may be added only after both implementations agree.
- **Timer:** no round time limit for the initial parity milestone. Display elapsed time if desired; do not silently apply a 240-second cutoff on one platform.
- **Reset:** restore score, completed deliveries, robot position, payload state, elapsed time and collision cooldown to initial values.
- **Autonomy:** scripted waypoint navigation only; no trained AI claims.

These are **recommendations**, not approved final challenge rules. No production implementation should be changed solely because of this document. The Challenge Schema in #99 remains a proposal.

## Acceptance tests required before parity claim

1. Both platforms: first pickup adds exactly 10; successful dropoff adds exactly 100; cannot award the same pickup or dropoff twice without a valid state transition.
2. Collision subtracts 1 once; second collision within 499 ms does not subtract; collision after >= 500 ms subtracts again; score never falls below zero.
3. Reset clears cooldown, payload and counters; restart does not leave a stale timer or waypoint target.
4. Both platforms implement the same mission completion/round-ending rules.
5. Test desktop browser and real iPad Safari; separately import and playtest Roblox in Roblox Studio with touch controls.
6. CI and review must pass before merge/deploy. Do not alter consumer prototype.

## Evidence and boundaries

PR #114 previously passed implementation cooldown CI at `ed6d855c2b724fb9027c9b7ada0023e19910f1c1` (Actions run #42288949540). This does **not** establish Roblox parity or iPad QA. No Grok authorship, Roblox Studio testing, simulation, trained AI, marketplace transactions, or hardware integration is asserted.

Budget ceiling: THB 20,000 total. This documentation change costs THB 0; cumulative spending remains unverified. No purchases, commitments, merges or deployments are authorized by this proposal.
