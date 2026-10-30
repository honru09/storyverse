import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STAGE_SAFE_GAP,
  STAGE_SAFE_TOP_FALLBACK,
  STAGE_SHEET_SAFE_INSET,
  stageParkScrollTop,
} from "../src/profile-stage-guard.js";

/* REQ-48 guard tests. The defect, measured end to end on the
   owner's real state (WebKit 393x852, black theme, real portrait):
   the profile's scroll memories restore a remembered stop
   verbatim; when that stop parks the avatar stage at top=-70
   against a 71px shell topbar, the portrait's head band (-41..45)
   sits entirely behind the bar and every return visit "opens
   headless". The restore paths now park a straddling stage on the
   safe line; these tests pin the geometry. */

test("page form: the measured sliced stop parks the stage on the safe line", () => {
  // scrollY 1080, stage -70.2..411.1, topbar bottom 71 + gap 8 = 79,
  // page max scroll 1109 (measured on the fixture profile).
  const target = stageParkScrollTop({
    scrollTop: 1080, stageTop: -70.2, stageBottom: 411.1, safeTop: 79, maxScrollTop: 1109,
  });
  assert.equal(target, 930.8);
});

test("window form: the measured sheet slice parks below the grab band", () => {
  // Sheet scroll 973, stage -0.2..481.2, sheet top 40 + inset 30 =
  // safe line 70, sheet max scroll 991 (393x667 fixture).
  const target = stageParkScrollTop({
    scrollTop: 973, stageTop: -0.2, stageBottom: 481.2, safeTop: 70, maxScrollTop: 991,
  });
  assert.equal(target, 902.8);
});

test("a stage parked below the line is left alone", () => {
  assert.equal(stageParkScrollTop({
    scrollTop: 926, stageTop: 83.8, stageBottom: 565.1, safeTop: 79, maxScrollTop: 1109,
  }), null);
});

test("a stage scrolled fully past the line is an ordinary position", () => {
  assert.equal(stageParkScrollTop({
    scrollTop: 1500, stageTop: -481, stageBottom: -10, safeTop: 79, maxScrollTop: 1600,
  }), null);
});

test("a hairline straddle still parks, a flush park does not", () => {
  assert.equal(stageParkScrollTop({
    scrollTop: 900, stageTop: 78.4, stageBottom: 559.7, safeTop: 79, maxScrollTop: 1109,
  }), 899.4);
  assert.equal(stageParkScrollTop({
    scrollTop: 900, stageTop: 79, stageBottom: 560.3, safeTop: 79, maxScrollTop: 1109,
  }), null);
});

test("an overscrolled (rubber-band) position parks back inside the range", () => {
  // Transient overscroll past the document end: the park target is
  // the stage's document position minus the safe line, which sits
  // back inside the range on its own.
  const target = stageParkScrollTop({
    scrollTop: 1150, stageTop: -111.2, stageBottom: 370.1, safeTop: 79, maxScrollTop: 1109,
  });
  assert.equal(target, 959.8);
  // And a target genuinely beyond the range clamps to its end.
  assert.equal(stageParkScrollTop({
    scrollTop: 1200, stageTop: 0, stageBottom: 481.3, safeTop: 79, maxScrollTop: 1109,
  }), 1109);
});

test("unusable geometry never parks", () => {
  assert.equal(stageParkScrollTop({
    scrollTop: NaN, stageTop: -70, stageBottom: 411, safeTop: 79, maxScrollTop: 1109,
  }), null);
  assert.equal(stageParkScrollTop({}), null);
  assert.equal(stageParkScrollTop(), null);
});

test("the safe-line constants stay pinned to the measured shell", () => {
  // 84 = the stage's own scroll-margin-top; 30 ≈ the sheet's grab
  // overlay band; 8 = the breathing gap the anchor path leaves.
  assert.equal(STAGE_SAFE_TOP_FALLBACK, 84);
  assert.equal(STAGE_SHEET_SAFE_INSET, 30);
  assert.equal(STAGE_SAFE_GAP, 8);
});

test("main.jsx arms the guard on every profile scroll restore", () => {
  const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(main, /from "\.\/profile-stage-guard\.js"/);
  const arms = main.match(/armRestoredStageGuard\(/g) || [];
  // Two restore sites: ProfileView's view-state restore (window
  // opens and remounts) and the shell's keep-alive restore (own-tab
  // returns, where ProfileView stays mounted).
  assert.ok(arms.length >= 2, `expected >=2 guard arms, found ${arms.length}`);
  assert.match(main, /armRestoredStageGuard\(\{ windowForm, root: pageRef\.current, saved \}\)/);
  assert.match(main, /root: document\.querySelector\("\.page-profile\.is-page-form"\)/);
});
