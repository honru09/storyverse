import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./reader-flow.css";
import AnimatedContent from "./components/react-bits/AnimatedContent.jsx";
import WorldAtmosphere from "./motion/WorldAtmosphere.jsx";
import {
  MotionProvider,
  MotionToggle,
  useMotionPolicy,
} from "./motion/MotionProvider.jsx";
import {
  scrollToTop,
  useSceneMotion,
  useSmoothScroll,
} from "./motion/useSceneMotion.js";
import {
  CHAPTER_COUNT,
  lastAccessibleIndex,
  materialize,
  moveReadingPosition,
  prepareReadingWindow,
  readerIndexFor,
  selectedChoice,
} from "./reading-flow.js";
import {
  COMMUNITY_BOOKS,
  DEFAULT_DRAFT,
  FRIEND_BOOK,
  GENRES,
  buildChapter,
  chapterForReading,
  chooseBranch,
  createMergedStory,
  createStory,
  publicSnapshot,
} from "./story-engine";
import {
  emptyLibrary,
  loadLibrary,
  migrateLegacy,
  saveLibrary,
  upsertStory,
} from "./persistence";

const Icon = ({ name, size = 18, stroke = 2.2, className = "" }) => {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
    "aria-hidden": "true",
  };
  const paths = {
    compass: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z" />
      </>
    ),
    book: (
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" />
        <path d="M4 5.5v16M8 7h8M8 11h6" />
      </>
    ),
    spark: (
      <>
        <path d="m12 2 1.3 5.7L19 9l-5.7 1.3L12 16l-1.3-5.7L5 9l5.7-1.3L12 2Z" />
        <path d="m19 15 .6 2.4L22 18l-2.4.6L19 21l-.6-2.4L16 18l2.4-.6L19 15Z" />
      </>
    ),
    git: (
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="18" cy="5" r="2" />
        <circle cx="12" cy="19" r="2" />
        <path d="M6 7v3c0 2 3 3 5 3h1c2 0 3 2 3 4v0" />
        <path d="M18 7v2c0 1.5-.8 2.4-2 2.8" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h13" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    eye: (
      <>
        <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" />
        <circle cx="12" cy="12" r="2.2" />
      </>
    ),
    bookmark: (
      <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.5L6 21V4.5Z" />
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M2.5 20c.7-3.4 2.8-5 6.5-5s5.8 1.6 6.5 5" />
        <path d="M16 5.5a3 3 0 0 1 0 5.8M17 15c2.7.4 4.2 2 4.7 4.5" />
      </>
    ),
    sliders: (
      <>
        <path d="M4 6h6M14 6h6M4 12h9M17 12h3M4 18h3M11 18h9" />
        <circle cx="12" cy="6" r="2" />
        <circle cx="15" cy="12" r="2" />
        <circle cx="9" cy="18" r="2" />
      </>
    ),
    bell: (
      <>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    wand: (
      <>
        <path d="m15 4 5 5M4 20 17 7M7 4l.5 2.5L10 7l-2.5.5L7 10l-.5-2.5L4 7l2.5-.5L7 4Z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    x: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),
    send: (
      <>
        <path d="m21 3-7.3 18-3.7-7-7-3.7L21 3Z" />
        <path d="M10 14 21 3" />
      </>
    ),
    dots: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 11a8 8 0 1 0 1 4" />
        <path d="M20 5v6h-6" />
      </>
    ),
  };
  return <svg {...common}>{paths[name] || paths.spark}</svg>;
};

const abilities = [
  {
    id: "tide",
    name: "听见潮汐",
    desc: "从水与回声里读取被隐藏的记忆",
    icon: "◒",
  },
  {
    id: "thread",
    name: "缝合裂隙",
    desc: "把两个不相容的事物短暂地连在一起",
    icon: "⌁",
  },
  {
    id: "ember",
    name: "借火一瞬",
    desc: "让即将熄灭的事物再燃一次",
    icon: "✦",
  },
  {
    id: "echo",
    name: "读取备份",
    desc: "从残留的声音里找回被删除的真相",
    icon: "◌",
  },
];
const traits = ["冷静观察者", "温柔理想派", "危险好奇心", "嘴硬心软"];
const origins = ["旧贵族旁支", "无名漂泊者", "失忆的继承人", "被放逐的学徒"];
const tones = [
  { id: "poetic", name: "诗性冒险", desc: "慢一点，风会把伏笔吹到你手里" },
  { id: "tense", name: "悬疑推进", desc: "每一次呼吸都离真相更近" },
  { id: "warm", name: "群像治愈", desc: "让角色在世界缝隙里彼此照亮" },
];
const genreById = Object.fromEntries(GENRES.map((genre) => [genre.id, genre]));

const toWorld = (genre) => ({
  ...genre,
  id: genre.id,
  name: genre.world,
  subtitle: genre.tagline,
  label: `${genre.label} · 世界线`,
});
const worlds = GENRES.map(toWorld);

function seedStory(story) {
  return { ...prepareReadingWindow(story, 0), readerIndex: 0 };
}

function genreOf(story) {
  return genreById[story?.genreId || story?.config?.genreId] || GENRES[0];
}

function displayName(story, fallback = "未命名旅人") {
  return story?.config?.name?.trim() || fallback;
}

function Button({
  children,
  variant = "primary",
  icon,
  onClick,
  className = "",
  type = "button",
  disabled = false,
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`button button-${variant} ${className}`}
      onClick={onClick}
    >
      {children}
      {icon && <Icon name={icon} size={16} />}
    </button>
  );
}

function Brand({ onClick }) {
  return (
    <button className="brand-mark" onClick={onClick} aria-label="回到我的世界">
      <span className="brand-glyph">
        <span />
      </span>
      <span className="brand-copy">
        <strong>织界</strong>
      </span>
    </button>
  );
}

