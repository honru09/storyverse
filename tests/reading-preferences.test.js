import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_READING_PREFERENCES, READING_PREFERENCES_KEY, READER_FONT_SCALES,
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
  for (const fontScale of READER_FONT_SCALES) {
    for (const lineHeight of READER_LINE_HEIGHTS) {
      for (const theme of READER_THEMES) {
        assert.equal(store.update({ fontScale, lineHeight, theme }), true);
        assert.deepEqual(createReadingPreferencesStore({ storage }).getSnapshot().settings,
          { ...DEFAULT_READING_PREFERENCES, fontScale, lineHeight, theme });
      }
    }
  }
});

test("invalid values cannot inject CSS or escape supported size and spacing ranges", () => {
  /* Finite numeric scales clamp to the nearest ladder bound (READER-FIX3);
     non-steps and non-numbers fall back to the default. */
  const sizeCases = new Map([[0, 0.875], [0.9, 1], [1.3, 1], [2, 1.5], [-1, 0.875],
    [Infinity, 1], [NaN, 1], ["1.25", 1], [null, 1], [1.5, 1.5], [1.125, 1.125]]);
  for (const [fontScale, expected] of sizeCases) {
    assert.equal(normalizeReadingPreferences({ fontScale }).fontScale, expected, `fontScale ${String(fontScale)}`);
  }
  for (const lineHeight of [0, 1.5, 3, "1.8", null]) {
    assert.equal(normalizeReadingPreferences({ lineHeight }).lineHeight, 1.9);
  }
  for (const theme of ["sepia", "dark", "url(https://example.test)", null, {}]) {
    assert.equal(normalizeReadingPreferences({ theme }).theme, "light");
  }
  for (const invalid of [undefined, null, [], true, 18, "night"]) {
    assert.deepEqual(normalizeReadingPreferences(invalid), DEFAULT_READING_PREFERENCES);
  }
});

