# READER FIX — audit, study, fixes (2026-10-27)

Scope: the reader route end to end (Reader in `src/main.jsx`, `src/useReaderExperience.js`,
`src/reading-flow.js`, `src/reading-location.js`, `src/reading-preferences.js`,
`src/reader-experience.css`, `src/reader-flow.css`, `src/reading-preferences.css`,
`e2e/reader.cjs`). Working tree only; nothing here is committed or deployed.

## Study notes (ideas only — AGPL sources, no code copied)

- **Librium** (React reader): TOC/search/bookmarks live in one drawer; chapter-turn
  navigation sits at content end; position anchors are designed to survive
  font/layout changes; it requests persistent storage so iOS does not evict the
  library. Storyweave already has the first three (directory dialog, tools dialog,
  chapter-end nav, paragraph+offset anchors in `reading-location.js`). The
  persistent-storage request is a storage-layer hardening, not reader UI — noted
  as deferred below.
- **BookOrbit**: cross-surface progress sync and reading statistics are its
  reader strengths; Storyweave already surfaces per-chapter 字数/预计分钟 in the
  tools dialog and keeps a local position store. Nothing borrowed directly.
- **Impeccable critique pass** (Read mode — precision and restraint win):
  hierarchy and typesetting are sound (see typography audit); the failures were
  all platform-behavior defects (Safari chrome, form-control defaults, dialog
  ergonomics), i.e. the surface read well on desktop and broke at iOS edges —
  matching the user's real-device pain class.

## Typography / layout audit (verified in code + computed styles)

