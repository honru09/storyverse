/*
 * StoryWeave's small domain engine.
 *
 * This module is deliberately deterministic: it is not an AI model, makes no
 * network requests, and never uses an artificial sleep.  The templates are a
 * local prototype for the state machine that a model-backed service can later
 * implement.
 *
 * Domain terms:
 * - A chapter index is zero based (0..5).
 * - `chapterIndex` is the next chapter that can be accepted.  It starts at 0
 *   and stays at 5 after the finale.
 * - A choice is recorded by chapter index.  Choosing a different branch
 *   increments `revision`, truncates future chapters, and invalidates old
 *   chapter keys.
 */

export const GENRES = [
  {
    id: 'mist',
    label: '奇幻',
    world: '沉潮港',
    title: '沉潮港纪事',
    tagline: '潮汐记得每一个名字',
    description: '沉潮港被潮水围住，镇上的潮汐钟会改写记忆，雾里漂来一封不该抵达的信。',
    color: 'coral',
    symbol: '◒',
    location: '第七码头',
    spawnPoints: [
      { name: '第七码头', hook: '在码头仓库的麻袋堆里醒来，潮水正漫过门槛，怀里揣着一封不是你的信。', situation: '市井' },
      { name: '疍家渔排', hook: '在渔排的吊床上醒来，排主敲着你的船板，说你已经欠了他三网鱼的债。', situation: '落魄' },
      { name: '沉船甲板', hook: '在一艘搁浅沉船的甲板上醒来，脚下的船舱里传来一下、又一下的敲击声。', situation: '危险' },
      { name: '灯塔守夜屋', hook: '在灯塔的守夜屋里醒来，昨夜的守夜日志不是你写的，字迹却和你一模一样。', situation: '隐秘' },
    ],
  },
  {
    id: 'cultivation',
    label: '修仙',
    world: '青岚宗',
    title: '借火登天',
    tagline: '凡人也能向天借火',
    description: '灵脉正在枯竭，青岚宗把最后的火种藏进凡人的梦里，等一个不信命的人来取。',
    color: 'gold',
    symbol: '✦',
    location: '后山灵田',
    spawnPoints: [
      { name: '后山灵田', hook: '在灵田看棚的草席上醒来，昨夜借来的火种自己挪了位置，就搁在你枕边。', situation: '落魄' },
      { name: '山神破庙', hook: '在山神庙的供桌底下醒来，庙里只剩你和一尊裂了的菩萨，香炉里半炷香还没烧完。', situation: '隐秘' },
      { name: '山脚村落', hook: '在村口老槐树下的草垛里醒来，全村人都假装没看见你，只有村长家的狗一直盯着你。', situation: '市井' },
      { name: '外门柴房', hook: '在外门柴房的柴堆上醒来，管事在门外说：醒了就先挑三百担水，挑不完不许吃饭。', situation: '落魄' },
    ],
  },
  {
    id: 'neon',
    label: '赛博',
    world: '霓虹下城',
    title: '雨幕备份',
    tagline: '记忆可以删改，雨声不行',
    description: '霓虹下城是巨型都市的下层区：情绪可以租赁，记忆可以删改，雨水里藏着一份无主的人格备份。',
    color: 'mint',
    symbol: '⌁',
    location: '下城回收站',
    spawnPoints: [
      { name: '下城回收站', hook: '在回收站的窝棚里醒来，手边多了一块发烫的无主芯片，烫得你一下子清醒过来。', situation: '市井' },
      { name: '下城贫民窟', hook: '在集装箱顶层醒来，楼下整条巷子的人正为一桶净水排队，队尾已经排到了你脚下。', situation: '落魄' },
      { name: '9号胶囊舱', hook: '在胶囊舱里醒来，舱门上贴着一张欠费单，署名是你从没用过的名字。', situation: '隐秘' },
      { name: '地下诊所后间', hook: '在地下诊所的后间醒来，医生说你的义体里多了一段记忆，不属于你，也不属于任何登记在册的人。', situation: '危险' },
    ],
  },
  {
    id: 'city',
    label: '都市',
    world: '长宁街',
    title: '凌晨四点的长宁街',
    tagline: '所有错过的人，都有一次重逢',
    description: '长宁街永不打烊，把陌生人的愿望串在一起，等一个人按下回车。',
    color: 'violet',
    symbol: '✧',
    location: '长宁街口',
    spawnPoints: [
      { name: '长宁街口', hook: '在街口的长椅上醒来，手机只剩百分之一的电，备忘录里多了一行你没写过的字。', situation: '市井' },
      { name: '面馆后厨', hook: '在面馆后厨的折叠床上醒来，老板娘头也不抬：揉了这盆面，抵昨晚的床钱。', situation: '落魄' },
      { name: '网吧包间', hook: '在二十四小时网吧的包间里醒来，屏幕上是通宵的游戏，和一条陌生人留给你的话。', situation: '隐秘' },
      { name: '夜班便利店', hook: '在便利店夜班的柜台后醒来，监控回放里，凌晨三点的你正对着一排空货架说话。', situation: '市井' },
    ],
  },
  {
    id: 'court',
    label: '古言',
    world: '长乐宫',
    title: '宫墙深处',
    tagline: '一步走错，满盘皆输',
    description: '长乐宫里，位分就是命数；一封没寄出的家书，能改写三个人的命运。',
    color: 'crimson',
    symbol: '❖',
    location: '长乐宫偏殿',
    spawnPoints: [
      { name: '长乐宫偏殿', hook: '在偏殿耳房的窄榻上醒来，掌事姑姑留了话：昨夜的册封礼，你缺席了。', situation: '近权力' },
      { name: '皇帝的卧室', hook: '在龙床边的脚踏上醒来，你不记得自己是怎么进来的，皇帝也不记得——这才是最麻烦的地方。', situation: '危险' },
      { name: '冷宫偏殿', hook: '在冷宫的井台边醒来，手边一碗粥还温着，是谁送来的，宫里没人承认。', situation: '落魄' },
      { name: '御膳房后院', hook: '在御膳房后院的柴棚里醒来，怀里抱着一坛御酒——它不该在你手上。', situation: '市井' },
    ],
  },
  {
    id: 'frontier',
    label: '科幻',
    world: '七号前哨站',
    title: '星环以远',
    tagline: '旧世界的本事，在这里一文不值',
    description: '七号前哨站之外是辐射废土；配给卡决定谁先活下去，旧地图全是错的。',
    color: 'steel',
    symbol: '◎',
    location: '七号站配给舱',
    spawnPoints: [
      { name: '七号站配给舱', hook: '在配给舱的隔间里醒来，你的配给卡余额是全站最低，今天的氧气份额还差一半。', situation: '落魄' },
      { name: '冷冻休眠舱', hook: '被强制唤醒时，你看见休眠舱盖内侧刻着一行字：别相信唤醒你的人。', situation: '危险' },
      { name: '观测塔值班室', hook: '在观测塔的值班室里醒来，值班日志停在三十年前，望远镜还对着那片空白星域。', situation: '隐秘' },
      { name: '货舱夹层', hook: '在货舱的夹层里醒来，这批“货物”里，你是唯一一个会呼吸的。', situation: '危险' },
    ],
  },
]

/*
 * God mode: a world the reader writes themselves instead of picking a preset
 * stage. 'custom' is deliberately NOT part of GENRES (the preset wall and the
 * artwork set stay preset-only); it is registered in the id lookup so every
 * engine path — draft normalising, story creation, local scenes, merged
 * stories — resolves it with safe generic scaffolding, while the world's
 * actual name and rules come from the draft's customWorldName /
 * customWorldSetting fields.
 */
export const CUSTOM_GENRE_ID = 'custom'
export const CUSTOM_WORLD_NAME_MAX = 40
export const CUSTOM_WORLD_SETTING_MAX = 600
export const START_POINT_NAME_MAX = 30
export const START_POINT_HOOK_MAX = 120
export const CUSTOM_GENRE = {
  id: CUSTOM_GENRE_ID,
  label: '创世神',
  world: '未命名世界',
  title: '未命名世界',
  tagline: '世界由你亲手写',
  description: '没有现成的世界：名字、规则和氛围，都由你写下的设定说了算。',
  color: 'steel',
  symbol: '✎',
  location: '故事开始的地方',
}

/*
 * Story types are the eight knowledge-base templates (knowledge/genres.json).
 * The ids here must stay identical to that file — a test locks them together.
 * Each type is bound to one stage world: the world supplies the local preset
 * scenes, the world bible flavour and the cover art, while the template
 * drives the generated narrative craft on the server via genreTemplateId.
 */
export const GENRE_TEMPLATES = [
  { id: 'romance-ancient', name: '古言', fullName: '言情 · 古言', blurb: '宫斗、宅斗与礼法之下的步步为营', worldId: 'court' },
  { id: 'romance-modern', name: '现言', fullName: '言情 · 现言', blurb: '成年人的重逢、心动与迟到的真话', worldId: 'city' },
  { id: 'xianxia', name: '修仙', fullName: '修仙', blurb: '改命登天，代价先行', worldId: 'cultivation' },
  { id: 'xuanhuan', name: '玄幻', fullName: '玄幻', blurb: '一路打上去，揭开世界的真相', worldId: 'mist' },
  { id: 'urban', name: '都市', fullName: '都市', blurb: '小人物在城市规则里翻盘', worldId: 'city' },
  { id: 'scifi', name: '科幻', fullName: '科幻 · 星际/末世', blurb: '从最底层活起，逐层升维', worldId: 'frontier' },
  { id: 'suspense-supernatural', name: '灵异悬疑', fullName: '灵异悬疑', blurb: '每查一步，寒意就具体一分', worldId: 'mist' },
  { id: 'zhihu-short', name: '知乎短篇', fullName: '知乎风短篇', blurb: '第一人称，三分钟一个反转', worldId: 'city' },
]

