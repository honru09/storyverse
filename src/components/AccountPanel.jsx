import { useEffect, useRef, useState } from "react";
import "../account.css";
import { formatTokenCount } from "../usage-format.js";
import { identifierKind } from "../auth/identifier.js";

function GoogleMark() {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4h5.4a4.6 4.6 0 0 1-2 3v2.6h3.2c1.9-1.8 3-4.3 3-7.4ZM12 22c2.7 0 5-.9 6.6-2.4L15.4 17c-.9.6-2 .9-3.4.9-2.6 0-4.9-1.8-5.7-4.2H3v2.6A10 10 0 0 0 12 22ZM6.3 13.7a6 6 0 0 1 0-3.4V7.7H3a10 10 0 0 0 0 8.6l3.3-2.6ZM12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9 5.7l3.3 2.6C7.1 7.9 9.4 6.1 12 6.1Z"/></svg>;
}

// The SDK owns Firebase credentials and the session; the email-code session
// token is owned by the auth client too. This panel only holds form input.
export default function AccountPanel({ client, account, onContinue, onOpenAvatar, onOpenProfile }) {
  const [mode, setMode] = useState("login");
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");
  const [pending, setPending] = useState(false);
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
      setCode("");
      setAccountId("");
    }
  }, [account.user]);
  const busy = pending || account.busy || account.status === "loading";
  const passwordAvailable = Boolean(account.config?.providers?.email);
  const codeAvailable = Boolean(account.config?.emailCode);
  const usernameAvailable = Boolean(account.config?.providers?.username);
  const configured = Boolean(account.config?.enabled || codeAvailable || usernameAvailable);
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
  const error = localError || account.error;
  const usage = account.user ? account.usage : null;
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  const changeMode = (next) => { modeTouched.current = true; setMode(next); setLocalError(""); setPassword(""); setCode(""); setShowPassword(false); };
  const run = async (operation) => {
    if (inFlight.current || account.busy) return;
    inFlight.current = true;
    setPending(true);
    setLocalError("");
    try { await operation(); setPassword(""); }
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
      // Password reset is an email-channel feature; a username account has
      // no mailbox to send the reset link to.
      if (!identifierIsEmail) { setLocalError("用户名账号没有绑定邮箱，没法用邮件重设密码，试试直接登录。"); return; }
      if (!passwordAvailable) return;
      void run(() => client.resetPassword(identifier));
      return;
    }
    if (!identifier) { setLocalError("先填邮箱或用户名。"); return; }
    // One field, two password channels, routed by the identifier's shape.
    if (identifierIsEmail) {
      if (!passwordAvailable) { setLocalError("邮箱密码登录还没开通，可以改用用户名或验证码登录。"); return; }
      void run(() => activeMode === "register" ? client.register(identifier, password) : client.signIn(identifier, password));
      return;
    }
    if (!usernameAvailable) { setLocalError("用户名登录还没开通，可以改用邮箱登录。"); return; }
    void run(() => activeMode === "register" ? client.registerWithUsername(identifier, password) : client.signInWithUsername(identifier, password));
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
      {account.user.email && <div className="account-detail-row"><span>邮箱状态</span><strong>{account.user.emailVerified ? "已验证" : "等待验证"}</strong></div>}
      <div className="account-detail-row"><span>登录方式</span><strong>{account.user.provider === "username" ? "用户名密码" : account.user.provider === "email-code" ? "邮箱验证码" : "Google / 邮箱密码"}</strong></div>
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
      <p className="account-storage-note">书架与阅读进度保存在当前浏览器，暂不跨设备同步。退出账号不会删除本机故事。</p>
      {onOpenAvatar && <button className="account-avatar-entry" type="button" onClick={onOpenAvatar}>我的化身 <span aria-hidden="true">→</span></button>}
      {onOpenProfile && <button className="account-avatar-entry" type="button" onClick={onOpenProfile}>我的主页 <span aria-hidden="true">→</span></button>}
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
        {activeMode === "code" || activeMode === "reset"
          ? <label>邮箱<input type="email" name="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={accountId} disabled={busy || !configured} onChange={(event) => setAccountId(event.target.value)} placeholder="you@example.com"/></label>
          : <label>邮箱或用户名<input type="text" name="account" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} value={accountId} disabled={busy || !configured} onChange={(event) => setAccountId(event.target.value)} placeholder="邮箱或用户名"/></label>}
        {activeMode === "code" && <label>验证码<div className="account-password"><input type="text" name="code" autoComplete="one-time-code" inputMode="numeric" autoCapitalize="none" spellCheck={false} required maxLength={6} value={code} disabled={busy || !codeAvailable} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="6 位数字"/><button type="button" disabled={busy || !codeAvailable || cooldown > 0} onClick={sendCode}>{cooldown > 0 ? `${cooldown} 秒后重发` : "发送验证码"}</button></div></label>}
        {activeMode !== "reset" && activeMode !== "code" && <label>密码<div className="account-password"><input type={showPassword ? "text" : "password"} name="password" autoComplete={activeMode === "register" ? "new-password" : "current-password"} required minLength={activeMode === "register" ? 8 : undefined} maxLength={128} value={password} disabled={busy || !(passwordAvailable || usernameAvailable)} onChange={(event) => setPassword(event.target.value)} placeholder={activeMode === "register" ? "至少 8 位" : "输入密码"}/><button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword} disabled={busy || !(passwordAvailable || usernameAvailable)} onClick={() => setShowPassword((value) => !value)}>{showPassword ? "隐藏" : "显示"}</button></div></label>}
        {activeMode === "register" && <p className="account-storage-note">{registerHint}</p>}
        {error && <p className="account-message is-error" role="alert">{error}</p>}
        {account.notice && <p className="account-message" role="status">{account.notice}</p>}
        {account.status === "loading" && <p className="account-message" role="status">正在连接账号服务…</p>}
        <button type="submit" className="button button-primary account-primary" disabled={busy || !configured || (activeMode === "code" ? !codeAvailable || code.length !== 6 : activeMode === "reset" ? !passwordAvailable : !(passwordAvailable || usernameAvailable))}>{busy ? "正在处理…" : activeMode === "register" ? "创建账号" : activeMode === "reset" ? "发送重设邮件" : activeMode === "code" ? "验证码登录" : "登录账号"}</button>
      </form>
      <div className="account-links">
        {activeMode === "login" ? <button type="button" disabled={busy} onClick={() => changeMode("reset")}>忘记密码？</button> : <button type="button" disabled={busy} onClick={() => changeMode("login")}>返回登录</button>}
        {!configured && account.status !== "loading" && <button type="button" disabled={busy} onClick={() => void run(() => { client.stop(); return client.start(); })}>重新连接</button>}
        {configured && account.status === "error" && <button type="button" disabled={busy} onClick={() => void run(() => client.refreshUser())}>重试验证</button>}
      </div>
      {configured && <button className="account-guest" type="button" onClick={onContinue}>先不登录，继续体验 <span aria-hidden="true">→</span></button>}
      <p className="account-storage-note">登录后书架仍保存在本机；不会自动上传故事或个人设定。没有 Google 账号，也可以用用户名或邮箱验证码登录。</p>
    </>}
  </div>;
}
