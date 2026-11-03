# Phase 1 Robot City — cross-platform acceptance checklist (draft)

Scope: **one city, one delivery robot**, pickup/dropoff, scoring, restart and scripted waypoint navigation. This is a gameplay prototype, not trained AI, a physics-grade simulator or hardware integration.

## Browser / iPad Safari manual QA (not yet executed)
- [ ] Desktop keyboard drive: press, release, blur window; robot must stop when input ends.
- [ ] iPad Safari portrait and landscape: touch steering starts and stops reliably; test `pointercancel` and interrupted gestures.
- [ ] Switch manual → scripted → manual during a mission: no stuck movement, double-scoring or lost controls.
- [ ] Complete pickup and delivery; record score and elapsed time; reset and verify clean initial state.
- [ ] Test VoiceOver labels, focus order, contrast, 44px touch targets and visible focus.
- [ ] Record device, iPadOS/Safari versions, observed FPS/performance, test date and evidence link.

## Roblox Studio manual QA (not yet executed)
- [ ] Import Luau source from PR #103 into a fresh Roblox Studio place.
- [ ] Check Output for errors and confirm one robot/arena and three sequential missions.
- [ ] Test keyboard and touch joystick: start/stop and manual/scripted switching.
- [ ] Complete pickup/dropoff, verify collision penalty, time limit, reset, and no double-scoring.
- [ ] Record Studio version, device, test date, output logs and evidence link.
- [ ] Do not attribute Roblox code to Grok without a verifiable commit/PR or explicit provenance.

## Scoring and schema reconciliation (required before merge)
- [ ] Document both implementations' score increments, collision penalties, mission count and reset semantics.
- [ ] Resolve differences explicitly; **do not claim identical scoring until verified**.
- [ ] Align future shared challenge identifiers and versioned rules with Issue #99 (proposal only).
- [ ] Keep all compatibility declarations `declared-unverified`; no certification claims.

## Release gates
- [ ] Latest branch CI green.
- [ ] Real iPad Safari QA completed with evidence.
- [ ] Roblox Studio playtest completed with evidence.
- [ ] Consumer prototype regression tests pass and existing entry points remain intact.
- [ ] Verified investor demo URLs for each platform; do not label source-only PR as deployed.
- [ ] Budget owner confirms cumulative spend ≤ THB 20,000; no purchase or vendor agreement without approval.

Tracking: #101, #102, #103, #97, #99. This checklist is **documentation only**; it does not mark any manual test as passed.