const GENRE_TEMPLATE_BY_ID = Object.fromEntries(GENRE_TEMPLATES.map((template) => [template.id, template]))

export const genreTemplateById = (id) => GENRE_TEMPLATE_BY_ID[id] || null

// Worlds without a bound template keep a hand-picked closest craft
// (the cyber stage reads best with the sci-fi template).
const WORLD_TEMPLATE_FALLBACKS = { neon: 'scifi' }

export const recommendedTemplateFor = (genreId) =>
  GENRE_TEMPLATES.find((template) => template.worldId === genreId)
  || genreTemplateById(WORLD_TEMPLATE_FALLBACKS[genreId])
  || GENRE_TEMPLATES[0]

export const DEFAULT_DRAFT = {
  genreId: 'mist',
  genreTemplateId: '',
  customWorldName: '',
  customWorldSetting: '',
  startPointName: '',
  startPointHook: '',
  name: '',
  trait: '冷静观察者',
  origin: '无名漂泊者',
  ability: '听见潮汐',
  tone: '诗性冒险',
  immersive: false,
  hometown: '',
  school: '',
  company: '',
  role: '',
  friend: '',
  destination: '',
  step: 1,
}

const MAX_CHAPTERS = 6
const LAST_INDEX = MAX_CHAPTERS - 1
let idCounter = 0

const GENRE_BY_ID = { ...Object.fromEntries(GENRES.map((genre) => [genre.id, genre])), [CUSTOM_GENRE_ID]: CUSTOM_GENRE }

const cleanText = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback
  return value.trim().slice(0, 240)
}

const cleanBounded = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : ''

// The name a story's world is actually called. Preset stages use their fixed
// name; a god-mode world uses the creator's own name (or the placeholder).
const worldNameOf = (genre, config) => genre.id === CUSTOM_GENRE_ID
  ? cleanBounded(config?.customWorldName, CUSTOM_WORLD_NAME_MAX) || CUSTOM_GENRE.world
  : genre.world

const customSettingOf = (config) => cleanBounded(config?.customWorldSetting, CUSTOM_WORLD_SETTING_MAX)

/*
 * 出生点 (spawn point): the small, concrete place where chapter one opens.
 * Each preset world carries a list; the entry whose name equals the world's
 * `location` is the default, so saves written before spawn points existed
 * (no startPointName) resolve to exactly the place they always opened at.
 * God-mode worlds have no list: the creator may type a free-form spawn point
 * (name, optionally with a hook borrowed from a bound template's world), and
 * an empty name means "the setting text decides" — resolveStartPoint then
 * returns null and every consumer falls back to its previous behaviour.
 */
export const startPointsFor = (genre) => (Array.isArray(genre?.spawnPoints) ? genre.spawnPoints : [])

export const defaultStartPoint = (genre) =>
  startPointsFor(genre).find((point) => point.name === genre.location) || startPointsFor(genre)[0] || null

export const startPointByName = (genre, name) => {
  const wanted = cleanBounded(name, START_POINT_NAME_MAX)
  if (!wanted) return null
  return startPointsFor(genre).find((point) => point.name === wanted) || null
}

export const resolveStartPoint = (genre, config = {}) => {
  if (!genre) return null
  const named = cleanBounded(config?.startPointName, START_POINT_NAME_MAX)
  const typedHook = cleanBounded(config?.startPointHook, START_POINT_HOOK_MAX)
  if (genre.id === CUSTOM_GENRE_ID) {
    return named ? { name: named, hook: typedHook, situation: '' } : null
  }
  const listed = startPointByName(genre, named)
  if (listed) return { ...listed }
  if (named) return { name: named, hook: typedHook, situation: '' }
  const fallback = defaultStartPoint(genre)
  return fallback ? { ...fallback } : null
}

const asStep = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(1, Math.min(5, Math.floor(number))) : 1
}

const clone = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

const now = () => new Date().toISOString()

