# REQ-70 化身展台视觉二修处置笔记（SHOWCASE-VISUAL）

基线 origin/main `0a02800`，分支 `showcase-visual`（只本地提交）。用户 2026-10-31 09:04 真机 00051 亲报两条：「化身背景感觉没做好，不是同比例」「头像还是没解决」。REQ-64 的零滚动干预与整卡入框裁定未动、未回退；本批只动视觉层。规则定版已入 DESIGN.md §58。

## 一、展台：背景与前景同比例化

病灶：旧 `.profile-showcase-backdrop` 是同一张立绘的 cover 放大模糊版，前景是 contain 整幅——同一幅画以两种比例叠放（幽灵剪影出现两次、大小不一），且橘子立绘自带的白色底在前景矩形边缘形成硬接缝。

改法（三层，图框 4:3 与整卡高度不变）：
1. **填充层** `.profile-showcase-fill`：底色不再用卡面色，由立绘**自身边缘色调**采样生成——新模块 `src/art-edges.js`（纯函数 `sampleEdgeColors` 取四边 5% 带均值；浏览器侧 `samplePortraitEdges` 缩放解码+缓存），组件 `ShowcaseFill`（ProfilePage 内小组件，hook 安全）把 顶色→均色→底色 拼成竖向渐变。自带浅色底的立绘，其底色直接长满图框——接缝在结构上不存在。采样失败回落卡面色。实测橘子/阿灿边缘采样均为近白（fill 渐变首站 rgb(252,253,253) 起）。
2. **光晕层** `.profile-showcase-halo`：与前景**同一张图、同一 contain 几何、同一 50% 50% 锚**的一个 `<img>`，只多 blur(26px) 与 scale(1.1) 的透气——图里任何图案只以与前景相同的比例出现一次，身后不再有第二套比例。旧 backdrop 规则与白主题覆盖一并删除（且避开 device-fix3 对主题作用域 showcase 规则的禁令，未加任何主题滤镜）。
3. **前景** `.profile-showcase-img`：不动（contain、头→鞋入框，REQ-64 裁定）。

## 二、小头像位：统一脸锚规格（DESIGN §58）

盘点发现同图在不同位点的旧配方互不相同（实测同两张真实立绘的出图：头占框高 橘子 87% 切叶/广场 32px 位连下巴切、阿灿 40–72% 之间乱跳）——这就是「头像还是没解决」的实指。

**规格（单一事实源 = styles.css `:root` 四变量）**：
- 立绘类：`object-position:50% 0%`（--face-pos）+ `transform:scale(1.7)`（--face-zoom）+ `transform-origin:50% 0%`（--face-origin）。顶锚同点变焦 ⇒ 方框可见窗恒为原图顶部约 43% 高切片。
- 上传/默认类：`object-position:50% 12%`（--face-plain-pos）、不变焦（用户裁剪步已自框构图）。
- 量测依据（生产真实立绘五张：橘子/阿灿/秦烬/沈知遥/陆鸣，768×1052 或 1018）：头顶 3.0–9.4%、头底 18.4–36.8%、脸高 8.5–13.4%、脸横心 0.48–0.57。本规格下五张全部整头入框（头底最深者占框高 85–86%，下留肩），脸高占框高 20–31%。zoom 取 1.7 而非 2.0：2.0 时切片高 36.5% < 沈知遥头底 36.8%，会切下巴——定数是被语料逼出来的。

位点清单（位点 → 收敛方式；全部只改 CSS 规则指向变量，JSX 零改动）：
| 位点 | 载体 | 旧配方 | 收敛后 |
|---|---|---|---|
| 主页切换缩略行 64px | .profile-avatar-tile-img img | 2.05 @ 50% 14%（无条件） | §58 立绘配方 |
| 主页头部头像 74px | .profile-hero-face.is-portrait img | 1.9 @ 50% 3% + pos 50% 0 | §58 立绘配方 |
| 广场帖作者 40px / 评论 32px / 评分 36px / 帖紧凑 28px | .plaza-avatar-frame.is-portrait .plaza-avatar-img（PersonPicture/PlazaAvatarThumb 共用） | 2.05 @ 14%；32px 框另有 **3.4 @ 11%** | §58 立绘配方（3.4 覆盖删除） |
| 书籍详情页作者位 76px | .plaza-avatar-frame.is-large（同上规则） | 2.05 @ 14% | §58 立绘配方 |
| 好友/申请/找朋友/关注粉丝/消息通知人行 40px、底栏/侧栏 26px | .nav-face-frame.is-portrait .nav-face-img | 2.05 @ 14% | §58 立绘配方 |
| 化身卡缩略 44px / 带入行 46px / 进入选择行 / 首页化身框 40px / 首页草稿行 40×52 | .avatar-portrait-img（AvatarPortrait 基规则） | cover 50% 12% **无变焦**（整幅小人） | 基规则即 §58 立绘配方；各框的私有覆盖（2.05、1.7 @ 10%）删除 |
| 资料编辑预览 56px | .profile-edit-preview-frame.is-portrait | 2.05 @ 14% | §58 立绘配方 |
| 账号大头像 136px | .ryan-avatar-frame.is-portrait .ryan-avatar（AccountPanel） | 2.05 @ 14% | §58 立绘配方 |
| 上传/默认图（各位点 plain 分支） | 上述各基规则 | 50% 50% 与 50% 12% 并存 | 统一 --face-plain-pos（50% 12%），不变焦 |

