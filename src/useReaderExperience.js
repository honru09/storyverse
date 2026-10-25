import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clamp, createReadingLocationStore, normalizeAnchor } from './reading-location.js';

export function useReaderExperience({ readerRef, locationKey, settings, blocked }) {
  const [store] = useState(() => createReadingLocationStore());
  const [progress, setProgress] = useState(0);
  const [warning, setWarning] = useState(store.warning);
  const [wakeStatus, setWakeStatus] = useState('');
  const anchor = useRef(null);
  const pending = useRef(null);
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const nodes = useCallback(() => [...(readerRef.current?.querySelectorAll('[data-reading-paragraph]') || [])], [readerRef]);
  const inset = useCallback(() => (readerRef.current?.querySelector('.reader-topline')?.getBoundingClientRect().height || 72) + 18, [readerRef]);

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
    const visible = window.innerHeight - inset() - 104;
    const percent = box.height <= visible ? 100 : clamp(Math.round((inset() - box.top) / (box.height - visible) * 100), 0, 100);
    setProgress(percent);
  }, [readerRef, inset]);

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
  const pageBy = useCallback(direction => {
    const top = window.scrollY + direction * Math.max(120, window.innerHeight - inset() - 120);
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
  return { progress, warning, wakeStatus, store, capture, preserve, jump, pageBy };
}
