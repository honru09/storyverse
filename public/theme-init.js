// Shell theme pre-paint (DESIGN §27): resolve the device palette before
// first paint so the shell never flashes the wrong theme. This is an
// external file on purpose — the server's CSP is script-src 'self', which
// blocks inline scripts; an external classic script is the compliant way
// to run before the bundle. Mirrors src/theme.js: keep the storage key,
// the value list and the 'black' fallback in sync.
(function () {
  try {
    var value = window.localStorage.getItem('storyweave:shell-theme');
    if (value !== 'black' && value !== 'white' && value !== 'aurora') value = 'black';
    document.documentElement.dataset.shellTheme = value;
  } catch (error) { /* storage blocked: the attribute default stands */ }
})();