const makeId = (prefix = 'story') => {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`
}

const genreFor = (genreId) => GENRE_BY_ID[genreId] || GENRE_BY_ID.mist

const normalizeDraft = (draft = {}) => {
  const input = draft && typeof draft === 'object' ? draft : {}
  const genreId = GENRE_BY_ID[input.genreId] ? input.genreId : DEFAULT_DRAFT.genreId
  const immersive = Boolean(input.immersive)
  // The UI may retain these optional details in its draft after the switch is
  // turned off. A newly created story must not inherit them without opt-in.
  const lifeDetail = (field) => immersive ? cleanText(input[field], DEFAULT_DRAFT[field]) : ''
  return {
    genreId,
    genreTemplateId: genreTemplateById(input.genreTemplateId)?.id || '',
    customWorldName: cleanBounded(input.customWorldName, CUSTOM_WORLD_NAME_MAX),
    customWorldSetting: cleanBounded(input.customWorldSetting, CUSTOM_WORLD_SETTING_MAX),
    startPointName: cleanBounded(input.startPointName, START_POINT_NAME_MAX),
    startPointHook: cleanBounded(input.startPointHook, START_POINT_HOOK_MAX),
    name: cleanText(input.name, DEFAULT_DRAFT.name),
    trait: cleanText(input.trait, DEFAULT_DRAFT.trait),
    origin: cleanText(input.origin, DEFAULT_DRAFT.origin),
    ability: cleanText(input.ability, DEFAULT_DRAFT.ability),
    tone: cleanText(input.tone, DEFAULT_DRAFT.tone),
    immersive,
    hometown: lifeDetail('hometown'),
    school: lifeDetail('school'),
    company: lifeDetail('company'),
    role: lifeDetail('role'),
    friend: lifeDetail('friend'),
    destination: lifeDetail('destination'),
    step: asStep(input.step),
  }
}

const protagonistName = (config, fallback = '未命名旅人') => cleanText(config?.name, '') || fallback

const displayIdentity = (config) => cleanText(config?.role, '') || cleanText(config?.origin, '') || '无名旅人'

const realityDetail = (config) => {
  if (!config?.immersive) return ''
  const hometown = cleanText(config.hometown, '')
  const school = cleanText(config.school, '')
  const company = cleanText(config.company, '')
  const role = cleanText(config.role, '')
  return [
    hometown && `来自${hometown}`,
    school && `曾在${school}学习`,
    company && `在${company}工作`,
    role && `以${role}为生`,
  ].filter(Boolean).join('、')
}

const titleFor = (config, genre) => {
  const name = protagonistName(config, '')
  if (genre.id === CUSTOM_GENRE_ID) {
    const world = worldNameOf(genre, config)
    return name ? `${world} · ${name}` : world
  }
  if (name) return `${genre.title} · ${name}`
  return genre.title
}

const outlineFor = (genre, config) => {
  const name = protagonistName(config)
  const identity = displayIdentity(config)
  const destination = cleanText(config.destination, '') || genre.location
  const spawn = resolveStartPoint(genre, config)
  if (genre.id === CUSTOM_GENRE_ID) {
    const world = worldNameOf(genre, config)
    return [
      spawn
        ? `${name}以${identity}的身份在${spawn.name}醒来，创世设定落地的第一幕开始。`
        : `${name}以${identity}的身份踏入${world}，创世设定落地的第一幕开始。`,
      `设定里的第一条规则开始运转，${name}被卷入其中，无人能置身事外。`,
      `一次选择让同行者与${name}站到同一条路上，也留下新的代价。`,
      `旧秩序要求${name}交出能力，真正的对手从设定深处显形。`,
      `${name}必须在回到原点与改写规则之间作出最后准备。`,
      `终局会回答：这个由创世者亲手写下的世界，最终会变成什么样子。`,
    ]
  }
  return [
    `${name}以${identity}的身份在${spawn?.name || genre.location}醒来，收到一个无法解释的信号。`,
    `信号把${name}带向${destination}，第一条世界规则开始松动。`,
    `一次选择让同行者与${name}站到同一条路上，也留下新的代价。`,
    `旧秩序要求${name}交出能力，真正的敌人从记忆里显形。`,
    `${name}必须在回到原点与打开边界之间作出最后准备。`,
    `终局会回答：谁有权替这个世界记住未来。`,
  ]
}

const worldBibleFor = (genre, config) => {
  const name = protagonistName(config)
  const detail = realityDetail(config)
  if (genre.id === CUSTOM_GENRE_ID) {
    const world = worldNameOf(genre, config)
    const setting = customSettingOf(config)
    const spawn = resolveStartPoint(genre, config)
    const opening = spawn ? `故事从${spawn.name}开始` : '这个世界还没有成文的设定，规则将随故事逐一显形'
    return {
      premise: setting
        ? `${world}：${setting} ${name}${detail ? `（${detail}）` : ''}的故事，就从这个由创世者亲手写下的世界里开始${spawn ? `，第一幕落在${spawn.name}` : ''}。`
        : `${world}里，${name}${detail ? `（${detail}）` : ''}的故事从这里开始；${opening}。`,
      rules: [
        ...(setting
          ? [`创世设定（这个世界以此为准）：${setting}`]
          : ['这个世界尚无成文规则，第一章将随主角的行动立下第一条。']),
        '已经做出的选择会留下可追踪的回声，不能被无痕抹去。',
        '能力有边界；每一次越界都会改变关系或世界稳定度。',
      ],
      endingAnchor: `${name}必须决定${world}的未来走向，以及谁有资格改写它的规则。`,
      outline: outlineFor(genre, config),
    }
  }
  const spawn = resolveStartPoint(genre, config)
  return {
    premise: `${genre.world}里，${name}${detail ? `（${detail}）` : ''}在${spawn?.name || genre.location}发现一条会回应选择的世界线。`,
    rules: [
      `${genre.world}的秘密只能通过具体行动被唤醒。`,
      '已经做出的选择会留下可追踪的回声，不能被无痕抹去。',
      '能力有边界；每一次越界都会改变关系或世界稳定度。',
    ],
    endingAnchor: `${name}必须决定把记忆交给谁，以及是否让世界继续保持原样。`,
    outline: outlineFor(genre, config),
  }
}

const validateStory = (story) => {
  if (!story || typeof story !== 'object' || typeof story.id !== 'string') {
    throw new TypeError('story must be a Story object')
  }
  if (!Array.isArray(story.chapters) || !story.config || typeof story.config !== 'object') {
    throw new TypeError('story is missing chapters or config')
  }
}

const validateIndex = (index) => {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_CHAPTERS) {
    throw new RangeError(`chapter index must be an integer from 0 to ${LAST_INDEX}`)
  }
}

const hash = (value) => {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(36)
}

const choiceAt = (story, index) => {
  if (index !== 1 && index !== 3) return null
  const config = story.config || {}
  const genre = genreFor(story.genreId || config.genreId)
  const merged = story.kind === 'merged'
  if (index === 1) {
    if (merged) {
      const bond = config.merge?.bond === 'rivals' ? '先试探对方' : '先把后背交给对方'
      return {
        prompt: `${bond}，你要怎样回应合流信号？`,
        options: [
          { id: 'join', label: '并肩走进合流点', detail: '让两种规则先共享一口气息', consequence: '双主角关系获得共同目标。' },
          { id: 'guard', label: '保持距离观察', detail: '先确认对方没有带来污染', consequence: '世界稳定度上升，但信任会变慢。' },
        ],
      }
    }
    const noun = genre.id === 'cultivation' ? '火种' : genre.id === 'neon' ? '备份' : genre.id === 'city' ? '留言' : '信'
    return {
      prompt: `${protagonistName(config)}收到一枚${noun}，要现在回应吗？`,
      options: [
        { id: 'open', label: '立刻回应', detail: '让未知的来客知道你已经听见', consequence: '线索变清晰，关系更靠近。' },
        { id: 'wait', label: '先按下不动', detail: '记下信号，去找一个更安全的出口', consequence: '稳定度上升，但真相会绕远。' },
      ],
    }
  }
  if (merged) {
    return {
      prompt: '两套规则同时发出警报，谁来决定下一步？',
      options: [
        { id: 'bridge', label: '让规则互相翻译', detail: '接受短暂的不稳定，找一条共同语法', consequence: '两个世界获得新的共同规则。' },
        { id: 'separate', label: '保留各自边界', detail: '不牺牲任何一方的原有秩序', consequence: '合流变慢，但两条世界线保持清醒。' },
      ],
    }
  }
  return {
    prompt: `${worldNameOf(genre, config)}要求你为下一段路选定代价。`,
    options: [
      { id: 'cross', label: `前往${cleanText(config.destination, '') || genre.location}`, detail: `用“${cleanText(config.ability, '') || '你的能力'}”穿过边界`, consequence: '主动承担风险，打开隐藏章节。' },
      { id: 'return', label: '回到熟悉的地方', detail: `向${cleanText(config.friend, '') || '一个可信的人'}求证`, consequence: '保留退路，也让旧关系重新发声。' },
    ],
  }
}

// Local storage is user-editable, so a stale or hand-written choice must not
// steer the narrative as if it were a real branch.  The UI also validates this
// value, but keeping the engine defensive prevents contaminated chapter text.
const validChoiceAt = (story, index) => {
  const candidate = story?.choices?.[index]
  if (typeof candidate !== 'string') return null
  const choice = choiceAt(story, index)
  return choice?.options?.some((option) => option.id === candidate) ? candidate : null
}

const sceneFor = (story, index) => {
  const config = story.config || {}
  const genre = genreFor(story.genreId || config.genreId)
  const name = protagonistName(config)
  const identity = displayIdentity(config)
  const ability = cleanText(config.ability, '') || '尚未命名的能力'
  const trait = cleanText(config.trait, '') || '还没有被定义的性格'
  const origin = cleanText(config.origin, '') || '无名来处'
  const identityWithOrigin = identity === origin ? identity : `${identity}（${origin}）`
  const friend = cleanText(config.friend, '') || '一个尚未现身的同行者'
  const destination = cleanText(config.destination, '') || genre.location
  const lived = realityDetail(config)
  const previousOne = validChoiceAt(story, 1)
  const previousThree = validChoiceAt(story, 3)

  if (story.kind === 'merged') {
    const protagonists = Array.isArray(config.protagonists) ? config.protagonists : []
    const first = protagonistName(protagonists[0], '旅者甲')
    const second = protagonistName(protagonists[1], '旅者乙')
    const bond = config.merge?.bond === 'rivals' ? '彼此提防' : '暂时结盟'
    const lead = config.merge?.lead === 'b' ? second : first
    const branchOne = previousOne
      ? previousOne === 'guard' ? '他们先在各自的边界上停下，交换了三条不能触碰的规则。' : '他们并肩踏入合流点，脚下同时亮起两种不同颜色的光。'
      : null
    const branchThree = previousThree
      ? previousThree === 'separate' ? '两套规则保持距离，反而在缝隙里找到不伤害彼此的节奏。' : '规则互相翻译，陌生的词语第一次拥有了共同的意思。'
      : null
    const mergedScenes = [
      [`${first}与${second}的世界在${genre.location}相撞。`, `${lead}先听见另一条世界线的回声；${bond}的两个人，必须在同一秒抬头。`],
      [`合流信号逼近，${first}和${second}面对同一扇没有门的门。`, '门内的光停在两个人脚边，既没有催促，也没有替他们迈出第一步。', `他们各自的能力都被要求说出真实名字。`],
      [...(branchOne ? [branchOne] : []), `共同的天空短暂地恢复颜色。`, `${first}和${second}把两种记忆叠在一起，发现敌人来自规则之外。`],
      [`两套世界规则同时发出警报。`, '两种声音争相占据天空，尚未有人决定让它们靠近，还是各自退回边界。', `${first}把选择权递给${second}，而${second}没有立即回答。`],
      [...(branchThree ? [branchThree] : []), `合流点开始坍缩，所有未说出口的话变成可见的路标。`, `他们决定把最重要的秘密留给彼此，而不是留给任何一条旧世界线。`],
      [`新的宇宙终于找到共同的呼吸。`, `${first}与${second}站在同一片晨光里：边界没有消失，只是终于学会了相遇。`],
    ]
    return mergedScenes[index]
  }

  const livedLine = lived ? `那一点来自真实生活的火种——${lived}——让这次触碰显得异常熟悉。` : `没有人替${name}解释眼前的异常，只有${trait}让TA没有立刻转身。`
  const customWorld = worldNameOf(genre, config)
  const customSetting = customSettingOf(config)
  const customSettingLine = customSetting
    ? `创世者为这个世界写下的设定是：「${customSetting}」`
    : '这个世界还没有成文的设定，第一页将由主角的脚步写下。'
  const scenes = {
    mist: [
      [`${genre.world}的潮汐钟在${genre.location}敲响第七次。`, `${name}作为${identityWithOrigin}站在雾海边，手里握着“${ability}”的微弱回声。`, livedLine],
      [`雾里漂来一封没有落款的信，${name}听见潮水叫出自己的名字。`, '信纸仍然合拢，封口下有一点蓝火，安静地等着一个回答。', '钟声催着潮水倒退，留给TA的时间只剩下一次呼吸。'],
      [...(previousOne ? [previousOne === 'wait' ? 'TA把信压在掌心，没有让钟声替自己做决定。直到找到岸边的旧灯，才借它的光辨清信上的潮痕。' : 'TA让蓝火沿着指尖亮起，信纸背面浮出一条新的航线。'] : []), `${name}沿着倒流的潮痕抵达${destination}。`, `一位陌生的守钟人说，只有真正记得自己的人才能穿过雾门。`, `TA想起${friend}曾经说过的一句话：不要把每个答案都交给钟声。`],
      [`钟塔内部没有楼梯，只有一面把记忆折成房间的墙。`, '门缝里透出陌生的光，身后的旧坐标仍然清晰；两条路都在等待。', `真正的敌人不是潮水，而是被人删掉的那一段历史。`],
      [...(previousThree ? [previousThree === 'return' ? `TA回到${friend}留下的旧坐标，发现那里藏着一盏仍然温热的灯。` : `TA用“${ability}”缝合裂开的门缝，听见雾海另一端有人回应。`] : []), `风暴把港镇推向同一条轨道，${name}必须决定要保护哪一种记忆。`, `TA把身份、能力与一路收集的回声放在同一架天平上。`, `${destination}的灯亮了三次，像是在等待一个不再犹豫的回答。`],
      [`潮汐终于落下，露出一座从未出现在地图上的岛。`, `${name}没有替世界写死结局；TA只留下一个可以被后来者继续选择的名字。`, `沉潮港记住了这次选择，下一条世界线由此开始。`],
    ],
    cultivation: [
      [`${genre.world}的灵脉在${genre.location}裂开一道细缝。`, `${name}这个${identityWithOrigin}被召到山门前，掌心藏着“${ability}”最后一簇火。`, livedLine],
      [`天门落下一枚无主的火印，${name}必须决定要不要接住。`, '火印悬在掌心上方，温度还没有穿透皮肤，旧符也仍在袖中。', `山风把路吹向${destination}，也吹来仙门不愿承认的真相。`],
      [...(previousOne ? [previousOne === 'wait' ? 'TA先把火印封进旧符，去寻找能证明它来历的证人。' : 'TA将火印按进心口，听见云海之上有人喊出自己的名字。'] : []), `${name}在${destination}遇见一座倒悬的藏经塔。`, `塔中没有经文，只有${friend}留下的三句批注，字迹仍带着未熄的温度。`, `修行不是把自己变得无坚不摧，而是知道哪一处裂缝必须被保护。`],
      [`灵火开始吞噬旧法阵，所有长老都要求${name}交出“${ability}”。`, '旧山门与燃烧的法阵各占据一侧，谁也没有得到TA最后的答复。', `天上第一次传来没有人说过的第三种声音。`],
      [...(previousThree ? [previousThree === 'return' ? `TA回到${friend}的门下，把证据放在众人面前，先守住可以回来的路。` : `TA以“${ability}”引火入脉，让一条凡人也能走的路从废墟里升起。`] : []), `天门向下开启，凡人与仙门的名字同时被写进天榜。`, `${name}在飞升前回望${genre.location}，发现真正的火种从来不属于某一个宗门。`, `选择留下的代价，比选择登天更需要勇气。`],
      [`火种没有熄灭，它只是从一双手传到了更多双手。`, `${name}让自己的名字成为一道可以被质疑的注脚，而不是新的戒律。`, `青岚宗的夜空里，第一颗不属于仙人的星星亮了。`],
    ],
    neon: [
      [`${genre.world}的雨水把${genre.location}刷成深蓝。`, `${name}作为${identityWithOrigin}接入一份名为“${ability}”的异常人格备份。`, livedLine],
      [`备份在${name}耳边说出一句只有TA自己知道的话。`, '读取心跳的请求停在视野中央，确认键与断开键同时闪烁。', `追踪信号指向${destination}，那里的雨没有落地。`],
      [...(previousOne ? [previousOne === 'wait' ? 'TA先切断外网，把那句声音写进一块不会联网的旧芯片。' : 'TA允许备份读取一秒钟的心跳，城市的广告牌同时暗了下来。'] : []), `${name}穿过${destination}的蓝雨，遇见${friend}的匿名头像。`, `对方说记忆不是证据，选择才是；然后把一把不存在的钥匙推过来。`, `钥匙打开的不是门，而是一个仍在运行的童年。`],
      [`城市主机要求${name}删除“${ability}”以恢复秩序。`, '两份冲突的人格等待最后授权，安全屋的地址依然留在离线地图里。', '整座城市的屏幕停在同一秒，等一个尚未落下的指令。'],
      [...(previousThree ? [previousThree === 'return' ? `TA回到${friend}留下的安全屋，先保存一份可以撤回的证据。` : `TA用“${ability}”把两份冲突人格暂时缝在一起，让系统看见自己的盲点。`] : []), `系统倒计时归零，${name}站在没有摄像头的十字路口。`, `TA发现真正需要被备份的不是记忆，而是每个人仍能改变的权利。`, `${destination}传来一段无主的旋律，像在邀请城市醒来。`],
      [`雨停了三十秒，足够一座城重新命名自己。`, `${name}没有删除那份人格，只给它留下了可以说“不”的边界。`, `蓝雨再次落下时，故事已经不再属于某一个数据库。`],
    ],
    city: [
      [`${genre.world}的时钟永远停在凌晨四点。`, `${name}作为${identityWithOrigin}在${genre.location}醒来，口袋里有一张写着“${ability}”的车票。`, livedLine],
      [`车票背面出现一条只在夜里发光的留言。`, '一班没有终点的电车停在站台前，车门敞着，还没有人上车。', `站牌上的${destination}忽明忽暗，像一段没有发出的邀请。`],
      [...(previousOne ? [previousOne === 'wait' ? 'TA先把留言留在站牌下，决定查清是谁把自己的名字写了上去。' : 'TA沿着留言登上一班没有终点的电车，听见陌生人叫出自己的名字。'] : []), `${name}在${destination}遇见${friend}，对方说自己已经等了很多年。`, `他们交换了一段不完整的记忆，发现整座城市都在替某个人保守秘密。`, `凌晨四点不是终点，而是所有错过的人短暂重逢的入口。`],
      [`城市广播要求${name}放弃“${ability}”换取一条回家的路。`, '熟悉的街角就在身后，前方熄灭的路灯则等着另一种答案。', '广播重复了最后一个问题，城市还没有等到回答。'],
      [...(previousThree ? [previousThree === 'return' ? `TA回到${friend}熟悉的街角，先把能回来的门留给所有人。` : `TA用“${ability}”让一条旧街重新亮起，路牌开始显示真正的名字。`] : []), `天快亮了，${name}必须决定哪一段夜晚值得被留下。`, `TA把选择写进${genre.location}的公共墙面，允许下一个路人改写最后一行。`, `${destination}的门没有关，像是在给未来预留座位。`],
      [`凌晨四点终于过去，城市没有忘记那些没能赶上的人。`, `${name}带着一张空白车票走向晨光，知道重逢不是结局而是新的选择。`, `长宁街第一次拥有了属于所有人的早晨。`],
    ],
    court: [
      [`${genre.world}的册封礼刚过三日，宫里的钟比往日慢了半拍。`, `${name}这个${identityWithOrigin}第一次走进${genre.location}，掌事姑姑把一册写着“${ability}”的旧档推到TA面前，只说了一句：看完就烧。`, livedLine],
      [`旧档里夹着一封没有寄出的家书，字迹在半途换了人。`, '家书压在妆奁最底层，封口完好，收信人的名字却被人用朱砂划去。', `姑姑说，${destination}那边的席位已经空了三年，只等一个人坐回去。`],
      [...(previousOne ? [previousOne === 'wait' ? 'TA没有立刻烧档，先把家书的缺页拓了下来，去问经手过这批旧档的人。' : 'TA借着更漏的光读完最后一行，窗外恰好传来升位的钟响——有人欢喜，有人今夜睡不着。'] : []), `${name}在${destination}见到${friend}，对方只问了一句：你想赢，还是想活？`, `两个人隔着一扇屏风谈了一夜，把各自知道的半张棋盘拼到了一起。`, `位分是给外人看的，真正的命数藏在谁先沉不住气里。`],
      [`旧档的来历被翻了出来，太后与陛下同时召见${name}。`, '两道旨意摆在案上，一道给恩宠，一道给出路；殿里的香还没燃尽。', `所有人都看着${name}的手会先伸向哪一道。`],
      [...(previousThree ? [previousThree === 'return' ? `TA回到${friend}的旧居，把拓下的缺页放在众人面前，先保住能作证的人。` : `TA用“${ability}”换了一次当众对质的机会，让说谎的人自己走完最后一句谎话。`] : []), `王朝的账算到了最后一页，${name}发现最初的那封家书，原是写给自己的。`, `TA把选择权交还给被划去名字的那个人，而不是替TA原谅谁。`, `${destination}的灯次第亮起，像一条终于能走完的路。`],
      [`朱墙依旧，天光落进来时却不再刺眼。`, `${name}没有赢得所有，只赢回了说“不”的资格——这比位分更难，也更长久。`, `宫墙深处，从此多了一盏为后来者留的灯。`],
    ],
    frontier: [
      [`${genre.location}的引力锚第三次失稳，整座${genre.world}的灯都暗了一瞬。`, `${name}这个${identityWithOrigin}攥着最后一张配给卡，听见广播把“${ability}”列为未登记变量。`, livedLine],
      [`废弃货舱里传出一串重复的求救码，落款是三十年前失踪的殖民船。`, '求救码停在最后一位，没有解完，也没有消失，像一句没说完的话。', `导航把航线标向${destination}——那片星域在所有官方图上都是空白。`],
      [...(previousOne ? [previousOne === 'wait' ? 'TA先把求救码录进离线芯片，去找见过那艘船的老领航员对口供。' : 'TA让“${ability}”接管三秒导航，整条星环的灯顺次暗了一遍，又顺次亮回来。'] : []), `${name}在${destination}遇见${friend}的应急人格备份，对方说自己等这一班船等了三十年。`, `备份交出一张手绘星图：官方版本删掉的航线，全在上面。`, `在边疆，活下去的第一课是承认旧地图是错的。`],
      [`星环议会要求${name}交出“${ability}”的登记权，换全船队的燃料配额。`, '配给表已经发到每个人手里，倒计时挂在舱门上方；没有人先开口。', `真正的敌人不在废土里，在那张永远算不平的账上。`],
      [...(previousThree ? [previousThree === 'return' ? `TA回到${friend}的备份舱，先把星图抄了三份，藏进三艘不同的船。` : `TA用“${ability}”重写了前哨站的配给算法，让最底层的人第一次出现在名单上。`] : []), `废土的信号塔全部转向同一片空白星域，${name}必须决定舰队是启程还是留下。`, `TA把启程的决定交给投票，而不是交给配给表。`, `${destination}的方向升起一颗不在任何图上的星。`],
      [`星环以远，第一艘自愿启程的船点火成功。`, `${name}没有成为新的领航神话，只在航行日志第一页写下：规则可以重学，人不能重来。`, `边疆从此有了自己的第一页历史。`],
    ],
    custom: [
      [`${customWorld}在${name}睁开眼时显形——它不属于任何一张现成的地图。`, `${name}作为${identityWithOrigin}站在故事开始的地方，手里握着“${ability}”的第一缕回声。`, customSettingLine],
      [`这个世界的第一条规则在${name}面前运转起来，比设定里写的更不讲道理。`, '一件小事被规则放大，四周安静下来，像在等TA先迈出一步。', `而${friend}——如果这个世界里真有这个人——应该已经听说了这件事。`],
      [...(previousOne ? [previousOne === 'wait' ? 'TA没有立刻顺着规则走，先把异常记下来，去找这个世界真正的裂缝。' : 'TA顺着规则迈出第一步，世界随之改写了下一行设定。'] : []), `${name}循着回声往前走，发现设定里没写到的东西，比写到的更多。`, `一位同行者说，这个世界只对亲手写下它的人留了一扇后门。`],
      [`旧秩序找上了${name}，要求TA交出“${ability}”，理由写在设定之外的空白处。`, '两条路都摆在面前，一条回头，一条改写；没有人先替TA开口。', `真正的对手还没有露面，只先送来了一句话。`],
      [...(previousThree ? [previousThree === 'return' ? `TA回到最初醒来的地方，先把能回来的门留给所有人。` : `TA用“${ability}”撬开设定的边界，让一条没人走过的路从空白里升起。`] : []), `${customWorld}开始偏离最初的设定，${name}必须决定：修正它，还是让它长成自己的样子。`, `TA把身份、能力与一路收集的回声放在同一架天平上。`],
      [`世界走到了设定没有覆盖的地方。`, `${name}没有替它写死结局；TA只留下一个可以被后来者继续改写的名字。`, `${customWorld}从这里开始，拥有了自己的第二页。`],
    ],
  }
  // Chapter one opens AT the spawn point: its hook replaces the generic
  // establishing line, and later lines in the opening scene that still name
  // the world's default location are re-pointed at the chosen spawn point.
  // Later chapters are untouched — a spawn point is a start, not a cage.
  if (index === 0) {
    const spawn = resolveStartPoint(genre, config)
    if (spawn && genre.id === CUSTOM_GENRE_ID) {
      scenes.custom[0] = [
        `${customWorld}在${name}睁开眼时显形——它不属于任何一张现成的地图。`,
        spawn.hook
          ? `${spawn.hook} ${name}这个${identityWithOrigin}的手里，握着“${ability}”的第一缕回声。`
          : `${name}作为${identityWithOrigin}在${spawn.name}醒来，手里握着“${ability}”的第一缕回声。`,
        customSettingLine,
      ]
    } else if (spawn) {
      const opening = scenes[genre.id][0]
      scenes[genre.id][0] = [
        spawn.hook || opening[0],
        ...opening.slice(1).map((line) => (spawn.name === genre.location ? line : line.split(genre.location).join(spawn.name))),
      ]
    }
  }
  return scenes[genre.id]?.[index] || scenes.mist[index]
}

export function createStory(draft = DEFAULT_DRAFT) {
  const config = normalizeDraft(draft)
  const genre = genreFor(config.genreId)
  const timestamp = now()
  return {
    id: makeId(),
    title: titleFor(config, genre),
    genreId: genre.id,
    // The server resolves the genre template from this top-level field first;
    // it is only present when the draft pinned one explicitly.
    ...(config.genreTemplateId ? { genreTemplateId: config.genreTemplateId } : {}),
    config,
    worldBible: worldBibleFor(genre, config),
    chapterIndex: 0,
    chapters: [],
    choices: {},
    revision: 0,
    kind: 'solo',
    sourceIds: [],
    author: '我',
    createdAt: timestamp,
    updatedAt: timestamp,
    bookmarked: false,
  }
}

export function buildChapter(story, index) {
  validateStory(story)
  validateIndex(index)
  const genre = genreFor(story.genreId || story.config.genreId)
  const scene = sceneFor(story, index)
  const titleBase = genre.id === CUSTOM_GENRE_ID ? worldNameOf(genre, story.config) : genre.title
  const titles = story.kind === 'merged'
    ? ['相撞的天空', '合流信号', '共同的回声', '两种规则', '无昼之境', '共同呼吸']
    : [`${titleBase} · 初声`, `${titleBase} · 信号`, `${titleBase} · 追迹`, `${titleBase} · 越界`, `${titleBase} · 回望`, `${titleBase} · 新页`]
  const name = story.kind === 'merged'
    ? (story.config.protagonists || []).map((item, itemIndex) => protagonistName(item, `旅者${itemIndex === 0 ? '甲' : '乙'}`)).join('与')
    : protagonistName(story.config)
  const branchOne = validChoiceAt(story, 1)
  const branchThree = validChoiceAt(story, 3)
  const firstDecision = choiceAt(story, 1)?.options.find((option) => option.id === branchOne)
  const laterDecision = choiceAt(story, 3)?.options.find((option) => option.id === branchThree)
  const branchLabel = firstDecision ? `“${firstDecision.label}”的决定仍在回响，${firstDecision.consequence}` : ''
  const lateBranchLabel = laterDecision ? `“${laterDecision.label}”的决定改变了前路，${laterDecision.consequence}` : ''
  const paragraphs = [...scene]
  if (index >= 2 && branchLabel) paragraphs.push(branchLabel)
  if (index >= 4 && lateBranchLabel) paragraphs.push(lateBranchLabel)
  const choice = choiceAt(story, index)
  const spawn = story.kind === 'merged' ? null : resolveStartPoint(genre, story.config)
  const summary = index === LAST_INDEX
    ? `${name}抵达终局，世界为新的选择留出位置。`
    : index === 0 && spawn
      ? `${name}在${spawn.name}醒来，故事的第一幕从这里开始。`
      : `${name}在${worldNameOf(genre, story.config)}推进到第${index + 1}幕${choice ? '，命运节点即将出现' : '。'}`
  return {
    id: `${story.id}:chapter:${index}:r${story.revision}`,
    index,
    title: titles[index],
    paragraphs,
    choice,
    summary,
  }
}

const ACT_LABELS = [
  '第 1 章 · 开篇',
  '第 2 章 · 第一次选择',
  '第 3 章 · 展开',
  '第 4 章 · 第二次选择',
  '第 5 章 · 转折',
  '第 6 章 · 结局',
]

const TONE_DIRECTIVES = {
  诗性冒险: '注重环境细节与场景氛围描写，推进主角探索过程。',
  悬疑推进: '注重线索铺垫、时间压力与前后因果逻辑。',
  群像治愈: '注重人物对话、互动关系与共同解决问题的过程。',
}

// 为每一章提供确定性的章节结构规划，供模型生成与阅读器剧情概览共享。
export function storyBeatPlan(story, index) {
  validateStory(story)
  validateIndex(index)
  const config = story.config || {}
  const genre = genreFor(story.genreId || config.genreId)
  const merged = story.kind === 'merged'
  const name = merged
    ? (config.protagonists || []).map((item, idx) => protagonistName(item, `旅者${idx === 0 ? '甲' : '乙'}`)).join('与')
    : protagonistName(config)
  const identity = displayIdentity(config)
  const ability = cleanText(config.ability, '') || '尚未命名的能力'
  const isCustom = genre.id === CUSTOM_GENRE_ID
  const worldDisplay = worldNameOf(genre, config)
  const customSetting = customSettingOf(config)
  const destination = cleanText(config.destination, '') || (isCustom ? worldDisplay : genre.location)
  const friend = cleanText(config.friend, '') || '同行者'
  const lived = realityDetail(config)
  const tone = cleanText(config.tone, '') || '诗性冒险'
  const toneDirective = TONE_DIRECTIVES[tone] || TONE_DIRECTIVES.诗性冒险
  const spawn = resolveStartPoint(genre, config)
  const spawnName = spawn?.name || genre.location

  const prerequisites = [
    isCustom
      ? (spawn ? `世界：${worldDisplay}（由创世者亲手写定的世界；出生点：${spawn.name}）` : `世界：${worldDisplay}（由创世者亲手写定的世界）`)
      : `世界：${genre.world}（出生点：${spawnName}）`,
    ...(isCustom && customSetting ? [`创世设定：${customSetting}`] : []),
    merged
      ? `双主角合流：${name}（规则：${config.merge?.rules === 'separate' ? '各自独立' : '互相融合'}，关系：${config.merge?.bond === 'rivals' ? '竞争' : '合作'}）`
      : `主角：${name}，身份“${identity}”，性格“${cleanText(config.trait, '') || '冷静观察者'}”`,
    `能力：${ability}`,
  ]
  if (lived && !merged) prerequisites.push(`现实背景：${lived}`)

  const unlockedConsequences = []
  if (index >= 2) {
    const c1 = validChoiceAt(story, 1)
    const opt1 = choiceAt(story, 1)?.options.find((opt) => opt.id === c1)
    if (opt1) {
      unlockedConsequences.push({ chapter: 2, choiceId: opt1.id, label: opt1.label, consequence: opt1.consequence })
      prerequisites.push(`第 2 章已选：“${opt1.label}”——${opt1.consequence}`)
    }
  }
  if (index >= 4) {
    const c3 = validChoiceAt(story, 3)
    const opt3 = choiceAt(story, 3)?.options.find((opt) => opt.id === c3)
    if (opt3) {
      unlockedConsequences.push({ chapter: 4, choiceId: opt3.id, label: opt3.label, consequence: opt3.consequence })
      prerequisites.push(`第 4 章已选：“${opt3.label}”——${opt3.consequence}`)
    }
  }

  const mustGroundByChapter = [
    [
      isCustom
        ? (spawn ? `交代${name}在${spawn.name}醒来的处境与能力“${ability}”` : `交代${name}在${worldDisplay}的处境与能力“${ability}”`)
        : `交代${name}在${spawnName}的处境与能力“${ability}”${spawn?.hook ? `；开局处境：${spawn.hook}` : ''}`,
      `引出主线事件与世界基本规则`,
    ],
    [
      `推进指向“${destination}”的线索`,
      `交代两个选项的背景，正文停在读者做出第 2 章选择之前`,
    ],
    [
      unlockedConsequences[0]
        ? `承接第 2 章选择“${unlockedConsequences[0].label}”的结果：${unlockedConsequences[0].consequence}`
        : `承接第 2 章选择后的剧情变化`,
      merged
        ? `展现双主角在合流点的配合与新冲突`
        : `在${destination}推进与${friend}相关的线索`,
    ],
    [
      `升级主要矛盾，要求${name}做出判断`,
      `交代第二次选择两个方向的利弊，正文停在第 4 章选择之前`,
    ],
    [
      unlockedConsequences[1]
        ? `承接第 4 章选择“${unlockedConsequences[1].label}”的结果：${unlockedConsequences[1].consequence}`
        : `承接第 4 章选择后的局势变化`,
      `推进主线冲突进入结局前的关键阶段`,
    ],
    [
      `回应主线目标：${story.worldBible?.endingAnchor || '完成主线故事收尾'}`,
      `交代此前选择带来的最终结果，完成结局`,
    ],
  ]

  const dramaticQuestions = [
    '交代主角背景、当前处境与故事起点。',
    '推进主线线索，给出第一次分支选择。',
    '承接上一次选择的结果，展开新场景。',
    '矛盾升级，给出第二次分支选择。',
    '承接第二次选择的结果，推向高潮。',
    '解决核心冲突，交代故事结局。',
  ]

  const paragraphShape = index === 1 || index === 3
    ? [
      '承接上文场景，不重复上一章结尾原句',
      '通过具体行动与对话推进冲突',
      '呈现两个选项的处境，在做出决定前结束本章',
    ]
    : [
      '承接当前场景或上一次选择的结果',
      '通过具体事件与人物互动推进剧情',
      '补充与当前情节直接相关的信息',
      '自然收尾并引出下一章内容',
    ]

  return {
    chapterNumber: index + 1,
    act: ACT_LABELS[index],
    dramaticQuestion: dramaticQuestions[index],
    prerequisites,
    mustGround: mustGroundByChapter[index],
    unlockedConsequences,
    toneDirective,
    paragraphShape,
  }
}

// 为阅读器提供不剧透未来的「故事脉络」档案（仅聚合至 lastAccessibleIndex）。
export function storyNarrativeDossier(story, maxChapterIndex = 0) {
  validateStory(story)
  const limit = Math.max(0, Math.min(LAST_INDEX, Number.isInteger(maxChapterIndex) ? maxChapterIndex : 0))
  const genre = genreFor(story.genreId || story.config.genreId)
  const currentBeat = storyBeatPlan(story, limit)
  const groundedSet = new Set(currentBeat.prerequisites)
  for (let i = 0; i <= limit; i += 1) {
    const plan = storyBeatPlan(story, i)
    for (const item of plan.mustGround) groundedSet.add(item)
  }
  const activeConsequences = []
  for (const gate of [1, 3]) {
    if (gate <= limit) {
      const chosenId = validChoiceAt(story, gate)
      const option = choiceAt(story, gate)?.options.find((opt) => opt.id === chosenId)
      if (option) {
        activeConsequences.push({
          chapterNumber: gate + 1,
          choiceId: option.id,
          label: option.label,
          detail: option.detail,
          consequence: option.consequence,
        })
      }
    }
  }
  const timeline = []
  for (let i = 0; i <= limit; i += 1) {
    const chapter = chapterForReading(story, i) || story.chapters?.[i]
    if (!chapter) continue
    const chosenId = validChoiceAt(story, i)
    const option = choiceAt(story, i)?.options.find((opt) => opt.id === chosenId)
    timeline.push({
      chapterIndex: i,
      chapterNumber: i + 1,
      title: chapter.title,
      act: ACT_LABELS[i],
      summary: chapter.summary || '',
      choiceLabel: option ? option.label : null,
    })
  }
  return {
    worldName: worldNameOf(genre, story.config),
    location: resolveStartPoint(genre, story.config)?.name || genre.location,
    premise: story.worldBible?.premise || '',
    rules: Array.isArray(story.worldBible?.rules) ? [...story.worldBible.rules] : [],
    endingAnchor: story.worldBible?.endingAnchor || '',
    currentBeat,
    groundedConcepts: [...groundedSet],
    activeConsequences,
    timeline,
  }
}

// Exact signatures of the early local templates, which narrated a decision's
// result inside the decision chapter. Never use a broad text replacement here:
// prose written by a user or a future model must remain untouched.
const legacyDecisionSignature = (story, index, currentScene) => {
  const config = story.config
  const genre = genreFor(story.genreId || config.genreId)
  const ability = cleanText(config.ability, '') || '尚未命名的能力'
  const friend = cleanText(config.friend, '') || '一个尚未现身的同行者'
  const destination = cleanText(config.destination, '') || genre.location
  if (story.kind === 'merged') {
    return {
      outcomes: index === 1
        ? ['他们先在各自的边界上停下，交换了三条不能触碰的规则。', '他们并肩踏入合流点，脚下同时亮起两种不同颜色的光。']
        : ['两套规则保持距离，反而在缝隙里找到不伤害彼此的节奏。', '规则互相翻译，陌生的词语第一次拥有了共同的意思。'],
      tail: currentScene[2],
    }
  }
  const outcomes = index === 1 ? {
    mist: ['TA把信压在掌心，没有让钟声替自己做决定。', 'TA让蓝火沿着指尖亮起，信纸背面浮出一条新的航线。'],
    cultivation: ['TA先把火印封进旧符，去寻找能证明它来历的证人。', 'TA将火印按进心口，听见云海之上有人喊出自己的名字。'],
    neon: ['TA先切断外网，把那句声音写进一块不会联网的旧芯片。', 'TA允许备份读取一秒钟的心跳，城市的广告牌同时暗了下来。'],
    city: ['TA先把留言留在站牌下，决定查清是谁把自己的名字写了上去。', 'TA沿着留言登上一班没有终点的电车，听见陌生人叫出自己的名字。'],
  } : {
    mist: [`TA回到${friend}留下的旧坐标，发现那里藏着一盏仍然温热的灯。`, `TA用“${ability}”缝合裂开的门缝，听见雾海另一端有人回应。`],
    cultivation: [`TA回到${friend}的门下，把证据放在众人面前，先守住可以回来的路。`, `TA以“${ability}”引火入脉，让一条凡人也能走的路从废墟里升起。`],
    neon: [`TA回到${friend}留下的安全屋，先保存一份可以撤回的证据。`, `TA用“${ability}”把两份冲突人格暂时缝在一起，让系统看见自己的盲点。`],
    city: [`TA回到${friend}熟悉的街角，先把能回来的门留给所有人。`, `TA用“${ability}”让一条旧街重新亮起，路牌开始显示真正的名字。`],
  }
  const tails = index === 1 ? {
    mist: `航线指向${destination}，而潮汐正在倒着退去。`,
    city: `电车驶向${destination}，窗外的街景却像在倒带。`,
  } : {
    neon: '雨幕第一次把所有人的脸还给了他们。',
    city: '有人按下了重启键，城市却选择继续做梦。',
  }
  // Worlds added after the legacy templates (court, frontier) never produced
  // legacy decision prose, so they have no signature to match.
  return { outcomes: outcomes[genre.id] || [], tail: tails[genre.id] || currentScene[2] }
}

// A read-time compatibility view: no mutation, revision change, or chapter
// generation. Missing chapters return null; callers retain their own fallback.
export function chapterForReading(story, index) {
  validateStory(story)
  validateIndex(index)
  const stored = story.chapters.find((chapter) => chapter?.index === index)
  if (!stored) return null
  if (story.engine === 'gemini') return stored
  if ((index !== 1 && index !== 3) || !Array.isArray(stored.paragraphs)) return stored
  const currentScene = sceneFor(story, index)
  const signature = legacyDecisionSignature(story, index, currentScene)
  const [opening, outcome, tail] = stored.paragraphs
  if (opening !== currentScene[0] || !signature.outcomes.includes(outcome) || tail !== signature.tail) return stored

  const choices = choiceAt(story, 1).options
  const selected = choices.find((option) => option.id === validChoiceAt(story, 1))
  const legacyEchoes = new Set(choices.map((option) => `选择“${option.id}”留下的回声正在改变这一章。`))
  const remaining = stored.paragraphs.slice(3).flatMap((paragraph) => {
    if (!legacyEchoes.has(paragraph)) return [paragraph]
    return selected ? [`“${selected.label}”的决定仍在回响，${selected.consequence}`] : []
  })
  return { ...stored, paragraphs: [...currentScene, ...remaining] }
}

export function chapterKey(story, index) {
  validateStory(story)
  validateIndex(index)
  const precedingChoices = Object.entries(story.choices || {})
    .filter(([chapter]) => Number(chapter) < index)
    .sort(([a], [b]) => Number(a) - Number(b))
  const payload = `${story.id}|${story.revision}|${index}|${JSON.stringify(precedingChoices)}`
  return `chapter-key:${hash(payload)}`
}

const hasChoice = (story, index) => Boolean(validChoiceAt(story, index))

export function chooseBranch(story, index, choiceId) {
  validateStory(story)
  if (story.readOnly === true) return story
  validateIndex(index)
  if (typeof choiceId !== 'string' || !choiceId.trim()) throw new RangeError('choiceId must be a non-empty string')
  const chapter = story.chapters.find((item) => item?.index === index)
  if (!chapter) throw new RangeError('cannot choose a branch before accepting that chapter')
  const currentChoice = buildChapter(story, index).choice
  if (!currentChoice || !currentChoice.options.some((option) => option.id === choiceId)) {
    throw new RangeError(`invalid choice ${choiceId} for chapter ${index}`)
  }
  if (story.choices?.[index] === choiceId) return story
  const next = clone(story)
  // Rewriting an earlier node invalidates every choice made in the future.
  // Keep only the decisions that precede this node, then record the new one;
  // otherwise a stale later choice could silently satisfy a new chapter gate.
  const precedingChoices = Object.fromEntries(
    Object.entries(story.choices || {}).filter(([chapter]) => Number(chapter) < index),
  )
  next.choices = { ...precedingChoices, [index]: choiceId }
  next.revision = Number(story.revision || 0) + 1
  next.chapters = story.chapters.slice(0, index + 1).map((item) => clone(item))
  // Preserve accepted prose; only the precisely recognized old prototype
  // decision scenes need compatibility repair when rewriting a branch.
  next.chapters[index] = chapterForReading(next, index)
  next.chapterIndex = Math.min(index + 1, LAST_INDEX)
  next.updatedAt = now()
  return next
}

export function acceptChapter(story, chapter, key) {
  validateStory(story)
  if (story.readOnly === true) return story
  if (!chapter || !Number.isInteger(chapter.index) || chapter.index < 0 || chapter.index >= MAX_CHAPTERS) return story
  const index = chapter.index
  if (typeof key !== 'string' || key !== chapterKey(story, index)) return story
  if (index !== story.chapterIndex) return story
  if (story.chapters.some((item) => item?.index === index)) return story
  const expectedId = `${story.id}:chapter:${index}:r${story.revision}`
  if (chapter.id !== expectedId) return story
  if (index > 0) {
    const previous = buildChapter(story, index - 1)
    if (previous.choice && !hasChoice(story, index - 1)) return story
  }
  const next = clone(story)
  next.chapters = [...story.chapters.map((item) => clone(item)), clone(chapter)]
  next.chapterIndex = Math.min(index + 1, LAST_INDEX)
  next.updatedAt = now()
  return next
}

const publicConfigFor = (config, name = '匿名旅者') => ({
  ...normalizeDraft({ ...config, name, immersive: false, hometown: '', role: '', friend: '', destination: '' }),
  name,
  immersive: false,
  hometown: '',
  school: '',
  company: '',
  role: '',
  friend: '',
  destination: '',
})

// A share snapshot is stricter than a merge hand-off.  It keeps the genre and
// the shape of the story, but removes any free-form identity details that a
// player might have typed for themselves.
const redactedSnapshotConfig = (config, name) => ({
  ...publicConfigFor(config, name),
  name,
  trait: '匿名探索者',
  origin: '未知来处',
  ability: '匿名火种',
  tone: '温和叙事',
  immersive: false,
  hometown: '',
  role: '',
  friend: '',
  destination: '',
  // A god-mode spawn point is free-form creator text; a share snapshot must
  // not carry it (the snapshot resolves to the world's default spawn point).
  startPointName: '',
  startPointHook: '',
})

export function createMergedStory(a, b, options = {}) {
  validateStory(a)
  validateStory(b)
  const rules = options.rules === 'separate' ? 'separate' : 'bridge'
  const lead = options.lead === 'b' ? 'b' : 'a'
  const bond = options.bond === 'rivals' ? 'rivals' : 'allies'
  const sourceA = publicConfigFor(a.config, protagonistName(a.config, '旅者甲'))
  const sourceB = publicConfigFor(b.config, protagonistName(b.config, '旅者乙'))
  const leadConfig = lead === 'b' ? sourceB : sourceA
  const genreA = genreFor(a.genreId || a.config.genreId)
  const genreB = genreFor(b.genreId || b.config.genreId)
  const mergedConfig = {
    ...leadConfig,
    genreId: leadConfig.genreId,
    name: `${sourceA.name} × ${sourceB.name}`,
    trait: `${sourceA.trait} / ${sourceB.trait}`,
    origin: `${sourceA.origin} & ${sourceB.origin}`,
    ability: `${sourceA.ability} + ${sourceB.ability}`,
    tone: leadConfig.tone,
    immersive: false,
    hometown: '',
    role: '',
    friend: '',
    destination: `${genreA.location} ↔ ${genreB.location}`,
    step: 1,
    protagonists: [
      { name: sourceA.name, trait: sourceA.trait, origin: sourceA.origin, ability: sourceA.ability, genreId: sourceA.genreId },
      { name: sourceB.name, trait: sourceB.trait, origin: sourceB.origin, ability: sourceB.ability, genreId: sourceB.genreId },
    ],
    sourceGenres: [genreA.id, genreB.id],
    merge: { rules, lead, bond },
  }
  const timestamp = now()
  const story = {
    id: makeId('merge'),
    title: `合流：${genreA.title} × ${genreB.title}`,
    genreId: mergedConfig.genreId,
    config: mergedConfig,
    worldBible: {
      premise: `${worldNameOf(genreA, a.config)}与${worldNameOf(genreB, b.config)}在一处新的合流点相遇，两位主角必须共同定义边界。`,
      rules: rules === 'bridge'
        ? ['两种世界规则可以互相翻译，但每次翻译都会消耗稳定度。', '双主角共享合流点的选择，任何一方都不能被静默抹去。', '合流后的新规则必须被两位主角共同见证。']
        : ['两种世界规则保持各自边界，只在合流点短暂交叠。', '双主角可以同行，但不能替对方决定原世界的命运。', '任何跨界行动都必须留下可追溯的回声。'],
      endingAnchor: bond === 'rivals' ? '两位主角必须决定竞争是否值得牺牲共同的未来。' : '两位主角必须决定要把共同的未来交给哪一种规则。',
      outline: [
        '两条世界线在合流点相撞，双主角同时收到信号。',
        '他们决定暂时同行，第一条共同规则浮现。',
        '新的敌人从旧世界的缝隙里出现。',
        '规则冲突逼迫双主角选择翻译或分离。',
        '合流点坍缩，他们为未来保留一条路。',
        '两个世界找到共同呼吸，新的故事开始。',
      ],
    },
    chapterIndex: 0,
    chapters: [],
    choices: {},
    revision: 0,
    kind: 'merged',
    sourceIds: [a.id, b.id],
    author: '我',
    createdAt: timestamp,
    updatedAt: timestamp,
    bookmarked: false,
  }
  return story
}

// This only removes known literal values. A model may infer or paraphrase
// personal facts, so an AI share still needs a human review of every chapter.
const snapshotRedactor = (sourceConfig, safeConfig) => {
  const replacements = new Map()
  const add = (value, alias) => {
    if (typeof value !== 'string' || !value.trim()) return
    if (!replacements.has(value)) replacements.set(value, alias)
    const trimmed = value.trim()
    if (!replacements.has(trimmed)) replacements.set(trimmed, alias)
  }
  const visit = (source, target, field = '') => {
    if (typeof source === 'string') {
      if (field === 'genreId' || field === 'sourceGenres') return
      const aliases = {
        hometown: '某地', school: '某所学校', company: '某个组织', role: '某种职业',
        friend: '一位故人', destination: '某处目的地', protagonist: target?.name || safeConfig.name,
      }
      add(source, typeof target === 'string' && target ? target : aliases[field] || '已隐去的设定')
      return
    }
    if (Array.isArray(source)) {
      source.forEach((item, index) => visit(item, target?.[index], field))
      return
    }
    if (!source || typeof source !== 'object') return
    for (const [key, value] of Object.entries(source)) {
      // World genres and the three merge enums are public controlled values.
      if (key === 'genreId' || key === 'sourceGenres' || key === 'merge') continue
      visit(value, target?.[key], key)
    }
  }
  visit(sourceConfig, safeConfig)
  const keys = [...replacements.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b))
  const escaped = keys.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = escaped.length ? new RegExp(escaped.join('|'), 'g') : null
  // One pass prevents an inserted alias from being interpreted as another
  // source value. Longest matches win when a person's name prefixes another.
  return value => typeof value === 'string' && pattern
    ? value.replace(pattern, match => replacements.get(match))
    : typeof value === 'string' ? value : ''
}

const snapshotChoice = (story, safe, index, redact) => {
  const expected = choiceAt(safe, index)
  if (!expected) return null
  const supplied = story.chapters[index]?.choice
  return {
    prompt: typeof supplied?.prompt === 'string' ? redact(supplied.prompt) : expected.prompt,
    options: expected.options.map(fallback => {
      const option = supplied?.options?.find(item => item?.id === fallback.id)
      return {
        id: fallback.id,
        label: typeof option?.label === 'string' ? redact(option.label) : fallback.label,
        detail: typeof option?.detail === 'string' ? redact(option.detail) : fallback.detail,
        consequence: typeof option?.consequence === 'string' ? redact(option.consequence) : fallback.consequence,
      }
    }),
  }
}

export function publicSnapshot(story) {
  validateStory(story)
  const sourceGenre = genreFor(story.genreId || story.config.genreId)
  // Backups can carry arbitrary extra fields. Build the public object from an
  // explicit schema instead of copying hidden prompts, model responses or PII.
  const safe = {
    id: `public-${hash(story.id)}`,
    genreId: sourceGenre.id,
    kind: story.kind === 'merged' ? 'merged' : 'solo',
    sourceIds: [],
    revision: Number.isInteger(story.revision) && story.revision >= 0 ? story.revision : 0,
    chapterIndex: Math.min(story.chapters.length, LAST_INDEX),
    chapters: [],
    choices: {},
    author: '我 · 本地分享',
    bookmarked: false,
    readOnly: true,
    readerIndex: 0,
    status: story.chapters.length >= MAX_CHAPTERS ? 'complete' : 'ongoing',
  }
  if (story.engine === 'gemini') safe.engine = 'gemini'
  if (story.kind === 'merged') {
    safe.config = {
      ...redactedSnapshotConfig(story.config, '旅者甲 × 旅者乙'),
      name: '旅者甲 × 旅者乙',
      protagonists: [
        { name: '旅者甲', trait: '匿名探索者', origin: '未知世界', ability: '未命名火种', genreId: genreFor(story.config.protagonists?.[0]?.genreId || sourceGenre.id).id },
        { name: '旅者乙', trait: '匿名探索者', origin: '未知世界', ability: '未命名火种', genreId: genreFor(story.config.protagonists?.[1]?.genreId || sourceGenre.id).id },
      ],
      destination: '',
      merge: {
        rules: story.config.merge?.rules === 'separate' ? 'separate' : 'bridge',
        lead: story.config.merge?.lead === 'b' ? 'b' : 'a',
        bond: story.config.merge?.bond === 'rivals' ? 'rivals' : 'allies',
      },
      sourceGenres: [0, 1].map(index => genreFor(story.config.protagonists?.[index]?.genreId || sourceGenre.id).id),
    }
    safe.title = '合流：两条匿名世界线'
    safe.worldBible = {
      premise: '两条匿名世界线在一处新的合流点相遇，两位旅者共同定义边界。',
      rules: story.config.merge?.rules === 'separate'
        ? ['两种世界规则保持各自边界，只在合流点短暂交叠。', '双主角可以同行，但不能替对方决定原世界的命运。', '跨界行动必须留下可追溯的回声。']
        : ['两种世界规则可以互相翻译，但每次翻译都会消耗稳定度。', '双主角共享合流点的选择。', '新规则必须被两位旅者共同见证。'],
      endingAnchor: '两位匿名旅者为未来保留一条可以继续选择的路。',
      outline: ['两条匿名世界线相撞。', '旅者暂时同行。', '共同规则浮现。', '规则冲突升级。', '合流点坍缩。', '新的宇宙开始呼吸。'],
    }
  } else {
    safe.config = redactedSnapshotConfig(story.config, '匿名旅者')
    safe.title = `${sourceGenre.title} · 匿名旅者`
    safe.worldBible = worldBibleFor(sourceGenre, safe.config)
  }
  for (const [index, chapter] of story.chapters.entries()) {
    if (chapter?.index !== index || index >= MAX_CHAPTERS) throw new TypeError('cannot share non-sequential chapters')
    const selected = validChoiceAt(story, index)
    if (selected) safe.choices[index] = selected
  }
  if (story.engine === 'gemini') {
    const redact = snapshotRedactor(story.config, safe.config)
    safe.title = redact(story.title) || safe.title
    safe.chapters = story.chapters.map((chapter, index) => ({
      id: `${safe.id}:chapter:${index}:r${safe.revision}`,
      index,
      title: redact(chapter.title),
      paragraphs: chapter.paragraphs.map(redact),
      summary: redact(chapter.summary),
      choice: snapshotChoice(story, safe, index, redact),
    }))
  } else {
    safe.chapters = story.chapters.map(chapter => buildChapter(safe, chapter.index))
  }
  return safe
}

const advanceDemo = (story, count, branchIds = {}) => {
  let current = story
  for (let index = 0; index < count; index += 1) {
    const chapter = buildChapter(current, index)
    const accepted = acceptChapter(current, chapter, chapterKey(current, index))
    if (accepted === current) throw new Error(`could not materialize demo chapter ${index}`)
    current = accepted
    if (chapter.choice && index < count - 1) {
      current = chooseBranch(current, index, branchIds[index] || chapter.choice.options[0].id)
    }
  }
  return current
}

const withDemoMeta = (story, meta) => {
  const next = { ...story, ...meta, isDemo: true }
  // Demo IDs are stable, so their chapter IDs must be rebased with them. This
  // keeps the fixture usable by the same accept/key protocol as a new story.
  if (meta.id && meta.id !== story.id) {
    next.chapters = story.chapters.map((chapter) => ({
      ...chapter,
      id: `${meta.id}:chapter:${chapter.index}:r${story.revision}`,
    }))
  }
  return next
}

const demoMist = withDemoMeta(advanceDemo(createStory({
  genreId: 'mist', name: '遥', trait: '冷静观察者', origin: '无名漂泊者', ability: '听见潮汐', tone: '诗性冒险', immersive: false, destination: '白潮港',
}), 3, { 1: 'open' }), { id: 'demo-mist', title: '白潮港的第七次钟声', status: 'ongoing', author: '阿遥' })

const demoNeon = withDemoMeta(advanceDemo(createStory({
  genreId: 'neon', name: 'Echo', trait: '危险好奇心', origin: '失忆的继承人', ability: '读取备份', tone: '悬疑推进', immersive: false, destination: '下城回收站',
}), 6, { 1: 'wait', 3: 'cross' }), { id: 'demo-neon', title: '雨幕里的备用人格', status: 'complete', author: 'Echo-404' })

export const FRIEND_BOOK = withDemoMeta(advanceDemo(createStory({
  genreId: 'cultivation', name: '烬野', trait: '嘴硬心软', origin: '被放逐的学徒', ability: '借火一瞬', tone: '群像治愈', immersive: false, destination: '后山灵田',
}), 3, { 1: 'open' }), { id: 'demo-friend-cultivation', title: '火种越过九重天', status: 'ongoing', author: '烬野' })

const demoMerged = withDemoMeta(createMergedStory(demoMist, FRIEND_BOOK, { rules: 'bridge', lead: 'a', bond: 'allies' }), {
  id: 'demo-merged',
  title: '潮汐与火种：无昼之境',
  status: 'complete',
  author: '阿遥 × 烬野',
})

// These are local, read-only fixtures for the bookstore UI. They intentionally
// contain no popularity counters: a real service should supply those from data.
export const COMMUNITY_BOOKS = [demoMist, demoNeon, advanceDemo(demoMerged, 6, { 1: 'join', 3: 'bridge' })]
COMMUNITY_BOOKS[2] = withDemoMeta(COMMUNITY_BOOKS[2], { id: 'demo-merged', title: '潮汐与火种：无昼之境', status: 'complete', author: '阿遥 × 烬野' })
