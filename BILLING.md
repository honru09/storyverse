# BILLING — 收费专项（2026-10-29）

基线：本地 main `56004b0`。本批只落码 + 本地提交，不 push、不 deploy、**不接真钱**：Stripe 只做代码与开关，密钥与商户开通是用户后续人工步（清单在 §5），未配齐时整段禁用、界面不露出，本批没有任何一处假装已通。

定版口径（用户已拍板，本批未改价）：卖卡不卖自动续费——**月卡 ¥25 / 季卡 ¥68 / 年卡 ¥198（主推）**，**额度包 ¥6 / ¥30 / ¥68**。全站只认一套权益：**兑换码 + 到期日**（会员 = 账号上的会员到期日；额度 = 章额度 / 图片额度两个余额）。政策：免费给「读」（读现成章节永不收费，含读别人的原作线），收费给「造」（生成新章 / 换一版 / 介入重演 / 带化身进入 / 合流推进消耗生成额度；封面与立绘走图片额度）。

## 1. 成本计量（server/billing.js）

- 每次文字生成（非缓存命中）在服务端落一条成本记录：uid、场景、输入/输出 token、模型、折合人民币、是否预生成、storyId / 章序 / 章 id、是否动用了章额度。图片生成（封面 `cover` / 立绘 `avatar`）同样落记录（按张计价）。缓存命中不重复计量（与 usage 台账既有口径一致）；记录 fail-open——台账故障永不阻塞生成、永不编造数字。
- **场景分类**只读请求体：`mode: revise` → intervention（介入重演）；`mode: reroll` → reroll（换一版）；`kind: merged` → fusion（合流推进）；`config.sourcePublicationId` → entered（带化身进入）；其余 → chapter。**是否预生成**按请求快照推断：被生成的章排在读者已到达位置之前之后——`index > story.readerIndex` 即预生成（准备路径恒从读者所本站发出下一章请求；按需生成时读者已站在缺章处，`index ≤ readerIndex`；首章为 position 0 / index 0）。不改生成协议（`validatedRequest` 的字段白名单不动）。
- **单价表**是配置常量（`PRICE_TABLE`，含来源日期 `PRICE_TABLE_AS_OF = 2026-10-28`）：Gemini Flash 档公开牌价（输入 $0.30/1M tokens、输出 $2.50/1M tokens；`gemini-2.5-flash-image` $0.039/张）按 USD/CNY 7.2 折合（输入 ¥2.16/1M、输出 ¥18/1M、图片 ¥0.28/张）。`gemini-3.8-flash` 无单独公开牌价，暂按 Flash 档计，运营定价后只改此表。输入侧取服务商上报的 prompt token 总数（缓存内容含在其中，不另加价）；输出侧 = candidates + thoughts。
- **单章实测成本**：CHAPTER-AB 生产实测一章平均 ≈8,060 总 token。按本表、按典型混合比（输入为主）折合 ≈ **¥0.03–0.08/章**，规划口径取 ¥0.08（区间上沿，留余量）。台账上线后以真实分项为准复核。
- **内部汇总**：`scripts/billing-summary.mjs`（`DATA_STORE=firestore node --env-file-if-exists=.env scripts/billing-summary.mjs`）输出 JSON：按日 / 按用户 / 按场景的记录数、token、图片张数与金额；以及**预生成去向**——与云端书库联表判定：打开过且章 id 仍是付费那份 = opened；槽位已被别的章顶替或章已不存在 = discarded；付费副本还在原地没人读 = unread；故事从未同步 = unknown（不硬判）。浪费率 = discarded / (opened + discarded)，只跑已定案的部分。核心聚合是纯函数 `summarizeCostRecords` / `summarizePregeneration`，有单测。

## 2. 权益与额度引擎

账号权益记录（`billing_entitlements`，按 uid）：`memberUntil`（ISO 或 null）、`chapterCredits`、`imageCredits`、兑换失败时间戳（防刷用）。

**消耗顺序（写死）**：文字生成先用当天额度——免费用户沿用现行 `GENERATION_DAILY_TOKEN_CAP`（默认 1,000,000 token/天，**行为不回退**）；会员用会员日上限；当天额度用尽后才动章额度（每章 1 个，生成成功后才扣，失败不扣）。图片先用封面/立绘服务各自的每日免费张数（现行机制不动），用尽后每张动 1 个图片额度（凭额度调用服务时跳过其日上限检查且不占免费计数，成功后才扣额度）。

