import test from 'node:test'
import assert from 'node:assert/strict'
import { BLURB_ANCHORS, createGeminiGenerator, SYSTEM_PROMPT } from '../server/gemini.js'
import { createStory, introViolationFor } from '../src/story-engine.js'
import { acceptGeneratedChapter } from '../src/generation.js'
import { worldIntroViolationFor } from '../src/plaza.js'

/*
 * REQ-65 （简介语气改造）: the public words stop sounding like a
 * publisher's book report and start sounding like a platform 爽文
 * blurb — a 爽点预订单. The bans gain the officialese register
 * （讲述了 / 命运的齿轮 / 通过…展现了 and kin, research report §5 +
 * §6.1 rule 14) inside the SAME single checker REQ-56 built; the
 * opening schema and SYSTEM_PROMPT carry the platform skeleton;
 * three original anchor blurbs ride the opening context only.
 */

const env = { GEMINI_API_KEY: 'test' }

const prose = () => ({
  title: '潮汐尽头的来信',
  paragraphs: [
    '阿遥站在白潮港的岸边，潮水沿着石阶慢慢升起，远处的钟声比往常多响了一次。',
    '她听见那一声回响来自自己的口袋，伸手触碰时，掌心留下了从未见过的银色潮痕。',
    '港口的旧灯忽然亮了，守灯人没有解释那封信的来历，只指向雾里仍然敞开的门。',
  ],
  summary: '阿遥在白潮港听见异常钟声，发现银色潮痕与一封无主来信，守灯人指向雾中的门。',
})

const bible = () => ({
  premise: '潮汐记得每个人遗失的名字，白潮港的人必须在日落之前找回自己真正的来处。',
  rules: ['每次聆听潮汐都会失去一段微小记忆。', '世界的边界只向承认代价的人开启。', '已经发生的选择会在钟塔中留下回声。'],
  endingAnchor: '阿遥需要决定如何保留城市的记忆，并在本卷终局为后来者留下可以继续选择的道路。',
  outline: Array.from({ length: 6 }, (_, index) => `第${index + 1}章推进世界的秘密，同时保留人物关系和已做出的选择。`),
})

const PLATFORM_SYNOPSIS = '阿遥在白潮港守了 3 年夜，潮汐钟每乱响一次，镇上人的记忆就少一截，只有她手写的日志不会被改。那封没有署名的信漂到灯塔下时，镇长逼她交出日志，说她偷了全镇的记忆。她当众翻开日志，一页一页念出被钟抹掉的名字——守灯人当场跪下，喊出了 10 年前那个名字。信是谁寄的？她还没查清，自己的过去又淡了一分。'
const PLATFORM_INTRO = {
  background: '白潮港的潮汐钟管着全镇的记忆，钟一乱响，就有人忘掉一段过去。阿遥住在灯塔下的守夜屋，是全镇唯一还坚持手写日志的人，也是最先被怀疑的那一个。',
  rules: [
    '潮汐钟每乱响一次，全镇人的记忆就被改写一小段，只有手写的字不会变。',
    '雾里漂来的信没有寄信人，收信的人必须在天亮之前回信，否则就会忘记自己是谁。',
  ],
  thread: '阿遥守着灯塔和日志，本来只想把雾季熬过去。那封无主来信把她推到了所有人前面：镇长要她交出日志，守灯人却说信是她自己 10 年前寄的。她得一边查信的来历，一边守住自己正在变淡的过去——查得越深，忘得越多。',
}

const openingOutput = (synopsis = PLATFORM_SYNOPSIS) => ({
  ...prose(),
  worldBible: bible(),
  synopsis,
  intro: PLATFORM_INTRO,
})

const response = (value) => new Response(
  JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }),
  { status: 200 },
)

const capturing = (capture, responder) => createGeminiGenerator({
  env,
  sleep: async () => {},
  fetchImpl: async (_url, options) => {
    capture.body = JSON.parse(options.body)
    capture.input = capture.body.contents[0].parts[0].text
    capture.system = capture.body.systemInstruction.parts[0].text
    return responder(capture)
  },
})

// --- the officialese bans -------------------------------------------------

test('officialese fixed terms are refused by the shared checker', () => {
  const samples = [
    '本书讲述了主人公沈砚从杂役一步步登顶的故事。',
    '他踏上旅程，去寻找失落多年的宝藏。',
    '沈砚踏上了旅程，迎接他的将是无尽的试炼。',
    '命运的齿轮开始转动，沈砚的人生就此改变。',
    '作品以细腻的笔触，描绘了小镇众人的日常。',
    '这个故事引发思考，让人读完回味无穷。',
    '他最终实现了自我价值，站上了人生巅峰。',
    '历经千难万险，她终于找到了人生意义。',
    '这是一个关于勇气与坚持的故事，感动了无数读者。',
    '前路充满挑战与成长，他一步也没有退。',
    '通过一次次战斗，展现了人性的光辉。',
    '故事歌颂了时代的变迁与小人物的奋斗。',
    '两人携手归隐，从此过上幸福生活。',
  ]
  for (const sample of samples) {
    assert.ok(introViolationFor(sample), `should refuse: ${sample}`)
    assert.ok(worldIntroViolationFor(sample), `plaza checker should refuse: ${sample}`)
  }
})

test('officialese pattern frames are refused even without a listed word', () => {
  // 通过…展现了 (no 人性的光辉 here — the frame itself is the ban)
  assert.ok(introViolationFor('通过三年的苦修，他展现了惊人的毅力，最终夺回属于自己的一切。'))
  // 在这个…的世界里
  assert.ok(introViolationFor('在这个灵气复苏的世界里，沈砚只是一个没人看得起的杂役。'))
  // 这是一个关于…的故事 with a theme word outside the fixed list
  assert.ok(introViolationFor('这是一个关于复仇与救赎的故事，结局出人意料。'))
})

