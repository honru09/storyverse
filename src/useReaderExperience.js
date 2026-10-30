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
  const locationKeyRef = useRef(locationKey);
  locationKeyRef.current = locationKey;
  /* READER-FIX2 (REQ-46): paged mode is served by the pre-paginating
   * ReaderPager (components/ReaderPager.jsx) — a fixed container, the
   * chapter packed into fixed pages at whole-line boundaries, turns
   * sliding the whole-page track. The pager registers its API here and
   * every position operation below delegates to it while the reading
   * mode is "page"; scroll mode keeps the DOM paths. A restore asked
   * for before the pager registers is stashed and replayed on
   * registration. The clone-sheet engine that used to live here is
   * gone: cloned layouts ghosted into double-printed text on real
   * WebKit, which is why the owner ordered the rebuild. */
  const pagerApiRef = useRef(null);
  const stashedRestoreRef = useRef(null);
  const registerPager = useCallback((api) => {
    pagerApiRef.current = api;
    if (api && stashedRestoreRef.current) {
      const value = stashedRestoreRef.current;
      stashedRestoreRef.current = null;
      api.restoreAnchor(value);
    }
  }, []);
  const pagerActive = useCallback(() => (
    settingsRef.current.readingMode === 'page' ? pagerApiRef.current : null
  ), []);
  const nodes = useCallback(() => [...(readerRef.current?.querySelectorAll('[data-reading-paragraph]') || [])], [readerRef]);
  // The immersive chrome leaves only two hairlines over the prose: the
  // top status line (back + chapter) and the bottom one (progress +
  // clock). Position math aims a paragraph just below the top hairline
  // and counts the visible band as what sits between the two lines.
  const inset = useCallback(() => (readerRef.current?.querySelector('.reader-status-top')?.getBoundingClientRect().height || 38) + 10, [readerRef]);
  const bottomInset = useCallback(() => (readerRef.current?.querySelector('.reader-status-bottom')?.getBoundingClientRect().height || 30) + 8, [readerRef]);

  const capture = useCallback(() => {
    const api = pagerActive();
    if (api?.ready()) return api.captureAnchor() ?? anchor.current;
    if (settingsRef.current.readingMode === 'page') return anchor.current;
    const paragraphs = nodes();
    if (!paragraphs.length) return null;
    const top = inset();
    let paragraph = paragraphs.findIndex(node => node.getBoundingClientRect().bottom > top);
    if (paragraph === -1) paragraph = paragraphs.length - 1;
    const box = paragraphs[paragraph].getBoundingClientRect();
    return { paragraph, offset: clamp((top - box.top) / Math.max(1, box.height), 0, 1) };
  }, [nodes, inset, pagerActive]);

  const restore = useCallback((value) => {
    const position = normalizeAnchor(value, Number.MAX_SAFE_INTEGER);
    if (!position) return;
    anchor.current = position;
    if (settingsRef.current.readingMode === 'page') {
      const api = pagerApiRef.current;
      if (api) api.restoreAnchor(position);
      else stashedRestoreRef.current = position;
      return;
    }
    const paragraphs = nodes();
    const bounded = normalizeAnchor(value, paragraphs.length);
    if (!bounded) return;
    const box = paragraphs[bounded.paragraph].getBoundingClientRect();
    window.scrollTo({ top: Math.max(0, window.scrollY + box.top + box.height * bounded.offset - inset()), behavior: 'instant' });
    anchor.current = bounded;
  }, [nodes, inset]);

  const readProgress = useCallback(() => {
    const api = pagerActive();
    if (api?.ready()) { setProgress(api.progressPercent()); return; }
    if (settingsRef.current.readingMode === 'page') return;
    const content = readerRef.current?.querySelector('.reader-prose');
    if (!content) return;
    const box = content.getBoundingClientRect();
    const visible = window.innerHeight - inset() - bottomInset();
    const percent = box.height <= visible ? 100 : clamp(Math.round((inset() - box.top) / (box.height - visible) * 100), 0, 100);
    setProgress(percent);
  }, [readerRef, inset, bottomInset, pagerActive]);

  // Inverse of readProgress for the chrome slider: land the prose so
  // that the requested share of this chapter sits above the fold line.
  const seekToProgress = useCallback((percent) => {
    const api = pagerActive();
    if (api) { api.seekTo(percent); return; }
    if (settingsRef.current.readingMode === 'page') return;
    const content = readerRef.current?.querySelector('.reader-prose');
    if (!content) return;
    const box = content.getBoundingClientRect();
    const visible = window.innerHeight - inset() - bottomInset();
    if (box.height <= visible) return;
    const targetTop = inset() - (clamp(percent, 0, 100) / 100) * (box.height - visible);
    window.scrollTo({ top: Math.max(0, window.scrollY + box.top - targetTop), behavior: 'instant' });
  }, [readerRef, inset, bottomInset, pagerActive]);

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
      else restore({ paragraph: 0, offset: 0 });
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

  /* The pager reports every settled page here: the anchor and the
   * by-page progress become the hook's own state, persisted through
   * the same location store scroll mode uses. */
  const notePagerSettle = useCallback((nextAnchor, percent) => {
    const position = normalizeAnchor(nextAnchor, Number.MAX_SAFE_INTEGER);
    if (position) {
      anchor.current = position;
      if (locationKeyRef.current) setWarning(store.set(locationKeyRef.current, position));
    }
    if (Number.isFinite(percent)) setProgress(percent);
  }, [store]);

  const pageInfo = useCallback(() => pagerApiRef.current?.pageInfo() ?? null, []);

  const pageBy = useCallback(direction => {
    if (blockedRef.current) return;
    if (settingsRef.current.readingMode === 'page') {
      pagerApiRef.current?.pageBy(direction);
      return;
    }
    const top = window.scrollY + direction * Math.max(120, window.innerHeight - inset() - 96);
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  }, [inset]);

  /* Cross-chapter turns: the hook arms the pager before the caller
   * swaps the chapter; the reader's layout effect on the new chapter
   * index completes the slide-in against the freshly paginated
   * chapter. Motion off (or scroll mode) keeps the plain jump. */
  const beginCrossTurn = useCallback((direction) => {
    if (!turnMotionRef.current || blockedRef.current) return false;
    if (settingsRef.current.readingMode !== 'page') return false;
    return pagerApiRef.current?.armCrossTurn(direction) ?? false;
  }, []);
  const completeCrossTurn = useCallback(() => { pagerApiRef.current?.completeCrossTurn(); }, []);
  const cancelCrossTurn = useCallback(() => { pagerApiRef.current?.cancelCrossTurn(); }, []);

  /* Drag-to-turn delegates to the pager in paged mode (track follows
   * the finger 1:1, release settles on a spring). In scroll mode the
   * gesture was always inert and stays so. Chapter boundaries stay
   * tap-only: the pager builds nothing past its first/last page. */
  const dragStart = useCallback((x) => {
    if (blockedRef.current) return;
    pagerActive()?.dragStart(x);
  }, [pagerActive]);
  const dragMove = useCallback((x) => {
    if (blockedRef.current) return false;
    return pagerActive()?.dragMove(x) ?? false;
  }, [pagerActive]);
  const dragEnd = useCallback(() => pagerActive()?.dragEnd() ?? false, [pagerActive]);
  const dragCancel = useCallback(() => { pagerActive()?.dragCancel(); }, [pagerActive]);

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
  return { progress, warning, wakeStatus, store, capture, preserve, jump, pageBy, seekToProgress, beginCrossTurn, completeCrossTurn, cancelCrossTurn, dragStart, dragMove, dragEnd, dragCancel, registerPager, notePagerSettle, pageInfo };
}