test("malformed or unknown-version stored settings safely recover without writing", () => {
  for (const raw of ["{broken", "null", "[]", "true", '"night"', '{"version":8,"theme":"night"}']) {
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
  assert.deepEqual(store.getSnapshot().settings, { ...DEFAULT_READING_PREFERENCES, lineHeight: 1.8, theme: "night" });
  assert.match(store.getSnapshot().storageWarning, /默认/);
  assert.equal(store.update({ fontScale: 1.25 }), true);
  assert.equal(store.getSnapshot().storageWarning, null);
});

test("denied reads and saves never prevent in-memory reading changes", () => {
  for (const storage of [null, {}, {
    getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceededError"); },
  }]) {
    const store = createReadingPreferencesStore({ storage });
    assert.match(store.getSnapshot().storageWarning, /无法保存/);
    assert.doesNotThrow(() => assert.equal(store.update({ theme: "night", fontScale: 1.375 }), false));
    assert.deepEqual(store.getSnapshot().settings, { ...DEFAULT_READING_PREFERENCES, fontScale: 1.375, theme: "night" });
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
  store.update({ fontScale: 1.25 });
  const snapshot = store.getSnapshot();
  store.update({ fontScale: 1.25 });
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
  store.update({ fontScale: 1.375, theme: "night" });
  store.update({ lineHeight: 1.8 });
  assert.deepEqual(store.getSnapshot().settings, { ...DEFAULT_READING_PREFERENCES, fontScale: 1.375, lineHeight: 1.8, theme: "night" });
  store.reset();
  assert.deepEqual(store.getSnapshot().settings, DEFAULT_READING_PREFERENCES);
  assert.equal(storage.values.get("storyweave:library"), "existing stories");
  assert.equal(storage.writes.every(([key]) => key === READING_PREFERENCES_KEY), true);
});

test("reader appearance uses scoped variables and records instant keyboard changes", () => {
  const store = createReadingPreferencesStore({ storage: memoryStorage() });
  store.update({ theme: "night", fontScale: 1.375, lineHeight: 1.8 }, { inputMethod: "keyboard" });
  const { settings, inputMethod } = store.getSnapshot();
  const appearance = getReaderAppearance(settings, { inputMethod });
  assert.equal(appearance["data-reader-theme"], "night");
  assert.equal(appearance["data-reader-motion"], "off");
  assert.equal(appearance["data-reader-mode"], "page");
  assert.equal(appearance.style["--reader-font-size"], "calc(clamp(0.9375rem, 2.56vw + 0.375rem, 1.1875rem) * 1.375)");
  assert.equal(appearance.style["--reader-line-height"], 1.8);
  assert.equal(getReaderAppearance({ theme: "invalid", fontScale: "100vw" })["data-reader-theme"], "light");
  assert.equal(getReaderAppearance(settings)["data-reader-motion"], "on");
});

test("version 1 preferences upgrade silently and retain all existing reader choices", () => {
  const raw = JSON.stringify({ version: 1, fontSize: 22, lineHeight: 1.8, theme: "night" });
  const storage = memoryStorage(raw);
  const store = createReadingPreferencesStore({ storage });
  assert.deepEqual(store.getSnapshot().settings, { ...DEFAULT_READING_PREFERENCES, fontScale: 1.375, lineHeight: 1.8, theme: "night" });
  assert.equal(store.getSnapshot().storageWarning, null);
  assert.equal(storage.values.get(READING_PREFERENCES_KEY), raw);
  assert.deepEqual(storage.writes, []);
  store.update({ fontFamily: "serif" });
  assert.equal(JSON.parse(storage.values.get(READING_PREFERENCES_KEY)).version, 7);
  assert.equal(createReadingPreferencesStore({ storage }).getSnapshot().storageWarning, null);
});

test("version 2 records frozen at the old defaults follow the new defaults silently", () => {
  /* A complete v2 record sitting exactly on the pre-FIX3 shipped defaults
     (18 / 2.05 / 1 / weight 600) was frozen by an unrelated settings change,
     not chosen field by field: it migrates to the current defaults with no
     warning and no mount-time write (READER-FIX3 §3). */
  const frozen = { version: 2, ...DEFAULT_READING_PREFERENCES, fontSize: 18, lineHeight: 2.05, paragraphSpacing: 1, fontWeight: 600, theme: "night" };
  const storage = memoryStorage(JSON.stringify(frozen));
  const store = createReadingPreferencesStore({ storage });
  assert.deepEqual(store.getSnapshot().settings, { ...DEFAULT_READING_PREFERENCES, theme: "night" });
  assert.equal(store.getSnapshot().storageWarning, null);
  assert.deepEqual(storage.writes, []);
});

test("version 2 deliberate non-default typography survives the FIX3 migration", () => {
  const chosen = { version: 2, ...DEFAULT_READING_PREFERENCES, fontSize: 20, lineHeight: 1.8, paragraphSpacing: 1.4 };
  const storage = memoryStorage(JSON.stringify(chosen));
  const store = createReadingPreferencesStore({ storage });
  assert.deepEqual(store.getSnapshot().settings,
    { ...DEFAULT_READING_PREFERENCES, fontScale: 1.25, lineHeight: 1.8, paragraphSpacing: 1.4 });
  assert.equal(store.getSnapshot().storageWarning, null);
});

test("all advanced typography and reader behavior options persist without touching story data", () => {
  const storage = memoryStorage();
  const store = createReadingPreferencesStore({ storage });
  const settings = { fontScale: 2, lineHeight: 2.3, theme: "system", fontFamily: "serif", fontWeight: 600,
    margin: "wide", paragraphSpacing: 1.4, paragraphIndent: false, textAlign: "justify", letterSpacing: 0.06,
    readingMode: "page", keepAwake: true };
  store.update(settings);
  /* READER-FIX3/§32 contract: the scale clamps to the 1.5 ladder top and
     prose weight is pinned to 400; every other option round-trips.
     REQ-47: the untouched turn style rides along at its curl default. */
  assert.deepEqual(createReadingPreferencesStore({ storage }).getSnapshot().settings,
    { ...settings, fontScale: 1.5, fontWeight: 400, turnStyle: "curl" });
  assert.equal(storage.writes.length, 1);
  const appearance = getReaderAppearance(settings);
  assert.equal(appearance["data-reader-theme"], "system");
  assert.equal(appearance["data-reader-mode"], "page");
  assert.deepEqual(appearance.style, {
    "--reader-font-size": "calc(clamp(0.9375rem, 2.56vw + 0.375rem, 1.1875rem) * 1.5)", "--reader-line-height": 2.3,
    "--reader-font-family": READER_FONT_FAMILIES.serif, "--reader-font-weight": 400,
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
  assert.equal(snapshot.settings.fontScale, 1.5);
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

test("READER-PAGE (REQ-38): paged turning is the default reading mode", () => {
  assert.equal(DEFAULT_READING_PREFERENCES.readingMode, "page");
  const store = createReadingPreferencesStore({ storage: memoryStorage() });
  assert.equal(store.getSnapshot().settings.readingMode, "page");
  assert.equal(getReaderAppearance(store.getSnapshot().settings)["data-reader-mode"], "page");
});

test("READER-PAGE (REQ-38): a pre-v5 stored 'scroll' is the frozen old default and follows the new default", () => {
  for (const version of [2, 3, 4]) {
    const raw = JSON.stringify({ version, ...DEFAULT_READING_PREFERENCES, readingMode: "scroll" });
    const snapshot = createReadingPreferencesStore({ storage: memoryStorage(raw) }).getSnapshot();
    assert.equal(snapshot.settings.readingMode, "page", `version ${version}`);
    assert.equal(snapshot.storageWarning, null, `version ${version}`);
  }
});

test("READER-PAGE (REQ-38): a pre-v5 stored 'page' stays paged, and writes land as version 7 with the explicit marker", () => {
  const storage = memoryStorage(JSON.stringify({ version: 4, ...DEFAULT_READING_PREFERENCES, readingMode: "page" }));
  const store = createReadingPreferencesStore({ storage });
  assert.equal(store.getSnapshot().settings.readingMode, "page");
  assert.equal(store.update({ readingMode: "scroll" }), true);
  const written = JSON.parse(storage.values.get(READING_PREFERENCES_KEY));
  assert.equal(written.version, 7);
  assert.equal(written.readingMode, "scroll");
  assert.equal(written.readingModeExplicit, true);
});

test("DEVICE-FIX4 (REQ-45): an unmarked version-5 'scroll' is not proof of a deliberate choice and follows the paged default", () => {
  const raw = JSON.stringify({ version: 5, ...DEFAULT_READING_PREFERENCES, readingMode: "scroll" });
  const snapshot = createReadingPreferencesStore({ storage: memoryStorage(raw) }).getSnapshot();
  assert.equal(snapshot.settings.readingMode, "page");
  assert.equal(snapshot.readingModeExplicit, false);
  assert.equal(snapshot.storageWarning, null);
});

test("DEVICE-FIX4 (REQ-45): a marked 'scroll' is a deliberate choice and is never migrated", () => {
  for (const version of [5, 6, 7]) {
    const raw = JSON.stringify({ version, ...DEFAULT_READING_PREFERENCES, readingMode: "scroll", readingModeExplicit: true });
    const snapshot = createReadingPreferencesStore({ storage: memoryStorage(raw) }).getSnapshot();
    assert.equal(snapshot.settings.readingMode, "scroll", `version ${version}`);
    assert.equal(snapshot.readingModeExplicit, true, `version ${version}`);
    assert.equal(snapshot.storageWarning, null, `version ${version}`);
  }
});

test("DEVICE-FIX4 (REQ-45): choosing 'scroll' in the UI sticks across store instances and unrelated changes keep the marker", () => {
  const storage = memoryStorage();
  const store = createReadingPreferencesStore({ storage });
  assert.equal(store.getSnapshot().readingModeExplicit, false);
  assert.equal(store.update({ readingMode: "scroll" }), true);
  assert.equal(store.getSnapshot().readingModeExplicit, true);
  // An unrelated change must not clear the marker on disk.
  assert.equal(store.update({ theme: "night" }), true);
  const written = JSON.parse(storage.values.get(READING_PREFERENCES_KEY));
  assert.equal(written.version, 7);
  assert.equal(written.readingMode, "scroll");
  assert.equal(written.readingModeExplicit, true);
  const reloaded = createReadingPreferencesStore({ storage }).getSnapshot();
  assert.equal(reloaded.settings.readingMode, "scroll");
  assert.equal(reloaded.settings.theme, "night");
});

test("DEVICE-FIX4 (REQ-45): the reading-mode group leads the preferences sheet, above font size", async () => {
  const { readFileSync } = await import("node:fs");
  const jsx = readFileSync(new URL("../src/components/ReadingPreferences.jsx", import.meta.url), "utf8");
  const modeAt = jsx.indexOf('"readingMode"');
  const sizeAt = jsx.indexOf("<legend>文字大小</legend>");
  assert.ok(modeAt > -1 && sizeAt > -1, "both groups exist");
  assert.ok(modeAt < sizeAt, "reading mode is the first setting group in the sheet");
  // Exactly one reading-mode group: the move must not duplicate it.
  assert.equal(jsx.split('"readingMode"').length - 1, 1);
});

test("READER-FIX3 (REQ-47): version 6 records gain the curl default silently; a chosen slide style persists as version 7", () => {
  const storage = memoryStorage(JSON.stringify({ version: 6, ...DEFAULT_READING_PREFERENCES }));
  const store = createReadingPreferencesStore({ storage });
  assert.equal(store.getSnapshot().settings.turnStyle, "curl");
  assert.equal(store.getSnapshot().storageWarning, null);
  assert.equal(store.update({ turnStyle: "slide" }), true);
  const written = JSON.parse(storage.values.get(READING_PREFERENCES_KEY));
  assert.equal(written.version, 7);
  assert.equal(written.turnStyle, "slide");
  assert.equal(createReadingPreferencesStore({ storage }).getSnapshot().settings.turnStyle, "slide");
});

test("READER-FIX3 (REQ-47): an unknown turn style falls back to curl and reports the fallback", () => {
  const raw = JSON.stringify({ version: 7, ...DEFAULT_READING_PREFERENCES, turnStyle: "spin" });
  const snapshot = createReadingPreferencesStore({ storage: memoryStorage(raw) }).getSnapshot();
  assert.equal(snapshot.settings.turnStyle, "curl");
  assert.match(snapshot.storageWarning, /默认/);
});

test("READER-FIX3 (REQ-47): the turn-style group sits with the reading-mode group, gated to paged mode", async () => {
  const { readFileSync } = await import("node:fs");
  const jsx = readFileSync(new URL("../src/components/ReadingPreferences.jsx", import.meta.url), "utf8");
  const modeAt = jsx.indexOf('"readingMode"');
  const turnAt = jsx.indexOf('"turnStyle"');
  const sizeAt = jsx.indexOf("<legend>文字大小</legend>");
  assert.ok(modeAt > -1 && turnAt > modeAt && turnAt < sizeAt, "turn style follows the mode group, before font size");
  assert.match(jsx, /settings\.readingMode === "page" && options\("turnStyle"/);
});
