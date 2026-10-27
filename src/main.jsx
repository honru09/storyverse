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
import { createCloudSync } from "./cloud-library.js";
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
  plazaLineStatusFor,
  plazaMine,
  plazaMineForget,
  plazaMineIds,
  plazaMineRemember,
  plazaReaderStory,
  plazaTemplateNameFor,
  publishToPlaza,
  reportPublication,
  withdrawPublication,
} from "./plaza.js";
import {
  profileBoardsFor,
  searchProfileLines,
  sortProfileLines,
} from "./profile-boards.js";
import {
  checkHandleAvailable,
  fetchUserProfile,
  fileToSquareJpeg,
  followUser,
  publicDisplayName as profileDisplayName,
  publicHandle as profileHandle,
  reportUser,
  sendPresenceHeartbeat,
  unfollowUser,
  updateMyProfile,
  uploadMyPicture,
} from "./users.js";
import { acceptGeneratedChapter, acceptRerolledChapter, acceptRevisedChapter, generationStatus, mergeSourceContext, nextGenerationIndex, requestChapter, requestChapterReroll, requestChapterRevision } from "./generation.js";
import InterventionOverlay from "./components/InterventionOverlay.jsx";
import WorldArtwork from "./components/WorldArtwork.jsx";
import StoryCover from "./components/StoryCover.jsx";
import AccountPanel from "./components/AccountPanel.jsx";
import { createAuthClient } from "./auth/client.js";
import ReadingPreferences from "./components/ReadingPreferences.jsx";
import { createReadingPreferencesStore, getReaderAppearance } from "./reading-preferences.js";
import { chapterLocationKey, estimateReadingMetrics, READING_LOCATION_KEY } from "./reading-location.js";
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
import { gsap } from "./motion/gsap.js";
import {
  lastAccessibleIndex,
  materialize,
  moveReadingPosition,
  prepareReadingWindow,
  readerIndexFor,
} from "./reading-flow.js";
import {
  ALL_ABILITIES,
  COMMUNITY_BOOKS,
  CUSTOM_GENRE,
  CUSTOM_GENRE_ID,
  CUSTOM_LENGTH_MAX,
  CUSTOM_LENGTH_MIN,
  CUSTOM_WORLD_NAME_MAX,
  CUSTOM_WORLD_SETTING_MAX,
  DEFAULT_DRAFT,
  FRIEND_BOOK,
  GENRES,
  GENRE_SHELVES,
  GENRE_TEMPLATES,
  ORIGIN_IDENTITIES,
  START_POINT_NAME_MAX,
  abilityCandidatesFor,
  abilityGroupsFor,
  buildChapter,
  chapterForReading,
  INTERVENTION_CHIPS,
  INTERVENTION_TEXT_MAX,
  interventionTargetIndex,
  queueIntervention,
  queuedInterventionsFor,
  retractChapter,
  PERSONA_MAX,
  STYLE_PRESETS,
  stylePresetOf,
  beginChapterReroll,
  chapterKey,
  isFrontierChapter,
  replaceFrontierChapter,
  updateChapterProse,
  updateLorebook,
  updateStylePreset,
  updateWorldBible,
  createMergedStory,
  createStory,
  finishEndlessLine,
  genreTemplateById,
  isManuallyFinished,
  localIdentityTitle,
  originIdentityById,
  originSummaryFor,
  isStoryComplete,
  publicSnapshot,
  resolveStartPoint,
  shelfById,
  shelfForTemplate,
  startNextSeason,
  storyLengthModeOf,
  totalChaptersFor,
  validTargetChapters,
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
import {
  leadingExcerpt,
  parseCharacterCardJson,
  parseCharacterCardPng,
  parseWorldInfoJson,
  parseWorldText,
  personaTextFromCard,
  splitWorldTextIntoEntries,
} from "./lorebook";

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
    ripple: (
      <>
        <circle cx="12" cy="12" r="1.8" />
        <path d="M17.5 6.5a8 8 0 0 1 0 11" />
        <path d="M6.5 6.5a8 8 0 0 0 0 11" />
        <path d="M20.5 3.8a13 13 0 0 1 0 16.4" />
        <path d="M3.5 3.8a13 13 0 0 0 0 16.4" />
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
    reroll: (
      <>
        <path d="M20 12a8 8 0 1 1-2.3-5.6" />
        <path d="M20 3v4h-4" />
      </>
    ),
    pencil: (
      <>
        <path d="M17 3a2.8 2.8 0 1 1 4 4L8 20l-5 1 1-5L17 3Z" />
        <path d="m15 5 4 4" />
      </>
    ),
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
    share: (
      <path
        d="M13.2 4.4 20.6 11.8l-7.4 7.4v-4.2c-5 .1-8.4 2-10.6 5.2.3-7.1 3.7-11.4 10.6-11.8V4.4Z"
        fill="currentColor"
        stroke="none"
      />
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
// The start flow's flat template list: every writing template exactly
// once, in shelf order (the two-level taxonomy in GENRE_SHELVES is the
// navigation; this list is the pool the defaults and rolls draw from).
// Flagship fantasy first, so the wall's default and first brick agree.
const templateWall = GENRE_SHELVES
  .flatMap((shelf) => shelf.templateIds)
  .map((id) => GENRE_TEMPLATES.find((template) => template.id === id))
  .filter(Boolean);

// The legible one-line statement of a length choice, shared by the forge
// summary, the side preview and the picker heading: 全24章 / 全37章 /
// 无限连载 — a custom line states its own reader-chosen total.
const lengthLabelFor = (source) => {
  const mode = storyLengthModeOf(source);
  if (mode === "endless") return "无限连载";
  if (mode === "custom") return `自定义 · 全 ${validTargetChapters(source?.config?.targetChapters ?? source?.targetChapters) ?? 24} 章`;
  if (mode === "long") return "长线 · 全 100 章";
  if (mode === "season") return "一季 · 全 24 章";
  return "短季 · 全 6 章";
};

// A story map drawn against an unbounded total (a running endless line)
// shows the chapters that exist plus the one being written, never ∞ nodes.
const mapTotalFor = (total, generated = 0, current = 0) =>
  Number.isFinite(total) ? total : Math.max(generated + 1, current + 1, 1);

// The two-segment genre label （家族 · 模板） used by the forge summary and
// the side preview. A template whose full name already carries its family
// （言情 · 古言） stands as-is; every other template reads shelf-first, the
// same shape as the identity row's 概念 · 本地称谓.
const twoSegmentTemplateName = (template) => {
  if (!template) return "";
  if (template.fullName.includes(" · ")) return template.fullName;
  const shelf = shelfForTemplate(template.id);
  return shelf ? `${shelf.name} · ${template.name}` : template.fullName;
};

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
  if (view === "profile") return null;
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

function Home({ onNavigate, onOpenStory, activeStory, stories, draft, account, onOpenAccount, authClient, avatar, onOpenAvatar, syncNote }) {
  const genre = genreOf(activeStory);
  const activeTotal = activeStory ? totalChaptersFor(activeStory) : 6;
  const currentChapter = activeStory
    ? Math.min(activeTotal, readerIndexFor(activeStory) + 1)
    : 1;
  // A running endless line has no denominator: its position reads as a
  // serialising count, and its map shows the chapters that exist.
  const activeSerializing = activeStory
    ? storyLengthModeOf(activeStory) === "endless" && !isManuallyFinished(activeStory)
    : false;
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
                <span className="resume-position">{activeSerializing ? `连载中 · 第 ${currentChapter} 章` : `第 ${currentChapter} / ${activeTotal} 章`}</span>
              </>
            ) : (
              "选一个世界。让故事，因你不同。"
            )}
          </p>
          {activeStory && (
            <div className="hero-starmap">
              <StoryMapMini
                total={mapTotalFor(activeTotal, activeStory.chapters?.length || 0, readerIndexFor(activeStory))}
                generated={activeStory.chapters?.length || 0}
                current={readerIndexFor(activeStory)}
                state={generationState({ total: mapTotalFor(activeTotal, activeStory.chapters?.length || 0, readerIndexFor(activeStory)), generated: activeStory.chapters?.length || 0, current: readerIndexFor(activeStory), engine: activeStory.engine, complete: activeStory.status === "complete" || isStoryComplete(activeStory) })}
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

      {syncNote && <p className="library-sync-note">{syncNote}</p>}

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
                const serializing = story ? storyLengthModeOf(story) === "endless" && !isManuallyFinished(story) : false;
                return (
                  <button type="button" key={row.storyId} className="avatar-journey" onClick={() => onOpenStory(row.storyId)}>
                    <span className="avatar-journey-main">
                      <b>{row.title}</b>
                      <small>{genre.world} · {row.kind === "merged" ? "合流" : (genreTemplateById(row.genreTemplateId)?.name || genre.label)}</small>
                    </span>
                    <span className="avatar-journey-progress">{complete ? `已完结 · 全 ${total} 章` : serializing ? `连载中 · 已更 ${row.chapters} 章` : `第 ${row.chapters} / ${total} 章`}</span>
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
    { id: 3, label: "出身" },
    { id: 4, label: "主角" },
    { id: 5, label: "开局" },
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

function TemplateBrick({ template, selected, featured, defaulted = false, index = 0, onSelect }) {
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
        </span>
        {selected && !defaulted && (
          <span className="selected-mark">
            <Icon name="check" size={13} />
          </span>
        )}
        {selected && defaulted && <span className="default-badge">默认</span>}
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
        {factRow("题材", template ? twoSegmentTemplateName(template) : "完全自由", isCustom ? 2 : 1, "修改题材")}
        {factRow("世界", world.name, 2, "修改世界")}
        <div><dt>篇幅</dt><dd>{lengthLabelFor({ config: draft })}</dd></div>
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
  // 「默认即选中」 governance: a value the system filled in silently (the
  // first template, the default trait/style/length) is NOT shown as a
  // deliberate pick. A restored draft's stored values were all confirmed
  // on its own summary screen in their session, so they count as picked;
  // a fresh draft's untouched defaults render with a 「默认」 tag until
  // the reader actually taps a choice (or the summary restates them).
  const wasRestored = initialDraft?.restoredDraft === true;
  const [pickedTemplate, setPickedTemplate] = useState(wasRestored);
  const [pickedTrait, setPickedTrait] = useState(wasRestored);
  const [pickedTone, setPickedTone] = useState(wasRestored);
  const [pickedLength, setPickedLength] = useState(wasRestored);
  // Step one's open shelf (two-level taxonomy): starts on the shelf of a
  // restored pick with siblings, so a resumed draft lands on its own L2
  // screen with the pick lit; otherwise the L1 shelf screen.
  const [shelfId, setShelfId] = useState(() => {
    const shelf = shelfForTemplate(initialDraft?.genreTemplateId || "");
    return shelf && shelf.templateIds.length > 1 ? shelf.id : null;
  });
  // The landing path of the last cross-shelf template roll, shown verbatim
  // （悬疑惊悚 · 规则怪谈） so a random pick never hides where it landed.
  const [rolledPath, setRolledPath] = useState(null);
  const [draft, setDraft] = useState(() => {
    const base = { ...DEFAULT_DRAFT, ...(initialDraft || {}) };
    // The world marker must always be a real boolean inside the flow: the
    // restore funnel (legacyDraftToDraft) supplies it for saved drafts;
    // anything else is a fresh draft whose world is still unchosen.
    if (typeof base.worldChosen !== "boolean") base.worldChosen = false;
    // 篇幅自由化： the selectable lengths are season (default) / long /
    // custom (own total) / endless. Anything else (including the engine's
    // legacy 'short' baked into restored drafts) lands on the season
    // default. A custom draft always carries a valid target inside the
    // flow — the reader's own when there is one, a mid-range starter
    // otherwise; the engine re-validates at creation regardless.
    if (!["season", "long", "custom", "endless"].includes(base.storyLengthMode)) {
      base.storyLengthMode = "season";
    }
    base.targetChapters = base.storyLengthMode === "custom"
      ? validTargetChapters(base.targetChapters) ?? 36
      : null;
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
  // The same list grouped by origin, for the titled groups on the merged
  // protagonist-and-ability step: 招牌能力 (template) vs 本事 (world), the
  // god-mode generic pool as its own group.
  const abilityGroups = abilityGroupsFor({
    genreId: draft.genreId,
    genreTemplateId: draft.genreTemplateId,
    custom: isCustom,
  });
  const abilityGroupTitle = (kind) => kind === "signature"
    ? `${template?.name || "所选写法"} · 招牌能力`
    : kind === "world"
      ? `${world.name} · 这个世界的本事`
      : "通用能力";
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
  // the spawn section opens on the rolled identity's cell default).
  const rollIdentity = () => {
    const pool = ORIGIN_IDENTITIES.filter((item) => item.id !== identity?.id);
    const rolledIdentity = pool[Math.floor(Math.random() * pool.length)] || ORIGIN_IDENTITIES[0];
    if (rolledIdentity) selectIdentity(rolledIdentity.id);
  };
  // 出身随机 (the merged origin roll on the combined 出身 step): identity
  // and birthpoint are one decision cluster, so one roll draws both — an
  // identity, then a point inside its cell in the current world. God mode
  // has no point list: the roll lands the identity alone.
  const rollOrigin = () => {
    const pool = ORIGIN_IDENTITIES.filter((item) => item.id !== identity?.id);
    const rolledIdentity = pool[Math.floor(Math.random() * pool.length)] || ORIGIN_IDENTITIES[0];
    if (!rolledIdentity) return;
    if (isCustom) {
      set({ originIdentityId: rolledIdentity.id, startPointName: "", startPointHook: "" });
      return;
    }
    const points = spawnPointsForIdentity(spawnGenre, rolledIdentity.id);
    const point = points.length ? points[Math.floor(Math.random() * points.length)] : null;
    set({
      originIdentityId: rolledIdentity.id,
      startPointName: point ? point.name : "",
      startPointHook: point ? point.hook : "",
    });
  };
  // 题材与世界彻底解耦：题材屏只写分类，世界屏只写世界，两边互不跟随。
  // Picking a category touches the category field and nothing else — never
  // the world, never the world marker. It also counts as a deliberate pick
  // (the 「默认」 tag comes off) and clears any stale roll path.
  const selectTemplate = (item) => {
    setPickedTemplate(true);
    setRolledPath(null);
    set({ genreTemplateId: item.id });
  };
  // The template roll draws across ALL shelves' templates and lands on
  // the rolled template's own L2 screen, its full path stated out loud.
  const rollTemplate = () => {
    const pool = templateWall.filter((item) => item.id !== template?.id);
    const rolledTemplate = pool[Math.floor(Math.random() * pool.length)] || templateWall[0];
    if (!rolledTemplate) return;
    const shelf = shelfForTemplate(rolledTemplate.id);
    setPickedTemplate(true);
    setRolledPath({ shelf: shelf?.name || "", template: rolledTemplate });
    set({ genreTemplateId: rolledTemplate.id });
    setShelfId(shelf && shelf.templateIds.length > 1 ? shelf.id : null);
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
    // 出身 step may borrow that world's spawn points (crossed with the
    // identity). Entering without a chosen world stashes nothing.
    // The step-one template pick is NOT touched: it carries into the god
    // form as its 写法 (and back out again on exit) — entering god mode
    // must never silently wipe a decision the reader already made.
    const borrow = draft.genreId !== CUSTOM_GENRE.id
      ? (worldChosen ? draft.genreId : "")
      : (draft.godBorrowWorldId || "");
    set({ genreId: CUSTOM_GENRE.id, godBorrowWorldId: borrow });
  };
  const exitGodMode = () => {
    // Back to the world the user came from when there is one; a craft
    // picked as 写法 in god mode stays picked — it never implied a world.
    // Only a "completely free" craft needs the step-one invariant restored
    // (a category is always selected outside god mode): the wall's first.
    const backTo = GENRES.some((genre) => genre.id === draft.godBorrowWorldId)
      ? draft.godBorrowWorldId
      : DEFAULT_DRAFT.genreId;
    set({
      genreId: backTo,
      ...(draft.godBorrowWorldId ? { worldChosen: true } : {}),
      ...(draft.genreTemplateId ? {} : { genreTemplateId: templateWall[0]?.id || "" }),
    });
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
    setPickedTemplate(true);
    setRolledPath(null);
    const comboShelf = shelfForTemplate(nextTemplate.id);
    setShelfId(comboShelf && comboShelf.templateIds.length > 1 ? comboShelf.id : null);
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
  // 外部导入 (external import): a world book / world text lands as a
  // custom world (the god-mode shape) plus lorebook entries on the
  // draft; a character card lands as a preview the reader confirms
  // before anything is applied. Imported material is the reader's own
  // private stock — it never leaves the book (see 设定集 / IMPORT.md).
  const [worldImportNote, setWorldImportNote] = useState("");
  const [cardPreview, setCardPreview] = useState(null);
  const applyImportedWorld = ({ name, setting, entries, note }) => {
    // Same stash discipline as enterGodMode: the preset world the
    // reader came from stays borrowable by the 出身 step.
    const borrow = draft.genreId !== CUSTOM_GENRE.id
      ? (worldChosen ? draft.genreId : "")
      : (draft.godBorrowWorldId || "");
    set({
      genreId: CUSTOM_GENRE.id,
      godBorrowWorldId: borrow,
      worldChosen: true,
      customWorldName: name || "",
      customWorldSetting: setting || "",
      lorebook: entries || [],
    });
    setWorldImportNote(note);
    setError("");
  };
  const handleWorldFile = async (file) => {
    if (!file) return;
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".json")) {
        const parsed = parseWorldInfoJson(await file.text());
        const setting = (parsed.description || "").slice(0, CUSTOM_WORLD_SETTING_MAX);
        const violation = findSettingViolation([setting, ...parsed.entries.map((entry) => entry.content)].join("\n"));
        if (violation) { setError(violation); return; }
        const constants = parsed.entries.filter((entry) => entry.constant).length;
        applyImportedWorld({
          name: parsed.name,
          setting,
          entries: parsed.entries,
          note: `已导入世界书${parsed.name ? `《${parsed.name}》` : ""}：${parsed.entries.length} 条条目（其中 ${constants} 条常驻），挂在这本书上，生成时按关键词命中注入。世界名与设定可以在下面改；条目开书后在阅读器的「设定集」里查看和修改。`,
        });
      } else if (/\.(txt|md|markdown)$/.test(lower)) {
        const parsed = parseWorldText(await file.text(), file.name);
        const violation = findSettingViolation(parsed.text);
        if (violation) { setError(violation); return; }
        const long = parsed.text.trim().length > CUSTOM_WORLD_SETTING_MAX;
        const entries = long ? splitWorldTextIntoEntries(parsed.text) : [];
        applyImportedWorld({
          name: parsed.name,
          setting: leadingExcerpt(parsed.text, CUSTOM_WORLD_SETTING_MAX),
          entries,
          note: `已导入世界设定${parsed.name ? `《${parsed.name}》` : ""}（${parsed.text.trim().length} 字）${parsed.truncated ? "，文件过长，只取了前一部分" : ""}${long ? `：全文拆成 ${entries.length} 条世界书条目挂在这本书上，第一条常驻，其余按标题关键词命中注入；设定框里是开头摘要，可以改` : ""}。开书后在阅读器的「设定集」里能看全和修改。`,
        });
      } else {
        setError("这个文件类型读不了——世界可以导入 .json 世界书，或 .txt / .md 的设定文本。");
      }
    } catch (failure) {
      setError(failure.message || "这个文件没能读进来，换个文件试试。");
    }
  };
  const handleCardFile = async (file) => {
    if (!file) return;
    try {
      const lower = file.name.toLowerCase();
      let card;
      if (lower.endsWith(".png")) card = parseCharacterCardPng(new Uint8Array(await file.arrayBuffer()));
      else if (lower.endsWith(".json")) card = parseCharacterCardJson(await file.text());
      else { setError("角色卡可以导入 .json，或内嵌了角色卡的 .png 图片。"); return; }
      const persona = personaTextFromCard(card);
      const violation = findSettingViolation(persona);
      if (violation) { setError(violation); return; }
      // Nothing is applied yet: the parsed card is shown first, and the
      // reader confirms (or edits) it into the protagonist profile.
      setCardPreview({ name: card.name, persona });
      setError("");
    } catch (failure) {
      setError(failure.message || "这张卡没能读进来，换个文件试试。");
    }
  };
  const applyCardPreview = () => {
    if (!cardPreview) return;
    // The card's character becomes this book's protagonist; a brought-in
    // avatar yields to it (the avatar itself is untouched).
    set({ name: cardPreview.name, persona: cardPreview.persona, avatarId: "", avatarAppearance: "" });
    setCardPreview(null);
  };
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
    // Merged 出身 step: leaving with no identity must not fall through to
    // the spawn section's whole-world fallback list — that would resurrect
    // the old "pick a proper noun before knowing the world" problem
    // through the back door. Roll an identity instead, exactly like the
    // random card — and STAY on this step, so the rolled identity's spawn
    // points expand in place for the reader to see (and optionally
    // change) before the next 继续 accepts the default point. A draft
    // that already carries an identity is never re-rolled.
    if (step === 3 && !identity) { rollIdentity(); return; }
    // Leaving the merged protagonist step with no ability picked rolls
    // from the current (world × template) list and lands it — the same
    // rule as the world and identity sections. There is no default
    // ability to fall back to.
    if (step === 4 && !abilityPick) rollAbility();
    setError("");
    setStep((value) => Math.min(5, value + 1));
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
      // The five-step flow stamps its drafts so the restore funnel can
      // tell current step numbers from seven/six-step ones (see
      // migratedDraftStep) instead of folding them a second time.
      flowVersion: 5,
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
  // The opening line is composed from the actual configuration — the
  // chosen birthpoint's own opening circumstance, verbatim — never a
  // hardcoded sample: a sci-fi-flavoured sentence must not leak into a
  // cultivation world just because it was written first.
  const previewText = isCustom && (draft.customWorldSetting || "").trim()
    ? `${draft.name || "未命名旅人"}会在${world.name}醒来——${(draft.customWorldSetting || "").trim().slice(0, 56)}`
    : draft.immersive && draft.hometown
      ? `来自${draft.hometown}的${draft.role || "旅人"}，会在${spawnName}听见第一声回响。`
      : spawn?.hook
        ? `${draft.name || "未命名旅人"}，${spawn.hook}`
        : `${draft.name || "未命名旅人"}会在${spawnName}醒来。`;
  const openShelf = shelfById(shelfId);
  // The custom-length input keeps its own text while typing (so a reader
  // can clear the field on the way to a new number); the draft only ever
  // receives a committed, in-range integer.
  const [customLengthText, setCustomLengthText] = useState("");
  useEffect(() => {
    setCustomLengthText(String(validTargetChapters(draft.targetChapters) ?? 36));
  }, [draft.targetChapters]);
  const commitCustomLength = (raw) => {
    const parsed = Number.parseInt(raw, 10);
    const next = Number.isInteger(parsed)
      ? Math.min(CUSTOM_LENGTH_MAX, Math.max(CUSTOM_LENGTH_MIN, parsed))
      : (validTargetChapters(draft.targetChapters) ?? 36);
    setPickedLength(true);
    set({ storyLengthMode: "custom", targetChapters: next });
    setCustomLengthText(String(next));
  };
  const pickLengthMode = (nextMode) => {
    setPickedLength(true);
    setRolledPath(null);
    if (nextMode === "custom") {
      set({ storyLengthMode: "custom", targetChapters: validTargetChapters(draft.targetChapters) ?? 36 });
    } else {
      set({ storyLengthMode: nextMode });
    }
  };
  return (
    <div ref={forgeRef} className="page page-forge page-enter" data-step={step}>
      <div className="forge-progress">
        <h1 className="sr-only">新故事</h1>
        <Stepper step={step} setStep={(value) => { if (!busy) setStep(value); }} />
      </div>
      <div className="forge-layout">
        <main className="forge-main">
          {step === 1 && (
            <>
              <div className="forge-section-heading">
                <div>
                  <h2 tabIndex={-1}>想写哪种故事？</h2>
                  <p className="step-intro">先挑一个大类，再选具体的写法。题材只是分类——故事发生在哪个世界，下一步由你自己选。</p>
                </div>
              </div>
              <div className="random-combo-row random-combo-row--top">
                <p>{rolled
                  ? <>已配好：<b>{rolled.template.fullName} · {rolled.world}</b>，以「{rolled.identity.name}」的身份{rolled.point ? <>，从「{rolled.point.name}」醒来</> : null}。不满意就再掷一次。</>
                  : <>没想好？<b>随机组合</b>一次配好题材、世界、身份和出生点。</>}</p>
                <Button variant="secondary" icon="spark" className="random-combo-button" onClick={rollCombo}>
                  {rolled ? "再掷一次" : "随机组合"}
                </Button>
              </div>
              {openShelf ? (
                <>
                  <button type="button" className="shelf-back" onClick={() => setShelfId(null)}>
                    <Icon name="chevron" size={15} className="rotate-180" />
                    换个家族
                  </button>
                  <div className="template-wall" role="group" aria-label={`${openShelf.name}的题材`}>
                    {openShelf.templateIds.map((id, index) => {
                      const item = genreTemplateById(id);
                      if (!item) return null;
                      return (
                        <TemplateBrick
                          key={item.id}
                          template={item}
                          index={index}
                          featured={item.id === "xuanhuan"}
                          selected={template?.id === item.id}
                          defaulted={!pickedTemplate && template?.id === item.id}
                          onSelect={selectTemplate}
                        />
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="shelf-grid" role="group" aria-label="题材分类">
                  {GENRE_SHELVES.map((shelf, index) => {
                    const only = shelf.templateIds.length === 1 ? genreTemplateById(shelf.templateIds[0]) : null;
                    const holdsPick = template ? shelf.templateIds.includes(template.id) : false;
                    return (
                      <AnimatedContent key={shelf.id} className="shelf-brick-wrap" distance={8} delay={Math.min(index, 7) * 0.05}>
                        <button
                          type="button"
                          className={`shelf-brick ${holdsPick ? "selected" : ""}`}
                          aria-pressed={only ? holdsPick : undefined}
                          aria-label={only ? shelf.name : `${shelf.name}，${shelf.templateIds.length} 种写法`}
                          onClick={() => (only ? selectTemplate(only) : setShelfId(shelf.id))}
                        >
                          <strong>{shelf.name}</strong>
                          {holdsPick && !pickedTemplate
                            ? <span className="default-badge">默认</span>
                            : holdsPick
                              ? <span className="selected-mark"><Icon name="check" size={13} /></span>
                              : !only && <span className="shelf-brick-count">{shelf.templateIds.length} 种写法</span>}
                        </button>
                      </AnimatedContent>
                    );
                  })}
                  <AnimatedContent className="shelf-brick-wrap" distance={8} delay={0.45}>
                    <button type="button" className="shelf-brick shelf-brick-random" onClick={rollTemplate}>
                      <strong>随机题材</strong>
                      <span className="shelf-brick-count">掷一次，落在哪算哪</span>
                    </button>
                  </AnimatedContent>
                </div>
              )}
              <p className="world-selection-note" aria-live="polite">{rolledPath
                ? <>命运指到了：<b>{rolledPath.shelf} · {rolledPath.template.name}</b>。不喜欢就再掷一次，或自己挑。</>
                : template
                  ? <>已选：<b>{twoSegmentTemplateName(template)}</b>{pickedTemplate ? "" : "（默认）"}。{template.blurb}。</>
                  : "不绑任何题材模板，写法完全自由。世界在下一步由你决定。"}</p>
            </>
          )}
          {step === 2 && (
            <>
              <div className="forge-section-heading">
                <div>
                  <h2 tabIndex={-1}>{isCustom ? "这个世界，由你写。" : "故事发生在哪个世界？"}</h2>
                </div>
              </div>
              <p className="world-selection-note" aria-live="polite">{isCustom
                ? template
                  ? `${template.blurb} 世界由你亲手写——${world.name}。`
                  : `不绑任何题材模板，写法完全由你的设定决定。世界是${world.name}。`
                : worldChosen
                  ? `世界是${world.name}——${world.subtitle}。题材和世界互相独立：换世界不会动你选好的题材。`
                  : `选一个现成的世界，或亲手写一个。不选也行：点「继续」会替你掷一个——掷世界不会动题材。`}</p>
              {worldImportNote && <p className="world-import-note" role="status">{worldImportNote}</p>}
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
                  {(draft.lorebook || []).length > 0 && (
                    <div className="lorebook-status">
                      <span>世界书：{(draft.lorebook || []).length} 条条目挂在这本书上（{(draft.lorebook || []).filter((entry) => entry.constant).length} 条常驻）。开书后在阅读器的「设定集」里查看、修改。</span>
                      <button type="button" className="small-link" onClick={() => { set({ lorebook: [] }); setWorldImportNote(""); }}>
                        移除全部条目
                      </button>
                    </div>
                  )}
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
                        onClick={() => { setPickedTemplate(true); set({ genreTemplateId: "" }); }}
                      >
                        完全自由
                      </button>
                      {GENRE_TEMPLATES.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          className={`stage-chip ${template?.id === item.id ? "selected" : ""}`}
                          aria-pressed={template?.id === item.id}
                          onClick={() => { setPickedTemplate(true); set({ genreTemplateId: item.id }); }}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                    <p className="field-hint">这就是第一步选定的题材，带到这里作「写法」——改这里或改第一步，效果一样。选一个题材，借它的结构与文风来写你的世界；选「完全自由」，写法不设限。</p>
                  </div>
                  {error && <p className="god-error" role="alert">{error}</p>}
                </div>
              ) : (
                <>
                  <div className="world-grid" role="group" aria-label="世界">
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
                    <label className="world-card world-card-import">
                      <span className="world-card-cover world-card-cover--symbol" aria-hidden="true">
                        <span className="world-card-symbol">入</span>
                      </span>
                      <span className="world-card-copy">
                        <strong>导入世界</strong>
                        <em>带上你自己的世界书</em>
                        <small>酒馆世界书 .json，或 .txt / .md 世界设定——条目挂到这本书上，生成时按关键词生效，只属于你。</small>
                      </span>
                      <Icon name="chevron" size={15} />
                      <input
                        type="file"
                        accept=".json,.txt,.md,.markdown"
                        hidden
                        aria-label="导入世界文件"
                        onChange={(event) => { void handleWorldFile(event.target.files?.[0]); event.target.value = ""; }}
                      />
                    </label>
                    {worlds.map((item) => (
                      <WorldCard
                        key={item.id}
                        world={item}
                        selected={draft.worldChosen && draft.genreId === item.id}
                        onSelect={selectStage}
                      />
                    ))}
                  </div>
                  <p className="god-ip-note">请勿直接使用他人作品或 IP 的设定——换上你自己的世界，故事才真正属于你。</p>
                </>
              )}
            </>
          )}
          {step === 3 && (
            <>
              <div className="forge-section-heading">
                <div>
                  <h2 tabIndex={-1}>你以什么身份醒来？</h2>
                  <p className="step-intro">身份决定你在这个世界里是谁；选好身份，它能落脚的出生点就在下面同一屏展开——出生点只决定第一幕从哪里睁开眼。{identity && !isCustom ? <>在{world.name}，人们会称你为「{localIdentityTitle(spawnGenre, identity.id)}」。</> : null}</p>
                </div>
              </div>
              <div className="spawn-grid" role="group" aria-label="身份">
                {ORIGIN_IDENTITIES.map((item) => {
                  const localTitle = localIdentityTitle(spawnGenre, item.id);
                  const showLocal = !isCustom && localTitle !== item.name;
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
                        <b>{showLocal ? localTitle : item.name}</b>
                        {active && <Icon name="check" size={14} />}
                      </span>
                      {showLocal && <span className="spawn-card-concept">{item.name}</span>}
                      <small>{item.description}</small>
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="spawn-card spawn-random"
                  onClick={rollOrigin}
                >
                  <span className="spawn-card-head">
                    <b>随机出身</b>
                    <em>交给命运</em>
                  </span>
                  <small>身份与出生点一起掷——出身不由你选的，才像人生。</small>
                </button>
              </div>
              {identity && (
                <div className="spawn-section">
                  <div className="forge-section-heading mini">
                    <div>
                      <h3>从哪里醒来？</h3>
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
                          placeholder="例如：醒来的地方——一张草席、一间值班室、一段舰桥"
                        />
                      </label>
                      <p className="field-hint">留空也行：出生点由你的背景设定决定。写一个小而具体的地方——主角睁开眼时，就在那里。</p>
                      {borrowPoints.length > 0 ? (
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
                      ) : (
                        <p className="field-hint">想借用预设世界的出生点？先在上一步的世界里选过一个预设世界（再回到创世神模式），这里就能借它这个身份能落脚的地方。</p>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="spawn-grid" role="group" aria-label="出生点">
                        {spawnPoints.map((point, pointIndex) => {
                          const deliberate = draft.startPointName === point.name;
                          const isDefault = !draft.startPointName && pointIndex === 0;
                          return (
                            <button
                              type="button"
                              key={point.name}
                              className={`spawn-card ${deliberate ? "active" : ""}`}
                              aria-pressed={deliberate}
                              onClick={() => set({ startPointName: point.name, startPointHook: point.hook })}
                            >
                              <span className="spawn-card-head">
                                <b>{point.name}</b>
                                {deliberate
                                  ? <Icon name="check" size={14} />
                                  : isDefault ? <span className="default-badge">默认</span> : null}
                              </span>
                              <small>{point.hook}</small>
                            </button>
                          );
                        })}
                      </div>
                      <p className="field-hint">这里只列「{identity.name}」在{world.name}能落脚的地方。不点也行——就从标着「默认」的「{spawnPoints[0]?.name}」开始。</p>
                    </>
                  )}
                </div>
              )}
            </>
          )}
          {step === 4 && (
            <>
              <div className="forge-section-heading">
                <div>
                  <h2 tabIndex={-1}>你是怎样的主角？</h2>
                  <p className="step-intro">这一屏定主角和他的本事：名字、性格、要不要揉进你的人生经历，再从下面的分组里挑一项能力。</p>
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
              <div className="card-import">
                <div className="card-import-copy">
                  <b>导入角色卡</b>
                  <small>酒馆 / Flai 的角色卡（.json，或内嵌了卡的 .png）——先预览，确认了才填进主角档案。</small>
                </div>
                <label className="small-link card-import-button">
                  选择文件
                  <input
                    type="file"
                    accept=".json,.png"
                    hidden
                    aria-label="导入角色卡文件"
                    onChange={(event) => { void handleCardFile(event.target.files?.[0]); event.target.value = ""; }}
                  />
                </label>
              </div>
              {cardPreview && (
                <div className="card-preview">
                  <b>读到一张角色卡，先看看对不对</b>
                  <label className="field-label">
                    名字
                    <input
                      maxLength={40}
                      autoComplete="off"
                      value={cardPreview.name}
                      onChange={(event) => setCardPreview((current) => ({ ...current, name: event.target.value }))}
                    />
                  </label>
                  <label className="field-label">
                    主角设定（卡上的描述与性格，可以改）
                    <textarea
                      rows={5}
                      maxLength={PERSONA_MAX}
                      value={cardPreview.persona}
                      onChange={(event) => setCardPreview((current) => ({ ...current, persona: event.target.value }))}
                    />
                  </label>
                  <div className="card-preview-actions">
                    <Button onClick={applyCardPreview}>用这张卡</Button>
                    <Button variant="ghost" onClick={() => setCardPreview(null)}>
                      先不用
                    </Button>
                  </div>
                </div>
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
                {(draft.persona || "") && (
                  <label className="field-label">
                    主角设定（会进入每一章的生成依据）
                    <textarea
                      rows={4}
                      maxLength={PERSONA_MAX}
                      value={draft.persona}
                      onChange={(event) => set({ persona: event.target.value })}
                      placeholder="这个人是谁、什么性格、带着什么处境走进故事"
                    />
                  </label>
                )}
                <div className="form-block">
                  <span className="field-label">性格{pickedTrait ? "" : "（默认）"}</span>
                  <div className="chip-grid">
                    {traits.map((trait) => (
                      <button
                        type="button"
                        key={trait}
                        className={`choice-chip ${draft.trait === trait && pickedTrait ? "active" : ""}`}
                        aria-pressed={draft.trait === trait}
                        onClick={() => { setPickedTrait(true); set({ trait }); }}
                      >
                        {trait}
                        {draft.trait === trait && (pickedTrait
                          ? <Icon name="check" size={13} />
                          : <span className="default-badge">默认</span>)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="life-import">
                  <div className="life-import-heading">
                    <div>
                      <b>带入人生经历</b>
                      <small>你现实里的底子，会揉进主角的来历里</small>
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
                      <p className="field-hint">这是你现实里的底子，会揉进主角的来历里——和前面选的虚构身份并不冲突。建议用昵称或虚构内容。选择 Gemini 时，设定会发送给模型服务。</p>
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
              <div className="forge-section-heading mini ability-heading">
                <div>
                  <h3>想拥有什么能力？</h3>
                  <p className="field-hint">{isCustom
                    ? "创世神世界没有现成的能力池：候选来自你选的写法（或通用池），也可以写一个自己的。不选直接继续，会从候选里随机落定一个。"
                    : "候选分两组：上面是所选题材的招牌能力，下面是这个世界的本事。不选直接继续，会从候选里随机落定一个。"}</p>
                </div>
              </div>
              {abilityGroups.map((group) => (
                <div key={group.kind} className="ability-group">
                  <h4 className="ability-group-title">{abilityGroupTitle(group.kind)}</h4>
                  <div className="ability-list">
                    {group.items.map((item) => (
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
                  </div>
                </div>
              ))}
              <div className="ability-list ability-list-tail">
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
                    <h3>故事风格{pickedTone ? "" : "（默认）"}</h3>
                  </div>
                </div>
                <div className="tone-grid">
                  {tones.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`tone-card tone-${item.id} ${toneId === item.id && pickedTone ? "active" : ""}`}
                      aria-pressed={toneId === item.id}
                      onClick={() => { setPickedTone(true); setToneId(item.id); }}
                    >
                      <b>{item.name}</b>
                      <small>{item.desc}</small>
                      {toneId === item.id && !pickedTone && <span className="default-badge">默认</span>}
                    </button>
                  ))}
                </div>
              </div>
              {!avatar && !draft.avatarId && avatarLoaded && (
                <p className="avatar-create-line">
                  还没有化身？
                  <button type="button" className="small-link" onClick={onOpenAvatar}>先创建一位</button>
                  ——之后每本书都能带 TA 进去，这本书也可以回来带上。
                </p>
              )}
            </>
          )}
          {step === 5 && (
            <>
              <div className="forge-section-heading">
                <div>
                  <h2 tabIndex={-1}>确认你的故事</h2>
                </div>
              </div>
              <div className="opening-preview opening-preview--summary">
                <div className="opening-art opening-art--slim"><WorldArtwork genreId={world.id} eager /></div>
                <h3>{world.name}</h3>
                <p>{previewText}</p>
              </div>
              <div className="opening-details" aria-label="确认故事设定">
                {isCustom ? (
                  <button disabled={busy} onClick={() => setStep(2)} aria-label="修改创世设定"><span>创世</span><b>{template ? template.fullName : "完全自由"} · {world.name}</b><Icon name="chevron" size={15} /></button>
                ) : (
                  <>
                    <button disabled={busy} onClick={() => setStep(1)} aria-label="修改题材"><span>题材</span><b>{template ? twoSegmentTemplateName(template) : "完全自由"}{template && !pickedTemplate ? "（默认）" : ""}</b><Icon name="chevron" size={15} /></button>
                    <button disabled={busy} onClick={() => setStep(2)} aria-label="修改世界"><span>世界</span><b>{world.name}</b><Icon name="chevron" size={15} /></button>
                  </>
                )}
                <button disabled={busy} onClick={() => setStep(3)} aria-label="修改出身"><span>身份</span><b>{identity ? (localIdentityTitle(spawnGenre, identity.id) !== identity.name ? `${identity.name} · ${localIdentityTitle(spawnGenre, identity.id)}` : identity.name) : (draft.origin || "未定")}</b><Icon name="chevron" size={15} /></button>
                <button disabled={busy} onClick={() => setStep(3)} aria-label="修改出生点"><span>出生点</span><b>{spawn ? spawn.name : "由设定决定"}{!isCustom && spawn && !draft.startPointName ? "（默认）" : ""}</b><Icon name="chevron" size={15} /></button>
                <button disabled={busy} onClick={() => setStep(4)} aria-label="修改主角设定"><span>主角</span><b>{draft.name || "未命名旅人"} · {draft.trait}{pickedTrait ? "" : "（默认）"}</b><Icon name="chevron" size={15} /></button>
                {draft.immersive && (
                  <button disabled={busy} onClick={() => setStep(4)} aria-label="修改人生经历"><span>人生经历</span><b>已带入</b><Icon name="chevron" size={15} /></button>
                )}
                <button disabled={busy} onClick={() => setStep(4)} aria-label="修改能力"><span>能力</span><b>{abilityName || "未定"}</b><Icon name="chevron" size={15} /></button>
                <button disabled={busy} onClick={() => setStep(4)} aria-label="修改故事风格"><span>风格</span><b>{tone.name}{pickedTone ? "" : "（默认）"}</b><Icon name="chevron" size={15} /></button>
              </div>
              <div className="opening-starmap">
                <StoryMapMini total={mapTotalFor(totalChaptersFor({ config: draft }), 0, 0)} generated={0} current={0} state={null} />
              </div>
              <div className="length-picker" role="group" aria-label="篇幅">
                <span className="field-label">篇幅 · {lengthLabelFor({ config: draft })}{pickedLength ? "" : "（默认）"}</span>
                <div className="stage-chips">
                  <button
                    type="button"
                    className={`stage-chip ${draft.storyLengthMode === "season" ? "selected" : ""}`}
                    aria-pressed={draft.storyLengthMode === "season"}
                    onClick={() => pickLengthMode("season")}
                  >
                    一季 · 24 章
                  </button>
                  <button
                    type="button"
                    className={`stage-chip ${draft.storyLengthMode === "long" ? "selected" : ""}`}
                    aria-pressed={draft.storyLengthMode === "long"}
                    onClick={() => pickLengthMode("long")}
                  >
                    长线 · 100 章
                  </button>
                  <button
                    type="button"
                    className={`stage-chip ${draft.storyLengthMode === "custom" ? "selected" : ""}`}
                    aria-pressed={draft.storyLengthMode === "custom"}
                    onClick={() => pickLengthMode("custom")}
                  >
                    自定义
                  </button>
                  <button
                    type="button"
                    className={`stage-chip ${draft.storyLengthMode === "endless" ? "selected" : ""}`}
                    aria-pressed={draft.storyLengthMode === "endless"}
                    onClick={() => pickLengthMode("endless")}
                  >
                    无限连载
                  </button>
                </div>
                {draft.storyLengthMode === "custom" && (
                  <div className="length-custom">
                    <button type="button" aria-label="减少章数" onClick={() => commitCustomLength(String((validTargetChapters(draft.targetChapters) ?? 36) - 1))}>−</button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={CUSTOM_LENGTH_MIN}
                      max={CUSTOM_LENGTH_MAX}
                      aria-label="自定义章数"
                      value={customLengthText}
                      onChange={(event) => setCustomLengthText(event.target.value)}
                      onBlur={() => commitCustomLength(customLengthText)}
                      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                    />
                    <span>章</span>
                    <button type="button" aria-label="增加章数" onClick={() => commitCustomLength(String((validTargetChapters(draft.targetChapters) ?? 36) + 1))}>+</button>
                  </div>
                )}
                <p className="field-hint">{draft.storyLengthMode === "long"
                  ? "一百章长线：分 4 弧推进，每弧末尾有大节点，适合慢慢养一个世界。"
                  : draft.storyLengthMode === "custom"
                    ? `${CUSTOM_LENGTH_MIN}–${CUSTOM_LENGTH_MAX} 章自己定：分 4 幕推进，幕末小升格，末章大升格收尾。`
                    : draft.storyLengthMode === "endless"
                      ? "没有终点：每 12 章一个小升格，写到你亲手完结为止。连载中也能发布到广场，新章会自己跟上。"
                      : "二十四章一季：分 4 幕，幕末小升格、季终大升格；读完一季可以开启下一季。"}</p>
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
                {step < 5 ? (
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
        {step !== 5 && (
          <PreviewPanel
            world={world}
            template={template}
            draft={draft}
            ability={abilityPick}
            tone={tone}
            spawn={spawn}
            onJump={(value) => { if (!busy) setStep(value); }}
          />
        )}
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
  // A running endless line has no total to enumerate: list the chapters
  // that exist plus the one being written, never an unbounded range.
  const total = mapTotalFor(totalChaptersFor(story), story.chapters?.length || 0, index);
  const last = lastAccessibleIndex(story, readOnly);
  const listRef = useRef(null);
  // A season runs 24 chapters and a long book 100, at 56px a row: opening
  // the directory at scroll position zero strands the reader far from the
  // chapter they are on. Center the current row inside the dialog's own
  // scrollport on open — rect math against the dialog only, so the page
  // behind the modal never moves.
  useEffect(() => {
    // WebKit settles the top-layer dialog's layout a beat after open: an
    // early attempt can read a not-yet-scrollable box and clamp to zero.
    // The math is position-relative, so re-applying it converges — retry
    // briefly until the row actually sits inside the dialog. The loop is
    // timer-driven, not rAF: headless WebKit produces no frames for an
    // occluded page, which would starve an rAF-scheduled first attempt.
    let cancelled = false;
    let timer = 0;
    let attempts = 0;
    const attempt = () => {
      if (cancelled) return;
      const list = listRef.current;
      const row = list?.querySelector('[aria-current="page"]');
      const dialog = list?.closest("dialog");
      if (row && dialog) {
        const dialogBox = dialog.getBoundingClientRect();
        const rowBox = row.getBoundingClientRect();
        if (dialogBox.height > 0 && rowBox.height > 0) {
          dialog.scrollTop += (rowBox.top - dialogBox.top) - (dialog.clientHeight - rowBox.height) / 2;
          const after = row.getBoundingClientRect();
          if (after.top >= dialogBox.top && after.bottom <= dialogBox.bottom) return;
        }
      }
      attempts += 1;
      if (attempts < 12) timer = window.setTimeout(attempt, 60);
    };
    timer = window.setTimeout(attempt, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);
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
      <div className="chapter-directory-list" ref={listRef}>
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
                : chapter?.interventions?.length
                  ? "介入"
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

// 介入： the reader reaches into the worldline from outside the story.
// The sheet is framed in-world — a nameless force, not a remote control
// for the protagonist — and it can only ever aim at the next unread
// chapter, which it names before anything is submitted.
function InterventionSheet({ story, readerIndex, onClose, onSubmit }) {
  const [text, setText] = useState("");
  const [chipId, setChipId] = useState("");
  const [error, setError] = useState("");
  const target = interventionTargetIndex(story, readerIndex);
  const queued = target === null ? [] : queuedInterventionsFor(story, target);
  const targetWritten = target !== null && target < (story.chapters?.length || 0);
  const submit = () => {
    if (chipId) {
      onSubmit({ kind: "chip", chipId });
      return;
    }
    const trimmed = text.trim();
    const violation = findSettingViolation(trimmed);
    if (violation) {
      setError(violation);
      return;
    }
    onSubmit({ kind: "text", text: trimmed });
  };
  return (
    <ReadingDialog title="介入 · 扰动世界线" onClose={onClose}>
      <p className="intervention-lede">
        这个世界之外，有一股无名的力量。当它伸手时，巧合会发生，异象会出现，某个人会提前抵达——故事里的人不会知道，只会觉得风向变了。
      </p>
      {target === null ? (
        <p className="intervention-ended">
          {isStoryComplete(story)
            ? "这条故事线已经走完，世界线就此定格，不再接受新的扰动。想让命运再动，下次请在故事结束之前伸手。"
            : "你回到了较早的章节——那些章节已经是定局，后面的故事正站在它们之上。介入只能落在阅读前沿的那一章，读到最新章节时再伸手。"}
        </p>
      ) : (
        <>
          <p className="intervention-target">
            你的介入将落在<b>第 {target + 1} 章</b>
            {targetWritten
              ? "——那一章已经写好，介入会让它带着这股力量重写一遍。"
              : "——那一章还没有写下，介入会随它一起生成。"}
            已经读过的章节，一个字都不会改。
          </p>
          <div
            className="intervention-chips"
            role="group"
            aria-label="现成的命运方向"
          >
            {INTERVENTION_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`choice-chip ${chipId === chip.id ? "active" : ""}`}
                aria-pressed={chipId === chip.id}
                onClick={() => {
                  setChipId(chipId === chip.id ? "" : chip.id);
                  setError("");
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <label className="intervention-field">
            <span>或者，亲手写下你想让命运推动的事</span>
            <textarea
              rows={3}
              maxLength={INTERVENTION_TEXT_MAX}
              value={text}
              placeholder="例如：让那位失踪的守灯人今晚回到港边"
              onChange={(event) => {
                setText(event.target.value);
                setError("");
              }}
            />
            <small>
              {text.length} / {INTERVENTION_TEXT_MAX}
            </small>
          </label>
          <p className="intervention-hint">
            写给这个世界，而不是主角：一件会发生的事——一场雨、一个人的到来、一次运气的转向。
          </p>
          {queued.length > 0 && (
            <div className="intervention-queued">
              <b>已排队 · 将合并生效</b>
              {queued.map((entry) => (
                <p key={entry.id}>{entry.text}</p>
              ))}
            </div>
          )}
          {error && (
            <p className="intervention-error" role="alert">
              {error}
            </p>
          )}
          <div className="reading-dialog-actions">
            <Button
              icon="ripple"
              disabled={!text.trim() && !chipId}
              onClick={submit}
            >
              {targetWritten ? "介入并重写下一章" : "介入下一章"}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              先不介入
            </Button>
          </div>
        </>
      )}
    </ReadingDialog>
  );
}

// 正文编辑 (generation control): the owner rewrites the frontier
// chapter's prose in their own words. Paragraph-level plain text is the
// whole editor — no formatting, no versions. Saving is final: the
// edited text becomes the chapter's canon and later chapters continue
// from it; once the next chapter exists, this editor never opens for
// this chapter again.
function ProseEditor({ chapter, onClose, onSave }) {
  const [paragraphs, setParagraphs] = useState(() => [...(chapter.paragraphs || [])]);
  const [error, setError] = useState("");
  const patchParagraph = (position, value) =>
    setParagraphs((list) => list.map((item, index) => (index === position ? value : item)));
  const save = () => {
    const cleaned = paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean);
    if (!cleaned.length) {
      setError("正文不能为空，至少留下一段。");
      return;
    }
    onSave(cleaned);
  };
  return (
    <ReadingDialog title="编辑正文 · 本章" onClose={onClose}>
      <p className="field-hint">
        这是最新章节，它的下一章还没有生成——现在改还来得及。改动保存后就是这本书的正文，后面的章节会接着你改过的文字往下写；下一章一旦生成，这一章就此定稿，再不能改。
      </p>
      {paragraphs.map((paragraph, position) => (
        <div className="prose-editor-row" key={position}>
          <textarea
            rows={Math.min(10, Math.max(2, Math.ceil((paragraph.length || 1) / 36)))}
            maxLength={4000}
            value={paragraph}
            aria-label={`正文第 ${position + 1} 段`}
            onChange={(event) => patchParagraph(position, event.target.value)}
          />
          <button
            type="button"
            className="small-link"
            onClick={() => setParagraphs((list) => list.filter((_, index) => index !== position))}
          >
            删除这段
          </button>
        </div>
      ))}
      <button
        type="button"
        className="small-link"
        onClick={() => setParagraphs((list) => [...list, ""])}
      >
        + 加一段
      </button>
      {error && (
        <p className="intervention-error" role="alert">
          {error}
        </p>
      )}
      <div className="reading-dialog-actions">
        <Button onClick={save}>保存正文</Button>
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
      </div>
    </ReadingDialog>
  );
}

// 设定集 (F-32): the owner's own settings book for this story — the
// world bible and the lorebook, viewable and editable at last. Edits
// follow the intervention immutability rule: they shape chapters
// generated after the edit; chapters that already exist never change.
// The lorebook shown here is the owner's private material (imported or
// hand-written): it appears in no public snapshot, ever.
function StorySettingsBook({ story, onClose, onSave }) {
  const [premise, setPremise] = useState(story.worldBible?.premise || "");
  const [rules, setRules] = useState(() => [...(story.worldBible?.rules || [])]);
  const [endingAnchor, setEndingAnchor] = useState(story.worldBible?.endingAnchor || "");
  const [entries, setEntries] = useState(() =>
    (Array.isArray(story.config?.lorebook) ? story.config.lorebook : []).map((entry) => ({
      ...entry,
      keys: [...(entry.keys || [])],
    })),
  );
  const [stylePreset, setStylePreset] = useState(() => stylePresetOf(story).id);
  const outline = Array.isArray(story.worldBible?.outline) ? story.worldBible.outline : [];
  const interventions = Array.isArray(story.interventions) ? story.interventions : [];
  const patchEntry = (position, patch) =>
    setEntries((list) => list.map((entry, index) => (index === position ? { ...entry, ...patch } : entry)));
  const addEntry = () =>
    setEntries((list) => [
      ...list,
      { id: `lore-${Date.now().toString(36)}-${list.length}`, name: "", keys: [], content: "", constant: false, enabled: true, source: "manual" },
    ]);
  const save = () =>
    onSave({
      worldBible: {
        premise: premise.trim(),
        rules: rules.map((rule) => rule.trim()).filter(Boolean),
        endingAnchor: endingAnchor.trim(),
      },
      lorebook: entries
        .filter((entry) => (entry.content || "").trim())
        .map((entry) => ({ ...entry, name: (entry.name || "").trim() })),
      stylePreset,
    });
  return (
    <ReadingDialog title="设定集" onClose={onClose}>
      <p className="field-hint">
        这本书的世界设定都在这里。在这里改，只影响之后生成的章节——已经写好的章节，一个字都不会动。
      </p>
      <div className="settings-section">
        <h3>世界圣经</h3>
        <label className="field-label">
          世界核心
          <textarea rows={4} maxLength={1000} value={premise} onChange={(event) => setPremise(event.target.value)} />
        </label>
        <span className="field-label">世界规则</span>
        {rules.map((rule, position) => (
          <div className="settings-rule-row" key={position}>
            <textarea
              rows={2}
              maxLength={600}
              value={rule}
              aria-label={`世界规则 ${position + 1}`}
              onChange={(event) =>
                setRules((list) => list.map((item, index) => (index === position ? event.target.value : item)))
              }
            />
            <button
              type="button"
              className="small-link"
              onClick={() => setRules((list) => list.filter((_, index) => index !== position))}
            >
              删除
            </button>
          </div>
        ))}
        {rules.length < 12 && (
          <button type="button" className="small-link" onClick={() => setRules((list) => [...list, ""])}>
            + 添加一条规则
          </button>
        )}
        <label className="field-label">
          终局锚点
          <textarea rows={3} maxLength={1000} value={endingAnchor} onChange={(event) => setEndingAnchor(event.target.value)} />
        </label>
        {outline.length > 0 && (
          <>
            <span className="field-label">大纲（由故事结构生成，只读）</span>
            <ol className="settings-outline">
              {outline.map((line, position) => (
                <li key={position}>{line}</li>
              ))}
            </ol>
          </>
        )}
      </div>
      <div className="settings-section">
        <h3>世界书条目</h3>
        <p className="field-hint">
          条目是这本书的私有资料（导入的，或你自己写的），只在你自己的书里生效，永远不会出现在广场和分享里。常驻条目每章都带上；带关键词的条目，在章节上下文出现关键词时才注入。注入有总量上限，常驻优先。
        </p>
        {entries.length === 0 && <p className="field-hint">还没有条目。在造世的世界一步导入世界书，或在下面自己写一条。</p>}
        {entries.map((entry, position) => (
          <div className="lore-entry" key={entry.id || position}>
            <div className="lore-entry-head">
              <input
                value={entry.name}
                maxLength={60}
                placeholder="条目名（例如：潮汐税法）"
                aria-label={`条目 ${position + 1} 名字`}
                onChange={(event) => patchEntry(position, { name: event.target.value })}
              />
              <button
                type="button"
                className="small-link"
                onClick={() => setEntries((list) => list.filter((_, index) => index !== position))}
              >
                删除
              </button>
            </div>
            <input
              value={(entry.keys || []).join("、")}
              placeholder="触发关键词（逗号分隔，例如：潮汐税、税吏）"
              aria-label={`条目 ${position + 1} 关键词`}
              onChange={(event) =>
                patchEntry(position, {
                  keys: event.target.value.split(/[,，、]/).map((key) => key.trim()).filter(Boolean),
                })
              }
            />
            <textarea
              rows={3}
              maxLength={2000}
              value={entry.content}
              placeholder="这一条要告诉生成的世界事实，原文照录"
              aria-label={`条目 ${position + 1} 内容`}
              onChange={(event) => patchEntry(position, { content: event.target.value })}
            />
            <div className="lore-entry-toggles">
              <button
                type="button"
                className={`choice-chip ${entry.constant ? "active" : ""}`}
                aria-pressed={Boolean(entry.constant)}
                onClick={() => patchEntry(position, { constant: !entry.constant })}
              >
                常驻
              </button>
              <button
                type="button"
                className={`choice-chip ${entry.enabled ? "active" : ""}`}
                aria-pressed={Boolean(entry.enabled)}
                onClick={() => patchEntry(position, { enabled: entry.enabled === false ? true : false })}
              >
                {entry.enabled === false ? "已停用" : "启用中"}
              </button>
              {entry.source === "worldbook" && <span className="lore-entry-source">来自导入的世界书</span>}
              {entry.source === "text" && <span className="lore-entry-source">来自导入的设定文本</span>}
            </div>
          </div>
        ))}
        <button type="button" className="small-link" onClick={addEntry}>
          + 写一条新条目
        </button>
      </div>
      <div className="settings-section">
        <h3>文风预设</h3>
        <p className="field-hint">
          预设只调整节奏与质地，管不了剧情：故事的剧情感、回执密度和代价口径由文笔总则保证，任何预设都不会覆盖它。切换只影响之后生成的章节，已经写好的章节不变。
        </p>
        <div className="preset-list" role="radiogroup" aria-label="文风预设">
          {STYLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={stylePreset === preset.id}
              className={`preset-row ${stylePreset === preset.id ? "active" : ""}`}
              onClick={() => setStylePreset(preset.id)}
            >
              <b>{preset.label}</b>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>
      </div>
      {interventions.length > 0 && (
        <div className="settings-section">
          <h3>介入记录</h3>
          {interventions.map((entry) => (
            <p className="settings-intervention" key={entry.id}>
              第 {(entry.targetIndex ?? 0) + 1} 章 · {entry.text}
              <span>{entry.status === "applied" ? "已落地" : "等待那一章"}</span>
            </p>
          ))}
        </div>
      )}
      <div className="reading-dialog-actions">
        <Button onClick={save}>保存设定集</Button>
        <Button variant="ghost" onClick={onClose}>
          关闭
        </Button>
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
  onReviseChapter,
  onRerollChapter,
  onStartNextSeason,
  authClient,
  onRerollCover,
  authSignal = "",
}) {
  const [snapshotIndex, setSnapshotIndex] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [finishConfirm, setFinishConfirm] = useState(false);
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
  const [interveneOpen, setInterveneOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [intervening, setIntervening] = useState(false);
  const [interveneSettled, setInterveneSettled] = useState(false);
  const [interveneNote, setInterveneNote] = useState("");
  const [rerollConfirm, setRerollConfirm] = useState(false);
  const [rerolling, setRerolling] = useState(false);
  const [rerollSettled, setRerollSettled] = useState(false);
  const [proseOpen, setProseOpen] = useState(false);
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
    blocked: preferencesOpen || toolsOpen || directoryOpen || shareOpen || interveneOpen || settingsOpen || proseOpen });
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
    setInterveneOpen(false);
    setSettingsOpen(false);
    setInterveneNote("");
    setRerollConfirm(false);
    setProseOpen(false);
    setError("");
  }, [story?.id, story?.revision, readOnly]);

  // The intervention overlay is NOT reset by story revisions: showing it
  // is what causes the revision that lands the revised chapter, and its
  // own sequence decides when it leaves. Only a different story (or the
  // read-only flip) clears it.
  useEffect(() => {
    setIntervening(false);
    setInterveneSettled(false);
  }, [story?.id, readOnly]);

  // The re-roll overlay follows the same rule as the intervention one:
  // the pass it presents is what bumps the revision, so only a different
  // story (or the read-only flip) may clear it.
  useEffect(() => {
    setRerolling(false);
    setRerollSettled(false);
  }, [story?.id, readOnly]);

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
  const total = totalChaptersFor(story);
  const lengthMode = storyLengthModeOf(story);
  // A running endless line: no denominator anywhere — the position reads
  // as a serialising count, progress is measured against what exists,
  // and the map shows the chapters written plus the one being written.
  const serializing = lengthMode === "endless" && !isManuallyFinished(story);
  const displayTotal = mapTotalFor(total, story.chapters?.length || 0, index);
  const nextAvailable = index < lastAccessibleIndex(story, readOnly);
  const isFinal = index >= total - 1
    || (lengthMode === "endless" && isManuallyFinished(story) && index >= (story.chapters?.length || 1) - 1);
  const progress = Number.isFinite(total)
    ? `${Math.round(((index + 1) / total) * 100)}%`
    : `${Math.round(((index + 1) / Math.max(story.chapters?.length || 0, index + 1)) * 100)}%`;
  const update = (nextStory, nextIndex = index) =>
    onUpdateStory?.(moveReadingPosition(nextStory, nextIndex));
  // 设定集 saves: bible + lorebook + style preset land on the story
  // record and shape only chapters generated from now on (the engine
  // helpers never touch chapters). The reading position is preserved
  // by `update`.
  const saveSettings = ({ worldBible, lorebook, stylePreset }) => {
    const next = updateStylePreset(updateLorebook(updateWorldBible(story, worldBible), lorebook), stylePreset);
    update(next);
    setSettingsOpen(false);
  };
  // 生成控制 (frontier levers): this chapter may still be re-rolled or
  // edited by hand while it is the latest one written — no later chapter
  // exists yet. Both levers vanish by omission everywhere else; earlier
  // chapters offer nothing, which is their locked state.
  const isFrontier = !readOnly && isFrontierChapter(story, index) && Boolean(story.chapters?.[index]);
  // 换一版： the frontier chapter is regenerated from the brief and
  // context as of its slot; the version it replaces is discarded (there
  // is no version stack — the note in the confirm row says so before
  // the tap). A gemini line runs the pass over the same endpoint and
  // quota path as any generation; a local line rotates its revision
  // and rebuilds the same slot in place. If the next chapter lands
  // first, the engine refuses the swap and the chapter simply locks.
  const submitReroll = async () => {
    if (readOnly || rerolling || intervening || !isFrontier) return;
    const target = index;
    setRerollConfirm(false);
    setError("");
    if (story.engine === "gemini" && onRerollChapter) {
      setRerolling(true);
      setRerollSettled(false);
      try {
        await onRerollChapter(story.id, target);
        setRerollSettled(true);
      } catch (failure) {
        setRerolling(false);
        setError(failure.message || "换一版没能完成，这一章还是原来的样子。");
      }
      return;
    }
    try {
      const rotated = beginChapterReroll(story, target);
      const rebuilt = replaceFrontierChapter(rotated, buildChapter(rotated, target), chapterKey(rotated, target));
      if (rebuilt === rotated) throw new Error("这一章没能换成新的一版。");
      setRerolling(true);
      setRerollSettled(false);
      update(rebuilt);
      setRerollSettled(true);
    } catch (failure) {
      setError(failure.message || "换一版没能完成，这一章还是原来的样子。");
    }
  };
  // 编辑正文： the owner's words replace the frontier chapter's prose
  // verbatim and become its canon — later chapters are generated from
  // the story record, so they continue from the edited tail.
  const saveProse = (paragraphs) => {
    try {
      const next = updateChapterProse(story, index, paragraphs);
      if (next === story) {
        setProseOpen(false);
        setError("这一章已经定稿，不能再改了。");
        return;
      }
      update(next);
      setProseOpen(false);
    } catch (failure) {
      setProseOpen(false);
      setError(failure.message || "正文没能保存。");
    }
  };
  // 介入： the nudge is queued against the next unread chapter — never the
  // one on screen, never an earlier one. Three landings, one queue:
  // the target is not written yet (the nudge folds into its brief), the
  // target is a local scaffold chapter (retract + rematerialize), or the
  // target is a generated chapter (a revision pass over the same quota
  // path as any generation). The reader's place never moves.
  const submitIntervention = async (payload) => {
    if (readOnly || intervening) return;
    const target = interventionTargetIndex(story, index);
    let queuedStory;
    try {
      queuedStory = queueIntervention(story, { ...payload, readerIndex: index });
    } catch (failure) {
      setInterveneOpen(false);
      setError(failure.message);
      return;
    }
    setInterveneOpen(false);
    setError("");
    const targetExists = target !== null && target < (story.chapters?.length || 0);
    if (!targetExists) {
      update(queuedStory);
      setInterveneNote(`介入已记下，将落在第 ${(target ?? index) + 1} 章。`);
      return;
    }
    setIntervening(true);
    setInterveneSettled(false);
    if (story.engine === "gemini" && onReviseChapter) {
      try {
        await onReviseChapter(story.id, target, queuedStory);
        setInterveneSettled(true);
      } catch (failure) {
        // The queue was landed before the pass ran, so the nudge survives
        // the failure and folds into the chapter's next generation.
        setIntervening(false);
        setError(failure.message || "重写没能完成，介入还排在队列里。");
      }
      return;
    }
    const retracted = retractChapter(queuedStory, target);
    update(retracted);
    setInterveneSettled(true);
  };
  const goToChapter = (target) => {
    if (target < 0 || target > lastAccessibleIndex(story, readOnly)) return;
    setDirectoryOpen(false);
    setError("");
    if (readOnly) setSnapshotIndex(target);
    else update(story, target);
  };
  const handleNext = () => {
    if (readOnly) {
      if (nextAvailable) goToChapter(index + 1);
      return;
    }
    if (isFinal) return;
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
            aria-valuemax={displayTotal}
            aria-valuenow={index + 1}
            aria-valuetext={serializing ? `第 ${index + 1} 章，连载中` : `第 ${index + 1} 章，共 ${total} 章`}
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
              className="reader-directory-button"
              onClick={() => setSettingsOpen(true)}
              aria-haspopup="dialog"
            >
              <Icon name="sliders" size={16} />
              设定集
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
          {chapter.interventions?.length > 0 && (
            <div className="intervention-marker" role="note">
              <Icon name="ripple" size={16} />
              <div>
                <b>命运在这一章伸过手</b>
                {chapter.interventions.map((entry, entryIndex) => (
                  <p key={entryIndex}>{entry.text}</p>
                ))}
              </div>
            </div>
          )}
          {interveneNote && (
            <p className="intervention-note" role="status">
              <Icon name="ripple" size={14} />
              {interveneNote}
            </p>
          )}
          {isFrontier && (
            <div className="frontier-actions">
              <p className="frontier-note">
                这是最新章节，它的下一章还没有生成——现在还能亲手调度这一章。下一章一旦写下，这一章就此定稿。
              </p>
              {rerollConfirm ? (
                <div className="frontier-buttons">
                  <Button variant="secondary" onClick={submitReroll}>
                    确认换掉这一版
                  </Button>
                  <button
                    type="button"
                    className="reader-directory-button"
                    onClick={() => setRerollConfirm(false)}
                  >
                    再想想
                  </button>
                  <span className="frontier-warn">换掉的版本不会保留，也没有历史版本可以找回。</span>
                </div>
              ) : (
                <div className="frontier-buttons">
                  <button
                    type="button"
                    className="reader-directory-button"
                    onClick={() => setRerollConfirm(true)}
                  >
                    <Icon name="reroll" size={15} />
                    换一版
                  </button>
                  <button
                    type="button"
                    className="reader-directory-button"
                    onClick={() => setProseOpen(true)}
                    aria-haspopup="dialog"
                  >
                    <Icon name="pencil" size={15} />
                    编辑正文
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="reader-starmap">
            <div className="reader-starmap-head">
              <b>剧情星图</b>
              <span>{serializing ? `连载中 · 第 ${index + 1} 章` : `第 ${index + 1} / ${total} 章`}</span>
            </div>
            <StoryMapMini
              total={displayTotal}
              generated={story.chapters?.length || 0}
              current={index}
              state={readOnly ? null : generationState({ total: displayTotal, generated: story.chapters?.length || 0, current: index, engine: story.engine, preparing, complete: story.status === "complete" || isStoryComplete(story) })}
            />
          </div>
          {!readOnly && lengthMode === "endless" && !isManuallyFinished(story) && (
            <div className="reader-endless-actions">
              {finishConfirm ? (
                <>
                  <p>在第 {story.chapters?.length || 0} 章这里收尾？收尾后这条线就完结了，广场上的连载标记也会跟着转成完结。</p>
                  <div className="reader-endless-confirm">
                    <Button
                      variant="secondary"
                      onClick={() => { update(finishEndlessLine(story)); setFinishConfirm(false); }}
                    >
                      确认完结
                    </Button>
                    <button type="button" className="reader-directory-button" onClick={() => setFinishConfirm(false)}>再想想</button>
                  </div>
                </>
              ) : (
                <button type="button" className="reader-directory-button" onClick={() => setFinishConfirm(true)}>
                  完结这条线
                </button>
              )}
            </div>
          )}
          {!isFinal && (!readOnly || nextAvailable) && (
            <div className="sw-next-action">              <Button
                icon="arrow"
                onClick={handleNext}
                disabled={!readOnly && preparing && !nextAvailable}
              >
                {preparing && !nextAvailable ? "下一章准备中…" : generationError && !nextAvailable ? "重试下一章" : "下一章"}
              </Button>
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
                      : lengthMode === "endless"
                        ? "这条无限长线，在这里收尾了。"
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
        {focused ? <div className="reader-dock-actions">
            <button type="button" className="reader-focus-exit" onClick={() => setFocused(false)}>退出专注阅读</button>
            {!readOnly && <button type="button" className="reader-intervene-button" onClick={() => setInterveneOpen(true)} aria-haspopup="dialog"><Icon name="ripple" size={19}/><span>介入</span></button>}
          </div> :
          <div className="reader-dock-actions">
            <button type="button" onClick={() => setDirectoryOpen(true)} aria-haspopup="dialog"><Icon name="menu" size={19}/><span>目录</span></button>
            <button type="button" className="reader-dock-settings" aria-label="阅读设置" aria-haspopup="dialog" onClick={() => setPreferencesOpen(true)}><b aria-hidden="true">Aa</b><span>设置</span></button>
            <button type="button" onClick={openTools} aria-haspopup="dialog"><Icon name="search" size={19}/><span>查找</span></button>
            <button type="button" onClick={() => setFocused(true)}><Icon name="book" size={19}/><span>专注</span></button>
            {!readOnly && <button type="button" className="reader-intervene-button" onClick={() => setInterveneOpen(true)} aria-haspopup="dialog"><Icon name="ripple" size={19}/><span>介入</span></button>}
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
      {interveneOpen && !readOnly && (
        <InterventionSheet
          story={story}
          readerIndex={index}
          onClose={() => setInterveneOpen(false)}
          onSubmit={submitIntervention}
        />
      )}
      {settingsOpen && !readOnly && (
        <StorySettingsBook
          story={story}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
        />
      )}
      {proseOpen && !readOnly && chapter && (
        <ProseEditor
          chapter={chapter}
          onClose={() => setProseOpen(false)}
          onSave={saveProse}
        />
      )}
      {intervening && (
        <InterventionOverlay
          settled={interveneSettled}
          onDone={() => setIntervening(false)}
        />
      )}
      {rerolling && (
        <InterventionOverlay
          settled={rerollSettled}
          onDone={() => setRerolling(false)}
          title="正在为这一章换一版"
          ariaLabel="正在重写本章"
          stages={["收回这一章", "重新写下这一章", "落定"]}
          notes={[
            "旧的一版会被换掉，不再保留。",
            "这一章正按它原来的线索、介入与设定重新成形。",
            "新的一版已经落定。",
          ]}
        />
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
  // The server resolves the author's picture through their profile
  // record (uploaded picture → avatar portrait → the designed default
  // avatar), so there is always a real image to show — never an empty
  // circle or an initial tile. A failed load falls back to the same
  // default asset rather than to nothing.
  const resolved = publication?.avatar?.pictureUrl || "/default-avatar.svg";
  const [src, setSrc] = useState(resolved);
  useEffect(() => { setSrc(resolved); }, [resolved]);
  return (
    <img
      className={`plaza-avatar-img ${large ? "is-large" : ""}`}
      src={src}
      alt=""
      loading="lazy"
      onError={() => { if (src !== "/default-avatar.svg") setSrc("/default-avatar.svg"); }}
    />
  );
}

function PlazaCard({ publication, own, onOpen, onRead, onEnter, onOpenProfile }) {
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
          {onOpenProfile && publication.authorUid ? (
            <button
              type="button"
              className="plaza-author-link"
              onClick={() => onOpenProfile(publication.authorUid)}
              aria-label={`打开 ${publication.authorName} 的主页`}
            >
              <PlazaAvatarThumb publication={publication} />
              <span className="plaza-avatar-name">{publication.avatar?.name}</span>
              <span className="plaza-author">作者 · {publication.authorName}</span>
            </button>
          ) : (
            <>
              <PlazaAvatarThumb publication={publication} />
              <span className="plaza-avatar-name">{publication.avatar?.name}</span>
              <span className="plaza-author">作者 · {publication.authorName}</span>
            </>
          )}
          {own && <span className="plaza-own-chip">我发布的</span>}
        </div>
        <div className="plaza-chips">
          <span className="plaza-chip">{publication.worldName}</span>
          <span className="plaza-chip-x" aria-hidden="true">×</span>
          <span className="plaza-chip">{templateName}</span>
        </div>
        <div className="plaza-meta">
          <span className="plaza-badge">{plazaLineStatusFor(publication) === "serializing" ? "连载中" : "已完结"}</span>
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

function PlazaFeed({ account, activeStory, onNavigate, onOpenStory, onOpenDetail, onReadLine, onEnter, onOpenProfile }) {
  const [feed, setFeed] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const mineIds = useMemo(() => plazaMineIds(), []);
  useEffect(() => {
    let live = true;
    setError("");
    const load = () => fetchPlazaFeed()
      .then(({ publications, onlineCount: count }) => {
        if (!live) return;
        setFeed(publications);
        setOnlineCount(count);
      })
      .catch(() => { if (live) { setFeed([]); setError("广场暂时没能打开，请稍后再试。"); } });
    void load();
    // The presence count must not go stale while the plaza sits open:
    // refetch on a slow tick (which also freshens the list itself).
    const timer = window.setInterval(() => { void load(); }, 60_000);
    return () => { live = false; window.clearInterval(timer); };
  }, [retry]);
  const activeTotal = activeStory ? totalChaptersFor(activeStory) : 0;
  const activeChapter = activeStory ? Math.min(activeTotal, readerIndexFor(activeStory) + 1) : 0;
  const activeSerializing = activeStory
    ? storyLengthModeOf(activeStory) === "endless" && !isManuallyFinished(activeStory)
    : false;
  return (
    <div className="page page-plaza page-enter">
      <header className="plaza-heading">
        <h1>广场</h1>
        {onlineCount >= 1 && (
          <span className="plaza-online" role="status">
            <span className="plaza-online-dot" aria-hidden="true" />
            {onlineCount} 人在线
          </span>
        )}
      </header>
      <p className="page-caption">别人走完的世界，正等你走进去。</p>

      <section className="plaza-publish-card">
        <div>
          <strong>把你的故事线放到广场</strong>
          <p>走完的故事线可以发布；无限连载的线连载中就能放上来，新章会自己跟上。</p>
        </div>
        <Button onClick={() => onNavigate("plaza-publish")}>发布 <Icon name="arrow" size={15} /></Button>
      </section>

      <button type="button" className="plaza-mine-row" onClick={() => onNavigate("home")}>
        <Icon name="book" size={20} />
        <span>
          <strong>我的世界</strong>
          <small>{activeStory ? `正在读《${activeStory.title}》 · ${activeSerializing ? `连载中 · 第 ${activeChapter} 章` : `第 ${activeChapter} / ${activeTotal} 章`}` : "你的书架、化身与草稿都在这里"}</small>
        </span>
        <Icon name="chevron" size={16} />
      </button>

      <div className="plaza-feed-heading">
        <h2>最新发布</h2>
        <span>完结的故事线，与连载中的无限长线</span>
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
              onOpenProfile={onOpenProfile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlazaDetail({ id, account, authClient, onNavigate, onReadLine, onEnter, onOpenAccount, onToast, onOpenProfile }) {
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
        {onOpenProfile && detail.authorUid ? (
          <button type="button" className="plaza-author plaza-author-button" onClick={() => onOpenProfile(detail.authorUid)}>
            作者 · {detail.authorName}
          </button>
        ) : (
          <span className="plaza-author">作者 · {detail.authorName}</span>
        )}
      </div>

      <section className="plaza-detail-cover">
        <WorldArtwork genreId={genre.id} />
        <span className="plaza-cover-shade" aria-hidden="true" />
        <div className="plaza-detail-cover-copy">
          <h1>《{detail.title}》</h1>
          <p>{detail.worldName} × {templateName} · {plazaLengthLabel(detail)} · {plazaLineStatusFor(detail) === "serializing" ? "连载中" : "已完结"}</p>
        </div>
      </section>

      <section className="plaza-panel plaza-avatar-panel">
        {onOpenProfile && detail.authorUid ? (
          <button
            type="button"
            className="plaza-avatar-profile-link"
            onClick={() => onOpenProfile(detail.authorUid)}
            aria-label={`打开 ${detail.authorName} 的主页`}
          >
            <PlazaAvatarThumb publication={detail} large />
          </button>
        ) : (
          <PlazaAvatarThumb publication={detail} large />
        )}
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

function formatProfileDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function EditProfileSheet({ profile, getToken, onClose, onSaved }) {
  const editable = profile.editable || {};
  // The name field starts from what the owner actually stored
  // (editable), never from the resolved public name — pre-filling the
  // fallback would silently save the avatar's name (or, before the
  // email guard, the account email) as a deliberate display name.
  const [displayName, setDisplayName] = useState(editable.displayName || "");
  const [handle, setHandle] = useState(editable.handle || "");
  const [handleState, setHandleState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pictureBusy, setPictureBusy] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const pictureKind = profile.picture?.kind || "default";
  const pictureStateLabel = pictureKind === "upload" ? "自定义图片" : pictureKind === "avatar" ? "化身立绘" : "默认头像";

  const checkHandle = async () => {
    const value = handle.trim().toLowerCase();
    if (!value || value === (editable.handle || "")) { setHandleState(null); return; }
    try {
      setHandleState(await checkHandleAvailable({ handle: value, getAccessToken: getToken }));
    } catch { setHandleState(null); }
  };

  const pickKind = async (kind) => {
    if (pictureBusy) return;
    setPictureBusy(kind);
    setError("");
    try {
      onSaved(await updateMyProfile({ patch: { pictureKind: kind }, getAccessToken: getToken }));
    } catch (failure) {
      setError(failure?.message || "头像没能切换，请稍后再试。");
    } finally { setPictureBusy(""); }
  };

  const onPickFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || pictureBusy) return;
    setPictureBusy("upload");
    setError("");
    try {
      const processed = await fileToSquareJpeg(file);
      onSaved(await uploadMyPicture({ ...processed, getAccessToken: getToken }));
    } catch (failure) {
      setError(failure?.message || "图片没能上传，请换一张试试。");
    } finally { setPictureBusy(""); }
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await updateMyProfile({
        patch: { displayName: displayName.trim(), handle: handle.trim().toLowerCase() || null },
        getAccessToken: getToken,
      });
      onSaved(next);
      onClose();
    } catch (failure) {
      if (failure?.code === "conflict") {
        setHandleState({ available: false, message: failure.message });
      }
      setError(failure?.message || "资料没能保存，请稍后再试。");
      setBusy(false);
    }
  };

  return (
    <div className="profile-edit-overlay" role="dialog" aria-modal="true" aria-label="编辑资料">
      <div className="profile-edit-sheet">
        <span className="ryan-sheet-handle" aria-hidden="true" />
        <div className="profile-edit-heading">
          <h2>编辑资料</h2>
          <button type="button" className="profile-edit-close" onClick={onClose} aria-label="关闭">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="profile-edit-picture">
          <span className={`profile-edit-preview-frame${pictureKind === "avatar" ? " is-portrait" : ""}`}>
            <img className="profile-edit-preview" src={profile.picture?.url || "/default-avatar.svg"} alt="" />
          </span>
          <div className="profile-edit-picture-copy">
            <strong>头像</strong>
            <small>现在使用的是：{pictureStateLabel}</small>
          </div>
        </div>
        <div className="profile-edit-picture-actions">
          <button type="button" disabled={Boolean(pictureBusy)} onClick={() => fileRef.current?.click()}>
            {pictureBusy === "upload" ? "上传中…" : "上传图片"}
          </button>
          <button
            type="button"
            disabled={Boolean(pictureBusy) || !editable.hasPortrait}
            onClick={() => void pickKind("avatar")}
            title={editable.hasPortrait ? "" : "还没有化身立绘"}
          >
            用化身立绘
          </button>
          <button type="button" disabled={Boolean(pictureBusy)} onClick={() => void pickKind("default")}>
            恢复默认
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => void onPickFile(event)} />
        </div>

        <label className="profile-edit-field">
          <span>显示名</span>
          <input
            value={displayName}
            maxLength={20}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="给自己起个名字"
          />
        </label>
        <label className="profile-edit-field">
          <span>@用户名</span>
          <input
            value={handle}
            maxLength={20}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => { setHandle(event.target.value); setHandleState(null); }}
            onBlur={() => void checkHandle()}
            placeholder="小写字母、数字、下划线"
          />
          {handleState && (
            <small className={`profile-edit-handle-state ${handleState.available ? "is-ok" : "is-bad"}`}>
              {handleState.message}
            </small>
          )}
        </label>

        {error && <p className="profile-edit-error" role="alert">{error}</p>}
        <button type="button" className="profile-edit-save" disabled={busy} onClick={() => void save()}>
          {busy ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}

// A line's face on the bookshelf: its OWN generated cover when the plaza
// payload carries one (resolved server-side from the cover store), the
// shared world artwork only as the fallback for lines never painted.
function ProfileCoverArt({ publication }) {
  const genre = genreById[publication.genreId] || GENRES[0];
  if (publication.coverUrl) {
    return <img className="profile-cover-img" src={publication.coverUrl} alt="" loading="lazy" />;
  }
  return <WorldArtwork genreId={genre.id} />;
}

// Stack geometry (gate7, front-cover-led — like a physical stack of
// books): the front card takes 62% of the tile width at full height, so
// at the tile's 1.25 aspect its face lands within a few percent of the
// covers' natural 3:4 and reads as an actual book cover, never a sliced
// sliver. Each further cover is the same card stepped 14px right behind
// the front one, showing only its edge (max 3 peeks, so at most 4 lines
// are stacked). No borders or seams anywhere: cards separate only
// through their own soft shadow, and the stack sits centered on the
// tile's dark ground.
const STACK_CARD_WIDTH_PCT = 62;
const STACK_STEP_PX = 14;

function ProfileBoardCollage({ board }) {
  const lines = board.publications || [];
  if (lines.length === 0) return <span className="profile-board-collage is-empty" aria-hidden="true" />;

  if (lines.length === 1) {
    const publication = lines[0];
    const genre = genreById[publication.genreId] || GENRES[0];
    const templateName = plazaTemplateNameFor(publication) || genre.label;
    // The side tiles are narrow: the length label is split at its own
    // separator so each tile leads with the short half ("全 24 章" /
    // "第 1 季 · 已完结") instead of wrapping mid-phrase.
    const lengthParts = plazaLengthLabel(publication).split(" · ");
    const lengthLead = lengthParts.length > 1 ? lengthParts[lengthParts.length - 1] : lengthParts[0];
    const lengthNote = plazaLineStatusFor(publication) === "serializing"
      ? "连载中"
      : lengthParts.length > 1 ? `${lengthParts.slice(0, -1).join(" · ")} · 已完结` : "已完结";
    return (
      <span className="profile-board-collage is-single" aria-hidden="true">
        <span className="profile-board-main">
          <ProfileCoverArt publication={publication} />
        </span>
        <span className="profile-board-side">
          <span className="profile-board-tile">
            <b>{lengthLead}</b>
            <small>{lengthNote}</small>
          </span>
          <span className="profile-board-tile">
            <b>{publication.worldName || genre.world}</b>
            <small>{templateName}</small>
          </span>
        </span>
      </span>
    );
  }

  const cards = lines.slice(0, 4);
  const stackWidth = `calc(${STACK_CARD_WIDTH_PCT}% + ${(cards.length - 1) * STACK_STEP_PX}px)`;
  return (
    <span className="profile-board-collage is-stack" aria-hidden="true">
      {cards.map((publication, index) => (
        <span
          className="profile-board-stack-layer"
          key={publication.id}
          style={{
            width: `${STACK_CARD_WIDTH_PCT}%`,
            left: `calc((100% - ${stackWidth}) / 2 + ${index * STACK_STEP_PX}px)`,
            zIndex: cards.length - index,
          }}
        >
          <ProfileCoverArt publication={publication} />
        </span>
      ))}
    </span>
  );
}

function ProfileBoardCard({ board, onOpen }) {
  return (
    <button
      type="button"
      className="profile-board-card"
      onClick={() => onOpen(board)}
      aria-label={`打开合集${board.title}，共 ${board.publications.length} 条故事线`}
    >
      <ProfileBoardCollage board={board} />
      <span className="profile-board-copy">
        <strong>{board.title}</strong>
        <small>{board.publications.length} 条故事线</small>
      </span>
    </button>
  );
}

function ProfileLineRow({ publication, onOpen }) {
  const genre = genreById[publication.genreId] || GENRES[0];
  const templateName = plazaTemplateNameFor(publication) || genre.label;
  return (
    <button type="button" className="profile-line-row" onClick={() => onOpen(publication)}>
      <span className="profile-line-art"><ProfileCoverArt publication={publication} /></span>
      <span className="profile-line-copy">
        <strong>{publication.title}</strong>
        <small>{publication.worldName || genre.world} × {templateName} · {plazaLengthLabel(publication)}</small>
        <small>{formatProfileDate(publication.publishedAt)}发布</small>
      </span>
      <Icon name="chevron" size={16} />
    </button>
  );
}

function ProfilePage({ uid, account, authClient, onNavigate, onOpenAccount, onOpenAvatar, onOpenDetail }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [segment, setSegment] = useState("boards");
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [shelfQuery, setShelfQuery] = useState("");
  const [sortMode, setSortMode] = useState("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pictureSrc, setPictureSrc] = useState("");
  const getToken = useCallback(() => authClient.getAccessToken(), [authClient]);
  const viewerUid = account.user?.uid || "";
  const { animate } = useMotionPolicy("profile");
  const pageRef = useRef(null);
  const tabsRef = useRef(null);
  const enteredUidRef = useRef("");
  // One orchestrated entrance (frontend-design playbook): the header
  // elements rise in a single staggered sequence when the profile first
  // paints — nothing loops, and the app's motion policy (user toggle,
  // prefers-reduced-motion, save-data) silences it entirely.
  useEffect(() => {
    if (!profile || !animate || !pageRef.current) return;
    if (enteredUidRef.current === profile.uid) return;
    enteredUidRef.current = profile.uid;
    const targets = pageRef.current.querySelectorAll("[data-enter]");
    if (!targets.length) return;
    gsap.fromTo(
      targets,
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.055, ease: "power3.out", clearProps: "transform,opacity" },
    );
  }, [profile, animate]);
  // The segment's white pill slides between 合集 / 全部 (GSAP, transform
  // only); with motion off it is set in place instantly.
  useEffect(() => {
    const pill = tabsRef.current?.querySelector("[data-segment-pill]");
    if (!pill) return;
    const xPercent = segment === "all" ? 100 : 0;
    if (animate) gsap.to(pill, { xPercent, duration: 0.32, ease: "power3.out" });
    else gsap.set(pill, { xPercent });
  }, [segment, animate, profile]);
  useEffect(() => {
    let live = true;
    setProfile(null);
    setError("");
    setNote("");
    setSegment("boards");
    setSelectedBoardId("");
    setShelfQuery("");
    setSortMode("newest");
    setSortOpen(false);
    setMenuOpen(false);
    setReported(false);
    setEditOpen(false);
    fetchUserProfile({ uid, getAccessToken: getToken })
      .then((next) => { if (live) setProfile(next); })
      .catch((failure) => {
        if (live) setError(failure?.code === "not-found" ? "这位用户还不存在。" : "暂时没能打开这个主页，请稍后再试。");
      });
    return () => { live = false; };
  }, [uid, getToken, viewerUid]);

  useEffect(() => { setPictureSrc(profile?.picture?.url || ""); }, [profile?.picture?.url]);

  if (error) {
    return (
      <div className="page page-profile page-enter">
        <div className="plaza-empty" role="alert">
          <h3>{error}</h3>
          <Button variant="secondary" onClick={() => onNavigate("plaza")}>回到广场</Button>
        </div>
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="page page-profile page-enter">
        <p className="plaza-loading" role="status">正在打开主页…</p>
      </div>
    );
  }

  const isSelf = Boolean(profile.viewerState?.isSelf);
  const following = Boolean(profile.viewerState?.isFollowing);
  // The printed identity goes through the client guard even though the
  // server resolves it too: an email-shaped value renders as the
  // avatar's name (or the neutral label), never as the title.
  const shownName = profileDisplayName(profile);
  const shownHandle = profileHandle(profile);
  const nameTier = [...shownName].length <= 8 ? "full" : [...shownName].length <= 16 ? "mid" : "long";
  const publications = profile.publications || [];
  const boards = profileBoardsFor(profile, sortMode);
  const selectedBoard = boards.find((board) => board.id === selectedBoardId) || null;
  const allLines = sortProfileLines(publications, sortMode);
  const searchResults = searchProfileLines(publications, shelfQuery, sortMode);
  const searching = shelfQuery.trim().length > 0;
  const sortOptions = [
    { id: "newest", label: "最新发布" },
    { id: "oldest", label: "最早发布" },
    { id: "title", label: "按标题" },
  ];

  const toggleFollow = async () => {
    if (busy) return;
    if (!account.user) { onOpenAccount(); return; }
    setBusy(true);
    setNote("");
    try {
      const result = following
        ? await unfollowUser({ uid, getAccessToken: getToken })
        : await followUser({ uid, getAccessToken: getToken });
      setProfile((current) => current ? {
        ...current,
        counts: { ...current.counts, followers: result.followers },
        viewerState: { ...current.viewerState, isFollowing: result.following },
      } : current);
    } catch (failure) {
      if (failure?.code === "auth-required") onOpenAccount();
      else setNote(failure?.message || "操作没能完成，请稍后再试。");
    } finally { setBusy(false); }
  };

  const shareProfile = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/profile/${encodeURIComponent(uid)}`;
    try {
      await navigator.clipboard.writeText(url);
      setNote("主页链接已复制。");
    } catch {
      setNote("没能复制链接，请稍后再试。");
    }
  };

  const reportThisUser = async () => {
    if (reported) return;
    if (!account.user) { onOpenAccount(); return; }
    try {
      await reportUser({ uid, getAccessToken: getToken });
      setReported(true);
      setMenuOpen(false);
      setNote("已收到你的举报，我们会来看。");
    } catch (failure) {
      if (failure?.code === "auth-required") onOpenAccount();
      else setNote(failure?.message || "举报没能送出，请稍后再试。");
    }
  };

  const copyProfileLink = async () => {
    setMenuOpen(false);
    await shareProfile();
  };

  return (
    <>
    <div className="page page-profile page-enter" ref={pageRef}>
      <div className="ryan-topbar" data-enter>
        <button type="button" className="ryan-glyph-btn" onClick={() => onNavigate("plaza")} aria-label="返回广场">
          <Icon name="chevron" size={22} className="rotate-180" />
        </button>
        <span className="ryan-topbar-actions">
          <button type="button" className="ryan-glyph-btn" onClick={() => void shareProfile()} aria-label="分享主页">
            <Icon name="share" size={22} />
          </button>
          <button
            type="button"
            className="ryan-glyph-btn"
            aria-label="更多操作"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name="dots" size={22} />
          </button>
        </span>
      </div>
      {menuOpen && (
        <div className="ryan-menu" role="menu">
          {!isSelf && (
            <button type="button" disabled={reported} onClick={() => void reportThisUser()}>
              {reported ? "已举报" : "举报该用户"}
            </button>
          )}
          <button type="button" onClick={() => void copyProfileLink()}>复制主页链接</button>
        </div>
      )}

      <div className="ryan-avatar-wrap" data-enter>
        <span className={`ryan-avatar-frame${profile.picture?.kind === "avatar" ? " is-portrait" : ""}`}>
          <img
            className="ryan-avatar"
            src={pictureSrc || "/default-avatar.svg"}
            alt=""
            onError={() => { if (pictureSrc !== "/default-avatar.svg") setPictureSrc("/default-avatar.svg"); }}
          />
        </span>
      </div>
      <h1 className="ryan-name" data-enter data-name-tier={nameTier}>{shownName}</h1>
      {shownHandle && <p className="ryan-handle" data-enter>@{shownHandle}</p>}
      {profile.avatar?.description ? (
        <p className="ryan-bio" data-enter>
          <strong>{profile.avatar.name}</strong>
          {shownHandle ? <> · @{shownHandle} · </> : <> · </>}
          {profile.avatar.description}
        </p>
      ) : null}
      <p className="ryan-counts" data-enter>
        {profile.counts.followers} 粉丝 · {profile.counts.following} 关注
      </p>

      <div className="ryan-actions" data-enter>
        {isSelf ? (
          <button type="button" className="btn-pill-white" onClick={() => setEditOpen(true)}>编辑资料</button>
        ) : (
          <button
            type="button"
            className={`btn-pill-white ${following ? "is-following" : ""}`}
            disabled={busy}
            aria-pressed={following}
            onClick={() => void toggleFollow()}
          >
            {following ? "已关注" : "关注"}
          </button>
        )}
      </div>
      {note && <p className="ryan-note" role="status">{note}</p>}

      <section className="profile-shelf" aria-label="主页书架" data-enter>
        {publications.length > 0 ? (
          <>
            <div className="profile-shelf-tabs" role="tablist" aria-label="书架视图" ref={tabsRef}>
              <span className="profile-shelf-tabs-pill" data-segment-pill aria-hidden="true" />
              <button
                type="button"
                role="tab"
                aria-selected={segment === "boards"}
                className={segment === "boards" ? "is-active" : ""}
                onClick={() => { setSegment("boards"); setSelectedBoardId(""); setShelfQuery(""); }}
              >
                合集
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={segment === "all"}
                className={segment === "all" ? "is-active" : ""}
                onClick={() => { setSegment("all"); setSelectedBoardId(""); setShelfQuery(""); }}
              >
                全部
              </button>
            </div>

            <div className="profile-shelf-tools">
              <label className="profile-shelf-search">
                <Icon name="search" size={19} />
                <input
                  value={shelfQuery}
                  onChange={(event) => setShelfQuery(event.target.value)}
                  placeholder="搜索故事线"
                  aria-label="搜索这个主页的故事线"
                />
                {shelfQuery && (
                  <button type="button" onClick={() => setShelfQuery("")} aria-label="清空搜索">
                    <Icon name="x" size={14} />
                  </button>
                )}
              </label>
              <button
                type="button"
                className={`profile-shelf-tool ${sortOpen ? "is-active" : ""}`}
                onClick={() => setSortOpen((open) => !open)}
                aria-label="调整故事线排序"
                aria-expanded={sortOpen}
              >
                <Icon name="sliders" size={24} />
              </button>
              <button
                type="button"
                className="profile-shelf-tool"
                onClick={() => onNavigate("forge")}
                aria-label="新建故事"
              >
                <Icon name="plus" size={26} />
              </button>
              {sortOpen && (
                <div className="profile-sort-menu" role="menu" aria-label="故事线排序">
                  {sortOptions.map((option) => (
                    <button
                      type="button"
                      key={option.id}
                      role="menuitemradio"
                      aria-checked={sortMode === option.id}
                      className={sortMode === option.id ? "is-active" : ""}
                      onClick={() => { setSortMode(option.id); setSortOpen(false); }}
                    >
                      <span>{option.label}</span>
                      {sortMode === option.id && <Icon name="check" size={15} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {searching ? (
              <div className="profile-line-list-wrap">
                <div className="profile-list-heading">
                  <h2>搜索结果</h2>
                  <span>{searchResults.length} 条故事线</span>
                </div>
                {searchResults.length > 0 ? (
                  <div className="profile-line-list">
                    {searchResults.map((publication) => (
                      <ProfileLineRow key={publication.id} publication={publication} onOpen={onOpenDetail} />
                    ))}
                  </div>
                ) : (
                  <p className="profile-line-empty">没有找到匹配的故事线。</p>
                )}
              </div>
            ) : selectedBoard ? (
              <div className="profile-line-list-wrap">
                <div className="profile-collection-heading">
                  <button
                    type="button"
                    className="profile-back-chip"
                    onClick={() => setSelectedBoardId("")}
                    aria-label="返回全部合集"
                  >
                    <Icon name="chevron" size={15} className="rotate-180" />
                    全部合集
                  </button>
                  <div>
                    <h2>{selectedBoard.title}</h2>
                    <p>{selectedBoard.publications.length} 条故事线</p>
                  </div>
                </div>
                <div className="profile-line-list">
                  {selectedBoard.publications.map((publication) => (
                    <ProfileLineRow key={publication.id} publication={publication} onOpen={onOpenDetail} />
                  ))}
                </div>
              </div>
            ) : segment === "all" ? (
              <div className="profile-line-list-wrap">
                <div className="profile-list-heading">
                  <h2>全部故事线</h2>
                  <span>{allLines.length} 条</span>
                </div>
                <div className="profile-line-list">
                  {allLines.map((publication) => (
                    <ProfileLineRow key={publication.id} publication={publication} onOpen={onOpenDetail} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="profile-board-grid">
                {boards.map((board) => (
                  <ProfileBoardCard
                    key={board.id}
                    board={board}
                    onOpen={(nextBoard) => {
                      if (nextBoard.id === "all") {
                        setSegment("all");
                        setSelectedBoardId("");
                      } else {
                        setSelectedBoardId(nextBoard.id);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="profile-shelf-empty">
            <h2>还没有发布故事线</h2>
            <p>{isSelf
              ? "走完一整季或一整条长线，就能把故事线发布到广场，书架上会按世界摆成合集。"
              : "TA 还没有把走完的故事线发布到广场。"}</p>
            {isSelf && (
              <button type="button" className="btn-pill-white" onClick={() => onNavigate("forge")}>
                去造世开一本新书
              </button>
            )}
          </div>
        )}
      </section>

    </div>
    {editOpen && isSelf && (
      <EditProfileSheet
        profile={profile}
        getToken={getToken}
        onClose={() => setEditOpen(false)}
        onSaved={(next) => { if (next) setProfile(next); }}
      />
    )}
    </>
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
      <p className="page-caption">把一条故事线放上广场：走完的线整条发布；无限连载的线连载中就能发布，之后的新章会自己跟上。发布后，其他人能读你的原作线，也能带自己的化身进入这个世界重演一条新线。</p>

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
              <p>你还没有故事线。先用化身走一季，或开一条无限连载，再来发布。</p>
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
                        ? gate.lineStatus === "serializing"
                          ? <><span className="plaza-badge">连载中</span> {plazaLengthLabel(story)} · 发布后新章自动跟上{published ? " · 已在广场上" : ""}</>
                          : <><span className="plaza-badge">已完结</span> {plazaLengthLabel(story)}{published ? " · 已在广场上，再次发布会更新" : ""}</>
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
              <li><Icon name="check" size={15} /><span><strong>原作线全文</strong><small>你化身走过的全部章节与当时的选择（连载中的线随新章更新）</small></span></li>
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
  Math.min(5, Math.max(1, Math.floor(Number(value) || 1)));

// Draft step numbers are only comparable within one flow shape. Three
// shapes exist in the wild:
// - six-step drafts (pre-world-screen): no worldChosen marker; their
//   step 1 stays 1 and steps 2..6 shift one forward into seven-step
//   numbering (identity was 2, becomes 3, and so on);
// - seven-step drafts (worldChosen marker present): 题材/世界/身份/出生点/
//   主角/能力/开局；
// - the current five-step flow: 题材/世界/出身（身份+出生点）/主角（主角+
//   能力）/开局. Seven-step numbers fold in via SEVEN_TO_FIVE — 身份 and
//   出生点 both land on 出身 (3), 主角 and 能力 both on 主角 (4).
const SEVEN_TO_FIVE_STEP = { 1: 1, 2: 2, 3: 3, 4: 3, 5: 4, 6: 4, 7: 5 };
const migratedDraftStep = (source) => {
  // Drafts saved by the five-step flow itself carry its version stamp:
  // their step numbers are already current and must pass through
  // untouched (folding them again would walk a resumed draft backwards).
  if (Number(source?.flowVersion) >= 5) {
    return Math.min(5, Math.max(1, Math.floor(Number(source?.step) || 1)));
  }
  const raw = Math.min(7, Math.max(1, Math.floor(Number(source?.step) || 1)));
  const sevenStep = typeof source?.worldChosen === "boolean"
    ? raw
    : raw <= 1 ? 1 : Math.min(7, raw + 1);
  return SEVEN_TO_FIVE_STEP[sevenStep] || 1;
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
    // Whether a saved draft existed at all: the forge uses it to tell
    // values a previous session confirmed on its summary screen (counted
    // as deliberate picks) from a fresh draft's silent defaults.
    restoredDraft: hasSavedDraft,
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

function LibraryTools({ store, library, onClose, onRestored, syncNote }) {
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
      {syncNote && <p className="field-hint">{syncNote}</p>}
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
  const navView = route.plaza || view.startsWith("plaza") || view === "profile" ? "plaza" : view;
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
  // Presence: while signed in and foregrounded, stamp a heartbeat every
  // 30 s (and on every return to the foreground) so the plaza can show a
  // truthful "N 人在线". Hidden tabs stop stamping and age out server-side.
  const viewerUid = account.user?.uid || "";
  useEffect(() => {
    if (!viewerUid) return undefined;
    const beat = () => {
      if (!document.hidden) void sendPresenceHeartbeat({ getAccessToken: () => authClient.getAccessToken() });
    };
    beat();
    const timer = window.setInterval(beat, 30_000);
    const onVisible = () => { if (!document.hidden) beat(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authClient, viewerUid]);
  // Cloud library: while signed in, the shelf reconciles with the
  // account copy on sign-in and writes changes through in the
  // background. Local storage stays the working copy — nothing here
  // blocks reading or generation, and failures retry silently.
  const [cloudSync] = useState(() => createCloudSync({ getAccessToken: () => authClient.getAccessToken() }));
  const cloudUid = account.status === "authenticated" ? account.user?.uid || null : null;
  const readReadingStateRaw = () => {
    try { return window.localStorage.getItem(READING_LOCATION_KEY); } catch { return null; }
  };
  useEffect(() => {
    if (!cloudUid) return undefined;
    let cancelled = false;
    void cloudSync.merge({
      uid: cloudUid,
      library: store.getSnapshot().library,
      applyRemote: ({ add, removeIds }) => {
        if (cancelled) return;
        store.update((current) => {
          let stories = current.stories.filter((story) => !removeIds.includes(story.id));
          for (const story of add) {
            const index = stories.findIndex((item) => item.id === story.id);
            if (index === -1) stories = [...stories, story];
            else stories = stories.map((item, itemIndex) => (itemIndex === index ? story : item));
          }
          return { ...current, stories };
        });
      },
      readReadingStateRaw,
      writeReadingStateRaw: (raw) => {
        try { window.localStorage.setItem(READING_LOCATION_KEY, raw); } catch { /* storage blocked */ }
      },
    });
    return () => { cancelled = true; };
  }, [cloudUid, cloudSync, store]);
  useEffect(() => {
    if (!cloudUid) return;
    cloudSync.observe({ uid: cloudUid, stories: library.stories, readReadingStateRaw });
  }, [cloudUid, cloudSync, library]);
  const syncNote = account.user
    ? account.config?.storage === "synced"
      ? "书架已同步到你的账号，换设备登录就能接着读。"
      : null
    : library.stories.length > 0
      ? account.config?.storage === "synced"
        ? "故事只保存在当前浏览器 · 登录后自动同步到账号，换设备不丢。"
        : "故事只保存在当前浏览器，换设备或清理缓存会丢失。"
      : null;
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
      profile: "个人主页",
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
      : next === "plaza-detail" || next === "plaza-enter" || next === "profile"
        ? { view: next, id: options.id }
        : { view: next };
    const hash = routeHash(nextRoute);
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    setRoute(parseRoute(hash));
    if (next !== "reader") setShareRequest(false);
    scrollToTop();
  };
  // Living publications follow their line (user order 2026-10-27): when a
  // published endless line gains a chapter — or is manually finished —
  // the plaza copy refreshes in the background. Best-effort and silent:
  // the server gate re-checks everything, and a failed sync just leaves
  // the previous snapshot standing until the next chapter lands.
  const plazaSyncSignatures = useRef(new Map());
  const syncLivingPublication = useCallback((story) => {
    if (!story || storyLengthModeOf(story) !== "endless") return;
    if (!plazaMine()[story.id]) return;
    const signature = `${story.chapters?.length || 0}:${isManuallyFinished(story) ? "finished" : "running"}`;
    if (plazaSyncSignatures.current.get(story.id) === signature) return;
    plazaSyncSignatures.current.set(story.id, signature);
    void (async () => {
      try {
        const token = await authClient.getAccessToken();
        if (!token) return;
        const { publication } = await publishToPlaza({ story, getAccessToken: () => authClient.getAccessToken() });
        if (publication?.id) plazaMineRemember(story.id, publication.id);
      } catch {
        plazaSyncSignatures.current.delete(story.id);
      }
    })();
  }, [authClient]);
  const commitStory = useCallback(
    (story) => {
      setLibrary((current) => libraryWithStory(current, story));
      syncLivingPublication(story);
    },
    [setLibrary, syncLivingPublication],
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
    const candidate = acceptGeneratedChapter(source, result);
    if (candidate !== source) syncLivingPublication(candidate);
    setLibrary((current) => {
      const latest = current.stories.find((book) => book.id === id);
      if (!latest) return current;
      const next = acceptGeneratedChapter(latest, result);
      if (next === latest) return current;
      return { ...current, stories: current.stories.map((book) => book.id === id ? next : book) };
    });
  }, [store, setLibrary, syncLivingPublication]);
  // The intervention revision pass. The queue is landed FIRST, so a
  // failed or quota-blocked pass never loses the reader's nudge — it
  // simply folds into the chapter's next ordinary generation. A landed
  // pass goes through the same /api/generate endpoint and the same usage
  // accounting as any other chapter.
  const reviseChapter = useCallback(async (id, targetIndex, queuedStory) => {
    setLibrary((current) => ({
      ...current,
      stories: current.stories.map((book) => (book.id === id ? queuedStory : book)),
    }));
    const result = await requestChapterRevision(queuedStory, targetIndex, {
      getAccessToken: () => authClient.getAccessToken(),
      onAuthRequired: () => { setAccountIntent(null); setAccountOpen(true); },
    });
    const candidate = acceptRevisedChapter(queuedStory, result);
    if (candidate !== queuedStory) syncLivingPublication(candidate);
    setLibrary((current) => {
      const latest = current.stories.find((book) => book.id === id);
      if (!latest) return current;
      const next = acceptRevisedChapter(latest, result);
      if (next === latest) return current;
      return { ...current, stories: current.stories.map((book) => (book.id === id ? next : book)) };
    });
  }, [store, setLibrary, syncLivingPublication, authClient]);
  // The frontier re-roll. The rotation is landed FIRST (it retires any
  // pre-generation answer computed from the old telling), then the pass
  // runs over the same /api/generate endpoint and usage accounting as
  // any other chapter. A failed pass leaves the old chapter standing —
  // only its revision has moved on. If the next chapter lands while the
  // pass is in flight, the accept refuses the swap and the caller hears
  // about it: the chapter has locked, which is the house rule working.
  const rerollChapter = useCallback(async (id, targetIndex) => {
    const source = store.getSnapshot().library.stories.find((book) => book.id === id);
    if (!source) throw new Error("这本书暂时找不到了。");
    const rotated = beginChapterReroll(source, targetIndex);
    if (rotated === source) throw new Error("这一章已经定稿，不能再换了。");
    setLibrary((current) => ({
      ...current,
      stories: current.stories.map((book) => (book.id === id ? rotated : book)),
    }));
    const result = await requestChapterReroll(rotated, targetIndex, {
      getAccessToken: () => authClient.getAccessToken(),
      onAuthRequired: () => { setAccountIntent(null); setAccountOpen(true); },
    });
    const candidate = acceptRerolledChapter(rotated, result);
    if (candidate !== rotated) syncLivingPublication(candidate);
    setLibrary((current) => {
      const latest = current.stories.find((book) => book.id === id);
      if (!latest) return current;
      const next = acceptRerolledChapter(latest, result);
      if (next === latest) return current;
      return { ...current, stories: current.stories.map((book) => (book.id === id ? next : book)) };
    });
  }, [store, setLibrary, syncLivingPublication, authClient]);
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
          targetChapters: payload.targetChapters,
          originIdentityId: payload.originIdentityId,
          customWorldName: payload.customWorldName,
          customWorldSetting: payload.customWorldSetting,
          lorebook: payload.lorebook,
          startPointName: payload.startPointName,
          startPointHook: payload.startPointHook,
          name: payload.name,
          persona: payload.persona,
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
  const openProfile = (uid) => { if (uid) navigate("profile", { id: uid }); };
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
        onReviseChapter={reviseChapter}
        onRerollChapter={rerollChapter}
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
        onOpenProfile={openProfile}
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
        onOpenProfile={openProfile}
      />
    );
  else if (view === "profile")
    page = (
      <ProfilePage
        uid={route.id}
        account={account}
        authClient={authClient}
        onNavigate={navigate}
        onOpenAccount={() => { setAccountIntent(null); setAccountOpen(true); }}
        onOpenAvatar={() => navigate("avatar")}
        onOpenDetail={openPlazaDetail}
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
        syncNote={syncNote}
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
        {view !== "profile" && <Topbar onNavigate={navigate} onOpenLibrary={() => setLibraryOpen(true)} account={account} onOpenAccount={() => { setAccountIntent(null); setAccountOpen(true); }} />}
        {warning && (
          <div className="sw-storage-warning" role="alert">
            <Icon name="lock" size={14} />
            <span>{warning}</span>
            <button onClick={() => setLibraryOpen(true)}>备份与恢复</button>
          </div>
        )}
        <MobileBottomNav view={view === "profile" ? "profile" : navView} onNavigate={navigate} />
        {page}
      </main>
      {accountOpen && <ReadingDialog title={account.user ? "我的账号" : "登录与注册"} onClose={() => setAccountOpen(false)}>
        <AccountPanel client={authClient} account={account} onOpenAvatar={() => { setAccountOpen(false); navigate("avatar"); }} onOpenProfile={() => { setAccountOpen(false); if (account.user?.uid) navigate("profile", { id: account.user.uid }); }} onContinue={() => {
          setAccountOpen(false);
          if (accountIntent === "forge") navigate("forge");
          setAccountIntent(null);
        }}/>
      </ReadingDialog>}
      {libraryOpen && <LibraryTools store={store} library={library} syncNote={syncNote} onClose={() => setLibraryOpen(false)} onRestored={() => {
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
