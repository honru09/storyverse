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

export function resolveShellTheme(value) {
  return SHELL_THEMES.includes(value) ? value : DEFAULT_SHELL_THEME
}

export function readShellTheme(storage) {
  try {
    // The storage object itself is resolved INSIDE the try: under a
    // denied-storage browser (private mode, blocked site data) even
    // touching window.localStorage throws, and a default parameter would
    // evaluate that access before the try could catch it.
    const store = storage ?? globalThis.localStorage
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
  } catch { /* storage blocked: the in-memory attribute still applies */ }
  return resolved
}
