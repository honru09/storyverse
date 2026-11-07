import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

// Daily bug-hunt 2026-10-31: guard assertions for this round's fixes.
// Each test names the bug so a future regression reads as the bug returning.
// (Yesterday's leftover candidates C3/C4 were re-checked on the 0a02800
// base and found already fixed by the REQ-63 title-length batch — they
// are NOT re-reported here.)

test('bughunt-1: plaza post edit cannot promise 600 chars against the 500-char server limit', () => {
  const editAt = main.indexOf('plaza-post-edit-input')
  const block = main.slice(editAt, main.indexOf('plaza-post-content', editAt))
  assert.doesNotMatch(block, /maxLength=\{600\}/)
  assert.match(block, /is-over/)
  assert.match(block, /\[\.\.\.draft\]\.length > 500/)
})

test('bughunt-2: forge confirm step collapses the empty preview column on desktop', () => {
  assert.match(main, /forge-layout\$\{step === 5 \? " is-confirm" : ""\}/)
  assert.match(css, /\.forge-layout\.is-confirm\{grid-template-columns:minmax\(0,1fr\)\}/)
})

test('bughunt-3: edit and share sheets close on Escape and overlay tap, lock scroll, restore focus', () => {
  // BUGHUNT-20261106: the edit sheet's backdrop tap now routes through
  // closeTopLayer (crop step first, sheet second) instead of calling
  // onClose() directly — the close itself is unchanged, so both forms
  // count here; the crop-first order is pinned by bughunt-20261106 #5.
  const overlays = main.match(/event\.target === event\.currentTarget\) (onClose|closeTopLayer)\(\)/g) || []
  assert.equal(overlays.length, 2, 'both profile sheets need the backdrop-tap close')
  assert.match(main, /document\.body\.style\.overflow = "hidden"/)
  assert.match(main, /event\.stopPropagation\(\)/)
  assert.match(main, /trigger\?\.isConnected/)
})

test('bughunt-4: a failed sign-out says so instead of silently returning to idle', () => {
  assert.match(main, /setSignOutError\("退出没能完成/)
  assert.match(main, /signOutError && <p/)
})

test('bughunt-5: a failed fusion-permission read never presents the "free" default as loaded', () => {
  assert.match(main, /fusionLoadFailed/)
  assert.match(main, /合流权限没能读取/)
  assert.match(main, /setFusionRetry\(\(value\) => value \+ 1\)/)
  assert.match(main, /fusionPermission === option\.id && !fusionLoadFailed/)
})

test('bughunt-6: the email-code button stays disabled with an empty mailbox', () => {
  const panel = readFileSync(new URL('../src/components/AccountPanel.jsx', import.meta.url), 'utf8')
  assert.match(panel, /cooldown > 0 \|\| !identifier\) return/)
  assert.match(panel, /disabled=\{busy \|\| !codeAvailable \|\| cooldown > 0 \|\| !identifier\}/)
})

test('bughunt-7: god-mode world-name counter counts the 12-unit clip budget, not 40', () => {
  assert.match(main, /textUnitsFor\(draft\.customWorldName \|\| ""\)\} \/ 12/)
  assert.match(main, /名字 \{textUnitsFor\(worldDraftName \|\| ""\)\} \/ 12/)
  assert.doesNotMatch(main, /draft\.customWorldName \|\| ""\)\.length\} \/ \{CUSTOM_WORLD_NAME_MAX\}/)
})

test('bughunt-8: detail avatar panel text column shrinks like the source rows already do', () => {
  assert.match(css, /\.plaza-avatar-panel>div\{min-width:0;flex:1\}/)
  assert.match(css, /\.plaza-avatar-panel strong,.plaza-avatar-panel small\{overflow-wrap:anywhere\}/)
})

test('bughunt-9: deleting a rating asks first and confirms success', () => {
  assert.match(main, /confirmingRemove/)
  assert.match(main, /确认删除/)
  assert.match(main, /你的评价已删除。/)
})

test('bughunt-10: reader chrome Next mirrors the chapter-end preparing state', () => {
  assert.match(main, /disabled=\{isFinal \|\| \(readOnly && !nextAvailable\) \|\| \(!readOnly && preparing && !nextAvailable\)\}/)
  // BUGHUNT-20261107: the chapter-end button also flips to "重试下一章"
  // on generationError, and the chrome button now mirrors that third
  // branch too — the guard's intent (chrome mirrors chapter-end) is
  // unchanged, only the literal it pins grew by the retry branch.
  assert.match(main, /preparing && !nextAvailable \? "下一章准备中…" : generationError && !nextAvailable \? "重试下一章" : "下一章"/)
})
