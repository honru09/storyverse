/* READER-FIX2 (REQ-46): pre-pagination for the paged reader.
 *
 * The clone-sheet turn engine is retired. Paged mode now measures the
 * chapter's real line boxes once (in a hidden, identically typeset
 * host), then packs WHOLE LINES into fixed-height pages: a page never
 * ends mid-line, and the text a page shows is the chapter's actual
 * text sliced at measured line boundaries — rendered as real DOM on a
 * horizontal track, one opaque page box per page.
 *
 * This module is the pure half: given measured lines it decides the
 * page breaks and the anchor math. DOM measurement lives in
 * components/ReaderPager.jsx.
 *
 * A measured line: {
 *   p: paragraph index,
 *   start, end: character offsets inside the paragraph (end = start of
 *     the next line, or the paragraph length for its last line),
 *   height: the line box height in px,
 *   firstOfParagraph: boolean,
 *   gapBefore: px of paragraph spacing preceding this paragraph's
 *     first line when it follows another paragraph ON THE SAME PAGE
 *     (spacing is dropped at a page top, as in print).
 * }
 */

function anchorOffset(paragraph, charStart, paragraphLengths) {
  const length = Math.max(1, paragraphLengths[paragraph] || 1);
  return Math.min(1, Math.max(0, charStart / length));
}

export function packPages(lines, pageHeight, { titleHeight = 0, paragraphLengths = [], safetyPx = 0 } = {}) {
  /* READER-FIX3 (REQ-47): the packer never spends the last
   * `safetyPx` of the box. REQ-46 budgeted the summed line advances
   * against the FULL box height, and the tightest sandbox pages
   * landed within ~11px of the bottom — inside one line advance of
   * headroom. A device whose real line stack runs even slightly
   * taller than the measured one (the owner's iPhone: PingFang line
   * metrics + iOS line-box snapping, ~1 line over a full page) then
   * pushes the last line's ink past the box and it renders cut in
   * half. The caller passes one full line pitch as the safety band,
   * so the last line's bottom edge always keeps >= 1 line of air
   * above the box bottom. */
  const capacity = Math.max(1, Math.floor(pageHeight - Math.max(0, safetyPx)));
  const reserve = Math.max(0, titleHeight);
  const pages = [];
  let segments = [];
  let used = reserve; // page 1 carries the title block; later pages start empty
  let lineCount = 0;

  const closePage = () => {
    if (!segments.length) return;
    const first = segments[0];
    pages.push({
      segments,
      lineCount,
      start: { paragraph: first.p, offset: anchorOffset(first.p, first.start, paragraphLengths) },
      startChar: { p: first.p, start: first.start },
    });
    segments = [];
    used = 0;
    lineCount = 0;
  };

  for (const line of lines || []) {
    if (!line || !(line.height > 0)) continue;
    // The paragraph gap is charged only when this line opens its
    // paragraph AND another paragraph already sits on this page.
    const opensParagraph = Boolean(line.firstOfParagraph);
    const gapIfPlaced = opensParagraph && lineCount > 0 && segments[segments.length - 1]?.p !== line.p
      ? Math.max(0, line.gapBefore || 0)
      : 0;
    if (lineCount > 0 && used + gapIfPlaced + line.height > capacity) {
      closePage();
    }
    const atPageTop = lineCount === 0;
    const placedGap = atPageTop ? 0 : gapIfPlaced;
    const tail = segments[segments.length - 1];
    if (tail && tail.p === line.p && tail.end === line.start) {
      tail.end = line.end;
    } else {
      segments.push({
        p: line.p,
        start: line.start,
        end: line.end,
        gap: placedGap,
        startsParagraph: opensParagraph,
      });
    }
    used += placedGap + line.height;
    lineCount += 1;
  }
  closePage();
  return pages;
}

/* The display page total always includes the chapter-end page. */
export function displayTotal(pages) {
  return (Array.isArray(pages) ? pages.length : 0) + 1;
}

/* Progress percent by page: first prose page 0, end page 100. */
export function progressForPage(page, total) {
  if (!Number.isFinite(total) || total <= 1) return 100;
  const clamped = Math.min(Math.max(0, page), total - 1);
  return Math.round((clamped / (total - 1)) * 100);
}

export function pageForProgress(percent, total) {
  if (!Number.isFinite(total) || total <= 1) return 0;
  const share = Math.min(100, Math.max(0, Number(percent) || 0)) / 100;
  return Math.round(share * (total - 1));
}

/* Find the page containing a stored anchor ({paragraph, offset} with
 * offset a 0..1 share of the paragraph). Returns 0 when unknown. */
export function pageForAnchor(pages, anchor, paragraphLengths = []) {
  if (!Array.isArray(pages) || !pages.length || !anchor) return 0;
  const targetP = anchor.paragraph;
  const targetChar = (anchor.offset || 0) * Math.max(1, paragraphLengths[targetP] || 1);
  let found = 0;
  pages.forEach((page, index) => {
    const start = page.startChar;
    if (!start) return;
    if (start.p < targetP || (start.p === targetP && start.start <= targetChar + 0.5)) found = index;
  });
  return found;
}
