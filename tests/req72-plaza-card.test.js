import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// REQ-72 (user rule 2026-10-31 11:59): the book card riding a plaza
// share post carries NO intro — the same minimal spec as the store
// card (cover, title, author line, actions). The synopsis lives on
// the book detail page only; the post's own words are untouched.
const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

const slice = (text, from, to) => {
  const start = text.indexOf(from)
  assert.notEqual(start, -1, `anchor found: ${from}`)
  const end = text.indexOf(to, start)
  assert.notEqual(end, -1, `end anchor found: ${to}`)
  return text.slice(start, end)
}

test('REQ-72: plaza post book card renders no intro excerpt', () => {
  const card = slice(main, 'function PlazaPostBookCard', 'function PlazaPostCard')
  assert.ok(!card.includes('cardIntroExcerptFor'), 'no intro excerpt helper on the card')
  assert.ok(!card.includes('plaza-post-book-intro'), 'no intro slot on the card')
  assert.ok(!card.includes('book.synopsis'), 'the card never reads the synopsis')
  assert.ok(!css.includes('.plaza-post-book-intro'), 'the retired intro style is gone')
})

test('REQ-72: the minimal card keeps cover, title, author line and actions', () => {
  const card = slice(main, 'function PlazaPostBookCard', 'function PlazaPostCard')
  assert.match(card, /<PublicationArtwork publication=\{book\} genreId=\{genre\.id\} \/>/, 'cover chain stays')
  assert.match(card, /《\{book\.title\}》/, 'title stays')
  assert.match(card, /book\.authorName/, 'author line stays')
  assert.match(card, /plaza-post-book-actions/, 'action row stays')
  assert.match(card, /读原作线/, 'read action stays')
})

test('REQ-72: the detail page keeps its synopsis section (out of scope, untouched)', () => {
  assert.match(main, /<h2>本书简介<\/h2>/, 'detail page synopsis heading stays')
  assert.match(main, /\{detail\.synopsis\}/, 'detail page still renders the synopsis')
})

test('REQ-72: the post body itself is untouched by the card change', () => {
  const card = slice(main, 'function PlazaPostCard', 'function PlazaFeed')
  assert.match(card, /plaza-post-content/, 'the author’s own post text still renders')
})