例外（整幅展示面，不入小位规格）：展台前景（contain 整幅）、化身编辑器舞台 `.avatar-frame`（3/4 框，明示 `transform:none` + plain 锚退出规格）。
不在清单：书城列表卡按 STORE-DESIGN v3 无作者图（纯文字），书城侧头像位即详情页作者位/评分/评论，已覆盖；`.plaza-lead-portrait`、`.profile-avatar-stand`、`.avatar-photo` 为无 JSX 引用的死 CSS，未动，登记待清。

## 三、验收（用户真实资产，三档 WebKit）

夹具 `showcase-visual-shots/`（fixture-server.mjs + seed.mjs + accept.mjs）：painter 按 description token 返回**生产原字节**的橘子（白底竖图）/阿灿（全幅图）立绘；种子 = 双化身（橘子主）+ 好友 + 作者发书《借火登天》+ 广场分享帖 + 本人评论——与用户生产账号同构。
- accept.mjs：360/390/430 三档共 **39 条断言全绿**（ACCEPT: ALL GREEN）。结构断言：backdrop 元素消失、halo 与前景同 src 同 contain 几何（layout box 一致）、fill 渐变落地且首站为底色自身近白；脸锚断言：切换行双 tile、主页头部、好友行、广场帖作者、评论、书籍详情作者位——计算样式全部 scale 1.7 @ 50% 0%。
- 单元测试 `tests/showcase-visual.test.js`（8 测）：规格变量单一定义、全位点规则同指变量、无私有常数残留（2.05/3.4/:not(.is-large) 覆盖已绝迹）、编辑器舞台退出规格、展台结构（backdrop 绝迹、halo contain 同锚、ShowcaseFill 接线）、采样器以 jpeg-js 合成图实测（白底图四边近白、暗色整幅图四边暗、竖向渐变方向跟画不跟主题）。`tests/profile-showcase.test.js` 中被 supersede 的两条 backdrop 断言已改指本批。
- 截图清单（showcase-visual-shots/，每档一份）：showcase-{360,390,430}（展台整卡特写）、tiles-{360,390,430}（切换行）、profile-{360,390,430}（主页全景）、friends-{360,390,430}（好友行）、plaza-{360,390,430}（广场流·帖作者）、plaza-post-{360,390,430}（帖+评论）、book-detail-{360,390,430}（书籍详情）、book-author-{360,390,430}（详情作者位）。
- 逐张亲看判定（390 为主、360/430 展台复核）：展台三档均为**一幅带白底的完整画**——白底长满图框、无接缝、幽灵剪影只出现一次且与前景同比例、头（叶）→鞋完整；切换行两 tile 均为头肩像、整头入框、脸可读（橘子头大是角色本身头身比，非裁切问题）；帖作者 40px、评论 32px、详情作者 76px、好友行 40px 构图同族、脸不被切。**通过。**
- 全量测试对账：1144 测 / 1139 过 / 5 败——恰为基线 dedup 样本图 ENOENT×5（③a 系列），import-daylight 本轮未 flake；本批曾让 shell-migration 两测钉住的旧配方（2.05/3.4/backdrop cover）失败，已按 supersede 口径改指 §58 后全绿。
- build：`npm run build` 通过（本批改动后、夹具启动前实跑，产物即夹具所服务）。

## 四、顺手发现（未在本批处理）

- REQ-64 夹具 fixture-server 把 plazaFeed 的 `socialStore` 传成了 social **服务**而非存储（personOf 解析静默回落默认头像）——本批夹具已改传存储实例+avatarStore；旧夹具文件不在本仓，未动。
- 本机/主仓 node_modules 又被 VM 回滚吃空（只剩 git 跟踪的坏链 symlink），本批在 worktree 内 rm 坏链后 npm ci 重建（该路径未暂存、不入提交）；根治仍需单独提交删除坏链条目（00051 集成笔记已登记同一事项）。

## 五、未覆盖位点

- 消息中心通知行的 nav-face（26/40px）与关注/粉丝行：与好友行同一类名同一规则，好友行已实测同规格；通知行需要通知数据种子，未单独造。规则层由单元测试同源断言兜底。
- 化身编辑器内的 AvatarPortrait 大舞台：属整幅展示面（例外），未截图；其退出规格由单元测试钉住。
- 黑/极光主题下的展台：本批按用户报障的白主题验收；采样填充不随主题变（底色是画自己的），暗主题下展台为一幅亮底印刷画——如用户不接受，再议（不在本批口径内改动）。
