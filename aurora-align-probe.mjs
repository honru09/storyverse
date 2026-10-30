// AURORA-ALIGN computed probe: feeds the CURRENT src/styles.css into a
// headless page with representative shell DOM and reads back the real
// cascade for aurora (and black, as a no-regression control). Prints
// JSON to stdout only — no file writes (sandbox write policy).
import fs from 'node:fs'
import { chromium } from 'playwright'

const css = fs.readFileSync(new URL('./src/styles.css', import.meta.url), 'utf8')
const exe = process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'

const DOM = `
<div class="salt-ambient"></div>
<header class="topbar" id="p-topbar"></header>
<main class="page" id="p-page">
  <div class="plaza-feed-heading"><h2 id="p-feedh">最新动态</h2></div>
  <div class="section-heading"><h2 id="p-sech">分区</h2></div>
  <article class="plaza-card" id="p-card"></article>
  <section class="plaza-panel" id="p-panel"></section>
  <button class="plaza-continue-card" id="p-continue"></button>
  <span class="plaza-chip" id="p-chip">玄幻</span>
</main>
<div class="page page-plaza" id="p-detailpage">
  <div class="detail-ambience" id="p-amb"><div class="world-art" id="p-ambart"></div></div>
  <section class="plaza-panel" id="p-detailpanel"></section>
</div>
<div class="page-profile"><button class="profile-store-card" id="p-profstore"></button></div>
<article class="store-book-card" id="p-storecard"></article>
<div class="sw-dialog" id="p-dialog"></div>
<nav class="mobile-bottom-nav" id="p-nav"></nav>`

const PROBES = {
  ambient: ['#p-amb', ['display']],
  saltAmbient: ['.salt-ambient', ['display', 'backgroundImage']],
  topbar: ['#p-topbar', ['backgroundColor', 'boxShadow']],
  feedHeading: ['#p-feedh', ['fontSize', 'lineHeight', 'letterSpacing', 'color']],
  sectionHeading: ['#p-sech', ['fontSize', 'letterSpacing', 'color']],
  card: ['#p-card', ['backgroundColor', 'borderRadius', 'borderTopColor', 'boxShadow']],
  panel: ['#p-panel', ['backgroundColor', 'borderRadius']],
  continueCard: ['#p-continue', ['backgroundColor', 'borderRadius']],
  chip: ['#p-chip', ['backgroundColor']],
  page: ['#p-page', ['paddingBottom']],
  detailAmbience: ['#p-amb', ['display', 'height']],
  detailArt: ['#p-ambart', ['opacity', 'filter']],
  detailPanel: ['#p-detailpanel', ['backgroundColor']],
  profileStoreCard: ['#p-profstore', ['backgroundColor', 'borderRadius', 'boxShadow']],
  storeCard: ['#p-storecard', ['backgroundColor']],
  dialog: ['#p-dialog', ['backgroundColor']],
  nav: ['#p-nav', ['backgroundColor', 'borderRadius', 'left', 'right', 'width', 'position']],
}

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${DOM}</body></html>`)
const out = {}
for (const theme of ['aurora', 'black']) {
  await page.evaluate((t) => { document.documentElement.dataset.shellTheme = t }, theme)
  out[theme] = await page.evaluate((probes) => {
    const res = {}
    for (const [name, [sel, props]] of Object.entries(probes)) {
      const el = document.querySelector(sel)
      if (!el) { res[name] = null; continue }
      const cs = getComputedStyle(el)
      res[name] = Object.fromEntries(props.map((p) => [p, cs[p]]))
    }
    const panel = document.querySelector('#p-detailpanel')
    res.detailPanelPad = getComputedStyle(panel, '::before').backgroundColor
    return res
  }, PROBES)
}
// lite-GPU fallback state under aurora: nav/topbar lose blur, faces stay token-driven
await page.evaluate(() => { document.documentElement.dataset.shellTheme = 'aurora'; document.documentElement.classList.add('is-lite-gpu') })
out.auroraLite = await page.evaluate(() => {
  const nav = getComputedStyle(document.querySelector('#p-nav'))
  const card = getComputedStyle(document.querySelector('#p-card'))
  return { navBg: nav.backgroundColor, navRadius: nav.borderRadius, cardBg: card.backgroundColor, cardRadius: card.borderRadius, cardShadow: card.boxShadow }
})
await browser.close()
console.log(JSON.stringify(out, null, 1))
