import test from "node:test";
import assert from "node:assert/strict";
import {
  packPages,
  displayTotal,
  pageForAnchor,
  pageForProgress,
  progressForPage,
} from "../src/reader-pager.js";

// Build measured lines for a synthetic chapter: each paragraph gets
// `linesPer` lines of `lineHeight`, characters laid out 10 per line.
function chapterLines({ paragraphs = 3, linesPer = 4, lineHeight = 30, gap = 18 } = {}) {
  const lines = [];
  const paragraphLengths = [];
  for (let p = 0; p < paragraphs; p += 1) {
    paragraphLengths.push(linesPer * 10);
    for (let line = 0; line < linesPer; line += 1) {
      lines.push({
        p,
        start: line * 10,
        end: (line + 1) * 10,
        height: lineHeight,
        firstOfParagraph: line === 0,
        gapBefore: gap,
      });
    }
  }
  return { lines, paragraphLengths };
}

test("packPages: breaks fall only on line boundaries and respect capacity", () => {
  const { lines, paragraphLengths } = chapterLines();
  // 150px page: a paragraph takes 4×30=120px; the next paragraph's
  // first line would add gap 18 + 30 = 168 > 150, so each paragraph
  // gets its own page.
  const pages = packPages(lines, 150, { paragraphLengths });
  assert.equal(pages.length, 3);
  assert.deepEqual(pages.map((page) => page.lineCount), [4, 4, 4]);
  // Every segment boundary is a line boundary (multiples of 10 chars)
  // and segments tile the paragraphs without gaps or overlaps.
  const seen = new Map();
  for (const page of pages) {
    for (const segment of page.segments) {
      assert.equal(segment.start % 10, 0);
      assert.equal(segment.end % 10, 0);
      const prior = seen.get(segment.p) || 0;
      assert.equal(segment.start, prior, "segments must be contiguous per paragraph");
      seen.set(segment.p, segment.end);
    }
  }
  for (let p = 0; p < 3; p += 1) assert.equal(seen.get(p), 40);
});

test("packPages: paragraph gap is charged mid-page and dropped at a page top", () => {
  const { lines, paragraphLengths } = chapterLines({ paragraphs: 2, linesPer: 2, lineHeight: 30, gap: 18 });
  // 30+30 + 18 + 30 = 108 fits p0(2 lines)+gap+p1 line 1; the last
  // line would need 138 > 108, so it wraps to page 2 with NO gap.
  const pages = packPages(lines, 108, { paragraphLengths });
  assert.equal(pages.length, 2);
  assert.equal(pages[0].lineCount, 3);
  assert.equal(pages[1].lineCount, 1);
  assert.equal(pages[1].segments[0].gap, 0);
  assert.equal(pages[0].segments[1].gap, 18);
});

test("packPages: the title reserve shrinks page 1 only", () => {
  const { lines, paragraphLengths } = chapterLines({ paragraphs: 1, linesPer: 6, lineHeight: 30 });
  const pages = packPages(lines, 150, { titleHeight: 60, paragraphLengths });
  assert.equal(pages[0].lineCount, 3); // (150-60)/30
  assert.equal(pages[1].lineCount, 3); // full 150/30 would be 5, only 3 remain
  assert.equal(pages.length, 2);
});

test("packPages: page starts carry char-accurate anchors", () => {
  const { lines, paragraphLengths } = chapterLines();
  const pages = packPages(lines, 150, { paragraphLengths });
  assert.deepEqual(pages[0].start, { paragraph: 0, offset: 0 });
  // Page 2 starts at paragraph 1's first line.
  assert.deepEqual(pages[1].startChar, { p: 1, start: 0 });
  assert.deepEqual(pages[1].start, { paragraph: 1, offset: 0 });
  // A tighter page cuts mid-paragraph: at 90px, page 2 opens on
  // paragraph 0's last line (char 30 of 40 → offset 0.75).
  const tight = packPages(lines, 90, { paragraphLengths });
  assert.deepEqual(tight[1].startChar, { p: 0, start: 30 });
  assert.deepEqual(tight[1].start, { paragraph: 0, offset: 0.75 });
});

test("pageForAnchor: an anchor lands on the page that contains it", () => {
  const { lines, paragraphLengths } = chapterLines();
  const pages = packPages(lines, 150, { paragraphLengths });
  assert.equal(pageForAnchor(pages, { paragraph: 0, offset: 0 }, paragraphLengths), 0);
  assert.equal(pageForAnchor(pages, { paragraph: 0, offset: 0.9 }, paragraphLengths), 0);
  assert.equal(pageForAnchor(pages, { paragraph: 1, offset: 0.25 }, paragraphLengths), 1);
  assert.equal(pageForAnchor(pages, { paragraph: 1, offset: 0.2 }, paragraphLengths), 1);
  assert.equal(pageForAnchor(pages, { paragraph: 2, offset: 0.9 }, paragraphLengths), 2);
  assert.equal(pageForAnchor([], { paragraph: 0, offset: 0 }, paragraphLengths), 0);
  assert.equal(pageForAnchor(pages, null, paragraphLengths), 0);
});

test("progress math: first page 0, end page 100, seek is the inverse", () => {
  assert.equal(displayTotal([{ segments: [] }, { segments: [] }]), 3);
  assert.equal(progressForPage(0, 3), 0);
  assert.equal(progressForPage(1, 3), 50);
  assert.equal(progressForPage(2, 3), 100);
  assert.equal(progressForPage(0, 1), 100);
  assert.equal(pageForProgress(0, 3), 0);
  assert.equal(pageForProgress(50, 3), 1);
  assert.equal(pageForProgress(100, 3), 2);
  assert.equal(pageForProgress(140, 3), 2);
});

test("packPages safety band (REQ-47): pages respect box minus band, no line is ever dropped", () => {
  const { lines, paragraphLengths } = chapterLines();
  const heightOf = (page) => page.segments.reduce((sum, seg, i) => (
    sum + (seg.end - seg.start) / 10 * 30 + seg.gap
  ), 0);
  const unbanded = packPages(lines, 150, { paragraphLengths });
  const banded = packPages(lines, 150, { paragraphLengths, safetyPx: 30 });
  assert.ok(banded.length >= unbanded.length, 'the band can only split pages further');
  for (const page of banded) assert.ok(heightOf(page) <= 120 + 1e-9, 'page stack stays one pitch above the box floor');
  assert.equal(banded.reduce((sum, page) => sum + page.lineCount, 0), lines.length, 'no line dropped');
  // The band also applies under the title block on page 1.
  const titled = packPages(lines, 150, { paragraphLengths, titleHeight: 50, safetyPx: 30 });
  assert.ok(50 + heightOf(titled[0]) <= 120 + 1e-9, 'title page honours the band');
  // An absurd band degrades to sparse pages but still packs every
  // line exactly once — content is never sacrificed to the margin.
  const extreme = packPages(lines, 150, { paragraphLengths, safetyPx: 100000 });
  assert.equal(extreme.reduce((sum, page) => sum + page.lineCount, 0), lines.length);
});
