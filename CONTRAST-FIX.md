# CONTRAST-FIX（2026-10-29 晚，00040 生产点验新抓）

两条同族病：信息文字在浅/亮面上对比不足。基线 3baa644，单测 816 → 818 全绿。

## 1. 化身页大标题「我的化身」白昼下几乎看不清

**复现结论（先实证）**：本地以 fixture 栈在 Chromium + WebKit 双引擎、白主题实测
`.page-avatar .merge-heading h1`：computed `rgb(31,33,36)`（= 白主题 --ink #1f2124）
压 `--bg #f6f5f2` = **14.80**，入场动画全程 opacity 1——**静态 token 路径在本地不复现**。
再全站扫页面级大标题（home/plaza/forge/store/merge/avatar/profile/write）：
凡能到达的页面标题在白主题下全部解析为 --ink、14.80，无一取错 token。

**真正的结构病**：所有页面级大标题**自身规则里没有任何 color**，全靠
`body{color:var(--ink)}` 继承过活——任何一层祖先换成浅色/压图上下文就会静默翻车，
与 BH-02（--ink-soft 曾指向背景 token）同病族。生产端触发的具体祖先状态在本地
fixture 未能构造出来（不排除真机当时的瞬时状态），但「不钉死就会再犯」是确定的。

**修法**：页面级大标题一律在自身规则内钉 `color:var(--ink)`（L1 墨）：
`.store-heading h1,.merge-heading h1` / `.plaza-heading h1` / `.write-heading h1` /
`.sw-empty-page h1` / `.forge-section-heading h2` / `.section-heading h2` / `.reading-end h2`。
压图标题不在此列（横幅 `.store-banner .store-heading h1` 的 --on-art 覆写保留，守卫钉住）。
渲染零变化（本就是继承的同一值），自此与祖先解耦。

**量测（守卫重算，tests/salt-theme.test.js 新增 CONTRAST-FIX 两条）**：
白 --ink 对地 14.80 / 对卡面 15.33；黑 --ink 对地 15.42 / 对卡面 13.73——均 ≥7。

## 2. 书城横幅 CTA「上架我的故事」压亮图对比弱

**复现**：canvas 采样 CTA 盒下图色 × shade 渐变合成，最坏 **3.89**（p10 5.33）——不及格坐实。

**修法**（不换图、不挪位、不动布局）：CTA 穿盐系实面 chip——
新 token `--on-art-chip:rgba(4,8,20,.62)`，`.store-banner .store-heading .small-link`
加 `background:var(--on-art-chip)` + 发丝亮边 `rgba(245,247,255,.26)` + 999px 圆角 + 横向 padding 12px。
DESIGN.md §51 已补注（与 §51 灰阶/压图口径对齐，无冲突）。

**量测**：同法复测最坏 **3.89 → 11.23**（p10 13.44）；静态下限 = chip 对**纯白图**
合成 5.38 ≥4.5（守卫重算，alpha 下调会被守卫拦）。

## 截图（390×844，contrast-fix-shots/）
avatar-white.png / avatar-black.png / store-white.png / store-black.png——
白主验、黑回归；chip 位置与横幅布局未动，助手亲看通过。

## 记账
- 生产端家族 1 的确切触发状态未在本地复现；若部署后真机再现，需要当时的截图与
  进入路径再定性（怀疑方向：真机瞬时状态/缓存旧包）。钉死+守卫已把该类从代码层关闭。
