import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AVATAR_PRESETS,
  avatarAppearanceText,
  avatarJourneys,
  avatarPortraitState,
  validateAvatarProfile,
} from '../src/avatar.js'

test('validateAvatarProfile requires a name and bounds the text', () => {
  assert.match(validateAvatarProfile({}).error, /名字/)
  assert.match(validateAvatarProfile({ name: '   ' }).error, /名字/)
  assert.match(validateAvatarProfile('nope').error, /格式/)
  const { profile, error } = validateAvatarProfile({
    name: '  林晚舟  ',
    description: 'x'.repeat(500),
  })
  assert.equal(error, undefined)
  assert.equal(profile.name, '林晚舟')
  assert.equal(profile.description.length, 300)
})

test('validateAvatarProfile ignores a parts payload entirely (AVATAR-TRIM)', () => {
  // Per-part personalisation is offline: a caller still sending the
  // old appearance object gets a profile with no appearance key at
  // all, so parts can neither persist from a fresh save nor render.
  const { profile, error } = validateAvatarProfile({
    name: '沈砚',
    description: '清冷安静的剑客。',
    appearance: { hairColor: 'silver', hairStyle: 'ponytail', outfit: 'street-jacket', shoes: 'sneakers', face: 'scar', faceNote: 'note' },
  })
  assert.equal(error, undefined)
  assert.equal('appearance' in profile, false)
})

test('avatarAppearanceText is the written description, folded and clipped', () => {
  assert.equal(avatarAppearanceText({ name: '沈砚', description: '银灰短发，\n穿旧夹克。' }), '银灰短发， 穿旧夹克。')
  assert.equal(avatarAppearanceText({ name: '沈砚', description: '' }), '')
  assert.equal(avatarAppearanceText({ name: '沈砚' }), '')
  assert.equal(avatarAppearanceText(null), '')
  assert.equal(avatarAppearanceText({ name: '沈砚', description: 'x'.repeat(400) }).length, 300)
})

test('avatarAppearanceText never resurrects stored parts (AVATAR-TRIM)', () => {
  // A legacy record still carrying the old appearance object: the
  // look line in pickers and story configs comes from the description
  // alone — the stored parts stay inert.
  const legacy = {
    name: '沈砚',
    description: '从山里走出来的年轻人，话少，手稳。',
    appearance: { hairColor: 'silver', hairStyle: 'ponytail', outfit: 'street-jacket', shoes: 'sneakers', face: 'scar', faceNote: '左眉一道疤' },
  }
  assert.equal(avatarAppearanceText(legacy), '从山里走出来的年轻人，话少，手稳。')
})

test('every preset is a valid, distinct, described avatar', () => {
  assert.equal(AVATAR_PRESETS.length, 3)
  const names = new Set()
  for (const preset of AVATAR_PRESETS) {
    const { profile, error } = validateAvatarProfile(preset)
    assert.equal(error, undefined, preset.id)
    names.add(profile.name)
    assert.ok(preset.description.length > 0, `${preset.id} needs a written description`)
    assert.equal(avatarAppearanceText(preset), preset.description)
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
