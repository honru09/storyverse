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
  // The fusion flow accepts a preselected source (FUSION2 contextual
  // entries): merge/<storyId> preselects one of the reader's own lines;
  // merge/plaza:<publicationId> preselects a plaza line, resolved inside
  // the flow to the line as entered on this shelf (or to the reader's
  // own original behind the publication).
  if (path === 'merge') {
    if (!value) return { view: 'merge' }
    try {
      const decoded = decodeURIComponent(value)
      if (decoded.startsWith('plaza:')) {
        const publicationId = decoded.slice('plaza:'.length)
        return publicationId ? { view: 'merge', publicationId } : { view: 'merge' }
      }
      return decoded ? { view: 'merge', id: decoded } : { view: 'merge' }
    } catch { return { view: 'merge' } }
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
  if (route.view === 'merge' && route.publicationId) return `#/merge/${encodeURIComponent(`plaza:${route.publicationId}`)}`
  if (route.view === 'merge' && route.id) return `#/merge/${encodeURIComponent(route.id)}`
  return `#/${pages.has(route.view) ? route.view : 'plaza'}`
}
