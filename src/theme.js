// Shell themes (MIGRATION batch, DESIGN §27). The shell — plaza, forge,
// store, home, profile, dialogs — wears one of three colour palettes over
// ONE layout system: 'black' (the new default near-black), 'white' (the
// new light palette) and 'aurora' (the original deep-navy glass palette,
// preserved value-for-value as its own token set — never overwritten).
//
// This is a SHELL theme only. The reader keeps its own warm-paper reading
// themes (reading-preferences) and is never touched by this switch.
//
// The choice is a device preference: localStorage `storyweave:shell-theme`.
// index.html loads public/theme-init.js before first paint — an
// external classic script, because the server CSP (script-src 'self')
// blocks inline scripts — which applies the same resolution, so the
// shell never flashes the wrong palette; this module is the runtime
// half of that contract.

export const SHELL_THEME_KEY = 'storyweave:shell-theme'
export const SHELL_THEMES = ['black', 'white', 'aurora']
export const DEFAULT_SHELL_THEME = 'black'
// DEVICE-FIX2 (REQ-29): intent + one-time-migration markers. The theme
// system (§27) never recorded WHY a value sits in storage: 'aurora'
// was the shell's only look before the picker existed, and any value
// an early build or an idle tap left behind reads exactly like a
// deliberate choice. From this build on, storeShellTheme (the
// settings pick — the only write path) also stamps the explicit
// marker, so a stored 'aurora' WITHOUT the marker can only be
// residue, never a recorded choice.
export const SHELL_THEME_EXPLICIT_KEY = 'storyweave:shell-theme-explicit'
export const SHELL_THEME_MIGRATION_KEY = 'storyweave:shell-theme-migration'
export const SHELL_THEME_MIGRATION_ID = 'device-fix2-aurora-residue-v1'

export function resolveShellTheme(value) {
  return SHELL_THEMES.includes(value) ? value : DEFAULT_SHELL_THEME
}

/**
 * The one-time REQ-29 migration: a stored 'aurora' with no explicit
 * marker is historical residue (the pre-picker default look), not a
 * choice — return it to the current default. Only 'aurora' can be
 * residue: black is the default anyway and white never existed
 * before the picker, so a stored white can only be a pick. Runs at
 * most once per device (its own marker), and once the owner picks a
 * theme in settings the explicit marker makes every later value
 * untouchable. Returns true when a value was migrated.
 */
export function migrateShellThemeResidue(store) {
  try {
    if (!store || store.getItem(SHELL_THEME_MIGRATION_KEY)) return false
    const stored = store.getItem(SHELL_THEME_KEY)
    const explicit = store.getItem(SHELL_THEME_EXPLICIT_KEY)
    let migrated = false
    if (stored === 'aurora' && !explicit) {
      store.setItem(SHELL_THEME_KEY, DEFAULT_SHELL_THEME)
      migrated = true
    }
    store.setItem(SHELL_THEME_MIGRATION_KEY, SHELL_THEME_MIGRATION_ID)
    return migrated
  } catch {
    return false
  }
}

export function readShellTheme(storage) {
  try {
    // The storage object itself is resolved INSIDE the try: under a
    // denied-storage browser (private mode, blocked site data) even
    // touching window.localStorage throws, and a default parameter would
    // evaluate that access before the try could catch it.
    const store = storage ?? globalThis.localStorage
    if (store) migrateShellThemeResidue(store)
    return resolveShellTheme(store?.getItem(SHELL_THEME_KEY))
  } catch {
    return DEFAULT_SHELL_THEME
  }
}

export function applyShellTheme(theme, root = globalThis.document?.documentElement) {
  const resolved = resolveShellTheme(theme)
  if (root) root.dataset.shellTheme = resolved
  return resolved
}

export function storeShellTheme(theme, storage) {
  const resolved = resolveShellTheme(theme)
  try {
    const store = storage ?? globalThis.localStorage
    store?.setItem(SHELL_THEME_KEY, resolved)
    // A pick through this path is a deliberate choice (REQ-29): stamp
    // it so the one-time residue migration can never touch it.
    store?.setItem(SHELL_THEME_EXPLICIT_KEY, '1')
  } catch { /* storage blocked: the in-memory attribute still applies */ }
  return resolved
}
