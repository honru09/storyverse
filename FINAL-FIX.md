# FINAL-FIX — 收官双测试员回归修复批处置笔记（2026-10-29）

依据：`~/workspace/regression-persona/ROUND-FINAL-2026-10-29.md`（老书虫 R-01…R-16）、
`~/workspace/regression-designer/ROUND-FINAL-2026-10-29.md`（设计师 N1–N8）。
基线 787 → **798/798 全绿**；`npm run build` 通过。本地提交，未部署、未 push（部署由主助手统一收官）。

提交序列（main 297dd79 起）：
- `523ef5d` 可靠性①：首章重试政策 + 开篇定名 + 合流章长指令 + 代词口径
- `582d8ef` 可靠性②：R-02 云同步防饿死 + keepalive 冲刷
- `28bd6e7` 一致性：R-07 化身未点选=null
- `d9784a6` 产品组：合流标题 + R-06 补带化身 + R-15 文案
- `ae963f9` 界面组 + 数据层：flex/幕布/分档/副标/自动关窗/字数同源/R-13 + worldIntro v2
- 本批收尾提交：补带行自身 flex 修复 + e2e/publish-avatar.cjs + 本笔记

截图目录：`finalfix-shots/`（store/detail 360·390·430、forge-390、publish-390、settings-book-390、assertions.json）、
`publish-avatar-shots/`（01-blocked-row / 02-unlocked / 03-shelved）、`bookstore-plaza-shots/`（R-09 证据链）。

---

##

### 1. R-01 首章生成连败（271s 耗尽 + ~70s 再败）— 已修
- **根因（双层）**：(a) 服务端把「返回不完整」类失败（finishReason=MAX_TOKENS、JSON 解析失败、圣经 outline 条目不合规）判为**确定性失败、零重试**，而开篇恰是全站最大应答（正文+圣经+满额大纲），晚间一抖就整单作废；后续章的同类瞬时失败却能在请求内退避自愈——首章反而是最脆的一章。(b) 开篇 maxOutputTokens 与续章同为 6144，圣经+大纲挤占正文预算，截断概率最高。
- **改法**（按 RELIABILITY.md §7 先例做有界政策修订，`server/gemini.js`）：不完整返回（非 STOP 且非 SAFETY 的 finishReason、JSON 解析失败、响应体截断）与圣经分支校验 slip 改为**可重试**（原 1.2s→2.4s 退避、≤2 次、总预算 270s 不变，失败尝试零计费）；安全拦截（promptFeedback / finishReason=SAFETY / functionCall parts）与**正文**校验维持确定性硬失败；双通道（Vertex + developer API）开篇 maxOutputTokens 6144 → **8192**。政策修订理由写在 `retryableError` 注释与测试内。
- **客户端核验**：Forge 草稿经 onDraftChange 持久化、generate() 按签名缓存 opening、失败不清空——「保留全部已填设定一键重试」本已成立，无改动。
- **测试**：原钉死测试拆两半并注明政策变更（确定性组 calls===1 / 可重试组 calls===3 且仍 502、首败次成自愈组 calls===2）；`tests/gemini-generator.test.js`、`tests/reliability.test.js` 全绿。

### 2. R-02 生成后约 1 分钟关页丢书 — 已修
- **根因**：`src/cloud-library.js` 的去抖 flush 每次 observe 都清表重排 2500ms；生成落盘后读者翻页/改进度持续触发 observe，flush 被**无限饿死**，关页时书只在本机 localStorage，新会话（或清缓存）即丢。本机 localStorage 本身不丢书，丢的是「云端没有」这一层。
- **改法**：① 去抖改**首变定时**——第一个待同步变更挂表、后续变更不再重排（flush 时读 map 最新值，无数据损失），等待有界；② 新增 `flushOnHide`：pagehide / visibility→hidden 时以 **keepalive** 请求冲刷待同步（App 层接线）；③ keepalive 体积超限被平台拒绝的仍留 pending，下次启动 merge 按云端索引自动补传本机独有书——债务永不静默丢弃。
- **测试**：新增饿死上界测试（假定时器下持续变更仍按时 flush）+ keepalive 路径测试（fetch options 带 keepalive:true）；e2e/cloud-library.cjs 全过（B 场景：换会话书架见书且位置在）。

