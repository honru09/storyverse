# AVATAR-TRIM — 化身部件级个性化下线（2026-10-30）

依据：用户 2026-10-30 亲定——衣服/鞋/眼镜/帽子/配饰等部件级个性化整体去掉。理由：生成形象千差万别（动物、身高比例各异），预制部件穿不上，换装本质就是整图重生成。

基线：fd84e08（线上 00044），分支 `avatar-trim`，worktree `storyverse-avatar-trim`。本地提交，未 push、未合 main、未部署，待主线集成。

## 删除清单

### 前端（src/）
- `src/main.jsx`：`AppearanceFields` 组件（发色/发型/服装/鞋/脸部细节五组 chips + 脸部备注输入）、`pickAppearance`（点选即锁定重绘）、`applyFaceNote` 与「用新备注重画」按钮；编辑表单不再 seed、展示或提交 `appearance`。
- `src/avatar.js`：`HAIR_COLORS` / `HAIR_STYLES` / `OUTFIT_STYLES` / `SHOE_STYLES` / `FACE_FEATURES` 选项表、`AVATAR_APPEARANCE_FIELDS`、`DEFAULT_APPEARANCE`、`normalizeAppearance`、`avatarAppearancePrompt`、`AVATAR_FACE_NOTE_MAX`；`validateAvatarProfile` 不再产出 `appearance`（请求 payload 携带也被忽略）；`generateAvatar` 不再发送 `lockPart`。
- `src/styles.css`：`.avatar-fields` / `.avatar-fields-hint` 删除；`.avatar-lock-note` 更名 `.avatar-repaint-note`（文案改整图重绘口径）。

### 服务端（server/）
- `server/avatar.js`：`AVATAR_LOCK_PARTS`、`appearanceFragment`、`lockInstruction`（REPAINT LOCK 整段）删除；`buildAvatarPrompt` 不再拼部件片段或锁定段——立绘提示词只由名字 + 描述（character impression）+ 参考图锚定，重绘恒为整图重绘，海报构图照旧；`posterCompositionFor` 种子改为 `name|description`；`scrubProfile` 只 scrub 名字/描述；`generate` 忽略 `lockPart`。
- 接口面：`POST /api/avatar/generate` 的 `lockPart` 参数下线（携带也被忽略）；`PUT /api/avatar`、`POST /api/avatars` 的 `profile.appearance` 不再被校验或存储（新存档不产生该字段）。

### 语义变更（字段路径保留、来源更换）
- `avatarAppearanceText(avatar)`：入参由 appearance 对象改为化身对象，返回其书面描述（空白折叠、≤300 字）。故事 config 的 `avatarAppearance` 字段与全部管线（造世/广场/社交的快照与带入）保留，来源从「部件拼装」换成描述本身。调用点：`src/main.jsx`（主页行/化身卡/造世 picker/广场带入 picker）、`src/plaza.js`、`server/plaza.js`、`server/social.js`。
- 预设化身：去掉 `appearance`，原部件画的外观折进描述文本（林晚舟/阿灿/白榆的描述已含发色、衣着与面部标记）。

## 保留项
名字+描述生成、预设化身、整图重绘（编辑面主按钮「按描述重画立绘」+ 整图重绘说明条）、设主化身、多化身管理（创建/删除/列表）、海报管线（机位/姿势轮换）、脸部锚点裁切、立绘额度与版本/上一版查看。

## 存量字段处置
- 不删用户数据、不做迁移：存量记录里的 `appearance` 对象原样留在记录中；服务端只对已有记录惰性透传，永不从请求 payload 取值。
- 前端不再展示或提交该字段：表单 seed 不读 `appearance`；公开主页的 `avatar.appearance` 字符串输出现为描述文本（`server/social.js`，同名输出、来源已换）。
- 惰性字段不再进入任何生成提示词——单测以负断言钉死（black hair / xianxia / beauty mark / 脸部备注 [INST] 均不得出现在 prompt 中）。

## 测试结果
- `npm test`：837 条，832 过 / 5 败。5 败与改前基线一致，全是 ③a 缺未入库样本图的 ENOENT，与本批无关；中途一次全量跑出现 backup-merge 偶发失败，单跑与复跑均通过。
- 基线 840 条净删 3 条（部件拼装/锁定重绘专属用例），其余部件相关断言全部改写为新口径（validate 忽略部件 payload、`avatarAppearanceText` = 描述、重绘无 lock、部件不入 prompt）。
- `e2e/avatars.cjs`：8/8 通过（含新口径：repaint-note 文案 + 无部件控件断言、config.avatarAppearance === 描述原文）。
- `npm run build` 通过。
- 截图（不入库）：`avatar-trim-shots/before.png`（基线 worktree 同法拍摄：发色/发型/服装/鞋四组 chips 按存量值选中）/ `avatar-trim-shots/after.png`（仅名字+描述+整图重绘说明+「按描述重画立绘」）。黑底 390 宽，fixture 迁移账号（沈砚，带 legacy appearance）。

## 待集成时对账
`DESIGN.md` 与 `AVATARS.md` 中的部件表/重画锁（lockPart）旧 canon 已被本批 supersede；本批未改这两份文档（避免与主线 DESIGN 编辑冲突），集成时请一并修订。
