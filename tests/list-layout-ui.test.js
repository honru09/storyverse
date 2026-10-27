import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const design = readFileSync(new URL('../DESIGN.md', import.meta.url), 'utf8')

const navBlock = main.slice(main.indexOf('function MobileBottomNav'), main.indexOf('function Home'))
const shelfBlock = main.slice(main.indexOf('function LibrarySwitcher'), main.indexOf('function Stepper'))
const storeBlock = main.slice(main.indexOf('function StoreRanking'), main.indexOf('function Merge'))

test('bottom nav is a full-width text bar: no icons, four text items', () => {
  assert.doesNotMatch(navBlock, /<Icon/)
  assert.match(navBlock, /className="mobile-bottom-nav"/)
  for (const label of ['世界', '造世', '书城', '合流']) {
    assert.match(navBlock, new RegExp(`label: "${label}"`))
  }
  // The reader still hides the bar entirely.
  assert.match(navBlock, /if \(view === "reader"\) return null/)
})

test('bottom nav CSS: edge-to-edge, hairline top border, type token size', () => {
  assert.match(css, /\.mobile-bottom-nav\{position:fixed;left:0;right:0;bottom:0;/)
  assert.match(css, /\.mobile-bottom-nav\{[^}]*border-top:1px solid var\(--line\)/)
  assert.match(css, /\.mobile-bottom-nav button\{[^}]*font-size:var\(--type-bottom-nav\)/)
  assert.match(css, /\.mobile-bottom-nav button\.active\{color:var\(--ink\);font-weight:700\}/)
  // The retired floating pill shape must not come back.
  assert.doesNotMatch(css, /\.mobile-bottom-nav\{[^}]*border-radius:26px/)
})

test('shelf is a wooden bookcase: planks, standing books, ribbons, printed titles', () => {
  // Structure: shelves chunked from the story list, books stand on a plank.
  assert.match(shelfBlock, /chunkShelves\(otherStories, capacity\)/)
  assert.match(shelfBlock, /className="wood-shelf"/)
  assert.match(shelfBlock, /className="wood-shelf-books"/)
  assert.match(shelfBlock, /className="wood-shelf-plank"/)
  assert.match(shelfBlock, /className="wood-book-cover"/)
  // The title is printed on the cover (face or vertical tag), never a card stack below it.
  assert.match(shelfBlock, /wood-book-face/)
  assert.match(shelfBlock, /wood-book-title-tag/)
  assert.match(shelfBlock, /coverTitleLayoutFor\(story\)/)
  assert.match(shelfBlock, /shelfMetaFor\(story\)/)
  // Status hangs from the cover top as a ribbon; tilt is seeded per book.
  assert.match(shelfBlock, /wood-book-ribbon \$\{ribbonKind\}/)
  assert.match(shelfBlock, /statusBadgeFor\(story\)/)
  assert.match(shelfBlock, /shelfTiltFor\(story\)/)
  // A partial last plank leans its final book; no filler books are invented.
  assert.match(shelfBlock, /is-leaning/)
  assert.doesNotMatch(shelfBlock, /加入书架|sw-shelf-grid|sw-shelf-card/)
  // Wood is CSS: plank faces, grain, posts and the book's plank shadow.
  assert.match(css, /\.wood-shelf-plank\{[^}]*linear-gradient\(180deg,#8a6844/)
  assert.match(css, /\.wood-shelf-plank::before\{[^}]*repeating-linear-gradient/)
  assert.match(css, /\.wood-shelf::before/)
  assert.match(css, /\.wood-book\{[^}]*rotate\(var\(--tilt/)
  assert.match(css, /\.wood-book-cover\{[^}]*aspect-ratio:3\/4/)
  assert.match(css, /\.wood-book-ribbon\{[^}]*writing-mode:vertical-rl[^}]*clip-path:polygon/)
  assert.match(css, /\.wood-book-spine\{/)
  assert.match(css, /\.wood-book\.is-pulled\{[^}]*translateY\(-14px\) scale\(1\.07\)/)
  assert.doesNotMatch(css, /\.sw-shelf-grid\{/)
  // DESIGN exempts the shelf from the grid type scale and documents it.
  assert.match(design, /书架（木质 2\.5D/)
  assert.match(design, /豁免于本网格字阶/)
})

test('store ranking card: real tabs, gold only on rank one, no invented heat', () => {
  assert.match(storeBlock, /className="rank-card"/)
  assert.match(storeBlock, />\s*推荐榜\s*</)
  assert.match(storeBlock, />\s*完本榜\s*</)
  assert.match(storeBlock, /rankStoreBooks\(books, \{ completeOnly: true \}\)/)
  assert.match(storeBlock, /rank-num \$\{index === 0 \? "gold" : ""\}/)
  assert.match(storeBlock, /rankMetaFor\(book\)/)
  assert.doesNotMatch(storeBlock, /热度|万人在读|评分/)
  assert.match(css, /\.rank-num\.gold\{color:var\(--rank-gold\)\}/)
  assert.match(css, /\.rank-tabs button\.active\{[^}]*font-size:var\(--type-rank-tab\)/)
  assert.match(css, /\.rank-cover\{[^}]*flex:0 0 56px[^}]*aspect-ratio:3\/4/)
})

test('store grid cards: badge on the cover, season/progress line, one meta line', () => {
  assert.match(storeBlock, /<span className="cover-badge">\{book\.type\}<\/span>/)
  assert.match(storeBlock, /className="book-cover-info"\>\{coverInfoFor\(book\.snapshot\)\}/)
  assert.match(storeBlock, /className="book-card-cat"/)
  assert.match(css, /\.book-card-copy\{[^}]*font-size:var\(--type-card-meta\)/)
  assert.match(css, /\.book-card-cat\{[^}]*color:var\(--cyan\)/)
  assert.match(css, /\.cover-badge\{[^}]*background:#fff[^}]*font-size:11px/)
})

test('filter chips follow the chip spec: accent text on tint when active', () => {
  assert.match(css, /\.store-filters button\{[^}]*font-size:var\(--type-chip\)/)
  assert.match(css, /\.store-filters button\.active\{color:var\(--cyan\);background:var\(--selected-surface\)/)
  assert.match(css, /\.store-heading h1\{font-size:var\(--type-page-tab\)/)
})

test('list type tokens live in :root and in the DESIGN contract', () => {
  for (const token of ['--type-page-tab', '--type-chip', '--type-rank-tab', '--type-card-title', '--type-card-meta', '--type-rank-num', '--type-cover-info', '--type-bottom-nav', '--rank-gold', '--radius-cover-list']) {
    assert.match(css, new RegExp(`${token}:`))
    assert.match(design, new RegExp(token.replace(/[-]/g, '\\-')))
  }
  assert.match(design, /底部导航为通栏文字式/)
  assert.match(design, /不许编造/)
})
