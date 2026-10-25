import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_READING_PREFERENCES, READING_PREFERENCES_KEY, READER_FONT_SIZES,
  READER_LINE_HEIGHTS, READER_THEMES, READER_FONT_FAMILIES,
  createReadingPreferencesStore, getReaderAppearance, normalizeReadingPreferences,
} from "../src/reading-preferences.js";

function memoryStorage(raw = null) {
  const values = new Map(raw === null ? [] : [[READING_PREFERENCES_KEY, raw]]);
  const writes = [];
  return { values, writes, getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); writes.push([key, value]); } };
}

test("new readers get comfortable defaults without writing storage on mount", () => {
  const storage = memoryStorage();
  const store = createReadingPreferencesStore({ storage });
  const snapshot = store.getSnapshot();
  assert.deepEqual(snapshot.settings, DEFAULT_READING_PREFERENCES);
  assert.equal(snapshot.storageWarning, null);
  assert.equal(store.getSnapshot(), snapshot);
  assert.deepEqual(storage.writes, []);
  assert.equal(Object.isFrozen(snapshot.settings), true);
});

test("supported font sizes, spacing and themes survive a new store instance", () => {
  const storage = memoryStorage();
  const store = createReadingPreferencesStore({ storage });
  for (const fontSize of READER_FONT_SIZES) {
    for (const lineHeight of READER_LINE_HEIGHTS) {
      for (const theme of READER_THEMES) {
        assert.equal(store.update({ fontSize, lineHeight, theme }), true);
        assert.deepEqual(createReadingPreferencesStore({ storage }).getSnapshot().settings,
          { ...DEFAULT_READING_PREFERENCES, fontSize, lineHeight, theme });
      }
    }
  }
});

test("invalid values cannot inject CSS or escape supported size and spacing ranges", () => {
  for (const fontSize of [0, 15, 17, 34, -10, Infinity, NaN, "22", null]) {
    assert.equal(normalizeReadingPreferences({ fontSize }).fontSize, 18);
  }
  for (const lineHeight of [0, 1.5, 3, "1.8", null]) {
    assert.equal(normalizeReadingPreferences({ lineHeight }).lineHeight, 2.05);
  }
  for (const theme of ["sepia", "dark", "url(https://example.test)", null, {}]) {
    assert.equal(normalizeReadingPreferences({ theme }).theme, "light");
  }
  for (const invalid of [undefined, null, [], true, 18, "night"]) {
    assert.deepEqual(normalizeReadingPreferences(invalid), DEFAULT_READING_PREFERENCES);
  }
});

test("malformed or unknown-version stored settings safely recover without writing", () => {
  for (const raw of ["{broken", "null", "[]", "true", '"night"', '{"version":3,"theme":"night"}']) {
    const storage = memoryStorage(raw);
    const store = createReadingPreferencesStore({ storage });
    assert.deepEqual(store.getSnapshot().settings, DEFAULT_READING_PREFERENCES);
    assert.match(store.getSnapshot().storageWarning, /默认/);
    assert.equal(storage.values.get(READING_PREFERENCES_KEY), raw);
    assert.deepEqual(storage.writes, []);
  }
});

test("partially invalid storage preserves valid fields and reports the fallback", () => {
  const storage = memoryStorage(JSON.stringify({ version: 1, fontSize: "22", lineHeight: 1.8, theme: "night" }));
  const store = createReadingPreferencesStore({ storage });
  assert.deepEqual(store.getSnapshot().settings, { ...DEFAULT_READING_PREFERENCES, fontSize: 18, lineHeight: 1.8, theme: "night" });
  assert.match(store.getSnapshot().storageWarning, /默认/);
  assert.equal(store.update({ fontSize: 20 }), true);
  assert.equal(store.getSnapshot().storageWarning, null);
});

test("denied reads and saves never prevent in-memory reading changes", () => {
  for (const storage of [null, {}, {
    getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceededError"); },
  }]) {
    const store = createReadingPreferencesStore({ storage });
    assert.match(store.getSnapshot().storageWarning, /无法保存/);
    assert.doesNotThrow(() => assert.equal(store.update({ theme: "night", fontSize: 22 }), false));
    assert.deepEqual(store.getSnapshot().settings, { ...DEFAULT_READING_PREFERENCES, fontSize: 22, theme: "night" });
  }
});

