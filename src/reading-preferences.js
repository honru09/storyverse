export const READING_PREFERENCES_KEY = "storyweave:reading-preferences:v1";
export const READER_FONT_SIZES = Object.freeze([14, 16, 18, 20, 22, 24, 26, 28, 30, 32]);
export const READER_LINE_HEIGHTS = Object.freeze([1.6, 1.8, 2.05, 2.3]);
export const READER_THEMES = Object.freeze(["light", "warm", "green", "night", "oled", "system"]);
export const READER_FONT_FAMILIES = Object.freeze({
  system: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: '"Songti SC", "Noto Serif CJK SC", "Noto Serif SC", "Source Han Serif SC", SimSun, serif',
});
export const DEFAULT_READING_PREFERENCES = Object.freeze({
  fontSize: 18,
  lineHeight: 2.05,
  theme: "light",
  fontFamily: "system",
  fontWeight: 400,
  margin: "standard",
  paragraphSpacing: 1,
  paragraphIndent: true,
  textAlign: "left",
  letterSpacing: 0,
  readingMode: "scroll",
  keepAwake: false,
});

const OPTIONS = Object.freeze({
  fontSize: READER_FONT_SIZES,
  lineHeight: READER_LINE_HEIGHTS,
  theme: READER_THEMES,
  fontFamily: Object.keys(READER_FONT_FAMILIES),
  fontWeight: [400, 600],
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
  const source = isRecord(value) ? value : {};
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
    if (!isRecord(parsed) || ![1, 2].includes(parsed.version)) {
      return { settings: DEFAULT_READING_PREFERENCES, storageWarning: INVALID_MESSAGE };
    }
    const settings = normalizeReadingPreferences(parsed);
    // Version 1 only knew three fields. Upgrade in memory without a warning or
    // a mount-time write; the next explicit change persists the full schema.
    const requiredKeys = parsed.version === 1 ? ["fontSize", "lineHeight", "theme"] : Object.keys(settings);
    const valid = requiredKeys.every((key) => settings[key] === parsed[key])
      && Object.keys(settings).every((key) => !(key in parsed) || settings[key] === parsed[key]);
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
      storage.setItem(READING_PREFERENCES_KEY, JSON.stringify({ version: 2, ...settings }));
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
      // rem preserves browser text scaling; the displayed size assumes a 16px root.
      "--reader-font-size": `${settings.fontSize / 16}rem`,
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
