import test from 'node:test'
import assert from 'node:assert/strict'
import { formatTokenCount } from '../src/usage-format.js'

test('token counts are exact below ten thousand and use 万 above it', () => {
  assert.equal(formatTokenCount(0), '0')
  assert.equal(formatTokenCount(999), '999')
  assert.equal(formatTokenCount(1234), '1,234')
  assert.equal(formatTokenCount(9999), '9,999')
  assert.equal(formatTokenCount(10_000), '1 万')
  assert.equal(formatTokenCount(25_000), '2.5 万')
  assert.equal(formatTokenCount(1_234_567), '123.46 万')
  assert.equal(formatTokenCount(12_345_678), '1,234.57 万')
})

test('token counts never render junk input as a number', () => {
  assert.equal(formatTokenCount(undefined), '0')
  assert.equal(formatTokenCount(null), '0')
  assert.equal(formatTokenCount(-50), '0')
  assert.equal(formatTokenCount(Number.NaN), '0')
  assert.equal(formatTokenCount('9000'), '0')
})
