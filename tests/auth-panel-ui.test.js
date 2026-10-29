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
  // The code mode keeps its email-only field. Since the RECOVERY batch the
  // reset mode uses the fused field too: a username identifier there goes
  // to the recovery stages instead of an email input it could never use.
  assert.match(panel, /activeMode === "code"\s*\? <label>邮箱/)
  assert.doesNotMatch(panel, /activeMode === "code" \|\| activeMode === "reset"/)
})

test('panel submit routes by identifier shape to the two password channels', () => {
  assert.match(panel, /identifierKind\(identifier\) === "email"/)
  assert.match(panel, /client\.register\(identifier, password\) : client\.signIn\(identifier, password\)/)
  assert.match(panel, /client\.registerWithUsername\(identifier, password, recoveryEmail\) : client\.signInWithUsername\(identifier, password\)/)
  // The email-code channel still signs in from the same fused identifier.
  assert.match(panel, /client\.signInWithEmailCode\(identifier, code\)/)
  // Password reset: email identifiers keep the Firebase reset mail;
  // username identifiers run the recovery stages (RECOVERY batch) instead
  // of the old dead-end message.
  assert.match(panel, /client\.resetPassword\(identifier\)/)
  assert.match(panel, /client\.usernameRecoveryStatus\(identifier\)/)
  assert.match(panel, /client\.usernameRecoveryStart\(identifier\)/)
  assert.match(panel, /client\.usernameRecoveryReset\(identifier, recoveryCode, newPassword\)/)
  assert.doesNotMatch(panel, /没法用邮件重设密码/)
})

test('username registration carries the recovery warning and the optional recovery email field', () => {
  // The exact risk sentence from the batch brief, next to the password
  // field, not buried in small print.
  assert.match(panel, /用户名账号没有邮箱验证，密码忘了将无法找回，除非现在绑定一个恢复邮箱。/)
  assert.match(panel, /<label>恢复邮箱（可选）<input type="email" name="recoveryEmail"/)
  // Both appear only on the username form, gated by the same condition
  // that selects the username register hint.
  assert.match(panel, /const usernameForm = activeMode === "register" && !\(passwordAvailable && \(identifierIsEmail \|\| !usernameAvailable\)\)/)
  assert.match(panel, /\{usernameForm && <>/)
})

test('reset panel copies are honest: masked address, closed channel never claims a send', () => {
  assert.match(panel, /这个用户名没有绑定恢复邮箱，没法自助找回密码/)
  assert.match(panel, /这个账号绑定了恢复邮箱 \{recoveryInfo\.maskedRecoveryEmail\}。邮箱找回通道还没有开通/)
  assert.match(panel, /找回验证码会发到你的恢复邮箱 \{recoveryInfo\.maskedRecoveryEmail\}/)
  // Editing the identifier after a lookup drops the looked-up state.
  assert.match(panel, /const changeAccountId = \(value\) => \{ setAccountId\(value\); setRecoveryInfo\(null\)/)
})

test('signed-in username accounts get the unbound reminder and the password-gated binding form', () => {
  assert.match(panel, /你的用户名账号还没有绑定恢复邮箱——密码忘了将无法找回/)
  assert.match(panel, /storyweave:recovery-reminder-dismissed:/)
  assert.match(panel, /<span>恢复邮箱<\/span><strong>\{account\.user\.hasRecoveryEmail \? account\.user\.recoveryEmailMasked : "未绑定"\}<\/strong>/)
  assert.match(panel, /client\.setRecoveryEmail\(bindPassword, bindEmail\)/)
  assert.match(panel, /client\.setRecoveryEmail\(bindPassword, null\)/)
  // The binding section only exists for username accounts.
  assert.match(panel, /account\.user\.provider === "username" && <div className="account-recovery-settings">/)
})

test('register mode shows one dynamic hint that follows the identifier shape', () => {
  assert.match(panel, /const registerHint = passwordAvailable && \(identifierIsEmail \|\| !usernameAvailable\)/)
  assert.match(panel, /用邮箱注册，提交后直接登录；另发一封验证邮件确认邮箱，日后找回账号也靠它。/)
  assert.match(panel, /用户名 3–20 个字符，大小写不敏感；注册后直接登录，不用邮箱。/)
  assert.match(panel, /\{activeMode === "register" && <p className="account-storage-note">\{registerHint\}<\/p>\}/)
})

test('LOGIN-TRIM: the login card carries no guest storage footer and no second theme switch', () => {
  // §44 (user, from a real-device screenshot): the storage-note
  // paragraph under the card's actions and the 外观主题 block in
  // its scroll tail were text noise — both deleted outright, not
  // reworded. (This supersedes the ACCOUNT-POLISH guest-footer
  // composition assertions: the footer itself no longer exists.)
  assert.doesNotMatch(panel, /guestFooter/)
  assert.doesNotMatch(panel, /不登录也能读/)
  assert.doesNotMatch(panel, /没有 Google 账号，也可以用/)
  assert.doesNotMatch(panel, /function ShellThemeControl/)
  assert.doesNotMatch(panel, /<ShellThemeControl/)
  assert.doesNotMatch(panel, /不会自动上传故事或个人设定/)
  assert.doesNotMatch(panel, /也可以用用户名或邮箱验证码登录/)
  // The theme switch survives where it belongs: the segments the
  // profile settings row seats are still exported from this module.
  assert.match(panel, /export function ShellThemeSegments/)
})

test('ACCOUNT-POLISH: registration confirms the password and blocks the request on mismatch', () => {
  assert.match(panel, /<label>确认密码<input type="password" name="confirmPassword"/)
  assert.match(panel, /两次输入的密码不一致/)
  // The guard sits in submit before any channel call.
  assert.match(panel, /if \(activeMode === "register" && password !== confirmPassword\) \{ setLocalError\("两次输入的密码不一致，请再确认。"\); return; \}/)
})

test('ACCOUNT-POLISH: switching views clears the client snapshot error with the view', () => {
  assert.match(panel, /client\.clearError\(\)/)
})

test('ACCOUNT-POLISH: a slow request says it is still working instead of looking hung', () => {
  assert.match(panel, /网络较慢，仍在处理中，请稍等/)
  assert.match(panel, /setSlowPending\(true\), 5000\)/)
})

test('ACCOUNT-POLISH: alternative-channel sentences never offer a closed channel', () => {
  assert.match(panel, /const alternativeLoginText = \(exclude\) =>/)
  assert.doesNotMatch(panel, /可以改用用户名或验证码登录/)
  assert.doesNotMatch(panel, /可以改用邮箱登录/)
})
