# SALT 批次处置笔记（2026-10-29，REQ-15/16/17）

基线 main = f38c26a，未回退其上任何批次。本地提交，不部署、不 push。
规格草案：~/workspace/sw-prep/requirements-2026-10-29/SALT-MOTION-SPEC-DRAFT.md（agy 出稿），
父代理六条裁定优先于草案，逐条落点如下。定稿参数已写入 DESIGN.md §51。

## 一、参数定稿（黑 / 白；极光不变）

| token | 黑 | 白 |
|---|---|---|
| --bg / --bg-2 | #111214 / #17181b | #f6f5f2 / #efece6 |
| --ink / --dim / --dim-2 | #eae9e4 / #9e9fa6 / #878a92 | #1f2124 / #575b62 / #64696f |
| --line / --divider | rgba(255,255,255,.08/.06) | rgba(24,25,27,.08/.06) |
| --surface-card（玻璃卡） | rgba(28,30,35,.72) | rgba(255,255,255,.76) |
| --surface-modal | rgba(24,26,31,.88) | rgba(250,249,246,.92) |
| --card-solid（列表卡实面） | #1c1e22 | #faf9f6 |
| --float-solid（lite 回落） | rgba(18,19,22,.94) | rgba(248,249,251,.95) |
| --topbar-bg / --nav-bg | rgba(17,18,20,.88) | rgba(246,245,242,.90) |
| --blur-bar / --blur-card / --blur-modal | 12 / 10 / 12 px（saturate 1.2–1.25） | 同 |
| --shadow-card | 0 1px 3px rgba(0,0,0,.28), 0 8px 20px -4px rgba(0,0,0,.38) | 0 1px 2px rgba(18,19,22,.03), 0 6px 16px -4px rgba(18,19,22,.05) |
| --shadow-floating | 0 4px 12px rgba(0,0,0,.40), 0 20px 40px -8px rgba(0,0,0,.56) | 0 4px 12px rgba(18,19,22,.05), 0 16px 36px -6px rgba(18,19,22,.08) |
| --text-disabled（唯一可 <4.5 的信息外态） | #454850 | #b4b8bf |

对比度实测（脚本计算，非估）：L2 黑 7.11 / 白 6.26；L3 黑 #878a92 对地 5.43、
对卡面 5.16；白 #64696f 对地 5.08、对卡面 4.83——全部 ≥4.5（裁定 2）。
草案黑 L3 #6e717a = 3.84、白 L3 #6e737b = 4.38，均不达标，已按裁定提亮/压深；
守卫在 tests/salt-theme.test.js 内以亮度公式实测钉住。

全局：页面边距全档 16px（裁定 6，连带 forge-actions/profile-hero/skeleton/storage-warning
的 -20px 出血同步改 -16）；圆角阶梯 media 8 / control 10 / selection 12 / card 16 /
surface 20 / sheet 24；数字 tabular-nums；标点挤压组挂 .page:not(.page-reader) 与弹层，
chips/标签类 opt-out（text-autospace:no-autospace）。

## 二、表面接线（逐面）

- 顶栏/侧栏/底栏：backdrop 换 --blur-bar（16/18px → 12px 上限，裁定 1）；底栏加
  .nav-indicator 滑动指示器（index=plaza0/forge1/store2/profile3，非槽位视图隐藏），
  激活图标上浮 -2px + scale 1.05。
- 平级切换（home/plaza/forge/store/profile）：page-enter 改 view-fade 160ms 纯透明
  （裁定 5，禁整页横滑）；层级视图保留 page-in 上浮（keep-alive 槽架构下不做 X 横滑，
  裁定为许可性表述，记账）。
- 列表循环卡去 blur 换实面：.plaza-card / .avatar-card / .avatar-journey /
  .merge-line-card / .plaza-mine-row → --card-solid + --shadow-card。
- 橱窗/单例面留玻璃（≤12px）：.plaza-panel / .plaza-publish-card / .plaza-continue-card /
  .avatar-stage / .protagonist-form / .ability-list / .merge-controls / .home-draft-row /
  .preview-panel / .sw-toast（→ --surface-modal + --shadow-floating）。
- 主页 hero：.hero-scene 出血 -16px、封面呼吸 6s/≤1.025、rAF 视差 0.15 钳 ±12px
  （Home 内实现，滚出视口不写、motion off/reduced-motion 停泊）。
- 书架：.wood-book 过渡 260→160ms、抽出 scale 1.07→1.04（JS 的 260ms 开书节拍不动）。
- 化身展台：.avatar-frame::after 扫光 7s、alpha ≤.13、pointer-events none。
- 点赞：.is-liked 关键帧 pop（.82→1.18→1，380ms）+ 光环 ::after；关键帧实现，
  不占用弹簧口径（裁定 3 的唯一 sanctioned 例外，按原规格记账）。
