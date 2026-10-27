import { plazaTemplateNameFor } from './plaza.js'

/**
 * The profile bookshelf vocabulary: a reader's published plaza lines,
 * grouped the way the Pinterest-style profile groups pins into boards.
 * One board always gathers every line; after it, one board per world.
 * The helpers are pure so the grouping, ordering and searching the
 * profile page renders can be tested without a browser.
 */

const publishedTime = (publication) => {
  const time = Date.parse(publication?.publishedAt || '')
  return Number.isNaN(time) ? 0 : time
}

const titleOf = (publication) => String(publication?.title || '')

export function sortProfileLines(publications = [], mode = 'newest') {
  const lines = Array.isArray(publications) ? [...publications] : []
  if (mode === 'oldest') {
    return lines.sort((a, b) => publishedTime(a) - publishedTime(b) || titleOf(a).localeCompare(titleOf(b), 'zh-CN'))
  }
  if (mode === 'title') {
    return lines.sort((a, b) => titleOf(a).localeCompare(titleOf(b), 'zh-CN') || publishedTime(b) - publishedTime(a))
  }
  return lines.sort((a, b) => publishedTime(b) - publishedTime(a) || titleOf(a).localeCompare(titleOf(b), 'zh-CN'))
}

export function profileBoardsFor(profile, sortMode = 'newest') {
  const lines = sortProfileLines(profile?.publications || [], sortMode)
  if (lines.length === 0) return []

  const boards = [{
    id: 'all',
    title: '全部故事线',
    worldId: '',
    publications: lines,
  }]
  const byWorld = new Map()

  for (const world of Array.isArray(profile?.worlds) ? profile.worlds : []) {
    if (!world?.worldId || byWorld.has(world.worldId)) continue
    const worldLines = lines.filter((publication) => publication.genreId === world.worldId)
    if (worldLines.length === 0) continue
    byWorld.set(world.worldId, {
      id: `world:${world.worldId}`,
      title: world.name || worldLines[0].worldName || '未命名世界',
      worldId: world.worldId,
      publications: worldLines,
    })
  }

  for (const publication of lines) {
    const worldId = publication.genreId || ''
    if (!worldId || byWorld.has(worldId)) continue
    byWorld.set(worldId, {
      id: `world:${worldId}`,
      title: publication.worldName || '未命名世界',
      worldId,
      publications: lines.filter((line) => line.genreId === worldId),
    })
  }

  return [...boards, ...byWorld.values()]
}

export function searchProfileLines(publications = [], query = '', sortMode = 'newest') {
  const needle = String(query || '').trim().toLocaleLowerCase()
  const lines = sortProfileLines(publications, sortMode)
  if (!needle) return lines
  return lines.filter((publication) => {
    const haystack = [
      publication.title,
      publication.worldName,
      publication.premise,
      plazaTemplateNameFor(publication),
    ].filter(Boolean).join(' ').toLocaleLowerCase()
    return haystack.includes(needle)
  })
}
