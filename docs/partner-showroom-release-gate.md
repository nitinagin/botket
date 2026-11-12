# Partner Robot Showroom — release evidence gate (Issue #119)

Status: **DRAFT / NOT DEPLOYED**. This checklist is documentation, not proof of acceptance.

## Current content inventory
| Card | Classification | Manufacturer specification evidence | Asset rights |
| --- | --- | --- | --- |
| AgiBot X2 family | Manufacturer reference only; not confirmed partner | Exact X2 Ultra specifications **not verified**. Do not add numerical claims until a model-specific manufacturer URL and access date are recorded. | Generic BOTKET-authored inline SVG; no official imagery/3D assets |
| Delivery AMR | Generic BOTKET concept, not a named partner model | Not applicable until a specific verified manufacturer/model is selected | Generic inline SVG |
| Pick-and-place arm | Generic BOTKET concept, not a named partner model | Not applicable until a specific verified manufacturer/model is selected | Generic inline SVG |

A public SDK, manufacturer site or conversation does not establish an approved partnership, rights to use branding, or hardware compatibility.

## Evidence required before merge or deployment
- [ ] Record a dated model-specific official manufacturer page for any **specific** spec shown, and quote the precise parameter and units. Keep claims absent until verified.
- [ ] Record a contact/permission artifact separately before labeling any card a confirmed partner.
- [ ] Record original SVG provenance or license for any new assets. No hotlinked product images, logos, URDF or 3D files without documented rights.
- [ ] From the repository root run `node tests/partner-showroom-static.cjs` and record command, Node version, exit code, commit SHA and complete output.
- [ ] Run real browser checks at 320px and 430px widths, tablet portrait/landscape, keyboard navigation, link destinations and external-link safety; attach dated screenshots.
- [ ] Test on an actual iPad Safari device, recording iPadOS/Safari version, device, result, screenshot and any accessibility issue.
- [ ] Verify that the showroom is separate from the Consumer Prototype and from the single playable Robot City robot. Record a consumer non-regression check.
- [ ] Check PR #102 independently for gameplay acceptance; do not present its PR link as a deployed demo URL.
- [ ] Check Roblox Studio import/playtest separately on PR #103. Do not assign authorship to Grok without commit provenance.
- [ ] Obtain review approval before any merge/deploy. No paid assets, services or commitments without explicit approval; Phase 1 ceiling THB 20,000.

## Evidence log (fill only after execution)
| Date (TZ) | SHA | Test/device | Result | Evidence URL or attachment |
| --- | --- | --- | --- | --- |
| Pending | Pending | Node.js suite / iPad Safari / consumer regression | **NOT RUN / NOT VERIFIED** | Pending |

## Scope boundary
This is a **static visual preview**, not robot simulation, trained AI, a hardware integration, a marketplace transaction, or a verified manufacturer partnership.