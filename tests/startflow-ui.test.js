import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { GENRES, GENRE_TEMPLATES } from '../src/story-engine.js'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const artwork = readFileSync(new URL('../src/components/WorldArtwork.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

test('start flow step one is a template brick wall with a stage picker', () => {
  assert.match(main, /想写哪种故事？/)
  assert.match(main, /className="template-wall"/)
  assert.match(main, /className="stage-chips"/)
  assert.match(main, /故事舞台/)
  assert.doesNotMatch(main, /world-grid|WorldCard/)
})

test('the brick wall covers every genre template exactly once', () => {
  const orderBlock = main.match(/const TEMPLATE_WALL_ORDER = \[([\s\S]*?)\];/)
  assert.ok(orderBlock, 'wall order constant exists')
  const ids = [...orderBlock[1].matchAll(/"([a-z-]+)"/g)].map((match) => match[1])
  assert.deepEqual([...ids].sort(), GENRE_TEMPLATES.map((template) => template.id).sort())
})

test('picking a template re-points the stage; picking a stage keeps an explicit template', () => {
  assert.match(main, /set\(\{ genreTemplateId: item\.id, genreId: item\.worldId \}\)/)
  assert.match(main, /templateTouched/)
  assert.match(main, /recommendedTemplateFor\(genreId\)/)
})

test('every world has shipping artwork wired into WorldArtwork', () => {
  for (const genre of GENRES) assert.ok(artwork.includes(`"${genre.id}"`), genre.id)
  assert.match(styles, /\.template-wall\{/)
  assert.match(styles, /\.template-brick\.selected/)
  assert.match(styles, /\.stage-chip\.selected/)
})
