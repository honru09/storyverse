export const READING_PREFERENCES_KEY = "storyweave:reading-preferences:v1";
/* Fluid type (DESIGN §32, user order 2026-10-28): the prose size is
   never a fixed px value. The base size derives from the viewport
   width — clamp(15px, 2.56vw + 6px, 19px) at a 16px root: ~15.4px
   at 360 wide, ~16px at 390, ~17.2px at 430, capped 19px on
   tablets — and the reader's preference is a multiplier on that
   base, so the same account adapts to any phone instead of carrying
   one device's px. The ladder tops out at 1.5x; stored sizes above
   the old 24px cap clamp onto it (READER-FIX3 §31) instead of
   being honoured. Constants are in rem so root text scaling still
   applies; only the vw term tracks the viewport. */
export const READER_FONT_SCALES = Object.freeze([0.875, 1, 1.125, 1.25, 1.375, 1.5]);
export const READER_FLUID_BASE = "clamp(0.9375rem, 2.56vw + 0.375rem, 1.1875rem)";
/* Legacy px ladder, kept only so stored records can be converted. */
const LEGACY_FONT_SIZE_RANGE = Object.freeze([14, 24]);
const LEGACY_REFERENCE_PX = 16;
export const READER_LINE_HEIGHTS = Object.freeze([1.6, 1.8, 1.9, 2.05, 2.3]);
export const READER_THEMES = Object.freeze(["light", "warm", "green", "night", "oled", "system"]);
export const READER_FONT_FAMILIES = Object.freeze({
  system: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: '"Songti SC", "Noto Serif CJK SC", "Noto Serif SC", "Source Han Serif SC", SimSun, serif',
});
export const DEFAULT_READING_PREFERENCES = Object.freeze({
  /* Default step is 1x on the fluid base (≈16px at 390 wide). The
     fixed 18px default was measured on the user's iPhone still
     reading "big and bold" (READER-FIX3 §3); the base formula in
     READER_FLUID_BASE supersedes any single fixed px (DESIGN §32). */
  fontScale: 1,
  lineHeight: 1.9,
  theme: "light",
  fontFamily: "system",
  fontWeight: 400,
  margin: "standard",
  paragraphSpacing: 0.6,
  paragraphIndent: true,
  textAlign: "left",
  letterSpacing: 0,
  readingMode: "scroll",
  keepAwake: false,
});

const OPTIONS = Object.freeze({
  fontScale: READER_FONT_SCALES,
  lineHeight: READER_LINE_HEIGHTS,
  theme: READER_THEMES,
  fontFamily: Object.keys(READER_FONT_FAMILIES),
  /* Only 400 remains: prose weight is decoupled from settings
     (READER-FIX3 §3), so a stored 600 normalizes to the default. */
  fontWeight: [400],
  margin: ["narrow", "standard", "wide"],
  paragraphSpacing: [0.6, 1, 1.4],
  paragraphIndent: [true, false],
  textAlign: ["left", "justify"],
  letterSpacing: [0, 0.03, 0.06],
  readingMode: ["scroll", "page"],
  keepAwake: [true, false],
});

const UNAVAILABLE_MESSAGE = "设置已在本页生效，但暂时无法保存到本机。";
const INVALID_MESSAGE = "原阅读设置无法完整读取，已恢复可用的默认选项。";
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** Only supported, typed values may reach CSS or persistent storage. */
export function normalizeReadingPreferences(value) {
  const source = isRecord(value) ? { ...value } : {};
  /* A finite numeric scale clamps into the ladder's range before the
     membership check: an out-of-range multiplier lands on the nearest
     supported step rather than being honoured or resetting the reader. */
  if (typeof source.fontScale === "number" && Number.isFinite(source.fontScale)) {
    source.fontScale = Math.min(READER_FONT_SCALES.at(-1), Math.max(READER_FONT_SCALES[0], source.fontScale));
  }
  return Object.freeze(Object.fromEntries(Object.entries(OPTIONS).map(([key, values]) => [
    key, Object.hasOwn(source, key) && values.includes(source[key]) ? source[key] : DEFAULT_READING_PREFERENCES[key],
  ])));
}

function browserStorage() {
  try { return globalThis.localStorage; }
  catch { return undefined; }
}

