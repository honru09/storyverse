# REQ-68 落码处置（分支 billing-rules，基线 c3cd883，本地提交不 push 不部署）

定版文档：~/workspace/sw-prep/req67-book/PRICING.md（定价全表与护栏对账）、~/workspace/sw-prep/req67-book/COST-MODEL.md（成本模型）；规则草案四份在 ~/workspace/sw-prep/legal/，其中三份半已落为站内页（见下）。

## 改了什么

**server/billing.js**
- 新增织币配置 `COIN`：1 织币 = 1000 计量单位；图片定额 40 织币/张；合流系数 1.5（会员 1.2）；每日补足上限 免费 150 / 会员 300。
- `coinCostForText({scene,totalTokens,member})`：按实测用量向上取整结算，合流按系数。
- 商品目录 REQ-68 定版（价格 CNY 不变，内容换织币）：月卡 ¥25/30 天/1200 织币、季卡 ¥68/90 天/3600、年卡 ¥198/365 天/14400（主推）；额度包 小 ¥6/300、中 ¥30/1600、大 ¥68/4000。新目录 chapterCredits/imageCredits 均为 0（存量余额继续有效，见下）。
- 权益记录新增 `coins` 与 `coinGrantDay`；`applyGrant` 发币；`applyDailyCoinTopUp`（每日一次、补足式、会员上限更高、fail-open）；`hasCoins`/`spendCoins`（结算不为负）。
- cost_records 新增 `coinsSpent` 字段（文本与图片），与既有 costCny 双轨并行。
- `publicState` 返回 coins、coin 配置与商品 coins；打开会员页即触发当日补足。

**server/index.js**
- /api/generate 门：身份确定后先落当日补足；反滥用日用量天花板（免费 1M/会员 3M）保持硬顶——织币**不**绕过它，只有存量章额度能越过（与旧口径一致）；天花板之内，织币余额为零且无章额度 → 429 `coins-exhausted`（平台语言文案）。
- 生成成功（非缓存）后按场景与实测用量结算织币；走章额度的那一章不结织币。
- /api/cover 与 /api/avatar/generate：日免张数用完后，图片额度（存量）优先、其次 40 织币买一张，成功才扣。

**客户端**
- BillingPanel：权益区首行改织币余额（存量章/图额度仅余额 >0 时显示）、会员卡与额度包卡面显示到账织币、说明与「消耗规则」换织币口径、购买区下方一行同意语：「订阅即代表同意《会员服务规则》与《用户协议》」+ 链接（规则正文不进购买流程，守用户原话）。
- 主页页脚加法律链接（用户协议/隐私政策/会员服务规则）。

**法律页（public/legal/，静态直达）**
- terms.html（用户协议）、privacy.html（隐私政策）、member-rules.html（会员服务规则）、coins.html（付费与虚拟币规则），与 sw-prep/legal/ 草案同文。

## 兼容与存量（集成波须知）

- 存量章额度/图片额度：读取与消耗路径原样保留，定位为「存量溢出」——章额度仍可越过日天花板，图片额度仍可在日免张数后优先抵扣。
- 未兑换的旧额度包兑换码：码只存 productId，兑换时按**新目录**发织币（pack-6 由 20 章额度变 300 织币）；已兑换到账的额度不受影响。
- 老会员（如实验号 A，会员至 2026-11-29）：无织币发放记录，上线后靠每日补足（会员上限 300/日）运转；如需按新目录补发整月织币，需另行运营动作，本批未做数据迁移。
- 每日补足的日界沿用平台既有 UTC 日界（usage 的 dayKeyFor），与现行用量统计同口径；《会员服务规则》文本以「每个自然日」表述。

## 测试

- tests/billing-server.test.js 对账更新 + 新增 3 个用例（天花板分层、织币门、补足幂等与护栏数学）：12/12 过。
- 全量 1017/1022：5 败为基线 dedup 样本图 ENOENT（worktree 无 avatar-shots 样本），与本批无关；import-daylight 本轮通过。
- npm run build 通过；dist/legal/ 四页齐全，同意语进 bundle。
