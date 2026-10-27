const pages = new Set(['home', 'forge', 'store', 'merge', 'avatar'])

export function parseRoute(hash = '') {
  const [path, value] = hash.replace(/^#\/?/, '').split('/')
  if (path === 'reader' || path === 'shared') {
    try {
      const id = decodeURIComponent(value || '')
      return id ? { view: 'reader', id, shared: path === 'shared' } : { view: 'home' }
    } catch { return { view: 'home' } }
  }
  return { view: pages.has(path) ? path : 'home' }
}

export function routeHash(route) {
  if (route.view === 'reader' && route.id) return `#/${route.shared ? 'shared' : 'reader'}/${encodeURIComponent(route.id)}`
  return `#/${pages.has(route.view) ? route.view : 'home'}`
}
