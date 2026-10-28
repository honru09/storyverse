import { useEffect, useRef, useState } from "react";
import "../account.css";
import { formatTokenCount } from "../usage-format.js";
import { identifierKind } from "../auth/identifier.js";

function GoogleMark() {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4h5.4a4.6 4.6 0 0 1-2 3v2.6h3.2c1.9-1.8 3-4.3 3-7.4ZM12 22c2.7 0 5-.9 6.6-2.4L15.4 17c-.9.6-2 .9-3.4.9-2.6 0-4.9-1.8-5.7-4.2H3v2.6A10 10 0 0 0 12 22ZM6.3 13.7a6 6 0 0 1 0-3.4V7.7H3a10 10 0 0 0 0 8.6l3.3-2.6ZM12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9 5.7l3.3 2.6C7.1 7.9 9.4 6.1 12 6.1Z"/></svg>;
}

// The SDK owns Firebase credentials and the session; the email-code session
// token is owned by the auth client too. This panel only holds form input.
const SHELL_THEME_OPTIONS = [
  { id: "black", label: "黑夜" },
  { id: "white", label: "白昼" },
  { id: "aurora", label: "极光" },
];

function ShellThemeControl({ shellTheme, onShellThemeChange }) {
  if (!onShellThemeChange) return null;
  return (
    <div className="account-theme">
      <span className="account-theme-label">外观主题</span>
      <div className="account-theme-options" role="group" aria-label="外观主题">
        {SHELL_THEME_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={shellTheme === option.id}
            className={shellTheme === option.id ? "is-active" : ""}
            onClick={() => onShellThemeChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="account-storage-note">只改界面外观；阅读时的纸色、字号在阅读设置里单独调，互不影响。</p>
    </div>
  );
}

export default function AccountPanel({ client, account, onContinue, onOpenAvatar, onOpenProfile, shellTheme, onShellThemeChange, onOpenHelp }) {
  const [mode, setMode] = useState("login");
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");
  const [pending, setPending] = useState(false);
  // Username-account recovery (RECOVERY batch): the optional address bound
  // at registration, the reset panel's looked-up state, and the signed-in
  // binding form. None of this ever holds a full address back from the
  // server beyond what the user just typed — the server only ever returns
  // the masked shape.
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryInfo, setRecoveryInfo] = useState(null);
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [bindPassword, setBindPassword] = useState("");
  const [bindEmail, setBindEmail] = useState("");
  const [dismissedReminderKey, setDismissedReminderKey] = useState("");
  const [slowPending, setSlowPending] = useState(false);
  const inFlight = useRef(false);
  const modeTouched = useRef(false);
  const hadUser = useRef(false);
  // Signing out keeps this component mounted with its last tab selected;
  // drop back to the login tab so the form is not still in "register" mode.
  useEffect(() => {
    if (account.user) { hadUser.current = true; return; }
    if (hadUser.current) {
      hadUser.current = false;
      modeTouched.current = false;
      setMode("login");
      setLocalError("");
      setPassword("");
      setConfirmPassword("");
      setCode("");
      setAccountId("");
      setRecoveryInfo(null);
      setRecoverySent(false);
      setRecoveryCode("");
      setNewPassword("");
      setBindPassword("");
      setBindEmail("");
    }
  }, [account.user]);
  const busy = pending || account.busy || account.status === "loading";
  const passwordAvailable = Boolean(account.config?.providers?.email);
  const codeAvailable = Boolean(account.config?.emailCode);
  const usernameAvailable = Boolean(account.config?.providers?.username);
  const configured = Boolean(account.config?.enabled || codeAvailable || usernameAvailable);
  // Every "you could use X instead" sentence is composed from the same
  // capability facts the tabs render by, so a channel this deployment
  // has not opened is never offered as an alternative (F-06 / N-05).
  const alternativeLoginText = (exclude) => {
    const options = [];
    if (exclude !== "username" && usernameAvailable) options.push("用户名");
    if (exclude !== "code" && codeAvailable) options.push("邮箱验证码");
    if (exclude !== "email" && passwordAvailable) options.push("邮箱密码");
    return options.length ? `可以改用${options.join("或")}登录。` : "其他登录方式还没开通。";
  };
  // The guest footer follows the same rule (F-06 / N-05): an
  // unconfigured deployment says only that the account service is not
  // configured — it makes no storage promise in either direction — and
  // a configured one names only the channels it actually offers.
  const methodOptions = [usernameAvailable && "用户名", codeAvailable && "邮箱验证码"].filter(Boolean);
  const guestFooter = account.status === "loading" ? "" : !configured
    ? "账号服务尚未配置。你仍可继续本机阅读。"
    : `${account.config?.storage === 'synced'
        ? "不登录也能读，故事先保存在当前浏览器；登录后会自动同步到你的账号，换设备也能接着读。"
        : "不登录也能读，故事和阅读进度会保存在当前浏览器，暂不跨设备同步。"}${methodOptions.length ? `没有 Google 账号，也可以用${methodOptions.join("或")}登录。` : ""}`;
  // The full form is always rendered; unavailable channels are disabled in
  // place. Untouched, the form prefers the email-code mode when it is the
  // only channel this deployment actually offers. Username sign-in needs no
  // mode of its own any more: the fused account field routes to it by shape.
  const preferCode = !modeTouched.current && mode === "login" && !passwordAvailable && codeAvailable;
  const activeMode = mode === "reset" ? "reset" : preferCode ? "code" : mode;
  const identifier = accountId.trim();
  const identifierIsEmail = identifierKind(identifier) === "email";
  // Register-mode hint follows the identifier being typed: an email shape
  // gets the email copy, anything else the username copy. Only one line is
  // ever shown; when the email channel is off, the username copy wins even
  // for an email shape, because that is the channel that could serve them.
  const registerHint = passwordAvailable && (identifierIsEmail || !usernameAvailable)
    ? "用邮箱注册，提交后会发一封验证邮件，确认后就能登录。"
    : "用户名 3–20 个字符，大小写不敏感；注册后直接登录，不用邮箱。";
  // The registration form is a username form exactly when the hint above
  // is the username copy; only then do the recovery warning and the
  // optional recovery-email field belong on it.
  const usernameForm = activeMode === "register" && !(passwordAvailable && (identifierIsEmail || !usernameAvailable));
  // Username reset stages: look the account's recovery state up, offer to
  // send the code, collect code + new password — or stop at an honest
  // explanation when there is nothing to send to / no channel yet.
  const resetStage = !recoveryInfo ? "lookup" : recoveryInfo.hasRecoveryEmail && recoveryInfo.channelOpen ? (recoverySent ? "code" : "send") : "info";
  const resetLabel = identifierIsEmail ? "发送重设邮件" : resetStage === "code" ? "重设密码并登录" : resetStage === "send" ? "发送找回验证码" : "继续";
  const resetDisabled = identifierIsEmail ? !passwordAvailable : !usernameAvailable || (resetStage === "code" && (recoveryCode.length !== 6 || newPassword.length < 8));
  const resetActionable = activeMode !== "reset" || identifierIsEmail || resetStage !== "info";
  // The unbound reminder is per account and per device: once dismissed
  // (or once an address is bound) it never comes back here.
  const reminderKey = account.user?.provider === "username" ? `storyweave:recovery-reminder-dismissed:${account.user.uid}` : null;
  let reminderStored = false;
  try { reminderStored = reminderKey !== null && globalThis.localStorage?.getItem(reminderKey) === "1"; } catch { reminderStored = false; }
  const reminderDismissed = reminderStored || (reminderKey !== null && dismissedReminderKey === reminderKey);
  const dismissReminder = () => {
    if (!reminderKey) return;
    try { globalThis.localStorage?.setItem(reminderKey, "1"); } catch { /* storage blocked: the in-state dismissal still applies */ }
    setDismissedReminderKey(reminderKey);
  };
  const error = localError || account.error;
  const usage = account.user ? account.usage : null;
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  // A request that is still running after a few seconds says so out
  // loud (N-01): a bare 「正在处理…」 with no explanation reads as a
  // hang on slow networks, so the wait gets words while it lasts.
  useEffect(() => {
    if (!pending) { setSlowPending(false); return undefined; }
    const timer = window.setTimeout(() => setSlowPending(true), 5000);
    return () => window.clearTimeout(timer);
  }, [pending]);
  // Switching views drops every error with the view it belonged to:
  // the panel's own message is local state, and the client's snapshot
  // error is cleared through the client, so a reset failure can never
  // still be hanging on the login form (F-08).
  const changeMode = (next) => { modeTouched.current = true; setMode(next); setLocalError(""); if (typeof client.clearError === "function") client.clearError(); setPassword(""); setConfirmPassword(""); setCode(""); setShowPassword(false); setRecoveryEmail(""); setRecoveryInfo(null); setRecoverySent(false); setRecoveryCode(""); setNewPassword(""); };
  // Editing the identifier after a recovery lookup invalidates the lookup:
  // the panel must never act on a previous name's state.
  const changeAccountId = (value) => { setAccountId(value); setRecoveryInfo(null); setRecoverySent(false); setRecoveryCode(""); };
  const run = async (operation) => {
    if (inFlight.current || account.busy) return;
    inFlight.current = true;
    setPending(true);
    setLocalError("");
    try { await operation(); setPassword(""); setConfirmPassword(""); }
    catch (failure) { setLocalError(failure.message || "暂时无法完成，请重试。"); }
    finally { inFlight.current = false; setPending(false); }
  };
  const submit = (event) => {
    event.preventDefault();
    if (!configured || busy) return;
    if (activeMode === "code") {
      if (!codeAvailable) return;
      void run(async () => { await client.signInWithEmailCode(identifier, code); setCode(""); });
      return;
    }
    if (activeMode === "reset") {
      if (!identifier) { setLocalError("先填邮箱或用户名。"); return; }
      // Email identifiers keep the Firebase reset mail. Username
      // identifiers go through the recovery stages instead of the old
      // dead end: look up, send the code, set a new password.
      if (identifierIsEmail) {
        if (!passwordAvailable) { setLocalError(`邮箱密码登录还没开通。${alternativeLoginText("email")}`); return; }
        void run(() => client.resetPassword(identifier));
        return;
      }
      if (!usernameAvailable) { setLocalError(`用户名登录还没开通。${alternativeLoginText("username")}`); return; }
      if (resetStage === "code") { void run(() => client.usernameRecoveryReset(identifier, recoveryCode, newPassword)); return; }
      if (resetStage === "send") {
        void run(async () => { await client.usernameRecoveryStart(identifier); setRecoverySent(true); setCooldown(60); });
        return;
      }
      if (resetStage === "info") return;
      void run(async () => { setRecoveryInfo(await client.usernameRecoveryStatus(identifier)); });
      return;
    }
    if (!identifier) { setLocalError("先填邮箱或用户名。"); return; }
    // Registration confirms the password before anything is sent: a
    // mismatch is a form problem, never a request (F-08).
    if (activeMode === "register" && password !== confirmPassword) { setLocalError("两次输入的密码不一致，请再确认。"); return; }
    // One field, two password channels, routed by the identifier's shape.
    if (identifierIsEmail) {
      if (!passwordAvailable) { setLocalError(`邮箱密码登录还没开通。${alternativeLoginText("email")}`); return; }
      void run(() => activeMode === "register" ? client.register(identifier, password) : client.signIn(identifier, password));
      return;
    }
    if (!usernameAvailable) { setLocalError(`用户名登录还没开通。${alternativeLoginText("username")}`); return; }
    void run(() => activeMode === "register" ? client.registerWithUsername(identifier, password, recoveryEmail) : client.signInWithUsername(identifier, password));
  };
  const resendRecoveryCode = () => {
    if (busy || cooldown > 0) return;
    void run(async () => { await client.usernameRecoveryStart(identifier); setCooldown(60); });
  };
  const submitRecoveryBinding = (event) => {
    event.preventDefault();
    if (busy) return;
    void run(async () => { await client.setRecoveryEmail(bindPassword, bindEmail); setBindPassword(""); setBindEmail(""); });
  };
  const unbindRecovery = () => {
    if (busy || !bindPassword) return;
    void run(async () => { await client.setRecoveryEmail(bindPassword, null); setBindPassword(""); setBindEmail(""); });
  };
  const sendCode = () => {
    if (!codeAvailable || busy || cooldown > 0) return;
    void run(async () => { await client.requestEmailCode(identifier); setCooldown(60); });
  };

  return <div className="account-panel" aria-busy={busy}>
    {account.user ? <>
      <div className="account-profile">
        <span className="account-avatar" aria-hidden="true">{(account.user.displayName || account.user.email || "你").slice(0, 1).toUpperCase()}</span>
        <div><h3>{account.user.displayName || "欢迎回来"}</h3><p>{account.user.email || (account.user.provider === "username" ? "用户名账号" : "")}</p></div>
      </div>
      {account.user.provider === "username" && account.user.hasRecoveryEmail === false && !reminderDismissed && <div className="account-message account-recovery-reminder" role="status">
        <p>你的用户名账号还没有绑定恢复邮箱——密码忘了将无法找回。可以在下面补绑一个，下次就能用邮箱找回了。</p>
        <button type="button" onClick={dismissReminder}>不再提醒</button>
      </div>}
      {account.user.email && <div className="account-detail-row"><span>邮箱状态</span><strong>{account.user.emailVerified ? "已验证" : "等待验证"}</strong></div>}
      <div className="account-detail-row"><span>登录方式</span><strong>{account.user.provider === "username" ? "用户名密码" : account.user.provider === "email-code" ? "邮箱验证码" : "Google / 邮箱密码"}</strong></div>
      {account.user.provider === "username" && <div className="account-recovery-settings">
        <div className="account-detail-row"><span>恢复邮箱</span><strong>{account.user.hasRecoveryEmail ? account.user.recoveryEmailMasked : "未绑定"}</strong></div>
        <form className="account-form" onSubmit={submitRecoveryBinding}>
          <label>当前密码<input type="password" name="recovery-current-password" autoComplete="current-password" maxLength={128} value={bindPassword} disabled={busy} onChange={(event) => setBindPassword(event.target.value)} placeholder="输入当前密码"/></label>
          <label>恢复邮箱<input type="email" name="recovery-email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={254} value={bindEmail} disabled={busy} onChange={(event) => setBindEmail(event.target.value)} placeholder={account.user.recoveryEmailMasked || "you@example.com"}/></label>
          <div className="account-recovery-actions">
            <button type="submit" className="button button-primary" disabled={busy || !bindPassword || !bindEmail.trim()}>{account.user.hasRecoveryEmail ? "更新恢复邮箱" : "绑定恢复邮箱"}</button>
            {account.user.hasRecoveryEmail && <button type="button" className="account-quiet" disabled={busy || !bindPassword} onClick={unbindRecovery}>取消绑定</button>}
          </div>
          {!account.user.recoveryChannelOpen && <p className="account-storage-note">邮箱找回通道还没有开通；先绑好，开通后就能用这个邮箱找回密码。</p>}
        </form>
      </div>}
      {!account.user.emailVerified && account.user.provider !== "username" && <div className="account-verification">
        <p>请打开邮件中的验证链接，再回来刷新状态。你可以先继续阅读。</p>
        <div><button type="button" disabled={busy} onClick={() => void run(() => client.sendVerification())}>重发验证邮件</button><button type="button" disabled={busy} onClick={() => void run(() => client.refreshUser())}>我已验证</button></div>
      </div>}
      {usage && <div className="account-usage">
        <div className="account-usage-head"><h4>我的消耗</h4><button type="button" disabled={busy} onClick={() => void run(() => client.refreshUser())}>刷新</button></div>
        <div className="account-usage-total"><span>累计总 token</span><strong>{formatTokenCount(usage.total)}</strong></div>
        <div className="account-usage-grid">
          <div><span>输入</span><b>{formatTokenCount(usage.prompt)}</b></div>
          <div><span>输出</span><b>{formatTokenCount(usage.candidates)}</b></div>
          <div><span>思考</span><b>{formatTokenCount(usage.thoughts)}</b></div>
          <div><span>生成章节</span><b>{formatTokenCount(usage.generations)}</b></div>
        </div>
        <p className="account-storage-note">按你的账号累计本站生成消耗；生成额度按天计算（UTC），在账号页只展示总计。</p>
      </div>}
      <p className="account-storage-note">{account.config?.storage === 'synced'
        ? "书架与阅读进度会同步到你的账号，换设备登录就能接着读。本机始终留一份，断网也能读。退出账号不会删除本机故事。"
        : "书架与阅读进度保存在当前浏览器，暂不跨设备同步。退出账号不会删除本机故事。"}</p>
      <ShellThemeControl shellTheme={shellTheme} onShellThemeChange={onShellThemeChange} />
      {onOpenAvatar && <button className="account-avatar-entry" type="button" onClick={onOpenAvatar}>我的化身 <span aria-hidden="true">→</span></button>}
      {onOpenProfile && <button className="account-avatar-entry" type="button" onClick={onOpenProfile}>我的主页 <span aria-hidden="true">→</span></button>}
      {onOpenHelp && <button className="account-avatar-entry" type="button" onClick={onOpenHelp}>帮助与常见问题 <span aria-hidden="true">→</span></button>}
      {error && <p className="account-message is-error" role="alert">{error}</p>}
      {account.notice && <p className="account-message" role="status">{account.notice}</p>}
      <button className="button button-primary account-primary" type="button" onClick={onContinue}>继续体验</button>
      <button className="account-quiet" type="button" disabled={busy} onClick={() => void run(() => client.signOut())}>{busy ? "正在处理…" : "退出账号"}</button>
    </> : <>
      <p className="account-intro">从这里，进入你的故事。</p>
      {!configured && <button className="account-guest" type="button" onClick={onContinue}>先不登录，继续体验 <span aria-hidden="true">→</span></button>}
      <button className="account-google" type="button" disabled={busy || !configured || !account.config?.providers?.google} onClick={() => void run(() => client.signInWithGoogle())}><GoogleMark/>使用 Google 继续</button>
      <div className="account-divider"><span>{usernameAvailable ? "或使用邮箱 / 用户名" : "或使用邮箱"}</span></div>
      {activeMode !== "reset" ? <div className="account-tabs" role="group" aria-label="账号操作">
        <button type="button" aria-pressed={activeMode === "login"} disabled={busy} onClick={() => changeMode("login")}>登录</button>
        <button type="button" aria-pressed={activeMode === "register"} disabled={busy} onClick={() => changeMode("register")}>注册</button>
        {codeAvailable && <button type="button" aria-pressed={activeMode === "code"} disabled={busy} onClick={() => changeMode("code")}>验证码</button>}
      </div> : <h3 className="account-reset-heading">重设密码</h3>}
      <form onSubmit={submit} className="account-form">
        {activeMode === "code"
          ? <label>邮箱<input type="email" name="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={accountId} disabled={busy || !configured} onChange={(event) => changeAccountId(event.target.value)} placeholder="you@example.com"/></label>
          : <label>邮箱或用户名<input type="text" name="account" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} value={accountId} disabled={busy || !configured} onChange={(event) => changeAccountId(event.target.value)} placeholder="邮箱或用户名"/></label>}
        {activeMode === "code" && <label>验证码<div className="account-password"><input type="text" name="code" autoComplete="one-time-code" inputMode="numeric" autoCapitalize="none" spellCheck={false} required maxLength={6} value={code} disabled={busy || !codeAvailable} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="6 位数字"/><button type="button" disabled={busy || !codeAvailable || cooldown > 0} onClick={sendCode}>{cooldown > 0 ? `${cooldown} 秒后重发` : "发送验证码"}</button></div></label>}
        {activeMode !== "reset" && activeMode !== "code" && <label>密码<div className="account-password"><input type={showPassword ? "text" : "password"} name="password" autoComplete={activeMode === "register" ? "new-password" : "current-password"} required minLength={activeMode === "register" ? 8 : undefined} maxLength={128} value={password} disabled={busy || !(passwordAvailable || usernameAvailable)} onChange={(event) => setPassword(event.target.value)} placeholder={activeMode === "register" ? "至少 8 位" : "输入密码"}/><button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword} disabled={busy || !(passwordAvailable || usernameAvailable)} onClick={() => setShowPassword((value) => !value)}>{showPassword ? "隐藏" : "显示"}</button></div></label>}
        {activeMode === "register" && <label>确认密码<input type="password" name="confirmPassword" autoComplete="new-password" required minLength={8} maxLength={128} value={confirmPassword} disabled={busy || !(passwordAvailable || usernameAvailable)} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再输入一次密码"/></label>}
        {activeMode === "register" && confirmPassword && confirmPassword !== password && <p className="account-message is-error" role="alert">两次输入的密码不一致。</p>}
        {usernameForm && <>
          <p className="account-message account-recovery-note">用户名账号没有邮箱验证，密码忘了将无法找回，除非现在绑定一个恢复邮箱。</p>
          <label>恢复邮箱（可选）<input type="email" name="recoveryEmail" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={254} value={recoveryEmail} disabled={busy || !configured} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="you@example.com"/></label>
        </>}
        {activeMode === "reset" && resetStage === "code" && <>
          <label>找回验证码<div className="account-password"><input type="text" name="recoveryCode" autoComplete="one-time-code" inputMode="numeric" autoCapitalize="none" spellCheck={false} required maxLength={6} value={recoveryCode} disabled={busy} onChange={(event) => setRecoveryCode(event.target.value.replace(/\D/g, ""))} placeholder="6 位数字"/><button type="button" disabled={busy || cooldown > 0} onClick={resendRecoveryCode}>{cooldown > 0 ? `${cooldown} 秒后重发` : "重新发送"}</button></div></label>
          <label>新密码<input type="password" name="newPassword" autoComplete="new-password" required minLength={8} maxLength={128} value={newPassword} disabled={busy} onChange={(event) => setNewPassword(event.target.value)} placeholder="至少 8 位"/></label>
        </>}
        {activeMode === "reset" && !identifierIsEmail && recoveryInfo && <div className="account-message account-recovery-panel" role="status">
          {resetStage === "info" && !recoveryInfo.hasRecoveryEmail && <p>这个用户名没有绑定恢复邮箱，没法自助找回密码。如果你还在其他设备上登录着，去账号设置里补绑一个恢复邮箱，下次就能用邮箱找回了。</p>}
          {resetStage === "info" && recoveryInfo.hasRecoveryEmail && <p>这个账号绑定了恢复邮箱 {recoveryInfo.maskedRecoveryEmail}。邮箱找回通道还没有开通——开通之后，找回验证码会发到这个邮箱。现在还没法自助重设密码，如果你还记得密码，返回登录试试。</p>}
          {resetStage === "send" && <p>找回验证码会发到你的恢复邮箱 {recoveryInfo.maskedRecoveryEmail}，10 分钟内有效。点下面的按钮发送。</p>}
          {resetStage === "code" && <p>验证码已发送到 {recoveryInfo.maskedRecoveryEmail}。输入验证码和新密码，就能重设密码并直接登录。</p>}
        </div>}
        {activeMode === "register" && <p className="account-storage-note">{registerHint}</p>}
        {error && <p className="account-message is-error" role="alert">{error}</p>}
        {account.notice && <p className="account-message" role="status">{account.notice}</p>}
        {busy && slowPending && <p className="account-message" role="status">网络较慢，仍在处理中，请稍等；如果一直没有结果，可以检查网络后重试。</p>}
        {account.status === "loading" && <p className="account-message" role="status">正在连接账号服务…</p>}
        {resetActionable && <button type="submit" className="button button-primary account-primary" disabled={busy || !configured || (activeMode === "code" ? !codeAvailable || code.length !== 6 : activeMode === "reset" ? resetDisabled : activeMode === "register" ? !(passwordAvailable || usernameAvailable) || password !== confirmPassword : !(passwordAvailable || usernameAvailable))}>{busy ? "正在处理…" : activeMode === "register" ? "创建账号" : activeMode === "reset" ? resetLabel : activeMode === "code" ? "验证码登录" : "登录账号"}</button>}
      </form>
      <div className="account-links">
        {activeMode === "login" ? <button type="button" disabled={busy} onClick={() => changeMode("reset")}>忘记密码？</button> : <button type="button" disabled={busy} onClick={() => changeMode("login")}>返回登录</button>}
        {!configured && account.status !== "loading" && <button type="button" disabled={busy} onClick={() => void run(() => { client.stop(); return client.start(); })}>重新连接</button>}
        {configured && account.status === "error" && <button type="button" disabled={busy} onClick={() => void run(() => client.refreshUser())}>重试验证</button>}
      </div>
      {configured && <button className="account-guest" type="button" onClick={onContinue}>先不登录，继续体验 <span aria-hidden="true">→</span></button>}
      {guestFooter && <p className="account-storage-note">{guestFooter}</p>}
      <ShellThemeControl shellTheme={shellTheme} onShellThemeChange={onShellThemeChange} />
      {onOpenHelp && <button className="account-avatar-entry" type="button" onClick={onOpenHelp}>帮助与常见问题 <span aria-hidden="true">→</span></button>}
    </>}
  </div>;
}
