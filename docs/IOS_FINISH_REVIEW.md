disposition: fix

No approved comp or standalone QUALITY BAR card was supplied for this code-led build; the ceiling is judged against the supplied Apple/Emil standards. `main.jsx` was sampled, not exhaustively read; live motion, configured Firebase authentication, and remote services are outside this static review.

## persistence

Pass for this review stage: `PRODUCT.md`, `docs/UI_SURFACE_BRIEF.md`, and the direction contract in `index.html` describe the replacement user-pinned iOS world. `DESIGN.md` still describes the replaced vermilion/serif/ink-outline world and is explicitly scheduled for the new-world documenter pass after fixes; it is not current visual authority and that documentation must be completed before final handoff.

Evidence passes: all 60 required `{320,390,445,1440}-{home,account,worlds,character,ability,opening,reader,preferences,night-reader,decision,directory,store,merge,merged,returning}.png` captures exist, decode, show the named state, and were visually inspected. Their full-page dimensions and the 1425 px desktop content width on scrollbar-bearing pages are consistent with `visual-report.json`; no missing, blank, or malformed capture was found. The 445×621 user viewport is included. Fixed chrome inside the viewport portion of a full-page capture is not a page-end overlap defect. No second detector ran.

## fidelity

| Element / promise | Judgment | Evidence |
| --- | --- | --- |
| TYPE | Match | System sans, distinct weight/size hierarchy, and restrained tracking follow the explicit iOS override; replacing the historical serif is authorized by the latest user request and current brief. |
| MATERIAL | Match | Actual narrative raster artwork remains visible; blurred translucent navigation, cover-copy layers, and sheets establish depth. Novel prose remains on a solid surface. No fake painted or embossed focal material. |
| GROUND | Match | Cool-white fields and blue actions match OWN-WORLD; pale lilac/blue atmospheric color does not return to the discarded warm-paper palette. The selected night-reader ground is an authorized reading preference. |
| THESIS | Match | A personal illustrated story remains the dominant object; familiar grouped controls support it. |
| STORY | Match | Four-step creation, reading, chapter decisions, sample/local sharing labels, two originals, and an independent merged result retain the product flow. |
| FIRST VIEWPORT | Match | Every home width retains the artwork, readable protagonist promise or returning-book title, visible primary action, and phone navigation capsule. |
| FORM | Match | Seed `3d363c0a` is present in the contract and current brief; the parent explicitly corroborates the pre-build concept roll, assigned index 6, and pinned-user override. Sampled source has 220 ms scene/sheet entry, quiet 140 ms chapter motion, keyboard/reduced-motion suppression, and reduced-transparency fallbacks. Static captures do not certify temporal smoothness. |
| Responsive translation | Adaptation | Desktop sidebar/setting preview and phone bottom navigation/sheets implement the brief's phone-first workflow without changing content order or story semantics. |
| Night navigation | Contradicted | `1440-night-reader.png`: the selected sidebar label/icon nearly disappears. Night chrome supplies `#bed7ff`, while the active tile retains `#e2edff`; calculated contrast is 1.24:1. |
| Truth and assets | Match within scope | Store stories and the secondary merge protagonist are labeled examples; account service is explicitly unconfigured and guest continuation remains available; local saving is named. No commercial, paid, or cloud-sync success is implied. Parent reports 8 raster provenance records with none missing. |

## ceiling

The native-material treatment is present across navigation, grouped controls, account/directory/reading sheets, and cover actions. Immediate press states, focused reading typography, platform font use, and solid accessibility fallbacks are supported by the sampled source. Gesture-driven dismissal is intentionally not promised by the brief. No further ornament or decorative motion is required; the remaining ceiling defect is loss of selection legibility in desktop night mode. Motion quality on physical hardware and real authentication are not established by these captures.

## material_fixes

| Before | After | Why |
| --- | --- | --- |
| 1. In `src/reading-preferences.css`, night sidebar chrome changes the active foreground to `#bed7ff`; `src/styles.css` leaves `.side-nav-item.active` on `#e2edff`. | Give the night active item a dark selected fill with a clearly contrasting label/icon, or retain dark-blue foreground on its light fill; verify at least 4.5:1 for the label and 3:1 for the icon, then recapture `1440-night-reader.png`. | Floor / native wayfinding: the current 1.24:1 selection is visibly unreadable. |

## keep

Keep the real world illustrations, visible first-book/continue-reading action, quiet solid prose surface, non-blocking guest path, explicit local/example labels, and the two-originals-to-third-book model.

---

## verdict

| Finding | Before | After | Score |
| --- | --- | --- | --- |
| Desktop night selected navigation | `#bed7ff` on `#e2edff`, 1.24:1 contrast | Re-read `1440-night-reader.png`: the selected tile is visibly dark with a legible light-blue label/icon. Source confirms `#bed7ff` on `#2d394e`, 7.94:1 contrast. | Resolved |

## remaining

Clear. No regression from this fix is visible in the recaptured desktop night surface. This ship verdict covers the scored fix only, not a new full-surface review; the planned documenter handoff remains part of the parent workflow.

disposition: ship
