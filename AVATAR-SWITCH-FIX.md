# AVATAR-SWITCH-FIX — 他人主页化身切换「第 3 个起只变名字不变图片」诊断记录

用户真机亲报（2026-10-31 19:07，00055 上线后）：打开**别人**的主页（窗口式），
对方有 ≥3 个化身时，点前两个图片正常切换，点第 3 个及以后：名字变了，
**展示图纹丝不动**。

## 结论：未能复现——五条路径全绿，不做推测性修复

本轮**没有改任何产品代码**。只新增一条服务端契约回归测试
（`tests/avatar-switch-payload.test.js`）与本笔记和复现夹具
（`avatar-switch-shots/`，生产凭据版脚本未入仓）。

## 复现尝试（全部用真实生产代码/数据）

夹具：全新 clone（基线 origin/main `cdaa183`），REQ-73 的
`avatar-derivatives-shots/fixture-server.mjs` 内存后端起真服务，
WebKit 390×844（与 REQ-73 验收同法）。

1. **已烘焙账号**（`seed-switch.mjs`）：B 走真实生成路径造 5 个化身
   （生产立绘：阿灿/橘子/知遥/沈砚/陆鸣），A 经关注列表开 B 的窗口主页
   逐个点 1→5，再到 B 自己主页对照——每次点击名字、展台 img src、
   图形像素哈希**全部正确变化**，双面皆然。
2. **冷懒烘焙账号**（`fixture-server-lazy.mjs` + `seed-lazy.mjs`）：
   模拟 00055 之前画的老账号——档案经真实 API 建立、原画直接植入
   存储、**零衍生记录**，所有衍生图必须靠读路径懒烘焙。4 个化身
   逐个点——全部正确（名字/src/像素）。
3. **冷懒烘焙 + 真人式快速连点**（`repro-rapid.mjs`，每 0.7s 一点、
   不等加载）：每个衍生请求 200，落点全部正确。
4. **生产 HTTP 实测**：全站唯一可见的 ≥3 化身真实账号 pangboya
   （胖脖鸭，4 个化身：王兴润=主/玄奥/王博文/白聿齐，均 v=1）——
   公开载荷里 4 个 portraitUrl 各带自己的 avatar id；4 张 portrait
   衍生图与 4 张原画逐张拉取，sha256 各不相同、均 200
   `image/jpeg`。其 4 张原画均为普通 768×1052 JPEG，无异形。
5. **生产全栈实测**：以官方账号登录生产站，Chromium 390px 经广场
   点作者名打开 pangboya 的窗口主页（生产 bundle + 生产
   Firestore + 生产数据），逐个点 4 个化身——名字、src、页内
   canvas 像素哈希全部正确切换，衍生请求全 200。
   （本机 WebKit 无 TLS、Chromium 截屏 SIGTRAP，故像素哈希改走
   页内 canvas 计算；引擎为 Chromium 而非 iOS WebKit，此点见未证项。）
6. **包一致性**：以项目自带 vite 构建基线 `b179728`，产物
   `index-CcsHfqzt.js` 与生产站实际服务的包哈希**逐字一致**——
   手机上跑的确实是 00055 的代码；`index.html` 为 `no-cache`。

读码核查（均无问题）：`src/avatar.js:393 derivativeUrl` 对
`/api/users/<uid>/portrait` 正确附加 variant；`server/social.js`
载荷为每个化身给独立 portraitUrl（`?avatar=<id>&v=<version>`）；
`social.portrait()` 经 `imageSlotFor` 分槽（主=`current`、
其余=`<id>:current`）；衍生记录按槽独立存
`<slot>:portrait`/`<slot>:face` 并以 sourceStamp 门控（00055 已含
单飞+写回验戳）；客户端展台为单张受控 img（`stageAvatar` 驱动），
tile 点击是唯一选图入口；资料缓存为会话内存 SWR，不跨会话。

## 剩余嫌疑（按可能性排序，均未证实）

1. **当时冷烘焙慢 + 连点丢弃在途加载**：19:07 时 pangboya 的第
   3/4 个化身衍生图可能尚未烘焙（本轮实测已将其全部烘焙落盘，
   现在再点应为热读）。冷烘焙在 Cloud Run 上要做多次 Firestore
   读写 + JS JPEG 编解码；浏览器在 img 的 src 被再次改写时会
   丢弃在途加载、且**新图到达前一直显示旧图**——与「名字先变、
   图片不动」的观感完全吻合；前两个恰已热（生成时烘焙或先前
   被读过）则即时切换。**请用户现在重试 pangboya 的主页**：
   若恢复正常，此说成立，无需改码。
2. **iOS Safari 特有行为**：展台 img 带 `loading="lazy"` 且位于
   带入场动画的 sheet 内；桌面 WebKit 与 Chromium 均未复现，
   不排除 iOS 上懒加载图片在 src 改写后不触发加载。若用户重试
   仍复现，第一嫌疑改动是把展台 img 改为 `loading="eager"`
   （它在 sheet 内恒为首屏元素）——一行改动，留待父级拍板，
   本轮不盲改。
3. 用户当时的会话/页面上下文（长时间未重载的旧页面等）无法
   在本地重建。

## 新增回归

`tests/avatar-switch-payload.test.js`：钉死服务端契约——≥4 个
已绘化身时，公开载荷逐个给出**各带自身 avatar id 的互异
portraitUrl**，且 `social.portrait` 对原图与 portrait 衍生两种
变体都按 avatar id 返回**互不相同**的画，裸 URL 恒为主化身。
全量：1189 项 / 1184 过 / 5 败（恰为既有基线 dedup ENOENT×5，
新克隆缺 `dedup-shots/fixture-portrait-banded.png`）；build 通过。

## 未证项

- iOS 真机为终门：以上全部为桌面引擎/本地夹具/生产数据的实测，
  不能替代用户在 iPhone 上重试 pangboya 主页的点验。
- 若重试仍复现：需要用户提供**出问题账号的名字**与一段录屏
  （点第 3 个后停留 10 秒以上），以便区分「在途加载被丢弃」
  与「请求根本没发出」。
