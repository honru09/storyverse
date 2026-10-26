import test from 'node:test'
import assert from 'node:assert/strict'
import { findSettingViolation } from '../src/setting-guard.js'

test('sexual content involving minors is refused with a clear reason', () => {
  const reason = findSettingViolation('设定：一个初中生在夜里遭遇性侵，故事围绕这件事展开。')
  assert.ok(reason && reason.includes('未成年人'))
  assert.ok(findSettingViolation('未满14岁的孩子被卷入色情交易。'))
})

test('fabricated dirt about a real person is refused', () => {
  const reason = findSettingViolation('以真人为原型写故事，编造他出轨和贪污受贿的丑闻，让他身败名裂。')
  assert.ok(reason && reason.includes('真实人物'))
})

test('ordinary creative settings pass untouched', () => {
  const passing = [
    '海水每晚倒流一小时，倒流时死者会回到岸边说一句话。镇上的人靠替亡者传话为生。',
    '小学生放学后去河边踢球，初中生在图书馆准备考试。',
    '真人真事改编的商战故事：反派因贪污入狱，主角靠一本旧账翻盘。',
    '校园恋爱故事：高中生们在操场和教室之间追逐各自的梦想。',
    '宗门长老定下规则：午夜之后不许出门，违者逐出师门。',
    '',
  ]
  for (const text of passing) assert.equal(findSettingViolation(text), null, text)
  assert.equal(findSettingViolation(undefined), null)
  assert.equal(findSettingViolation(42), null)
})
