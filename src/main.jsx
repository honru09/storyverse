import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./reader-flow.css";
import "./aurora.css";
import AuroraBackground from "./components/AuroraBackground.jsx";
import StoryMap, { StoryMapMini, generationState } from "./components/StoryMap.jsx";
import GenerationOverlay from "./components/GenerationOverlay.jsx";
import { installRipple } from "./motion/ripple.js";
import AnimatedContent from "./components/react-bits/AnimatedContent.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { createLibraryStore } from "./library-store.js";
import { parseRoute, routeHash } from "./navigation.js";
import {
  chunkShelves,
  coverInfoFor,
  coverTitleLayoutFor,
  rankMetaFor,
  rankStoreBooks,
  seasonLabel,
  shelfMetaFor,
  shelfTiltFor,
  statusBadgeFor,
  storyComplete,
} from "./list-layout.js";
import {
  coverStateOf,
  requestCoverImage,
  shouldAutoRequestCover,
  withCoverState,
} from "./cover.js";
import { downloadText } from "./downloads.js";
import {
  AVATAR_APPEARANCE_FIELDS,
  AVATAR_PRESETS,
  avatarAppearanceText,
  avatarJourneys,
  avatarPortraitState,
  fetchAvatar,
  fetchAvatarObjectUrl,
  generateAvatar,
  saveAvatar,
} from "./avatar.js";
import {
  enterDraftFor,
  fetchPlazaDetail,
  fetchPlazaFeed,
  plazaGateFor,
  plazaLengthLabel,
  plazaMine,
  plazaMineForget,
  plazaMineIds,
  plazaMineRemember,
  plazaPortraitPath,
  plazaReaderStory,
  plazaTemplateNameFor,
  publishToPlaza,
  reportPublication,
  withdrawPublication,
} from "./plaza.js";
import { acceptGeneratedChapter, generationStatus, mergeSourceContext, nextGenerationIndex, requestChapter } from "./generation.js";
import WorldArtwork from "./components/WorldArtwork.jsx";
import StoryCover from "./components/StoryCover.jsx";
import AccountPanel from "./components/AccountPanel.jsx";
import { createAuthClient } from "./auth/client.js";
import ReadingPreferences from "./components/ReadingPreferences.jsx";
import { createReadingPreferencesStore, getReaderAppearance } from "./reading-preferences.js";
import { chapterLocationKey, estimateReadingMetrics } from "./reading-location.js";
import { useReaderExperience } from "./useReaderExperience.js";
import ReadingTools from "./components/ReadingTools.jsx";
import "./reader-experience.css";
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
  lastAccessibleIndex,
  materialize,
  moveReadingPosition,
  prepareReadingWindow,
  readerIndexFor,
  selectedChoice,
} from "./reading-flow.js";
import {
  ALL_ABILITIES,
  COMMUNITY_BOOKS,
  CUSTOM_GENRE,
  CUSTOM_GENRE_ID,
  CUSTOM_WORLD_NAME_MAX,
  CUSTOM_WORLD_SETTING_MAX,
  DEFAULT_DRAFT,
  FRIEND_BOOK,
  GENRES,
  GENRE_TEMPLATES,
  ORIGIN_IDENTITIES,
  START_POINT_NAME_MAX,
  abilityCandidatesFor,
  buildChapter,
  chapterForReading,
  chooseBranch,
  createMergedStory,
  createStory,
  genreTemplateById,
  localIdentityTitle,
  originIdentityById,
  originSummaryFor,
  isStoryComplete,
  publicSnapshot,
  resolveStartPoint,
  startNextSeason,
  storyLengthModeOf,
  totalChaptersFor,
  spawnPointsForIdentity,
  startPointByName,
} from "./story-engine";
import {
  exportLibrary,
  importLibrary,
  STORAGE_KEY,
  upsertStory,
} from "./persistence";
import { findSettingViolation } from "./setting-guard";

const Icon = ({ name, size = 18, stroke = 1.8, className = "" }) => {
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
    image: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m5 19 5.2-5.2a1.8 1.8 0 0 1 2.5 0L19 20" />
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
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
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

const traits = ["冷静观察者", "温柔理想派", "危险好奇心", "嘴硬心软"];
// One-tap sparks for the god-mode setting field: each is a complete world
// rule a creator can adopt as-is or keep writing from.
const GOD_MODE_FRAGMENTS = [
  "这里的雨只落在说谎的人头上。",
  "每个人出生时都带着一把钥匙，却没有人见过锁。",
  "时间是通货，穷人向富人借明天。",
  "这座城每晚都会换一个位置醒来。",
];
const tones = [
  { id: "poetic", name: "诗性冒险", desc: "慢一点，风会把伏笔吹到你手里" },
  { id: "tense", name: "悬疑推进", desc: "每一次呼吸都离真相更近" },
  { id: "warm", name: "群像治愈", desc: "让角色在世界缝隙里彼此照亮" },
];
const genreById = { ...Object.fromEntries(GENRES.map((genre) => [genre.id, genre])), [CUSTOM_GENRE.id]: CUSTOM_GENRE };

const toWorld = (genre) => ({
  ...genre,
  id: genre.id,
  name: genre.world,
  subtitle: genre.tagline,
  label: `${genre.label} · 世界线`,
});
const worlds = GENRES.map(toWorld);
// The start flow leads with the craft (genre template); the wall order is a
// curated shelf, not the engine list order: flagship fantasy first as the
// large brick, then the remaining crafts in reading-habit order.
const TEMPLATE_WALL_ORDER = [
  "xuanhuan",
  "xianxia",
  "gaowu",
  "romance-ancient",
  "scifi",
  "wuxianliu",
  "guize-guatan",
  "horror",
  "lishi",
  "romance-modern",
  "suspense-supernatural",
  "campus",
  "urban",
  "zhihu-short",
];
const templateWall = TEMPLATE_WALL_ORDER
  .map((id) => GENRE_TEMPLATES.find((template) => template.id === id))
  .filter(Boolean);

function seedStory(story) {
  return { ...prepareReadingWindow(story, 0), readerIndex: 0 };
}

function genreOf(story) {
  return genreById[story?.genreId || story?.config?.genreId] || GENRES[0];
}

function displayName(story, fallback = "未命名旅人") {
  return story?.config?.name?.trim() || fallback;
}

const coverSources = (story) => story?.kind === "merged"
  ? story.config?.protagonists?.map((person) => person.genreId).slice(0, 2)
  : undefined;

function lastChoiceLabel(story) {
  try {
    const entries = Object.entries(story?.choices || {})
      .map(([key, value]) => [Number(key), value])
      .filter(([index]) => Number.isInteger(index))
      .sort((a, b) => b[0] - a[0]);
    for (const [index, choiceId] of entries) {
      const option = story.chapters?.[index]?.choice?.options?.find((item) => item.id === choiceId);
      if (option) return option.label;
    }
  } catch { /* a hand-edited save must never break the shelf */ }
  return null;
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
    <button className="brand-mark" onClick={onClick} aria-label="回到广场">
      <span className="brand-glyph" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">
          <rect x="1" y="1" width="62" height="62" rx="14" fill="#060d1f" />
          <g transform="translate(4.1 6.3) scale(0.279)">
            <path d="M14 96 L96 118 L96 158 L14 136 Z" fill="#8b7cf0" />
            <path d="M104 118 L186 96 L186 136 L104 158 Z" fill="#5a49d6" />
            <path d="M64 38 L100 72 L136 38 M100 72 L100 112" fill="none" stroke="#1d9e74" strokeWidth="13.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="100" cy="72" r="9.5" fill="#1d9e74" />
            <circle cx="64" cy="38" r="12" fill="#f6a21e" />
            <circle cx="136" cy="38" r="12" fill="#f6a21e" />
          </g>
        </svg>
      </span>
      <span className="brand-copy">
        <strong>织界</strong>
      </span>
    </button>
  );
}

