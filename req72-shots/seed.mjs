// REQ-70 seed: the owner's real two-avatar state, mirrored.
//   owner  sv70self   — avatars: 阿灿 (REALACAN) + 橘子 (REALJUZI),
//                       橘子 is main, exactly like the production
//                       account in the 00051 screenshot.
//   author sv70author — avatar 陆鸣 (REALACAN bytes), one published
//                       book, one book_share plaza post; the owner
//                       comments on it; owner <-> author are friends.
// Usage: node seed.mjs <baseUrl> <seedOutPath>
import fs from 'node:fs'
import {
  acceptChapter,
  buildChapter,
  chapterKey,
  chooseBranch,
  createStory,
} from '../src/story-engine.js'

const [base, outPath] = process.argv.slice(2)
if (!base || !outPath) throw new Error('usage: node seed.mjs <baseUrl> <seedOutPath>')

async function api(route, { credential, method = 'GET', body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      Origin: 'http://localhost:5173',
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: response.status, json: await response.json().catch(() => null) }
}
function must(result, label) {
  if (result.status !== 200) throw new Error(`${label}: HTTP ${result.status} ${JSON.stringify(result.json)?.slice(0, 300)}`)
  return result.json
}

async function register(username) {
  const reg = must(await api('/api/auth/username/register', {
    method: 'POST', body: { username, password: 'showcase-pass-1' },
  }), `register ${username}`)
  return {
    uid: reg.uid,
    token: reg.token,
    session: { uid: reg.uid, email: null, provider: 'username', expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, token: reg.token },
  }
}

const walkLocal = (story, count) => {
  let current = story
  for (let index = 0; index < count; index += 1) {
    const chapter = buildChapter(current, index)
    current = acceptChapter(current, chapter, chapterKey(current, index))
    if (chapter.choice && index < count - 1) {
      current = chooseBranch(current, index, chapter.choice.options[0].id)
    }
  }
  return current
}

// ---- owner: two real avatars, 橘子 main ----
const owner = await register('sv70self')
const first = must(await api('/api/avatar', {
  credential: owner.token, method: 'PUT',
  body: { profile: { name: '阿灿', description: 'REALACAN 笑起来很亮的街头少年，好奇心比胆子大，口袋里总有糖。' } },
}), 'owner avatar 1 PUT')
must(await api('/api/avatar/generate', { credential: owner.token, method: 'POST', body: { avatarId: first.avatar?.id } }), 'owner avatar 1 generate')
const second = must(await api('/api/avatars', {
  credential: owner.token, method: 'POST',
  body: { profile: { name: '橘子', description: 'REALJUZI 一颗橘子，给人一种奇怪的感觉，看起来怪怪的，但又说不出来哪里怪，大家的好朋友。' } },
}), 'owner avatar 2 POST')
must(await api('/api/avatar/generate', { credential: owner.token, method: 'POST', body: { avatarId: second.avatar?.id } }), 'owner avatar 2 generate')
must(await api(`/api/avatars/${encodeURIComponent(second.avatar?.id)}/main`, {
  credential: owner.token, method: 'POST', body: {},
}), 'owner set main = juzi')
console.log('owner avatars:', first.avatar?.id, second.avatar?.id)

// ---- author: one avatar, one book, one share post ----
const author = await register('sv70author')
const aAvatar = must(await api('/api/avatar', {
  credential: author.token, method: 'PUT',
  body: { profile: { name: '陆鸣', description: 'REALACAN 灰夹克的年轻人，站在旧城墙下。' } },
}), 'author avatar PUT')
must(await api('/api/avatar/generate', { credential: author.token, method: 'POST', body: { avatarId: aAvatar.avatar?.id } }), 'author avatar generate')

const story = walkLocal(createStory({
  genreId: 'cultivation',
  genreTemplateId: 'xianxia',
  storyLengthMode: 'season',
  originIdentityId: 'mystery',
  startPointName: '山神破庙',
  name: '陆鸣',
  avatarId: aAvatar.avatar?.id,
  avatarAppearance: '灰夹克白卫衣，站在旧城墙下',
  ability: '借火一瞬',
}), 24)
const published = must(await api('/api/store/publish', {
  credential: author.token, method: 'POST', body: { story: { ...story, engine: 'gemini' } },
}), 'author publish')
console.log('published book:', published.book?.id, published.book?.title)

const share = must(await api('/api/plaza/posts', {
  credential: author.token, method: 'POST',
  body: { type: 'book_share', content: '新书上架，第一季写完了，欢迎来读。', bookId: published.book?.id },
}), 'author share post')
console.log('share post:', share.post?.id)

const comment = must(await api(`/api/plaza/posts/${encodeURIComponent(share.post?.id)}/comments`, {
  credential: owner.token, method: 'POST', body: { content: '读完了，写得真不错。' },
}), 'owner comment')
console.log('comment:', comment.comment?.id || comment.id || 'ok')

// ---- friendship (nav-face rows) ----
must(await api(`/api/users/${encodeURIComponent(author.uid)}/friend-request`, {
  credential: owner.token, method: 'POST', body: { message: '' },
}), 'friend request')
must(await api(`/api/users/${encodeURIComponent(owner.uid)}/friend-request/respond`, {
  credential: author.token, method: 'POST', body: { accept: true },
}), 'friend accept')

fs.writeFileSync(outPath, JSON.stringify({ owner, author, bookId: published.book?.id, postId: share.post?.id }, null, 2))
console.log('seed written', outPath)