**会员日上限 = 3,000,000 token/天**（配置常量 `DEFAULT_MEMBER_DAILY_TOKEN_CAP`，env `MEMBER_DAILY_TOKEN_CAP` 可改）。理由（按实测成本 × 安全边际）：月卡 ¥25、单会员月成本上限按既定政策卡在月费 50% = ¥12.5；按规划口径 ¥0.08/章，¥12.5 ≈ 156 章/月 ≈ 5 章/天——这是「重度但真实」的读者强度。日上限的职责是防滥用天花板而非按量卖：3,000,000 token ≈ 372 章/天，正常会员永远碰不到；真实成本由计量层持续观测，若分布漂移，运营改配置即可收紧，不动逻辑。免费上限 1,000,000 ≈ 124 章/天同理（既有行为，维持）。

**额度包定量**（价格用户已定，量按上表成本定）：¥6 → 20 章 + 2 图；¥30 → 110 章 + 12 图；¥68 → 260 章 + 30 图。章额度零售 ≈¥0.26–0.30/章，为计量成本（¥0.08）的 3.3–3.8 倍；图片额度随包附赠（成本 ¥0.28/张，包内单价 ¥2.3–3/张，增值定位）。

**预生成经济门**（与 FRONTIER-FIX 叠加，前沿语义以前沿为准、本批不碰）：客户端准备下一章前多一道门——**会员，或这条线近 3 天内被碰过**（`story.updatedAt` 在 3 天内；无时间戳的旧档视为活跃，不夺走老读者已备章的手感）。读者正在读的书天然满足活跃条件（打开即刷新 updatedAt），被晾置的线不再为免费用户白烧预生成。按需生成（读者点开缺章）永远不经此门。

## 3. 兑换码系统

