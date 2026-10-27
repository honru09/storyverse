import { ApiError } from './gemini.js'
import { createLibraryStore } from './library-store.js'
import { validateLibrary } from '../src/persistence.js'

/**
 * The cloud library service: a signed-in reader's own stories, stored
 * server-side so the bookshelf follows the account instead of living
 * only in the browser that generated it. Local storage stays the
 * offline working copy; this service is the account copy.
 *
 * Storage scheme (see server/library-store.js for the layout): a story
 * head (everything but its chapters) plus chapter chunks packed under
 * a serialized-size budget of {@link CHUNK_BUDGET_BYTES} — comfortably
 * below Firestore's 1 MiB document limit even after the chunk record's
 * own framing. Single-shot uploads are split server-side; stories too
 * big for one request arrive as chunks followed by a head commit, and
 * the commit assembles and fully validates the story before the head
 * exists, so a visible story is always a complete, client-loadable one.
 *
 * Every method is owner-only by construction: records are addressed by
 * the caller's uid from the verified identity, never by a uid in the
 * request, so one account cannot name another account's books.
 * This data is private account property — nothing here feeds the plaza
 * or any public surface; publications keep their own sanitized copies.
 */
export const CHUNK_BUDGET_BYTES = 700_000
const MAX_CHUNK_RECORD_BYTES = 900_000
const MAX_SINGLE_CHAPTER_BYTES = 900_000
const MAX_STORY_BYTES = 24 * 1024 * 1024
const MAX_CHUNKS = 512
const MAX_TOMBSTONES = 200

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const byteLength = (value) => Buffer.byteLength(value, 'utf8')
const nowIso = () => new Date().toISOString()

function assertStoryId(storyId) {
  if (typeof storyId !== 'string' || !storyId || storyId.length > 200 || /[\u0000-\u001f\u007f]/.test(storyId)) {
    throw new ApiError(400, '这本书的标识无效，没能同步。')
  }
}

/** Full structural validation — the same rules the client enforces on save. */
function assertStoryValid(story) {
  const errors = validateLibrary({
    version: 2, stories: [story], activeStoryId: null, publications: [], favorites: [], draft: null,
  })
  if (errors.length > 0) throw new ApiError(400, '这本书的数据不完整，没能同步。')
  if (byteLength(JSON.stringify(story)) > MAX_STORY_BYTES) {
    throw new ApiError(413, '这本书太大了，没能同步。')
  }
}

function metaEntryFor(story, syncedAt) {
  return {
    id: story.id,
    title: story.title,
    genreId: story.genreId,
    kind: story.kind === 'merged' ? 'merged' : 'solo',
    status: typeof story.status === 'string' ? story.status : '',
    chapterCount: story.chapters.length,
    readerIndex: Number.isInteger(story.readerIndex) ? story.readerIndex : 0,
    updatedAt: typeof story.updatedAt === 'string' ? story.updatedAt : '',
    syncedAt,
  }
}

/**
 * Pack chapters in order into chunks whose bare-array JSON stays under
 * the budget. A chapter is never split; one chapter alone over the
 * single-chapter cap is rejected instead of silently producing a chunk
 * the document store would refuse.
 */
