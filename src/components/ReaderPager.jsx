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

const TURN_MS = 300;
const TURN_EASE = "cubic-bezier(.32,.72,0,1)";

/* Critically damped spring sampled into WAAPI keyframes: position is
 * continuous AND velocity is continuous at release (the spring is
 * seeded with the finger's velocity), and it never overshoots. */
function springKeyframes(from, to, velocityPxPerMs) {
  const omega = 18;
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
  return { titleHeight, lines };
}

export default function ReaderPager({
  registerPager,
  chapterKey,
  title,
  paragraphs,
  endMatter,
  motionOn,
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
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;
  const lengthsRef = useRef(paragraphs.map((text) => text.length));
  lengthsRef.current = paragraphs.map((text) => text.length);

  const total = () => displayTotal(pagesRef.current || []);
  const width = () => Math.max(1, viewportRef.current?.clientWidth || window.innerWidth);
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
      const { frames, durationMs } = springKeyframes(from, to, springVelocity);
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

  const pageBy = useCallback((direction) => {
    if (!pagesRef.current) return false;
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
    stopAnimation();
    land(pageForProgress(percent, total()));
  }, [land, stopAnimation]);

  const restoreAnchor = useCallback((anchor) => {
    if (!anchor) return;
    if (!pagesRef.current) { pendingAnchorRef.current = anchor; return; }
    stopAnimation();
    land(pageForAnchor(pagesRef.current, anchor, lengthsRef.current));
  }, [land, stopAnimation]);

  /* ——— drag ——— */
  const dragStart = useCallback((x) => {
    if (animationRef.current) {
      // Commit the in-flight turn instantly so the finger grabs a
      // settled page, never a moving one.
      const token = animationRef.current;
      animationRef.current = null;
      try { token.animation.finish(); } catch { /* noop */ }
      land(pageRef.current);
    }
    dragRef.current = { x0: x, active: false, dead: false, direction: 0, samples: [{ x, t: performance.now() }] };
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
    host.style.width = `${w}px`;
    // A chapter change must NOT inherit the old chapter's anchor: the
    // hook's restore (which runs right after this layout pass) owns
    // the new chapter's position, and settling here would overwrite
    // its stored anchor before the hook reads it. Same-chapter
    // repagination (settings, resize, fonts) keeps the position.
    const chapterChanged = lastChapterKeyRef.current !== chapterKey;
    lastChapterKeyRef.current = chapterKey;
    const anchorBefore = chapterChanged
      ? pendingAnchorRef.current
      : (pagesRef.current ? anchorOf(pageRef.current) : pendingAnchorRef.current);
    const { titleHeight, lines } = measureChapter(host, { title, paragraphs });
    const cappedTitle = Math.min(titleHeight, Math.floor(h * 0.5));
    const next = packPages(lines, h, { titleHeight: cappedTitle, paragraphLengths: lengthsRef.current });
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

  const renderSegment = (segment, key) => {
    const text = (paragraphs[segment.p] || "").slice(segment.start, segment.end);
    const style = {};
    if (segment.gap) style.marginTop = `${segment.gap}px`;
    if (!segment.startsParagraph) style.textIndent = "0px";
    if (segment.p === 0) {
      return (
        <p key={key} className="article-lede" style={style} data-reading-paragraph={segment.p}>
          {text}
        </p>
      );
    }
    return (
      <p key={key} style={style} data-reading-paragraph={segment.p}>
        {text}
      </p>
    );
  };

  return (
    <div className="reader-pager" ref={viewportRef}>
      <div className="reader-pager-track" ref={trackRef}>
        {(pages || []).map((page, pageIndex) => {
          const lede = page.segments.filter((segment) => segment.p === 0);
          const bodySegments = page.segments.filter((segment) => segment.p > 0);
          return (
            <div className="reader-pager-page" key={pageIndex} aria-hidden={pageIndex !== pageRef.current || undefined}>
              <article className="reader-article">
                {pageIndex === 0 && <h1>{title}</h1>}
                <div className="reader-prose" lang="zh-CN">
                  {lede.map((segment, index) => renderSegment(segment, `lede-${index}`))}
                  <div className="article-body">
                    {bodySegments.map((segment, index) => renderSegment(segment, `body-${index}`))}
                  </div>
                </div>
              </article>
            </div>
          );
        })}
        {pages && (
          <div className="reader-pager-page reader-pager-end">
            <article className="reader-article">{endMatter}</article>
          </div>
        )}
      </div>
      <div className="reader-pager-measure" ref={measureRef} aria-hidden="true" />
    </div>
  );
}
