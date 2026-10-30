# AURORA-ALIGN（REQ-41 拍板落码）：极光向黑白盐系全面看齐

依据：用户 2026-10-30 16:21 亲令「极光也向黑白看齐」。口径：**极光保留深蓝底色身份**（--bg #060d1f / --bg-2 / 全部既有色值一字未动），其余设计参数全面对齐 DESIGN.md §53。基线 aa1c098，worktree 分支 aurora-audit，未合 main、未部署。

方法：审计表（AURORA-AUDIT.md）B/C 组逐项落码——给极光补定义 §53 的 `--glass-*` token 组（极光值、盐结构），再把 §53 全部盐规则的选择器作用域扩展至极光，规则本体一字不改，极光经自己的 token 解析。改前值 = 审计 probes 实测；改后值 = 胜出规则 + 极光 token 解析的级联推导，并由新守卫断言逐项钉住（tests/salt-theme.test.js AURORA-ALIGN 段）。运行时截图本轮未能捕获（见文末环境记），数值表待浏览器环境恢复后以 aurora-align-probe.mjs（已入库本目录）补测。

## 逐项对账（改前 → 改后 → 对齐的 §53 条款）

| # | 项 | 改前（极光实测） | 改后（极光，token 解析） | §53 条款 |
|---|---|---|---|---|
| 0 | --glass-* token 组 | **未定义**（--card-top-hi / --glass-card-* / --glass-chip-* / --glass-nav-bg / --glass-modal-bg / --glass-panel-pad / --detail-amb-* 全缺，盐规则零消费） | 定义于极光 :root：--card-top-hi rgba(190,214,255,.12)；--glass-card-bg rgba(13,24,52,.50)（极光实面 #0d1834 同结构染色）、blur blur(22px) saturate(1.45)、line rgba(168,196,255,.24)、edge rgba(168,196,255,.14)、shadow 0 18px 44px -12px rgba(2,6,20,.55)、radius 26px；--glass-chip-bg rgba(148,178,255,.16) / blur(14px) saturate(1.35)；--glass-nav-bg rgba(6,13,31,.98)；--glass-modal-bg rgba(13,24,52,.74)；--glass-panel-pad rgba(4,8,20,.30)；--detail-amb-opacity .38 / filter blur(48px) saturate(1.3) brightness(.88) | §53 玻璃卡组 / 小片与弹层 / 详情氛围（同名同结构、极光色） |
| B-01 | 分区标题（.plaza-feed-heading h2 / .plaza-section-title / .section-heading h2） | 19px 粗体、color --ink（基规则 19px / 18px·650） | **11px / line-height 1.5 / letter-spacing .14em / color var(--dim-2) = #8498bd**（极光三级色阶）——盐标签规则选择器扩展极光 | §53 SALT-2 基座·分区标签 |
| B-02 | 顶栏 | --topbar-bg rgba(6,13,31,.93) + backdrop blur(16px) saturate(1.35)（--blur-bar 别名）、**无 inset 高光** | backdrop **blur(20px) saturate(1.45)**（SALT-3 chrome 规则扩展）+ **box-shadow inset 0 1px 0 rgba(190,214,255,.12)**（SALT-2 规则扩展，--card-top-hi 已定义）；底色仍 rgba(6,13,31,.93) 不动；lite 档回落 blur none 与黑/白同规则 | §53 顶栏（写死） |
| B-03a | 卡面材质（.plaza-card / .plaza-panel / .plaza-continue-card / .profile-store-card） | bg rgba(148,178,255,.08)（--glass/--surface-card）、backdrop blur(12px)、radius 16px、border --line .20 | bg **rgba(13,24,52,.50)**、backdrop **blur(22px) saturate(1.45)**、radius **26px**、border 1px **rgba(168,196,255,.24)**、shadow = 玻璃影 + 0 0 0 1px edge .14 + inset 顶高光（SALT-3 卡面规则扩展）；哑光/lite 态吃 SALT-2 规则：--shadow-card + inset 高光 + radius 20px | §53 玻璃卡组 |
| B-03b | 详情面板（详情作用域追加） | 同 B-03a 旧值，且无垫层、面板直接贴封面氛围（氛围层本身也不渲染） | 详情作用域 token 覆盖：--glass-card-bg **rgba(16,30,64,.64)**、--glass-card-line **rgba(168,196,255,.32)**（新增极光行，结构同黑 .60/.20 一步加深加亮）；面板 ::before 垫层 **rgba(4,8,20,.30)** 生效（规则扩展） | §53 裁定③（详情面板实体感与可辨边线） |
| B-03c | chips（.plaza-chip / .profile-main-chip） | bg rgba(148,178,255,.14)（--glass-2）、无 blur | bg **rgba(148,178,255,.16)** + backdrop **blur(14px) saturate(1.35)** + border var(--glass-card-line) + inset 顶高光（规则扩展） | §53 玻璃上的小片 |
| B-03d | 广场卡封面溶图（.plaza-card .world-art） | 无 mask、硬边 | mask linear-gradient(180deg,#000 76%,transparent 99%)（新增极光单条规则；原盐规则含 .store-book-card 的一半**不扩展**，见不动清单） | §53 玻璃卡组·封面下缘溶图 |
| B-04 | 底栏 | 整幅栏：left/right 0、bottom 0、radius 0、bg rgba(6,13,31,.94)、blur(16px) | **悬浮胶囊**：left/right **16px**、bottom **calc(10px + safe-area)**、radius **999px**、1px 边；非 lite 时 bg **rgba(6,13,31,.98)**（--glass-nav-bg）+ blur(12px) saturate(1.3) + border-color var(--glass-card-line)；lite 时 --float-solid 实面回落（规则扩展）；页面底部留白同步 calc(96px + safe-area)（规则扩展） | §53 裁定②（胶囊形态 + 近实色不许透字；.98 与黑同档，守卫断言 alpha ≥ .98） |
| — | 弹层（.sw-dialog / .reading-dialog / .profile-edit-sheet） | bg --surface-solid #0d1834 实面、backdrop blur(12px)（--blur-modal 别名） | bg **rgba(13,24,52,.74)** + backdrop **blur(20px) saturate(1.45)**（规则扩展） | §53 玻璃上的小片与弹层 |
| C-01→ | 详情氛围层 .detail-ambience | **display:none**（盐专属，DEVICE-FIX3 定案冻结保留） | **display:block**：高 660px、mask 50%→97%；图 opacity **.38**、filter **blur(48px) saturate(1.3) brightness(.88)**、scale(1.3)；详情根 position/z-index 规则同步扩展 | §53 详情页封面氛围 |
| C-03→ | 全局氛围层 .salt-ambient | display:none（极光只有自有 .aurora-bg 漂移层） | **display:block**：同盐几何三晕、极光蓝紫值（青 .10 / 紫 .13 / 青 .05），叠在 .aurora-bg 之上、内容之下 | §53 全局氛围层 |
| C-02 | 个人主页豁免（裁定①） | 三主题同结果（极光基规则本即无玻璃板） | **结果不变、机制补齐**：极光 hero-id/stats 玻璃板规则不扩展（基呈现即豁免结果）；但卡面规则扩展后 .profile-store-card 会被玻璃规则命中，故 SALT-3-FIX 的 .profile-store-card 豁免规则**扩展至极光**——主页内该卡继续吃 var(--profile-card, var(--profile-panel)) 实面、radius 18、无 blur 无影 | §53 裁定①（三主题同规） |

## 守卫更新清单（逐条 + 依据；无静默弱化）

依据统一为用户 2026-10-30 16:21 令（REQ-41 拍板），该令 supersede §53 末条「极光不在本批范围/冻结断言不弱化」与 DEVICE-FIX3 REQ-36 的冻结保留定案。

| 文件 | 改动 | 说明 |
|---|---|---|
| tests/device-fix3.test.js | REQ-36 测试**改判重写**为 REQ-36/41：氛围层 display 规则查找串加极光选择器并断言 display:block；`!aurora.includes('--detail-amb-')` 负断言改判为正断言（opacity .38 / filter 极光值在位）；身份钉 --bg / --nav-bg 原样保留 | 原断言钉的正是本令推翻的冻结，前提消失、按新规矩重钉；注释里完整保留 REQ-36 的历史定案与 supersede 链 |
| tests/salt-theme.test.js | 文件头注 jobs 1/3 改写（冻结→身份保留 + AURORA-ALIGN 新增名族） | 与新规矩对齐 |
| tests/salt-theme.test.js | 首测改名并**加钉**：原有极光身份钉与 §51 别名钉一字未删，新增 --glass-* 全组极光值钉（13 项） | 只加不减 |
| tests/salt-theme.test.js | blur 纪律测：标题与注释去掉「aurora frozen」表述（极光盐规则与黑/白共用声明、扫描只计一次的事实不变，机制未动） | 表述对齐 |
| tests/salt-theme.test.js | 裁定测**加钉**：极光 --glass-nav-bg alpha ≥ .98、.salt-ambient 极光渲染、.profile-store-card 极光豁免在位 | 裁定①②向极光延伸的钉 |
| tests/salt-theme.test.js | **新增** AURORA-ALIGN 测：11 条作用域钉（胶囊/顶栏 16 与 20 两档/分区标签/卡面/chips/弹层/氛围层/广场封面溶图/详情作用域 .64·.32）+ 书城卡玻璃壳**未**扩展的负钉 | 本批的主守卫 |
| DESIGN.md §53 | 末尾加 AURORA-ALIGN 追记 bullet（值表 + 例外 + supersede 链）；原文一字未删 | 规格记账 |

其余涉极光守卫（shell-migration 的身份钉、theme-migration、device-fix3 REQ-35 等）逐个核过：本批不动其断言对象，全部原样通过。

## 不动清单（按简报）

- 个人主页玻璃豁免的结果（三主题同规，见上 C-02）；极光 hero/stats 不加玻璃板。
- 阅读面：reader CSS / --reader-* 零改动（shell-migration 的 readerCss 无 shell-theme 断言通过）。
- 登录页恒深色：零改动。
- §54 卡面文字规格：零改动。
- **书城卡本体**：.store-book-card 玻璃壳规则（bg/blur/padding 内嵌制式）与 .store-card-status 规则**不扩展**，极光书城卡维持基线形态（bg 透明 + 基规则），其最终口径归 store-design 批（A-01 仍在其手上）。本批只对齐其周边 chrome（顶栏/筛选/氛围层等共享面）。
- 极光既有 token 值：--glass/--line/--blur-* 别名/--topbar-bg/--nav-bg 等全部原值（身份钉守卫在位）。

## 改动文件

- src/styles.css：极光 :root 新增 token 组；SALT-2 块 7 条规则扩极光作用域（底栏/lite 底栏/顶栏/lite 顶栏/页面留白/卡影/分区标签）+ 块注更新；SALT-3 块扩极光（氛围层 display + 极光晕值、卡面、chips、顶栏、底栏、弹层、详情氛围 4 条、广场封面溶图单条）+ 块注更新；SALT-3-FIX 块：.profile-store-card 豁免扩极光 + 新增极光详情作用域行；store 相关两条规则原样未动。
- src/components/AuroraBackground.jsx：.salt-ambient 注释更新（极光现也渲染）。JSX 结构零改动。
- DESIGN.md：§53 追记一段。
- tests/salt-theme.test.js、tests/device-fix3.test.js：如上守卫更新。
- aurora-align-probe.mjs：computed 补测脚本（环境恢复后直跑，输出极光/黑对照 JSON）。

## 测试与验收

- `node --test tests/*.test.js`：**851 测 / 843 过 / 8 败**。8 败与审计时基线（842/850）同构成、与本批无关：5 条 ③a 立绘样本图未入库（worktree 既有基线）+ 3 条测试向 tmp 写 fixture 被本沙箱现行写拦 EPERM（gemini-server / release-safety）。本批新增 +1 测（AURORA-ALIGN 主守卫），salt-theme + device-fix3 两文件单独跑 **19/19 全绿**。
- CSS 语法：postcss 解析通过（1617 条规则），关键选择器/token 存在性逐项核过（脚本断言含书城卡负项）。
- **未完成（如实）**：① 运行时截图与 computed 运行时实测未捕获——本机浏览器栈仍是审计期的故障态（Playwright 两次启动即关、全量 chromium 亦然），且 vite build 写盘被 EPERM 拦、fixture 的 dist 无法重构；改后数值表为级联推导 + 守卫断言双证，截图与 probe 实测待环境恢复后补（脚本已备）。② git commit 同被 EPERM 拦（.git index.lock 写失败），改动全部落盘于 worktree（git diff --stat 可证：5 文件 +155/−58），提交待环境恢复由主助手补。
