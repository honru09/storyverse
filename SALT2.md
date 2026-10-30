# SALT-2 显形预览（REQ-23）— 只做预览，不部署、不推送

背景：SALT 第一版（DESIGN §51）只动了 token 数值，用户真机判定「没看出来优化了」。本轮目标不是再调数值，而是让盐系在截图里**一眼可见**：层级拉开、轮廓成形、悬浮毛玻璃。先在本地分支做预览截图给用户点头，点头后才另批落码部署。

## 工作方式
- 从 c602d42 建独立 worktree + 分支：`git worktree add ../storyverse-salt2 -b salt2-preview c602d42`，所有改动只在该 worktree；不 push、不部署、不碰主工作树。
- 极光（aurora）主题块与别名一字不动；tests/salt-theme.test.js 中钉 §51 旧值的断言在本预览允许失败（如实报告哪几条），钉极光冻结的断言必须保持绿。

## 改动规格（只动 styles.css 的 black / white 两主题块 + 下列结构规则）

### 1. 地面与卡面层级拉开
- 黑：`--bg:#101012`、`--bg-2:#151619`；`--card-solid:#202227`；`--surface-card` 同步提亮一档（rgba(32,34,39,.78)）；`--shadow-card:0 1px 2px rgba(0,0,0,.42),0 14px 34px -10px rgba(0,0,0,.55)`；`--line:rgba(255,255,255,.10)`。
- 白：`--bg:#edeae3`、`--bg-2:#e6e2d9`；`--card-solid:#ffffff`；`--surface-card:rgba(255,255,255,.82)`；`--shadow-card:0 1px 2px rgba(30,27,20,.05),0 18px 44px -14px rgba(30,27,20,.16)`；`--line:rgba(24,25,27,.09)`。
- 内容卡统一吃 `--shadow-card` + 顶部高光：给 `.plaza-card,.store-book-card,.profile-panel,.plaza-panel,.hero-card`（以实际类名为准，先 grep 现有卡面类）加 `box-shadow:var(--shadow-card), inset 0 1px 0 var(--card-top-hi)`，新增 token `--card-top-hi`（黑 rgba(255,255,255,.07) / 白 rgba(255,255,255,.9)）；圆角统一到 surface 档 20px（已是的不动）。

### 2. 悬浮胶囊底栏（最显形的签名动作）
- `.mobile-bottom-nav` 改悬浮胶囊：left/right 16px、bottom calc(10px + env(safe-area-inset-bottom))、border-radius:999px、background:var(--nav-bg)、backdrop-filter:blur(18px) saturate(1.35)、border:1px solid var(--line)、box-shadow:var(--shadow-floating)。
- `--nav-bg` 黑改 rgba(22,23,26,.72)、白改 rgba(255,255,255,.66)。
- 页面底部留白同步加大（body/main 底部 padding 至少 96px），确保内容不被胶囊遮住；选中态 pill 保持现行制式。
- is-lite-gpu 回落：胶囊用 --float-solid 近实色（既有机制，照用）。

### 3. 顶栏毛玻璃
- `.topbar`：background:var(--topbar-bg)（alpha 不动，保 BH-10 对比红线）+ backdrop-filter:blur(16px) saturate(1.3) + border-bottom:1px solid var(--line) + inset 顶高光。滚动内容透过顶栏时要能看出玻璃感。

### 4. 分区标签盐系化
- 分区标题上方的 eyebrow/小标签（如广场「关注动态」类 section label）：11px、letter-spacing:.14em、color:var(--dim-2)、uppercase（中文无大小写则仅字距+灰阶）。只改已有 label 类，不新增文案。

### 不许动
- 品牌强调色、主按钮渐变、阅读面（.page-reader 内部）任何样式、动效参数、极光块、文案。
- 渐进模糊不许用（mask 式渐进模糊不在本批）。

## 截图交付（核心产物）
- 用 device-fix 的同款 fixture 方式起本地服务（可参考主工作树 device-fix-shots/fixture-server.mjs 的做法），390×844、禁 fullPage。
- 同一 fixture 数据下拍 4 个表面：广场、书城、书籍详情、个人主页；每表面 × 黑/白两主题 × 改前（主工作树现行构建）/改后（salt2 分支构建）= 每表面 4 张。
- 合成 4 张对比图（每表面一张 2×2：左上 黑·改前、右上 黑·改后、左下 白·改前、右下 白·改后），格上烧入小标签（黑·改前 等），存 `salt2-shots/compare-<surface>.png`，另存全部 16 张单图。
- 报告：改了哪些 token/规则（逐项对照本规格）、单测结果（全跑，列出失败项并标注哪些是 §51 旧值守卫）、worktree 路径与分支名。截图由主助手亲看后再报用户，你不要自评「好看」。
