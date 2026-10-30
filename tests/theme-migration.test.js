import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  SHELL_THEME_KEY,
  SHELL_THEME_EXPLICIT_KEY,
  SHELL_THEME_MIGRATION_KEY,
  SHELL_THEME_MIGRATION_ID,
  migrateShellThemeResidue,
  readShellTheme,
  storeShellTheme,
} from '../src/theme.js'

// DEVICE-FIX2 (REQ-29): the default-theme migration. Judgment, pinned:
// the pre-picker shell had exactly one look (aurora) and no build ever
// recorded intent, so a stored 'aurora' WITHOUT the explicit marker is
// residue and migrates to the default once; a settings pick stamps the
// explicit marker and is never migrated; white can only be a pick, so
// it is never residue.

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: (key) => { map.delete(key) },
    map,
  }
}

test('REQ-29: residual aurora (no explicit marker) migrates to the black default, once', () => {
  const store = fakeStorage({ [SHELL_THEME_KEY]: 'aurora' })
  assert.equal(readShellTheme(store), 'black')
  assert.equal(store.map.get(SHELL_THEME_KEY), 'black', 'the stored value itself is rewritten')
  assert.equal(store.map.get(SHELL_THEME_MIGRATION_KEY), SHELL_THEME_MIGRATION_ID, 'migration marker is spent')
  // Once spent, the migration never fires again — even if an aurora
  // value reappears without a marker, the device keeps it.
  store.setItem(SHELL_THEME_KEY, 'aurora')
  assert.equal(readShellTheme(store), 'aurora')
})

test('REQ-29: an explicit aurora pick is preserved untouched', () => {
  const store = fakeStorage({ [SHELL_THEME_KEY]: 'aurora', [SHELL_THEME_EXPLICIT_KEY]: '1' })
  assert.equal(migrateShellThemeResidue(store), false)
  assert.equal(readShellTheme(store), 'aurora')
  assert.equal(store.map.get(SHELL_THEME_KEY), 'aurora')
})

test('REQ-29: picking aurora in settings stamps intent; later loads keep it', () => {
  const store = fakeStorage({ [SHELL_THEME_KEY]: 'aurora' }) // residue state
  assert.equal(readShellTheme(store), 'black', 'residue migrates on first load')
  storeShellTheme('aurora', store) // the owner re-picks aurora in settings
  assert.equal(store.map.get(SHELL_THEME_EXPLICIT_KEY), '1')
  assert.equal(readShellTheme(store), 'aurora', 'the deliberate pick survives reloads')
})

test('REQ-29: white and black stored values are never treated as residue', () => {
  for (const value of ['white', 'black']) {
    const store = fakeStorage({ [SHELL_THEME_KEY]: value })
    assert.equal(migrateShellThemeResidue(store), false)
    assert.equal(readShellTheme(store), value)
  }
})

test('REQ-29: a fresh device (nothing stored) resolves the default and spends the marker', () => {
  const store = fakeStorage()
  assert.equal(readShellTheme(store), 'black')
  assert.equal(store.map.get(SHELL_THEME_MIGRATION_KEY), SHELL_THEME_MIGRATION_ID)
})

test('REQ-29: the pre-paint script mirrors the runtime migration (same keys, same id)', () => {
  const init = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8')
  assert.ok(init.includes(`'${SHELL_THEME_KEY}'`), 'init reads the theme key')
  assert.ok(init.includes(`'${SHELL_THEME_EXPLICIT_KEY}'`), 'init honours the explicit marker')
  assert.ok(init.includes(`'${SHELL_THEME_MIGRATION_KEY}'`), 'init spends the same migration marker')
  assert.ok(init.includes(SHELL_THEME_MIGRATION_ID), 'init carries the same migration id')
})
