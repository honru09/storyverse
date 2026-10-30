import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  packPages,
  displayTotal,
  pageForAnchor,
  pageForProgress,
  progressForPage,
} from "../reader-pager.js";

/* READER-FIX2 (REQ-46): the paged reader, rebuilt to the owner's spec —
 * one fixed container, the chapter pre-paginated into fixed pages
 * whose text is capped at whole lines, and whole-page sliding turns.
 *
 * How it works:
 *  - A hidden measurement host inside the pager viewport typesets the
 *    chapter with the article's exact classes (so every reader CSS
 *    variable applies unchanged) and reads the real line boxes via
 *    Range geometry. Lines are packed into pages of the viewport's
 *    height; breaks fall only on line boundaries.
 *  - Pages render the chapter's own text, sliced at those boundaries,
 *    as ordinary paragraphs in fixed opaque boxes on a flex track.
 *    Nothing is cloned, mirrored or cross-faded: a turn translates the
 *    track by exactly one page width, so the two pages in flight are
 *    side by side and fully opaque at every frame.
 *  - Tap turns use the house drawer curve (300ms); a drag follows the
 *    finger 1:1 and its release settles on a critically damped spring
 *    seeded with the release velocity (no overshoot). Motion off (or
 *    reduced motion) makes every turn instant.
 *  - The chapter-end matter is a real last page (internally
 *    scrollable), so progress is by page: first page 0%, end page
 *    100%.
 */

/* READER-FIX3 (REQ-47): the slide turn's curve is retuned on the
 * owner's word ("smooth, but harmonious"): 360ms on a soft-in,
 * long-settle bezier replaces REQ-46's snappier drawer curve, and
 * the drag-release spring softens from ω=18 to ω=15. */
const TURN_MS = 360;
const TURN_EASE = "cubic-bezier(.3,.7,.25,1)";
/* The simulated curl's tap sweep: long enough for the fold to read
 * as paper, eased in-out so the fold accelerates mid-page. */