test('platform-voice copy passes the checker — anchors included', () => {
  for (const anchor of BLURB_ANCHORS) {
    assert.equal(introViolationFor(anchor.text), null, `anchor ${anchor.family} must be clean`)
  }
  assert.equal(introViolationFor(PLATFORM_SYNOPSIS), null)
  for (const part of [PLATFORM_INTRO.background, PLATFORM_INTRO.thread, ...PLATFORM_INTRO.rules]) {
    assert.equal(introViolationFor(part), null, part)
  }
  // The REQ-56 accepted sample keeps passing under the merged bans.
  assert.equal(introViolationFor('阿遥是白潮港的守夜人，靠一本手写日志过日子。最近潮汐钟开始乱响，镇上人的记忆每天少一截，她的日志里还多出了一封没有署名的信。她要在雾季结束前查清信的来历，代价是每找回一段别人的记忆，她自己的过去就淡一分。'), null)
})

test('the checker does not misfire on plain speech near the patterns', () => {
  // 展现了 without the 通过… frame is ordinary copy, not officialese.
  assert.equal(introViolationFor('他在众人面前展现了过人的胆识，一句话堵得管事哑口无言。'), null)
  // 在这个世界里 without the 的…里 frame.
  assert.equal(introViolationFor('沈砚在这个世界里排不上号，连外门弟子都敢踩他一脚。'), null)
  // 命运 alone is fine — only the 齿轮 cliché is banned.
  assert.equal(introViolationFor('他不信命，偏要把自己的命运攥回手里。'), null)
})

// --- schema + prompt carry the new skeleton -------------------------------

test('the opening schema describes the platform skeleton and the 80–200 band', async () => {
  const schemas = []
  const generator = createGeminiGenerator({
    env,
    sleep: async () => {},
    fetchImpl: async (_url, options) => {
      schemas.push(JSON.parse(options.body).generationConfig.responseJsonSchema)
      return response(openingOutput())
    },
  })
  await generator.generate({ story: { ...createStory({ name: '阿遥' }), engine: 'gemini' }, index: 0 })
  const synopsisDesc = schemas[0].properties.synopsis.description
  assert.match(synopsisDesc, /80–200/)
  assert.match(synopsisDesc, /第一句/)
  assert.match(synopsisDesc, /金手指/)
  assert.match(synopsisDesc, /阿拉伯数字/)
  assert.match(synopsisDesc, /预演/)
  assert.match(synopsisDesc, /宣言立誓/)
  assert.match(schemas[0].properties.intro.properties.background.description, /一句/)
  assert.match(schemas[0].properties.intro.properties.thread.description, /爽点/)
})

test('SYSTEM_PROMPT carries the blurb voice rules beside the REQ-56 bans', () => {
  assert.match(SYSTEM_PROMPT, /爽点预订单/)
  assert.match(SYSTEM_PROMPT, /最低谷/)
  assert.match(SYSTEM_PROMPT, /前三分之一/)
  assert.match(SYSTEM_PROMPT, /宣言立誓、反问挑衅、没说完的悬念/)
  assert.match(SYSTEM_PROMPT, /重生复仇=/)
  assert.match(SYSTEM_PROMPT, /赘婿归来=/)
  assert.match(SYSTEM_PROMPT, /都市对话片段=/)
  assert.match(SYSTEM_PROMPT, /blurbAnchors/)
  // The REQ-56 hard bans stand untouched.
  assert.match(SYSTEM_PROMPT, /禁止把首尾章的章节名串成主线/)
  assert.match(SYSTEM_PROMPT, /禁止播报章节数/)
  assert.match(SYSTEM_PROMPT, /讲述了/)
})

// --- anchors ride the opening context only --------------------------------

test('blurb anchors ride the opening call and no later call', async () => {
  const capture = {}
  let calls = 0
  const generator = capturing(capture, () => {
    calls += 1
    return response(calls === 1 ? openingOutput() : prose())
  })
  const story = { ...createStory({ name: '阿遥' }), engine: 'gemini' }
  const first = await generator.generate({ story, index: 0 })
  const openingContext = JSON.parse(capture.input)
  assert.equal(openingContext.blurbAnchors.items.length, 3)
  assert.deepEqual(openingContext.blurbAnchors.items.map((item) => item.family), ['重生复仇', '系统神豪', '玄幻无敌'])
  assert.match(openingContext.blurbAnchors.declaration, /不许挪用/)
  await generator.generate({ story: acceptGeneratedChapter(story, first), index: 1 })
  const laterContext = JSON.parse(capture.input)
  assert.equal(laterContext.blurbAnchors, undefined, 'later chapters never pay for the blurb block')
})

// --- enforcement: officialese drafts heal on the re-ask --------------------

test('an officialese synopsis is refused retryable and heals on the re-ask', async () => {
  let calls = 0
  const generator = createGeminiGenerator({
    env,
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1
      if (calls === 1) {
        return response(openingOutput('本书讲述了阿遥在白潮港守夜的故事，通过一封封来信展现了小镇的时代变迁，她踏上旅程，最终实现了自我价值。'))
      }
      return response(openingOutput())
    },
  })
  const result = await generator.generate({ story: { ...createStory({ name: '阿遥' }), engine: 'gemini' }, index: 0 })
  assert.equal(calls, 2, 'the officialese draft was re-asked inside the same request')
  assert.equal(result.synopsis, PLATFORM_SYNOPSIS)
})
