# Partner Robot Showroom — evidence ledger (2026-11-09)

This document records what can be stated publicly **without** suggesting that BOTKET has inventory, a dealership, a signed partnership, or integrated hardware. Tracker: #119; preview PR: #120. No manufacturer images, logos, or 3D assets are authorized by this ledger.

| Current card | Manufacturer / exact model | Evidence | Public label | Numeric specifications | Artwork | Gate |
| --- | --- | --- | --- | --- | --- | --- |
| AgiBot X2 family | AgiBot; **X2 Ultra exact variant unverified** | [AgiBot official site](https://www.agibot.com/); [X2 SDK docs](https://x2-aimdk.agibot.com/en/dev/get_sdk/index.html) (model applicability must be verified) | Manufacturer Reference · Concept Preview · Not Integrated | **Do not publish** until checked against a model-specific official specification | Original generic inline SVG, not product likeness | Confirm exact variant, specs and permission/attribution before upgrading |
| Delivery AMR | No identified manufacturer/model | [Robot City development PR #102](https://github.com/nitinagin/botket/pull/102) | BOTKET Concept · Not Integrated | None; illustrative mission only | Original generic inline SVG | Replace with a named manufacturer model only after evidence review |
| Pick-and-place arm | No identified manufacturer/model | Internal concept only | BOTKET Concept · Not Integrated | None | Original generic inline SVG | Replace with a named manufacturer model only after evidence review |

## Required evidence before promoting a card to a real-model catalog listing

1. Exact manufacturer and model/variant, with an official model-specific source URL and dated evidence of each displayed numeric specification.
2. Use case described as **proposed** unless the manufacturer documents the capability for that exact model.
3. Independent rights review for any official image, logo, CAD/URDF or video; otherwise keep original generic illustration.
4. Partnership status separately evidenced (public documentation ≠ partner conversation ≠ signed reseller authorization). Without proof, label **Manufacturer Reference**, not partner or available inventory.
5. No price, stock, demo booking, checkout, compatibility, trained AI, simulation, transactions, or hardware control claims without evidence.
6. Before merge/deploy: run `node tests/partner-showroom-static.cjs` at the actual PR HEAD, capture exit code/CI URL, inspect 320px and iPad Safari, verify safe external links and non-regression of consumer prototype. No deploy without these gates.

## Phase 1 separation

The showroom is a static, standalone concept catalog. Robot City remains **one city / one playable robot**, scripted pickup/drop-off and scoring. Roblox Studio playtest and Grok authorship are unverified until independent evidence is attached. Total Phase 1 budget ceiling: THB 20,000; this ledger authorizes no spend or contract.