### 3. R-08 带化身进入 280s 无提示（疑似）— 复核关闭（无独立缺陷）
- 进入生成与造世同路（单次 requestChapter，客户端超时 290s、GenerationOverlay 在位、失败有 alert+可重试）。测试员的 280s 尚在客户端超时（290s）之内、提示未到触发点；其慢的根源与 R-01 同源（晚间不完整返回零重试硬等），已随 R-01 修复同路受益（请求内退避自愈 + 预算对齐）。结论记档，不另改进入路径。

### 4. R-09 评论两轮未落盘（疑似）— 实测不复现，证据关闭
- 本批重跑 `e2e/bookstore-plaza.cjs` 全链 PASS：第二用户点赞+评论 → 评论立于帖下 → 作者消息中心「互动」类同时收到点赞与评论通知（含评论文本）。代码链复核一致（客户端 {content} → 服务端 text?? content → {comment} 回执 → 前端 append）。测试员环境的两轮失败未能复现，疑为其会话/网络瞬时状态；不改代码。

##

### 5. R-03 / F-12 主角命名漂移（复现）— 已修
- **根因**：主角名留空时，设定侧回落「未命名旅人」，生成侧模型在正文里自创名（「宁远」），两边永不相见——设定集、后续章、条目都对不上正文。
- **改法（生成前定名、两边同源）**：服务端在第 1 章生成前，若 solo 线主角名为空，按 story id 哈希从固定名字池（30 个）**确定性派名**，写入 prepared story 的上下文（节拍与档案同名），结果回传 `protagonistName`；客户端 accept/reroll 在 config.name 为空时回写档案。重试同名、读者自取名永不被覆盖、仅第 1 章派名（已开写的线沿用其正文既成名）。造世确认页文案同步改「留空 · 开篇时定名」，预览行不再假称「未命名旅人」。
- **测试**：服务端（上下文同名 + 确定性 + 自取名不覆盖）、客户端回写、派名池单测，全绿。
- **记账**：已漂移的存量书（如测试员那本）无法安全反推正文用名，不做自动回填；新书不再发生。

### 6. R-07 化身描述被默认值覆盖 — 已修
- **根因**：`normalizeAppearance` 用 DEFAULT_APPEARANCE（黑/长直发/长风衣/长靴）补满**未点选**字段，新建表单又以全默认起步——读者写「短发」，prompt 里却带着长直发等一整套没选过的外貌词。
- **改法**：未点选 = **null（未指定）** 贯通全链：normalize 保留 null、非法 id 亦归 null；文本/prompt 组装跳过 null；新建表单全 null 起步；部件 chip 可再点取消 + 表单明示「不选就按你的描述来」；服务端立绘 prompt 加硬行「未声明的方面以自由描述为准、默认外貌不得覆盖」。预设化身保留显式全套外貌；**存量档案**当年已把默认烤成显式值，渲染不变（要改者可在编辑里逐项取消）。
- **测试**：avatar-shared 新增 null 语义组（未点选零贡献、无默认衣物泄漏、无 appearance 档案校验为全未指定）；原「未知 id 回落默认」钉死断言按政策变更改写并注明。

### 7. 代词漂移（小）— 提示词收紧（低成本项已做）
- SYSTEM_PROMPT 加「称谓一致性」行：同一角色代词全书一致、主角性别未明时优先姓名指代、确需代词全章只用一个。**记账**：主角档案补性别字段涉及造世表单与档案结构，本批不做。

##

