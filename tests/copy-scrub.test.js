// REQ-52 (user order 2026-10-30): no user-visible copy may name the
// underlying AI, model or vendor — no Gemini / Vertex / GPT / Claude /
// LLM / AI / 大模型 / 提示词 / 模型 / token-as-billing. Everything the
// reader sees speaks the platform's own language （塑造 / 创世 / 落笔 /
// 世界线正忙 / 额度）. This guard scans the copy-bearing surfaces so a
// future string that reintroduces a banned term fails the suite.
//
// Scope (what a reader can actually see):
//   - src/** client code (comments stripped line-wise; strings and JSX
//     text are scanned, lowercase technical identifiers like the
//     persisted engine id 'gemini' are not copy and never match the
//     capitalised vendor patterns)
//   - index.html, public/sw.js, public/manifest.webmanifest
//   - server/** response copy: every non-comment line of the service
//     modules; for server/gemini.js only ApiError / retryableError
//     message lines (the rest of that module is prompt text and
//     provider plumbing — internal by design)
// Out of scope, deliberately: prompt bodies sent to the model, code
// comments, internal logs, docs/, knowledge/ (generation-side style
// material), and public/design-catalog.html (an internal review page
// where "token" means CSS design variables, not billing).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ID = String.raw`(?<![\w$.])`
const END = String.raw`(?![\w$])`
const BANNED = [
  ['Gemini', new RegExp(`${ID}Gemini${END}`)],
  ['Vertex', new RegExp(`${ID}Vertex${END}`)],
  ['GPT', new RegExp(`${ID}GPT${END}`)],
  ['Claude', new RegExp(`${ID}Claude${END}`)],
  ['LLM', new RegExp(`${ID}LLM${END}`)],
  ['AI', new RegExp(`${ID}AI${END}`)],
  ['大模型', /大模型/],
  ['提示词', /提示词/],
  ['模型', /模型/],
  ['token（计费口径）', new RegExp(`[\\u4e00-\\u9fff][^\\n'"\`]{0,40}${ID}[Tt]oken${END}|${ID}[Tt]oken${END}[^\\n'"\`]{0,40}[\\u4e00-\\u9fff]`)],
  ['prompt（计费/技术口径）', new RegExp(`[\\u4e00-\\u9fff][^\\n'"\`]{0,40}${ID}prompt${END}|${ID}prompt${END}[^\\n'"\`]{0,40}[\\u4e00-\\u9fff]`, 'i')],
]

// Lines a reader could never see as comment text are skipped: pure //
// lines, JSDoc/block lines starting with *, and block-comment spans.
function* visibleLines(text) {
  let inBlock = false
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false
      continue
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      if (trimmed.startsWith('/*') && !trimmed.includes('*/')) inBlock = true
      continue
    }
    yield [i + 1, line]
    if (line.includes('/*') && !line.includes('*/')) inBlock = true
  }
}

function* walk(dir, exts) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* walk(path, exts)
    else if (exts.some((ext) => name.endsWith(ext))) yield path
  }
}

// Explicit whitelist: [relative file, regex the offending line must
// match]. Anything not listed here that trips a pattern is a failure.
// - src/plaza.js: WORLD_INTRO_ENGINE_TERMS is the filter list of engine
//   terms scrubbed OUT of published world intros; '提示词' appears as a
//   term to remove, never as copy shown to a reader.
// - src/story-engine.js: INTRO_ENGINE_TERMS (REQ-56) is the same kind of
//   filter list — the single source the plaza composer imports; its
//   terms are objects to strip from generated intros, never copy.
const WHITELIST = [
  ['src/plaza.js', /WORLD_INTRO_ENGINE_TERMS/],
  ['src/story-engine.js', /'资产与负债', '因果账目', '制约', '稳定度', '数值', '参数', '提示词'/],
]

function scanText(rel, text, { onlyErrorLines = false } = {}) {
  const hits = []
  for (const [lineNo, line] of visibleLines(text)) {
    if (onlyErrorLines && !/(ApiError|retryableError)\(/.test(line)) continue
    for (const [name, re] of BANNED) {
      if (!re.test(line)) continue
      if (WHITELIST.some(([file, w]) => file === rel && w.test(line))) continue
      hits.push(`${rel}:${lineNo} [${name}] ${line.trim().slice(0, 120)}`)
    }
  }
  return hits
}

function scanSurfaces() {
  const hits = []
  for (const file of walk(join(ROOT, 'src'), ['.js', '.jsx'])) {
    const rel = file.slice(ROOT.length + 1)
    hits.push(...scanText(rel, readFileSync(file, 'utf8')))
  }
  for (const rel of ['index.html', 'public/sw.js', 'public/manifest.webmanifest']) {
    hits.push(...scanText(rel, readFileSync(join(ROOT, rel), 'utf8')))
  }
  for (const file of walk(join(ROOT, 'server'), ['.js'])) {
    const rel = file.slice(ROOT.length + 1)
    hits.push(...scanText(rel, readFileSync(file, 'utf8'), { onlyErrorLines: rel === 'server/gemini.js' }))
  }
  return hits
}

test('REQ-52: user-visible copy contains no AI/model/vendor terms', () => {
  const hits = scanSurfaces()
  assert.deepEqual(hits, [], `banned terms in user-visible copy:\n${hits.join('\n')}`)
})

test('REQ-52 guard: known-bad copy samples are caught', () => {
  const bad = [
    '<button>Gemini 创作</button>',
    '"设定与剧情会发送给 Gemini。请使用昵称或虚构资料。"',
    '<small>不用 AI——书名、简介都由你亲手写。</small>',
    '<span>累计总 token</span>',
    '"生成按 token 计量，汇总在你的账号里。"',
    "throw new ApiError(503, 'Vertex AI 暂时不可用，请检查项目、模型与服务账号权限。')",
    "throw retryableError(429, 'Gemini 当前请求较多或额度不足，请稍后重试。')",
    '<p>选择在线塑造时，设定会发送给模型服务。</p>',
  ]
  for (const line of bad) {
    const hits = scanText('sample.js', line)
    assert.ok(hits.length > 0, `guard missed: ${line}`)
  }
  // Server error copy is scanned through the error-line path as well.
  const errHits = scanText('server/gemini.js', "throw new ApiError(503, 'Gemini 暂时不可用，请检查服务端模型与密钥配置。')", { onlyErrorLines: true })
  assert.ok(errHits.length > 0)
})

test('REQ-52 guard: internal identifiers and comments are not copy', () => {
  const internal = [
    "if (story.engine === 'gemini') return true",
    "export const COVER_IMAGE_MODEL = 'gemini-2.5-flash-image'",
    'const token = await getAccessToken()',
    '<div><span>输入</span><b>{formatTokenCount(usage.prompt)}</b></div>',
    "import { createGeminiGenerator } from './gemini.js'",
    ' * same image model the covers use (gemini-2.5-flash-image on the Vertex',
    '// personal facts, so an AI share still needs a human review.',
  ]
  for (const line of internal) {
    assert.deepEqual(scanText('sample.js', line), [], `guard false-positive: ${line}`)
  }
})
