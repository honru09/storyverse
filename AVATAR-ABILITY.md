# REQ-57 化身专属能力 — 处置笔记

用户 2026-10-30 23:57 亲定：自己的化身要有专属能力——提前在化身上预设好
（一个性格 + 一个能力；性格已有、能力新增）；带化身进某个世界时，界面要
明确显示是否带他现在的专属能力进入；不锁死——也可以选别的能力、或自己
编辑一个用在这本书里。分支 `avatar-signature-ability`，基线远程 main
`1001e79`。本批只本地提交，不 push 不部署。

## 现状盘点（开工前）

- 化身档案只有 {id, name, description}：description 即性格与设定
  （`src/avatar.js` 的 validateAvatarProfile 白名单式组装；服务端
  `server/avatar.js` 的 validatedProfile 逐字段组装，不显式携带的字段
  会被丢掉）。部件级捏脸已下线（AVATAR-TRIM），legacy `appearance`
  是惰性数据。
- 造世能力步的能力数据结构是 **{id, name, desc}**（desc=效果；现网
  没有独立 cost 字段——代价是 worldBible 的通用规则「能力有边界；
  每次越界都会改变关系或世界稳定度」）。能力库：WORLD_ABILITY_POOLS
  （世界池）+ TEMPLATE_SIGNATURE_ABILITIES（题材招牌）+
  GENERIC_ABILITY_POOL，`ALL_ABILITIES` 全量导出，
  `abilityCandidatesFor`/`abilityGroupsFor` 按（世界×题材）给候选。
- 但故事 config 里只落 **能力名字符串**（config.ability），desc 从不
  进 config、更不进生成上下文——挑中能力的「效果」此前对生成侧是
  不存在的，自定义能力只有一个名字。本批顺手补齐（见下「引擎衔接」）。
- 带化身入口共两个：造世 Forge step 4（avatarDraftPatch 带入）、
  PlazaEnter（带化身进书城的书，enterDraftFor 组装 draft）。
  `bringAvatarIntoStory`（给已有线补带化身）不问能力——故事能力
  开局已定，与「中途不可换」口径一致，本批不动。
- 注入防护有两层：客户端 findSettingViolation（硬拦截，造世离开
  步骤时查）、服务端 sanitizeSettingText（结构冒充 scrub，凡读者
  文本进 prompt 前都过）。化身 name/description 走服务端 scrub。

## 字段结构（化身专属能力）

化身档案新增 `ability` 字段，与能力步同构：

```js
ability: { id: string, name: string, desc: string } | absent
```

- 定义在 `src/avatar.js`：`normalizeAvatarAbility`（对象或裸字符串
  都收；name 必填，空白折叠，上限 name 40 / desc 120 / id 64——与
  能力步自定义输入 maxLength=40 对齐）+ `avatarAbilityOf(avatar)`
  读取助手。无/空 = 未设置（老化身零影响，任何入口都不报错）。
- `validateAvatarProfile` 三态语义：ability 键**缺席** = 本次保存
  不表态；**在场** = 归一化结果（对象或 null=未设/已清除）。服务端
  `validatedProfile` 据此决定存新值还是保留已存值——老客户端只存
  名字/描述时不会把已存能力悄悄清掉；化身页点「清除」发 null 显式
  清除。服务端 scrubProfile 对 ability 的 name/desc 过同一道
  sanitizeSettingText。
- 预设化身（AVATAR_PRESETS 三位）各带一条通用池能力（读心余光 /
  逢凶化吉 / 言出法随），采纳预设即带入，可再改。

## 三入口落点

1. **化身创建/编辑面（AvatarPage）**：描述框下新增「专属能力（选填）」
   区——当前能力卡（名+效果）或未设置提示；操作：从能力库选（展开
   ALL_ABILITIES 卡片列表，与能力步同一套 ability-card 样式）、
   自己写一个（名+效果两个输入，界同上）、清除。走既有保存通路
   （saveAvatar / createAvatar / generateAvatar 的 profile 整体提交），
   profileDirty 把 ability 纳入比较，任一变化都出「只保存资料」。
   化身列表卡加一行「专属能力 · X」；主页展台（ProfilePage 的
   stageAvatar 信息区）加一行「专属能力 · X」——为此服务端
   `server/social.js` 的公开主页 avatars 摘要带上 ability
   （normalize + scrub + 限长，与其它字段同规格）。
2. **造世带化身开局（Forge step 4）**：化身已带入时，能力区先出
   三选一来源卡（radiogroup）：
   - 「带 X 的专属能力进入」（明示能力名+效果；化身有预设时默认选中）
   - 「换一个能力」→ 原候选分组 + 随机卡（自定义输入收起）
   - 「自己编辑一个」→ 原自定义输入（只用在这本书）
   化身没预设时第一张卡呈未设置态（「专属能力还没设置」+「去设置」
   跳化身页），默认落在「换一个能力」= 现行为。没带化身时整区与
   改前一字不差。来源状态 `abilitySource` 进草稿持久化，恢复时
   三选一状态与自编文本都在（老草稿若存的能力名正好是所带化身的
   专属能力，也读作 signature）。摘要步能力行在专属来源时标
   「· 化身专属」。换化身/取消带入/导入角色卡都会把来源重置到
   新化身的默认。**选择只落本书 draft，永不回写化身档案。**
3. **带化身进入书城的书（PlazaEnter）**：同一套三选一（默认专属、
   明示名+效果；换=该书候选 chips；编=新增自定义输入），切换所带
   化身时来源重置为新手身的默认。enter() 传 ability 名称 + 效果，
   经 `enterDraftFor`（新增 abilityDesc 参数）落新书 config。

## 引擎衔接（config → bible 通路）

- 新增 config 字段 `abilityDesc`（story-engine normalizeDraft，
  ABILITY_DESC_MAX=120；persistence 的 CONFIG_TEXT_FIELDS 同步登记
  做类型校验）。三条路径（专属/换选/自编）都把选定能力的 desc 一并
  落 config——顺带修好「库选能力的
...[truncated 1146 chars]