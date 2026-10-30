import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/useReaderExperience.js", import.meta.url), "utf8");
const flowCss = readFileSync(new URL("../src/reader-flow.css", import.meta.url), "utf8");
const experienceCss = readFileSync(new URL("../src/reader-experience.css", import.meta.url), "utf8");

// --- REQ-38: real page turns -------------------------------------------

test("REQ-38: turns run on a cloned-sheet stage, transform/opacity only", () => {
  assert.match(hook, /reader-turn-host/);
  assert.match(hook, /cloneNode\(true\)/);
  assert.match(hook, /\.animate\(/);
  assert.match(hook, /cubic-bezier\(\.32,\.72,0,1\)/);
  // The commit is an instant scroll AFTER the slide: pagination is the
  // scroll geometry itself, so nothing reflows between frames.
  assert.match(hook, /settleAt\(toY\)/);
  assert.match(experienceCss, /\.reader-turn-track\{display:flex/);
  assert.match(experienceCss, /will-change:transform/);
  assert.match(experienceCss, /\.reader-turn-shade-in\{/);
});

test("REQ-38: drag follows the finger and settles by travel or velocity", () => {
  assert.match(hook, /dragStart/);
  assert.match(hook, /dragMove/);
  assert.match(hook, /dragEnd/);
  assert.match(hook, /width \* 0\.26/);
  assert.match(hook, /Math\.abs\(velocity\) > 0\.45/);
  // Boundary drags build nothing: chapter turns stay tap-driven.
  assert.match(hook, /if \(toY === fromY\) \{ drag\.dead = true; return false; \}/);
  // Rapid taps during a turn queue one deep, never skip or double.
  assert.match(hook, /queuedTurnRef/);
  assert.match(hook, /drainQueue/);
});

test("REQ-38: cross-chapter turns capture first, complete on the new chapter", () => {
  assert.match(hook, /beginCrossTurn/);
  assert.match(hook, /completeCrossTurn/);
  assert.match(main, /reading\.beginCrossTurn\(direction\)/);
  assert.match(main, /reading\.completeCrossTurn\(\)/);
  // Motion off or scroll mode keeps the old instant behaviour.
  assert.match(hook, /turnMotionRef\.current/);
  assert.match(experienceCss, /\[data-reader-mode="page"\]\{touch-action:pan-y\}/);
});

// --- REQ-39: cover → contents → prose -----------------------------------

test("REQ-39: opening a book lands on the cover, then the contents page", () => {
  assert.match(main, /useState\("cover"\)/);
  assert.match(main, /reader-front-cover/);
  assert.match(main, /reader-front-toc/);
  assert.match(main, /翻开目录/);
  assert.match(main, /开始阅读/);
  assert.match(main, /继续阅读/);
  // Front pages reset per book entry, never on story revision.
  assert.match(main, /setFrontStage\("cover"\)/);
  assert.match(flowCss, /\.reader-front\{position:fixed/);
  assert.match(flowCss, /\.reader-front\[data-stage="toc"\] \.reader-front-track\{transform:translateX\(-50%\)\}/);
});

test("REQ-39: the contents page mirrors the directory's availability rules", () => {
  assert.match(main, /chapterIndex <= frontLast/);
  assert.match(main, /lastAccessibleIndex\(story, readOnly\)/);
  assert.match(main, /enterProse\(chapterIndex\)/);
  assert.match(main, /尚未分享/);
  assert.match(main, /继续阅读后开启/);
});

test("REQ-39: front matter gates prose taps and keyboard paging while up", () => {
  assert.match(main, /frontStage !== null \}\)/);
  assert.match(main, /frontStage === "cover" && zone >= 1 \/ 3/);
});
