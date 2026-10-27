const pages = new Set(['home', 'forge', 'store', 'merge', 'avatar', 'plaza', 'plaza-publish'])

export function parseRoute(hash = '') {
  const [path, value] = hash.replace(/^#\/?/, '').split('/')
  if (path === 'reader' || path === 'shared') {
    try {
      const id = decodeURIComponent(value || '')
      return id ? { view: 'reader', id, shared: path === 'shared' } : { view: 'home' }
    } catch { return { view: 'home' } }
  }
  // The plaza is the front door: the bare route and every unknown route
  // land on the feed. A plaza id opens the line's detail; plaza-read is
  // the reader over a published line; plaza-enter is the bring-my-avatar
  // flow for one line.
  if (path === 'plaza' || path === 'plaza-enter' || path === 'plaza-read') {
    let id = ''
    try { id = decodeURIComponent(value || '') } catch { return { view: 'plaza' } }
    if (!id) return { view: 'plaza' }
    if (path === 'plaza') return { view: 'plaza-detail', id }
    if (path === 'plaza-enter') return { view: 'plaza-enter', id }
    return { view: 'reader', id, plaza: true }
  }
  // Public profile pages live under profile/<uid>; uids are opaque to the
  // router (they may carry a `username:` prefix) and are decoded whole.
  if (path === 'profile') {
    let uid = ''
    try { uid = decodeURIComponent(value || '') } catch { return { view: 'plaza' } }
    return uid ? { view: 'profile', id: uid } : { view: 'plaza' }
  }
  return { view: pages.has(path) ? path : 'plaza' }
}

export function routeHash(route) {
  if (route.view === 'reader' && route.id) {
    return `#/${route.plaza ? 'plaza-read' : route.shared ? 'shared' : 'reader'}/${encodeURIComponent(route.id)}`
  }
  if (route.view === 'plaza-detail' && route.id) return `#/plaza/${encodeURIComponent(route.id)}`
  if (route.view === 'profile' && route.id) return `#/profile/${encodeURIComponent(route.id)}`
  if (route.view === 'plaza-enter' && route.id) return `#/plaza-enter/${encodeURIComponent(route.id)}`
  return `#/${pages.has(route.view) ? route.view : 'plaza'}`
}
