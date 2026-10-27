import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { identifierKind } from '../src/auth/identifier.js'

const panel = readFileSync(new URL('../src/components/AccountPanel.jsx', import.meta.url), 'utf8')

test('identifier routing: an "@" shape is the email channel, anything else the username channel', () => {
  assert.equal(identifierKind('reader@example.com'), 'email')
  assert.equal(identifierKind('a@b'), 'email')
  assert.equal(identifierKind('reader_01'), 'username')
  assert.equal(identifierKind('Reader.One'), 'username')
  // Empty / non-string input is not an email shape; the form layer stops an
  // empty submit before any channel is called.
  assert.equal(identifierKind(''), 'username')
  assert.equal(identifierKind('   '), 'username')
  assert.equal(identifierKind(undefined), 'username')
  assert.equal(identifierKind(null), 'username')
})

test('login panel has no standalone username tab any more', () => {
  assert.doesNotMatch(panel, /changeMode\("username"\)/)
  assert.doesNotMatch(panel, /activeMode === "username"/)
  assert.doesNotMatch(panel, /用户名登录或注册/)
  assert.doesNotMatch(panel, /usernameRegister/)
  // The mode row is back to login / register (plus the code tab when its
  // switch is on, which keeps its existing mount point).
  assert.match(panel, />登录<\/button>/)
  assert.match(panel, />注册<\/button>/)
  assert.match(panel, /codeAvailable && <button type="button" aria-pressed=\{activeMode === "code"\}/)
})

test('login panel account field is fused: one input labelled 邮箱或用户名', () => {
  assert.match(panel, /<label>邮箱或用户名<input type="text" name="account"/)
  assert.match(panel, /placeholder="邮箱或用户名"/)
  // The standalone username-only field and its separate password block are gone.
  assert.doesNotMatch(panel, /name="username"/)
  assert.doesNotMatch(panel, /placeholder="字母、数字、下划线或点"/)
  // Code and reset modes keep their email-only field on the same input state.
  assert.match(panel, /activeMode === "code" \|\| activeMode === "reset"/)
})

test('panel submit routes by identifier shape to the two password channels', () => {
  assert.match(panel, /identifierKind\(identifier\) === "email"/)
  assert.match(panel, /client\.register\(identifier, password\) : client\.signIn\(identifier, password\)/)
  assert.match(panel, /client\.registerWithUsername\(identifier, password\) : client\.signInWithUsername\(identifier, password\)/)
  // The email-code channel still signs in from the same fused identifier.
  assert.match(panel, /client\.signInWithEmailCode\(identifier, code\)/)
  // Password reset stays an email-channel feature with a plain-language stop.
  assert.match(panel, /没法用邮件重设密码/)
})

test('register mode shows one dynamic hint that follows the identifier shape', () => {
  assert.match(panel, /const registerHint = passwordAvailable && \(identifierIsEmail \|\| !usernameAvailable\)/)
  assert.match(panel, /用邮箱注册，提交后会发一封验证邮件，确认后就能登录。/)
  assert.match(panel, /用户名 3–20 个字符，大小写不敏感；注册后直接登录，不用邮箱。/)
  assert.match(panel, /\{activeMode === "register" && <p className="account-storage-note">\{registerHint\}<\/p>\}/)
})
