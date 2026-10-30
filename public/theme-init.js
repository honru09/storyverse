// Shell theme pre-paint (DESIGN §27): resolve the device palette before
// first paint so the shell never flashes the wrong theme. This is an
// external file on purpose — the server's CSP is script-src 'self', which
// blocks inline scripts; an external classic script is the compliant way
// to run before the bundle. Mirrors src/theme.js: keep the storage key,
// the value list and the 'black' fallback in sync.
(function () {
  try {
    var store = window.localStorage;
    // DEVICE-FIX2 (REQ-29) one-time residue migration, mirrored from
    // src/theme.js (migrateShellThemeResidue): a stored 'aurora' with
    // no explicit-pick marker predates the theme picker — it is the
    // old default look left behind, not a choice — so it returns to
    // the current default exactly once. A value the owner picked in
    // settings carries the explicit marker and is never touched.
    if (!store.getItem('storyweave:shell-theme-migration')) {
      var stored = store.getItem('storyweave:shell-theme');
      if (stored === 'aurora' && !store.getItem('storyweave:shell-theme-explicit')) {
        store.setItem('storyweave:shell-theme', 'black');
      }
      store.setItem('storyweave:shell-theme-migration', 'device-fix2-aurora-residue-v1');
    }
    var value = store.getItem('storyweave:shell-theme');
    if (value !== 'black' && value !== 'white' && value !== 'aurora') value = 'black';
    document.documentElement.dataset.shellTheme = value;
  } catch (error) { /* storage blocked: the attribute default stands */ }
})();