### 8. R-06 非化身线发布死线 — 已修
- **落点确认**：门在 `plazaGateFor`（src/plaza.js）+ 服务端同检（server/plaza.js）；此前被拦只有一行理由、无任何补救入口。
- **改法（两头堵）**：① 造世确认页在未带化身时明示「没有带化身的线完结后不能上架书城，成书后可在发布页/设定集补带」；② 引擎函数 `bringAvatarIntoStory`（写 config.avatarId + avatarAppearance；merged/manual/readOnly/已有化身拒绝）；③ 两处补带入口——发布页被化身门拦下的行直接变补救卡（主化身一键带入，门即时重读解锁）、阅读器设定集新增「随行化身」节（任选化身带入/查看已带化身）；门结果加结构化标记 `needsAvatar`，界面按标记判定不按文案。
- **测试**：单测（带入后门转 publishable、拒绝矩阵、R-07 语义的外貌串）；**e2e/publish-avatar.cjs 新建并 PASS**（无化身完结线 → 发布页拦截行 → 点补带 → 解锁 → 真上架成功）。

### 9. 合流小账 — 已修
- ① **标题同名**：`createMergedStory` 旧名 = 题材模板示例名拼凑，同题材合流必重名、且与来源书同名。改用**来源书名**：`合流：《A》 × 《B》`（每侧 12 字截断），同名时回落双主角名区分；出处仍在 sourceTitles。单测钉住三形态。
- ② **章长约 1300 偏短**：代码里本无合流专用短指令带（全局 1600–1950 同格），偏短是双圣经+双摘要把全局指令挤出注意力。**未**采纳 validateOutput 硬地板门（全仓 41 处 stub 正文会被整片打挂）；改法：合流上下文（contextFor）增 `chapterLengthDirective` 字段在合并语境处重述 1600–1950 / 地板 1550，并与 R-01 的开篇 8192 预算共用。单测断言 merged 上下文携带该指令。

## （验收：finalfix-shots/，DOM 断言见 assertions.json）

### 10. 系统性 flex 挤压（N1 / R-05）— 已修，且修对了第二层
- 书城卡 byline：第一轮改「name 允许省略 + handle flex:none」后量测发现挤压只是**转移**到名字上（nameW=0，名字被裁没——截图实证）。双列卡内宽 ~147px 放不下「作者+名+@ID+官方」一行，**正解是整行换行**：`.plaza-byline{flex-wrap:wrap}` + name min-width:0 省略 + handle flex:none。终测三档（360/390/430）：nameW=60、handleW=76、handle 字号 12.5px 不变、两行完整呈现。
- 元信息行：`.plaza-meta{flex-wrap:wrap}` + 子项 flex:none/nowrap——子项高 19px 单行，整体换行而非逐字竖排。
- 详情页分享行：`.plaza-share-row.button{flex:none;white-space:nowrap}`（注意类名是.button 不是.btn，第一版规则因此没命中、按钮仍被压到 68px 两行；修正后 50px 单行）+ 说明 span min-width:0。
- 同病同治：R-06 补带行（.plaza-pick-remedy）首版截图同样被压（标题截断、理由窄列），已加 flex-wrap + copy flex-basis 180px + 按钮 flex:none，复拍正。
- 断言：assertions.json（byline/meta/share 三组 × 三档全过）。

### 11. 造世题材卡被夹压（N2）— 已修
- **根因**：`.forge-actions` 本身已是实心带，但它下方的半透明底栏（--nav-bg + blur）让滚动到其后的题材卡标签**透出鬼影**。
- **改法**：`.forge-actions::after` 实心幕布（--surface-solid、高 = 62px + 安全区），仅造世页、仅 ≤759px 覆盖底栏带；底栏按钮 z-30 在幕布之上、不受影响。
- **验收**：forge-390.png——第三排题材卡完整可见、继续条下方无透字；量测 skirt 背景 rgb(16,16,20) 实心、高度 62px。

