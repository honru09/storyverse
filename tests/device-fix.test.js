// DEVICE-FIX (2026-10-30 device walkthrough batch) source guards:
// REQ-24 locked @ID row, REQ-25 reader return origin, REQ-26 the
// text-noise sweep, REQ-21 store card format, REQ-22 breathing room,
// REQ-19 client wiring. DOM-level measurements live in the e2e pass;
// these pin the shapes so a refactor cannot quietly undo the batch.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const usersClient = readFileSync(new URL('../src/users.js', import.meta.url), 'utf8')

test('REQ-24: a locked @ID renders no field in the edit sheet at all', () => {
  const sheet = main.slice(main.indexOf('function EditProfileSheet'), main.indexOf('export default function App'))
  assert.match(sheet, /\{!idLocked && \(\s*<label className="profile-edit-field">/)
  assert.match(sheet, /@用户名/)
  // The lock is client display only; save() never sends a handle.
  const save = sheet.slice(sheet.indexOf('const save = async'), sheet.indexOf('const onPickFile'))
  assert.doesNotMatch(save, /handle/)
})

test('REQ-25: plaza continue-reading returns to the plaza, not home', () => {
  // The feed's reader entry carries its origin…
  assert.match(main, /onOpenStory=\{\(storyId\) => openOwnReader\(storyId, \{ from: "plaza" \}\)\}/)
  assert.match(main, /const openOwnReader = \(storyId = activeStory\?\.id, options = \{\}\) =>/)
  assert.match(main, /navigate\("reader", \{ storyId: id, \.\.\.\(options\.from \? \{ from: options\.from \} : \{\}\) \}\)/)
  // …navigate keeps the in-memory origin across the hash re-parse…
  assert.match(main, /setRoute\(nextRoute\.from\s*\? \{ \.\.\.parseRoute\(hash\), from: nextRoute\.from \}\s*: parseRoute\(hash\)\)/)
  // …and the reader honours it, below the detail origin, above home.
  assert.match(main, /route\.from === "plaza"\s*\? \{ view: "plaza" \}/)
  assert.match(main, /backText=\{route\.plaza \|\| route\.from === "plaza" \? "返回广场"/)
  // The URL hash structure stays untouched by the origin.
  const hashFn = main.slice(main.indexOf('function routeHash'), main.indexOf('function parseRoute'))
  assert.doesNotMatch(hashFn, /from/)
})

test('REQ-26: the eight page-level explainer lines are gone for good', () => {
  const deleted = [
    '正式书目——走完的故事线在这里上架，广场上分享的也是这里的书。',
    '读完的世界、想说的话，都在这里流动。',
    '书架已同步到你的账号，换设备登录就能接着读。',
    '发布时已脱敏：作者的私有设定与未公开分支不会出现在这里。',
    '带化身进入时，你的新线会沿用这套骨架，走向由你的选择分叉。',
    '这条线，是这个化身一步步走完的。',
    '你关注的人最近在广场说了什么',
    '上架书城的东西，书名、简介、世界设定都会公开给所有人看；发布后，想调整就在书架里改，广场和书城会一起更新。广场名片显示的是你现在的头像和昵称，改了会跟着变。',
  ]
  for (const line of deleted) assert.ok(!main.includes(line), `deleted line stays deleted: ${line.slice(0, 16)}…`)
})

test('REQ-26: functional copy survives the sweep', () => {
  const kept = [
    '这是你的书，不能给自己评分',
    '章节拍，进入后逐步展开',
    '下架后书城不再显示这本书，广场上分享过它的帖子会显示已下架',
    '你是主角。',
    '故事只保存在当前浏览器',
    '正在打开这本书',
  ]
  for (const line of kept) assert.ok(main.includes(line), `functional copy kept: ${line.slice(0, 16)}…`)
})

test('REQ-21 (fixed format: §54 slots, reshaped by STORE-DESIGN v3): the store card is a fixed format', () => {
  assert.match(css, /\.store-book-card\{[^}]*display:flex;flex-direction:column;height:100%/)
  assert.match(css, /\.store-book-body\{[^}]*display:flex;flex-direction:column;flex:1/)
  // STORE-DESIGN v3 (user rule 2026-10-30 16:10): the intro slot and
  // the chip rows left the card; the fixed format is now the title /
  // name / handle slots plus the foot-pinned meta block.
  assert.match(css, /\.store-slot-title\{height:22px\}/)
  assert.match(css, /\.store-slot-name\{height:22px/)
  assert.match(css, /\.store-slot-handle\{height:17px/)
  assert.match(css, /\.store-meta-block\{margin-top:auto/)
  assert.ok(!css.includes('.store-book-intro{'), 'intro slot styles removed')
  assert.ok(!css.includes('.store-chips-block{'), 'chip block styles removed')
  const card = main.slice(main.indexOf('function StoreBookCard'), main.indexOf('function Store('))
  assert.match(card, /className="store-slot store-slot-title"/)
  assert.ok(!card.includes('store-book-intro'), 'the card renders no intro')
})

test('REQ-22: hero cluster, ratings panel and avatar frame breathe', () => {
  assert.match(css, /\.hero-starmap \+ \.hero-actions\{margin-top:20px\}/)
  assert.match(css, /\.plaza-panel\.book-ratings\{padding:20px\}/)
  assert.match(css, /\.book-ratings-pick\{padding:4px 5px/)
  assert.match(css, /\.book-ratings-form-foot\{[^}]*margin-top:14px/)
  assert.match(css, /\.plaza-avatar-panel\{[^}]*gap:16px[^}]*padding-top:20px/)
  assert.match(css, /\.plaza-avatar-frame\{[^}]*background:transparent/)
})

test('REQ-19: client banner wiring (upload/delete/crop + hero kinds)', () => {
  assert.match(usersClient, /export async function uploadMyBanner/)
  assert.match(usersClient, /export async function deleteMyBanner/)
  assert.match(usersClient, /export async function bitmapRegionToBannerJpeg/)
  const sheet = main.slice(main.indexOf('function EditProfileSheet'), main.indexOf('export default function App'))
  assert.match(sheet, /主页头图/)
  assert.match(sheet, /shape="banner"/)
  const hero = main.slice(main.indexOf('className="profile-hero"'), main.indexOf('className="profile-stage"'))
  assert.match(hero, /profile\.banner/)
  assert.match(hero, /profile-hero-bg is-clear/)
})
