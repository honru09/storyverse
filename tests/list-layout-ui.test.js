import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const design = readFileSync(new URL('../DESIGN.md', import.meta.url), 'utf8')

const navBlock = main.slice(main.indexOf('function MobileBottomNav'), main.indexOf('function Home'))
const shelfBlock = main.slice(main.indexOf('function LibrarySwitcher'), main.indexOf('function Stepper'))
const storeBlock = main.slice(main.indexOf('function StoreBookCard'), main.indexOf('function PlazaAvatarThumb'))

test('bottom nav: four icon+label slots, the profile slot is a page tab (PROFILE-FIX §33)', () => {
  // The 2026-10-28 morning bar gave the last slot to 我的主页 as a face
  // entry; the same day's PROFILE-FIX order superseded it: a tab is a
  // place, not a person — four slots share ONE grammar (21px line icon
  // over an 11px label), 合流 stays out (contextual entries only), and
  // faces live on the profile itself and on author rows, never in the
  // navigation chrome.
  assert.match(navBlock, /className="mobile-bottom-nav"/)
  for (const label of ['广场', '造世', '书城']) {
    assert.match(navBlock, new RegExp(`label: "${label}"`))
  }
  for (const icon of ['spark', 'plus', 'book', 'user']) {
    assert.match(navBlock, new RegExp(`icon: "${icon}"|name="${icon}"`))
  }
  assert.doesNotMatch(navBlock, /label: "合流"/)
  assert.doesNotMatch(navBlock, /bottom-nav-profile/)
  assert.doesNotMatch(navBlock, /nav-face-frame/)
  assert.doesNotMatch(navBlock, /faceSrc/)
  assert.match(navBlock, /aria-label="我的主页"/)
  assert.match(navBlock, /<span>主页<\/span>/)
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
  // Structure: shelves chunked from the (F-24 filtered/sorted) story
  // list, books stand on a plank.
  assert.match(shelfBlock, /chunkShelves\(visibleStories, capacity\)/)
  assert.match(shelfBlock, /className="shelf-search"/)
  assert.match(shelfBlock, /className="shelf-sort"/)
  assert.match(shelfBlock, /className="wood-shelf"/)
  assert.match(shelfBlock, /className="wood-shelf-books"/)
  assert.match(shelfBlock, /className="wood-shelf-plank"/)
  assert.match(shelfBlock, /className="wood-book-cover"/)
  // The title is printed on the cover (face or vertical tag), never a card stack below it.
  assert.match(shelfBlock, /wood-book-face/)
  assert.match(shelfBlock, /wood-book-title-tag/)
  assert.match(shelfBlock, /coverTitleLayoutFor\(story\)/)
  assert.match(shelfBlock, /shelfMetaFor\(story\)/)
  // Status hangs from the cover top as a ribbon.
  assert.match(shelfBlock, /wood-book-ribbon \$\{ribbonKind\}/)
  assert.match(shelfBlock, /statusBadgeFor\(story\)/)
  // DEVICE-FIX REQ-20: books stand straight — no seeded tilt is passed,
  // no leaning book exists, and no filler books are invented.
  assert.doesNotMatch(shelfBlock, /shelfTiltFor|is-leaning|--tilt/)
  assert.doesNotMatch(shelfBlock, /加入书架|sw-shelf-grid|sw-shelf-card/)
  // Wood is CSS: plank faces, grain, posts and the book's plank shadow.
  assert.match(css, /\.wood-shelf-plank\{[^}]*linear-gradient\(180deg,#8a6844/)
  assert.match(css, /\.wood-shelf-plank::before\{[^}]*repeating-linear-gradient/)
  assert.match(css, /\.wood-shelf::before/)
  assert.doesNotMatch(css, /--tilt|is-leaning/)
  // The action row keeps clear air above the plank (REQ-20).
  assert.match(css, /\.wood-shelf-books\{[^}]*padding:0 6px 8px/)
  assert.match(css, /\.wood-book-cover\{[^}]*aspect-ratio:3\/4/)
  assert.match(css, /\.wood-book-ribbon\{[^}]*writing-mode:vertical-rl[^}]*clip-path:polygon/)
  assert.match(css, /\.wood-book-spine\{/)
  assert.match(css, /\.wood-book\.is-pulled\{[^}]*translateY\(-14px\) scale\(1\.04\)/) // SALT §51: pull scale trimmed 1.07 → 1.04
  assert.doesNotMatch(css, /\.sw-shelf-grid\{/)
  // BH-14 (2026-10-29): a cell is one natural book slot (the capacity
  // share of the row), never flex-grown — a lone book must not balloon
  // to the 190px cap; fuse/delete sit in an in-flow action row under
  // the cover instead of absolute pills over the face meta line.
  assert.match(shelfBlock, /--shelf-cap/)
  assert.match(shelfBlock, /className="wood-book-actions"/)
  assert.match(css, /\.wood-book-cell\{[^}]*var\(--shelf-cap,3\)/)
  assert.doesNotMatch(css, /\.wood-book-fuse\{position:absolute/)
  assert.doesNotMatch(css, /\.wood-book-delete\{position:absolute/)
  // DESIGN exempts the shelf from the grid type scale and documents it.
  assert.match(design, /书架（木质 2\.5D/)
  assert.match(design, /豁免于本网格字阶/)
})

test('store sorts ride the server: latest / hot / completed, heat is real engagement only (BOOKSTORE-PLAZA)', () => {
  // The shelf is the server's catalogue now: family shelves, a title
  // search and three sorts — 热门 counts real shares and post likes
  // server-side; the client never ranks or invents heat locally.
  assert.match(storeBlock, /fetchStoreBooks\(\{ shelfId: shelf, kind, sort, q: debouncedQuery, limit: 60 \}\)/)
  assert.match(storeBlock, /label: "最新上架"/)
  assert.match(storeBlock, /label: "热门"/)
  assert.match(storeBlock, /label: "完本"/)
  assert.match(storeBlock, /GENRE_SHELVES/)
  assert.match(storeBlock, /className="store-search"/)
  assert.doesNotMatch(storeBlock, /万人在读|rankStoreBooks/)
  // User rule 2026-10-30 15:54: the share count is detail-page data;
  // the store card never prints it (热门 heat still counts it server-side).
  assert.doesNotMatch(storeBlock, /book\.shareCount/, 'the card prints no share count')
})

test('store grid cards: bare cover, title heads the body, status in the footer (BOOKSTORE-PLAZA)', () => {
  // User rules 2026-10-30 15:54 + 16:10 (STORE-DESIGN v2/v3): the
  // cover carries nothing; the title is the body's first row; the
  // status rides the footer line with the length; no intro, no chips.
  assert.match(storeBlock, /className="store-slot store-slot-title"/)
  assert.match(storeBlock, /className="store-book-title"/)
  assert.match(storeBlock, /lengthLine/)
  assert.match(storeBlock, /className="store-slot store-slot-name"/)
  assert.doesNotMatch(storeBlock, /className="store-card-status"/)
  assert.doesNotMatch(storeBlock, /plaza-cover-title/)
  assert.doesNotMatch(storeBlock, /className="store-book-intro"/)
  assert.match(css, /\.store-grid\{display:grid/)
  assert.match(css, /\.store-meta-block\{margin-top:auto/)
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
