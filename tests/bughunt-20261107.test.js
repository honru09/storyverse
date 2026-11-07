import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/components/AccountPanel.jsx', import.meta.url), 'utf8')
const prefs = readFileSync(new URL('../src/components/ReadingPreferences.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

// Daily bug-hunt 2026-11-07: guard assertions for this round's fixes.
// Base: origin/main 89927f4 (bughunt-20261106 already merged).
// Lanes: audit A verifies the 11-06 leftovers (1–8); audit B fresh
// scan (9–12). None duplicates the 20261030–20261106 lists.

test('bughunt-1: an in-between font rung highlights its nearest size preset', () => {
  // The stepper has six rungs, the presets four — 1.125/1.375 used to
  // leave every preset unselected. The preset group now checks the
  // nearest preset (ties fall to the smaller one).
  assert.match(prefs, /nearestPresetSize/)
  assert.match(prefs, /checked=\{nearestPresetSize === size\}/)
  assert.match(prefs, /Math\.abs\(preset\.value - settings\.fontScale\)/)
})

test('bughunt-2: the chrome next-chapter button flips to retry on generation error', () => {
  const at = main.indexOf('BUGHUNT-20261107: the chapter-end button also')
  assert.ok(at > 0)
  const button = main.slice(at, main.indexOf('</button>', at))
  assert.match(button, /generationError && !nextAvailable \? "重试下一章"/)
})

test('bughunt-3: tapping the same inspiration fragment twice does not append it twice', () => {
  const at = main.indexOf('const appendFragment')
  const fn = main.slice(at, main.indexOf('const [rolled', at))
  assert.match(fn, /这条碎片已经加过了/)
  assert.match(fn, /split\(\/\[。！？\]\/\)/)
})

test('bughunt-4: every capped long-text box shows its x / N count', () => {
  // Forge: name, persona, trait, five life fields, custom ability,
  // custom genre, two spawn-point names, spawn hook.
  for (const [field, count] of [
    ['draft.name', '/ 40'], ['draft.persona', 'PERSONA_MAX'],
    ['draft.trait', '/ 80'], ['draft.hometown', '/ 80'],
    ['draft.school', '/ 80'], ['draft.role', '/ 80'],
    ['draft.company', '/ 80'], ['draft.friend', '/ 40'],
    ['customAbility', '/ 40'], ['customGenreInput', 'CUSTOM_GENRE_TEXT_MAX'],
    ['draft.startPointName', 'START_POINT_NAME_MAX'],
    ['draft.startPointHook', 'START_POINT_HOOK_MAX'],
  ]) {
    assert.ok(main.includes(`[...(${field} || "")].length`), `${field} has a counter`)
    assert.ok(main.includes(count), `${field} counts against ${count}`)
  }
  // Enter-with-avatar custom ability, manual-book synopsis, card
  // preview name/persona, settings synopsis/intro trio, premise,
  // rules, ending anchor, lore name/content, write-desk chapter title.
  for (const field of [
    'enterCustomAbility', 'cardPreview.name', 'cardPreview.persona',
    'premise', 'endingAnchor', 'entry.name', 'entry.content', 'draftTitle',
  ]) {
    assert.ok(main.includes(`[...(${field} || "")].length`), `${field} has a counter`)
  }
  assert.match(main, /introBackground.*INTRO_BACKGROUND_MAX/s)
  assert.match(main, /introRulesText.*INTRO_RULES_MAX \* \(INTRO_RULE_MAX \+ 1\)/s)
  assert.match(main, /introThread.*INTRO_THREAD_MAX/s)
  assert.match(main, /\[...\(rule \|\| ""\)\]\.length\} \/ 600/)
  // The rules row wraps so its counter lands on its own line.
  assert.match(styles, /\.settings-rule-row\{display:flex;flex-wrap:wrap/)
  assert.match(styles, /\.settings-rule-row \.da-unit-count\{flex-basis:100%\}/)
})

test('bughunt-5: the shelf search matches case-insensitively, list and finale claim alike', () => {
  assert.match(main, /const q = shelfQuery\.trim\(\)\.toLowerCase\(\)/)
  assert.match(main, /const query = shelfQuery\.trim\(\)\.toLowerCase\(\)/)
  assert.match(main, /story\.title\.toLowerCase\(\)\.includes\(q\)/)
  assert.match(main, /story\.title\.toLowerCase\(\)\.includes\(query\)/)
})

test('bughunt-6: following/unfollowing from the connections list says so in words', () => {
  const at = main.indexOf('const toggleConnectionFollow')
  const fn = main.slice(at, main.indexOf('const profileUrl', at))
  assert.match(fn, /setNote\(result\.following \? "已关注。" : "已取消关注。"\)/)
})

test('bughunt-7: the first-claim @ID box shows its x / 20 count', () => {
  assert.match(main, /\{handle\.length\} \/ 20/)
})

test('bughunt-8: signing out clears the send-code cooldown', () => {
  const at = panel.indexOf('if (hadUser.current)')
  const effect = panel.slice(at, panel.indexOf('}, [account.user])', at))
  assert.match(effect, /setCooldown\(0\)/)
})

test('bughunt-9: the settings table-of-contents editor caps titles at 30 with a count', () => {
  const at = main.indexOf('function StorySettingsBook')
  const sheet = main.slice(at, main.indexOf('function Reader({', at))
  const inputAt = sheet.indexOf('value={tocTitles[position] ?? ""}')
  assert.ok(inputAt > 0)
  const input = sheet.slice(inputAt, inputAt + 400)
  assert.match(input, /maxLength=\{CHAPTER_TITLE_MAX\}/)
  assert.match(sheet, /\(tocTitles\[position\] \?\? ""\)\.trim\(\)\.length\} \/ \{CHAPTER_TITLE_MAX\}/)
})

test('bughunt-10: deleting or moving a desk chapter follows the selected chapter, draft included', () => {
  // The editor used to keep pointing at the old index, so the next
  // autosave overwrote the neighbour chapter now sitting there.
  const deskAt = main.indexOf('function WriteDesk')
  const desk = main.slice(deskAt, main.indexOf('function Reader({', deskAt))
  assert.match(desk, /const bookWithDraft = \(\) =>/)
  const delAt = desk.indexOf('const deleteChapter')
  const del = desk.slice(delAt, desk.indexOf('const moveChapter', delAt))
  assert.match(del, /bookWithDraft\(\)/)
  assert.match(del, /loadChapter\(next, newSelected\)/)
  assert.match(del, /index < wasSelected\s*\n?\s*\? wasSelected - 1/)
  const movAt = desk.indexOf('const moveChapter')
  const mov = desk.slice(movAt, desk.indexOf('const finishBook', movAt))
  assert.match(mov, /bookWithDraft\(\)/)
  assert.match(mov, /loadChapter\(next, newSelected\)/)
  assert.match(mov, /wasSelected === index\) newSelected = target/)
})

test('bughunt-11: a failed prose save keeps the editor open with the error inside it', () => {
  const at = main.indexOf('const saveProse')
  const fn = main.slice(at, main.indexOf('// 介入：', at))
  assert.match(fn, /return "这一章已经定稿，不能再改了。"/)
  assert.match(fn, /return failure\.message \|\| "正文没能保存。"/)
  assert.doesNotMatch(fn, /catch \(failure\) \{\s*\n?\s*setProseOpen\(false\)/)
  const editorAt = main.indexOf('function ProseEditor')
  const editor = main.slice(editorAt, main.indexOf('function StorySettingsBook', editorAt))
  assert.match(editor, /const failure = onSave\(cleaned\);/)
  assert.match(editor, /if \(failure\) setError\(failure\);/)
})

test('bughunt-12: a lorebook entry with a name but no content blocks the save instead of vanishing', () => {
  const at = main.indexOf('function StorySettingsBook')
  const sheet = main.slice(at, main.indexOf('function Reader({', at))
  assert.match(sheet, /loreError/)
  assert.match(sheet, /还没有写内容，写上内容或删掉这条再保存/)
  assert.match(sheet, /findIndex\(\(entry\) => !\(entry\.content \|\| ""\)\.trim\(\)/)
})
