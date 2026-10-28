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
  assert.match(card, /className="plaza-byline"/)
  assert.match(card, /book\.authorName/, 'byline shows the author, not the avatar')
  assert.match(card, /book\.authorHandle/, 'byline carries the author @ID')
  assert.match(card, /plaza-byline-official/, 'official accounts carry the official mark in the byline')
  assert.ok(!card.includes('plaza-badge is-official'), 'the meta row no longer duplicates the official signal')
})

test('store card introduction comes from plazaCardIntroFor (synopsis → intro thread)', () => {
  const card = slice(main, 'function StoreBookCard', 'function Store(')
  assert.match(card, /plazaCardIntroFor\(book\)/)
  assert.match(card, /className="store-book-intro"/)
})

test('the title lives on the cover only: the store card body never repeats it', () => {
  const card = slice(main, 'function StoreBookCard', 'function Store(')
  assert.match(card, /plaza-cover-title/)
  assert.ok(!card.includes('<h3'), 'no second title line under the cover')
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