test("a failed save retains the prior saved settings and can recover on the next update", () => {
  const storage = memoryStorage(JSON.stringify({ version: 2, ...DEFAULT_READING_PREFERENCES }));
  const saved = storage.values.get(READING_PREFERENCES_KEY);
  const save = storage.setItem;
  storage.setItem = () => { throw new Error("quota"); };
  const store = createReadingPreferencesStore({ storage });
  assert.equal(store.update({ theme: "warm" }), false);
  assert.equal(store.getSnapshot().settings.theme, "warm");
  assert.equal(storage.values.get(READING_PREFERENCES_KEY), saved);
  storage.setItem = save;
  assert.equal(store.update({ theme: "warm" }), true);
  assert.equal(store.getSnapshot().storageWarning, null);
  assert.equal(JSON.parse(storage.values.get(READING_PREFERENCES_KEY)).theme, "warm");
});

test("updates notify subscribers once, preserve snapshot identity on no-op, and unsubscribe", () => {
  const store = createReadingPreferencesStore({ storage: memoryStorage() });
  let changes = 0;
  const stop = store.subscribe(() => { changes += 1; });
  store.update({ fontSize: 20 });
  const snapshot = store.getSnapshot();
  store.update({ fontSize: 20 });
  assert.equal(store.getSnapshot(), snapshot);
  assert.equal(changes, 1);
  stop();
  store.update({ theme: "warm" });
  assert.equal(changes, 1);
});

test("updates are partial and reset only touches the independent preferences key", () => {
  const storage = memoryStorage();
  storage.values.set("storyweave:library", "existing stories");
  const store = createReadingPreferencesStore({ storage });
  store.update({ fontSize: 22, theme: "night" });
  store.update({ lineHeight: 1.8 });
  assert.deepEqual(store.getSnapshot().settings, { ...DEFAULT_READING_PREFERENCES, fontSize: 22, lineHeight: 1.8, theme: "night" });
  store.reset();
  assert.deepEqual(store.getSnapshot().settings, DEFAULT_READING_PREFERENCES);
  assert.equal(storage.values.get("storyweave:library"), "existing stories");
  assert.equal(storage.writes.every(([key]) => key === READING_PREFERENCES_KEY), true);
});

test("reader appearance uses scoped variables and records instant keyboard changes", () => {
  const store = createReadingPreferencesStore({ storage: memoryStorage() });
  store.update({ theme: "night", fontSize: 22, lineHeight: 1.8 }, { inputMethod: "keyboard" });
  const { settings, inputMethod } = store.getSnapshot();
  const appearance = getReaderAppearance(settings, { inputMethod });
  assert.equal(appearance["data-reader-theme"], "night");
  assert.equal(appearance["data-reader-motion"], "off");
  assert.equal(appearance["data-reader-mode"], "scroll");
  assert.equal(appearance.style["--reader-font-size"], "1.375rem");
  assert.equal(appearance.style["--reader-line-height"], 1.8);
  assert.equal(getReaderAppearance({ theme: "invalid", fontSize: "100vw" })["data-reader-theme"], "light");
  assert.equal(getReaderAppearance(settings)["data-reader-motion"], "on");
});

test("version 1 preferences upgrade silently and retain all existing reader choices", () => {
  const raw = JSON.stringify({ version: 1, fontSize: 22, lineHeight: 1.8, theme: "night" });
  const storage = memoryStorage(raw);
  const store = createReadingPreferencesStore({ storage });
  assert.deepEqual(store.getSnapshot().settings, { ...DEFAULT_READING_PREFERENCES, fontSize: 22, lineHeight: 1.8, theme: "night" });
  assert.equal(store.getSnapshot().storageWarning, null);
  assert.equal(storage.values.get(READING_PREFERENCES_KEY), raw);
  assert.deepEqual(storage.writes, []);
  store.update({ fontFamily: "serif" });
  assert.equal(JSON.parse(storage.values.get(READING_PREFERENCES_KEY)).version, 2);
  assert.equal(createReadingPreferencesStore({ storage }).getSnapshot().storageWarning, null);
});

