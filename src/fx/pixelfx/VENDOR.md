# pixelfx — vendored copy

- Upstream: https://github.com/patch-gg/pixelfx (package `pixelfx`, version 0.3.0)
- License: MIT — see `LICENSE` in this directory (also `NOTICE.md`).
- Pinned commit: `a84159688af3ca37a4be05a0d422b94451b2e24e`
- Vendored on: 2026-10-31 (Storyweave wave PIXELFX-WAVE1)
- Contents copied verbatim from upstream `src/`:
  - `core/` — the runtime every effect imports (15 files).
  - `fx/` — all 21 categories: 244 effect modules + 20 shared `_lib.js`
    helpers + `index.js` / `categories.js` (266 `.js` files total).
- No npm dependency is declared on purpose: the library is zero-dependency
  pure ESM, and a GitHub-direct dependency is unreliable in this project's
  build environment. To upgrade, re-copy `src/core` + `src/fx` from the new
  upstream commit, update the pinned SHA above, and re-run
  `tests/pixelfx-catalog.test.js` (it re-counts and re-imports everything).
- Local modifications: none. Storyweave-side code lives one level up in
  `src/fx/` (`catalog.js`, `player-core.js`, `placements.js`,
  `PixelfxCanvas.jsx`) and never edits the vendored tree.
