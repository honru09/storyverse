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
  const body = slice(main, 'function PublicationArtwork', 'function PlazaLeadPortrait')
  const coverAt = body.indexOf('coverUrl')
  const errorAt = body.indexOf('onError')
  const fallbackAt = body.indexOf('<WorldArtwork')
  assert.ok(coverAt !== -1 && errorAt !== -1 && fallbackAt !== -1, 'chain parts all present')
  assert.ok(coverAt < errorAt && errorAt < fallbackAt, 'cover first, error gate second, world art last')
  assert.match(body, /setCoverFailed\(true\)/, 'a failed cover image is what opens the fallback')
  assert.match(body, /useEffect\(\(\) => \{ setCoverFailed\(false\); \}, \[coverUrl\]\)/, 'the failure flag resets when the cover changes')
})

test('plaza card cover and detail header render the shared chain', () => {
  const card = slice(main, 'function PlazaCard', 'function plazaFeedTime')
  assert.match(card, /<PublicationArtwork publication=\{publication\} genreId=\{genre\.id\} \/>/)
  const detailCover = slice(main, 'className="plaza-detail-cover"', 'plaza-detail-cover-copy')
  assert.match(detailCover, /<PublicationArtwork publication=\{detail\} genreId=\{genre\.id\} eager \/>/)
})

test('profile shelf/store art delegates to the same chain', () => {
  const body = slice(main, 'function ProfileCoverArt', 'function ProfileConnectionRow')
  assert.match(body, /<PublicationArtwork publication=\{publication\} genreId=\{genre\.id\} \/>/)
  assert.ok(!body.includes('profile-cover-img'), 'the old cover-first-but-no-fallback img is gone')
})

test('card byline is the author’s place: no avatar thumb, no avatar name, @ID + official mark', () => {
  const card = slice(main, 'function PlazaCard', 'function plazaFeedTime')
  assert.ok(!card.includes('PlazaAvatarThumb'), 'no second copy of the avatar’s picture on the card')
  assert.ok(!card.includes('plaza-avatar-row'), 'the old capsule row is gone')
  assert.ok(!card.includes('plaza-lead-appearance'), 'the appearance line is gone')
  assert.ok(!card.includes('publication.avatar?.appearance'), 'the card never reads the attribute string')
  assert.match(card, /className="plaza-byline"/)
  assert.match(card, /publication\.authorName/, 'byline shows the author, not the avatar')
  assert.match(card, /publication\.authorHandle/, 'byline carries the author @ID')
  assert.match(card, /plaza-byline-official/, 'official accounts carry the official mark in the byline')
  assert.ok(!card.includes('plaza-badge is-official'), 'the meta row no longer duplicates the official signal')
})

test('lead card introduction comes from plazaCardIntroFor (synopsis → intro thread)', () => {
  const card = slice(main, 'function PlazaCard', 'function plazaFeedTime')
  assert.match(card, /plazaCardIntroFor\(publication\)/)
  assert.match(card, /className="plaza-lead-synopsis"/)
})

test('lead grid stands down when there is no portrait to fill its column', () => {
  const card = slice(main, 'function PlazaCard', 'function plazaFeedTime')
  assert.match(card, /leadWithPortrait/, 'the lead class is conditional on a portrait existing')
  assert.match(card, /onFail=\{\(\) => setLeadPortraitLost\(true\)\}/, 'a portrait load failure also stands the grid down')
  const portrait = slice(main, 'function PlazaLeadPortrait', 'function PlazaCard')
  assert.match(portrait, /onError=\{\(\) => \{ setFailed\(true\); onFail\?\.\(\); \}\}/)
})

test('byline styles replace the capsule styles', () => {
  assert.match(css, /\.plaza-byline\{/)
  assert.match(css, /\.plaza-byline-official\{/)
  assert.match(css, /\.plaza-lead-synopsis\{/)
  assert.ok(!css.includes('.plaza-avatar-row'), 'capsule row styles removed')
  assert.ok(!css.includes('.plaza-lead-appearance'), 'appearance line styles removed')
})