function loadPreferences(storage) {
  try {
    if (!storage?.getItem) return { settings: DEFAULT_READING_PREFERENCES, storageWarning: UNAVAILABLE_MESSAGE };
    const raw = storage.getItem(READING_PREFERENCES_KEY);
    if (raw === null || raw === undefined) {
      return { settings: DEFAULT_READING_PREFERENCES, storageWarning: null };
    }
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || ![1, 2, 3, 4].includes(parsed.version)) {
      return { settings: DEFAULT_READING_PREFERENCES, storageWarning: INVALID_MESSAGE };
    }
    /* Stored-settings rationalization (READER-FIX3 §31, fluid pass
       §32): records written by older builds froze the then-current
       defaults into storage the first time ANY setting changed,
       silently overriding every later default improvement. A stored
       value that exactly equals a previously shipped default was
       almost certainly frozen rather than chosen, so it follows the
       current default; deliberate non-default choices are never
       touched. Migration is in-memory only — the record on disk is
       rewritten (as version 4) on the next explicit change, never on
       mount. */
    const migrated = { ...parsed };
    if (parsed.version < 4) {
      /* px -> multiplier (DESIGN §32): legacy sizes divide by the 16px
         design reference, so every old ladder value lands exactly on
         a scale step (14 -> 0.875 ... 24 -> 1.5); oversize values
         clamp to the old ladder's range first. */
      if (typeof migrated.fontSize === "number" && Number.isFinite(migrated.fontSize)) {
        const px = Math.min(LEGACY_FONT_SIZE_RANGE[1], Math.max(LEGACY_FONT_SIZE_RANGE[0], migrated.fontSize));
        migrated.fontScale = READER_FONT_SCALES.reduce((best, step) =>
          (Math.abs(step - px / LEGACY_REFERENCE_PX) < Math.abs(best - px / LEGACY_REFERENCE_PX) ? step : best), READER_FONT_SCALES[0]);
      }
      delete migrated.fontSize;
      // The frozen 18px default follows the new 1x default (post-conversion catch).
      if (parsed.fontSize === 18) migrated.fontScale = DEFAULT_READING_PREFERENCES.fontScale;
    }
    if (parsed.version < 3) {
      if (migrated.lineHeight === 2.05) migrated.lineHeight = DEFAULT_READING_PREFERENCES.lineHeight;
      if (migrated.paragraphSpacing === 1) migrated.paragraphSpacing = DEFAULT_READING_PREFERENCES.paragraphSpacing;
      // The retired weight toggle migrates silently to the pinned 400.
      migrated.fontWeight = DEFAULT_READING_PREFERENCES.fontWeight;
    }
    const settings = normalizeReadingPreferences(migrated);
    // Version 1 only knew three fields. Upgrade in memory without a warning or
    // a mount-time write; the next explicit change persists the full schema.
    const requiredKeys = parsed.version === 1 ? ["fontScale", "lineHeight", "theme"] : Object.keys(settings);
    const valid = requiredKeys.every((key) => settings[key] === migrated[key])
      && Object.keys(settings).every((key) => !(key in migrated) || settings[key] === migrated[key]);
    return { settings, storageWarning: valid ? null : INVALID_MESSAGE };
  } catch (error) {
    return {
      settings: DEFAULT_READING_PREFERENCES,
      storageWarning: error instanceof SyntaxError ? INVALID_MESSAGE : UNAVAILABLE_MESSAGE,
    };
  }
}

/**
 * An independent local preference store; it never reads or writes story data.
 * Suitable for useSyncExternalStore(store.subscribe, store.getSnapshot).
 * update(patch, { inputMethod }) applies immediately, even when storage is denied.
 */
export function createReadingPreferencesStore({ storage = browserStorage() } = {}) {
  let state = Object.freeze({ ...loadPreferences(storage), inputMethod: "pointer" });
  const listeners = new Set();
  const update = (patch, { inputMethod = "pointer" } = {}) => {
    const values = typeof patch === "function" ? patch(state.settings) : patch;
    const settings = normalizeReadingPreferences({ ...state.settings, ...(isRecord(values) ? values : {}) });
    const method = inputMethod === "keyboard" ? "keyboard" : "pointer";
    const unchanged = Object.keys(settings).every((key) => settings[key] === state.settings[key]);
    if (unchanged && !state.storageWarning && method === state.inputMethod) return true;
    let storageWarning = null;
    try {
      if (!storage?.setItem) throw new Error("Storage unavailable");
      storage.setItem(READING_PREFERENCES_KEY, JSON.stringify({ version: 4, ...settings }));
    } catch {
      storageWarning = UNAVAILABLE_MESSAGE;
    }
    state = Object.freeze({ settings, storageWarning, inputMethod: method });
    listeners.forEach((listener) => listener());
    return !storageWarning;
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update,
    reset: (options) => update(DEFAULT_READING_PREFERENCES, options),
  };
}

/** Spread on the whole .page-reader, not just its article. */
export function getReaderAppearance(value, { inputMethod = "pointer" } = {}) {
  const settings = normalizeReadingPreferences(value);
  return {
    "data-reader-theme": settings.theme,
    "data-reader-mode": settings.readingMode,
    "data-reader-motion": inputMethod === "keyboard" ? "off" : "on",
    style: {
      /* Fluid base (DESIGN §32): a clamp() over vw, multiplied by the
         reader's scale step. calc()/clamp() nesting keeps every
         downstream consumer of --reader-font-size working unchanged. */
      "--reader-font-size": settings.fontScale === 1 ? READER_FLUID_BASE : `calc(${READER_FLUID_BASE} * ${settings.fontScale})`,
      "--reader-line-height": settings.lineHeight,
      "--reader-font-family": READER_FONT_FAMILIES[settings.fontFamily],
      "--reader-font-weight": settings.fontWeight,
      "--reader-margin": { narrow: "1rem", standard: "1.375rem", wide: "2rem" }[settings.margin],
      "--reader-measure": { narrow: "44em", standard: "38em", wide: "32em" }[settings.margin],
      "--reader-paragraph-spacing": `${settings.paragraphSpacing}em`,
      "--reader-text-indent": settings.paragraphIndent ? "2em" : "0",
      "--reader-text-align": settings.textAlign,
      "--reader-letter-spacing": `${settings.letterSpacing}em`,
    },
  };
}
