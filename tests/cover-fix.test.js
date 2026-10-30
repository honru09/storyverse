import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// COVER-FIX wiring assertions (source-level, the house style for UI
// contracts): a publication's face is its OWN cover first, everywhere
// a published line is shown; the byline is the author's place and
// never repeats the avatar's picture or attribute string.
const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

const slice = (text, from, to) => {
  const start = text.indexOf(from)
  assert.notEqual(start, -1, `anchor found: ${from}`)
  const end = text.indexOf(to, start)
  assert.notEqual(end, -1, `end anchor found: ${to}`)
  return text.slice(start, end)
}

test('PublicationArtwork is the one chain: coverUrl → (onError only) → world artwork', () => {
  const body = slice(main, 'function PublicationArtwork', 'function plazaFeedTime')
  const coverAt = body.indexOf('coverUrl')
  const errorAt = body.indexOf('onError')
  const fallbackAt = body.indexOf('<WorldArtwork')
  assert.ok(coverAt !== -1 && errorAt !== -1 && fallbackAt !== -1, 'chain parts all present')
  assert.ok(coverAt < errorAt && errorAt < fallbackAt, 'cover first, error gate second, world art last')
  assert.match(body, /setCoverFailed\(true\)/, 'a failed cover image is what opens the fallback')
  assert.match(body, /useEffect\(\(\) => \{ setCoverFailed\(false\); \}, \[coverUrl\]\)/, 'the failure flag resets when the cover changes')
})

test('store card cover and detail header render the shared chain', () => {
  const card = slice(main, 'function StoreBookCard', 'function Store(')
  assert.match(card, /<PublicationArtwork publication=\{book\} genreId=\{genre\.id\} \/>/)
  const detailCover = slice(main, 'className="plaza-detail-cover"', 'plaza-detail-cover-copy')
  assert.match(detailCover, /<PublicationArtwork publication=\{detail\} genreId=\{genre\.id\} eager \/>/)
})

test('profile shelf/store art delegates to the same chain', () => {
  const body = slice(main, 'function ProfileCoverArt', 'function ProfileConnectionRow')
  assert.match(body, /<PublicationArtwork publication=\{publication\} genreId=\{genre\.id\} \/>/)
  assert.ok(!body.includes('profile-cover-img'), 'the old cover-first-but-no-fallback img is gone')
})

test('card byline is the author’s place: no avatar thumb, no avatar name, @ID + official mark', () => {
  const card = slice(main, 'function StoreBookCard', 'function Store(')
  assert.ok(!card.includes('PlazaAvatarThumb'), 'no second copy of the avatar’s picture on the card')
  assert.ok(!card.includes('plaza-avatar-row'), 'the old capsule row is gone')
  assert.ok(!card.includes('plaza-lead-appearance'), 'the appearance line is gone')
  assert.ok(!card.includes('publication.avatar?.appearance'), 'the card never reads the attribute string')
  // DEVICE-FIX3 §54: the byline became two fixed slots (name line,
  // handle line) — the author signals live in the slots now.
  assert.match(card, /className="store-slot store-slot-name"/)
  assert.match(card, /className="store-slot store-slot-handle"/)
  assert.match(card, /book\.authorName/, 'name slot shows the author, not the avatar')
  assert.match(card, /book\.authorHandle/, 'handle slot carries the author @ID')
  assert.match(card, /plaza-byline-official/, 'official accounts carry the official mark in the name slot')
  assert.ok(!card.includes('plaza-badge is-official'), 'the meta row no longer duplicates the official signal')
})

test('store card carries no introduction: the intro lives on the detail page only (STORE-DESIGN v3)', () => {
  const card = slice(main, 'function StoreBookCard', 'function Store(')
  // User rule 2026-10-30 16:10: lengths that cannot be budgeted
  // (简介/标签) do not ride a list card — the intro slot is gone from
  // the card. The synopsis thread (plazaCardIntroFor /
  // cardIntroExcerptFor) still feeds the book detail page.
  assert.ok(!card.includes('cardIntroExcerptFor'), 'the card renders no intro excerpt')
  assert.ok(!card.includes('store-book-intro'), 'the intro slot is gone')
  assert.ok(!card.includes('store-chips-block'), 'the chip rows are gone')
})

test('the title heads the card body; the cover is bare art (STORE-DESIGN v2)', () => {
  const card = slice(main, 'function StoreBookCard', 'function Store(')
  // User rule 2026-10-30 15:54: nothing rides the cover — no shade,
  // no printed title, no status capsule. The title is the body's
  // first row instead.
  assert.match(card, /className="store-slot store-slot-title"/)
  assert.match(card, /className="store-book-title"/)
  assert.ok(!card.includes('plaza-cover-title'), 'no title printed on the cover')
  assert.ok(!card.includes('plaza-cover-shade'), 'no shade over the cover')
  assert.ok(!card.includes('store-card-status'), 'no status capsule on the cover')
  assert.ok(!card.includes('<h3'), 'the title is a fitted span, not a heading line')
  assert.ok(!card.includes('book.avatar.name'), 'the avatar name never prints as a pseudo-title')
})

test('post book card: live books ride the shared chain, shelved books an honest placeholder', () => {
  const card = slice(main, 'function PlazaPostBookCard', 'function PlazaPostCard')
  assert.match(card, /<PublicationArtwork publication=\{book\} genreId=\{genre\.id\} \/>/)
  assert.match(card, /is-unavailable/, 'a withdrawn or deleted book renders the placeholder')
  assert.match(card, /已下架/, 'the placeholder says what happened')
  assert.ok(!main.includes('PlazaLeadPortrait'), 'the lead portrait surface retired with the old feed')
})

test('byline styles replace the capsule styles', () => {
  assert.match(css, /\.plaza-byline\{/)
  assert.match(css, /\.plaza-byline-official\{/)
  assert.ok(!css.includes('.plaza-avatar-row'), 'capsule row styles removed')
  assert.ok(!css.includes('.plaza-lead-appearance'), 'appearance line styles removed')
})