- 性格词条 + 创世灵感碎片：入场 trait-in 260ms、20ms 错峰（新 key 重挂载触发）。
- 书城：card-rise 去 filter blur、240ms、错峰 30ms 步进封顶 180ms（原达 630ms）。
- 场景入场（useSceneMotion）：y 8→12、opacity .65→0、duration .22→.24、
  stagger 改为 delay 函数 min(i,6)*30ms 封顶；quiet 模式不变。
- 弹簧 token：--ease-pop/--ease-press 删除过冲控制点（1.8/1.4）→ ζ≥1 的 CSS 表达；
  新增 --ease-spring / --dur-tab 240ms / --dur-fade 160ms。
- lite 降级：MotionProvider 把 policy lowPower 镜像为 html.is-lite-gpu，CSS 下
  chrome 与玻璃面去 blur 换近实色。
- motion off 冻结：.app-shell[data-motion="off"] 关停指示器过渡、呼吸、扫光、
  词条入场、点赞动画（prefers-reduced-motion 全局规则另行覆盖）。

## 三、极光隔离

极光块既有值一字未改；只追加新材质名别名，全部指向极光自己的 token
（--surface-card/--card-solid → var(--glass)、--card-backdrop → blur(12px) 还原
旧广场卡材质、--shadow-glass-top → 透明无操作、--blur-bar → blur(16px) saturate(1.35)
还原旧顶栏）。守卫 tests/salt-theme.test.js 五条：极光钉值+别名、黑白盐系钉值、
对比度实测、blur 上限、动效 token 语法。截图 home/plaza 极光各一张亲看：藏青玻璃原样。

## 四、验收实测

- 单测：816/816 全绿（基线 811 + 新增 SALT 守卫 5）。中途一跑出现 1 条失败、
  重跑全绿——与基线期记录的同一 flake 模式（0 vs 1 时序断言），最终验收跑全绿。
  旧钉值两处按 §51 更新并注明 supersede：shell-migration（黑白 --bg/topbar 钉值）、
  list-layout-ui（抽书 scale 1.07→1.04）。
- e2e（本地 AUTH_ENABLED=false 服务器）：reader 33/33、onboarding 18/18、
  intervention 7/7、control 5/5、delete-book / edit-book / cloud-library ok。
- **既存失败（基线 A/B 实锤，非本批回归）**：journey 16/18（书城不列刚发布的本机书，
  基线 f38c26a 同款 16/18）、gemini（分享/合流 click 超时，基线同）、recovery
  （备份导出 download 超时，基线同）、title-flow / write-mode（注册断言——本地
  AUTH_ENABLED=false 下账号服务未配置、根本无法注册，基线同）。四条留给父代理排期，
  与 SALT 无关（styles/motion 改動不经这些路径，A/B 双跑一致）。
- 帧率（390 Chromium、xvfb、rAF 采样）：抽书 avg 59fps、长帧 1.5%、最差 33ms；
  页签→广场 58fps / 3.5%；页签→造世 59fps / 1.8%；页签→书城 56fps / 7.0%
  （8 个长帧全为 33ms 单掉帧，集中于首屏封面图解码，非动画掉帧）；
  弹层打开（阅读设置）60fps / 长帧 0。报告 salt-shots/fps-report.json。
- 截图矩阵（salt-shots/，逐张亲看）：home/plaza/store/forge × 黑/白 × 390、
  home/plaza × 极光 × 390、home 白 360、home 黑 430，共 14 张。自查：边距 16 一口径、
  chips/步骤签单行、无横向溢出、卡片制式统一、压图字走 --on-art、指示器在位；
  hero 标题两行是书名本身长度（数据），非排版孤字问题。

## 五、驳回与记账

- 草案驳回（裁定 4）：青黛换色、主按钮禁渐变——未执行，品牌色与按钮身份未动
  （守卫钉 --action 原值）。
- 草案修正（裁定 2/3）：L3 双色提亮/压深达标；欠阻尼弹簧两处（按钮 ζ≈0.78、
  卡片 ζ≈0.85）不落数值，改以无过冲 cubic-bezier 表达 ζ≥1（全站既有弹簧本为
  GSAP/CSS 缓动而非物理参数，口径等价且更严）。
- 顶栏 alpha：草案 .78 否决，定黑 .88 / 白 .90（BH-10 透印红线优先于玻璃感）。
- 白 --line 定 .08 而非草案 .06：BH-02 教训 + 草案 §6.1 自警（.05–.06 在部分
  Android 屏近乎不可见），发丝线须可辨。
- 未碰：account.css 登录卡（LOGIN-REDO 定版：登录页恒深色玻璃）、reader 三个 CSS
  （阅读面红线；消息面板骑阅读器共享 ReadingDialog，其材质归阅读面系统，本批不动）、
  标签去彩虹化（属品牌身份，裁定 4 范围外）、按压/释放时长拆分仅落主要控件
  （长尾保留 120ms 无过冲，偏差记账）。
- 拍不到的表面：已登录态的主页/设置窗/化身页——本地服务器账号服务未配置
  （AUTH_ENABLED=false），游客点主页只达登录窗；这三面只做了 token 层接线，
  截图验收待部署后随用户真机点验补（与阅读设置等既有待验项同批）。
