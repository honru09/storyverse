import { useCallback, useEffect, useState } from "react";
import { fetchBillingState, invalidateBillingGate, redeemBillingCode, startBillingCheckout } from "../billing.js";

/**
 * 会员与额度 (BILLING): the one entitlement surface. Progressive
 * disclosure, in the house order: first screen is my current state,
 * the redemption box and the price cards; the consumption rules live
 * behind 更多. Prices and balances are the server's payload verbatim
 * — nothing here invents a number. While the purchase channel is
 * closed the panel says so in plain words and shows NO buy buttons:
 * a button that cannot work is a lie, not a placeholder.
 */
export default function BillingPanel({ getToken }) {
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemNote, setRedeemNote] = useState(null);
  const [buyingId, setBuyingId] = useState("");
  const [buyError, setBuyError] = useState("");

  const load = useCallback(async () => {
    try {
      setState(await fetchBillingState({ getAccessToken: getToken }));
      setLoadError("");
    } catch (error) {
      setLoadError(error?.message || "会员信息没能加载，请稍后再试。");
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  const redeem = async () => {
    const value = code.trim();
    if (!value || redeeming) return;
    setRedeeming(true);
    setRedeemNote(null);
    try {
      const result = await redeemBillingCode({ code: value, getAccessToken: getToken });
      setCode("");
      invalidateBillingGate();
      setRedeemNote({ ok: true, text: `兑换成功：${result?.product?.name || "权益"}已到账。` });
      await load();
    } catch (error) {
      setRedeemNote({ ok: false, text: error?.message || "兑换没能完成，请稍后再试。" });
    } finally {
      setRedeeming(false);
    }
  };

  const buy = async (productId) => {
    if (buyingId) return;
    setBuyingId(productId);
    setBuyError("");
    try {
      const url = await startBillingCheckout({ productId, getAccessToken: getToken });
      if (url) window.location.assign(url);
      else setBuyError("支付通道暂时不可用，请稍后再试。");
    } catch (error) {
      setBuyError(error?.message || "支付通道暂时不可用，请稍后再试。");
    } finally {
      setBuyingId("");
    }
  };

  if (loadError && !state) {
    return (
      <div className="billing-panel">
        <p className="billing-error" role="alert">{loadError}</p>
        <button type="button" className="billing-retry" onClick={() => void load()}>重试</button>
      </div>
    );
  }
  if (!state) return <div className="billing-panel"><p className="billing-loading">正在加载会员信息…</p></div>;

  const member = state.member || {};
  const memberUntil = member.until ? new Date(member.until) : null;
  const membership = (state.products || []).filter((product) => product.kind === "membership");
  const packs = (state.products || []).filter((product) => product.kind === "quota");

  return (
    <div className="billing-panel">
      <section className="billing-state" aria-label="我的权益">
        <div className="billing-state-row">
          <strong>{member.active ? "会员生效中" : "还不是会员"}</strong>
          {member.active && memberUntil && (
            <span className="billing-state-value">至 {memberUntil.getFullYear()}-{String(memberUntil.getMonth() + 1).padStart(2, "0")}-{String(memberUntil.getDate()).padStart(2, "0")}</span>
          )}
        </div>
        <div className="billing-state-row">
          <span>章额度</span>
          <span className="billing-state-value">{state.chapterCredits} 章</span>
        </div>
        <div className="billing-state-row">
          <span>图片额度</span>
          <span className="billing-state-value">{state.imageCredits} 张</span>
        </div>
        <p className="billing-state-note">
          阅读现成的故事永远免费；生成新章、带化身进入、合流推进会消耗生成额度。每天的免费额度用完后，会员有更高的每日额度，也可以用章额度继续。
        </p>
      </section>

      <section className="billing-redeem" aria-label="兑换码">
        <label className="billing-redeem-label" htmlFor="billing-code-input">有兑换码？</label>
        <div className="billing-redeem-row">
          <input
            id="billing-code-input"
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="ZJ-XXXXX-XXXXX-XXXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <button type="button" onClick={() => void redeem()} disabled={redeeming || !code.trim()}>
            {redeeming ? "兑换中…" : "兑换"}
          </button>
        </div>
        {redeemNote && (
          <p className={redeemNote.ok ? "billing-note-ok" : "billing-error"} role={redeemNote.ok ? "status" : "alert"}>
            {redeemNote.text}
          </p>
        )}
      </section>

      <section className="billing-products" aria-label="会员卡">
        <h4 className="billing-group-title">会员卡</h4>
        <div className="billing-cards">
          {membership.map((product) => (
            <div key={product.id} className={`billing-card${product.featured ? " is-featured" : ""}`}>
              <strong>{product.name}</strong>
              <span className="billing-card-price">¥{product.priceCny}</span>
              <small>{product.memberDays} 天会员</small>
              {product.featured && <span className="billing-card-badge">主推</span>}
            </div>
          ))}
        </div>
        <h4 className="billing-group-title">额度包</h4>
        <div className="billing-cards">
          {packs.map((product) => (
            <div key={product.id} className="billing-card">
              <strong>{product.name}</strong>
              <span className="billing-card-price">¥{product.priceCny}</span>
              <small>{product.chapterCredits} 章额度 · {product.imageCredits} 张图片额度</small>
            </div>
          ))}
        </div>
        {state.stripeEnabled ? (
          <div className="billing-buy">
            {[...membership, ...packs].map((product) => (
              <button
                key={product.id}
                type="button"
                className="billing-buy-button"
                disabled={Boolean(buyingId)}
                onClick={() => void buy(product.id)}
              >
                {buyingId === product.id ? "正在打开支付…" : `购买${product.name} · ¥${product.priceCny}`}
              </button>
            ))}
            {buyError && <p className="billing-error" role="alert">{buyError}</p>}
          </div>
        ) : (
          <p className="billing-channel-note">购买通道即将开通，可先用兑换码开通会员和额度。</p>
        )}
      </section>

      <details className="billing-rules">
        <summary>消耗规则</summary>
        <ul>
          <li>读已经写好的章节不消耗任何额度，读别人的原作线也一样。</li>
          <li>生成新的一章、换一版、介入重演、带化身进入新线、合流推进，消耗当天的生成额度。</li>
          <li>当天的额度先用当天的：免费额度用完后，会员用更高的会员日额度；再用完，才会动章额度（每章 1 个）。</li>
          <li>生成封面和化身立绘有每天的免费张数，用完后每张消耗 1 个图片额度。</li>
          <li>提前备好的下一章只会为会员、或最近三天还在读的故事准备，省得白白生成没人看的章节。</li>
          <li>会员是按天数买断的卡，不会自动续费；到期后回到免费额度，已买的额度包余额不清零。</li>
        </ul>
      </details>
    </div>
  );
}