- 码形 `ZJ-XXXXX-XXXXX-XXXXX`（无易混字符字母表，15 位 ≈ 74 bit 熵）。**只存 SHA-256**（与 identity-store 的会话令牌同纪律），库存哈希、商品、批次、生成人、兑换人/时间；明文只在生成响应里出现一次。
- 生成：`POST /api/billing/codes`（官方身份限定，复用 `isOfficialUid` 派生判定，不收任何请求标记），单次 1–100 个，面额 = 商品目录 6 件中的一件（三档会员卡 + 三档额度包；码的种类口径即月卡/季卡/年卡/额度包四类）。
- 兑换：`POST /api/billing/redeem`（登录必需）。成功 → `grantProduct` 入账（会员从 max(现在， 现到期日） 顺延；额度累加），码即作废并留痕，失败计数清零。
- 防刷：同账号兑换失败按时间戳记账，滚动 1 小时内满 5 次 → 后续兑换 429 一小时；未知 / 格式错 / 已用过**同一个报错**「兑换码无效或已使用。」，接口不可用于枚举活码。
- 所有渠道共用 `grantProduct` 一条入账路径：兑换码、Stripe 回调、将来爱发电发码都只是「谁来触发」的区别，不另建权益形状。

## 4. 会员页（渐进式披露）

入口：我的主页 → 设置 → 账号组「会员与额度」行 → 同制式窗口。首屏只有三件：**我的权益现状**（会员状态与到期日、章额度、图片额度 + 一段政策说明）、**兑换码输入行**、**价格区**（三档卡 + 三档包，价格取服务端目录）。消耗规则收在底部「消耗规则」折叠里（details，默认合上）。购买通道未通时价格区下方只有一句如实说明「购买通道即将开通，可先用兑换码开通会员和额度。」——**不放任何假按钮**；Stripe 配齐后同一位置换成真实购买按钮（每件一个，点击跳 Stripe 托管页）。

接口：`GET /api/billing/me`（状态 + 目录 + stripeEnabled）、`POST /api/billing/redeem`、`POST /api/billing/checkout`。客户端 `src/billing.js` + `src/components/BillingPanel.jsx`，预生成门用的会员判定在 `billingGateMember` 里按会话缓存（兑换成功后失效重取）。

## 5. Stripe 接入预备（只代码）与开通清单

代码（`server/stripe.js`）：Checkout 会话创建（REST 直调，不引 SDK；商品与目录 6 件一致；`price_data` 人民币分计价；`payment_method_types = card / alipay / wechat_pay`，微信附 `payment_method_options.wechat_pay.client = web`；metadata 带 uid + productId）；webhook 验签（`Stripe-Signature` 的 HMAC-SHA256 over `t.payload`，5 分钟容差，定长比较）→ `checkout.session.completed` 且 `payment_status = paid` 才入账，按 **session id 幂等**（`stripe_events` 落痕，重放不重复发权益）。整段 env 门控：`STRIPE_SECRET_KEY`（sk_ 前缀）/ `STRIPE_WEBHOOK_SECRET`（whsec_ 前缀）/ `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` 任一缺失或形状不对 → `enabled: false`，checkout 回 503、会员页不露购买区。webhook 路由是全站唯一豁免 Origin 纪律的 POST——它的认证就是签名本身（index.js 里明示）。

**用户开通步骤（上线检查项，本批未执行）**：
1. 用日本主体激活 Stripe 账户，完成身份与收款银行验证。
2. Stripe 后台 Settings → Payment methods，分别开通 **Alipay** 与 **WeChat Pay**（微信支付需在 Stripe 侧提交商户资料并等审核通过）。
3. Developers → API keys 取 **Secret key**（sk_live_…）；Developers → Webhooks 新建端点 `https://story.tabarcade.online/api/billing/stripe/webhook`，订阅事件 `checkout.session.completed`，取该端点的 **Signing secret**（whsec_…）。
4. 给 Cloud Run 服务加四个环境变量：`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`STRIPE_SUCCESS_URL`、`STRIPE_CANCEL_URL`（成功/取消都建议回站内，如 `https://story.tabarcade.online/`——付款结果以 webhook 入账为准，会员窗打开即是最新状态）。
5. 先用一笔 ¥6 测试单全程验：结账页出现支付宝/微信支付 → 付款 → 会员窗章额度 +20 → Stripe 后台 webhook 显示 200。
完成第 4 步后无需改代码，购买区自动出现。

## 6. 数据与接口新增

- `server/billing.js`：价格表、商品目录、场景/预生成判定、成本记录、权益引擎、兑换码、聚合纯函数；存储 `billing_entitlements` / `billing_codes` / `cost_records` / `stripe_events` 四集合（memory + firestore 双实现，与 identity-store 同工厂口径）。
- `server/stripe.js`：env 门控、Checkout 创建、webhook 验签与幂等入账。
- `server/index.js`：`/api/generate` 接会员上限 + 章额度 + 成本记录；`/api/cover` 与 `/api/avatar/generate` 接图片额度重试 + 图片成本记录；新增 `/api/billing/me|redeem|codes|checkout` 与 `/api/billing/stripe/webhook`。
- `server/cover.js` / `server/avatar.js`：`request/generate` 增加 `{ credit }` 选项（跳过日上限、不占免费计数），默认行为逐字不变。
- 客户端：`src/billing.js`、`src/components/BillingPanel.jsx`、设置窗入口行、`prepareChapter` 预生成门、`.billing-*` 样式（主题变量，三主题通吃）。

## 7. 验证

- 单元全量 **768/768**（基线 759 + 本批 `tests/billing-server.test.js` 9 条：场景/预生成纯函数与单价、计量落账、免费上限→额度包续章且只在成功后扣、会员上限不耗额度、码一次性 + 同一报错 + 5 次失败限频 + 非官方发码 403、图片额度越过封面/立绘日上限、未配 Stripe 时 checkout 503、Stripe 结账表单含支付宝/微信 + webhook 验签/幂等/坏签名 400、聚合与预生成去向判定）。
- e2e `node e2e/billing.cjs` 全链 PASS：生成一章 → 成本记录落账 → 免费上限拦截 → 官方发码 → 兑换到账 → 额度续章（19 剩）→ 月卡到账 → 会员状态与上限生效（不再耗额度）。
- 既有回归：onboarding e2e 18/18、reader e2e exit 0（预生成路径在内）；`npm run build` 过。
- 截图（390×844，`billing-shots/`，夹具 `dev-server.mjs` + `run.mjs` 15 项断言全过）：会员窗首屏——权益现状、兑换行、六张价格卡（年卡主推高亮）、通道未通的如实说明、无任何购买按钮、规则折叠未展开。截图 `billing-shots/member-390.png`（按惯例不入库）。

## 8. 已知边界

- 额度扣减在进程内按账号串行 + 单次存储写入；多实例并发下与封面/立绘日上限同级的极小竞态窗口存在（既有口径，不在本批升级为事务）。
- 预生成「是否打开」的判定依赖云端书库联表：只在本机读、从未同步的故事记 unknown，不并入浪费率分母。
- 缓存命中的生成不落成本记录（首次生成时已计量，沿 usage 台账口径）。
- Stripe 的 `price_data` 为即时计价：目录改价只改 `PRODUCTS` 一处，结账与兑换码面额自动一致；历史订单价格以 Stripe 侧记录为准。