- Measure: `--reader-measure` 38em standard (≈38 CJK chars/line, scales with the
  reader's font size because it is em-based), 44em narrow-margin, 32em wide-margin.
  Inside the comfortable 35–45 char band for Chinese prose.
- Line-height ladder 1.6 / 1.8 / 2.05 / 2.3; font steps 14–32px by 2; paragraph
  spacing 0.6 / 1 / 1.4em with a 2em first-line indent by default — classic
  Chinese novel typesetting, all user-adjustable and persisted.
- Chapter title scales with the reader font size (1.45× clamp) — verified the
  themed rule wins over the legacy fixed clamp in `reader-experience.css`.
- Progress is dual: topline chapter bar (progressbar ARIA) + dock 本章 %.
- Chapter-end stack （选择 → 星图 → 下一章 → 上一章/目录） sits above a bottom
  clearance ledger sized to the fixed dock (100px + safe area; 151px in page
  mode) — reachable, not dock-covered. No change.

## Defects found → fixed

1. **Reader e2e harness silently broken since the plaza landing (00017).**
   `e2e/reader.cjs` expected `开启第一本书` on the first screen; the app now
   lands on the plaza, so the suite timed out at step 1 (reproduced locally,
   30s timeout) and every reader check behind it had stopped running.
   Fix: enter through the plaza's 我的世界 slim row first. Added regression
   checks for defects 2, 3 and 4 to the same suite.

2. **iOS focus zoom on the in-book search input.** Probe (Chromium, current
   build): the search input in 查找与书签 computed at **13px**. Root cause is
   precise: `styles.css:231` already gives form controls `font: inherit`, and
   `styles.css:232` sets the 16px field size — but its selector enumerates
   `input[type="text"], input:not([type]), textarea, select`. The reader's
   search box is `type="search"` (the app's only one), so it fell through to
   the UA default 13px, and iOS Safari auto-zooms any focused input under
   16px, yanking the reader out of the dialog. Fix (scoped to the reader on
   purpose — widening line 232 would also drag its dark-glass field box
   styling into the themed dialog): `.reading-tools input { font-size: 1rem }`
   in `reader-experience.css`, next to the rule that already themes it.

3. **Rubber-band overscroll flashes the app navy under light reader themes.**
   Probe: `body` background `rgb(6, 13, 31)` while the reader page is
   `rgb(247, 242, 231)`; `html` has no background, so iOS paints the
   overscroll region from the body. Fix: `body:has(.page-reader[data-reader-theme…])`
   rules mirroring all six theme grounds (incl. system-dark via media query)
   in `reading-preferences.css` — same `:has()` support floor the shell
   theming already relies on (iOS 15.4+).

4. **Chapter directory opened at the top of the list.** `ChapterDirectory`
   had no scroll management at all (code inspection), rows are 56px, a season
   is 24 chapters and a long book 100, the dialog is ≤85dvh — the current
   chapter could sit thousands of px below the fold. Fix: on open, center the
   `[aria-current="page"]` row inside the dialog's own scrollport (rect math
   against the dialog only; the page behind the modal never scrolls),
   re-applied by a short timer loop until the row lands — see verification
   note (b) for why timers, not rAF.

5. **No `-webkit-text-size-adjust` anywhere.** Probe: computed `auto`, so
   iPhone landscape inflates text beyond the size the reader picked. Fix:
   `html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }`.

6. **Two conflicting `.page-reader` min-heights.** `reading-preferences.css`
   said `calc(100dvh - 4.5rem)` (a leftover from when the shell topbar still
   showed over the reader); `reader-experience.css` says `100dvh`. Probe
   showed 100dvh winning (844px at an 844px viewport) — the other rule was
   dead but invited future cascade accidents. Fix: dead declaration removed;
   `100vh` fallback lines added before the `100dvh` declarations of
   `.page-reader` and `.app-shell` so pre-15.4 iOS degrades to a full-height
   shell instead of none.

## Checked and deliberately left alone

- Lenis smooth scroll: `syncTouch: false` — touch stays native on iOS; wheel
  smoothing is desktop-only. Not a reader defect.
- Fixed dock vs `page-in` transform: the keyframes end at `transform: none`,
  so the dock's fixed positioning is correct after the 320ms entrance.
- Sticky topline + hide-on-scroll (00013): verified working by the e2e
  topline check; hidden state uses `visibility` so prose never reflows.
- Settings inputs are full-card overlay radios (00013 fix) — untouched.
- Long-chapter rendering: chapters are tens of paragraphs (e2e stress fixture
  uses 22 long ones without issue); `content-visibility` would fight the
  rect-based position capture/restore. Deferred until there is jank evidence.
- `navigator.storage.persist()` (Librium idea): real iOS localStorage eviction
  risk, but it belongs to the persistence layer, not this reader batch.

## Verification (actual runs, 2026-10-27)

- Unit suite: **451/451 pass** (`npm test`); production build passes (`npm run build`).
- Reader e2e, Chromium: **320 / 390 widths — 10/10 checks each, deterministic**
  (includes the three new regression checks: body==theme background across all
  six themes + system-dark, search input ≥16px, directory opens on the current
  chapter). **1440 (desktop) — 10/10 in isolated runs, but the topline check is
  flaky in full-suite runs** (identical code observed pass and fail): the
  fixture's programmatic scroll sequence races Lenis' initialization on the
  desktop view — Lenis can re-assert its scroll state after the synthetic
  scrolls, so the hide flag never lands. Real desktop input is wheel-driven
  through Lenis itself and does not hit this; mobile widths are unaffected
  (Lenis is touch-passive). Left as a documented harness flake, not an app change.
- Reader e2e, WebKit (Playwright): **10/10 pass at 390** — the suite does run
  locally now (earlier "missing system libs" no longer holds in this
  environment). Two WebKit behaviors found and fixed along the way:
  (a) coalesced scroll events only dispatch while a page task is alive — the
  topline check now settles inside its evaluate for WebKit (UA-gated; the same
  settle breaks Chromium+Lenis, hence the gate);
  (b) **headless WebKit produces no rAF for an occluded page** — the first
  rAF-scheduled directory scroll never ran. The app fix is therefore
  timer-driven (see defect 4), which is also the safer scheduler on-device.
  Direct instrumentation (geometry snapshots) confirmed the defect-4 math:
  without the fix the current row sat at y=921 in a 127–844 dialog; after a
  late application it centers exactly (row center = dialog center).
- Post-fix computed-style probes: search input **16px** (was 13px);
  `-webkit-text-size-adjust` **100%** (was `auto`); body background equals the
  reader theme background for all six themes incl. system-dark; `.page-reader`
  min-height resolves to the single intended `100dvh` rule.
- Screenshots self-inspected (`reader-fix-shots/`): prose (measure ≈19–20
  chars/line at 18px on a 390 viewport, 2em indent, even leading), settings
  sheet, directory (current chapter 10 centered and highlighted on open),
  chapter-end choice block at 32px (cards + dock + page controls all clear).

## Remaining iOS real-device checklist (cannot be proven headlessly)

1. Rubber-band overscroll on a light theme: no navy flash at top/bottom edges
   (defect 3 — `body:has()` repaint; headless WebKit cannot emulate the
   overscroll paint).
2. Focus the in-book search field: keyboard opens with **no page zoom**
   (defect 2 — Safari zooms on the computed size; Chromium/WebKit-headless
   prove the size, not Safari's gesture).
3. Landscape reading: text stays at the chosen size (defect 5).
4. Directory at a late chapter (24-chapter season, ~chapter 20): opens with
   the current row already centered — same code path as the headless WebKit
   pass, but Safari's top-layer layout timing on hardware is the real test.
5. Topline hide/show while thumb-scrolling (momentum): no half-covered line,
   no flicker — headless scrolls are programmatic, not momentum gestures.
6. Safe areas on a notched device in the installed (standalone) form: dock
   clears the home indicator; sticky topline clears the notch in landscape.
7. Position restore after rotating the device mid-chapter (the resize path
   re-anchors; rAF starvation in a backgrounded tab is covered by the
   visibilitychange/pagehide flush, but rotation on hardware is untested).
8. Long-session memory: a 100-chapter long book's directory (100 rows +
   starmap) opens without jank on a mid-tier iPhone.