### 12. 小瑕疵并批
- **书名 6 字即省略号（N6）— 已修**：分档放宽一档（lg ≤10 / md ≤18）+ 封面字号 16.5/14/12px + 书城卡封面标题内距 16→12px；单行铁律不动；钉死断言随改注明。量测：标题 scrollWidth 溢出 0。
- **题材卡副标三态（N5）— 已修**：每块恒显「N 种写法」，默认 badge / 已选 check 改为叠加不替换。量测 10/10 砖带 count 副标（forge-390.png）。
- **补绑表自动弹（N4）— 已修**：登录 sheet 若在未登录时打开，登录成功即自动关窗并按 intent 续行（App 层一次性交接）；已登录态主动打开时补绑提醒保留（收进账号 sheet 本位）。AccountPanel 双分支重挂载使面板级方案失效，故落 App 层——理由记于代码注释。
- **「暂不上架」误触（R-15）— 已修**：改文案「先不发布」（capture 断言新词在、旧词无）。
- **手写字数对不上（R-16）— 已修（同源化）**：报告自身未定性；两计数本同口径（去空白），差出在 autosave 700ms 窗口。改：正在编辑章的列表计数直接显示编辑器实时 draftWords，屏幕两数永远同源；其余行用引擎计数。write-mode e2e 6/6 通过。
- **游客态头像空圆（观察项）— 实证关闭**：游客请求他人头像图返回 200 image/jpeg；PersonPicture 默认与失败回落均为已定版 /default-avatar.svg（星空书），无空圈路径，无代码改动。
- **附带项 R-13 封面「生成中」久挂（自查发现）— 已修**：pending 状态被持久化，会话中途死亡后永不重发。改：pending 落盘带 updatedAt，超 10 分钟的 pending 视为孤儿可重发（`coverRequestInFlight` + `shouldAutoRequestCover`），单测覆盖三种时间形态。

### 13. 数据层
- **① 官方书 worldIntro（N7）— 代码已修 + 本地验算；生产重烤待主助手执行（见下）**
- 改法：`plazaWorldIntroFor` 主线段去掉外貌串硬塞（`${name}是这个世界的主角。`，外貌只活在详情页化身面板）；背景段在 premise 句被过滤殆尽时回落**世界目录描述**，不再只剩「「X」——玄幻题材的世界。」一句空话。`WORLD_INTRO_VERSION` 1 → 2；refresh 脚本加 `--only <id>` 且补传 genreId。
- 本地以线上官方 payload 验算（与生产将写入的逐字一致）：
- 背景：「沉潮港」——玄幻题材的世界。沉潮港被潮水围住，镇上的潮汐钟会改写记忆，雾里漂来一封不该抵达的信。
- 主线：沈知遥是这个世界的主角。故事从「守夜日志与逆流的潮声」开始，一路走到「终局的锁芯与倒流之潮」。这条线已经完结，全 24 章。
- **生产执行（沙箱无 GCP 凭据，只能 Cloud Shell）**：部署收官版后在 Cloud Shell 克隆该提交，先 dry-run 核对再写：
`DATA_STORE=firestore GOOGLE_CLOUD_PROJECT=project-175c4bc7-52ff-4b6d-b53 node scripts/refresh-world-intros.mjs --only pub-ff498576-b52 --dry-run`
确认输出与上文一致后去掉 `--dry-run` 重跑，之后 curl `/api/store/pub-ff498576-b52` 亲验 worldIntro 与 worldIntroVersion=2。（注：GOOGLE_CLOUD_PROJECT 必须给项目 ID、不能给编号——既有铁律。）
- **② 分享帖复读（N8）— 实证关闭**：产品侧分享编辑器初始为空、服务端只存用户文本，无任何「默认分享文案」生成逻辑；复读只存在于一次性迁移的种子帖文本（官方号自有帖），非生成缺陷，无代码改动。

## 父代理已证伪两条（未动）
- 官方书封面图内标题错字：误读，关闭（封面无字画、标题来自记录、API 实测《沉潮港纪事》正确）。
- 官方示例书无专属封面：coverUrl=?v=1 已生效，关闭；各表面封面优先级链未发现走回落的表面。

## 未修记账
- 主角档案性别字段（代词漂移的根治）：涉及造世表单/档案结构，后续批。
- 存量已漂移书名回填：无法安全反推，不做。
- R-14（回退按钮连点）：报告未定性、本批未复现，未动。