function Sidebar({ view, onNavigate }) {
  const items = [
    { id: "home", label: "我的世界", icon: "compass" },
    { id: "forge", label: "造世", icon: "plus" },
    { id: "store", label: "书城", icon: "book" },
    { id: "merge", label: "世界合流", icon: "git" },
  ];
  return (
    <aside className="sidebar">
      <Brand onClick={() => onNavigate("home")} />
      <div className="sidebar-rule" />
      <nav className="side-nav" aria-label="主导航">
        {items.map((item) => {
          const active =
            view === item.id || (view === "reader" && item.id === "home");
          return (
            <button
              key={item.id}
              className={`side-nav-item ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <Icon name={item.icon} size={21} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function Topbar({ onNavigate }) {
  return (
    <header className="topbar">
      <Brand onClick={() => onNavigate("home")} />
      <div className="topbar-actions">
        <span className="local-badge">
          <i />
          体验版
        </span>
        <MotionToggle />
      </div>
    </header>
  );
}

function MobileBottomNav({ view, onNavigate }) {
  if (view === "reader") return null;
  const items = [
    { id: "home", label: "世界", icon: "compass" },
    { id: "forge", label: "造世", icon: "plus" },
    { id: "store", label: "书城", icon: "book" },
    { id: "merge", label: "合流", icon: "git" },
  ];
  return (
    <nav className="mobile-bottom-nav" aria-label="移动端主导航">
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          className={view === item.id ? "active" : ""}
          aria-current={view === item.id ? "page" : undefined}
          onClick={() => onNavigate(item.id)}
        >
          <Icon name={item.icon} size={19} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Home({ onNavigate, onOpenStory, activeStory, stories }) {
  const genre = genreOf(activeStory);
  const currentChapter = activeStory
    ? Math.min(CHAPTER_COUNT, readerIndexFor(activeStory) + 1)
    : 1;
  const otherStories = stories.filter((story) => story.id !== activeStory?.id);

  return (
    <div className="page page-home page-enter">
      <section className={`home-hero ${activeStory ? "has-story" : "first-story"}`}>
        <div className="hero-copy">
          <h1>
            {activeStory ? (
              activeStory.title
            ) : (
              <>
                翻开一页，
                <br />
                <em>成为另一个你。</em>
              </>
            )}
          </h1>
          <p>
            {activeStory ? (
              <>
                {genre.label} · {activeStory.kind === "merged" ? "双主角" : displayName(activeStory)}
                <span className="resume-position">读到第 {currentChapter} 章</span>
              </>
            ) : (
              "选一个世界，在关键时刻决定故事。"
            )}
          </p>
          <div className="hero-actions">
            <Button
              icon="arrow"
              onClick={() =>
                activeStory ? onOpenStory(activeStory.id) : onNavigate("forge")
              }
            >
              {activeStory
                ? currentChapter === CHAPTER_COUNT
                  ? "回看终章"
                  : "继续阅读"
                : "开启第一本书"}
            </Button>
          </div>
        </div>
        <div className="hero-scene" aria-hidden="true">
          <WorldAtmosphere />
          <div className="hero-scene-art" aria-hidden="true">
            <span className="hero-door" />
          </div>
        </div>
      </section>

      {activeStory ? <section className="home-section home-lower">
        {otherStories.length > 0 ? <>
        <div className="section-heading">
          <h2>其他故事</h2>
            <button
              type="button"
              className="small-link"
              onClick={() => onNavigate("forge")}
            >
              新故事 <Icon name="plus" size={15} />
            </button>
        </div>
        <LibrarySwitcher
          stories={stories}
          activeStoryId={activeStory?.id}
          onOpenStory={onOpenStory}
        />
        </> : (
          <button className="new-story-row" onClick={() => onNavigate("forge")}>
            <Icon name="plus" size={19} /><span>开一本新书</span><Icon name="chevron" size={16} />
          </button>
        )}
      </section> : (
        <button
          type="button"
          className="first-story-browse small-link"
          onClick={() => onNavigate("store")}
        >
          先逛逛书城 <Icon name="chevron" size={16} />
        </button>
      )}
    </div>
  );
}

function LibrarySwitcher({ stories, activeStoryId, onOpenStory }) {
  const otherStories = stories.filter((story) => story.id !== activeStoryId);
  if (otherStories.length === 0) return null;

  return (
    <section className="sw-library-dock" aria-label="书架上的其他故事">
      <div className="sw-library-dock-grid">
        {otherStories.map((story) => {
          const genre = genreOf(story);
          const chapter = Math.min(CHAPTER_COUNT, readerIndexFor(story) + 1);
          return (
            <button
              type="button"
              key={story.id}
              className="sw-library-row"
              onClick={() => onOpenStory(story.id)}
            >
              <span
                className={`sw-library-sigil tone-${genre.color}`}
                aria-hidden="true"
              >
                {genre.symbol}
              </span>
              <span className="sw-library-copy">
                <b>{story.title}</b>
                <small>
                  {genre.label} · 读到第 {chapter} 章
                </small>
              </span>
              <Icon name="chevron" size={16} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Stepper({ step, setStep }) {
  const steps = [
    { id: 1, label: "世界" },
    { id: 2, label: "主角" },
    { id: 3, label: "能力" },
    { id: 4, label: "开局" },
  ];
  return (
    <nav className="stepper" aria-label="创作步骤">
      {steps.map((item) => (
          <button
            key={item.id}
            aria-label={`第 ${item.id} 步：${item.label}`}
            aria-current={step === item.id ? "step" : undefined}
            disabled={item.id >= step}
            className={`step ${step === item.id ? "current" : ""} ${step > item.id ? "done" : ""}`}
            onClick={() => step > item.id && setStep(item.id)}
          >
            {step > item.id && <Icon name="check" size={13} />}
            <span>{item.label}</span>
          </button>
      ))}
    </nav>
  );
}

function WorldCard({ world, selected, onSelect }) {
  return (
    <AnimatedContent className="world-card-wrap" distance={8}>
      <button
        type="button"
        className={`world-card world-${world.color} ${selected ? "selected" : ""}`}
        aria-pressed={selected}
        onClick={() => onSelect(world.id)}
      >
        <div className="world-card-visual" aria-hidden="true">
          <Icon name={{ mist: "compass", cultivation: "spark", neon: "sliders", city: "book" }[world.id]} size={28} />
        </div>
        <div className="world-card-copy">
          <h3>{world.label.split(" · ")[0]}</h3>
          <p>{world.name}</p>
        </div>
        {selected && (
          <span className="selected-mark">
            <Icon name="check" size={13} />
          </span>
        )}
      </button>
    </AnimatedContent>
  );
}

function PreviewPanel({ world, draft, ability, tone }) {
  const person = draft.name || "未命名的旅人";
  return (
    <aside className="preview-panel">
      <h3>当前设定</h3>
      <div className={`preview-cover world-${world.color}`}>
        <div>
          <strong>{world.name}</strong>
        </div>
      </div>
      <dl className="preview-facts">
        <div><dt>主角</dt><dd>{person}</dd></div>
        <div><dt>性格</dt><dd>{draft.trait}</dd></div>
        <div><dt>出身</dt><dd>{draft.origin}</dd></div>
        <div><dt>能力</dt><dd>{ability.name}</dd></div>
        <div><dt>风格</dt><dd>{tone.name}</dd></div>
      </dl>
    </aside>
  );
}

function Forge({ onGenerate, initialDraft, onDraftChange }) {
  const forgeRef = useRef(null);
  const [step, setStep] = useState(
    Math.min(4, Math.max(1, Number(initialDraft?.step) || 1)),
  );
  const [draft, setDraft] = useState({
    ...DEFAULT_DRAFT,
    ...(initialDraft || {}),
  });
  const [abilityId, setAbilityId] = useState(
    abilities.find((item) => item.id === initialDraft?.abilityId)?.id ||
      abilities.find((item) => item.name === initialDraft?.ability)?.id ||
      "tide",
  );
  const [toneId, setToneId] = useState(
    tones.find((item) => item.id === initialDraft?.toneId)?.id ||
      tones.find((item) => item.name === initialDraft?.tone)?.id ||
      "poetic",
  );
  const world = toWorld(genreById[draft.genreId] || GENRES[0]);
  const ability =
    abilities.find((item) => item.id === abilityId) || abilities[0];
  const tone = tones.find((item) => item.id === toneId) || tones[0];
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const next = () => setStep((value) => Math.min(4, value + 1));
  const back = () => setStep((value) => Math.max(1, value - 1));
  useSceneMotion(
    forgeRef,
    step,
    ".forge-section-heading h2",
  );
  useEffect(() => {
    onDraftChange?.({
      ...draft,
      ability: ability.name,
      tone: tone.name,
      abilityId,
      toneId,
      step,
    });
  }, [draft, ability.name, tone.name, abilityId, toneId, step, onDraftChange]);
  useEffect(() => {
    scrollToTop();
    forgeRef.current
      ?.querySelector(".forge-section-heading h2")
      ?.focus({ preventScroll: true });
  }, [step]);
  const submit = () =>
    onGenerate({
      ...draft,
      ability: ability.name,
      tone: tone.name,
      world,
      abilityOption: ability,
      toneOption: tone,
    });
  const previewText =
    draft.immersive && draft.hometown
      ? `来自${draft.hometown}的${draft.role || "旅人"}，会在${world.location}听见第一声回响。`
      : `${draft.name || "未命名旅人"}会在${world.location}收到一条无法解释的信号。`;
  return (
    <div ref={forgeRef} className="page page-forge page-enter">
      <div className="forge-heading">
        <h1>新故事</h1>
        <span className="step-count" aria-label={`第 ${step} 步，共 4 步`}>{step} / 4</span>
      </div>
      <Stepper step={step} setStep={setStep} />
      <div className="forge-layout">
        <main className="forge-main">
          {step === 1 && (
            <>
              <div className="forge-section-heading">
                <div>
                  <h2 tabIndex={-1}>想去哪个世界？</h2>
                </div>
              </div>
              <div className="world-grid">
                {worlds.map((item) => (
                  <WorldCard
                    key={item.id}
                    world={item}
                    selected={draft.genreId === item.id}
                    onSelect={(genreId) => set({ genreId })}
                  />
                ))}
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div className="forge-section-heading">
                <div>
                  <h2 tabIndex={-1}>你是怎样的主角？</h2>
                </div>
              </div>
              <div className="protagonist-form">
                <label className="field-label">
                  主角昵称（选填）
                  <input
                    value={draft.name}
                    onChange={(event) => set({ name: event.target.value })}
                    placeholder="取一个名字"
                  />
                </label>
                <div className="form-block">
                  <span className="field-label">性格</span>
                  <div className="chip-grid">
                    {traits.map((trait) => (
                      <button
                        type="button"
                        key={trait}
                        className={`choice-chip ${draft.trait === trait ? "active" : ""}`}
                        aria-pressed={draft.trait === trait}
                        onClick={() => set({ trait })}
                      >
                        {trait}
                        {draft.trait === trait && (
                          <Icon name="check" size={13} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-block">
                  <span className="field-label">出身</span>
                  <div className="origin-grid">
                    {origins.map((origin) => (
                      <button
                        type="button"
                        key={origin}
                        className={`origin-card ${draft.origin === origin ? "active" : ""}`}
                        aria-pressed={draft.origin === origin}
                        onClick={() => set({ origin })}
                      >
                        <span>{origin}</span>
                        {draft.origin === origin && (
                          <Icon name="check" size={14} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="life-import">
                  <div className="life-import-heading">
                    <div>
                      <b>带入人生经历</b>
                      <small>选填，让主角更像你</small>
                    </div>
                    <button
                      type="button"
                      className={`toggle ${draft.immersive ? "on" : ""}`}
                      onClick={() => set({ immersive: !draft.immersive })}
                      role="switch"
                      aria-checked={draft.immersive}
                      aria-label="带入人生经历（选填）"
                    >
                      <i />
                    </button>
                  </div>
                  {draft.immersive && (
                    <div className="life-fields">
                      <p className="field-hint">建议用昵称或虚构内容。仅存本机，分享时匿名化。</p>
                      <label className="field-label">
                        成长的地方（选填）
                        <input
                          value={draft.hometown || ""}
                          onChange={(event) =>
                            set({ hometown: event.target.value })
                          }
                          placeholder="例如：一座海边城市"
                        />
                      </label>
                      <label className="field-label">
                        学习的地方（选填）
                        <input
                          value={draft.school || ""}
                          onChange={(event) =>
                            set({ school: event.target.value })
                          }
                          placeholder="例如：一所沿海学校"
                        />
                      </label>
                      <label className="field-label">
                        做过的工作（选填）
                        <input
                          value={draft.role || ""}
                          onChange={(event) =>
                            set({ role: event.target.value })
                          }
                          placeholder="例如：档案员"
                        />
                      </label>
                      <label className="field-label">
                        工作过的地方（选填）
                        <input
                          value={draft.company || ""}
                          onChange={(event) =>
                            set({ company: event.target.value })
                          }
                          placeholder="例如：一间档案馆"
                        />
                      </label>
                      <label className="field-label">
                        重要的人（昵称，选填）
                        <input
                          value={draft.friend || ""}
                          onChange={(event) =>
                            set({ friend: event.target.value })
                          }
                          placeholder="写一个昵称或虚构名字"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <div className="forge-section-heading">
                <div>
                  <h2 tabIndex={-1}>想拥有什么能力？</h2>
                </div>
              </div>
              <div className="ability-list">
                {abilities.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`ability-card ${abilityId === item.id ? "active" : ""}`}
                    aria-pressed={abilityId === item.id}
                    onClick={() => setAbilityId(item.id)}
                  >
                    <span>
                      <b>{item.name}</b>
                      <small>{item.desc}</small>
                    </span>
                    <span className="ability-radio">
                      {abilityId === item.id && <i />}
                    </span>
                  </button>
                ))}
              </div>
              <div className="tone-block">
                <div className="forge-section-heading mini">
                  <div>
                    <h3>故事风格</h3>
                  </div>
                </div>
                <div className="tone-grid">
                  {tones.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`tone-card tone-${item.id} ${toneId === item.id ? "active" : ""}`}
                      aria-pressed={toneId === item.id}
                      onClick={() => setToneId(item.id)}
                    >
                      <b>{item.name}</b>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <div className="forge-section-heading">
                <div>
                  <h2 tabIndex={-1}>故事从这里开始。</h2>
                </div>
              </div>
              <div className="opening-preview">
                <h3>{world.name}</h3>
                <p>{previewText}</p>
                <div className="opening-details" aria-label="确认故事设定">
                  <button onClick={() => setStep(2)} aria-label="修改主角设定"><span>主角</span><b>{draft.name || "未命名旅人"}</b><Icon name="chevron" size={15} /></button>
                  <button onClick={() => setStep(3)} aria-label="修改能力与风格"><span>能力</span><b>{ability.name} · {tone.name}</b><Icon name="chevron" size={15} /></button>
                </div>
              </div>
              <p className="experience-note">预设剧情体验 · 设定与进度仅存本机</p>
            </>
          )}
          {
            <div className="forge-actions">
              {step > 1 && (
                <button className="back-button" onClick={back}>
                  <Icon name="chevron" size={15} className="rotate-180" />
                  上一步
                </button>
              )}
              <div className="forge-actions-right">
                {step < 4 ? (
                  <Button icon="arrow" onClick={next}>
                    继续
                  </Button>
                ) : (
                  <Button icon="arrow" onClick={submit}>
                    进入第一章
                  </Button>
                )}
              </div>
            </div>
          }
        </main>
        <PreviewPanel
          world={world}
          draft={draft}
          ability={ability}
          tone={tone}
        />
      </div>
    </div>
  );
}

function ShareSheet({ story, onClose, onPublish }) {
  const preview = useMemo(() => publicSnapshot(story), [story]);
  return (
    <ReadingDialog title="分享预览" onClose={onClose}>
      <p>
        匿名只读副本，仅保存在本机书城，不会上传。姓名与现实资料已移除。
      </p>
      <div className="sw-share-preview">
        <span className="sw-share-symbol">{genreOf(story).symbol}</span>
        <div>
          <b>{preview.title}</b>
          <small>
            {preview.chapters.length} 章 · 只读
          </small>
        </div>
        <Icon name="lock" size={15} />
      </div>
      <div className="reading-dialog-actions">
        <Button icon="arrow" onClick={() => onPublish(story)}>
          保存到本机书城
        </Button>
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
      </div>
    </ReadingDialog>
  );
}

function ReadingDialog({ title, children, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="reading-dialog"
      data-lenis-prevent
      aria-labelledby="reading-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <div className="reading-dialog-heading">
        <h2 id="reading-dialog-title">{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="关闭面板"
          autoFocus
        >
          <Icon name="x" size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function ChapterDirectory({ story, index, readOnly, onSelect, onClose }) {
  const last = lastAccessibleIndex(story, readOnly);
  return (
    <ReadingDialog title="章节目录" onClose={onClose}>
      <p>{story.title}</p>
      <div className="chapter-directory-list">
        {Array.from({ length: CHAPTER_COUNT }, (_, chapterIndex) => {
          const available = chapterIndex <= last;
          const chapter = story.chapters[chapterIndex];
          const status =
            index === chapterIndex
              ? "正在阅读"
              : !available
                ? readOnly
                  ? "尚未分享"
                  : "继续阅读后开启"
                : chapter.choice
                  ? "剧情选择"
                  : "";
          return (
            <button
              key={chapterIndex}
              disabled={!available}
              aria-current={index === chapterIndex ? "page" : undefined}
              onClick={() => onSelect(chapterIndex)}
            >
              <b>{String(chapterIndex + 1).padStart(2, "0")}</b>
              <span>
                <strong>{available ? chapter.title : "故事待续"}</strong>
                {status && <small>{status}</small>}
              </span>
              <Icon name={available ? "chevron" : "lock"} size={16} />
            </button>
          );
        })}
      </div>
    </ReadingDialog>
  );
}

function Reader({
  story,
  readOnly = false,
  onNavigate,
  onUpdateStory,
  onToggleBookmark,
  onPublish,
  openShare = false,
  onShareOpened,
}) {
  const [snapshotIndex, setSnapshotIndex] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [rewriteMode, setRewriteMode] = useState(false);
  const [pendingChoice, setPendingChoice] = useState(null);
  const [error, setError] = useState("");
  const titleRef = useRef(null);
  const readerRef = useRef(null);
  const index = readOnly
    ? readerIndexFor({ ...story, readerIndex: snapshotIndex }, true)
    : readerIndexFor(story);
  useSceneMotion(
    readerRef,
    `${story?.id}:${index}`,
    ".reader-article h1",
    { quiet: true },
  );

  useEffect(() => {
    setSnapshotIndex(0);
    setShareOpen(false);
    setDirectoryOpen(false);
    setRewriteMode(false);
    setPendingChoice(null);
    setError("");
  }, [story?.id, story?.revision, readOnly]);

  useEffect(() => {
    if (openShare && !readOnly) {
      setShareOpen(true);
      onShareOpened?.();
    }
  }, [openShare, readOnly, onShareOpened]);

  useEffect(() => {
    if (!story || readOnly) return;
    try {
      const prepared = prepareReadingWindow(story, index);
      if (prepared !== story)
        onUpdateStory?.({ ...prepared, readerIndex: index });
    } catch {
      setError("下一章暂时没能接上，你的阅读进度已经保留。可以再次尝试。");
    }
  }, [story, index, readOnly, onUpdateStory]);

  useEffect(() => {
    scrollToTop();
    titleRef.current?.focus({ preventScroll: true });
  }, [story?.id, index]);

  if (!story)
    return (
      <div className="page page-reader page-enter">
        <div className="sw-empty-page">
          <div className="sw-empty-icon">
            <Icon name="book" size={25} />
          </div>
          <h1>从第一本书开始。</h1>
          <Button icon="arrow" onClick={() => onNavigate("forge")}>
            开启第一本书
          </Button>
        </div>
      </div>
    );
  const chapter = chapterForReading(story, index) || buildChapter(story, index);
  const selected = selectedChoice(story, index);
  const selection = chapter.choice?.options.find(
    (option) => option.id === selected,
  );
  const ready = selected || !chapter.choice;
  const nextAvailable = index < lastAccessibleIndex(story, readOnly);
  const isFinal = index >= CHAPTER_COUNT - 1;
  const progress = `${Math.round(((index + 1) / CHAPTER_COUNT) * 100)}%`;
  const update = (nextStory, nextIndex = index) =>
    onUpdateStory?.(moveReadingPosition(nextStory, nextIndex));
  const applyChoice = (choiceId) => {
    if (readOnly) return;
    try {
      update(chooseBranch(story, index, choiceId));
      setRewriteMode(false);
      setPendingChoice(null);
      setError("");
    } catch {
      setError("这个选择暂时没能写入，请再试一次。");
    }
  };
  const handleChoice = (choiceId) => {
    if (selected && choiceId !== selected && story.chapters.length > index + 1)
      setPendingChoice(choiceId);
    else applyChoice(choiceId);
  };
  const goToChapter = (target) => {
    if (target < 0 || target > lastAccessibleIndex(story, readOnly)) return;
    setDirectoryOpen(false);
    setRewriteMode(false);
    setError("");
    if (readOnly) setSnapshotIndex(target);
    else update(story, target);
  };
  const handleNext = () => {
    if (readOnly) {
      if (nextAvailable) goToChapter(index + 1);
      return;
    }
    if (!ready || isFinal) return;
    try {
      const prepared = prepareReadingWindow(story, index);
      if (index + 1 <= lastAccessibleIndex(prepared)) {
        update(prepared, index + 1);
        setError("");
        setRewriteMode(false);
      } else setError("下一章暂时没能接上，请再试一次。");
    } catch {
      setError("下一章暂时没能接上，请再试一次。");
    }
  };

  return (
    <div ref={readerRef} className="page page-reader page-enter">
      <div className="reader-topline">
        <button
          className="back-link"
          onClick={() => onNavigate(readOnly ? "store" : "home")}
        >
          <Icon name="chevron" size={15} className="rotate-180" />
          {readOnly ? "返回书城" : "我的世界"}
        </button>
        <div className="reader-chapter">
          <span className="reader-book-title">{story.title}</span>
          <span className="reader-position">第 {index + 1} 章</span>
          <div
            className="chapter-progress"
            role="progressbar"
            aria-label="阅读进度"
            aria-valuemin={0}
            aria-valuemax={CHAPTER_COUNT}
            aria-valuenow={index + 1}
            aria-valuetext={`第 ${index + 1} 章，共 ${CHAPTER_COUNT} 章`}
          >
            <i style={{ width: progress }} />
          </div>
        </div>
        <div className="reader-actions">
          <button
            className="reader-directory-button"
            onClick={() => setDirectoryOpen(true)}
            aria-haspopup="dialog"
          >
            <Icon name="menu" size={17} />
            目录
          </button>
          {!readOnly && (
            <button
              className={`icon-button ${story.bookmarked ? "is-active" : ""}`}
              onClick={() =>
                onToggleBookmark?.({ ...story, bookmarked: !story.bookmarked })
              }
              aria-pressed={Boolean(story.bookmarked)}
              aria-label={story.bookmarked ? "取消收藏" : "收藏"}
            >
              <Icon name="bookmark" size={18} />
            </button>
          )}
          {!readOnly && (
            <button
              className="sw-share-button"
              onClick={() => setShareOpen(true)}
            >
              <Icon name="send" size={15} />
              分享
            </button>
          )}
        </div>
      </div>
      {readOnly && (
        <p className="reader-readonly-note">
          <Icon name="lock" size={14} />
          只读版本 · 不会改变原作
        </p>
      )}
      {error && (
        <div className="sw-inline-alert" role="alert">
          <Icon name="x" size={14} />
          {error}
        </div>
      )}
      <div className="reader-layout">
        <article className="reader-article">
          <h1 ref={titleRef} tabIndex={-1}>
            {chapter.title}
          </h1>
          <p className="article-lede">{chapter.paragraphs[0]}</p>
          <div className="article-body">
            {chapter.paragraphs.slice(1).map((paragraph, paragraphIndex) => (
              <p key={`${chapter.id}-${paragraphIndex}`}>{paragraph}</p>
            ))}
          </div>
          {chapter.choice && (
            <div className={`choice-block ${selected ? "resolved" : ""}`}>
              {(readOnly || !selected || rewriteMode) && (
                <div className="choice-heading">
                  <h2>
                    {readOnly
                      ? "作者的选择"
                      : rewriteMode
                        ? "重新选择"
                        : "你会怎么做？"}
                  </h2>
                </div>
              )}
              {readOnly ? (
                <div className="sw-readonly-choice">
                  <Icon name="lock" size={15} />
                  <span>
                    {selection
                      ? selection.label
                      : "这个决定尚未分享。"}
                  </span>
                </div>
              ) : !selected || rewriteMode ? (
                <>
                  <div className="choice-grid" role="group" aria-label="剧情选择">
                    {chapter.choice.options.map((option, optionIndex) => (
                      <button
                        key={option.id}
                        className={`decision-card ${optionIndex % 2 === 0 ? "decision-coral" : "decision-mint"} ${selected === option.id ? "selected" : ""}`}
                        aria-pressed={selected === option.id}
                        onClick={() => handleChoice(option.id)}
                      >
                        <span className="decision-copy">
                          <b>{option.label}</b>
                          <small>{option.detail}</small>
                        </span>
                        <Icon
                          name={selected === option.id ? "check" : "arrow"}
                          size={17}
                        />
                      </button>
                    ))}
                  </div>
                  {rewriteMode && (
                    <button
                      className="reader-directory-button"
                      onClick={() => setRewriteMode(false)}
                    >
                      取消改选
                    </button>
                  )}
                </>
              ) : (
                <div className="choice-resolved">
                  <div className="resolved-check">
                    <Icon name="check" size={18} />
                  </div>
                  <div className="choice-result-copy" role="status">
                    <h3>已选：{selection?.label}</h3>
                    <p>{selection?.consequence}</p>
                  </div>
                  <button
                    className="mini-reset"
                    onClick={() => {
                      setRewriteMode(true);
                      setError("");
                    }}
                  >
                    改选
                  </button>
                </div>
              )}
            </div>
          )}
          {!isFinal && (!readOnly || nextAvailable) && (
            <div className="sw-next-action">
              <Button
                icon="arrow"
                onClick={handleNext}
                disabled={!readOnly && !ready}
              >
                下一章
              </Button>
              {!readOnly && !ready && <span>做出选择后继续</span>}
            </div>
          )}
          {(isFinal || (readOnly && !nextAvailable)) && (
            <section className="reading-end">
              <h2>
                {isFinal ? "这一卷，读完了。" : "已读完分享章节"}
              </h2>
              {(!readOnly || !isFinal) && (
                <p>
                  {readOnly
                    ? "此副本只包含已分享的章节。"
                    : "让另一个主角加入，开启独立的新故事。"}
                </p>
              )}
              <Button
                icon={readOnly ? "book" : "git"}
                onClick={() => onNavigate(readOnly ? "store" : "merge")}
              >
                {readOnly ? "回到书城" : "开启合流本"}
              </Button>
              {!readOnly && (
                <button onClick={() => onNavigate("forge")}>
                  再开一本
                </button>
              )}
            </section>
          )}
          <div className="chapter-navigation">
            {index > 0 && (
              <button
                className="reader-directory-button"
                onClick={() => goToChapter(index - 1)}
              >
                <Icon name="chevron" size={15} className="rotate-180" />
                上一章
              </button>
            )}
            <button
              className="reader-directory-button"
              onClick={() => setDirectoryOpen(true)}
            >
              <Icon name="menu" size={15} />
              目录
            </button>
          </div>
          {!readOnly && (
            <div className="article-footer">
              <span>进度已保存在本机</span>
            </div>
          )}
        </article>
      </div>
      {directoryOpen && (
        <ChapterDirectory
          story={story}
          index={index}
          readOnly={readOnly}
          onSelect={goToChapter}
          onClose={() => setDirectoryOpen(false)}
        />
      )}
      {pendingChoice && (
        <ReadingDialog
          title="改选并重写后续？"
          onClose={() => setPendingChoice(null)}
        >
          <p>
            本章及之前的内容保留，后续章节和选择将被替换。
          </p>
          <p className="rewrite-summary">
            新的选择：
            {
              chapter.choice.options.find(
                (option) => option.id === pendingChoice,
              )?.label
            }
          </p>
          <div className="reading-dialog-actions">
            <Button onClick={() => applyChoice(pendingChoice)}>
              确认改写
            </Button>
            <Button variant="ghost" onClick={() => setPendingChoice(null)}>
              保留原选择
            </Button>
          </div>
        </ReadingDialog>
      )}
      {shareOpen && (
        <ShareSheet
          story={story}
          onClose={() => setShareOpen(false)}
          onPublish={(current) => {
            onPublish?.(current);
            setShareOpen(false);
          }}
        />
      )}
    </div>
  );
}

function storeBookMeta(book) {
  const genre = genreOf(book);
  const merged = book.kind === "merged";
  return {
    id: book.id,
    snapshot: book,
    title: book.title,
    author: book.author || "匿名探索者",
    type: merged ? "合流章" : book.status === "complete" ? "已完结" : "连载中",
    category: genre.label,
    tone: genre.color,
    symbol: genre.symbol,
    note: book.worldBible?.premise || genre.description,
  };
}

function Store({ onNavigate, onOpenBook, onOpenOwn, publications }) {
  const [filter, setFilter] = useState("全部");
  const filters = ["全部", "奇幻", "修仙", "赛博", "都市", "合流章"];
  const published = (publications || []).map((item) => {
    const snapshot = item.snapshot || {};
    const status =
      snapshot.status ||
      (snapshot.chapters?.length >= 6 ? "complete" : "ongoing");
    return {
      ...storeBookMeta({
        ...snapshot,
        id: item.id,
        author: "我 · 匿名分享",
        status,
      }),
      sourceLabel: "本机分享",
    };
  });
  const books = [
    ...COMMUNITY_BOOKS.map((book) => ({
      ...storeBookMeta(book),
      sourceLabel: "示例故事",
    })),
    ...published,
  ];
  const visibleBooks =
    filter === "全部"
      ? books
      : books.filter(
          (book) => book.category === filter || book.type === filter,
        );

  return (
    <div className="page page-store page-enter">
      <header className="store-heading">
        <h1>书城</h1>
        <button className="small-link" onClick={onOpenOwn} aria-label="创建匿名分享">
          分享 <Icon name="send" size={17} />
        </button>
      </header>
      <p className="page-caption">示例故事与本机分享</p>

      <div className="store-toolbar">
        <div className="store-filters" role="group" aria-label="小说分类">
          {filters.map((item) => (
            <button
              type="button"
              key={item}
              className={filter === item ? "active" : ""}
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {visibleBooks.length > 0 ? (
        <div className="book-grid">
          {visibleBooks.map((book) => (
            <button
              type="button"
              key={book.id}
              className={`book-card book-${book.tone}`}
              onClick={() => onOpenBook(book.snapshot)}
            >
              <div className="book-cover">
                <span className="book-source">{book.sourceLabel}</span>
                <div>
                  <b>{book.title}</b>
                </div>
              </div>
              <div className="book-card-copy">
                <div className="book-card-meta">
                  <span>{book.category} · {book.type}</span>
                </div>
                <p>{book.note}</p>
                <div className="book-author">
                  <span>{book.author}</span>
                  <Icon name="arrow" size={17} />
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="store-empty" role="status">
          <Icon name="book" size={27} />
          <h3>暂无{filter}故事</h3>
          <Button
            variant="secondary"
            icon="arrow"
            onClick={() => onNavigate("forge")}
          >
            开一本新书
          </Button>
        </div>
      )}

    </div>
  );
}

function Merge({ activeStory, onNavigate, onMerged }) {
  // Keep the two originals on stage after the new book becomes active.
  const [sourceStory] = useState(activeStory);
  const [rules, setRules] = useState("bridge");
  const [lead, setLead] = useState("a");
  const [bond, setBond] = useState("allies");
  const [mergedStory, setMergedStory] = useState(null);
  const [error, setError] = useState("");
  const started = Boolean(mergedStory);
  if (!sourceStory)
    return (
      <div className="page page-merge page-enter">
        <div className="sw-empty-page">
          <div className="sw-empty-icon">
            <Icon name="git" size={25} />
          </div>
          <h1>先有你的故事。</h1>
          <p>再与另一个主角相遇，开启独立的新书。</p>
          <Button icon="arrow" onClick={() => onNavigate("forge")}>
            开启第一本书
          </Button>
        </div>
      </div>
    );
  const mineGenre = genreOf(sourceStory);
  const friendGenre = genreOf(FRIEND_BOOK);
  const runMerge = () => {
    try {
      const next = materialize(
        createMergedStory(sourceStory, FRIEND_BOOK, { rules, lead, bond }),
        2,
      );
      setMergedStory(next);
      onMerged?.(next);
      setError("");
    } catch {
      setError("这一次没能连接两个世界。原书和设定都还在，请再试一次。");
    }
  };
  return (
    <div className="page page-merge page-enter">
      <div className="merge-heading">
        <div>
          <h1>世界合流</h1>
          <p>两个主角，一本新故事。原书保留。</p>
        </div>
      </div>
      <div className="merge-stage">
        <WorldAtmosphere variant="merge" />
        <div className="merge-world-card mine">
          <div className="merge-card-top">
            <span>你的主角</span>
          </div>
          <div className="merge-art merge-art-coral">
            <span className="merge-art-symbol">{mineGenre.symbol}</span>
            <span className="merge-art-label">{mineGenre.world}</span>
          </div>
          <div className="merge-card-bottom">
            <div className="avatar avatar-rose">
              {displayName(sourceStory).slice(0, 1)}
            </div>
            <div>
              <b>{displayName(sourceStory)}</b>
              <span>
                {mineGenre.label} · {sourceStory.config.ability}
              </span>
            </div>
          </div>
        </div>
        <div className={`merge-center ${started ? "started" : ""}`}>
          <div className="merge-core">
            <Icon name={started ? "check" : "git"} size={25} />
          </div>
        </div>
        <div className="merge-world-card friend">
          <div className="merge-card-top">
            <span>示例角色</span>
          </div>
          <div className="merge-art merge-art-mint">
            <span className="merge-art-symbol">{friendGenre.symbol}</span>
            <span className="merge-art-label">{friendGenre.world}</span>
          </div>
          <div className="merge-card-bottom">
            <div className="avatar avatar-mint">烬</div>
            <div>
              <b>{displayName(FRIEND_BOOK)}</b>
              <span>
                {friendGenre.label} · {FRIEND_BOOK.config.ability}
              </span>
            </div>
          </div>
        </div>
      </div>
      {error && (
        <div className="sw-inline-alert" role="alert">
          {error}
        </div>
      )}
      <div className="merge-controls">
        <section className="merge-conflicts">
          <div className="control-heading">
            <div>
              <h2>{started ? "新故事已入书架" : "如何相遇"}</h2>
            </div>
          </div>
          {started ? (
            <div className="merge-result">
              <div className="result-symbol">
                <Icon name="book" size={23} />
              </div>
              <div>
                <b>{mergedStory.title}</b>
              </div>
              <button onClick={() => onNavigate("reader", mergedStory.id)}>
                阅读新书 <Icon name="arrow" size={17} />
              </button>
            </div>
          ) : (
            <div className="priority-choice">
              <span className="field-label" id="merge-rules-label">
                世界规则
              </span>
              <div
                className="priority-options"
                role="group"
                aria-labelledby="merge-rules-label"
              >
                <button
                  aria-pressed={rules === "bridge"}
                  className={rules === "bridge" ? "active" : ""}
                  onClick={() => setRules("bridge")}
                >
                  互相融合
                </button>
                <button
                  aria-pressed={rules === "separate"}
                  className={rules === "separate" ? "active" : ""}
                  onClick={() => setRules("separate")}
                >
                  各自独立
                </button>
              </div>
              <span
                className="field-label sw-merge-subtitle"
                id="merge-lead-label"
              >
                谁先开口
              </span>
              <div
                className="priority-options"
                role="group"
                aria-labelledby="merge-lead-label"
              >
                <button
                  aria-pressed={lead === "a"}
                  className={lead === "a" ? "active" : ""}
                  onClick={() => setLead("a")}
                >
                  {displayName(sourceStory)}
                </button>
                <button
                  aria-pressed={lead === "b"}
                  className={lead === "b" ? "active" : ""}
                  onClick={() => setLead("b")}
                >
                  烬野
                </button>
              </div>
              <span
                className="field-label sw-merge-subtitle"
                id="merge-bond-label"
              >
                初次关系
              </span>
              <div
                className="sw-bond-options"
                role="group"
                aria-labelledby="merge-bond-label"
              >
                <button
                  aria-pressed={bond === "allies"}
                  className={bond === "allies" ? "active" : ""}
                  onClick={() => setBond("allies")}
                >
                  暂时结盟
                </button>
                <button
                  aria-pressed={bond === "rivals"}
                  className={bond === "rivals" ? "active" : ""}
                  onClick={() => setBond("rivals")}
                >
                  彼此试探
                </button>
              </div>
            </div>
          )}
        </section>
          {!started && (
          <div className="merge-action">
            <Button icon="arrow" onClick={runMerge}>
              开启合流故事
            </Button>
            <p className="experience-note">与示例角色合流，好友邀请暂未开放。</p>
          </div>
          )}
      </div>
    </div>
  );
}

function legacyDraftToDraft(library) {
  const source =
    library?.draft && typeof library.draft === "object" ? library.draft : {};
  const worldId = source.genreId || source.worldId;
  const textValue = (...values) =>
    values.find(
      (value) =>
        typeof value === "string" && value.trim() && value.trim() !== "...",
    ) || "";
  return {
    ...DEFAULT_DRAFT,
    ...source,
    genreId: genreById[worldId] ? worldId : DEFAULT_DRAFT.genreId,
    name: textValue(source.name, source.protagonistName),
    trait:
      textValue(source.trait, source.protagonistTrait) || DEFAULT_DRAFT.trait,
    origin:
      textValue(source.origin, source.protagonistOrigin) ||
      DEFAULT_DRAFT.origin,
    immersive: Boolean(source.immersive ?? source.protagonistImmersive),
    hometown: textValue(source.hometown),
    school: textValue(source.school),
    company: textValue(source.company),
    role: textValue(source.role),
    ability:
      textValue(source.ability, source.abilityName) || DEFAULT_DRAFT.ability,
    tone: textValue(source.tone, source.toneName) || DEFAULT_DRAFT.tone,
    step: Math.min(4, Math.max(1, Number(source.step) || 1)),
  };
}

function libraryWithStory(library, story) {
  const next = upsertStory(library, story);
  const favorites = Array.isArray(library?.favorites) ? library.favorites : [];
  return {
    ...next,
    favorites: story?.bookmarked
      ? [...new Set([...favorites, story.id])]
      : favorites.filter((id) => id !== story?.id),
  };
}

function App() {
  const sceneRef = useRef(null);
  const [boot] = useState(() => {
    const loaded = loadLibrary();
    const migrated = migrateLegacy();
    const library =
      migrated?.draft && !loaded.library.draft
        ? { ...loaded.library, draft: migrated.draft }
        : loaded.library;
    return { library, warning: loaded.warning };
  });
  const [library, setLibrary] = useState(boot.library || emptyLibrary());
  const [warning, setWarning] = useState(boot.warning);
  const [view, setView] = useState("home");
  const [readerExternal, setReaderExternal] = useState(null);
  const [shareRequest, setShareRequest] = useState(false);
  const [toast, setToast] = useState("");
  const skipFirstSave = useRef(true);
  const activeStory = useMemo(
    () =>
      library.stories.find((story) => story.id === library.activeStoryId) ||
      library.stories[0] ||
      null,
    [library],
  );
  const readerStory = readerExternal || activeStory;
  const { animate } = useMotionPolicy(view);
  useSmoothScroll(view);
  useSceneMotion(
    sceneRef,
    view,
    ".hero-copy h1, .store-heading h1, .merge-heading h1",
  );
  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    const result = saveLibrary(undefined, library);
    if (!result.ok) setWarning(result.error);
  }, [library]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const navigate = (next, options = {}) => {
    // Leaving a community snapshot and tapping the main Reading tab should
    // always return to the user's own active world, never keep the read-only
    // object as a hidden navigation state.
    if (next === "reader" && readerExternal && !options.keepExternal) {
      setReaderExternal(null);
    }
    if (next !== "reader") {
      setReaderExternal(null);
      setShareRequest(false);
    }
    setView(next);
    scrollToTop();
  };
  const commitStory = useCallback(
    (story) => setLibrary((current) => libraryWithStory(current, story)),
    [],
  );
  const saveDraft = useCallback(
    (draft) => setLibrary((current) => ({ ...current, draft })),
    [],
  );
  const generate = (payload) => {
    try {
      // The local story is ready synchronously; open it without a staged wait.
      const story = seedStory(
        createStory({
          genreId: payload.genreId,
          name: payload.name,
          trait: payload.trait,
          origin: payload.origin,
          ability: payload.ability,
          tone: payload.tone,
          immersive: payload.immersive,
          hometown: payload.hometown,
          school: payload.school,
          company: payload.company,
          role: payload.role,
          friend: payload.friend,
          destination: payload.destination,
        }),
      );
      setLibrary((current) => ({
        ...libraryWithStory(current, story),
        draft: null,
      }));
      setReaderExternal(null);
      setShareRequest(false);
      setToast("");
      navigate("reader");
    } catch {
      setToast("暂时没能打开故事，草稿还在。请再试一次。");
    }
  };
  const openOwnReader = (storyId = activeStory?.id, options = {}) => {
    setReaderExternal(null);
    setShareRequest(Boolean(options.share));
    if (storyId)
      setLibrary((current) => ({ ...current, activeStoryId: storyId }));
    navigate("reader");
  };
  const openCommunityBook = (book) => {
    setReaderExternal(book);
    setShareRequest(false);
    navigate("reader", { keepExternal: true });
  };
  const openOwnForShare = () => {
    if (activeStory) openOwnReader(activeStory.id, { share: true });
    else {
      setToast("先造出第一本书，再发布到书城。");
      navigate("forge");
    }
  };
  const publish = (story) => {
    try {
      const snapshot = publicSnapshot(story);
      setLibrary((current) => ({
        ...current,
        publications: [
          ...current.publications.filter((item) => item.storyId !== story.id),
          {
            id: `publication-${story.id}`,
            storyId: story.id,
            snapshot,
            createdAt: new Date().toISOString(),
          },
        ],
      }));
      setToast("已保存匿名只读版本，可以在本机书城阅读。");
    } catch {
      setToast("这本书暂时还不能发布。");
    }
  };
  const addMergedStory = (story) => {
    commitStory(story);
    setToast("");
  };
  let page;
  if (view === "forge")
    page = (
      <Forge
        onGenerate={generate}
        initialDraft={legacyDraftToDraft(library)}
        onDraftChange={saveDraft}
      />
    );
  else if (view === "reader")
    page = (
      <Reader
        key={`${readerStory?.id || "empty"}:${readerExternal ? "shared" : "own"}`}
        story={readerStory}
        readOnly={Boolean(readerExternal)}
        onNavigate={navigate}
        onUpdateStory={commitStory}
        onToggleBookmark={commitStory}
        onPublish={publish}
        openShare={shareRequest}
        onShareOpened={() => setShareRequest(false)}
      />
    );
  else if (view === "store")
    page = (
      <Store
        onNavigate={navigate}
        onOpenBook={openCommunityBook}
        onOpenOwn={openOwnForShare}
        publications={library.publications}
      />
    );
  else if (view === "merge")
    page = (
      <Merge
        activeStory={
          activeStory?.kind === "merged"
            ? library.stories.find((story) => story.kind !== "merged") || activeStory
            : activeStory
        }
        onNavigate={(next, id) => (id ? openOwnReader(id) : navigate(next))}
        onMerged={addMergedStory}
      />
    );
  else
    page = (
      <Home
        onNavigate={navigate}
        onOpenStory={openOwnReader}
        activeStory={activeStory}
        stories={library.stories}
      />
    );
  return (
    <div
      ref={sceneRef}
      className="app-shell"
      data-view={view}
      data-motion={animate ? "on" : "off"}
    >
      <Sidebar view={view} onNavigate={navigate} />
      <main className="main-shell">
        <Topbar view={view} onNavigate={navigate} />
        {warning && (
          <div className="sw-storage-warning">
            <Icon name="lock" size={14} />
            {warning}
          </div>
        )}
        <MobileBottomNav view={view} onNavigate={navigate} />
        {page}
      </main>
      {toast && (
        <div className="sw-toast" role="status" aria-live="polite">
          <Icon name="check" size={15} />
          {toast}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <MotionProvider>
    <App />
  </MotionProvider>,
);
