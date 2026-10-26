// Single entry point for the Firebase web SDK — import the scoped packages
// (@firebase/app, @firebase/auth) directly, never the 'firebase/app' /
// 'firebase/auth' wrapper packages.
//
// Why: the wrappers are pure re-exports (`export * from '@firebase/app'`),
// and under this project's bundler (rolldown-vite) loading the app through
// the wrapper produces a SECOND module instance of @firebase/app with its
// own @firebase/component registry. registerAuth("Browser") then lands in
// one registry while getAuth() reads from the other, and every sign-in
// fails with "Component auth has not been registered yet" even though the
// code, the bundle, and the Firebase project are all fine. Verified with a
// minimal repro (2026-10-26): wrapper imports throw, scoped imports work.
// Keep both packages in this one module so they always share one graph.
export * from '@firebase/app'
export * from '@firebase/auth'