function Sidebar({ view, onNavigate }) {
  const items = [
    { id: "plaza", label: "广场", icon: "spark" },
    { id: "home", label: "我的世界", icon: "compass" },
    { id: "forge", label: "造世", icon: "plus" },
    { id: "store", label: "书城", icon: "book" },
    { id: "merge", label: "世界合流", icon: "git" },
  ];
  return (
    <aside className="sidebar">
      <Brand onClick={() => onNavigate("plaza")} />
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

function Topbar({ onNavigate, onOpenLibrary, onOpenAccount, account }) {
  return (
    <header className="topbar">
      <Brand onClick={() => onNavigate("plaza")} />
      <div className="topbar-actions">
        <button className="account-entry" onClick={onOpenAccount} aria-label={account.user ? "我的账号" : "登录与注册"} aria-haspopup="dialog">
          {account.user ? <span>{(account.user.displayName || account.user.email || "你").slice(0, 1).toUpperCase()}</span> : <><Icon name="users" size={18}/><span>登录</span></>}
        </button>
        <MotionToggle />
        <button className="icon-button" onClick={onOpenLibrary} aria-label="书架与备份" aria-haspopup="dialog">
          <Icon name="sliders" size={20} />
        </button>
      </div>
    </header>
  );
}

function MobileBottomNav({ view, onNavigate }) {
  if (view === "reader") return null;
  const items = [
    { id: "plaza", label: "广场" },
    { id: "forge", label: "造世" },
    { id: "store", label: "书城" },
    { id: "merge", label: "合流" },
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
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Home({ onNavigate, onOpenStory, activeStory, stories, draft, account, onOpenAccount, authClient, avatar, onOpenAvatar }) {
  const genre = genreOf(activeStory);
  const activeTotal = activeStory ? totalChaptersFor(activeStory) : 6;
  const currentChapter = activeStory
    ? Math.min(activeTotal, readerIndexFor(activeStory) + 1)
    : 1;
  const otherStories = stories.filter((story) => story.id !== activeStory?.id);

  return (
    <div className="page page-home page-enter">
      <div className="home-heading">
        <p className="home-welcome">{activeStory ? "故事还在，等你回来。" : "你的世界，从这一页开始。"}</p>
        {!account.user && <button className="home-account-link" onClick={onOpenAccount}>登录 / 注册<Icon name="chevron" size={14}/></button>}
      </div>
      <section className={`home-hero ${activeStory ? "has-story" : "first-story"}`}>
        <div className="hero-scene">
          <StoryCover story={activeStory} genreId={genre.id} sources={coverSources(activeStory)} eager sizes="(min-width: 1200px) 1050px, 100vw" getAccessToken={() => authClient.getAccessToken()} authSignal={account.status} />
        </div>
        <div className="hero-copy">
          <h1>
            {activeStory ? (
              activeStory.title
            ) : (
              <>
                这一次，
                <br />
                <em>你是主角。</em>
              </>
            )}
          </h1>
          <p>
            {activeStory ? (
              <>
                <span>{genre.label} · {activeStory.kind === "merged" ? "双主角" : displayName(activeStory)}</span>
                <span className="resume-position">第 {currentChapter} / {activeTotal} 章</span>
              </>
            ) : (
              "选一个世界。让故事，因你不同。"
            )}
          </p>
          {activeStory && (
            <div className="hero-starmap">
              <StoryMapMini
                total={activeTotal}
                generated={activeStory.chapters?.length || 0}
                current={readerIndexFor(activeStory)}
                state={generationState({ total: activeTotal, generated: activeStory.chapters?.length || 0, current: readerIndexFor(activeStory), engine: activeStory.engine, complete: activeStory.status === "complete" || isStoryComplete(activeStory) })}
              />
            </div>
          )}
          <div className="hero-actions">
            <Button
              icon="arrow"
              onClick={() =>
                activeStory ? onOpenStory(activeStory.id) : onNavigate("forge")
              }
            >
              {activeStory
                ? currentChapter === activeTotal
                  ? "回看终章"
                  : "继续阅读"
                : "开启第一本书"}
            </Button>
          </div>
        </div>
      </section>

      {draft && <button className="home-draft-row" onClick={() => onNavigate("forge")}>
        <Icon name="book" size={20}/><span><strong>继续上次设定</strong><small>第 {migratedDraftStep(draft)} 步 · 已保存在本机</small></span><Icon name="chevron" size={16}/>
      </button>}

      <button className="home-draft-row" onClick={onOpenAvatar}>
        <Icon name="users" size={20}/><span><strong>我的化身</strong><small>{avatar ? `${avatar.name} · ${avatarAppearanceText(avatar.appearance)}` : "让同一个角色，走进每一个世界"}</small></span><Icon name="chevron" size={16}/>
      </button>

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
          authClient={authClient}
          authSignal={account.status}
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
          <span className="browse-art"><WorldArtwork genreId="neon" /></span>
          <span>先逛逛书城</span><Icon name="arrow" size={19} />
        </button>
      )}
    </div>
  );
}

// Books per plank follow the retired grid's breakpoints: three across at
// phone width (the size the wooden shelf was designed at), more as the
// room widens. Rendered server-side/first paint assumes the phone size.
function useShelfCapacity() {
  const read = () => {
    if (typeof window === "undefined" || !window.matchMedia) return 3;
    if (window.matchMedia("(min-width: 1050px)").matches) return 5;
    if (window.matchMedia("(min-width: 700px)").matches) return 4;
    return 3;
  };
  const [capacity, setCapacity] = useState(read);
  useEffect(() => {
    const queries = [window.matchMedia("(min-width: 700px)"), window.matchMedia("(min-width: 1050px)")];
    const update = () => setCapacity(read());
    queries.forEach((query) => query.addEventListener?.("change", update));
    return () => queries.forEach((query) => query.removeEventListener?.("change", update));
  }, []);
  return capacity;
}

function LibrarySwitcher({ stories, activeStoryId, onOpenStory, authClient, authSignal = '' }) {
  const otherStories = stories.filter((story) => story.id !== activeStoryId);
  const capacity = useShelfCapacity();
  const [pulledId, setPulledId] = useState(null);
  const pullTimer = useRef(null);
  useEffect(() => () => { if (pullTimer.current) window.clearTimeout(pullTimer.current); }, []);
  if (otherStories.length === 0) return null;

  const shelves = chunkShelves(otherStories, capacity);
  const handleOpen = (story) => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      || document.querySelector(".app-shell")?.dataset.motion === "off";
    if (reduced) {
      onOpenStory(story.id);
      return;
    }
    // Pull the book off the shelf first; the reader opens as it comes
    // forward. The delay stays inside the page-transition token's reach.
    setPulledId(story.id);
    pullTimer.current = window.setTimeout(() => {
      setPulledId(null);
      onOpenStory(story.id);
    }, 260);
  };

  return (
    <section className="sw-shelf sw-shelf-wood" aria-label="书架上的其他故事">
      {shelves.map((row, shelfIndex) => {
        const partial = row.length < capacity;
        return (
          <div className="wood-shelf" key={row.map((story) => story.id).join("|")}>
            <div className="wood-shelf-books">
              {row.map((story, bookIndex) => {
                const genre = genreOf(story);
                const complete = storyComplete(story);
                const ribbonKind = complete ? "is-complete" : seasonLabel(story) ? "is-season" : "is-serial";
                const titleLayout = coverTitleLayoutFor(story);
                const leaning = partial && shelfIndex === shelves.length - 1 && bookIndex === row.length - 1;
                return (
                  <button
                    type="button"
                    key={story.id}
                    className={`wood-book ${leaning ? "is-leaning" : ""} ${pulledId === story.id ? "is-pulled" : ""}`}
                    style={{ "--tilt": `${shelfTiltFor(story)}deg` }}
                    onClick={() => handleOpen(story)}
                    aria-label={`${story.title}，${shelfMetaFor(story)}`}
                  >
                    <span className="wood-book-cover">
                      <StoryCover story={story} genreId={genre.id} sources={coverSources(story)} getAccessToken={() => authClient.getAccessToken()} authSignal={authSignal} />
                      <span className="wood-book-spine" aria-hidden="true" />
                      <span className={`wood-book-ribbon ${ribbonKind}`} aria-hidden="true">{statusBadgeFor(story)}</span>
                      {titleLayout === "vertical" && (
                        <span className="wood-book-title-tag" aria-hidden="true">{story.title}</span>
                      )}
                      <span className="wood-book-face" aria-hidden="true">
                        {titleLayout === "horizontal" && <b>{story.title}</b>}
                        <small>{shelfMetaFor(story)}</small>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="wood-shelf-plank" aria-hidden="true" />
          </div>
        );
      })}
    </section>
  );
}

// The reader's avatar profile, shared by every surface that needs it. The
// server is the source of truth (the profile follows the account, not the
// browser); surfaces read through this one hook instead of keeping copies.
function useAvatarProfile(authClient, account) {
  const [avatar, setAvatar] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const status = account?.status;
  const refresh = useCallback(async () => {
    if (status !== "authenticated") {
      setAvatar(null);
      setLoaded(true);
      return null;
    }
    try {
      const profile = await fetchAvatar({ getAccessToken: () => authClient.getAccessToken() });
      setAvatar(profile);
      return profile;
    } catch {
      return null;
    } finally {
      setLoaded(true);
    }
  }, [authClient, status]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { avatar, setAvatar, loaded, refresh };
}

function AvatarPortrait({ avatar, getAccessToken, which = "current", className = "" }) {
  const { status, version, hasPrevious } = avatarPortraitState(avatar);
  const [url, setUrl] = useState(null);
  const avatarId = avatar?.id;
  useEffect(() => {
    if (!avatarId || (which === "previous" ? !hasPrevious : status !== "ready")) {
      setUrl(null);
      return undefined;
    }
    let cancelled = false;
    fetchAvatarObjectUrl({ avatar, which, getAccessToken })
      .then((next) => { if (!cancelled) setUrl(next); })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
    // Keyed by id+version+slot, not object identity: the profile object is
    // rebuilt on every write and must not retrigger the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarId, status, version, hasPrevious, which]);
  if (url) return <img className={`avatar-portrait-img ${className}`} src={url} alt="" />;
  return (
    <div className={`avatar-portrait-fallback ${className}`} aria-hidden="true">
      <span>{(avatar?.name || "化").slice(0, 1)}</span>
    </div>
  );
}

function AppearanceFields({ appearance, onPick, onFaceNote, disabled = false }) {
  return (
    <div className="avatar-fields">
      {AVATAR_APPEARANCE_FIELDS.map((field) => (
        <div className="form-block" key={field.key}>
          <span className="field-label">{field.label}</span>
          <div className="chip-grid">
            {field.options.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`choice-chip ${appearance[field.key] === item.id ? "active" : ""}`}
                aria-pressed={appearance[field.key] === item.id}
                disabled={disabled}
                onClick={() => onPick(field.key, item.id)}
              >
                {item.label}
                {appearance[field.key] === item.id && <Icon name="check" size={13} />}
              </button>
            ))}
          </div>
        </div>
      ))}
      <label className="field-label">
        脸部备注（选填）
        <input
          maxLength={60}
          autoComplete="off"
          value={appearance.faceNote || ""}
          disabled={disabled}
          onChange={(event) => onFaceNote(event.target.value)}
          placeholder="例如：笑起来左边有酒窝"
        />
      </label>
    </div>
  );
}

function AvatarPage({ authClient, account, avatarState, stories, onOpenStory, onOpenAccount, onNavigate }) {
  const { avatar, setAvatar } = avatarState;
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPrevious, setShowPrevious] = useState(false);
  const getToken = useCallback(() => authClient.getAccessToken(), [authClient]);
  const signedIn = account?.status === "authenticated" && Boolean(account?.user);

  // The form is the editing buffer; it seeds from the stored profile once
  // it lands, and from the defaults while the reader has no avatar yet.
  useEffect(() => {
    if (form !== null || !avatarState.loaded) return;
    if (avatar) setForm({ name: avatar.name, description: avatar.description || "", appearance: { ...avatar.appearance } });
    else setForm({ name: "", description: "", appearance: { hairColor: "black", hairStyle: "long-straight", outfit: "coat", shoes: "boots", face: "none", faceNote: "" } });
  }, [avatar, avatarState.loaded, form]);

  if (!signedIn) {
    return (
      <div className="page page-avatar page-enter">
        <div className="sw-empty-page">
          <div className="sw-empty-icon"><Icon name="users" size={25} /></div>
          <h1>化身跟着账号走。</h1>
          <p>先登录，再创建你的化身——它会陪你走进每一个世界。</p>
          <Button icon="arrow" onClick={onOpenAccount}>登录 / 注册</Button>
        </div>
      </div>
    );
  }
  if (!form) {
    return (
      <div className="page page-avatar page-enter">
        <div className="merge-heading"><div><h1>我的化身</h1><p>正在打开…</p></div></div>
      </div>
    );
  }

  const portrait = avatarPortraitState(avatar);
  const painting = busy || portrait.status === "pending";
  const previewAvatar = avatar
    ? { ...avatar, name: form.name || avatar.name, appearance: form.appearance }
    : { id: "", name: form.name, appearance: form.appearance, portrait: { status: painting ? "pending" : "none", version: 0, hasPrevious: false } };
  const journeys = avatar ? avatarJourneys(avatar, stories) : [];
  const profileDirty = Boolean(avatar) && (form.name !== avatar.name || form.description !== (avatar.description || ""));

  const paint = async (nextForm) => {
    if (busy) return;
    if (!nextForm.name.trim()) { setError("先给化身取个名字。"); return; }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const painted = await generateAvatar({ profile: nextForm, getAccessToken: getToken });
      setAvatar(painted);
      setForm({ name: painted.name, description: painted.description || "", appearance: { ...painted.appearance } });
      setShowPrevious(false);
      setNotice("立绘已更新。");
    } catch (failure) {
      setError(failure.message || "立绘暂时没能生成，请稍后再试。");
      // The server persisted the failed state; reconcile so the page
      // shows the truth instead of a stuck pending.
      const fresh = await fetchAvatar({ getAccessToken: getToken }).catch(() => null);
      if (fresh) setAvatar(fresh);
    } finally {
      setBusy(false);
    }
  };

  const pickAppearance = (key, id) => {
    const appearance = { ...form.appearance, [key]: id };
    const nextForm = { ...form, appearance };
    setForm(nextForm);
    // One part changed → repaint right away (an existing avatar only; the
    // creation form paints on its own button). The daily limit is the
    // guardrail, and the previous painting stays viewable.
    if (avatar) void paint(nextForm);
  };
  const applyFaceNote = () => { if (avatar) void paint(form); };
  const saveProfileOnly = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await saveAvatar({ profile: form, getAccessToken: getToken });
      setAvatar(saved);
      setNotice("资料已保存。");
    } catch (failure) {
      setError(failure.message || "资料暂时没能保存，请稍后再试。");
    } finally {
      setBusy(false);
    }
  };
  const adoptPreset = (preset) => {
    setForm({ name: preset.name, description: preset.description, appearance: { ...preset.appearance } });
    setError("");
  };

  return (
    <div className="page page-avatar page-enter">
      <div className="merge-heading">
        <div>
          <h1>我的化身</h1>
          <p>同一个角色，走进每一个世界。各条故事线互不影响，化身是它们之间的连接。</p>
        </div>
      </div>
      {error && <div className="sw-inline-alert" role="alert">{error}</div>}
      {notice && <p className="field-hint" role="status">{notice}</p>}
      <div className="avatar-layout">
        <section className="avatar-stage">
          <div className="avatar-frame">
            <AvatarPortrait avatar={previewAvatar} getAccessToken={getToken} which={showPrevious ? "previous" : "current"} />
            {painting && <div className="avatar-frame-state">正在画…</div>}
            {!painting && portrait.status === "failed" && <div className="avatar-frame-state is-error">上次没画成</div>}
          </div>
          {avatar && portrait.hasPrevious && (
            <button type="button" className="small-link" onClick={() => setShowPrevious((value) => !value)}>
              {showPrevious ? "看当前版本" : "回看上一版"}
            </button>
          )}
          {avatar && portrait.version > 0 && <span className="avatar-version">立绘 v{portrait.version}</span>}
          {!avatar && <p className="field-hint">写下名字和样子，第一张立绘就会画出来。</p>}
          {avatar && portrait.status !== "ready" && !painting && (
            <Button icon="spark" disabled={busy} onClick={() => void paint(form)}>
              {portrait.status === "failed" ? "重新生成立绘" : "生成立绘"}
            </Button>
          )}
        </section>
        <section className="avatar-editor">
          <label className="field-label">
            名字
            <input
              maxLength={20}
              autoComplete="off"
              value={form.name}
              disabled={busy}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="给化身取个名字"
            />
          </label>
          <label className="field-label">
            想象中的样子
            <textarea
              maxLength={300}
              rows={3}
              value={form.description}
              disabled={busy}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="写一两句：性格、气质、给人的感觉——立绘会照着画，故事也会记住。"
            />
          </label>
          {!avatar && (
            <div className="form-block">
              <span className="field-label">或者先选一位</span>
              <div className="avatar-presets">
                {AVATAR_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.id}
                    className={`avatar-preset ${form.name === preset.name ? "active" : ""}`}
                    aria-pressed={form.name === preset.name}
                    onClick={() => adoptPreset(preset)}
                  >
                    <b>{preset.name}</b>
                    <small>{preset.description}</small>
                    <span>{avatarAppearanceText(preset.appearance)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <AppearanceFields
            appearance={form.appearance}
            disabled={painting}
            onPick={pickAppearance}
            onFaceNote={(value) => setForm({ ...form, appearance: { ...form.appearance, faceNote: value } })}
          />
          <div className="avatar-actions">
            {!avatar && (
              <Button icon="spark" disabled={busy || !form.name.trim()} onClick={() => void paint(form)}>
                {busy ? "正在画…" : "创建并生成立绘"}
              </Button>
            )}
            {avatar && form.appearance.faceNote !== (avatar.appearance.faceNote || "") && (
              <Button disabled={busy} onClick={applyFaceNote}>用新备注重画</Button>
            )}
            {profileDirty && (
              <button type="button" className="small-link" disabled={busy} onClick={() => void saveProfileOnly()}>
                只保存名字与描述
              </button>
            )}
          </div>
          {avatar && painting && <p className="field-hint">正在重画立绘，其余调整先等一下。</p>}
        </section>
      </div>
      {avatar && (
        <section className="avatar-journeys">
          <div className="section-heading"><h2>TA 的阅历</h2></div>
          {journeys.length === 0 ? (
            <p className="field-hint">还没有走进任何世界。开新书时在主角那一步选「用我的化身」，第一段旅程就从那里开始。</p>
          ) : (
            <div className="avatar-journey-list">
              {journeys.map((row) => {
                const story = stories.find((item) => item.id === row.storyId);
                const genre = genreById[row.genreId] || GENRES[0];
                const total = story ? totalChaptersFor(story) : row.chapters;
                const complete = story ? isStoryComplete(story) : false;
                return (
                  <button type="button" key={row.storyId} className="avatar-journey" onClick={() => onOpenStory(row.storyId)}>
                    <span className="avatar-journey-main">
                      <b>{row.title}</b>
                      <small>{genre.world} · {row.kind === "merged" ? "合流" : (genreTemplateById(row.genreTemplateId)?.name || genre.label)}</small>
                    </span>
                    <span className="avatar-journey-progress">{complete ? `已完结 · 全 ${total} 章` : `第 ${row.chapters} / ${total} 章`}</span>
                    <Icon name="chevron" size={15} />
                  </button>
                );
              })}
            </div>
          )}
          <button type="button" className="small-link" onClick={() => onNavigate("forge")}>带 TA 开一本新书 <Icon name="arrow" size={14} /></button>
        </section>
      )}
    </div>
  );
}

function Stepper({ step, setStep }) {
  const steps = [
    { id: 1, label: "题材" },
    { id: 2, label: "世界" },
    { id: 3, label: "身份" },
    { id: 4, label: "出生点" },
    { id: 5, label: "主角" },
    { id: 6, label: "能力" },
    { id: 7, label: "开局" },
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

function TemplateBrick({ template, selected, featured, index = 0, onSelect }) {
  return (
    <AnimatedContent className={`template-brick-wrap ${featured ? "featured" : ""}`} distance={8} delay={Math.min(index, 7) * 0.06}>
      <button
        type="button"
        className={`template-brick ${selected ? "selected" : ""}`}
        aria-pressed={selected}
        onClick={() => onSelect(template)}
      >
        <span
          className="template-brick-visual template-brick-visual--craft"
          style={{ background: `linear-gradient(150deg, ${template.color}40, rgba(10, 20, 48, 0.25) 62%)` }}
          aria-hidden="true"
        >
          <span className="template-brick-symbol" style={{ color: template.color }}>{template.symbol}</span>
        </span>
        <span className="template-brick-copy">
          <strong>{template.fullName}</strong>
          <small>{template.blurb}</small>
        </span>
        {selected && (
          <span className="selected-mark">
            <Icon name="check" size={13} />
          </span>
        )}
      </button>
    </AnimatedContent>
  );
}

function WorldCard({ world, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`world-card ${selected ? "selected" : ""}`}
      aria-pressed={selected}
      onClick={() => onSelect(world.id)}
    >
      <span className="world-card-cover">
        <WorldArtwork genreId={world.id} />
      </span>
      <span className="world-card-copy">
        <strong>{world.name}</strong>
        <em>{world.subtitle}</em>
        <small>{world.description}</small>
      </span>
      {selected && (
        <span className="selected-mark">
          <Icon name="check" size={13} />
        </span>
      )}
    </button>
  );
}

function PreviewPanel({ world, template, draft, ability, tone, spawn, onJump }) {
  const person = draft.name || "未命名的旅人";
  const origin = originSummaryFor(genreById[draft.genreId] || GENRES[0], draft);
  const isCustom = draft.genreId === CUSTOM_GENRE.id;
  // The category and the world are independent picks, so their rows jump
  // back independently: category to step one, world to step two. In god
  // mode both live on the world step, where the form holds name, setting
  // and craft together.
  const factRow = (label, value, jumpStep, jumpLabel) => onJump ? (
    <button
      type="button"
      className="preview-fact-jump"
      aria-label={jumpLabel}
      onClick={() => onJump(jumpStep)}
    >
      <span>{label}</span>
      <b>{value}</b>
    </button>
  ) : (
    <div><dt>{label}</dt><dd>{value}</dd></div>
  );
  return (
    <aside className="preview-panel">
      <h3>当前设定</h3>
      <div className={`preview-cover world-${world.color}`}>
        <WorldArtwork genreId={world.id} />
        <div>
          <strong>{world.name}</strong>
        </div>
      </div>
      <dl className="preview-facts">
        {factRow("题材", template ? template.fullName : "完全自由", isCustom ? 2 : 1, "修改题材")}
        {factRow("世界", world.name, 2, "修改世界")}
        <div><dt>篇幅</dt><dd>{draft.storyLengthMode === "long" ? "长线 · 100 章" : draft.storyLengthMode === "season" ? "一季 · 24 章" : "短季 · 6 章"}</dd></div>
        <div><dt>身份</dt><dd>{origin ? (origin.localTitle !== origin.name ? `${origin.name} · ${origin.localTitle}` : origin.name) : (draft.origin || "未定")}</dd></div>
        <div><dt>出生点</dt><dd>{spawn ? spawn.name : "由设定决定"}</dd></div>
        {draft.genreId === CUSTOM_GENRE.id && (
          <div><dt>设定</dt><dd>{(draft.customWorldSetting || "").trim().slice(0, 80) || "尚未写下设定"}</dd></div>
        )}
        <div><dt>主角</dt><dd>{person}</dd></div>
        <div><dt>性格</dt><dd>{draft.trait}</dd></div>
        <div><dt>能力</dt><dd>{ability?.name || "未定"}</dd></div>
        <div><dt>风格</dt><dd>{tone.name}</dd></div>
      </dl>
    </aside>
  );
}

function GenerationMode({ provider, value, onChange, disabled }) {
  return <div className="generation-mode">
    <div className="generation-options" role="group" aria-label="故事方式">
      <button disabled={disabled} aria-pressed={value === "local"} onClick={() => onChange("local")}>预设体验</button>
      <button disabled={disabled || !provider.configured} aria-pressed={value === "gemini"} onClick={() => onChange("gemini")}>Gemini 创作</button>
    </div>
    <p className="experience-note">{value === "gemini"
      ? "设定与剧情会发送给 Gemini。请使用昵称或虚构资料；每次续写会使用服务端额度。"
      : provider.configured ? "无需等待，按所选篇幅体验预设故事。" : provider.reason === "generation-disabled" ? "在线创作暂未开放，可先体验预设故事。" : "预设剧情体验 · Gemini 尚未连接"}</p>
  </div>;
}

function Forge({ onGenerate, initialDraft, onDraftChange, provider, authClient, avatar, avatarLoaded, onOpenAvatar }) {
  const forgeRef = useRef(null);
  const operation = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(null);
  const engine = mode || (provider.configured ? "gemini" : "local");
  useEffect(() => () => operation.current?.abort(), []);
  const [step, setStep] = useState(
    clampForgeStep(initialDraft?.step),
  );
  const [draft, setDraft] = useState(() => {
    const base = { ...DEFAULT_DRAFT, ...(initialDraft || {}) };
    // The world marker must always be a real boolean inside the flow: the
    // restore funnel (legacyDraftToDraft) supplies it for saved drafts;
    // anything else is a fresh draft whose world is still unchosen.
    if (typeof base.worldChosen !== "boolean") base.worldChosen = false;
    // Creation only offers season / long: anything else (including the
    // engine's legacy 'short' default baked into restored drafts) lands on
    // the season default. An explicit long pick survives a restore.
    if (base.storyLengthMode !== "long") base.storyLengthMode = "season";
    // Step one always has a category selected: a restored pick wins,
    // otherwise the wall's first brick. The category is NEVER derived from
    // the world (and the world never from the category): the two picks are
    // independent. God mode is the exception: an empty template there means
    // "completely free" and must survive the restore.
    if (base.genreId !== CUSTOM_GENRE.id && !genreTemplateById(base.genreTemplateId)) {
      base.genreTemplateId = templateWall[0]?.id || "";
    }
    return base;
  });
  // Ability restore: a known candidate id (or a name matching any pool)
  // wins; any other stored name is a custom ability the reader wrote; no
  // stored ability means the step opens unselected — never a preset.
  const [abilityId, setAbilityId] = useState(() => {
    const byId = ALL_ABILITIES.find((item) => item.id === initialDraft?.abilityId)?.id;
    if (byId) return byId;
    const byName = ALL_ABILITIES.find((item) => item.name === initialDraft?.ability)?.id;
    if (byName) return byName;
    return initialDraft?.ability ? "custom" : "";
  });
  const [customAbility, setCustomAbility] = useState(() => {
    const known = ALL_ABILITIES.some(
      (item) => item.id === initialDraft?.abilityId || item.name === initialDraft?.ability,
    );
    return !known && initialDraft?.ability ? initialDraft.ability : "";
  });
  const [toneId, setToneId] = useState(
    tones.find((item) => item.id === initialDraft?.toneId)?.id ||
      tones.find((item) => item.name === initialDraft?.tone)?.id ||
      "poetic",
  );
  const isCustom = draft.genreId === CUSTOM_GENRE.id;
  // True only once a world was deliberately picked, rolled or combo-rolled
  // (or the draft predates the world screen — see legacyDraftToDraft). The
  // bare genreId default never counts as a choice.
  const worldChosen = draft.worldChosen === true;
  const customWorldName = (draft.customWorldName || "").trim();
  const world = isCustom
    ? { ...toWorld(CUSTOM_GENRE), name: customWorldName || CUSTOM_GENRE.world, location: customWorldName || CUSTOM_GENRE.location }
    : toWorld(genreById[draft.genreId] || GENRES[0]);
  const template =
    genreTemplateById(draft.genreTemplateId) ||
    (isCustom ? null : templateWall[0]);
  // The identity is a cross-world concept and survives world switches; the
  // spawn point belongs to (identity × world). When the world changes, a
  // picked spawn point survives only if the new world's cell for the same
  // identity has one with the same name (its hook is re-read from that
  // cell); anything else resets to the cell's default (or, without an
  // identity, the world's default; for god mode, to "unset").
  const spawnGenre = genreById[draft.genreId] || GENRES[0];
  const identity = originIdentityById(draft.originIdentityId);
  const spawn = resolveStartPoint(spawnGenre, draft);
  const identityPoints = identity && !isCustom ? spawnPointsForIdentity(spawnGenre, identity.id) : [];
  const spawnPoints = identityPoints.length ? identityPoints : (spawnGenre.spawnPoints || []);
  // God mode can still borrow spawn points, but the source is the world the
  // user had chosen before entering god mode (stashed on entry) crossed
  // with the picked identity — a craft template never lends its world.
  const borrowGenre = isCustom ? GENRES.find((genre) => genre.id === draft.godBorrowWorldId) : null;
  const borrowPoints = borrowGenre && identity ? spawnPointsForIdentity(borrowGenre, identity.id) : [];
  // The ability step's candidates follow the (world × template) pair:
  // the pinned template's signature abilities first, then the world's own
  // pool; a god-mode world offers its pinned craft's signatures, or the
  // generic pool when completely free.
  const abilityCandidates = abilityCandidatesFor({
    genreId: draft.genreId,
    genreTemplateId: draft.genreTemplateId,
    custom: isCustom,
  });
  const lastGenreId = useRef(draft.genreId);
  useEffect(() => {
    if (lastGenreId.current === draft.genreId) return;
    lastGenreId.current = draft.genreId;
    const nextGenre = genreById[draft.genreId] || GENRES[0];
    const cellPoints = nextGenre.id !== CUSTOM_GENRE.id && draft.originIdentityId
      ? spawnPointsForIdentity(nextGenre, draft.originIdentityId)
      : null;
    const kept = nextGenre.id !== CUSTOM_GENRE.id
      ? (cellPoints
        ? cellPoints.find((point) => point.name === draft.startPointName) || null
        : startPointByName(nextGenre, draft.startPointName))
      : null;
    if (kept) {
      if (draft.startPointHook !== kept.hook) set({ startPointHook: kept.hook });
    } else if (draft.startPointName || draft.startPointHook) {
      set({ startPointName: "", startPointHook: "" });
    }
    // Only the world switch matters here; the draft fields are read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.genreId]);
  // Changing the identity re-frames the spawn point: the old pick belonged
  // to the old identity's cell, so the spawn choice resets to the new
  // identity's default.
  const selectIdentity = (identityId) => {
    if (identityId === draft.originIdentityId) return;
    set({ originIdentityId: identityId, startPointName: "", startPointHook: "" });
  };
  // The random card's roll, shared with next(): draw any identity other
  // than the current one and land it (the spawn choice resets with it, so
  // the spawn step opens on the rolled identity's cell default).
  const rollIdentity = () => {
    const pool = ORIGIN_IDENTITIES.filter((item) => item.id !== identity?.id);
    const rolledIdentity = pool[Math.floor(Math.random() * pool.length)] || ORIGIN_IDENTITIES[0];
    if (rolledIdentity) selectIdentity(rolledIdentity.id);
  };
  // 题材与世界彻底解耦：题材屏只写分类，世界屏只写世界，两边互不跟随。
  // Picking a category touches the category field and nothing else — never
  // the world, never the world marker.
  const selectTemplate = (item) => {
    set({ genreTemplateId: item.id });
  };
  const rollTemplate = () => {
    const pool = templateWall.filter((item) => item.id !== template?.id);
    const rolledTemplate = pool[Math.floor(Math.random() * pool.length)] || templateWall[0];
    if (rolledTemplate) selectTemplate(rolledTemplate);
  };
  // Picking a world touches the world field and lands the world marker —
  // never the category. The marker is what separates a deliberate world
  // from the untouched default when the step is left without a pick.
  const selectStage = (genreId) => {
    set({ genreId, worldChosen: true });
  };
  const rollWorld = () => {
    const pool = GENRES.filter((genre) => genre.id !== draft.genreId);
    const rolledWorld = pool[Math.floor(Math.random() * pool.length)] || GENRES[0];
    if (rolledWorld) selectStage(rolledWorld.id);
  };
  // The ability roll, shared between the random card and next(): draw any
  // candidate other than the current pick, from the CURRENT list only.
  const rollAbility = () => {
    const pool = abilityCandidates.filter((item) => item.id !== abilityId);
    const rolledAbility = pool[Math.floor(Math.random() * pool.length)] || abilityCandidates[0];
    if (rolledAbility) {
      setCustomAbility("");
      setAbilityId(rolledAbility.id);
    }
  };
  const enterGodMode = () => {
    // Remember the world the user had chosen before going god: god mode's
    // spawn step may borrow that world's spawn points (crossed with the
    // identity). Entering without a chosen world stashes nothing.
    const borrow = draft.genreId !== CUSTOM_GENRE.id
      ? (worldChosen ? draft.genreId : "")
      : (draft.godBorrowWorldId || "");
    set({ genreId: CUSTOM_GENRE.id, genreTemplateId: "", godBorrowWorldId: borrow });
  };
  const exitGodMode = () => {
    // Back to the world the user came from when there is one; a craft
    // picked as 写法 in god mode stays picked — it never implied a world.
    const backTo = GENRES.some((genre) => genre.id === draft.godBorrowWorldId)
      ? draft.godBorrowWorldId
      : DEFAULT_DRAFT.genreId;
    set({ genreId: backTo, ...(draft.godBorrowWorldId ? { worldChosen: true } : {}) });
  };
  const appendFragment = (fragment) => {    const current = (draft.customWorldSetting || "").trim();
    const needsStop = current && !"。！？".includes(current.slice(-1));
    const joined = current ? `${current}${needsStop ? "。" : ""}${fragment}` : fragment;
    set({ customWorldSetting: joined.slice(0, CUSTOM_WORLD_SETTING_MAX) });
  };
  const [rolled, setRolled] = useState(null);
  const rollCombo = () => {
    // Each axis is rolled independently: category, world, identity and the
    // spawn point inside the rolled identity's cell in the rolled world.
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const nextTemplate = pick(templateWall);
    const stageGenre = pick(GENRES);
    const nextIdentity = pick(ORIGIN_IDENTITIES);
    const points = spawnPointsForIdentity(stageGenre, nextIdentity.id);
    const point = points.length ? pick(points) : null;
    set({
      genreTemplateId: nextTemplate.id,
      genreId: stageGenre.id,
      worldChosen: true,
      originIdentityId: nextIdentity.id,
      startPointName: point ? point.name : "",
      startPointHook: point ? point.hook : "",
    });
    setRolled({ template: nextTemplate, world: stageGenre.world, identity: nextIdentity, point });
  };
  // A pick only counts while it belongs to the current candidate list (or
  // is the reader's own custom text): switching world or template retires
  // a stale pick instead of silently carrying another world's ability.
  const abilityPick = abilityId === "custom"
    ? (customAbility.trim() ? { id: "custom", name: customAbility.trim(), desc: "你亲手写下的能力" } : null)
    : abilityCandidates.find((item) => item.id === abilityId) || null;
  const abilityName = abilityPick?.name || "";
  const tone = tones.find((item) => item.id === toneId) || tones[0];
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const next = () => {
    // God-mode settings are checked when leaving the world step (the god
    // form lives there now), not while typing: a refused setting stays on
    // screen, editable, with the reason shown.
    if (step === 2 && isCustom) {
      const violation = findSettingViolation(draft.customWorldSetting);
      if (violation) { setError(violation); return; }
    }
    // Leaving the world step with no world picked rolls one and lands it,
    // exactly like the identity step below: the default world on the draft
    // is not a choice, and silently keeping it would re-couple the world
    // to whatever the draft happened to start with.
    if (step === 2 && !isCustom && !worldChosen) rollWorld();
    // Leaving the identity step with nothing picked must not fall through
    // to the spawn step's whole-world fallback list — that would resurrect
    // the old "pick a proper noun before knowing the world" problem through
    // the back door. Roll an identity instead, exactly like the random
    // card; a draft that already carries one is never re-rolled, and the
    // pick can still be changed by going back a step.
    if (step === 3 && !identity) rollIdentity();
    // Leaving the ability step with nothing picked rolls from the current
    // (world × template) list and lands it — the same rule as the world
    // and identity steps. There is no default ability to fall back to.
    if (step === 6 && !abilityPick) rollAbility();
    setError("");
    setStep((value) => Math.min(7, value + 1));
  };
  const back = () => setStep((value) => Math.max(1, value - 1));
  useSceneMotion(
    forgeRef,
    step,
    ".forge-section-heading h2",
  );
  useEffect(() => {
    onDraftChange?.({
      ...draft,
      ability: abilityName,
      tone: tone.name,
      abilityId: abilityPick?.id || "",
      toneId,
      step,
    });
  }, [draft, abilityName, abilityPick?.id, tone.name, toneId, step, onDraftChange]);
  useEffect(() => {
    scrollToTop();
    forgeRef.current
      ?.querySelector(".forge-section-heading h2")
      ?.focus({ preventScroll: true });
  }, [step]);
  const submit = async () => {
    if (operation.current) return;
    if (isCustom) {
      const violation = findSettingViolation(draft.customWorldSetting);
      if (violation) { setError(violation); setStep(2); return; }
    }
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    try { await onGenerate({
      ...draft,
      ability: abilityName,
      tone: tone.name,
      world,
      abilityOption: abilityPick || { id: "", name: "", desc: "" },
      toneOption: tone,
    }, { engine, signal: controller.signal }); }
    catch (failure) { if (!controller.signal.aborted) setError(failure.message || "暂时没能打开故事，草稿还在。"); }
    finally { if (operation.current === controller) { operation.current = null; setBusy(false); } }
  };
  const spawnName = spawn?.name || world.location;
  const previewText = isCustom && (draft.customWorldSetting || "").trim()
    ? `${draft.name || "未命名旅人"}会在${world.name}醒来——${(draft.customWorldSetting || "").trim().slice(0, 56)}`
    : draft.immersive && draft.hometown
      ? `来自${draft.hometown}的${draft.role || "旅人"}，会在${spawnName}听见第一声回响。`
      : `${draft.name || "未命名旅人"}会在${spawnName}收到一条无法解释的信号。`;
  return (
    <div ref={forgeRef} className="page page-forge page-enter" data-step={step}>
      <div className="forge-progress">
        <h1 className="sr-only">新故事</h1>
        <Stepper step={step} setStep={(value) => { if (!busy) setStep(value); }} />
        <span className="step-count" aria-label={`第 ${step} 步，共 7 步`}>{step} / 7</span>
      </div>
      <div className="forge-layout">
        <main className="forge-main">
          {step === 1 && (
            <>
              <div className="forge-section-heading">
                <div>
                  <h2 tabIndex={-1}>想写哪种故事？</h2>
                </div>
              </div>
              <div className="template-wall" role="group" aria-label="题材">
                {templateWall.map((item, index) => (
                  <TemplateBrick
                    key={item.id}
                    template={item}
                    index={index}
                    featured={index === 0}
                    selected={template?.id === item.id}
                    onSelect={selectTemplate}
                  />
                ))}
                <AnimatedContent className="template-brick-wrap" distance={8} delay={0.42}>
                  <button type="button" className="template-brick template-brick-random" onClick={rollTemplate}>
                    <span
                      className="template-brick-visual template-brick-visual--craft"
                      style={{ background: "linear-gradient(150deg, rgba(110, 231, 255, 0.28), rgba(10, 20, 48, 0.25) 62%)" }}
                      aria-hidden="true"
                    >
                      <span className="template-brick-symbol" style={{ color: "var(--cyan)" }}>掷</span>
                    </span>
                    <span className="template-brick-copy">
                      <strong>随机</strong>
                      <small>从十四种题材里抽一个——分类交给命运。</small>
                    </span>
                  </button>
                </AnimatedContent>
              </div>
              <div className="random-combo-row">
                <p>{rolled
                  ? <>已配好：<b>{rolled.template.fullName} · {rolled.world}</b>，以「{rolled.identity.name}」的身份{rolled.point ? <>，从「{rolled.point.name}」醒来</> : null}。不满意就再掷一次。</>
                  : <>没想好？<b>随机组合</b>一次配好题材、世界、身份和出生点。</>}</p>
                <Button variant="secondary" icon="spark" className="random-combo-button" onClick={rollCombo}>
                  {rolled ? "再掷一次" : "随机组合"}
                </Button>
              </div>
              <p className="world-selection-note" aria-live="polite">{template
                ? `${template.blurb} 题材只是分类——故事发生在哪个世界，下一步由你自己选。`
                : `不绑任何题材模板，写法完全自由。世界在下一步由你决定。`}</p>
            </>
          )}
          {step === 2 && (
            <>
              <div className="forge-section-heading">
                <div>
                  <h2 tabIndex={-1}>{isCustom ? "这个世界，由你写。" : "故事发生在哪个世界？"}</h2>
                </div>
              </div>
              {isCustom ? (
                <div className="god-form">
                  <button type="button" className="god-back" onClick={exitGodMode}>
                    <Icon name="chevron" size={15} className="rotate-180" />
                    改用预设世界
                  </button>
                  <label className="field-label">
                    世界的名字（选填）
                    <input
                      maxLength={CUSTOM_WORLD_NAME_MAX}
                      autoComplete="off"
                      value={draft.customWorldName || ""}
                      onChange={(event) => set({ customWorldName: event.target.value })}
                      placeholder="给你的世界起个名字"
                    />
                  </label>
                  <p className="field-hint">留空也行：故事会先以「未命名世界」开始，回到这一步随时能改名。</p>
                  <label className="field-label">
                    背景设定
                    <textarea
                      className="god-setting"
                      rows={6}
                      maxLength={CUSTOM_WORLD_SETTING_MAX}
                      value={draft.customWorldSetting || ""}
                      onChange={(event) => set({ customWorldSetting: event.target.value })}
                      placeholder="例如：海水每晚倒流一小时，倒流时死者会回到岸边说一句话。镇上的人靠替亡者传话为生，只有我听不见他们说话。"
                    />
                  </label>
                  <div className="god-setting-meta">
                    <span className="field-hint">时代、地点、规则、氛围都写在这里；写下的设定会原样成为生成的世界依据。请勿直接使用他人作品或 IP 的设定。</span>
                    <span className="god-count">{(draft.customWorldSetting || "").length} / {CUSTOM_WORLD_SETTING_MAX}</span>
                  </div>
                  <div className="form-block">
                    <span className="field-label">灵感碎片（点一下，补进设定）</span>
                    <div className="stage-chips">
                      {GOD_MODE_FRAGMENTS.map((fragment) => (
                        <button type="button" key={fragment} className="stage-chip" onClick={() => appendFragment(fragment)}>
                          {fragment}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-block">
                    <span className="field-label">写法（选填）</span>
                    <div className="stage-chips" role="group" aria-label="写法">
                      <button
                        type="button"
                        className={`stage-chip ${!template ? "selected" : ""}`}
                        aria-pressed={!template}
                        onClick={() => set({ genreTemplateId: "" })}
                      >
                        完全自由
                      </button>
                      {GENRE_TEMPLATES.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          className={`stage-chip ${template?.id === item.id ? "selected" : ""}`}
                          aria-pressed={template?.id === item.id}
                          onClick={() => set({ genreTemplateId: item.id })}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                    <p className="field-hint">选一个题材，借它的结构与文风来写你的世界；选「完全自由」，写法不设限。</p>
                  </div>
                  {error && <p className="god-error" role="alert">{error}</p>}
                </div>
              ) : (
                <>
                  <div className="world-grid" role="group" aria-label="世界">
                    {worlds.map((item) => (
                      <WorldCard
                        key={item.id}
                        world={item}
                        selected={draft.worldChosen && draft.genreId === item.id}
                        onSelect={selectStage}
                      />
                    ))}
                    <button type="button" className="world-card world-card-god" onClick={enterGodMode}>
                      <span className="world-card-cover world-card-cover--symbol" aria-hidden="true">
                        <span className="world-card-symbol">{CUSTOM_GENRE.symbol}</span>
                      </span>
                      <span className="world-card-copy">
                        <strong>创世神模式</strong>
                        <em>世界由你亲手写</em>
                        <small>不选现成世界——自己写下世界的名字、规则与氛围。</small>
                      </span>
                      <Icon name="chevron" size={15} />
                    </button>
                    <button type="button" className="world-card world-card-random" onClick={rollWorld}>
                      <span className="world-card-cover world-card-cover--symbol" aria-hidden="true">
                        <span className="world-card-symbol">掷</span>
                      </span>
                      <span className="world-card-copy">
                        <strong>随机</strong>
                        <em>交给命运</em>
                        <small>从六个世界里抽一个，抽中哪个就去哪个世界。</small>
                      </span>
                    </button>
                  </div>
                  <p className="god-ip-note">请勿直接使用他人作品或 IP 的设定——换上你自己的世界，故事才真正属于你。</p>
                </>
              )}
              <p className="world-selection-note" aria-live="polite">{isCustom
                ? template
                  ? `${template.blurb} 世界由你亲手写——${world.name}。`
                  : `不绑任何题材模板，写法完全由你的设定决定。世界是${world.name}。`
                : worldChosen
                  ? `世界是${world.name}——${world.subtitle}。题材和世界互相独立：换世界不会动你选好的题材。`
                  : `还没选也行：点「继续」会替你掷一个世界。题材和世界互相独立，掷世界不会动题材。`}</p>
            </>
          )}
          {step === 3 && (
            <>
              <div className="forge-section-heading">
                <div>
                  <h2 tabIndex={-1}>你以什么身份醒来？</h2>
                </div>
              </div>
              <div className="spawn-grid" role="group" aria-label="身份">
                {ORIGIN_IDENTITIES.map((item) => {
                  const localTitle = localIdentityTitle(spawnGenre, item.id);
                  const active = identity?.id === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`spawn-card ${active ? "active" : ""}`}
                      aria-pressed={active}
                      onClick={() => selectIdentity(item.id)}
                    >
                      <span className="spawn-card-head">
                        <b>{item.name}</b>
                        <em>{item.situation}</em>
                        {active && <Icon name="check" size={14} />}
                      </span>
                      <small>{item.description}</small>
                      {!isCustom && localTitle !== item.name && (
                        <span className="spawn-card-local">在{world.name}：{localTitle}</span>
                      )}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="spawn-card spawn-random"
                  onClick={rollIdentity}
                >
                  <span className="spawn-card-head">
                    <b>随机</b>
                    <em>交给命运</em>
                  </span>
                  <small>点一下，从十种身份里抽一个——出身不由你选的，才像人生。</small>
                </button>
              </div>
              <p className="field-hint">先定身份，再选出生点：身份决定你在这个世界里是谁，出生点只是你睁开眼的那一处地方。{identity && !isCustom ? <>在{world.name}，人们会称你为「{localIdentityTitle(spawnGenre, identity.id)}」。</> : null}</p>
            </>
          )}
          {step === 4 && (
            <>
              <div className="forge-section-heading">
                <div>
                  <h2 tabIndex={-1}>故事从哪里醒来？</h2>
                </div>
              </div>
              {isCustom ? (
                <div className="spawn-form">
                  <label className="field-label">
                    出生点（选填）
                    <input
                      maxLength={START_POINT_NAME_MAX}
                      autoComplete="off"
                      value={draft.startPointName || ""}
                      onChange={(event) => set({ startPointName: event.target.value, startPointHook: "" })}
                      placeholder="破庙里醒来的那张草席"
                    />
                  </label>
                  <p className="field-hint">留空也行：出生点由你的背景设定决定。写一个小而具体的地方——主角睁开眼时，就在那里。</p>
                  {borrowPoints.length > 0 && (
                    <div className="form-block">
                      <span className="field-label">也可以借用「{borrowGenre.world}」的出生点</span>
                      <div className="stage-chips" role="group" aria-label="可借用的出生点">
                        {borrowPoints.map((point) => (
                          <button
                            type="button"
                            key={point.name}
                            className={`stage-chip ${draft.startPointName === point.name ? "selected" : ""}`}
                            aria-pressed={draft.startPointName === point.name}
                            onClick={() => set({ startPointName: point.name, startPointHook: point.hook })}
                          >
                            {point.name}
                          </button>
                        ))}
                      </div>
                      <p className="field-hint">来自你选过的世界「{borrowGenre.world}」里，这个身份能落脚的地方；点一下填进来，也可以再改。</p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="spawn-grid" role="group" aria-label="出生点">
                    {spawnPoints.map((point) => (
                      <button
                        type="button"
                        key={point.name}
                        className={`spawn-card ${spawn?.name === point.name ? "active" : ""}`}
                        aria-pressed={spawn?.name === point.name}
                        onClick={() => set({ startPointName: point.name, startPointHook: point.hook })}
                      >
                        <span className="spawn-card-head">
                          <b>{point.name}</b>
                          <em>{point.situation}</em>
                          {spawn?.name === point.name && <Icon name="check" size={14} />}
                        </span>
                        <small>{point.hook}</small>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="spawn-card spawn-random"
                      onClick={() => {
                        const pool = spawnPoints.filter((point) => point.name !== spawn?.name);
                        const pick = pool[Math.floor(Math.random() * pool.length)] || spawnPoints[0];
                        if (pick) set({ startPointName: pick.name, startPointHook: pick.hook });
                      }}
                    >
                      <span className="spawn-card-head">
                        <b>随机</b>
                        <em>交给命运</em>
                      </span>
                      <small>点一下，从{world.name}的出生点里抽一个，抽中哪个就从哪里醒来。</small>
                    </button>
                  </div>
                  <p className="field-hint">出生点只决定第一幕：主角在哪里醒来、睁开眼先撞见什么。之后的故事不会被它框住。{identity ? <>这里只列「{identity.name}」在{world.name}能落脚的地方。</> : null}不选也行——默认从「{spawnPoints[0]?.name}」开始。</p>
                </>
              )}
            </>
          )}
          {step === 5 && (
            <>
              <div className="forge-section-heading">
                <div>
                  <h2 tabIndex={-1}>你是怎样的主角？</h2>
                </div>
              </div>
              {avatar && draft.avatarId !== avatar.id && (
                <div className="avatar-bring">
                  <span className="avatar-bring-thumb">
                    <AvatarPortrait avatar={avatar} getAccessToken={() => authClient.getAccessToken()} />
                  </span>
                  <span className="avatar-bring-copy">
                    <b>{avatar.name}</b>
                    <small>{avatarAppearanceText(avatar.appearance)}</small>
                  </span>
                  <button
                    type="button"
                    className="small-link"
                    onClick={() => set({ name: avatar.name, avatarId: avatar.id, avatarAppearance: avatarAppearanceText(avatar.appearance) })}
                  >
                    用我的化身
                  </button>
                </div>
              )}
              {avatar && draft.avatarId === avatar.id && (
                <div className="avatar-bring active">
                  <span className="avatar-bring-thumb">
                    <AvatarPortrait avatar={avatar} getAccessToken={() => authClient.getAccessToken()} />
                  </span>
                  <span className="avatar-bring-copy">
                    <b>这一本由{avatar.name}来走</b>
                    <small>名字和样子已带入，只改这本书，不动化身档案。</small>
                  </span>
                  <button type="button" className="small-link" onClick={() => set({ avatarId: "", avatarAppearance: "" })}>
                    取消带入
                  </button>
                </div>
              )}
              {!avatar && draft.avatarId && (
                <div className="avatar-bring active">
                  <span className="avatar-bring-copy">
                    <b>已带入化身</b>
                    <small>{draft.avatarAppearance}</small>
                  </span>
                  <button type="button" className="small-link" onClick={() => set({ avatarId: "", avatarAppearance: "" })}>
                    取消带入
                  </button>
                </div>
              )}
              {!avatar && !draft.avatarId && avatarLoaded && (
                <button type="button" className="avatar-bring avatar-bring-empty" onClick={onOpenAvatar}>
                  <Icon name="users" size={17} />
                  <span>还没有化身？先创建一位——之后每本书都能带 TA 进去。</span>
                  <Icon name="chevron" size={15} />
                </button>
              )}
              <div className="protagonist-form">
                <label className="field-label">
                  主角昵称（选填）
                  <input
                    maxLength={40}
                    autoComplete="off"
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
                      <p className="field-hint">建议用昵称或虚构内容。选择 Gemini 时，设定会发送给模型服务。</p>
                      <label className="field-label">
                        成长的地方（选填）
                        <input
                          maxLength={80}
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
                          maxLength={80}
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
                          maxLength={80}
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
                          maxLength={80}
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
                          maxLength={40}
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
          {step === 6 && (
            <>
              <div className="forge-section-heading">
                <div>
                  <h2 tabIndex={-1}>想拥有什么能力？</h2>
                  <p className="field-hint">{isCustom
                    ? "创世神世界没有现成的能力池：候选来自你选的写法，或写一个自己的。不选直接继续，会从候选里随机落定一个。"
                    : "候选随世界与题材而变：先是所选题材的招牌能力，再是这个世界的本事。不选直接继续，会从候选里随机落定一个。"}</p>
                </div>
              </div>
              <div className="ability-list">
                {abilityCandidates.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`ability-card ${abilityId === item.id ? "active" : ""}`}
                    aria-pressed={abilityId === item.id}
                    onClick={() => { setAbilityId(item.id); setCustomAbility(""); }}
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
                <button
                  type="button"
                  className="ability-card ability-card-random"
                  onClick={rollAbility}
                >
                  <span>
                    <b>随机能力</b>
                    <small>从上面的候选里抽一个，抽到就是它</small>
                  </span>
                  <span className="ability-radio" />
                </button>
              </div>
              <label className="field-label ability-custom">
                自定义能力（选填）
                <input
                  maxLength={40}
                  autoComplete="off"
                  value={customAbility}
                  onChange={(event) => {
                    setCustomAbility(event.target.value);
                    setAbilityId(event.target.value.trim() ? "custom" : "");
                  }}
                  placeholder="也可以写一个只属于你的能力"
                />
              </label>
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
          {step === 7 && (
            <>
              <div className="forge-section-heading">
                <div>
                  <h2 tabIndex={-1}>故事从这里开始。</h2>
                </div>
              </div>
              <div className="opening-preview">
                <div className="opening-art"><WorldArtwork genreId={world.id} eager /></div>
                <h3>{world.name}</h3>
                <p>{previewText}</p>
                <div className="opening-starmap">
                  <StoryMapMini total={totalChaptersFor({ config: draft })} generated={0} current={0} state={null} />
                </div>
                <div className="length-picker" role="group" aria-label="篇幅">
                  <span className="field-label">篇幅</span>
                  <div className="stage-chips">
                    <button
                      type="button"
                      className={`stage-chip ${draft.storyLengthMode !== "long" ? "selected" : ""}`}
                      aria-pressed={draft.storyLengthMode !== "long"}
                      onClick={() => set({ storyLengthMode: "season" })}
                    >
                      一季 · 24 章
                    </button>
                    <button
                      type="button"
                      className={`stage-chip ${draft.storyLengthMode === "long" ? "selected" : ""}`}
                      aria-pressed={draft.storyLengthMode === "long"}
                      onClick={() => set({ storyLengthMode: "long" })}
                    >
                      长线 · 100 章
                    </button>
                  </div>
                  <p className="field-hint">{draft.storyLengthMode === "long"
                    ? "一百章长线：分 4 弧推进，每弧末尾有大节点，适合慢慢养一个世界。"
                    : "二十四章一季：分 4 幕，幕末小升格、季终大升格；读完一季可以开启下一季。"}</p>
                </div>
                <div className="opening-details" aria-label="确认故事设定">
                  {isCustom ? (
                    <button disabled={busy} onClick={() => setStep(2)} aria-label="修改创世设定"><span>创世</span><b>{template ? template.fullName : "完全自由"} · {world.name}</b><Icon name="chevron" size={15} /></button>
                  ) : (
                    <>
                      <button disabled={busy} onClick={() => setStep(1)} aria-label="修改题材"><span>题材</span><b>{template ? template.fullName : "完全自由"}</b><Icon name="chevron" size={15} /></button>
                      <button disabled={busy} onClick={() => setStep(2)} aria-label="修改世界"><span>世界</span><b>{world.name}</b><Icon name="chevron" size={15} /></button>
                    </>
                  )}
                  <button disabled={busy} onClick={() => setStep(3)} aria-label="修改身份"><span>身份</span><b>{identity ? (localIdentityTitle(spawnGenre, identity.id) !== identity.name ? `${identity.name} · ${localIdentityTitle(spawnGenre, identity.id)}` : identity.name) : (draft.origin || "未定")}</b><Icon name="chevron" size={15} /></button>
                  <button disabled={busy} onClick={() => setStep(4)} aria-label="修改出生点"><span>出生点</span><b>{spawn ? spawn.name : "由设定决定"}</b><Icon name="chevron" size={15} /></button>
                  <button disabled={busy} onClick={() => setStep(5)} aria-label="修改主角设定"><span>主角</span><b>{draft.name || "未命名旅人"}</b><Icon name="chevron" size={15} /></button>
                  <button disabled={busy} onClick={() => setStep(6)} aria-label="修改能力与风格"><span>能力</span><b>{(abilityName || "未定")} · {tone.name}</b><Icon name="chevron" size={15} /></button>
                  <div className="opening-detail-static"><span>篇幅</span><b>{draft.storyLengthMode === "long" ? "长线 · 100 章" : "一季 · 24 章"}</b></div>
                </div>
              </div>
              <GenerationMode provider={provider} value={engine} onChange={setMode} disabled={busy} />
            </>
          )}
          {
            <div className="forge-actions">
              {step > 1 && (
                <button className="back-button" onClick={back} disabled={busy}>
                  <Icon name="chevron" size={15} className="rotate-180" />
                  上一步
                </button>
              )}
              <div className="forge-actions-right">
                {step < 7 ? (
                  <Button icon="arrow" onClick={next}>
                    继续
                  </Button>
                ) : (
                  <Button icon={busy ? undefined : "arrow"} onClick={submit} disabled={busy}>
                    {busy ? "正在翻开…" : "进入第一章"}
                  </Button>
                )}
              </div>
            </div>
          }
          <div className="generation-feedback" role="status" aria-live="polite">{busy ? "第一章准备好后，即可开始阅读。" : error}</div>
          {busy && <GenerationOverlay kind="story" onCancel={() => { operation.current?.abort(); operation.current = null; setBusy(false); }} />}
        </main>
        <PreviewPanel
          world={world}
          template={template}
          draft={draft}
          ability={abilityPick}
          tone={tone}
          spawn={spawn}
          onJump={(value) => { if (!busy) setStep(value); }}
        />
      </div>
    </div>
  );
}

function ShareSheet({ story, onClose, onPublish, authClient, authSignal = "" }) {
  const preview = useMemo(() => publicSnapshot(story), [story]);
  const [reviewed, setReviewed] = useState(false);
  const requiresReview = story.engine === "gemini";
  return (
    <ReadingDialog title="分享预览" onClose={onClose}>
      <p>
        {requiresReview ? "仅保存在本机书城。已替换设定中的原始资料，但正文仍可能含有可识别的线索，请逐章检查。" : "匿名只读副本，仅保存在本机书城，不会上传。姓名与现实资料已移除。"}
      </p>
      <div className="sw-share-preview">
        <span className="share-cover"><StoryCover story={story} genreId={genreOf(story).id} sources={coverSources(story)} getAccessToken={() => authClient.getAccessToken()} authSignal={authSignal} /></span>
        <div>
          <b>{preview.title}</b>
          <small>
            {preview.chapters.length} 章 · 只读
          </small>
        </div>
        <Icon name="lock" size={15} />
      </div>
      {requiresReview && <>
        <div className="share-prose-preview">{preview.chapters.map((chapter) => <details key={chapter.id}>
          <summary>{chapter.title}</summary>
          {chapter.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          {chapter.summary && <p>章节摘要：{chapter.summary}</p>}
          {chapter.choice && <div>
            <p>{chapter.choice.prompt}</p>
            {chapter.choice.options.map((option) => <p key={option.id}>{option.label} · {option.detail} · {option.consequence}</p>)}
          </div>}
        </details>)}</div>
        <label className="share-review"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />我已检查正文，可保存此副本</label>
      </>}
      <div className="reading-dialog-actions">
        <Button icon="arrow" onClick={() => onPublish(story)} disabled={requiresReview && !reviewed}>
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
  const titleId = useId();
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
      aria-labelledby={titleId}
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
      <div className="sheet-grabber" aria-hidden="true" />
      <div className="reading-dialog-heading">
        <h2 id={titleId}>{title}</h2>
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
  const total = totalChaptersFor(story);
  const last = lastAccessibleIndex(story, readOnly);
  return (
    <ReadingDialog title="章节目录" onClose={onClose}>
      <p>{story.title}</p>
      <div className="directory-starmap">
        <b>剧情星图</b>
        <StoryMap
          total={total}
          generated={story.chapters?.length || 0}
          current={index}
          onSelect={onSelect}
        />
      </div>
      <div className="chapter-directory-list">
        {Array.from({ length: total }, (_, chapterIndex) => {
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
  backRoute = null,
  backText = "",
  onNavigate,
  onUpdateStory,
  onToggleBookmark,
  onPublish,
  openShare = false,
  onShareOpened,
  unsaved = false,
  onPrepareChapter,
  onStartNextSeason,
  authClient,
  onRerollCover,
  authSignal = "",
}) {
  const [snapshotIndex, setSnapshotIndex] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  // The floating topline card must never sit half over a line of prose:
  // while the reader scrolls down it slides away, and it comes back on
  // the first upward scroll or near the top — the same hide the focus
  // mode applies, driven by scroll direction instead of a toggle. The
  // flag is written straight to the DOM, not React state: a scroll
  // listener must never re-render the reader mid-gesture (it would swap
  // DOM nodes under the reader's own taps).
  useEffect(() => {
    const root = readerRef.current;
    if (!root) return undefined;
    let lastY = window.scrollY;
    const apply = (hidden) => { root.dataset.toplineHidden = hidden ? "true" : "false"; };
    apply(false);
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      lastY = y;
      // A single leap is a programmatic jump (position restore, anchor or
      // search jump), never a reading gesture: the chrome stays for it.
      if (Math.abs(delta) > 240) { apply(false); return; }
      if (y < 80) apply(false);
      else if (delta > 4) apply(true);
      else if (delta < -4) apply(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [story.id]);
  const [bookmarkVersion, setBookmarkVersion] = useState(0);
  const bookmarkAnchor = useRef(null);
  const requestedLocation = useRef(null);
  const [preferencesStore] = useState(() => createReadingPreferencesStore());
  const preferences = useSyncExternalStore(preferencesStore.subscribe, preferencesStore.getSnapshot);
  const [rewriteMode, setRewriteMode] = useState(false);
  const [pendingChoice, setPendingChoice] = useState(null);
  const [error, setError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [retry, setRetry] = useState(0);
  const requesting = useRef(false);
  const titleRef = useRef(null);
  const readerRef = useRef(null);
  const index = readOnly
    ? readerIndexFor({ ...story, readerIndex: snapshotIndex }, true)
    : readerIndexFor(story);
  const readingChapters = useMemo(() => story?.chapters.map((_, i) => chapterForReading(story, i)) || [], [story]);
  const chapter = story ? (readingChapters[index] || buildChapter(story, index)) : null;
  const coverState = coverStateOf(story);
  const chapterMetrics = useMemo(() => estimateReadingMetrics(chapter?.paragraphs || []), [chapter]);
  const locationKey = story && chapterLocationKey(story.id, index, chapter.paragraphs, readOnly);
  const reading = useReaderExperience({ readerRef, locationKey, settings: preferences.settings,
    blocked: preferencesOpen || toolsOpen || directoryOpen || shareOpen || Boolean(pendingChoice) });
  const bookContextId = `${readOnly ? 'public' : 'private'}:${story?.id}`;
  const bookmarkKeys = readingChapters.map((item, i) => chapterLocationKey(story.id, i, item?.paragraphs || [], readOnly));
  const bookmarks = useMemo(() => reading.store.bookmarks(bookContextId, bookmarkKeys), [bookContextId, story, bookmarkVersion, toolsOpen, reading.store]);
  const changePreferences = (patch, options) => { reading.preserve(); preferencesStore.update(patch, options); };
  useSceneMotion(
    readerRef,
    `${story?.id}:${index}`,
    ".reader-article h1",
    { quiet: true },
  );

  useEffect(() => {
    setSnapshotIndex(0);
    setShareOpen(false);
    setCoverOpen(false);
    setDirectoryOpen(false);
    setToolsOpen(false);
    if (readerRef.current) readerRef.current.dataset.toplineHidden = "false";
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

  const pendingIndex = readOnly ? null : nextGenerationIndex(story, index);
  useEffect(() => {
    if (pendingIndex === null || !onPrepareChapter) { requesting.current = false; setPreparing(false); setGenerationError(""); return; }
    const controller = new AbortController();
    requesting.current = true;
    setPreparing(true);
    setGenerationError("");
    onPrepareChapter(story.id, pendingIndex, controller.signal)
      .catch((failure) => { if (!controller.signal.aborted) setGenerationError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) { requesting.current = false; setPreparing(false); } });
    return () => { controller.abort(); requesting.current = false; };
  }, [story?.id, story?.revision, pendingIndex, retry, onPrepareChapter]);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [story?.id, index]);

  useEffect(() => {
    if (!requestedLocation.current || requestedLocation.current.index !== index) return;
    const destination = requestedLocation.current;
    const frame = requestAnimationFrame(() => { reading.jump(destination.anchor); requestedLocation.current = null; });
    return () => cancelAnimationFrame(frame);
  }, [index, toolsOpen, reading.jump]);

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
  if (story.engine === "gemini" && !story.chapters[index]) return (
    <div className="page sw-empty-page">
      <h1>故事还在这里。</h1><p role="status">{generationError || "正在接回这一章…"}</p>
      <Button disabled={preparing} onClick={() => setRetry((value) => value + 1)}>重试</Button>
      <Button variant="ghost" onClick={() => onNavigate("home")}>返回书架</Button>
    </div>
  );
  const selected = selectedChoice(story, index);
  const selection = chapter.choice?.options.find(
    (option) => option.id === selected,
  );
  const ready = selected || !chapter.choice;
  const total = totalChaptersFor(story);
  const lengthMode = storyLengthModeOf(story);
  const nextAvailable = index < lastAccessibleIndex(story, readOnly);
  const isFinal = index >= total - 1;
  const progress = `${Math.round(((index + 1) / total) * 100)}%`;
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
    if (story.engine === "gemini") {
      if (nextAvailable) goToChapter(index + 1);
      else if (!requesting.current) {
        requesting.current = true;
        setPreparing(true);
        setGenerationError("");
        setRetry((value) => value + 1);
      }
      return;
    }
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
  const selectLocation = (target, anchor) => {
    requestedLocation.current = { index: target, anchor };
    setToolsOpen(false);
    if (target === index) reading.jump(anchor);
    else goToChapter(target);
  };
  const openTools = () => { bookmarkAnchor.current = reading.capture(); setToolsOpen(true); };
  const togglePositionBookmark = () => {
    const anchor = bookmarkAnchor.current || { paragraph: 0, offset: 0 };
    reading.store.toggleBookmark({ key: locationKey, storyId: bookContextId, chapterIndex: index,
      anchor, title: chapter.title, excerpt: chapter.paragraphs[anchor.paragraph] || '' });
    setBookmarkVersion(value => value + 1);
  };

  return (
    <div ref={readerRef} className="page page-reader page-enter" data-reader-focused={focused ? 'true' : 'false'} {...getReaderAppearance(preferences.settings, { inputMethod: preferences.inputMethod })}>
      <div className="reader-topline">
        <button
          className="back-link"
          onClick={() => backRoute ? onNavigate(backRoute.view, { id: backRoute.id }) : onNavigate(readOnly ? "store" : "home")}
        >
          <Icon name="chevron" size={15} className="rotate-180" />
          {backText || (readOnly ? "返回书城" : "我的世界")}
        </button>
        <div className="reader-chapter">
          <span className="reader-book-title">{story.title}</span>
          <span className="reader-position">第 {index + 1} 章</span>
          <div
            className="chapter-progress"
            role="progressbar"
            aria-label="阅读进度"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={index + 1}
            aria-valuetext={`第 ${index + 1} 章，共 ${total} 章`}
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
              className="reader-directory-button"
              onClick={() => setCoverOpen(true)}
              aria-haspopup="dialog"
            >
              <Icon name="image" size={16} />
              封面
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
          <div className="reader-prose" lang="zh-CN">
          <p className="article-lede" data-reading-paragraph="0">{chapter.paragraphs[0]}</p>
          <div className="article-body">
            {chapter.paragraphs.slice(1).map((paragraph, paragraphIndex) => (
              <p data-reading-paragraph={paragraphIndex + 1} key={`${chapter.id}-${paragraphIndex}`}>{paragraph}</p>
            ))}
          </div>
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
          <div className="reader-starmap">
            <div className="reader-starmap-head">
              <b>剧情星图</b>
              <span>第 {index + 1} / {total} 章</span>
            </div>
            <StoryMapMini
              total={total}
              generated={story.chapters?.length || 0}
              current={index}
              state={readOnly ? null : generationState({ total, generated: story.chapters?.length || 0, current: index, engine: story.engine, preparing, complete: story.status === "complete" || isStoryComplete(story) })}
            />
          </div>
          {!isFinal && (!readOnly || nextAvailable) && (
            <div className="sw-next-action">              <Button
                icon="arrow"
                onClick={handleNext}
                disabled={!readOnly && (!ready || (preparing && !nextAvailable))}
              >
                {preparing && !nextAvailable ? "下一章准备中…" : generationError && !nextAvailable ? "重试下一章" : "下一章"}
              </Button>
              {!readOnly && !ready && <span>做出选择后继续</span>}
              {generationError && <span role="alert">{generationError}</span>}
            </div>
          )}
          {(isFinal || (readOnly && !nextAvailable)) && (
            <section className="reading-end">
              <h2>
                {isFinal
                  ? lengthMode === "season"
                    ? "这一季，读完了。"
                    : lengthMode === "long"
                      ? "这部长线，读完了。"
                      : "这一卷，读完了。"
                  : "已读完分享章节"}
              </h2>
              {isFinal && !readOnly && lengthMode === "season" ? (
                <>
                  <p>标尺已经抬高一格：下一季的对手、价码和要守的东西，都会比这一季更重。</p>
                  <Button icon="spark" onClick={() => onStartNextSeason?.(story)}>
                    开启下一季
                  </Button>
                  <button onClick={() => onNavigate("merge")}>
                    开启合流本
                  </button>
                  <button onClick={() => onNavigate("forge")}>
                    再开一本
                  </button>
                </>
              ) : (
                <>
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
                </>
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
              <span role="status">{unsaved ? "进度暂存于此页，请先备份" : "进度已保存在本机"}</span>
            </div>
          )}
        </article>
      </div>
      <div className="reader-floating-dock" role="region" aria-label="阅读工具栏">
        <div className="reader-live-progress">
          <span>第 {index + 1} 章{chapterMetrics.charCount ? ` · 约 ${chapterMetrics.charCount} 字` : ""}</span>
          <span>本章 {reading.progress}%</span>
        </div>
        {focused ? <button type="button" className="reader-focus-exit" onClick={() => setFocused(false)}>退出专注阅读</button> :
          <div className="reader-dock-actions">
            <button type="button" onClick={() => setDirectoryOpen(true)} aria-haspopup="dialog"><Icon name="menu" size={19}/><span>目录</span></button>
            <button type="button" className="reader-dock-settings" aria-label="阅读设置" aria-haspopup="dialog" onClick={() => setPreferencesOpen(true)}><b aria-hidden="true">Aa</b><span>设置</span></button>
            <button type="button" onClick={openTools} aria-haspopup="dialog"><Icon name="search" size={19}/><span>查找</span></button>
            <button type="button" onClick={() => setFocused(true)}><Icon name="book" size={19}/><span>专注</span></button>
          </div>}
        {preferences.settings.readingMode === 'page' && <div className="reader-page-controls" role="group" aria-label="逐屏阅读">
          <button type="button" onClick={() => reading.pageBy(-1)}><Icon name="chevron" className="rotate-180" size={17}/>上一屏</button>
          <button type="button" onClick={() => reading.pageBy(1)}>下一屏<Icon name="chevron" size={17}/></button>
        </div>}
      </div>
      {reading.warning && <p className="reader-location-warning" role="status">{reading.warning}</p>}
      {preferencesOpen && <ReadingDialog title="阅读设置" onClose={() => setPreferencesOpen(false)}>
        <ReadingPreferences value={preferences.settings} onChange={changePreferences} storageWarning={preferences.storageWarning}/>
        {reading.wakeStatus && <p className="reading-tools-status" role="status">{reading.wakeStatus}</p>}
      </ReadingDialog>}
      {toolsOpen && <ReadingDialog title="查找与书签" onClose={() => setToolsOpen(false)}>
        <ReadingTools chapters={readingChapters} lastAccessible={lastAccessibleIndex(story, readOnly)} bookmarks={bookmarks}
          story={story} currentChapterIndex={index}
          onSelect={selectLocation} onBookmark={togglePositionBookmark} warning={reading.store.warning()}
          onRemove={item => { reading.store.removeBookmark(item.key, item.anchor.paragraph); setBookmarkVersion(value => value + 1); }}/>
      </ReadingDialog>}
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
      {coverOpen && !readOnly && (
        <ReadingDialog title="本书封面" onClose={() => setCoverOpen(false)}>
          <div className="cover-dialog-detail">
            <span className="cover-dialog-frame">
              <StoryCover story={story} genreId={genreOf(story).id} sources={coverSources(story)} getAccessToken={() => authClient.getAccessToken()} authSignal={authSignal} />
            </span>
            <div className="cover-dialog-copy">
              <b>{story.title}</b>
              <p>
                {coverState.status === "ready" && "这是按这本书的世界设定生成的专属封面。"}
                {coverState.status === "pending" && "专属封面生成中，好了会自动换上；现在先用世界封面。"}
                {coverState.status === "failed" && "上次生成没成功，暂时用的是世界封面，可以再试一次。"}
                {coverState.status === "none" && "还没有专属封面，现在用的是世界封面。"}
              </p>
            </div>
          </div>
          <div className="reading-dialog-actions">
            <Button
              icon="image"
              onClick={() => onRerollCover?.(story)}
              disabled={coverState.status === "pending"}
            >
              {coverState.status === "pending"
                ? "正在生成…"
                : coverState.status === "ready"
                  ? "换一张封面"
                  : "生成专属封面"}
            </Button>
            <Button variant="ghost" onClick={() => setCoverOpen(false)}>
              关闭
            </Button>
          </div>
          <p className="cover-dialog-note">封面按这本书自己的世界背景生成，不带文字；每天最多生成 5 张，自动生成与手动更换共用。</p>
        </ReadingDialog>
      )}
      {shareOpen && (
        <ShareSheet
          story={story}
          authClient={authClient}
          authSignal={authSignal}
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

function StoreRanking({ books, onOpenBook }) {
  const [tab, setTab] = useState("recommend");
  const recommended = rankStoreBooks(books).slice(0, 6);
  const completed = rankStoreBooks(books, { completeOnly: true }).slice(0, 6);
  if (recommended.length === 0) return null;
  const hasCompleted = completed.length > 0;
  const activeTab = tab === "complete" && hasCompleted ? "complete" : "recommend";
  const entries = activeTab === "complete" ? completed : recommended;
  return (
    <section className="rank-card" aria-label="书城排行榜">
      <div className="rank-tabs" role="group" aria-label="榜单切换">
        <button
          type="button"
          className={activeTab === "recommend" ? "active" : ""}
          aria-pressed={activeTab === "recommend"}
          onClick={() => setTab("recommend")}
        >
          推荐榜
        </button>
        {hasCompleted && (
          <button
            type="button"
            className={activeTab === "complete" ? "active" : ""}
            aria-pressed={activeTab === "complete"}
            onClick={() => setTab("complete")}
          >
            完本榜
          </button>
        )}
      </div>
      <ol className="rank-list">
        {entries.map((book, index) => (
          <li key={book.id}>
            <button
              type="button"
              className="rank-row"
              onClick={() => onOpenBook(book.snapshot)}
            >
              <span className={`rank-num ${index === 0 ? "gold" : ""}`}>{index + 1}</span>
              <span className="rank-cover">
                <WorldArtwork genreId={genreOf(book.snapshot).id} sources={coverSources(book.snapshot)} />
              </span>
              <span className="rank-copy">
                <span className="rank-title">{book.title}</span>
                <span className="rank-meta">
                  <span className="rank-cat">{book.category}</span>
                  <span className="rank-rest"> · {rankMetaFor(book)}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Store({ onNavigate, onOpenBook, onOpenOwn, publications }) {
  const [filter, setFilter] = useState("全部");
  const filters = ["全部", "奇幻", "修仙", "赛博", "都市", "合流章"];
  const published = (publications || []).filter((item) => item.snapshot?.chapters?.length).map((item) => {
    const snapshot = item.snapshot || {};
    const status =
      snapshot.status ||
      (snapshot.chapters?.length >= totalChaptersFor(snapshot) ? "complete" : "ongoing");
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

      {filter === "全部" && (
        <StoreRanking books={books} onOpenBook={onOpenBook} />
      )}

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
                <WorldArtwork genreId={genreOf(book.snapshot).id} sources={coverSources(book.snapshot)} />
                <span className="cover-badge">{book.type}</span>
                <div className="book-cover-copy">
                  <b>{book.title}</b>
                  <span className="book-cover-info">{coverInfoFor(book.snapshot)}</span>
                </div>
              </div>
              <div className="book-card-copy">
                <span className="book-card-cat">{book.category}</span>
                <span className="book-card-rest">{book.author} · {book.sourceLabel}</span>
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

function PlazaAvatarThumb({ publication, large = false }) {
  const [failed, setFailed] = useState(false);
  const name = publication?.avatar?.name || "化身";
  if (!publication?.avatar?.hasPortrait || failed) {
    return (
      <span className={`plaza-avatar-fallback ${large ? "is-large" : ""}`} aria-hidden="true">
        {name.slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      className={`plaza-avatar-img ${large ? "is-large" : ""}`}
      src={plazaPortraitPath(publication.id)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function PlazaCard({ publication, own, onOpen, onRead, onEnter }) {
  const genre = genreById[publication.genreId] || GENRES[0];
  const templateName = plazaTemplateNameFor(publication) || genre.label;
  return (
    <article className="plaza-card">
      <button
        type="button"
        className="plaza-card-cover"
        onClick={onOpen}
        aria-label={`查看《${publication.title}》详情`}
      >
        <WorldArtwork genreId={genre.id} />
        <span className="plaza-cover-shade" aria-hidden="true" />
        <span className="plaza-cover-title">《{publication.title}》</span>
      </button>
      <div className="plaza-card-body">
        <div className="plaza-avatar-row">
          <PlazaAvatarThumb publication={publication} />
          <span className="plaza-avatar-name">{publication.avatar?.name}</span>
          <span className="plaza-author">作者 · {publication.authorName}</span>
          {own && <span className="plaza-own-chip">我发布的</span>}
        </div>
        <div className="plaza-chips">
          <span className="plaza-chip">{publication.worldName}</span>
          <span className="plaza-chip-x" aria-hidden="true">×</span>
          <span className="plaza-chip">{templateName}</span>
        </div>
        <div className="plaza-meta">
          <span className="plaza-badge">已完结</span>
          <span>{plazaLengthLabel(publication)}</span>
        </div>
        <div className="plaza-card-actions">
          <Button onClick={onRead}>读原作线</Button>
          <Button variant="secondary" onClick={onEnter}>带化身进入</Button>
        </div>
      </div>
    </article>
  );
}

function PlazaFeed({ account, activeStory, onNavigate, onOpenStory, onOpenDetail, onReadLine, onEnter }) {
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const mineIds = useMemo(() => plazaMineIds(), []);
  useEffect(() => {
    let live = true;
    setError("");
    fetchPlazaFeed()
      .then((items) => { if (live) setFeed(items); })
      .catch(() => { if (live) { setFeed([]); setError("广场暂时没能打开，请稍后再试。"); } });
    return () => { live = false; };
  }, [retry]);
  const activeTotal = activeStory ? totalChaptersFor(activeStory) : 0;
  const activeChapter = activeStory ? Math.min(activeTotal, readerIndexFor(activeStory) + 1) : 0;
  return (
    <div className="page page-plaza page-enter">
      <header className="plaza-heading">
        <h1>广场</h1>
      </header>
      <p className="page-caption">别人走完的世界，正等你走进去。</p>

      <section className="plaza-publish-card">
        <div>
          <strong>把你走完的故事线放到广场</strong>
          <p>发布后，别人能读你的原作线，也能带自己的化身进入这个世界。</p>
        </div>
        <Button onClick={() => onNavigate("plaza-publish")}>发布 <Icon name="arrow" size={15} /></Button>
      </section>

      <button type="button" className="plaza-mine-row" onClick={() => onNavigate("home")}>
        <Icon name="book" size={20} />
        <span>
          <strong>我的世界</strong>
          <small>{activeStory ? `正在读《${activeStory.title}》 · 第 ${activeChapter} / ${activeTotal} 章` : "你的书架、化身与草稿都在这里"}</small>
        </span>
        <Icon name="chevron" size={16} />
      </button>

      <div className="plaza-feed-heading">
        <h2>最新发布</h2>
        <span>只收已完结的故事线</span>
      </div>

      {error && (
        <div className="plaza-empty" role="alert">
          <p>{error}</p>
          <Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>再试一次</Button>
        </div>
      )}
      {feed === null && !error && <p className="plaza-loading" role="status">正在打开广场…</p>}
      {feed !== null && feed.length === 0 && !error && (
        <div className="plaza-empty" role="status">
          <Icon name="book" size={27} />
          <h3>还没有人发布走完的故事线</h3>
          <p>第一条线，往往是自己的。用化身走完一季，它就会出现在这里。</p>
          <Button variant="secondary" icon="arrow" onClick={() => onNavigate("forge")}>去造世</Button>
        </div>
      )}
      {feed !== null && feed.length > 0 && (
        <div className="plaza-feed-list">
          {feed.map((publication) => (
            <PlazaCard
              key={publication.id}
              publication={publication}
              own={mineIds.has(publication.id)}
              onOpen={() => onOpenDetail(publication)}
              onRead={() => onReadLine(publication)}
              onEnter={() => onEnter(publication)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlazaDetail({ id, account, authClient, onNavigate, onReadLine, onEnter, onOpenAccount, onToast }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const own = useMemo(() => plazaMineIds().has(id), [id]);
  useEffect(() => {
    let live = true;
    setDetail(null);
    setError("");
    fetchPlazaDetail({ id })
      .then((next) => { if (live) setDetail(next); })
      .catch((failure) => {
        if (live) setError(failure?.code === "not-found" ? "这条故事线已下架或不存在。" : "暂时没能打开这条故事线，请稍后再试。");
      });
    return () => { live = false; };
  }, [id]);

  if (error) {
    return (
      <div className="page page-plaza page-enter">
        <button type="button" className="back-link" onClick={() => onNavigate("plaza")}>
          <Icon name="chevron" size={15} className="rotate-180" /> 返回广场
        </button>
        <div className="plaza-empty" role="alert">
          <h3>{error}</h3>
          <Button variant="secondary" onClick={() => onNavigate("plaza")}>回到广场</Button>
        </div>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="page page-plaza page-enter">
        <button type="button" className="back-link" onClick={() => onNavigate("plaza")}>
          <Icon name="chevron" size={15} className="rotate-180" /> 返回广场
        </button>
        <p className="plaza-loading" role="status">正在打开这条故事线…</p>
      </div>
    );
  }
  const genre = genreById[detail.genreId] || GENRES[0];
  const templateName = plazaTemplateNameFor(detail) || genre.label;
  const beats = Array.isArray(detail.beats) ? detail.beats : [];
  const report = async () => {
    if (!account.user) { onOpenAccount(); return; }
    setBusy(true);
    try {
      await reportPublication({ id, getAccessToken: () => authClient.getAccessToken() });
      setNote("已举报，谢谢。举报累计到三人，这条故事线会自动隐藏等待核查。");
    } catch (failure) {
      if (failure?.code === "auth-required") onOpenAccount();
      else setNote(failure?.message || "举报没能送出，请稍后再试。");
    } finally { setBusy(false); }
  };
  const withdraw = async () => {
    setBusy(true);
    try {
      await withdrawPublication({ id, getAccessToken: () => authClient.getAccessToken() });
      plazaMineForget(undefined, id);
      onToast("已下架，广场上不再显示这条故事线。");
      onNavigate("plaza");
    } catch {
      setNote("下架没能完成，请稍后再试。");
      setBusy(false);
    }
  };
  return (
    <div className="page page-plaza page-enter">
      <div className="plaza-detail-top">
        <button type="button" className="back-link" onClick={() => onNavigate("plaza")}>
          <Icon name="chevron" size={15} className="rotate-180" /> 返回广场
        </button>
        <span className="plaza-author">作者 · {detail.authorName}</span>
      </div>

      <section className="plaza-detail-cover">
        <WorldArtwork genreId={genre.id} />
        <span className="plaza-cover-shade" aria-hidden="true" />
        <div className="plaza-detail-cover-copy">
          <h1>《{detail.title}》</h1>
          <p>{detail.worldName} × {templateName} · {plazaLengthLabel(detail)} · 已完结</p>
        </div>
      </section>

      <section className="plaza-panel plaza-avatar-panel">
        <PlazaAvatarThumb publication={detail} large />
        <div>
          <div className="plaza-avatar-name-row">
            <strong>{detail.avatar?.name}</strong>
            <span className="plaza-chip">作者的化身</span>
          </div>
          <p>这条线，是这个化身一步步走完的。</p>
          {detail.avatar?.appearance && <small>化身设定：{detail.avatar.appearance}</small>}
        </div>
      </section>

      <section className="plaza-panel">
        <div className="plaza-panel-heading">
          <h2>世界设定</h2>
          <span className="plaza-chip is-mint">脱敏版</span>
        </div>
        <p className="plaza-prose">{detail.worldBible?.premise}</p>
        <small className="plaza-note">发布时已脱敏：作者的私有设定与未公开分支不会出现在这里。</small>
      </section>

      <section className="plaza-panel">
        <div className="plaza-panel-heading">
          <h2>主线节拍</h2>
        </div>
        <p className="plaza-note">进入重演时，你的新线会沿用这套骨架，走向由你的选择分叉。</p>
        <ol className="plaza-beats">
          {beats.slice(0, 4).map((beat) => (
            <li key={beat.chapter}>
              <span className="plaza-beat-dot" aria-hidden="true" />
              <span>第 {beat.chapter} 章</span>
              <strong>{beat.title}</strong>
            </li>
          ))}
        </ol>
        {beats.length > 4 && <small className="plaza-note">其余 {beats.length - 4} 章节拍，进入后逐步展开</small>}
      </section>

      <section className="plaza-panel plaza-cta-panel">
        <h2>你想怎样走这条线？</h2>
        <Button className="plaza-cta-main" onClick={() => onReadLine(detail)}>读原作线</Button>
        <p className="plaza-note">读作者化身走完的版本 · 不消耗你的生成额度</p>
        <Button variant="secondary" className="plaza-cta-main" onClick={() => onEnter(detail)}>带我的化身进入</Button>
        <p className="plaza-note">同一世界、同步节拍，捞出一条只属于你的新线</p>
        <p className="plaza-fee-note"><span aria-hidden="true">●</span> 进入重演后，新章节的生成费用计入你自己的额度。</p>
      </section>

      {note && <p className="plaza-inline-note" role="status">{note}</p>}
      {own ? (
        <div className="plaza-owner-row">
          {confirmingWithdraw ? (
            <>
              <span>下架后广场不再显示，本地原作不受影响。</span>
              <Button variant="secondary" disabled={busy} onClick={() => void withdraw()}>确认下架</Button>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirmingWithdraw(false)}>再想想</Button>
            </>
          ) : (
            <>
              <span>这是你发布的故事线。</span>
              <Button variant="ghost" onClick={() => setConfirmingWithdraw(true)}>下架</Button>
            </>
          )}
        </div>
      ) : (
        <button type="button" className="plaza-report" disabled={busy} onClick={() => void report()}>
          内容有问题？举报这条故事线
        </button>
      )}
    </div>
  );
}

function PlazaPublish({ stories, avatar, avatarLoaded, account, authClient, onNavigate, onOpenAccount, onOpenAvatar, onToast }) {
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mine = useMemo(() => plazaMine(), []);
  const rows = useMemo(() => {
    const decorated = stories.map((story) => ({ story, gate: plazaGateFor(story) }));
    return decorated.sort((a, b) => Number(b.gate.publishable) - Number(a.gate.publishable));
  }, [stories]);
  const selected = rows.find((row) => row.story.id === selectedId && row.gate.publishable)?.story || null;
  const publish = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      const publication = await publishToPlaza({ story: selected, getAccessToken: () => authClient.getAccessToken() });
      plazaMineRemember(undefined, selected.id, publication);
      onToast("已发布到广场。");
      onNavigate("plaza");
    } catch (failure) {
      if (failure?.code === "auth-required") { onOpenAccount(); setError("请先登录，再发布。"); }
      else setError(failure?.message || "发布没能完成，请稍后再试。");
      setBusy(false);
    }
  };
  return (
    <div className="page page-plaza page-enter">
      <button type="button" className="back-link" onClick={() => onNavigate("plaza")}>
        <Icon name="chevron" size={15} className="rotate-180" /> 返回
      </button>
      <header className="plaza-heading">
        <h1>发布到广场</h1>
      </header>
      <p className="page-caption">把一条走完的故事线放上广场。发布后，其他人能读你的原作线，也能带自己的化身进入这个世界重演一条新线。</p>

      {!account.user ? (
        <div className="plaza-empty" role="status">
          <h3>先登录，再发布你的故事线</h3>
          <p>发布会记在你的账号名下，别人举报时也由你下架处理。</p>
          <Button onClick={onOpenAccount}>登录 / 注册</Button>
        </div>
      ) : avatarLoaded && !avatar ? (
        <div className="plaza-empty" role="status">
          <h3>先有化身，才能发布它的故事线</h3>
          <p>广场上的每条线，都是某个化身走完的旅程。</p>
          <Button onClick={onOpenAvatar}>创建我的化身</Button>
        </div>
      ) : (
        <>
          <h2 className="plaza-section-title">选择要发布的故事线</h2>
          {rows.length === 0 && (
            <div className="plaza-empty" role="status">
              <p>你还没有故事线。先用化身走完一季，再来发布。</p>
              <Button variant="secondary" icon="arrow" onClick={() => onNavigate("forge")}>去造世</Button>
            </div>
          )}
          <div className="plaza-pick-list">
            {rows.map(({ story, gate }) => {
              const genre = genreOf(story);
              const published = Boolean(mine[story.id]);
              return (
                <button
                  type="button"
                  key={story.id}
                  className={`plaza-pick ${selectedId === story.id && gate.publishable ? "active" : ""} ${gate.publishable ? "" : "is-disabled"}`}
                  aria-pressed={selectedId === story.id && gate.publishable}
                  disabled={!gate.publishable}
                  onClick={() => setSelectedId(story.id)}
                >
                  <span className="plaza-pick-cover"><WorldArtwork genreId={genre.id} /></span>
                  <span className="plaza-pick-copy">
                    <strong>《{story.title}》</strong>
                    <span>
                      {gate.publishable
                        ? <><span className="plaza-badge">已完结</span> {plazaLengthLabel(story)}{published ? " · 已在广场上，再次发布会更新" : ""}</>
                        : <>{story.kind === "merged" ? "合流故事" : "连载中"} · {gate.reason}</>}
                    </span>
                  </span>
                  {selectedId === story.id && gate.publishable && <Icon name="check" size={18} />}
                </button>
              );
            })}
          </div>

          <section className="plaza-panel">
            <h2>将发布的内容</h2>
            <ul className="plaza-checklist">
              <li><Icon name="check" size={15} /><span><strong>世界设定（脱敏版）</strong><small>私有设定与未公开分支不会发布</small></span></li>
              <li><Icon name="check" size={15} /><span><strong>原作线全文</strong><small>你化身走完的全部章节与当时的选择</small></span></li>
              <li><Icon name="check" size={15} /><span><strong>可进入的世界模板</strong><small>主线节拍骨架，供他人带化身重演</small></span></li>
            </ul>
          </section>

          <section className="plaza-panel">
            <div className="plaza-panel-heading">
              <h2>红线自动检查</h2>
              <span className="plaza-chip is-mint">发布时由服务端执行</span>
            </div>
            <p className="plaza-note">已扫描的口径与造世相同：世界设定与全部章节都会过一遍，命中违规内容会被拒绝发布，不会留下半截记录。</p>
          </section>

          <section className="plaza-panel">
            <h2>审核与下架</h2>
            <p className="plaza-note">发布后进入广场公开列表。下架只影响广场展示，不影响你本地的原作存档，随时可以重新发布。</p>
          </section>

          {error && <div className="sw-inline-alert" role="alert">{error}</div>}
          <div className="plaza-publish-actions">
            <Button disabled={!selected || busy} onClick={() => void publish()}>{busy ? "正在发布…" : "发布到广场"}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => onNavigate("plaza")}>暂不发布</Button>
          </div>
        </>
      )}
    </div>
  );
}

function PlazaEnter({ id, account, authClient, avatar, avatarLoaded, onNavigate, onOpenAccount, onOpenAvatar, onEnterLine }) {
  const [detail, setDetail] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [identityId, setIdentityId] = useState("");
  const [spawnName, setSpawnName] = useState("");
  const [spawnHook, setSpawnHook] = useState("");
  const [abilityName, setAbilityName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const operation = useRef(null);
  useEffect(() => {
    let live = true;
    fetchPlazaDetail({ id })
      .then((next) => { if (live) setDetail(next); })
      .catch((failure) => {
        if (live) setLoadError(failure?.code === "not-found" ? "这条故事线已下架或不存在。" : "暂时没能打开这条故事线，请稍后再试。");
      });
    return () => { live = false; };
  }, [id]);
  useEffect(() => () => { operation.current?.abort(); }, []);

  const genre = detail ? genreById[detail.genreId] || GENRES[0] : null;
  const isCustom = detail?.genreId === CUSTOM_GENRE_ID;
  const abilities = useMemo(
    () => (detail ? abilityCandidatesFor({ genreId: detail.genreId, genreTemplateId: detail.genreTemplateId, custom: isCustom }) : []),
    [detail, isCustom],
  );
  useEffect(() => {
    if (abilities.length && !abilities.some((item) => item.name === abilityName)) setAbilityName(abilities[0].name);
  }, [abilities, abilityName]);
  const identity = originIdentityById(identityId);
  const points = useMemo(
    () => (identity && genre && !isCustom ? spawnPointsForIdentity(genre, identity.id) : []),
    [identity, genre, isCustom],
  );
  const pickIdentity = (nextId) => {
    setIdentityId(nextId);
    if (!isCustom && genre) {
      const first = spawnPointsForIdentity(genre, nextId)[0];
      setSpawnName(first?.name || "");
      setSpawnHook(first?.hook || "");
    }
  };
  const enter = async () => {
    if (!detail || !identityId || busy) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    try {
      await onEnterLine(detail, {
        identityId,
        startPointName: spawnName,
        startPointHook: spawnHook,
        ability: abilityName,
      }, { signal: controller.signal });
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure?.message || "进入没能完成，请稍后再试。");
    } finally {
      if (operation.current === controller) { operation.current = null; setBusy(false); }
    }
  };

  if (loadError) {
    return (
      <div className="page page-plaza page-enter">
        <button type="button" className="back-link" onClick={() => onNavigate("plaza")}>
          <Icon name="chevron" size={15} className="rotate-180" /> 返回广场
        </button>
        <div className="plaza-empty" role="alert">
          <h3>{loadError}</h3>
          <Button variant="secondary" onClick={() => onNavigate("plaza")}>回到广场</Button>
        </div>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="page page-plaza page-enter">
        <p className="plaza-loading" role="status">正在准备这个世界…</p>
      </div>
    );
  }
  return (
    <div className="page page-plaza page-enter">
      <button type="button" className="back-link" disabled={busy} onClick={() => onNavigate("plaza-detail", { id })}>
        <Icon name="chevron" size={15} className="rotate-180" /> 返回详情
      </button>
      <header className="plaza-heading">
        <h1>带化身进入</h1>
      </header>
      <p className="page-caption">《{detail.title}》 · {detail.worldName} × {plazaTemplateNameFor(detail) || genre.label} · {plazaLengthLabel(detail)}</p>

      {!account.user ? (
        <div className="plaza-empty" role="status">
          <h3>先登录，再带化身进入</h3>
          <p>重演出的新线会记在你的账号名下，生成费用也计入你的额度。</p>
          <Button onClick={onOpenAccount}>登录 / 注册</Button>
        </div>
      ) : avatarLoaded && !avatar ? (
        <div className="plaza-empty" role="status">
          <h3>还没有你自己的化身</h3>
          <p>进入别人的世界，走的必须是属于你的那个人。</p>
          <Button onClick={onOpenAvatar}>创建我的化身</Button>
        </div>
      ) : (
        <>
          <section className="plaza-panel plaza-avatar-panel">
            <AvatarPortrait avatar={avatar} getAccessToken={() => authClient.getAccessToken()} />
            <div>
              <div className="plaza-avatar-name-row">
                <strong>{avatar.name}</strong>
                <span className="plaza-chip">你的化身</span>
              </div>
              <small>{avatarAppearanceText(avatar.appearance)}</small>
            </div>
          </section>

          <div className="form-block">
            <span className="field-label">在这个世界里，TA是谁？</span>
            <div className="chip-grid" role="group" aria-label="身份">
              {ORIGIN_IDENTITIES.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`choice-chip ${identityId === item.id ? "active" : ""}`}
                  aria-pressed={identityId === item.id}
                  disabled={busy}
                  onClick={() => pickIdentity(item.id)}
                >
                  {isCustom ? item.name : localIdentityTitle(genre, item.id)}
                  {identityId === item.id && <Icon name="check" size={13} />}
                </button>
              ))}
            </div>
            {identity && <p className="field-hint">{identity.name} · {identity.description}</p>}
          </div>

          {identityId && (isCustom ? (
            <label className="field-label">
              出生点（选填）
              <input
                maxLength={START_POINT_NAME_MAX}
                autoComplete="off"
                value={spawnName}
                disabled={busy}
                onChange={(event) => { setSpawnName(event.target.value); setSpawnHook(""); }}
                placeholder="主角睁开眼的地方"
              />
            </label>
          ) : (
            <div className="form-block">
              <span className="field-label">出生点</span>
              <div className="chip-grid" role="group" aria-label="出生点">
                {points.map((point) => (
                  <button
                    type="button"
                    key={point.id || point.name}
                    className={`choice-chip ${spawnName === point.name ? "active" : ""}`}
                    aria-pressed={spawnName === point.name}
                    disabled={busy}
                    onClick={() => { setSpawnName(point.name); setSpawnHook(point.hook || ""); }}
                  >
                    {point.name}
                    {spawnName === point.name && <Icon name="check" size={13} />}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="form-block">
            <span className="field-label">带进这个世界的能力</span>
            <div className="chip-grid" role="group" aria-label="能力">
              {abilities.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`choice-chip ${abilityName === item.name ? "active" : ""}`}
                  aria-pressed={abilityName === item.name}
                  disabled={busy}
                  onClick={() => setAbilityName(item.name)}
                >
                  {item.name}
                  {abilityName === item.name && <Icon name="check" size={13} />}
                </button>
              ))}
            </div>
            {abilities.find((item) => item.name === abilityName) && (
              <p className="field-hint">{abilities.find((item) => item.name === abilityName).desc}</p>
            )}
          </div>

          <p className="plaza-fee-note"><span aria-hidden="true">●</span> 进入重演后，新章节的生成费用计入你自己的额度。</p>
          {error && <div className="sw-inline-alert" role="alert">{error}</div>}
          <div className="plaza-publish-actions">
            <Button disabled={!identityId || busy} onClick={() => void enter()}>
              {busy ? "正在进入…" : `带${avatar.name}进入 · 写下第一章`}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => onNavigate("plaza-detail", { id })}>先不进入</Button>
          </div>
          {busy && <GenerationOverlay kind="story" onCancel={() => { operation.current?.abort(); operation.current = null; setBusy(false); }} />}
        </>
      )}
    </div>
  );
}

function Merge({ activeStory, stories, onNavigate, onMerged, provider, authClient, onAuthRequired, avatar }) {
  const operation = useRef(null);
  const candidate = useRef(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null);
  const engine = mode || (provider.configured ? "gemini" : "local");
  useEffect(() => () => operation.current?.abort(), []);
  const originals = stories.filter((story) => story.kind !== "merged" && !story.readOnly);
  const [sourceId, setSourceId] = useState(activeStory?.kind !== "merged" ? activeStory?.id : originals[0]?.id);
  const [partnerId, setPartnerId] = useState(originals.find((story) => story.id !== sourceId)?.id || FRIEND_BOOK.id);
  const sourceStory = originals.find((story) => story.id === sourceId) || originals[0];
  const partnerStory = originals.find((story) => story.id === partnerId && story.id !== sourceStory?.id) || FRIEND_BOOK;
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
  const friendGenre = genreOf(partnerStory);
  const runMerge = async () => {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    try {
      const signature = JSON.stringify([sourceStory, partnerStory, rules, lead, bond, engine]);
      if (candidate.current?.signature !== signature) candidate.current = { signature, story: {
        ...createMergedStory(sourceStory, partnerStory, { rules, lead, bond }),
        mergeContext: [mergeSourceContext(sourceStory), mergeSourceContext(partnerStory)],
      } };
      let next = candidate.current.story;
      if (engine === "gemini") {
        next = { ...next, engine: "gemini" };
        next = acceptGeneratedChapter(next, await requestChapter(next, 0, {
          signal: controller.signal,
          getAccessToken: () => authClient.getAccessToken(),
          onAuthRequired,
        }));
      } else next = materialize(next, 2);
      if (controller.signal.aborted) return;
      onMerged?.(next);
      setMergedStory(next);
      setError("");
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message || "这一次没能连接两个世界。原书和设定都还在，请再试一次。");
    } finally { if (operation.current === controller) { operation.current = null; setBusy(false); } }
  };
  return (
    <div className="page page-merge page-enter">
      <div className="merge-heading">
        <div>
          <h1>世界合流</h1>
          <p>两个主角，一本新故事。原书保留。</p>
        </div>
      </div>
      {!started && <div className="merge-book-selectors" inert={busy ? true : undefined}>
        <label className="field-label">你的故事
          <select aria-label="你的故事" value={sourceStory.id} onChange={(event) => {
            setSourceId(event.target.value);
            if (event.target.value === partnerId) setPartnerId(FRIEND_BOOK.id);
          }}>
            {originals.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}
          </select>
        </label>
        <label className="field-label">相遇的故事
          <select aria-label="相遇的故事" value={partnerStory.id} onChange={(event) => setPartnerId(event.target.value)}>
            {originals.filter((book) => book.id !== sourceStory.id).map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}
            <option value={FRIEND_BOOK.id}>体验角色 · {displayName(FRIEND_BOOK)}</option>
          </select>
        </label>
      </div>}
      <div className="merge-stage">
        <div className="merge-world-card mine">
          <div className="merge-art merge-art-coral">
            <WorldArtwork genreId={mineGenre.id} eager />
            <span className="merge-art-label">{mineGenre.world}</span>
          </div>
          <div className="merge-card-bottom">
            {avatar && sourceStory.config?.avatarId === avatar.id ? (
              <span className="avatar avatar-photo">
                <AvatarPortrait avatar={avatar} getAccessToken={() => authClient.getAccessToken()} />
              </span>
            ) : (
              <div className="avatar avatar-rose">
                {displayName(sourceStory).slice(0, 1)}
              </div>
            )}
            <div>
              <b>{displayName(sourceStory)}</b>
              <small>{avatar && sourceStory.config?.avatarId === avatar.id ? `化身 · ${avatar.name}` : "你的主角"}</small>
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
          <div className="merge-art merge-art-mint">
            <WorldArtwork genreId={friendGenre.id} eager />
            <span className="merge-art-label">{friendGenre.world}</span>
          </div>
          <div className="merge-card-bottom">
            {avatar && partnerStory.config?.avatarId === avatar.id ? (
              <span className="avatar avatar-photo">
                <AvatarPortrait avatar={avatar} getAccessToken={() => authClient.getAccessToken()} />
              </span>
            ) : (
              <div className="avatar avatar-mint">{displayName(partnerStory).slice(0, 1)}</div>
            )}
            <div>
              <b>{displayName(partnerStory)}</b>
              <small>
                {avatar && partnerStory.config?.avatarId === avatar.id
                  ? `化身 · ${avatar.name}`
                  : partnerStory.id === FRIEND_BOOK.id
                    ? "示例角色"
                    : "书架中的主角"}
              </small>
              <span>
                {friendGenre.label} · {partnerStory.config.ability}
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
        <section className="merge-conflicts" inert={busy ? true : undefined}>
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
                  {displayName(partnerStory)}
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
            <GenerationMode provider={provider} value={engine} onChange={setMode} disabled={busy} />
            <Button icon={busy ? undefined : "arrow"} onClick={runMerge} disabled={busy}>
              {busy ? "正在翻开…" : "开启合流故事"}
            </Button>
            {busy && <button className="small-link" onClick={() => { operation.current?.abort(); operation.current = null; setBusy(false); }}>取消等待</button>}
            <p className="experience-note">{partnerStory.id === FRIEND_BOOK.id ? "与示例角色相遇。也可以新建另一本书，再来合流。" : "两本原书保留，新故事单独存入书架。"}</p>
          </div>
          )}
      </div>
    </div>
  );
}

const clampForgeStep = (value) =>
  Math.min(7, Math.max(1, Math.floor(Number(value) || 1)));

// Draft step numbers are only comparable within one flow shape. Drafts saved
// by the six-step flow predate the world screen and carry no worldChosen
// marker: their step 1 stays 1 and steps 2..6 shift one forward (identity
// was 2, becomes 3, and so on). Marked drafts are already seven-step.
const migratedDraftStep = (source) => {
  const step = clampForgeStep(source?.step);
  if (typeof source?.worldChosen === "boolean") return step;
  return step <= 1 ? 1 : Math.min(7, step + 1);
};

function legacyDraftToDraft(library) {
  const source =
    library?.draft && typeof library.draft === "object" ? library.draft : {};
  const hasSavedDraft = Boolean(
    library?.draft && typeof library.draft === "object",
  );
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
    // A saved draft without the marker predates the world screen: the world
    // on it was picked under the old combined step, so it counts as chosen
    // and its genreId is kept as-is. Only a truly fresh start (no saved
    // draft at all) begins unchosen.
    worldChosen:
      typeof source.worldChosen === "boolean"
        ? source.worldChosen
        : hasSavedDraft,
    step: migratedDraftStep(source),
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

function LibraryTools({ store, library, onClose, onRestored }) {
  const [candidate, setCandidate] = useState(null);
  const [message, setMessage] = useState("");
  const [confirmReload, setConfirmReload] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRequest = useRef(0);
  useEffect(() => () => { fileRequest.current += 1; }, []);
  const chooseBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const request = ++fileRequest.current;
    setCandidate(null);
    setMessage("");
    setBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("备份不能超过 5 MB。");
      const restored = importLibrary(await file.text());
      if (request === fileRequest.current) setCandidate(restored);
    } catch (error) {
      if (request === fileRequest.current) setMessage(error.message || "无法读取这份备份。");
    } finally {
      if (request === fileRequest.current) setBusy(false);
      event.target.value = "";
    }
  };
  return <ReadingDialog title="书架与备份" onClose={onClose}>
    <div className="library-tools">
      <p>{library.stories.length} 本故事 · {library.publications.length} 份分享</p>
      <p className="field-hint">备份含个人设定，请自行保管。恢复前会保留一份原存档。</p>
      <Button variant="secondary" onClick={() => {
        try {
          downloadText(exportLibrary(library), `storyweave-${new Date().toISOString().slice(0, 10)}.json`);
          setMessage("备份已交给浏览器下载。");
        } catch (error) { setMessage(error.message); }
      }}>导出书架备份</Button>
      <label className="backup-upload">{busy ? "正在读取…" : "选择备份文件"}
        <input type="file" accept=".json,application/json" aria-label="选择备份文件" onChange={chooseBackup} disabled={busy} />
      </label>
      {candidate && <section className="backup-confirm">
        <h3>恢复 {candidate.stories.length} 本故事？</h3>
        <p>当前书架和阅读进度将被这份备份替换。</p>
        <div className="reading-dialog-actions">
          <Button onClick={() => {
            try { store.restore(candidate); onRestored(); }
            catch (error) { setMessage(error.message); }
          }}>确认恢复</Button>
          <Button variant="ghost" onClick={() => setCandidate(null)}>取消</Button>
        </div>
      </section>}
      {store.getSnapshot().warning && <div className="backup-recovery">
        <Button variant="ghost" onClick={() => {
          try { downloadText(store.raw() || "{}", "storyweave-original.json"); }
          catch (error) { setMessage(error.message); }
        }}>导出原始存档</Button>
        {!store.getSnapshot().blocked && <Button variant="secondary" onClick={() => setMessage(store.retry() ? "已保存到本机。" : "暂未保存成功，请保留备份。")}>重试保存</Button>}
        <Button variant="ghost" onClick={() => setConfirmReload(true)}>载入本机存档</Button>
        {confirmReload && <div className="backup-confirm">
          <p>此页的未保存改动将被替换。请确认已导出需要的备份。</p>
          <Button variant="secondary" onClick={() => {
            if (store.reload()) onRestored();
            else setMessage("本机存档仍无法读取，请选择有效的备份文件。");
          }}>确认载入</Button>
          <Button variant="ghost" onClick={() => setConfirmReload(false)}>保留当前进度</Button>
        </div>}
      </div>}
      <p className="backup-status" role="status">{message}</p>
    </div>
  </ReadingDialog>;
}

function App() {
  const sceneRef = useRef(null);
  const [authClient] = useState(() => createAuthClient());
  const account = useSyncExternalStore(authClient.subscribe, authClient.getSnapshot);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountIntent, setAccountIntent] = useState(null);
  useEffect(() => { void authClient.start(); return () => authClient.stop(); }, [authClient]);
  const [store] = useState(() => createLibraryStore());
  useEffect(() => { installRipple(); }, []);
  const { library, warning, unsaved } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const setLibrary = store.update;
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  const view = route.view;
  // Plaza sub-views (detail / publish / enter / plaza-read) all keep the
  // 广场 tab active in the sidebar and the bottom bar.
  const navView = route.plaza || view.startsWith("plaza") ? "plaza" : view;
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [shareRequest, setShareRequest] = useState(false);
  const [toast, setToast] = useState("");
  const [provider, setProvider] = useState({ configured: false });
  const opening = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    generationStatus({ signal: controller.signal }).then((status) => { if (!controller.signal.aborted) setProvider(status); });
    return () => controller.abort();
  }, []);
  const activeStory = useMemo(
    () =>
      library.stories.find((story) => story.id === library.activeStoryId) ||
      library.stories[0] ||
      null,
    [library],
  );
  const readerExternal = route.shared
    ? COMMUNITY_BOOKS.find((book) => book.id === route.id) || library.publications.find((item) => item.id === route.id)?.snapshot
    : null;
  const [plazaLines, setPlazaLines] = useState({});
  const readerStory = route.shared
    ? readerExternal
    : route.plaza
      ? plazaLines[route.id]
      : library.stories.find((story) => story.id === route.id);
  useEffect(() => {
    if (!route.plaza || !route.id || plazaLines[route.id]) return;
    let cancelled = false;
    fetchPlazaDetail({ id: route.id })
      .then((detail) => {
        if (cancelled || !detail) return;
        const story = plazaReaderStory(detail);
        if (story) setPlazaLines((current) => ({ ...current, [route.id]: story }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [route.plaza, route.id, plazaLines]);
  const { animate } = useMotionPolicy(view);
  useSmoothScroll(view);
  useSceneMotion(
    sceneRef,
    view,
    ".hero-copy h1, .store-heading h1, .merge-heading h1, .plaza-heading h1",
  );
  useEffect(() => {
    const onHash = () => { setRoute(parseRoute(window.location.hash)); setShareRequest(false); };
    const onStorage = (event) => { if (event.key === STORAGE_KEY || event.key === null) store.sync(); };
    const onVisible = () => { if (!document.hidden) store.sync(); };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [store]);
  useEffect(() => {
    const warnBeforeLeaving = (event) => { event.preventDefault(); event.returnValue = ""; };
    if (unsaved) window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [unsaved]);
  useEffect(() => {
    const titles = {
      plaza: "广场",
      "plaza-detail": "故事线详情",
      "plaza-publish": "发布到广场",
      "plaza-enter": "进入世界",
      home: "我的世界",
      forge: "新故事",
      store: "书城",
      merge: "世界合流",
      avatar: "我的化身",
    };
    document.title = `${view === "reader" ? readerStory?.title || "故事未找到" : titles[view]} · 织界`;
    if (view !== "reader" && view !== "forge") {
      const heading = sceneRef.current?.querySelector(".page h1");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus({ preventScroll: true });
      scrollToTop();
    }
  }, [view, route.id, readerStory?.title]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const navigate = (next, options = {}) => {
    const nextRoute = next === "reader"
      ? {
          view: next,
          id: options.storyId || activeStory?.id,
          shared: Boolean(options.shared),
          ...(options.plaza ? { plaza: true } : {}),
        }
      : next === "plaza-detail" || next === "plaza-enter"
        ? { view: next, id: options.id }
        : { view: next };
    const hash = routeHash(nextRoute);
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    setRoute(parseRoute(hash));
    if (next !== "reader") setShareRequest(false);
    scrollToTop();
  };
  const commitStory = useCallback(
    (story) => setLibrary((current) => libraryWithStory(current, story)),
    [setLibrary],
  );
  const saveDraft = useCallback(
    (draft) => setLibrary((current) => ({ ...current, draft })),
    [setLibrary],
  );
  const prepareChapter = useCallback(async (id, index, signal) => {
    const source = store.getSnapshot().library.stories.find((book) => book.id === id);
    if (!source || nextGenerationIndex(source) !== index) return;
    const result = await requestChapter(source, index, { signal, getAccessToken: () => authClient.getAccessToken() });
    if (signal.aborted) return;
    setLibrary((current) => {
      const latest = current.stories.find((book) => book.id === id);
      if (!latest) return current;
      const next = acceptGeneratedChapter(latest, result);
      if (next === latest) return current;
      return { ...current, stories: current.stories.map((book) => book.id === id ? next : book) };
    });
  }, [store, setLibrary]);
  // Cover painting runs beside reading, never inside it: the story is
  // marked pending, the request resolves whenever the server finishes,
  // and only the cover state is written back — chapters and position are
  // untouched. Automatic requests happen once per story per session;
  // manual re-rolls come from the reader's cover dialog.
  const coverAttempts = useRef(new Set());
  const updateCoverState = useCallback((id, patch) => {
    setLibrary((current) => ({
      ...current,
      stories: current.stories.map((book) => (book.id === id ? withCoverState(book, patch) : book)),
    }));
  }, [setLibrary]);
  const runCoverRequest = useCallback(async (id, { manual = false } = {}) => {
    const story = store.getSnapshot().library.stories.find((book) => book.id === id);
    if (!story || coverStateOf(story).status === "pending") return;
    const previous = coverStateOf(story);
    updateCoverState(id, { status: "pending" });
    try {
      const { version } = await requestCoverImage({
        story,
        getAccessToken: () => authClient.getAccessToken(),
      });
      updateCoverState(id, { status: "ready", version, updatedAt: new Date().toISOString() });
      if (manual) setToast("新封面已换好。");
    } catch (error) {
      if (error?.code === "auth-required") {
        // Signed-out readers keep the world artwork; releasing the
        // per-session attempt lets the effect retry once sign-in settles
        // instead of sticking in a failed state.
        coverAttempts.current.delete(id);
        updateCoverState(id, { status: previous.status, version: previous.version });
        if (manual) {
          setAccountIntent(null);
          setAccountOpen(true);
        }
        return;
      }
      updateCoverState(id, { status: "failed" });
      if (manual) setToast(error?.message || "封面暂时没能生成，请稍后再试。");
    }
  }, [store, authClient, updateCoverState]);
  useEffect(() => {
    // Covers live behind sign-in; firing before the session restore lands
    // would only burn the attempt on a 401.
    if (account.status !== "authenticated") return;
    for (const story of library.stories) {
      if (!shouldAutoRequestCover(story) || coverAttempts.current.has(story.id)) continue;
      coverAttempts.current.add(story.id);
      void runCoverRequest(story.id);
    }
  }, [library.stories, runCoverRequest, account.status]);
  const avatarState = useAvatarProfile(authClient, account);
  const generate = async (payload, { engine, signal }) => {
      const settingViolation = findSettingViolation(payload.customWorldSetting);
      if (settingViolation) throw new Error(settingViolation);
      const signature = JSON.stringify([payload, engine]);
      if (opening.current?.signature !== signature) opening.current = { signature, story:
        createStory({
          genreId: payload.genreId,
          genreTemplateId: payload.genreTemplateId,
          storyLengthMode: payload.storyLengthMode,
          originIdentityId: payload.originIdentityId,
          customWorldName: payload.customWorldName,
          customWorldSetting: payload.customWorldSetting,
          startPointName: payload.startPointName,
          startPointHook: payload.startPointHook,
          name: payload.name,
          avatarId: payload.avatarId,
          avatarAppearance: payload.avatarAppearance,
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
        }) };
      let story = opening.current.story;
      if (engine === "gemini") {
        story = { ...story, engine: "gemini" };
        story = acceptGeneratedChapter(story, await requestChapter(story, 0, {
          signal,
          getAccessToken: () => authClient.getAccessToken(),
          onAuthRequired: () => { setAccountIntent(null); setAccountOpen(true); },
        }));
      } else story = seedStory(story);
      if (signal.aborted) return;
      setLibrary((current) => ({
        ...libraryWithStory(current, story),
        draft: null,
      }));
      setShareRequest(false);
      setToast("");
      navigate("reader", { storyId: story.id });
      opening.current = null;
  };
  const startNextSeasonFor = (story) => {
    try {
      const rolled = startNextSeason(story);
      const next = story.engine === "gemini" ? { ...rolled, engine: "gemini" } : rolled;
      const seeded = story.engine === "gemini" ? next : seedStory(next);
      setLibrary((current) => ({ ...libraryWithStory(current, seeded), draft: null }));
      setShareRequest(false);
      navigate("reader", { storyId: seeded.id });
    } catch {
      setToast("这一季还没有读完，暂时不能开启下一季。");
    }
  };
  const openOwnReader = (storyId = activeStory?.id, options = {}) => {
    setShareRequest(Boolean(options.share));
    if (storyId)
      setLibrary((current) => ({ ...current, activeStoryId: storyId }));
    navigate("reader", { storyId });
  };
  const openCommunityBook = (book) => {
    setShareRequest(false);
    navigate("reader", { storyId: book.id, shared: true });
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
  // Plaza （广场）: reading a published line is a pure local view over
  // the public snapshot; entering one seeds a brand-new local story of
  // the entrant's own, whose generation flows through /api/generate and
  // meters to the entrant.
  const openPlazaDetail = (publication) => navigate("plaza-detail", { id: publication.id });
  const openPlazaLine = async (publication) => {
    let story = plazaLines[publication.id];
    if (!story) {
      const detail = publication.snapshot ? publication : await fetchPlazaDetail({ id: publication.id });
      story = plazaReaderStory(detail);
      if (!story) { setToast("这条故事线暂时打不开。"); return; }
      setPlazaLines((current) => ({ ...current, [publication.id]: story }));
    }
    navigate("reader", { storyId: publication.id, plaza: true });
  };
  const enterPlazaLine = async (detail, picks, { signal } = {}) => {
    const ownAvatar = avatarState.avatar;
    if (!ownAvatar) { navigate("avatar"); throw new Error("先创建你的化身，再带它进入这个世界。"); }
    const draft = enterDraftFor(detail, { avatar: ownAvatar, ...picks });
    const settingViolation = findSettingViolation(draft.customWorldSetting);
    if (settingViolation) throw new Error(settingViolation);
    let story = createStory(draft);
    const bible = detail.enterTemplate?.worldBible;
    if (bible) story = { ...story, worldBible: bible };
    if (provider.configured) {
      story = { ...story, engine: "gemini" };
      story = acceptGeneratedChapter(story, await requestChapter(story, 0, {
        signal,
        getAccessToken: () => authClient.getAccessToken(),
        onAuthRequired: () => { setAccountIntent(null); setAccountOpen(true); },
      }));
    } else {
      story = seedStory(story);
    }
    setLibrary((current) => ({ ...libraryWithStory(current, story), draft: null }));
    setShareRequest(false);
    navigate("reader", { storyId: story.id });
    return story;
  };
  let page;
  if (view === "forge")
    page = (
      <Forge
        provider={provider}
        onGenerate={generate}
        initialDraft={legacyDraftToDraft(library)}
        onDraftChange={saveDraft}
        authClient={authClient}
        avatar={avatarState.avatar}
        avatarLoaded={avatarState.loaded}
        onOpenAvatar={() => navigate("avatar")}
      />
    );
  else if (view === "reader")
    page = route.plaza && !readerStory ? (
      <div className="page page-plaza page-enter">
        <p className="plaza-loading" role="status">正在打开这条故事线…</p>
        <Button variant="secondary" onClick={() => navigate("plaza")}>回到广场</Button>
      </div>
    ) : (
      <Reader
        key={`${readerStory?.id || "empty"}:${readerExternal ? "shared" : route.plaza ? "plaza" : "own"}`}
        story={readerStory}
        readOnly={Boolean(readerExternal) || Boolean(route.plaza)}
        backRoute={route.plaza ? { view: "plaza-detail", id: route.id } : null}
        backText={route.plaza ? "返回广场" : ""}
        onNavigate={navigate}
        onUpdateStory={commitStory}
        onPrepareChapter={prepareChapter}
        onStartNextSeason={startNextSeasonFor}
        onToggleBookmark={commitStory}
        onPublish={publish}
        openShare={shareRequest}
        onShareOpened={() => setShareRequest(false)}
        unsaved={unsaved}
        authClient={authClient}
        authSignal={account.status}
        onRerollCover={(story) => void runCoverRequest(story.id, { manual: true })}
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
        provider={provider}
        stories={library.stories}
        activeStory={
          activeStory?.kind === "merged"
            ? library.stories.find((story) => story.kind !== "merged")
            : activeStory
        }
        onNavigate={(next, id) => (id ? openOwnReader(id) : navigate(next))}
        onMerged={addMergedStory}
        authClient={authClient}
        onAuthRequired={() => { setAccountIntent(null); setAccountOpen(true); }}
        avatar={avatarState.avatar}
      />
    );
  else if (view === "avatar")
    page = (
      <AvatarPage
        authClient={authClient}
        account={account}
        avatarState={avatarState}
        stories={library.stories}
        onOpenStory={openOwnReader}
        onOpenAccount={() => { setAccountIntent(null); setAccountOpen(true); }}
        onNavigate={navigate}
      />
    );
  else if (view === "plaza")
    page = (
      <PlazaFeed
        account={account}
        activeStory={activeStory}
        onNavigate={navigate}
        onOpenStory={openOwnReader}
        onOpenDetail={openPlazaDetail}
        onReadLine={(publication) => void openPlazaLine(publication)}
        onEnter={(publication) => navigate("plaza-enter", { id: publication.id })}
      />
    );
  else if (view === "plaza-detail")
    page = (
      <PlazaDetail
        id={route.id}
        account={account}
        authClient={authClient}
        onNavigate={navigate}
        onReadLine={(detail) => void openPlazaLine(detail)}
        onEnter={(detail) => navigate("plaza-enter", { id: detail.id })}
        onOpenAccount={() => { setAccountIntent(null); setAccountOpen(true); }}
        onToast={setToast}
      />
    );
  else if (view === "plaza-publish")
    page = (
      <PlazaPublish
        stories={library.stories}
        avatar={avatarState.avatar}
        avatarLoaded={avatarState.loaded}
        account={account}
        authClient={authClient}
        onNavigate={navigate}
        onOpenAccount={() => { setAccountIntent(null); setAccountOpen(true); }}
        onOpenAvatar={() => navigate("avatar")}
        onToast={setToast}
      />
    );
  else if (view === "plaza-enter")
    page = (
      <PlazaEnter
        id={route.id}
        account={account}
        authClient={authClient}
        avatar={avatarState.avatar}
        avatarLoaded={avatarState.loaded}
        onNavigate={navigate}
        onOpenAccount={() => { setAccountIntent(null); setAccountOpen(true); }}
        onOpenAvatar={() => navigate("avatar")}
        onEnterLine={enterPlazaLine}
      />
    );
  else
    page = (
      <Home
        onNavigate={navigate}
        onOpenStory={openOwnReader}
        activeStory={activeStory}
        stories={library.stories}
        draft={library.draft}
        account={account}
        authClient={authClient}
        onOpenAccount={() => { setAccountIntent(activeStory ? null : "forge"); setAccountOpen(true); }}
        avatar={avatarState.avatar}
        onOpenAvatar={() => navigate("avatar")}
      />
    );
  return (
    <div
      ref={sceneRef}
      className="app-shell"
      data-view={view}
      data-motion={animate ? "on" : "off"}
    >
      <AuroraBackground />
      <Sidebar view={navView} onNavigate={navigate} />
      <main className="main-shell">
        <Topbar onNavigate={navigate} onOpenLibrary={() => setLibraryOpen(true)} account={account} onOpenAccount={() => { setAccountIntent(null); setAccountOpen(true); }} />
        {warning && (
          <div className="sw-storage-warning" role="alert">
            <Icon name="lock" size={14} />
            <span>{warning}</span>
            <button onClick={() => setLibraryOpen(true)}>备份与恢复</button>
          </div>
        )}
        <MobileBottomNav view={navView} onNavigate={navigate} />
        {page}
      </main>
      {accountOpen && <ReadingDialog title={account.user ? "我的账号" : "登录与注册"} onClose={() => setAccountOpen(false)}>
        <AccountPanel client={authClient} account={account} onOpenAvatar={() => { setAccountOpen(false); navigate("avatar"); }} onContinue={() => {
          setAccountOpen(false);
          if (accountIntent === "forge") navigate("forge");
          setAccountIntent(null);
        }}/>
      </ReadingDialog>}
      {libraryOpen && <LibraryTools store={store} library={library} onClose={() => setLibraryOpen(false)} onRestored={() => {
        setLibraryOpen(false);
        navigate("home");
        setToast("书架已恢复。");
      }} />}
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
  <ErrorBoundary>
  <MotionProvider>
    <App />
  </MotionProvider>
  </ErrorBoundary>,
);
