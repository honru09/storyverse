import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clamp, createReadingLocationStore, normalizeAnchor } from './reading-location.js';

export function useReaderExperience({ readerRef, locationKey, settings, blocked, turnMotion = false }) {
  const [store] = useState(() => createReadingLocationStore());
  const [progress, setProgress] = useState(0);
  const [warning, setWarning] = useState(store.warning);
  const [wakeStatus, setWakeStatus] = useState('');
  const anchor = useRef(null);
  const pending = useRef(null);
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const turnMotionRef = useRef(turnMotion);
  turnMotionRef.current = turnMotion;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const nodes = useCallback(() => [...(readerRef.current?.querySelectorAll('[data-reading-paragraph]') || [])], [readerRef]);
  // The immersive chrome leaves only two hairlines over the prose: the
  // top status line (back + chapter) and the bottom one (progress +
  // clock). Position math aims a paragraph just below the top hairline
  // and counts the visible band as what sits between the two lines.
  const inset = useCallback(() => (readerRef.current?.querySelector('.reader-status-top')?.getBoundingClientRect().height || 38) + 10, [readerRef]);
  const bottomInset = useCallback(() => (readerRef.current?.querySelector('.reader-status-bottom')?.getBoundingClientRect().height || 30) + 8, [readerRef]);

  const capture = useCallback(() => {
    const paragraphs = nodes();
    if (!paragraphs.length) return null;
    const top = inset();
    let paragraph = paragraphs.findIndex(node => node.getBoundingClientRect().bottom > top);
    if (paragraph === -1) paragraph = paragraphs.length - 1;
    const box = paragraphs[paragraph].getBoundingClientRect();
    return { paragraph, offset: clamp((top - box.top) / Math.max(1, box.height), 0, 1) };
  }, [nodes, inset]);

  const restore = useCallback((value) => {
    const paragraphs = nodes();
    const position = normalizeAnchor(value, paragraphs.length);
    if (!position) return;
    const box = paragraphs[position.paragraph].getBoundingClientRect();
    window.scrollTo({ top: Math.max(0, window.scrollY + box.top + box.height * position.offset - inset()), behavior: 'instant' });
    anchor.current = position;
  }, [nodes, inset]);

  const readProgress = useCallback(() => {
    const content = readerRef.current?.querySelector('.reader-prose');
    if (!content) return;
    const box = content.getBoundingClientRect();
    const visible = window.innerHeight - inset() - bottomInset();
    const percent = box.height <= visible ? 100 : clamp(Math.round((inset() - box.top) / (box.height - visible) * 100), 0, 100);
    setProgress(percent);
  }, [readerRef, inset, bottomInset]);

  // Inverse of readProgress for the chrome slider: land the prose so
  // that the requested share of this chapter sits above the fold line.
  const seekToProgress = useCallback((percent) => {
    const content = readerRef.current?.querySelector('.reader-prose');
    if (!content) return;
    const box = content.getBoundingClientRect();
    const visible = window.innerHeight - inset() - bottomInset();
    if (box.height <= visible) return;
    const targetTop = inset() - (clamp(percent, 0, 100) / 100) * (box.height - visible);
    window.scrollTo({ top: Math.max(0, window.scrollY + box.top - targetTop), behavior: 'instant' });
  }, [readerRef, inset, bottomInset]);

  useLayoutEffect(() => {
    if (!locationKey) return;
    let live = true;
    let frame = 0;
    let timer = 0;
    let restoring = true;
    anchor.current = store.get(locationKey);
    const flush = () => { if (anchor.current) setWarning(store.set(locationKey, anchor.current)); };
    const scroll = () => {
      if (restoring || blockedRef.current || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        anchor.current = capture();
        readProgress();
        clearTimeout(timer);
        timer = setTimeout(flush, 500);
      });
    };
    const resize = () => {
      if (blockedRef.current) return;
      restoring = true;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = 0; restore(anchor.current); readProgress(); restoring = false; });
    };
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!live) return;
      if (anchor.current) restore(anchor.current);
      else window.scrollTo({ top: 0, behavior: 'instant' });
      readProgress();
      restoring = false;
    });
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', resize);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      if (anchor.current) store.set(locationKey, anchor.current);
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [locationKey, store, capture, restore, readProgress]);

  useLayoutEffect(() => {
    if (pending.current) { restore(pending.current); pending.current = null; readProgress(); }
  }, [settings, restore, readProgress]);

  const preserve = useCallback(() => { pending.current = capture(); }, [capture]);
  const jump = useCallback(value => { restore(value); readProgress(); setWarning(store.set(locationKey, value)); }, [restore, readProgress, store, locationKey]);

  /* ——— READER-PAGE (REQ-38): real page turns ———
     Paged mode used to be an instant window scroll. A turn now clones
     the live .reader-layout twice into a fixed full-screen stage on
     <body> (the outgoing screen and the incoming one, each clone
     offset by translateY so it is pixel-identical to the real page at
     its scroll position), slides the pair sideways with the house
     drawer spring, and only then commits the real scroll — the stage
     lifts on the exact frame the page beneath already shows the same
     pixels, so there is no flash and no reflow: pagination is the
     scroll geometry itself, identical before and after the animation.
     Only transform/opacity animate. When turnMotion is off (motion
     settings, reduced motion, keyboard input) pageBy keeps the old
     instant jump, functionally unchanged. */
  const TURN_MS = 300;
  const TURN_EASE = 'cubic-bezier(.32,.72,0,1)';
  const turnRef = useRef(null);
  const crossRef = useRef(null);
  const dragRef = useRef(null);
  const queuedTurnRef = useRef(0);
  const turnApi = useRef({});
  const pageStepPx = useCallback(() => Math.max(120, window.innerHeight - inset() - 96), [inset]);
  const maxScrollY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  const removeStage = (stage) => {
    if (!stage) return;
    if (stage.watchdog) clearTimeout(stage.watchdog);
    stage.host?.remove();
  };

  const cloneIntoSheet = (sheet, layout, docTop, sheetScrollY) => {
    const rect = layout.getBoundingClientRect();
    const clone = layout.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    const inner = document.createElement('div');
    inner.className = 'reader-turn-sheet-inner';
    inner.style.left = `${rect.left}px`;
    inner.style.width = `${rect.width}px`;
    inner.style.transform = `translateY(${docTop - sheetScrollY}px)`;
    inner.appendChild(clone);
    sheet.appendChild(inner);
  };

  const buildStage = (direction, fromY) => {
    const root = readerRef.current;
    const layout = root?.querySelector('.reader-layout');
    if (!root || !layout) return null;
    const host = document.createElement('div');
    host.className = 'page-reader reader-turn-host';
    for (const attr of ['data-reader-theme', 'data-reader-mode']) {
      const value = root.getAttribute(attr);
      if (value) host.setAttribute(attr, value);
    }
    host.setAttribute('style', root.getAttribute('style') || '');
    host.setAttribute('aria-hidden', 'true');
    const track = document.createElement('div');
    track.className = 'reader-turn-track';
    const sheetCurrent = document.createElement('div');
    sheetCurrent.className = 'reader-turn-sheet';
    const sheetTarget = document.createElement('div');
    sheetTarget.className = 'reader-turn-sheet';
    // Seam shades: a soft cast shadow on the incoming page's leading
    // edge and a lighter one trailing the outgoing page — the depth
    // cue that reads as one sheet sliding over another.
    const shadeIn = document.createElement('div');
    shadeIn.className = `reader-turn-shade ${direction > 0 ? 'reader-turn-shade-in' : 'reader-turn-shade-in-rev'}`;
    sheetTarget.appendChild(shadeIn);
    const shadeOut = document.createElement('div');
    shadeOut.className = `reader-turn-shade ${direction > 0 ? 'reader-turn-shade-out' : 'reader-turn-shade-out-rev'}`;
    sheetCurrent.appendChild(shadeOut);
    if (direction > 0) track.append(sheetCurrent, sheetTarget);
    else track.append(sheetTarget, sheetCurrent);
    host.appendChild(track);
    const docTop = layout.getBoundingClientRect().top + fromY;
    cloneIntoSheet(sheetCurrent, layout, docTop, fromY);
    const stage = { host, track, sheetCurrent, sheetTarget, direction, layout, docTop, shades: [shadeIn, shadeOut], watchdog: 0 };
    // Rapid taps during a turn land on the stage, not the reader:
    // translate their side zones into the one-deep turn queue.
    host.addEventListener('pointerup', (event) => {
      const zone = event.clientX / Math.max(1, host.clientWidth || window.innerWidth);
      if (zone < 1 / 3) queuedTurnRef.current = -1;
      else if (zone > 2 / 3) queuedTurnRef.current = 1;
    });
    return stage;
  };

  const animateTrack = (stage, fromTransform, toTransform, duration, onDone, shadeTo = null) => {
    const ms = Math.max(60, duration);
    stage.track.style.transform = fromTransform;
    const animation = stage.track.animate(
      [{ transform: fromTransform }, { transform: toTransform }],
      { duration: ms, easing: TURN_EASE, fill: 'forwards' },
    );
    if (shadeTo !== null) {
      stage.shades.forEach((shade) => {
        const from = Number.parseFloat(shade.style.opacity || '0') || 0;
        shade.animate([{ opacity: from }, { opacity: shadeTo }], { duration: ms, easing: 'ease-out', fill: 'forwards' });
        shade.style.opacity = String(shadeTo);
      });
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (stage.watchdog) clearTimeout(stage.watchdog);
      onDone?.();
    };
    animation.onfinish = finish;
    stage.watchdog = setTimeout(finish, ms + 500);
  };

  const settleAt = (y) => {
    window.scrollTo({ top: y, behavior: 'instant' });
    const next = capture();
    if (next) anchor.current = next;
    readProgress();
  };

  const drainQueue = () => {
    const direction = queuedTurnRef.current;
    queuedTurnRef.current = 0;
    if (direction) turnApi.current.animatedPageBy?.(direction);
  };

  const animatedPageBy = (direction) => {
    if (turnRef.current) { queuedTurnRef.current = direction; return true; }
    if (blockedRef.current) return false;
    const fromY = window.scrollY;
    const toY = clamp(fromY + direction * pageStepPx(), 0, maxScrollY());
    if (toY === fromY) return false;
    const stage = buildStage(direction, fromY);
    if (!stage) return false;
    cloneIntoSheet(stage.sheetTarget, stage.layout, stage.docTop, toY);
    document.body.appendChild(stage.host);
    turnRef.current = stage;
    const base = direction > 0 ? 'translateX(0%)' : 'translateX(-100%)';
    const dest = direction > 0 ? 'translateX(-100%)' : 'translateX(0%)';
    animateTrack(stage, base, dest, TURN_MS, () => {
      settleAt(toY);
      removeStage(stage);
      if (turnRef.current === stage) turnRef.current = null;
      drainQueue();
    }, 1);
    return true;
  };

  /* Cross-chapter turn: the old chapter's screen is captured first,
     the caller then swaps the chapter; completeCrossTurn (from the
     reader's layout effect on the chapter index) clones the new
     chapter as the incoming sheet and slides. If the new tree never
     materialises (a generation wait page replaces the layout), a
     watchdog fades the held screen out instead of stranding it. */
  const beginCrossTurn = (direction) => {
    if (!turnMotionRef.current || turnRef.current || crossRef.current || dragRef.current?.active) return false;
    if (blockedRef.current) return false;
    const stage = buildStage(direction, window.scrollY);
    if (!stage) return false;
    document.body.appendChild(stage.host);
    crossRef.current = stage;
    stage.watchdog = setTimeout(() => completeCrossTurn(true), 900);
    return true;
  };

  const completeCrossTurn = (fallback = false) => {
    const stage = crossRef.current;
    if (!stage) return;
    crossRef.current = null;
    if (stage.watchdog) clearTimeout(stage.watchdog);
    // The location restore for the new chapter is rAF-scheduled by the
    // layout effect above and was queued first; one frame later the
    // real page has settled, so the incoming clone matches it exactly.
    requestAnimationFrame(() => {
      const layout = readerRef.current?.querySelector('.reader-layout');
      if (!fallback && layout) {
        const toY = window.scrollY;
        const docTop = layout.getBoundingClientRect().top + toY;
        cloneIntoSheet(stage.sheetTarget, layout, docTop, toY);
        turnRef.current = stage;
        const base = stage.direction > 0 ? 'translateX(0%)' : 'translateX(-100%)';
        const dest = stage.direction > 0 ? 'translateX(-100%)' : 'translateX(0%)';
        animateTrack(stage, base, dest, TURN_MS, () => {
          removeStage(stage);
          if (turnRef.current === stage) turnRef.current = null;
          drainQueue();
        }, 1);
      } else {
        const fade = stage.host.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' });
        let gone = false;
        const done = () => { if (!gone) { gone = true; removeStage(stage); } };
        fade.onfinish = done;
        setTimeout(done, 320);
      }
    });
  };

  const cancelCrossTurn = () => {
    const stage = crossRef.current;
    if (!stage) return;
    crossRef.current = null;
    removeStage(stage);
  };

  /* Drag-to-turn: the track follows the finger 1:1; on release the
     remaining distance animates with the same spring, completing the
     turn past ~26% travel or on a decisive flick, otherwise settling
     back (no overshoot). Chapter boundaries stay tap-only: a drag at
     the edge builds nothing. */
  const dragStart = (x) => {
    dragRef.current = { x0: x, active: false, dead: false, samples: [{ x, t: performance.now() }] };
  };

  const dragMove = (x) => {
    const drag = dragRef.current;
    if (!drag || drag.dead) return false;
    drag.samples.push({ x, t: performance.now() });
    if (drag.samples.length > 5) drag.samples.shift();
    const dx = x - drag.x0;
    if (!drag.active) {
      if (Math.abs(dx) < 9) return false;
      if (!turnMotionRef.current || settingsRef.current.readingMode !== 'page' || turnRef.current || crossRef.current || blockedRef.current) { drag.dead = true; return false; }
      const direction = dx < 0 ? 1 : -1;
      const fromY = window.scrollY;
      const toY = clamp(fromY + direction * pageStepPx(), 0, maxScrollY());
      if (toY === fromY) { drag.dead = true; return false; }
      const stage = buildStage(direction, fromY);
      if (!stage) { drag.dead = true; return false; }
      cloneIntoSheet(stage.sheetTarget, stage.layout, stage.docTop, toY);
      document.body.appendChild(stage.host);
      Object.assign(drag, { active: true, direction, toY, stage, width: stage.host.clientWidth || window.innerWidth });
      turnRef.current = stage;
    }
    const { stage, direction, width } = drag;
    const base = direction > 0 ? 0 : -width;
    const offset = clamp(base + dx, -width, 0);
    stage.track.style.transform = `translateX(${offset}px)`;
    const progress = Math.abs(offset - base) / Math.max(1, width);
    stage.shades.forEach((shade) => { shade.style.opacity = String(Math.min(1, progress * 1.2)); });
    return true;
  };

  const finishDrag = (forceBack) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.active) return false;
    const { stage, direction, toY, width, samples, x0 } = drag;
    const lastX = samples[samples.length - 1].x;
    const dx = lastX - x0;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const velocity = last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
    const traveled = Math.abs(dx);
    const complete = !forceBack && (traveled > width * 0.26
      || (Math.sign(velocity) === -direction && Math.abs(velocity) > 0.45 && traveled > 36));
    const base = direction > 0 ? 0 : -width;
    const current = clamp(base + dx, -width, 0);
    const dest = complete ? (direction > 0 ? -width : 0) : base;
    const remaining = Math.abs(dest - current);
    animateTrack(stage, `translateX(${current}px)`, `translateX(${dest}px)`,
      60 + (remaining / Math.max(1, width)) * TURN_MS, () => {
        if (complete) settleAt(toY);
        removeStage(stage);
        if (turnRef.current === stage) turnRef.current = null;
        if (complete) drainQueue();
      }, complete ? 1 : 0);
    return true;
  };
  const dragEnd = () => finishDrag(false);
  const dragCancel = () => finishDrag(true);

  turnApi.current = { animatedPageBy, beginCrossTurn, completeCrossTurn, cancelCrossTurn, dragStart, dragMove, dragEnd, dragCancel };

  useEffect(() => () => {
    removeStage(turnRef.current);
    removeStage(crossRef.current);
    turnRef.current = null;
    crossRef.current = null;
    dragRef.current = null;
  }, []);

  const pageBy = useCallback(direction => {
    if (!blockedRef.current && settingsRef.current.readingMode === 'page' && turnMotionRef.current) {
      if (turnApi.current.animatedPageBy?.(direction)) return;
    }
    const top = window.scrollY + direction * Math.max(120, window.innerHeight - inset() - 96);
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  }, [inset]);

  useEffect(() => {
    if (settings.readingMode !== 'page') return;
    const keydown = event => {
      if (blockedRef.current || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
          event.target.closest('input,textarea,select,button,a,summary,[contenteditable="true"]')) return;
      if (['ArrowRight', 'PageDown', 'ArrowLeft', 'PageUp'].includes(event.key)) {
        event.preventDefault(); pageBy(['ArrowLeft', 'PageUp'].includes(event.key) ? -1 : 1);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [settings.readingMode, pageBy]);

  useEffect(() => {
    let active = true;
    let lock = null;
    let requesting = false;
    if (!settings.keepAwake) { setWakeStatus(''); return; }
    if (!navigator.wakeLock?.request) { setWakeStatus('此浏览器不支持保持屏幕常亮，请使用系统设置。'); return; }
    const request = async () => {
      if (document.visibilityState !== 'visible' || requesting || lock) return;
      requesting = true;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (!active) { await next.release(); return; }
        lock = next;
        setWakeStatus('阅读时保持屏幕常亮');
        next.addEventListener('release', () => { lock = null; if (active) setWakeStatus('系统已暂停常亮，回到阅读后会再尝试。'); }, { once: true });
      } catch { if (active) setWakeStatus('系统未允许常亮，阅读仍可继续。'); }
      finally { requesting = false; }
    };
    void request();
    document.addEventListener('visibilitychange', request);
    return () => { active = false; document.removeEventListener('visibilitychange', request); if (lock) void lock.release().catch(() => {}); };
  }, [settings.keepAwake]);
  return { progress, warning, wakeStatus, store, capture, preserve, jump, pageBy, seekToProgress, beginCrossTurn, completeCrossTurn, cancelCrossTurn, dragStart, dragMove, dragEnd, dragCancel };
}
