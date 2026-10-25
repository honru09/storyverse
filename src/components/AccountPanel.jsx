import { useRef, useState } from "react";
import "../account.css";

function GoogleMark() {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4h5.4a4.6 4.6 0 0 1-2 3v2.6h3.2c1.9-1.8 3-4.3 3-7.4ZM12 22c2.7 0 5-.9 6.6-2.4L15.4 17c-.9.6-2 .9-3.4.9-2.6 0-4.9-1.8-5.7-4.2H3v2.6A10 10 0 0 0 12 22ZM6.3 13.7a6 6 0 0 1 0-3.4V7.7H3a10 10 0 0 0 0 8.6l3.3-2.6ZM12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9 5.7l3.3 2.6C7.1 7.9 9.4 6.1 12 6.1Z"/></svg>;
}

// The SDK owns credentials and the session. This panel only holds editable form input.
export default function AccountPanel({ client, account, onContinue }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const busy = pending || account.busy || account.status === "loading";
  const configured = Boolean(account.config?.enabled);
  const error = localError || account.error;
  const changeMode = (next) => { setMode(next); setLocalError(""); setPassword(""); setShowPassword(false); };
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
    const address = email.trim();
    void run(() => mode === "reset" ? client.resetPassword(address) : mode === "register" ? client.register(address, password) : client.signIn(address, password));
  };

  return <div className="account-panel" aria-busy={busy}>
    {account.user ? <>
      <div className="account-profile">
        <span className="account-avatar" aria-hidden="true">{(account.user.displayName || account.user.email || "你").slice(0, 1).toUpperCase()}</span>
        <div><h3>{account.user.displayName || "欢迎回来"}</h3><p>{account.user.email}</p></div>
      </div>
      <div className="account-detail-row"><span>邮箱状态</span><strong>{account.user.emailVerified ? "已验证" : "等待验证"}</strong></div>
      {!account.user.emailVerified && <div className="account-verification">
        <p>请打开邮件中的验证链接，再回来刷新状态。你可以先继续阅读。</p>
        <div><button type="button" disabled={busy} onClick={() => void run(() => client.sendVerification())}>重发验证邮件</button><button type="button" disabled={busy} onClick={() => void run(() => client.refreshUser())}>我已验证</button></div>
      </div>}
      <p className="account-storage-note">书架与阅读进度保存在当前浏览器，暂不跨设备同步。退出账号不会删除本机故事。</p>
      {error && <p className="account-message is-error" role="alert">{error}</p>}
      {account.notice && <p className="account-message" role="status">{account.notice}</p>}
      <button className="button button-primary account-primary" type="button" onClick={onContinue}>继续体验</button>
      <button className="account-quiet" type="button" disabled={busy} onClick={() => void run(() => client.signOut())}>{busy ? "正在处理…" : "退出账号"}</button>
    </> : <>
      <p className="account-intro">从这里，进入你的故事。</p>
      {!configured && <button className="account-guest" type="button" onClick={onContinue}>先不登录，继续体验 <span aria-hidden="true">→</span></button>}
      <button className="account-google" type="button" disabled={busy || !configured || !account.config?.providers?.google} onClick={() => void run(() => client.signInWithGoogle())}><GoogleMark/>使用 Google 继续</button>
      <div className="account-divider"><span>或使用邮箱</span></div>
      {mode !== "reset" ? <div className="account-tabs" role="group" aria-label="账号操作">
        <button type="button" aria-pressed={mode === "login"} disabled={busy} onClick={() => changeMode("login")}>登录</button>
        <button type="button" aria-pressed={mode === "register"} disabled={busy} onClick={() => changeMode("register")}>注册</button>
      </div> : <h3 className="account-reset-heading">重设密码</h3>}
      <form onSubmit={submit} className="account-form">
        <label>邮箱<input type="email" name="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} disabled={busy || !configured} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com"/></label>
        {mode !== "reset" && <label>密码<div className="account-password"><input type={showPassword ? "text" : "password"} name="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 8 : undefined} maxLength={128} value={password} disabled={busy || !configured} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "register" ? "至少 8 位" : "输入密码"}/><button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword} disabled={busy || !configured} onClick={() => setShowPassword((value) => !value)}>{showPassword ? "隐藏" : "显示"}</button></div></label>}
        {error && <p className="account-message is-error" role="alert">{error}</p>}
        {account.notice && <p className="account-message" role="status">{account.notice}</p>}
        {account.status === "loading" && <p className="account-message" role="status">正在连接账号服务…</p>}
        <button type="submit" className="button button-primary account-primary" disabled={busy || !configured || !account.config?.providers?.email}>{busy ? "正在处理…" : mode === "register" ? "创建账号" : mode === "reset" ? "发送重设邮件" : "登录账号"}</button>
      </form>
      <div className="account-links">
        {mode === "login" ? <button type="button" disabled={busy} onClick={() => changeMode("reset")}>忘记密码？</button> : <button type="button" disabled={busy} onClick={() => changeMode("login")}>返回登录</button>}
        {!configured && account.status !== "loading" && <button type="button" disabled={busy} onClick={() => void run(() => { client.stop(); return client.start(); })}>重新连接</button>}
        {configured && account.status === "error" && <button type="button" disabled={busy} onClick={() => void run(() => client.refreshUser())}>重试验证</button>}
      </div>
      {configured && <button className="account-guest" type="button" onClick={onContinue}>先不登录，继续体验 <span aria-hidden="true">→</span></button>}
      <p className="account-storage-note">登录后书架仍保存在本机；不会自动上传故事或个人设定。</p>
    </>}
  </div>;
}
