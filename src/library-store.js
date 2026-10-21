import { loadLibrary, migrateLegacy, saveLibrary, importLibrary, STORAGE_KEY } from './persistence.js'

export function browserStorage() {
  try { return globalThis.localStorage } catch { return undefined }
}

// All writes have one owner. A stale tab must never silently replace a newer
// library, and an unreadable library must survive the first interaction.
export function createLibraryStore(storage = browserStorage()) {
  const capture = () => {
    try {
      if (!storage?.getItem) throw new Error('无法访问本地存储。')
      return { ok: true, raw: storage.getItem(STORAGE_KEY) ?? null }
    } catch { return { ok: false, raw: null } }
  }
  const readLibrary = (captured) => loadLibrary(captured.ok
    ? { getItem: () => captured.raw }
    : { getItem: () => { throw new Error('存储权限被拒绝') } })
  const initial = capture()
  const loaded = readLibrary(initial)
  const legacy = !loaded.warning && !loaded.library.draft ? migrateLegacy(storage) : null
  let expectedRaw = initial.raw
  let state = {
    library: legacy?.draft ? { ...loaded.library, draft: legacy.draft } : loaded.library,
    warning: loaded.warning,
    unsaved: Boolean(loaded.warning),
    blocked: Boolean(loaded.warning),
  }
  const listeners = new Set()
  const emit = (patch) => {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }
  const portable = (library) => {
    try { return importLibrary(JSON.stringify(library)) }
    catch { throw new Error('这次改动无法保存，原书架已保留。') }
  }
  const persist = (library) => {
    if (state.blocked) {
      emit({ library, unsaved: true })
      return false
    }
    const current = capture()
    if (!current.ok) {
      emit({ library, unsaved: true, warning: '暂时无法读取存档，已暂停保存。请导出备份后重试。' })
      return false
    }
    if (current.raw !== expectedRaw) {
      emit({ library, unsaved: true, blocked: true, warning: '另一窗口更新了书架。当前改动暂存于此页，请先备份，再载入最新存档。' })
      return false
    }
    const serialized = JSON.stringify(library)
    const result = saveLibrary(storage, library)
    if (result.ok) expectedRaw = serialized
    emit({ library, unsaved: !result.ok, warning: result.ok ? null : '暂时无法保存。请导出备份，或释放存储空间后重试。' })
    return result.ok
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    update(updater) {
      try {
        const next = typeof updater === 'function' ? updater(state.library) : updater
        if (next === state.library) return true
        const safe = portable(next)
        if (JSON.stringify(safe) === JSON.stringify(state.library)) return true
        return persist(safe)
      } catch (error) {
        emit({ warning: error.message || '这次改动没有保存，请重试。' })
        return false
      }
    },
    retry: () => persist(state.library),
    raw() {
      const current = capture()
      if (!current.ok) throw new Error('无法读取原存档，请检查存储权限。')
      return current.raw
    },
    sync() {
      const current = capture()
      if (!current.ok) { emit({ warning: '暂时无法读取存档，请检查存储权限。' }); return }
      if (current.raw === expectedRaw) return
      if (state.unsaved) {
        emit({ blocked: true, warning: '另一窗口更新了书架。此页仍有未保存改动，请先导出备份。' })
        return
      }
      const next = readLibrary(current)
      if (next.warning) {
        emit({ blocked: true, unsaved: true, warning: next.warning })
        return
      }
      expectedRaw = current.raw
      emit({ library: next.library, warning: null, unsaved: false, blocked: false })
    },
    // Called only by an explicit recovery action. Never clears unreadable data.
    reload() {
      const current = capture()
      const next = readLibrary(current)
      if (next.warning) { emit({ warning: next.warning }); return false }
      expectedRaw = current.raw
      emit({ library: next.library, warning: null, unsaved: false, blocked: false })
      return true
    },
    restore(library) {
      const safe = portable(library)
      const current = capture()
      if (!current.ok) throw new Error('无法读取原存档，恢复尚未执行。请检查存储权限。')
      try {
        if (current.raw) storage.setItem(`${STORAGE_KEY}:recovery`, current.raw)
      } catch {
        throw new Error('无法保留原存档，恢复尚未执行。请先释放本机存储空间。')
      }
      const result = saveLibrary(storage, safe)
      if (!result.ok) throw new Error(result.error)
      expectedRaw = JSON.stringify(safe)
      emit({ library: safe, warning: null, unsaved: false, blocked: false })
      return true
    },
  }
}