export function splitChapterChunks(chapters) {
  if (!Array.isArray(chapters) || chapters.length === 0) return []
  const chunks = []
  let current = []
  let currentBytes = 2
  for (const chapter of chapters) {
    const chapterBytes = byteLength(JSON.stringify(chapter))
    if (chapterBytes > MAX_SINGLE_CHAPTER_BYTES) {
      throw new ApiError(413, '单章内容过大，没能同步。')
    }
    if (current.length > 0 && currentBytes + chapterBytes + 1 > CHUNK_BUDGET_BYTES) {
      chunks.push(current)
      current = []
      currentBytes = 2
    }
    current.push(chapter)
    currentBytes += chapterBytes + 1
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

export function createLibraryService({ env = process.env, store } = {}) {
  const backend = store === undefined ? createLibraryStore({ env }) : store
  const requireStore = () => {
    if (!backend) throw new ApiError(503, '云端书架尚未开通，故事仍保存在本机。')
    return backend
  }

  const readMeta = async (uid) => {
    const meta = await requireStore().getMeta(uid)
    return {
      stories: Array.isArray(meta?.stories) ? meta.stories : [],
      deleted: Array.isArray(meta?.deleted) ? meta.deleted : [],
      readingState: isRecord(meta?.readingState) ? meta.readingState : null,
    }
  }

  const writeMetaEntry = async (uid, story) => {
    const storeRef = requireStore()
    const meta = await readMeta(uid)
    const entry = metaEntryFor(story, nowIso())
    const stories = [...meta.stories.filter((item) => item?.id !== story.id), entry]
    const deleted = meta.deleted.filter((item) => item?.id !== story.id)
    await storeRef.putMeta(uid, { stories, deleted, readingState: meta.readingState, updatedAt: nowIso() })
    return entry
  }

  async function assemble(uid, head) {
    const storeRef = requireStore()
    const chunkCount = Number.isInteger(head?.chunkCount) ? head.chunkCount : 0
    const records = await Promise.all(
      Array.from({ length: chunkCount }, (_, index) => storeRef.getChapterChunk(uid, head.id, index)),
    )
    const chapters = []
    for (const record of records) {
      if (!record || !Array.isArray(record.chapters)) {
        throw new ApiError(502, '云端书架读取不完整，请稍后重试。')
      }
      chapters.push(...record.chapters)
    }
    const { chunkCount: _count, ...rest } = head
    return { ...rest, chapters }
  }

  return {
    available: backend !== null,
    kind: backend?.kind ?? null,

    /** Shelf index for the merge: metadata, tombstones, reading state. No prose. */
    async list(identity) {
      const meta = await readMeta(identity.uid)
      const stories = [...meta.stories].sort((a, b) => String(b?.updatedAt ?? '').localeCompare(String(a?.updatedAt ?? '')))
      return { stories, deleted: meta.deleted, readingState: meta.readingState }
    },

    async getStory(identity, storyId) {
      assertStoryId(storyId)
      const head = await requireStore().getStoryHead(identity.uid, storyId)
      if (!head) throw new ApiError(404, '这本书还没有同步到云端。')
      return assemble(identity.uid, head)
    },

    /** Single-shot upsert: the whole story in one request, split here. */
    async putStory(identity, storyId, body) {
      assertStoryId(storyId)
      const story = body?.story
      if (!isRecord(story) || story.id !== storyId) throw new ApiError(400, '这本书的数据不完整，没能同步。')
      assertStoryValid(story)
      const uid = identity.uid
      const storeRef = requireStore()
      const chunks = splitChapterChunks(story.chapters)
      const previous = await storeRef.getStoryHead(uid, storyId)
      let from = 0
      for (let index = 0; index < chunks.length; index += 1) {
        await storeRef.putChapterChunk(uid, storyId, index, { chapters: chunks[index], from })
        from += chunks[index].length
      }
      const previousCount = Number.isInteger(previous?.chunkCount) ? previous.chunkCount : 0
      for (let index = chunks.length; index < previousCount; index += 1) {
        await storeRef.deleteChapterChunk(uid, storyId, index)
      }
      const { chapters: _chapters, ...headStory } = story
      await storeRef.putStoryHead(uid, storyId, { ...headStory, chunkCount: chunks.length })
      const entry = await writeMetaEntry(uid, story)
      return { story: entry }
    },

    /**
     * One chapter chunk of a multi-request upload. Chunks are stored
     * under the story's key space but stay invisible — no head, no index
     * entry — until the head commit assembles and validates the whole.
     */
    async putChunk(identity, storyId, index, body) {
      assertStoryId(storyId)
      if (!Number.isInteger(index) || index < 0 || index >= MAX_CHUNKS) throw new ApiError(400, '分块序号无效，没能同步。')
      const from = body?.from
      const chapters = body?.chapters
      if (!Number.isInteger(from) || from < 0 || !Array.isArray(chapters) || chapters.length === 0 || chapters.length > 400) {
        throw new ApiError(400, '这一块章节数据不完整，没能同步。')
      }
      for (let offset = 0; offset < chapters.length; offset += 1) {
        const chapter = chapters[offset]
        if (!isRecord(chapter) || typeof chapter.id !== 'string' || !chapter.id
          || chapter.index !== from + offset || !Array.isArray(chapter.paragraphs)) {
          throw new ApiError(400, '这一块章节数据不完整，没能同步。')
        }
      }
      const record = { chapters, from }
      if (byteLength(JSON.stringify(record)) > MAX_CHUNK_RECORD_BYTES) {
        throw new ApiError(413, '这一块章节太大了，请分成更小的块同步。')
      }
      await requireStore().putChapterChunk(identity.uid, storyId, index, record)
      return { ok: true, index }
    },

    /** Commit a chunked upload: assemble, validate in full, then publish the head. */
    async putHead(identity, storyId, body) {
      assertStoryId(storyId)
      const headStory = body?.story
      const chunkCount = body?.chunkCount
      if (!isRecord(headStory) || headStory.id !== storyId) throw new ApiError(400, '这本书的数据不完整，没能同步。')
      if (Array.isArray(headStory.chapters) && headStory.chapters.length > 0) {
        throw new ApiError(400, '正文请通过分块上传，没能同步。')
      }
      if (!Number.isInteger(chunkCount) || chunkCount < 0 || chunkCount > MAX_CHUNKS) {
        throw new ApiError(400, '分块数量无效，没能同步。')
      }
      const story = await assemble(identity.uid, { ...headStory, id: storyId, chunkCount })
      if (story.chapters.length === 0 && chunkCount > 0) throw new ApiError(400, '章节分块不完整，没能同步。')
      assertStoryValid(story)
      const uid = identity.uid
      await requireStore().putStoryHead(uid, storyId, { ...headStory, chunkCount })
      const entry = await writeMetaEntry(uid, story)
      return { story: entry }
    },

    /** Delete the cloud copy and leave a tombstone so other devices follow. */
    async remove(identity, storyId) {
      assertStoryId(storyId)
      const uid = identity.uid
      const storeRef = requireStore()
      const head = await storeRef.getStoryHead(uid, storyId)
      const chunkCount = Number.isInteger(head?.chunkCount) ? head.chunkCount : 0
      for (let index = 0; index < chunkCount; index += 1) {
        await storeRef.deleteChapterChunk(uid, storyId, index)
      }
      if (head) await storeRef.deleteStoryHead(uid, storyId)
      const meta = await readMeta(uid)
      const deletedAt = nowIso()
      const deleted = [...meta.deleted.filter((item) => item?.id !== storyId), { id: storyId, deletedAt }]
        .sort((a, b) => String(a.deletedAt).localeCompare(String(b.deletedAt)))
        .slice(-MAX_TOMBSTONES)
      await storeRef.putMeta(uid, {
        stories: meta.stories.filter((item) => item?.id !== storyId),
        deleted,
        readingState: meta.readingState,
        updatedAt: deletedAt,
      })
      return { ok: true, id: storyId }
    },

    /** The reading-position blob (paragraph anchors + bookmarks), stored whole. */
    async putReadingState(identity, body) {
      const state = body?.state
      if (!isRecord(state) || state.version !== 1 || !Array.isArray(state.locations) || !Array.isArray(state.bookmarks)
        || state.locations.length > 100 || state.bookmarks.length > 80) {
        throw new ApiError(400, '阅读进度格式有误，没能同步。')
      }
      for (const entry of [...state.locations, ...state.bookmarks]) {
        if (!isRecord(entry) || typeof entry.key !== 'string' || entry.key.length >= 300 || !isRecord(entry.anchor)) {
          throw new ApiError(400, '阅读进度格式有误，没能同步。')
        }
      }
      const uid = identity.uid
      const storeRef = requireStore()
      const meta = await readMeta(uid)
      const updatedAt = typeof body.updatedAt === 'string' && body.updatedAt ? body.updatedAt : nowIso()
      await storeRef.putMeta(uid, { ...meta, readingState: { state, updatedAt }, updatedAt: nowIso() })
      return { ok: true }
    },
  }
}
