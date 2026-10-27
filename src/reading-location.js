export const READING_LOCATION_KEY = 'storyweave:reading-locations:v1';
const MAX_LOCATIONS = 100;
const MAX_BOOKMARKS = 80;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Content identity prevents a rewritten branch from restoring an obsolete place.
export function chapterLocationKey(storyId, chapterIndex, paragraphs = [], readOnly = false) {
  let hash = 2166136261;
  for (const char of paragraphs.join('\n')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${readOnly ? 'public' : 'private'}:${storyId}:${chapterIndex}:${(hash >>> 0).toString(36)}`;
}

export function normalizeAnchor(value, count = Number.MAX_SAFE_INTEGER) {
  if (!record(value) || !Number.isInteger(value.paragraph) || value.paragraph < 0 ||
      !Number.isFinite(value.offset) || count < 1) return null;
  return { paragraph: clamp(value.paragraph, 0, count - 1), offset: clamp(value.offset, 0, 1) };
}

export function findInChapters(chapters, query, lastAccessible = chapters.length - 1) {
  const needle = String(query || '').trim().slice(0, 100).toLocaleLowerCase();
  if (!needle) return [];
  const results = [];
  chapters.slice(0, lastAccessible + 1).forEach((chapter, chapterIndex) => {
    chapter?.paragraphs?.forEach((text, paragraph) => {
      const offset = text.toLocaleLowerCase().indexOf(needle);
      if (offset < 0 || results.length >= 60) return;
      const start = Math.max(0, offset - 24);
      results.push({ chapterIndex, paragraph, title: chapter.title,
        snippet: `${start ? '…' : ''}${text.slice(start, offset + needle.length + 60)}${text.length > offset + needle.length + 60 ? '…' : ''}` });
    });
  });
  return results;
}

// 统计章节有效字数（剔除空白字符）与预计阅读分钟数（按中文沉浸阅读约 360 字/分钟估算）。
export function estimateReadingMetrics(paragraphs = []) {
  if (!Array.isArray(paragraphs)) return { charCount: 0, readingMinutes: 0, paragraphCount: 0 };
  const validParagraphs = paragraphs.filter(text => typeof text === 'string' && text.trim().length > 0);
  const charCount = validParagraphs.reduce((sum, text) => sum + text.replace(/\s+/g, '').length, 0);
  const readingMinutes = charCount > 0 ? Math.max(1, Math.ceil(charCount / 360)) : 0;
  return { charCount, readingMinutes, paragraphCount: validParagraphs.length };
}

/**
 * A deleted book takes its reading positions and bookmarks with it.
 * Locations are keyed `private|public:<storyId>:…`; bookmarks carry the
 * story id outright (and the same key shape). Pure — the caller
 * persists the result; other books' entries pass through untouched.
 */
export function readingStateWithoutStory(state, storyId) {
  if (!record(state) || typeof storyId !== 'string' || !storyId) return state;
  const owns = key => typeof key === 'string' &&
    (key.startsWith(`private:${storyId}:`) || key.startsWith(`public:${storyId}:`));
  return {
    ...state,
    locations: (Array.isArray(state.locations) ? state.locations : []).filter(entry => !owns(entry?.key)),
    bookmarks: (Array.isArray(state.bookmarks) ? state.bookmarks : [])
      .filter(entry => entry?.storyId !== storyId && !owns(entry?.key)),
  };
}

export function createReadingLocationStore({ storage } = {}) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { /* Unavailable storage is recoverable. */ } }
  let locations = [];
  let bookmarks = [];
  let warning = '';
  let lastRaw;
  let readable = true;
  const validEntry = entry => record(entry) && typeof entry.key === 'string' && entry.key.length < 300 && normalizeAnchor(entry.anchor);
  const refresh = () => {
    try {
      const raw = storage?.getItem(READING_LOCATION_KEY) ?? null;
      readable = true;
      if (raw === lastRaw) return;
      if (!raw) { locations = []; bookmarks = []; lastRaw = raw; return; }
      const parsed = JSON.parse(raw);
      if (parsed.version !== 1 || !Array.isArray(parsed.locations) || !Array.isArray(parsed.bookmarks)) throw new Error('Invalid record');
      locations = parsed.locations.filter(validEntry).slice(-MAX_LOCATIONS);
      bookmarks = parsed.bookmarks.filter(entry => validEntry(entry) && typeof entry.storyId === 'string' &&
        Number.isInteger(entry.chapterIndex) && entry.chapterIndex >= 0 && typeof entry.title === 'string' && typeof entry.excerpt === 'string').slice(-MAX_BOOKMARKS);
      lastRaw = raw;
    } catch { readable = false; warning = '上次的阅读位置暂时无法读取，故事正文不受影响。'; }
  };
  refresh();
  const save = () => {
    try {
      if (!readable) return warning;
      if (!storage?.setItem) throw new Error('Unavailable');
      const raw = JSON.stringify({ version: 1, locations, bookmarks });
      storage.setItem(READING_LOCATION_KEY, raw);
      lastRaw = raw;
      warning = '';
    } catch { warning = '阅读位置仅在本页保留，暂时无法保存到本机。'; }
    return warning;
  };
  return {
    get: key => { refresh(); return normalizeAnchor(locations.find(entry => entry.key === key)?.anchor); },
    warning: () => warning,
    set(key, value) {
      const anchor = normalizeAnchor(value);
      if (!anchor || typeof key !== 'string' || key.length >= 300) return warning;
      refresh();
      locations = [...locations.filter(entry => entry.key !== key), { key, anchor }].slice(-MAX_LOCATIONS);
      return save();
    },
    bookmarks: (storyId, keys) => { refresh(); return bookmarks.filter(entry => entry.storyId === storyId && (!keys || keys.includes(entry.key))); },
    toggleBookmark(entry) {
      if (!validEntry(entry) || typeof entry.storyId !== 'string' || !Number.isInteger(entry.chapterIndex)) return false;
      refresh();
      const existing = bookmarks.some(item => item.key === entry.key && item.anchor.paragraph === entry.anchor.paragraph);
      bookmarks = bookmarks.filter(item => item.key !== entry.key || item.anchor.paragraph !== entry.anchor.paragraph);
      if (!existing) bookmarks.push({ key: entry.key, storyId: entry.storyId, chapterIndex: entry.chapterIndex,
        anchor: normalizeAnchor(entry.anchor), title: String(entry.title || '').slice(0, 150), excerpt: String(entry.excerpt || '').slice(0, 110) });
      bookmarks = bookmarks.slice(-MAX_BOOKMARKS);
      save();
      return !existing;
    },
    removeBookmark(key, paragraph) {
      refresh();
      bookmarks = bookmarks.filter(item => item.key !== key || item.anchor.paragraph !== paragraph);
      return save();
    },
  };
}