const CURL_MS = 480;
const CURL_EASE = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* Critically damped spring sampled into WAAPI keyframes: position is
 * continuous AND velocity is continuous at release (the spring is
 * seeded with the finger's velocity), and it never overshoots. */
function springKeyframes(from, to, velocityPxPerMs, omega = 18) {
  const A = from - to;
  const B = velocityPxPerMs * 1000 + omega * A;
  const step = 1 / 60;
  const frames = [];
  let duration = step;
  for (let i = 0; i <= 30; i += 1) {
    const t = i * step;
    const e = Math.exp(-omega * t);
    const x = to + (A + B * t) * e;
    const v = (B - omega * (A + B * t)) * e;
    frames.push({ transform: `translateX(${x}px)`, t });
    duration = t;
    if (t > 0.06 && Math.abs(x - to) < 1.2 && Math.abs(v) < 14) break;
  }
  frames.push({ transform: `translateX(${to}px)`, t: duration });
  return {
    frames: frames.map((frame) => ({ transform: frame.transform, offset: duration ? frame.t / duration : 1 })),
    durationMs: Math.min(480, Math.max(70, duration * 1000)),
  };
}

/* First character offset whose line box sits on the line starting at
 * `top`: binary search over single-character ranges (tops are
 * monotonic within a paragraph). */
function findLineStart(textNode, textLength, top, fromOffset) {
  const topOf = (offset) => {
    const probe = Math.min(offset, textLength - 1);
    const range = document.createRange();
    range.setStart(textNode, probe);
    range.setEnd(textNode, probe + 1);
    const rect = range.getClientRects()[0];
    range.detach?.();
    return rect ? rect.top : Number.POSITIVE_INFINITY;
  };
  let lo = Math.max(0, fromOffset);
  let hi = textLength;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (topOf(mid) >= top - 0.5) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/* Measure the chapter's line boxes in the hidden host. The host's DOM
 * mirrors the scroll-mode article exactly (h1 + lede + body), so the
 * measured geometry is the reading typography itself. */
function measureChapter(host, { title, paragraphs }) {
  host.textContent = "";
  const article = document.createElement("article");
  article.className = "reader-article";
  const heading = document.createElement("h1");
  heading.textContent = title;
  const prose = document.createElement("div");
  prose.className = "reader-prose";
  const body = document.createElement("div");
  body.className = "article-body";
  paragraphs.forEach((text, index) => {
    const p = document.createElement("p");
    if (index === 0) p.className = "article-lede";
    p.dataset.p = String(index);
    p.textContent = text;
    if (index === 0) prose.appendChild(p);
    else body.appendChild(p);
  });
  prose.appendChild(body);
  article.append(heading, prose);
  host.appendChild(article);

  const articleRect = article.getBoundingClientRect();
  const proseRect = prose.getBoundingClientRect();
  const titleHeight = Math.max(0, proseRect.top - articleRect.top);
  // READER-FIX3 (REQ-47): the fullest line pitch in the chapter —
  // the pagination safety band is one of these (see reader-pager.js).
  let bodyLineHeightPx = 0;
  const lines = [];
  // The previous paragraph's last line, as {top, advance}: paragraph
  // spacing in stack terms is the distance from the end of that line
  // BOX (top + advance) to this paragraph's first line top.
  let prevLast = null;
  const elements = [...article.querySelectorAll("[data-p]")];
  for (const element of elements) {
    const p = Number(element.dataset.p);
    const textNode = element.firstChild;
    const text = paragraphs[p] || "";
    if (!textNode || textNode.nodeType !== 3 || !text.length) continue;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, text.length);
    const rects = [...range.getClientRects()].filter((rect) => rect.height > 0);
    range.detach?.();
    if (!rects.length) continue;
    // One box per visual line (a text range yields a box per line).
    const lineBoxes = [];
    for (const rect of rects) {
      const last = lineBoxes[lineBoxes.length - 1];
      if (last && Math.abs(last.top - rect.top) < 1) {
        last.bottom = Math.max(last.bottom, rect.bottom);
      } else {
        lineBoxes.push({ top: rect.top, bottom: rect.bottom });
      }
    }
    // Range rects are INK boxes (ascent/descent), which under-report
    // the line box the layout actually stacks by (line-height). The
    // advance — what pagination must budget — is the distance to the
    // NEXT line's top; a paragraph's last line advances by the
    // paragraph's own computed line-height.
    const lineHeightPx = Number.parseFloat(getComputedStyle(element).lineHeight) || 0;
    if (lineHeightPx > bodyLineHeightPx) bodyLineHeightPx = lineHeightPx;
    let searchFrom = 0;
    const own = [];
    lineBoxes.forEach((box, lineIndex) => {
      const start = lineIndex === 0 ? 0 : findLineStart(textNode, text.length, box.top, searchFrom);
      searchFrom = start;
      const advance = lineIndex + 1 < lineBoxes.length
        ? lineBoxes[lineIndex + 1].top - box.top
        : Math.max(lineHeightPx, box.bottom - box.top);
      const line = {
        p,
        start,
        end: text.length, // patched below once the next start is known
        height: advance,
        firstOfParagraph: lineIndex === 0,
        gapBefore: lineIndex === 0 && prevLast !== null
          ? Math.max(0, box.top - (prevLast.top + prevLast.advance))
          : 0,
      };
      lines.push(line);
      own.push(line);
    });
    // Close each line's char range at the next line's start.
    own.forEach((line, index) => {
      line.end = index + 1 < own.length ? own[index + 1].start : text.length;
    });
    const lastBox = lineBoxes[lineBoxes.length - 1];
    const lastAdvance = own.length ? own[own.length - 1].height : 0;
    prevLast = { top: lastBox.top, advance: lastAdvance };
  }
  return { titleHeight, lines, bodyLineHeightPx };
}

export default function ReaderPager({
  registerPager,
  chapterKey,
  title,
  paragraphs,
  endMatter,
  motionOn,
  turnStyle = "curl",
  onSettle,
}) {
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const measureRef = useRef(null);
  const [pages, setPages] = useState(null);
  const pagesRef = useRef(null);
  const pageRef = useRef(0);
  const signatureRef = useRef("");
  const pendingAnchorRef = useRef(null);
  const crossRef = useRef(0);
  const animationRef = useRef(null);
  const queuedRef = useRef(0);
  const dragRef = useRef(null);
  const motionRef = useRef(motionOn);
  motionRef.current = motionOn;
  /* READER-FIX3 (REQ-47): turn style + pagination safety state.
   * safetyLevel escalates the one-pitch safety band when the
   * post-pack audit (below) still finds ink past the box on this
   * device — the device's own rendered geometry is the final word. */
  const turnStyleRef = useRef(turnStyle);
  turnStyleRef.current = turnStyle;
  const safetyLevelRef = useRef(1);
  const linePitchRef = useRef(0);
  /* The curl overlay: React state only carries WHICH pages play the
   * sheet and the under-page; the fold itself is driven per-frame
   * through refs (no re-render per frame). */
  const [curlView, setCurlView] = useState(null);
  const curlRef = useRef(null);
  const curlStageRef = useRef(null);
  const curlFlatRef = useRef(null);
  const curlFlapRef = useRef(null);
  const curlMirrorRef = useRef(null);
  const curlShadeRef = useRef(null);
  const curlShadowRef = useRef(null);
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;
  const lengthsRef = useRef(paragraphs.map((text) => text.length));
  lengthsRef.current = paragraphs.map((text) => text.length);

  const total = () => displayTotal(pagesRef.current || []);
  const width = () => Math.max(1, viewportRef.current?.clientWidth || window.innerWidth);
  /* READER-POLISH2 (REQ-54): the curl stage is the whole reading
   * page (a fixed, viewport-wide layer), not the page box. Before
   * the stage mounts, its width is the window's, less the desktop
   * rail the hairlines also respect; applyCurl replaces the guess
   * with the stage's measured width on the first frame. */
  const stageWidthGuess = () => Math.max(1, window.innerWidth
    - (window.matchMedia?.("(min-width:1050px)").matches ? 88 : 0));
  const base = (page) => -page * width();

  const setTrack = useCallback((px) => {
    if (trackRef.current) trackRef.current.style.transform = `translateX(${px}px)`;
  }, []);

  const anchorOf = useCallback((page) => {
    const list = pagesRef.current || [];
    if (!list.length) return { paragraph: 0, offset: 0 };
    if (page >= list.length) {
      return { paragraph: Math.max(0, lengthsRef.current.length - 1), offset: 1 };
    }
    const start = list[Math.max(0, page)]?.start;
    return start ? { paragraph: start.paragraph, offset: start.offset } : { paragraph: 0, offset: 0 };
  }, []);

  const settleNotify = useCallback(() => {
    onSettleRef.current?.(anchorOf(pageRef.current), progressForPage(pageRef.current, total()));
  }, [anchorOf]);

  /* Land on a page: state first (the logical page), then the track is
   * pinned to its slot — used for instant jumps and as the commit step
   * of every animation. */
  const land = useCallback((page) => {
    const clamped = Math.min(Math.max(0, page), Math.max(0, total() - 1));
    pageRef.current = clamped;
    setTrack(base(clamped));
    settleNotify();
    return clamped;
  }, [setTrack, settleNotify]);

  const animateTo = useCallback((target, { springVelocity = null } = {}) => {
    const track = trackRef.current;
    if (!track) { land(target); return; }
    const from = currentTrackX(track);
    const to = base(target);
    pageRef.current = target;
    let animation;
    if (springVelocity !== null) {
      const { frames, durationMs } = springKeyframes(from, to, springVelocity, 15);
      animation = track.animate(frames, { duration: durationMs, easing: "linear", fill: "forwards" });
    } else {
      animation = track.animate(
        [{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }],
        { duration: TURN_MS, easing: TURN_EASE, fill: "forwards" },
      );
    }
    const token = { animation, invalid: false };
    animationRef.current = token;
    let done = false;
    const finish = () => {
      if (done || token.invalid) return;
      done = true;
      if (animationRef.current === token) animationRef.current = null;
      try { animation.cancel(); } catch { /* already finished */ }
      land(target);
      const queued = queuedRef.current;
      queuedRef.current = 0;
      if (queued) apiRef.current?.pageBy(queued);
    };
    animation.onfinish = finish;
    animation.oncancel = finish;
    // WAAPI can stall in background tabs; never strand a turn.
    setTimeout(finish, (springVelocity !== null ? 520 : TURN_MS + 220));
  }, [land]);

  function currentTrackX(track) {
    const transform = getComputedStyle(track).transform;
    if (!transform || transform === "none") return base(pageRef.current);
    const parts = transform.match(/matrix(?:3d)?\(([^)]+)\)/);
    if (!parts) return base(pageRef.current);
    const values = parts[1].split(",").map((part) => Number.parseFloat(part));
    return values.length === 16 ? values[12] : values[4] || 0;
  }

  const canTurn = useCallback((direction) => {
    const next = pageRef.current + direction;
    return next >= 0 && next <= total() - 1;
  }, []);

  const pageBy = useCallback((direction, opts = {}) => {
    if (!pagesRef.current) return false;
    if (turnStyleRef.current === "curl") {
      if (curlRef.current) { queuedRef.current = direction; return true; }
      if (!canTurn(direction)) return false;
      const target = pageRef.current + direction;
      if (!motionRef.current) { land(target); return true; }
      startCurl(direction, { tapY: opts.tapY ?? null });
      requestAnimationFrame(() => {
        const curl = curlRef.current;
        if (curl) animateCurlTo(curl.completeM, { tap: true });
      });
      return true;
    }
    if (animationRef.current) { queuedRef.current = direction; return true; }
    if (!canTurn(direction)) return false;
    const target = pageRef.current + direction;
    if (!motionRef.current) { land(target); return true; }
    animateTo(target);
    return true;
  }, [animateTo, canTurn, land]);

  const stopAnimation = useCallback(() => {
    const token = animationRef.current;
    if (!token) return;
    token.invalid = true;
    animationRef.current = null;
    try { token.animation.cancel(); } catch { /* noop */ }
  }, []);

  const seekTo = useCallback((percent) => {
    if (!pagesRef.current) return;
    dropCurl();
    stopAnimation();
    land(pageForProgress(percent, total()));
  }, [land, stopAnimation]);

  const restoreAnchor = useCallback((anchor) => {
    if (!anchor) return;
    if (!pagesRef.current) { pendingAnchorRef.current = anchor; return; }
    dropCurl();
    stopAnimation();
    land(pageForAnchor(pagesRef.current, anchor, lengthsRef.current));
  }, [land, stopAnimation]);

  /* ——— drag ——— */
  const dragStart = useCallback((x, y = null) => {
    if (curlRef.current) {
      // Same rule as the slide path: a grab commits the in-flight
      // curl to its target page before the new drag begins.
      const target = curlRef.current.target;
      dropCurl();
      land(target);
    }
    if (animationRef.current) {
      // Commit the in-flight turn instantly so the finger grabs a
      // settled page, never a moving one.
      const token = animationRef.current;
      animationRef.current = null;
      try { token.animation.finish(); } catch { /* noop */ }
      land(pageRef.current);
    }
    dragRef.current = { x0: x, y0: y, active: false, dead: false, direction: 0, curl: false, samples: [{ x, t: performance.now() }] };
  }, [land]);

  const dragMove = useCallback((x) => {
    const drag = dragRef.current;
    if (!drag || drag.dead || !pagesRef.current) return false;
    drag.samples.push({ x, t: performance.now() });
    if (drag.samples.length > 5) drag.samples.shift();
    const dx = x - drag.x0;
    if (!drag.active) {
      if (Math.abs(dx) < 9) return false;
      if (!motionRef.current) { drag.dead = true; return false; }
      const direction = dx < 0 ? 1 : -1;
      if (!canTurn(direction)) { drag.dead = true; return false; }
      drag.active = true;
      drag.direction = direction;
      if (turnStyleRef.current === "curl") {
        drag.curl = true;
        startCurl(direction, { tapY: drag.y0 });
      }
    }
    if (drag.curl) {
      const curl = curlRef.current;
      if (!curl) return false;
      // The fold sweeps with the finger's displacement, 1:1 — drag
      // further, curl further, whichever edge the turn started
      // from. READER-POLISH2: the sweep runs in stage coordinates
      // (the whole reading page), so the fold travels edge to edge.
      curl.pristine = false;
      const stageW = curl.stageW || stageWidthGuess();
      curl.m = Math.min(stageW, Math.max(0, drag.direction > 0 ? stageW - (drag.x0 - x) : x - drag.x0));
      applyCurl();
      return true;
    }
    const w = width();
    const offset = Math.min(w, Math.max(-w, dx));
    setTrack(base(pageRef.current) + offset);
    return true;
  }, [canTurn, setTrack]);

  const finishDrag = useCallback((forceBack) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.active) return false;
    const { direction, samples, x0 } = drag;
    const last = samples[samples.length - 1];
    const first = samples[0];
    const dx = last.x - x0;
    const velocity = last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
    const w = width();
    // Release the flick INTO the spring: its sign follows the finger.
    const complete = !forceBack && (Math.abs(dx) > w * 0.26
      || (Math.sign(velocity) === -direction && Math.abs(velocity) > 0.45 && Math.abs(dx) > 36));
    if (drag.curl) {
      const curl = curlRef.current;
      if (!curl) return true;
      animateCurlTo(complete ? curl.completeM : (direction > 0 ? (curl.stageW || stageWidthGuess()) : 0), { velocity });
      return true;
    }
    const target = complete ? pageRef.current + direction : pageRef.current;
    animateTo(target, { springVelocity: velocity });
    return true;
  }, [animateTo]);

  const dragEnd = useCallback(() => finishDrag(false), [finishDrag]);
  const dragCancel = useCallback(() => finishDrag(true), [finishDrag]);

  /* ——— cross-chapter slide-in ——— */
  const armCrossTurn = useCallback((direction) => {
    if (!motionRef.current) return false;
    crossRef.current = direction;
    return true;
  }, []);

  const runCrossTurn = useCallback(() => {
    const direction = crossRef.current;
    if (!direction || !pagesRef.current) return;
    crossRef.current = 0;
    const track = trackRef.current;
    if (!track) return;
    const to = base(pageRef.current);
    const from = to + (direction > 0 ? width() : -width());
    pageRef.current = pageRef.current; // logical page unchanged
    const animation = track.animate(
      [{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }],
      { duration: TURN_MS, easing: TURN_EASE, fill: "forwards" },
    );
    const token = { animation, invalid: false };
    animationRef.current = token;
    let done = false;
    const finish = () => {
      if (done || token.invalid) return;
      done = true;
      if (animationRef.current === token) animationRef.current = null;
      try { animation.cancel(); } catch { /* noop */ }
      land(pageRef.current);
    };
    animation.onfinish = finish;
    animation.oncancel = finish;
    setTimeout(finish, TURN_MS + 220);
  }, [land]);

  const completeCrossTurn = useCallback(() => { runCrossTurn(); }, [runCrossTurn]);
  const cancelCrossTurn = useCallback(() => { crossRef.current = 0; }, []);

  const apiRef = useRef(null);
  apiRef.current = {
    ready: () => Boolean(pagesRef.current),
    captureAnchor: () => anchorOf(pageRef.current),
    restoreAnchor,
    pageBy,
    seekTo,
    pageInfo: () => ({ page: pageRef.current, total: total() }),
    progressPercent: () => progressForPage(pageRef.current, total()),
    dragStart,
    dragMove,
    dragEnd,
    dragCancel,
    armCrossTurn,
    completeCrossTurn,
    cancelCrossTurn,
  };

  useLayoutEffect(() => {
    registerPager?.(apiRef.current);
    return () => registerPager?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerPager]);

  /* ——— pagination ——— */
  const lastChapterKeyRef = useRef("");
  const paginate = useCallback(() => {
    const viewport = viewportRef.current;
    const host = measureRef.current;
    if (!viewport || !host) return false;
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    if (!w || !h) return false;
    dropCurl();
    host.style.width = `${w}px`;
    // A chapter change must NOT inherit the old chapter's anchor: the
    // hook's restore (which runs right after this layout pass) owns
    // the new chapter's position, and settling here would overwrite
    // its stored anchor before the hook reads it. Same-chapter
    // repagination (settings, resize, fonts) keeps the position.
    const chapterChanged = lastChapterKeyRef.current !== chapterKey;
    lastChapterKeyRef.current = chapterKey;
    if (chapterChanged) safetyLevelRef.current = 1;
    const anchorBefore = chapterChanged
      ? pendingAnchorRef.current
      : (pagesRef.current ? anchorOf(pageRef.current) : pendingAnchorRef.current);
    const { titleHeight, lines, bodyLineHeightPx } = measureChapter(host, { title, paragraphs });
    linePitchRef.current = bodyLineHeightPx || 0;
    const cappedTitle = Math.min(titleHeight, Math.floor(h * 0.5));
    const next = packPages(lines, h, {
      titleHeight: cappedTitle,
      paragraphLengths: lengthsRef.current,
      safetyPx: safetyLevelRef.current * (bodyLineHeightPx || 0),
    });
    pagesRef.current = next;
    setPages(next);
    const target = anchorBefore
      ? pageForAnchor(next, anchorBefore, lengthsRef.current)
      : 0;
    pendingAnchorRef.current = null;
    pageRef.current = Math.min(target, Math.max(0, displayTotal(next) - 1));
    setTrack(base(pageRef.current));
    if (!chapterChanged) settleNotify();
    return true;
  }, [chapterKey, title, paragraphs, anchorOf, settleNotify, setTrack]);

  const signature = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return "";
    const root = viewport.closest(".page-reader");
    return [
      chapterKey,
      root?.getAttribute("style") || "",
      root?.getAttribute("data-reader-theme") || "",
      viewport.clientWidth,
      viewport.clientHeight,
    ].join("|");
  }, [chapterKey]);

  useLayoutEffect(() => {
    const next = signature();
    if (next === signatureRef.current && pagesRef.current) return;
    signatureRef.current = next;
    paginate();
  });

  useEffect(() => {
    let cancelled = false;
    const observer = new ResizeObserver(() => {
      const next = signature();
      if (next !== signatureRef.current) {
        signatureRef.current = next;
        paginate();
      }
    });
    if (viewportRef.current) observer.observe(viewportRef.current);
    document.fonts?.ready?.then(() => {
      if (cancelled) return;
      const next = signature();
      signatureRef.current = `${next}#fonts`;
      paginate();
    }).catch(() => {});
    return () => { cancelled = true; observer.disconnect(); };
  }, [signature, paginate]);

  /* ——— READER-FIX3 (REQ-47): post-pack audit ———
   * The packer budgets from the hidden host's measured advances plus
   * a one-pitch safety band. If THIS device still renders some page's
   * last line past the box (its real stack outgrew the host's
   * promise), escalate the band by another pitch and repack — at
   * most twice per chapter. The audit reads the rendered pages' own
   * ink, so the no-clipped-line guarantee is checked where the
   * reader actually reads, in the device's own metrics. */
  useLayoutEffect(() => {
    if (!pages || safetyLevelRef.current >= 3) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const boxHeight = viewport.clientHeight;
    let overflow = false;
    for (const pageEl of viewport.querySelectorAll(".reader-pager-page:not(.reader-pager-end)")) {
      const segments = pageEl.querySelectorAll("[data-reading-paragraph]");
      const node = segments[segments.length - 1]?.firstChild;
      if (!node || node.nodeType !== 3) continue;
      const pageRect = pageEl.getBoundingClientRect();
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, node.length);
      const rects = [...range.getClientRects()].filter((rect) => rect.height > 0);
      range.detach?.();
      const inkBottom = rects.length ? rects[rects.length - 1].bottom - pageRect.top : 0;
      if (inkBottom > boxHeight - 1) { overflow = true; break; }
    }
    if (overflow) {
      safetyLevelRef.current += 1;
      paginate();
    }
  }, [pages, paginate]);

  /* ——— READER-FIX3 (REQ-47): the simulated curl ———
   * The stage stacks three renderings of the chapter's own text:
   *   under — the page being revealed, static and complete;
   *   flat  — the turning sheet's still-flat part, clipped to the
   *           left of the curl band;
   *   flap  — the sheet's back inside the band: the same DOM
   *           reflected across the fold axis by a 2D reflection matrix
   *           reflection, so the "print through the paper" is the
   *           page's own mirrored text, dimmed under a shade whose
   *           bright ridge rides the fold, plus the soft shadow the
   *           roll casts onto the revealed page.
   * Every layer is opaque paper: no frame ever cross-fades two
   * different texts. The fold axis sweeps the stage and leans with
   * the grab height, like the reference reader's corner curl.
   *
   * READER-POLISH2 (REQ-54): the stage is no longer the page box —
   * it is the whole reading page (the fixed .reader-curl layer).
   * All fold geometry below runs in stage coordinates: the axis,
   * the band, the ridge and the cast shadow span the stage's full
   * height and the sheet sweeps its full width. The articles ride
   * in .reader-curl-box wrappers that applyCurl pins onto the
   * static page box (the --curl-box-* custom properties), so the
   * text never moves a pixel from where the settled page puts it;
   * only the paper around it grew. curl.m / curl.completeM are
   * stage-x positions; `pristine` marks a just-started curl whose
   * rest position still has to be snapped to the measured stage
   * width on the first frame. */
  const curlBandWidth = (m) => {
    const W = curlRef.current?.stageW || stageWidthGuess();
    return Math.min(W * 0.36, Math.max(0, W - m) * 0.55);
  };

  const applyCurl = useCallback(() => {
    const curl = curlRef.current;
    const stage = curlStageRef.current;
    const viewport = viewportRef.current;
    if (!curl || !stage || !viewport) return;
    const stageRect = stage.getBoundingClientRect();
    const boxRect = viewport.getBoundingClientRect();
    const W = Math.max(1, stageRect.width);
    const H = Math.max(1, stageRect.height);
    curl.stageW = W;
    curl.stageH = H;
    curl.completeM = curl.dir > 0 ? 0 : W;
    if (curl.pristine) curl.m = curl.dir > 0 ? W : 0;
    // Pin the article wrappers onto the static page box.
    stage.style.setProperty("--curl-box-x", `${boxRect.left - stageRect.left}px`);
    stage.style.setProperty("--curl-box-y", `${boxRect.top - stageRect.top}px`);
    stage.style.setProperty("--curl-box-w", `${boxRect.width}px`);
    stage.style.setProperty("--curl-box-h", `${boxRect.height}px`);
    const m = Math.min(W, Math.max(0, curl.m));
    const axTop = m - curl.lean / 2;
    const axBot = m + curl.lean / 2;
    const bw = curlBandWidth(m);
    const flat = curlFlatRef.current;
    if (flat) flat.style.clipPath = `polygon(0px 0px, ${axTop - bw}px 0px, ${axBot - bw}px ${H}px, 0px ${H}px)`;
    const flap = curlFlapRef.current;
    if (flap) flap.style.clipPath = `polygon(${axTop - bw}px 0px, ${axTop}px 0px, ${axBot}px ${H}px, ${axBot - bw}px ${H}px)`;
    const mirror = curlMirrorRef.current;
    if (mirror) {
      // Reflection across the fold axis, in stage coordinates: the
      // line through (m, H/2) with direction (lean, H).
      // matrix(a,b,c,d,tx,ty) with transform-origin 0 0 (see
      // reader-experience.css).
      const len = Math.hypot(curl.lean, H) || 1;
      const ux = curl.lean / len;
      const uy = H / len;
      const a = 2 * ux * ux - 1;
      const b = 2 * ux * uy;
      const d = 2 * uy * uy - 1;
      const tx = m - (a * m + b * (H / 2));
      const ty = H / 2 - (b * m + d * (H / 2));
      mirror.style.transform = `matrix(${a}, ${b}, ${b}, ${d}, ${tx}, ${ty})`;
    }
    const shade = curlShadeRef.current;
    if (shade) {
      shade.style.clipPath = `polygon(${axTop - bw - 30}px 0px, ${axTop}px 0px, ${axBot}px ${H}px, ${axBot - bw - 30}px ${H}px)`;
      shade.style.background = `linear-gradient(90deg, rgba(0,0,0,0) ${Math.max(0, m - bw - 30)}px, rgba(0,0,0,.13) ${Math.max(0, m - bw)}px, rgba(0,0,0,.03) ${Math.max(0, m - bw * 0.45)}px, rgba(255,255,255,.15) ${Math.max(0, m - 16)}px, rgba(0,0,0,.26) ${m}px, rgba(0,0,0,0) ${m + 2}px)`;
    }
    const shadow = curlShadowRef.current;
    if (shadow) {
      shadow.style.clipPath = `polygon(${axTop}px 0px, ${axTop + 36}px 0px, ${axBot + 36}px ${H}px, ${axBot}px ${H}px)`;
      shadow.style.background = `linear-gradient(90deg, rgba(0,0,0,.22) ${m}px, rgba(0,0,0,0) ${m + 36}px)`;
    }
  }, []);

  const endCurl = useCallback((targetPage) => {
    const curl = curlRef.current;
    if (curl?.raf) cancelAnimationFrame(curl.raf);
    curlRef.current = null;
    setCurlView(null);
    land(targetPage);
    const queued = queuedRef.current;
    queuedRef.current = 0;
    if (queued) apiRef.current?.pageBy(queued);
  }, [land]);

  const dropCurl = useCallback(() => {
    const curl = curlRef.current;
    if (!curl) return;
    if (curl.raf) cancelAnimationFrame(curl.raf);
    curlRef.current = null;
    setCurlView(null);
  }, []);

  /* Sweep the fold to an end position: eased for taps, a closed-form
   * critically damped spring (seeded with the finger's velocity) for
   * drag releases — the same spring family as the slide settle. */
  const animateCurlTo = useCallback((toM, { velocity = 0, tap = false } = {}) => {
    const curl = curlRef.current;
    if (!curl) return;
    if (curl.raf) cancelAnimationFrame(curl.raf);
    curl.pristine = false;
    const from = curl.m;
    const started = performance.now();
    const finish = () => {
      const done = curlRef.current;
      if (!done) return;
      done.m = toM;
      applyCurl();
      endCurl(toM === done.completeM ? done.target : done.from);
    };
    if (tap) {
      const step = (now) => {
        const live = curlRef.current;
        if (!live) return;
        const t = Math.min(1, (now - started) / CURL_MS);
        live.m = from + (toM - from) * CURL_EASE(t);
        applyCurl();
        if (t < 1) { live.raf = requestAnimationFrame(step); return; }
        live.raf = 0;
        finish();
      };
      curl.raf = requestAnimationFrame(step);
      return;
    }
    const omega = 16;
    const A = from - toM;
    const B = velocity * 1000 + omega * A;
    const step = (now) => {
      const live = curlRef.current;
      if (!live) return;
      const t = (now - started) / 1000;
      const e = Math.exp(-omega * t);
      const x = toM + (A + B * t) * e;
      const v = (B - omega * (A + B * t)) * e;
      live.m = x;
      applyCurl();
      if ((t > 0.05 && Math.abs(x - toM) < 0.9 && Math.abs(v) < 16) || t > 0.65) {
        live.raf = 0;
        finish();
        return;
      }
      live.raf = requestAnimationFrame(step);
    };
    curl.raf = requestAnimationFrame(step);
  }, [applyCurl, endCurl]);

  const startCurl = useCallback((direction, { tapY = null } = {}) => {
    const current = pageRef.current;
    const target = current + direction;
    const w = width();
    const rect = viewportRef.current?.getBoundingClientRect();
    const grab = rect && tapY !== null
      ? Math.min(1, Math.max(0, (tapY - rect.top) / Math.max(1, rect.height)))
      : 0.72;
    const stageW = stageWidthGuess();
    curlRef.current = {
      dir: direction,
      from: current,
      target,
      sheet: direction > 0 ? current : target,
      under: direction > 0 ? target : current,
      // READER-POLISH2: rest and completion live at the STAGE's
      // edges now; `pristine` lets the first applyCurl snap the
      // rest position to the measured stage width.
      m: direction > 0 ? stageW : 0,
      completeM: direction > 0 ? 0 : stageW,
      lean: direction * (grab - 0.5) * 0.35 * w,
      raf: 0,
      pristine: true,
      stageW,
      stageH: 0,
    };
    setCurlView({ sheet: curlRef.current.sheet, under: curlRef.current.under });
    return true;
  }, []);

  /* The overlay's first frame lands once its layers mount. */
  useLayoutEffect(() => {
    if (curlView) applyCurl();
  }, [curlView, applyCurl]);

  /* A style switch mid-curl parks the sheet back on its page. */
  useEffect(() => { dropCurl(); }, [turnStyle, dropCurl]);

  const renderSegment = (segment, key, decorative = false) => {
    const text = (paragraphs[segment.p] || "").slice(segment.start, segment.end);
    const style = {};
    if (segment.gap) style.marginTop = `${segment.gap}px`;
    if (!segment.startsParagraph) style.textIndent = "0px";
    /* The curl overlay re-renders the same slices as decoration;
     * the addressable DOM contract (data-reading-paragraph) stays
     * unique to the track pages, so lookups never see doubles. */
    const contract = decorative ? {} : { "data-reading-paragraph": segment.p };
    if (segment.p === 0) {
      return (
        <p key={key} className="article-lede" style={style} {...contract}>
          {text}
        </p>
      );
    }
    return (
      <p key={key} style={style} {...contract}>
        {text}
      </p>
    );
  };

  /* One page's article, shared by the track and the curl overlay.
   * `pageIndex` may address the chapter-end page (== pages.length). */
  const renderPageArticle = (pageIndex, decorative = false) => {
    const list = pages || [];
    if (pageIndex >= list.length) {
      return <article className="reader-article">{endMatter}</article>;
    }
    const page = list[pageIndex];
    if (!page) return null;
    const lede = page.segments.filter((segment) => segment.p === 0);
    const bodySegments = page.segments.filter((segment) => segment.p > 0);
    const prefix = decorative ? "curl-" : "";
    return (
      <article className="reader-article">
        {pageIndex === 0 && <h1>{title}</h1>}
        <div className="reader-prose" lang="zh-CN">
          {lede.map((segment, index) => renderSegment(segment, `${prefix}lede-${index}`, decorative))}
          <div className="article-body">
            {bodySegments.map((segment, index) => renderSegment(segment, `${prefix}body-${index}`, decorative))}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="reader-pager" ref={viewportRef}>
      <div className="reader-pager-track" ref={trackRef}>
        {(pages || []).map((page, pageIndex) => (
          <div className="reader-pager-page" key={pageIndex} aria-hidden={pageIndex !== pageRef.current || undefined}>
            {renderPageArticle(pageIndex)}
          </div>
        ))}
        {pages && (
          <div className="reader-pager-page reader-pager-end">
            <article className="reader-article">{endMatter}</article>
          </div>
        )}
      </div>
      {curlView && (
        <div className="reader-curl" aria-hidden="true" ref={curlStageRef}>
          <div className="reader-curl-layer"><div className="reader-curl-box">{renderPageArticle(curlView.under, true)}</div></div>
          <div className="reader-curl-shadow" ref={curlShadowRef} />
          <div className="reader-curl-layer" ref={curlFlatRef}><div className="reader-curl-box">{renderPageArticle(curlView.sheet, true)}</div></div>
          <div className="reader-curl-flap" ref={curlFlapRef}>
            <div className="reader-curl-mirror" ref={curlMirrorRef}><div className="reader-curl-box">{renderPageArticle(curlView.sheet, true)}</div></div>
          </div>
          <div className="reader-curl-shade" ref={curlShadeRef} />
        </div>
      )}
      <div className="reader-pager-measure" ref={measureRef} aria-hidden="true" />
    </div>
  );
}
