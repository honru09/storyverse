import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/useReaderExperience.js", import.meta.url), "utf8");
const pager = readFileSync(new URL("../src/components/ReaderPager.jsx", import.meta.url), "utf8");
const pagerCore = readFileSync(new URL("../src/reader-pager.js", import.meta.url), "utf8");
const flowCss = readFileSync(new URL("../src/reader-flow.css", import.meta.url), "utf8");
const experienceCss = readFileSync(new URL("../src/reader-experience.css", import.meta.url), "utf8");

// --- REQ-46: pre-paginated whole-page turns (clone engine retired) ------

test("REQ-46: the clone-sheet engine is gone from every layer", () => {
  for (const source of [main, hook, pager, experienceCss]) {
    assert.doesNotMatch(source, /cloneNode\(true\)/);
    assert.doesNotMatch(source, /reader-turn-(host|track|sheet|shade)/);
    assert.doesNotMatch(source, /cloneIntoSheet|buildStage|queuedTurnRef|drainQueue/);
  }
});

test("REQ-46: paged mode renders the pre-paginating ReaderPager in one fixed container", () => {
  assert.match(main, /import ReaderPager from "\.\/components\/ReaderPager\.jsx"/);
  assert.match(main, /readingMode === "page" \? \(\s*<ReaderPager/);
  assert.match(main, /registerPager=\{reading\.registerPager\}/);
  assert.match(main, /onSettle=\{reading\.notePagerSettle\}/);
  // The chapter-end matter is one definition hosted by both modes.
  assert.match(main, /const endMatter = \(/);
  assert.match(main, /endMatter=\{endMatter\}/);
  // The window never scrolls in paged mode; the pager viewport is the
  // fixed stage between the hairlines.
  assert.match(experienceCss, /\[data-reader-mode="page"\]\{touch-action:pan-y;height:100dvh;overflow:hidden\}/);
  assert.match(experienceCss, /\.reader-pager\{position:relative;overflow:hidden/);
  assert.match(experienceCss, /\.reader-pager-track\{display:flex;height:100%;will-change:transform\}/);
  assert.match(experienceCss, /\.reader-pager-page\{position:relative;flex:0 0 100%;height:100%;overflow:hidden;background:var\(--reader-bg\)\}/);
  // The reader's DOM contract survives in paged mode: every rendered
  // slice stays addressable by its source paragraph index, exactly
  // like the scroll-mode article's paragraphs (e2e + find rely on it).
  // REQ-47: track pages keep the contract verbatim; only the curl
  // overlay copies render decorative (no paragraph anchors).
  assert.match(pager, /decorative \? \{\} : \{ "data-reading-paragraph": segment\.p \}/);
});

test("REQ-46: pagination measures real line boxes and packs whole lines only", () => {
  // Measurement typesets the chapter in a hidden host with the
  // article's own structure and reads Range line geometry.
  assert.match(pager, /reader-pager-measure/);
  assert.match(pager, /getClientRects\(\)/);
  assert.match(pager, /packPages\(lines, h,/);
  // Pages render the chapter's own text sliced at line boundaries —
  // never a cloned layout.
  assert.match(pager, /paragraphs\[segment\.p\] \|\| ""\)\.slice\(segment\.start, segment\.end\)/);
  assert.match(pagerCore, /export function packPages/);
  // The end matter is a real final page; progress is by page.
  assert.match(pager, /reader-pager-end/);
  assert.match(pagerCore, /export function progressForPage/);
});

test("REQ-46: turns slide the whole-page track; drag is 1:1 and spring-settled", () => {
  assert.match(pager, /track\.animate\(/);
  // REQ-47 retune (user-ordered "harmonious" easing): the slide now
  // runs 360ms on cubic-bezier(.3,.7,.25,1) with a softer release
  // spring (omega 15); the guard follows the retune like the FIX2
  // precedent, it does not pin the retired REQ-46 curve.
  assert.match(pager, /cubic-bezier\(\.3,\.7,\.25,1\)/);
  // Release thresholds keep the established feel (26% travel or a
  // decisive flick), and the release runs on a critically damped
  // spring seeded with the finger's velocity — no overshoot.
  assert.match(pager, /Math\.abs\(dx\) > w \* 0\.26/);
  assert.match(pager, /Math\.abs\(velocity\) > 0\.45 && Math\.abs\(dx\) > 36/);
  assert.match(pager, /springKeyframes\(from, to, springVelocity, 15\)/);
  assert.match(pager, /Math\.exp\(-omega \* t\)/);
  // Chapter boundaries stay tap-only: the pager refuses to drag past
  // its first/last page.
  assert.match(pager, /if \(!canTurn\(direction\)\) \{ drag\.dead = true; return false; \}/);
  // Rapid taps during a turn queue one deep, never skip or double.
  assert.match(pager, /queuedRef\.current = direction/);
});

test("REQ-46: cross-chapter turns arm first, complete on the new chapter", () => {
  assert.match(hook, /beginCrossTurn/);
  assert.match(hook, /completeCrossTurn/);
  assert.match(main, /reading\.beginCrossTurn\(direction\)/);
  assert.match(main, /reading\.completeCrossTurn\(\)/);
  assert.match(pager, /armCrossTurn/);
  assert.match(pager, /runCrossTurn/);
  // Motion off or scroll mode keeps the old instant behaviour.
  assert.match(hook, /turnMotionRef\.current/);
  assert.match(experienceCss, /\[data-reader-mode="page"\]\{touch-action:pan-y/);
});

test("REQ-46: chapter edges in paged mode are page edges, not scroll positions", () => {
  assert.match(main, /const info = reading\.pageInfo\(\);/);
  assert.match(main, /info\.page >= info\.total - 1\) \{ chapterTurn\(1\); return; \}/);
  assert.match(main, /info\.page <= 0\) \{ if \(index > 0\) chapterTurn\(-1\); return; \}/);
  assert.match(hook, /notePagerSettle/);
  assert.match(hook, /registerPager/);
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

// --- REQ-47: pagination safety band + turn-style choice -----------------

test("REQ-47: packing reserves a safety band under the measured stack", () => {
  // The packer takes an explicit safetyPx budget (one line pitch in
  // the component) so a device whose real stack outgrows the hidden
  // host's promise by up to a line still lands its last line inside
  // the box — REQ-46 packed to the exact box height and clipped.
  assert.match(pagerCore, /safetyPx = 0/);
  assert.match(pagerCore, /pageHeight - Math\.max\(0, safetyPx\)/);
  assert.match(pager, /safetyPx: safetyLevelRef\.current \* \(bodyLineHeightPx/);
  // The guarantee is audited on the rendered pages themselves: if a
  // page's own ink still crosses the box floor, the band escalates
  // and the chapter repacks (bounded, per chapter).
  assert.match(pager, /post-pack audit/);
  assert.match(pager, /safetyLevelRef\.current \+= 1/);
  // Re-pagination rides the existing paths (fonts.ready + resize
  // already repack through the same paginate()).
  assert.match(pager, /document\.fonts\?\.ready/);
});

test("REQ-47: the curl turn renders the sheet, its mirrored back and the page beneath", () => {
  assert.match(pager, /reader-curl/);
  assert.match(pager, /reader-curl-mirror/);
  assert.match(pager, /reader-curl-shade/);
  assert.match(pager, /reader-curl-shadow/);
  // The flap is the sheet's own DOM reflected across the fold axis —
  // text stays text (contracts intact), never a canvas snapshot.
  assert.match(pager, /mirror\.style\.transform = `matrix\(/);
  assert.match(pager, /decorative/);
  // REQ-54 moved the stage from the page box to the whole reading
  // page (fixed layer); the guard follows the move like the FIX3
  // retune precedent — see the REQ-54 block below for its contract.
  assert.match(experienceCss, /\.reader-curl\{position:fixed;inset:0;z-index:11;pointer-events:none\}/);
  // Tap turns sweep on the curl clock; drags drive the fold 1:1
  // from the finger's displacement.
  assert.match(pager, /CURL_MS = 480/);
  assert.match(pager, /curl\.m = Math\.min\(stageW, Math\.max\(0, drag\.direction > 0/);
});

test("REQ-47: turn style is a v7 preference plumbed from the sheet to the pager", () => {
  const prefsSource = readFileSync(new URL("../src/reading-preferences.js", import.meta.url), "utf8");
  assert.match(prefsSource, /READER_TURN_STYLES = Object\.freeze\(\["curl", "slide"\]\)/);
  assert.match(prefsSource, /turnStyle: "curl"/);
  assert.match(main, /turnStyle=\{preferences\.settings\.turnStyle\}/);
  assert.match(hook, /pageBy\(direction, opts\)/);
  // Motion off still short-circuits both styles to an instant land.
  assert.match(pager, /if \(!motionRef\.current\) \{ land\(target\); return true; \}/);
});

// --- REQ-54: reader polish — note eviction, print-through back, ------
// --- full-page curl stage ---------------------------------------------

test("REQ-54: the read-only note is out of the reader; it lives once on the detail page", () => {
  // No banner element, class or copy anywhere in the reader layers.
  assert.doesNotMatch(main, /reader-readonly-note/);
  assert.doesNotMatch(experienceCss, /reader-readonly-note/);
  const stylesCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(stylesCss, /reader-readonly-note/);
  // The sentence survives exactly once in the app: the detail
  // page's status area (PlazaDetail cover copy).
  assert.equal((main.match(/只读版本 · 不会改变原作/g) || []).length, 1);
  assert.match(main, /<p className="plaza-detail-readonly">只读版本 · 不会改变原作<\/p>/);
  assert.match(stylesCss, /\.plaza-detail-cover-copy \.plaza-detail-readonly\{/);
});

test("REQ-54: the curl stage covers the whole reading page; text stays pinned to the page box", () => {
  // The overlay is a fixed full-page layer (below the hairlines at
  // z-12 and the summoned chrome at z-15), rail-aware on desktop.
  assert.match(experienceCss, /\.reader-curl\{position:fixed;inset:0;z-index:11;pointer-events:none\}/);
  assert.match(experienceCss, /@media\(min-width:1050px\)\{\.reader-curl\{left:88px\}\}/);
  // Articles ride in box wrappers positioned by the pager's own
  // rect — pagination and the settled page are untouched.
  assert.match(experienceCss, /\.reader-curl-box\{position:absolute;left:var\(--curl-box-x,0px\);top:var\(--curl-box-y,0px\)/);
  assert.match(pager, /className="reader-curl-box"/);
  assert.match(pager, /ref={curlStageRef}/);
  assert.match(pager, /stage\.style\.setProperty\("--curl-box-x"/);
  assert.match(pager, /stage\.style\.setProperty\("--curl-box-y"/);
  // Fold math runs in stage coordinates measured off the stage
  // itself: rest and completion sit at the stage's edges, and the
  // axis, band, shade and shadow span the stage's full height.
  assert.match(pager, /const stageRect = stage\.getBoundingClientRect\(\)/);
  assert.match(pager, /curl\.completeM = curl\.dir > 0 \? 0 : W/);
  assert.match(pager, /if \(curl\.pristine\) curl\.m = curl\.dir > 0 \? W : 0/);
  assert.match(pager, /axBot - bw\}px \$\{H\}px/);
  assert.match(pager, /drag\.direction > 0 \? stageW - \(drag\.x0 - x\) : x - drag\.x0/);
});

test("REQ-54: the paper's back is print-through — blurred, faded mirrored text on opaque paper", () => {
  // Only the flap's article wrapper is blurred/faded; the mirror
  // layer's own paper stays opaque, so the band never turns into a
  // window onto the page beneath.
  assert.match(experienceCss, /\.reader-curl-mirror \.reader-curl-box\{filter:blur\(1\.6px\);opacity:\.5\}/);
  assert.match(experienceCss, /\.reader-curl-mirror\{position:absolute;inset:0;background:var\(--reader-bg\);transform-origin:0 0\}/);
  // The flat sheet and the revealed page keep full-strength text:
  // no blur rule may reach them.
  assert.doesNotMatch(experienceCss, /\.reader-curl-layer \.reader-curl-box\{[^}]*blur/);
});
