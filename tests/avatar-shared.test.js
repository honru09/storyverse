import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AVATAR_APPEARANCE_FIELDS,
  AVATAR_PRESETS,
  avatarAppearancePrompt,
  avatarAppearanceText,
  avatarJourneys,
  avatarPortraitState,
  normalizeAppearance,
  validateAvatarProfile,
} from '../src/avatar.js'

test('validateAvatarProfile requires a name and bounds the text', () => {
  assert.match(validateAvatarProfile({}).error, /名字/)
  assert.match(validateAvatarProfile({ name: '   ' }).error, /名字/)
  assert.match(validateAvatarProfile('nope').error, /格式/)
  const { profile, error } = validateAvatarProfile({
    name: '  林晚舟  ',
    description: 'x'.repeat(500),
    appearance: { hairColor: 'silver' },
  })
  assert.equal(error, undefined)
  assert.equal(profile.name, '林晚舟')
  assert.equal(profile.description.length, 300)
  assert.equal(profile.appearance.hairColor, 'silver')
})

test('normalizeAppearance keeps unpicked fields unspecified and rejects non-objects (FINAL-FIX R-07)', () => {
  // Policy change, pinned deliberately: unpicked and unknown ids used
  // to fall back to a baked-in default look (black / long-straight /
  // coat / boots), which then outranked the reader's own written
  // description in the portrait prompt — the R-07 field failure. They
  // now normalise to null = unspecified, and only an explicit pick
  // produces a descriptor.
  assert.equal(normalizeAppearance(null), null)
  assert.equal(normalizeAppearance('look'), null)
  const look = normalizeAppearance({ hairColor: 'not-a-color', hairStyle: 'ponytail', faceNote: 'y'.repeat(90) })
  assert.equal(look.hairColor, null, 'an unknown id is unspecified, never a silent default')
  assert.equal(look.hairStyle, 'ponytail')
  assert.equal(look.faceNote.length, 60)
  const blank = normalizeAppearance({})
  assert.deepEqual(
    [blank.hairColor, blank.hairStyle, blank.outfit, blank.shoes, blank.face],
    [null, null, null, null, null],
    'a profile with nothing picked carries no look at all',
  )
})

test('avatarAppearanceText composes the Chinese look line from real picks only', () => {
  const text = avatarAppearanceText({ hairColor: 'silver', hairStyle: 'short', outfit: 'modern-street', shoes: 'sneakers', face: 'freckles', faceNote: '左耳有痣' })
  assert.equal(text, '银灰，利落短发，现代街头，运动鞋，雀斑，左耳有痣')
  const plain = avatarAppearanceText({ hairColor: 'black', hairStyle: 'long-straight', outfit: 'coat', shoes: 'boots', face: 'none', faceNote: '' })
  assert.ok(!plain.includes('无特别标记'), 'the none face pick contributes nothing')
})

test('unpicked parts contribute nothing to the look line or the prompt (FINAL-FIX R-07)', () => {
  // The field case: a description that says 短发 with only the hair
  // colour picked must not grow long-straight hair, a coat and boots
  // out of untouched defaults.
  assert.equal(avatarAppearanceText({ hairStyle: 'short' }), '利落短发')
  assert.equal(avatarAppearanceText({}), '')
  assert.equal(avatarAppearanceText(null), '')
  assert.equal(avatarAppearancePrompt({}), '')
  assert.equal(avatarAppearancePrompt(null), '')
  const prompt = avatarAppearancePrompt({ hairStyle: 'short' })
  assert.match(prompt, /short hair/)
  assert.ok(!/long straight|long coat|boots/.test(prompt), 'no default garment leaks into the prompt')
  // A profile saved WITHOUT an appearance payload validates to an
  // all-unspecified look instead of the old defaults.
  const { profile, error } = validateAvatarProfile({ name: '只写描述的人', description: '短发，穿旧夹克。' })
  assert.equal(error, undefined)
  assert.equal(profile.appearance.hairStyle, null)
  assert.equal(avatarAppearanceText(profile.appearance), '')
})

test('avatarAppearancePrompt paints English fragments and skips the empty face', () => {
  const prompt = avatarAppearancePrompt({ hairColor: 'silver', hairStyle: 'short', outfit: 'modern-street', shoes: 'sneakers', face: 'none', faceNote: '' })
  assert.match(prompt, /silver-grey hair/)
  assert.match(prompt, /streetwear/)
  assert.ok(!prompt.includes('undefined'))
  const faced = avatarAppearancePrompt({ hairColor: 'black', hairStyle: 'bun', outfit: 'scholar', shoes: 'cloth-shoes', face: 'glasses', faceNote: '' })
  assert.match(faced, /glasses/)
})

test('every preset is a valid, distinct, fully-specified avatar', () => {
  assert.equal(AVATAR_PRESETS.length, 3)
  const names = new Set()
  for (const preset of AVATAR_PRESETS) {
    const { profile, error } = validateAvatarProfile(preset)
    assert.equal(error, undefined, preset.id)
    names.add(profile.name)
    for (const field of AVATAR_APPEARANCE_FIELDS) {
      assert.ok(field.options.some((item) => item.id === preset.appearance[field.key]), `${preset.id}.${field.key}`)
    }
    assert.ok(avatarAppearanceText(preset.appearance).length > 0)
  }
  assert.equal(names.size, 3)
})

test('avatarPortraitState normalises absent and malformed portrait fields', () => {
  assert.deepEqual(avatarPortraitState(null), { status: 'none', version: 0, hasPrevious: false })
  assert.deepEqual(avatarPortraitState({ portrait: { status: 'ready', version: 2, hasPrevious: true } }), { status: 'ready', version: 2, hasPrevious: true })
  assert.equal(avatarPortraitState({ portrait: { status: 'weird', version: -1 } }).status, 'none')
})

test('avatarJourneys derives rows from own and merged stories only', () => {
  const avatar = { id: 'avatar-1' }
  const stories = [
    { id: 's1', title: '甲', genreId: 'mist', kind: 'solo', chapters: [{}, {}], config: { avatarId: 'avatar-1' }, updatedAt: '2026-10-27T00:00:00.000Z' },
    { id: 's2', title: '乙', genreId: 'neon', kind: 'solo', chapters: [], config: { avatarId: 'avatar-2' } },
    { id: 's3', title: '合流：丙', genreId: 'mist', kind: 'merged', chapters: [{}], config: { avatarId: '', protagonists: [{ avatarId: '' }, { avatarId: 'avatar-1' }] } },
    { id: 's4', title: '丁', genreId: 'mist', kind: 'solo', chapters: [], config: {} },
  ]
  const rows = avatarJourneys(avatar, stories)
  assert.deepEqual(rows.map((row) => row.storyId), ['s1', 's3'])
  assert.equal(rows[0].chapters, 2)
  assert.equal(rows[0].viaMerge, false)
  assert.equal(rows[1].viaMerge, true)
  assert.equal(rows[1].kind, 'merged')
  assert.deepEqual(avatarJourneys(null, stories), [])
  assert.deepEqual(avatarJourneys(avatar, null), [])
})
