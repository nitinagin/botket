# BOTKET customer-facing robot catalog — evidence gate (2026-11-09)

Goal: visitors should see **which identifiable robot models BOTKET can discuss**, their applications and evidence-backed specifications, rather than three generic concept products or illustrative checkout prices.

## Current evidence inventory

| Entry | Identity | Status safe to display | Evidence | Missing before stronger claims |
| --- | --- | --- | --- | --- |
| AgiBot X2 family | Named manufacturer family; **X2 Ultra variant unverified** | Manufacturer reference; Concept Preview / Not Integrated | https://www.agibot.com/ ; https://x2-aimdk.agibot.com/en/dev/get_sdk/index.html | Manufacturer model-specific specification URL, exact variant confirmation, permission for official images/3D, commercial relationship/stock evidence |
| Delivery AMR | Generic BOTKET illustration, **not a manufacturer model** | BOTKET Concept / Not Integrated | https://github.com/nitinagin/botket/pull/102 | Named manufacturer and model, verified specification sheet, partner evidence |
| Pick-and-place arm | Generic BOTKET illustration, **not a manufacturer model** | BOTKET Concept / Not Integrated | No product-specific source | Named manufacturer and model, verified specification sheet, partner evidence |

These entries describe the existing `partner-showroom.html` branch only. They are **not** confirmed products available to order. Do not invent technical figures, pricing, stock, distribution rights, certification, or integration.

## Customer-facing card contract

For every named model show: manufacturer; **exact model and variant**; robot type; two realistic use cases (qualified as proposed where necessary); 2–4 specifications each cited to a model-specific manufacturer source and checked date; one original illustration unless image rights are explicitly documented; a prominent availability/relationship badge; `Concept Preview · Not Integrated`; and a `Request information` action only when a real, privacy-reviewed contact route exists. Otherwise use `Manufacturer information` linking to the source. No demo cart, checkout, illustrative price, or order CTA in this standalone showroom.

Badge rules: **Manufacturer Reference** = public product documentation only. **Partner Discussion** = traceable communication with manufacturer (not authorization to sell). **Available through BOTKET** = verified written authorization/fulfillment route and current availability; neither is established by the current branch. Never present a public SDK as partnership evidence.

## Acceptance and safe release gates

1. Obtain official model-specific datasheets and record exact figures with URLs and dates. If unavailable, omit the figure.
2. Confirm permissions before hosting product photos, logos, CAD/URDF or 3D assets. Original inline SVG placeholders are acceptable.
3. Preserve `partner-showroom.html` as a separate preview: no edits to `consumer.html`, `index.html`, existing consumer cart, or `robot-city.html` as part of catalog work.
4. Run `node tests/partner-showroom-static.cjs` from the checked-out branch and capture exit code, head commit SHA and output. Review assertions after any copy change.
5. Test 320px and 430px phone widths, desktop keyboard, and **real iPad Safari**; record screenshot, date/device and failures. Headless Chrome is not Safari.
6. Keep PR #120 draft and Issue #119 open until evidence and QA are recorded. No merge or deploy on an untested branch.
7. Robot City #102 remains one playable generic robot; Roblox #103 is source-only until an evidenced Roblox Studio playtest. No trained AI, simulation, payments or hardware connectivity claims.

Phase 1 spending ceiling THB 20,000. This document authorizes no purchase, agreement, merge or deployment.