test("all advanced typography and reader behavior options persist without touching story data", () => {
  const storage = memoryStorage();
  const store = createReadingPreferencesStore({ storage });
  const settings = { fontSize: 32, lineHeight: 2.3, theme: "system", fontFamily: "serif", fontWeight: 600,
    margin: "wide", paragraphSpacing: 1.4, paragraphIndent: false, textAlign: "justify", letterSpacing: 0.06,
    readingMode: "page", keepAwake: true };
  store.update(settings);
  assert.deepEqual(createReadingPreferencesStore({ storage }).getSnapshot().settings, settings);
  assert.equal(storage.writes.length, 1);
  const appearance = getReaderAppearance(settings);
  assert.equal(appearance["data-reader-theme"], "system");
  assert.equal(appearance["data-reader-mode"], "page");
  assert.deepEqual(appearance.style, {
    "--reader-font-size": "2rem", "--reader-line-height": 2.3,
    "--reader-font-family": READER_FONT_FAMILIES.serif, "--reader-font-weight": 600,
    "--reader-margin": "2rem", "--reader-measure": "32em", "--reader-paragraph-spacing": "1.4em", "--reader-text-indent": "0",
    "--reader-text-align": "justify", "--reader-letter-spacing": "0.06em",
  });
});

test("page margins pair mobile padding with a distinct desktop reading measure", () => {
  const mappings = { narrow: ["1rem", "44em"], standard: ["1.375rem", "38em"], wide: ["2rem", "32em"] };
  for (const [margin, [padding, measure]] of Object.entries(mappings)) {
    const appearance = getReaderAppearance({ margin });
    assert.equal(appearance.style["--reader-margin"], padding);
    assert.equal(appearance.style["--reader-measure"], measure);
  }
  assert.equal(getReaderAppearance({ margin: "100vw" }).style["--reader-measure"], "38em");
});

test("advanced normalization rejects untyped values, arbitrary CSS and unsupported modes", () => {
  const inputs = { fontFamily: 'url("https://example.test/font.woff2")', fontWeight: "600", margin: "100vw",
    paragraphSpacing: 9999, paragraphIndent: "true", textAlign: "center;display:none", letterSpacing: "0.06",
    readingMode: "horizontal-unsafe", keepAwake: 1 };
  assert.deepEqual(normalizeReadingPreferences(inputs), DEFAULT_READING_PREFERENCES);
  const appearance = getReaderAppearance(inputs);
  assert.equal(JSON.stringify(appearance).includes("example.test"), false);
  assert.equal(JSON.stringify(appearance).includes("display:none"), false);
  assert.equal(appearance.style["--reader-font-family"], READER_FONT_FAMILIES.system);
});

test("version 2 corruption recovers only invalid fields and missing fields report recovery", () => {
  const storage = memoryStorage(JSON.stringify({ version: 2, ...DEFAULT_READING_PREFERENCES, fontFamily: "serif", keepAwake: "true", fontSize: 32 }));
  const snapshot = createReadingPreferencesStore({ storage }).getSnapshot();
  assert.equal(snapshot.settings.fontFamily, "serif");
  assert.equal(snapshot.settings.fontSize, 32);
  assert.equal(snapshot.settings.keepAwake, false);
  assert.match(snapshot.storageWarning, /默认/);
  const incomplete = createReadingPreferencesStore({ storage: memoryStorage('{"version":2,"theme":"oled"}') }).getSnapshot();
  assert.equal(incomplete.settings.theme, "oled");
  assert.match(incomplete.storageWarning, /默认/);
});

test("normalization returns a frozen closed schema without unknown or prototype fields", () => {
  const source = JSON.parse('{"__proto__":{"keepAwake":true},"theme":"green","admin":true}');
  const result = normalizeReadingPreferences(source);
  assert.equal(result.theme, "green");
  assert.equal(result.keepAwake, false);
  assert.equal(Object.hasOwn(result, "admin"), false);
  assert.equal(Object.hasOwn(result, "__proto__"), false);
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(Object.keys(result), Object.keys(DEFAULT_READING_PREFERENCES));
  assert.deepEqual(normalizeReadingPreferences(Object.create({ keepAwake: true, theme: "night" })), DEFAULT_READING_PREFERENCES);
});
