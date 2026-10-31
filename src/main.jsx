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
import "./design-assets.css";
import AuroraBackground from "./components/AuroraBackground.jsx";
import StoryMap, { StoryMapMini, generationState } from "./components/StoryMap.jsx";
import GenerationOverlay from "./components/GenerationOverlay.jsx";
import ParticleField, { burstFromElement, burstParticles } from "./components/ParticleField.jsx";
import { installRipple } from "./motion/ripple.js";
import AnimatedContent from "./components/react-bits/AnimatedContent.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { createLibraryStore } from "./library-store.js";
import { createCloudSync, deleteCloudStory } from "./cloud-library.js";
import { parseRoute, routeHash } from "./navigation.js";
import { applyShellTheme, readShellTheme, storeShellTheme } from "./theme.js";
import {
  chunkShelves,
  coverInfoFor,
  coverTitleLayoutFor,
  seasonLabel,
  shelfMetaFor,
  statusBadgeFor,
  storyComplete,
  storyDistinguisherFor,
} from "./list-layout.js";
import {
  coverRequestInFlight,
  coverStateOf,
  requestCoverImage,
  shouldAutoRequestCover,
  withCoverState,
} from "./cover.js";
import { downloadText } from "./downloads.js";
import { drawPersonalityTraits, personalityTraitText } from "./personality-traits.js";
import { drawInspirationFragments } from "./inspiration-fragments.js";
import { samplePortraitEdges } from "./art-edges.js";
import {
  AVATAR_LIMIT,
  AVATAR_PRESETS,
  avatarAbilityOf,
  avatarAppearanceText,
  avatarCollectionSignature,
  avatarDraftPatch,
  avatarJourneys,
  avatarPortraitState,
  createAvatar,
  deleteAvatar,
  fetchAvatarObjectUrl,
  fetchAvatars,
  generateAvatar,
  mainAvatarOf,
  normalizeAvatarAbility,
  saveAvatar,
  setMainAvatar,
} from "./avatar.js";
import {
  createPlazaPost,
  createPostComment,
  deleteBookRating,
  deletePlazaPost,
  deletePostComment,
  enterDraftFor,
  fetchBookRatings,
  fetchPlazaDetail,
  fetchPlazaPost,
  fetchPlazaPosts,
  fetchPostComments,
  fetchStoreBooks,
  plazaCardIntroFor,
  cardIntroExcerptFor,
  clipToUnits,
  textUnitsFor,
  countTextFor,
  plazaTitleTierFor,
  plazaGateFor,
  bringAvatarIntoStory,
  plazaLengthLabel,
  plazaPortraitPath,
  plazaLineStatusFor,
  plazaMine,
  plazaMineForget,
  plazaMineIds,
  plazaMineRemember,
  plazaPublicPremise,
  plazaWorldIntroFor,
  WORLD_INTRO_VERSION,
  plazaReaderStory,
  detailSourcesFor,
  plazaTemplateNameFor,
  publishToPlaza,
  rateBook,
  ratingAverageText,
  recordPlazaRead,
  reportPlazaPost,
  reportPostComment,
  reportPublication,
  togglePlazaPostLike,
  updatePlazaPost,
  withdrawPublication,
} from "./plaza.js";
import {
} from "./profile-boards.js";
import {
  cancelFriendRequest,
  checkHandleAvailable,
  fetchFriends,
  fetchNotifications,
  fetchUserConnections,
  fetchUserProfile,
  bitmapRegionToSquareJpeg,
  bitmapRegionToBannerJpeg,
  deleteMyBanner,
  followUser,
  markNotificationsRead,
  publicDisplayName as profileDisplayName,
  publicHandle as profileHandle,
  reportUser,
  respondFriendRequest,
  searchPeople,
  sendFriendRequest,
  sendPresenceHeartbeat,
  unfollowUser,
  updateMyProfile,
  uploadMyBanner,
  uploadMyPicture,
} from "./users.js";
import {
  clearProfileCache,
  loadProfile,
  markProfileIntroSeen,
  peekProfile,
  profileIntroSeen,
  profileViewState,
  rememberProfile,
  rememberProfileViewState,
  subscribeProfile,
} from "./profile-cache.js";
import {
  FUSION_PERMISSION_OPTIONS,
  applyForFusion,
  decideFusionRequest,
  fetchFusionStatus,
  fusionGateFor,
  normalizeFusionPermission,
} from "./fusion-permission.js";
import { acceptGeneratedChapter, acceptRerolledChapter, acceptRevisedChapter, generationStatus, mergeSourceContext, nextGenerationIndex, requestChapter, requestChapterReroll, requestChapterRevision } from "./generation.js";
import InterventionOverlay from "./components/InterventionOverlay.jsx";
import WorldArtwork from "./components/WorldArtwork.jsx";
import StoryCover from "./components/StoryCover.jsx";
import AccountPanel, { ShellThemeSegments } from "./components/AccountPanel.jsx";
import BillingPanel from "./components/BillingPanel.jsx";
import { billingGateMember } from "./billing.js";
import { createAuthClient } from "./auth/client.js";
import ReadingPreferences from "./components/ReadingPreferences.jsx";
import { createReadingPreferencesStore, getReaderAppearance } from "./reading-preferences.js";
import { chapterLocationKey, READING_LOCATION_KEY, readingStateWithoutStory } from "./reading-location.js";
import { useReaderExperience } from "./useReaderExperience.js";
import ReaderPager from "./components/ReaderPager.jsx";
import ReadingTools from "./components/ReadingTools.jsx";
import "./reader-experience.css";
import {
  MotionProvider,
  useMotionPolicy,
  useMotionSettings,
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
  CUSTOM_GENRE_TEXT_MAX,
  CUSTOM_LENGTH_MAX,
  CUSTOM_LENGTH_MIN,
  CUSTOM_TEMPLATE_ID,
  CUSTOM_WORLD_NAME_MAX,
  CUSTOM_WORLD_SETTING_MAX,
  PRESET_WORLD_SETTING_MAX,
  worldDraftOf,
  worldSettingOf,
  DEFAULT_DRAFT,
  FRIEND_BOOK,
  MERGE_SOURCE_LIMIT,
  GENRES,
  GENRE_SHELVES,
  GENRE_TEMPLATES,
  ORIGIN_IDENTITIES,
  START_POINT_HOOK_MAX,
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
  BOOK_TITLE_MAX,
  bookTitleWithinLimit,
  CHAPTER_TITLE_MAX,
  SYNOPSIS_MAX,
  INTRO_BACKGROUND_MAX,
  INTRO_RULE_MAX,
  INTRO_RULES_MAX,
  INTRO_THREAD_MAX,
  bookTitleSuggestionFor,
  bookTitleFormulaForDraft,
  customGenreAnchorTemplateId,
  worldSkeletonKbFor,
  effectiveIntroFor,
  renameBookTitle,
  renameChapterTitle,
  synopsisOf,
  updateIntro,
  updateSynopsis,
  createMergedStory,
  createStory,
  appendManualChapter,
  createManualStory,
  isManualStory,
  manualChapterWordCount,
  manualParagraphsToText,
  manualTagsOf,
  manualWrittenChapterCount,
  moveManualChapter,
  removeManualChapter,
  updateManualChapter,
  finishEndlessLine,
  fusionProductModeFor,
  genreTemplateById,
  isManuallyFinished,
  chapterTitleTextFor,
  localIdentityTitle,
  originIdentityById,
  originSummaryFor,
  isStoryComplete,
  publicSnapshot,
  resolveStartPoint,
  customGenreHomeShelfFor,
  shelfArtBase,
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
  mergeLibraryImport,
  STORAGE_KEY,
  summarizeLibraryImport,
  upsertStory,
} from "./persistence";
import { findSettingViolation } from "./setting-guard";
import {
  fusionCandidatesFor,
  fusionLineMetaFor,
  plazaFusionEntryFor,
  resolveFusionPreselect,
} from "./fusion.js";
import {
  assertImportFileSize,
  decodeImportText,
  leadingExcerpt,
  LOREBOOK_CONSTANT_MAX,
  normalizeLorebookEntries,
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
    user: (
      <>
        <circle cx="12" cy="8" r="3.6" />
        <path d="M5 20c.8-3.8 3.2-5.6 7-5.6s6.2 1.8 7 5.6" />
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
    heart: (
      <path d="M12 20.5C7 16.5 3 13.3 3 9.3 3 6.4 5.2 4.5 7.7 4.5c1.7 0 3.4 1 4.3 2.4.9-1.4 2.6-2.4 4.3-2.4 2.5 0 4.7 1.9 4.7 4.8 0 4-4 7.2-9 11.2Z" />
    ),
    chat: (
      <>
        <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.2 0-2.4-.25-3.4-.7L3 20l.7-5.6A8.5 8.5 0 1 1 21 11.5Z" />
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
    // Settings / notice family (PHONE-FIX §37 G4): same 24-grid,
    // same 1.8 stroke as every icon above — no emoji, no bare glyphs.
    shield: (
      <>
        <path d="M12 3 5 5.8v5.4c0 4.4 2.9 7.6 7 9.3 4.1-1.7 7-4.9 7-9.3V5.8L12 3Z" />
        <path d="m9.2 11.6 2 2 3.6-3.8" />
      </>
    ),
    logout: (
      <>
        <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7" />
        <path d="M10 12h10M17 8l4 4-4 4" />
      </>
    ),
    database: (
      <>
        <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
        <path d="M4.5 5.5v13c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8v-13" />
        <path d="M4.5 12c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <path d="M12 7.8v.3" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.6 9.2A2.6 2.6 0 0 1 12 7.5c1.4 0 2.5 1 2.5 2.2 0 1.7-2.3 2-2.3 3.5" />
        <path d="M12 16.8v.3" />
      </>
    ),
    palette: (
      <>
        <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.9 0-1.2-1-1.7-1-2.8 0-1 .8-1.8 2-1.8h1.6A4.4 4.4 0 0 0 21 10.2C20.6 6.2 16.6 3 12 3Z" />
        <circle cx="7.6" cy="10.4" r="1.15" />
        <circle cx="10.4" cy="6.8" r="1.15" />
        <circle cx="15.4" cy="7.4" r="1.15" />
      </>
    ),
    megaphone: (
      <>
        <path d="M4 10v4a1.6 1.6 0 0 0 1.6 1.6H7L18 19V5L7.2 8.4H5.6A1.6 1.6 0 0 0 4 10Z" />
        <path d="M7 15.6V19a1.8 1.8 0 0 0 3.6 0v-2.4" />
      </>
    ),
    // The settings entry's cog (§40 ②): same 24-grid, same stroke —
    // hub circle with eight short spokes.
    gear: (
      <>
        <circle cx="12" cy="12" r="3.4" />
        <path d="M12 2.9v2.9M12 18.2v2.9M2.9 12h2.9M18.2 12h2.9M5.6 5.6l2 2M16.4 16.4l2 2M18.4 5.6l-2 2M7.6 16.4l-2 2" />
      </>
    ),
  };
  return <svg {...common}>{paths[name] || paths.spark}</svg>;
};

// FORGE-TRIM: the forge's old fixed vocabularies retired here. The
// trait chips are now an input backed by the 100-entry library in
// personality-traits.js; the god-mode sparks draw from the 100-hook
// library in inspiration-fragments.js (the four atmospheric one-liners
// that used to sit here are gone for good); the 故事风格 cards are
// offline entirely — the engine still reads a stored tone on old
// stories, but the forge no longer asks.
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
// same shape as the identity row's 概念 · 本地称谓. REQ-71: when the shelf
// and the template carry the SAME name （历史 · 历史）, the join would
// print one name twice — the single name stands alone.
const twoSegmentTemplateName = (template) => {
  if (!template) return "";
  if (template.fullName.includes(" · ")) return template.fullName;
  const shelf = shelfForTemplate(template.id);
  if (!shelf || shelf.name === template.name) return template.fullName;
  return `${shelf.name} · ${template.name}`;
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

function Sidebar({ view, onNavigate, onOpenProfile }) {
  // Desktop rail (PROFILE-FIX, DESIGN §33): no brand mark of its own
  // (the topbar carries the one brand), no 世界合流 in the main column
  // (fusion is a contextual feature, DESIGN §26), and the foot entry
  // is an icon like every other destination — faces live on profile
  // surfaces and author rows, never in the navigation chrome.
  const items = [
    { id: "plaza", label: "广场", icon: "spark" },
    { id: "home", label: "我的世界", icon: "compass" },
    { id: "forge", label: "造世", icon: "plus" },
    { id: "store", label: "书城", icon: "book" },
  ];
  return (
    <aside className="sidebar">
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
      {/* The rail's foot is the profile entry (user order 2026-10-28:
         the bottom-right slot belongs to 我的主页 on every form factor). */}
      <button
        type="button"
        className={`side-nav-item side-profile-entry ${view === "profile" ? "active" : ""}`}
        aria-current={view === "profile" ? "page" : undefined}
        onClick={onOpenProfile}
      >
        <Icon name="user" size={21} />
        <span>我的主页</span>
      </button>
    </aside>
  );
}

function Topbar({ onNavigate, account, unreadCount = 0, onOpenNotifications, onOpenAccount }) {
  // The top-right cluster (NOTIFY-SETTINGS §36, user order
  // 2026-10-28): signed in, it is ONE thing — the message bell in the
  // shared glass capsule, badged with the unread total (99+ cap).
  // The account face, the motion toggle and the shelf button that
  // used to crowd this corner have moved, not vanished: the account
  // lives in the bottom-nav 主页 tab, motion and theme in 主页 →
  // 设置， the shelf on the profile itself. Signed out, a bell means
  // nothing, so the corner keeps the login entry instead.
  return (
    <header className="topbar">
      <Brand onClick={() => onNavigate("plaza")} />
      <div className="topbar-actions">
        {account.user ? (
          <button
            type="button"
            className="topbar-bell"
            onClick={onOpenNotifications}
            aria-label={unreadCount > 0 ? `消息，${unreadCount} 条未读` : "消息"}
            aria-haspopup="dialog"
          >
            <Icon name="bell" size={20} />
            {unreadCount > 0 && (
              <span className="topbar-bell-badge" aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>
            )}
          </button>
        ) : (
          <button className="account-entry" onClick={onOpenAccount} aria-label="登录与注册" aria-haspopup="dialog">
            <Icon name="users" size={20} /><span>登录</span>
          </button>
        )}
      </div>
    </header>
  );
}

function MobileBottomNav({ view, onNavigate, onOpenProfile }) {
  if (view === "reader") return null;
  // Bottom bar (user order 2026-10-28, PROFILE-FIX §33): 广场 / 造世 /
  // 书城 / 我的主页 — four slots, ONE grammar: a 21px line icon over an
  // 11px label. Merge stays out of the bar (contextual entries only),
  // and the profile slot no longer wears the reader's face — a tab is
  // a place, not a person; faces live on the profile itself and on
  // author rows. 我的主页 is a page like the other three (§33 A1).
  const items = [
    { id: "plaza", label: "广场", icon: "spark" },
    { id: "forge", label: "造世", icon: "plus" },
    { id: "store", label: "书城", icon: "book" },
  ];
  // SALT §51 (motion #10): the sliding indicator marks the ACTIVE peer
  // slot. Views outside the four slots (home, detail, reader…) park it
  // invisible — peer switches are indicator + content fade only.
  const slotIndex = { plaza: 0, forge: 1, store: 2, profile: 3 }[view];
  return (
    <nav className="mobile-bottom-nav" aria-label="移动端主导航">
      <span
        className="nav-indicator"
        aria-hidden="true"
        style={{
          transform: `translateX(${(slotIndex ?? 0) * 100}%)`,
          opacity: slotIndex === undefined ? 0 : 1,
        }}
      />
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          className={view === item.id ? "active" : ""}
          aria-current={view === item.id ? "page" : undefined}
          onClick={() => onNavigate(item.id)}
        >
          <Icon name={item.icon} size={21} />
          <span>{item.label}</span>
        </button>
      ))}
      <button
        type="button"
        className={view === "profile" ? "active" : ""}
        aria-current={view === "profile" ? "page" : undefined}
        aria-label="我的主页"
        onClick={onOpenProfile}
      >
        <Icon name="user" size={21} />
        <span>主页</span>
      </button>
    </nav>
  );
}

/**
 * The honest failure page for "open this book" (§40 ⓪): a requested
 * book that cannot be resolved says so and offers a retry — it never
 * falls through to the empty-shelf page, which is reserved for a
 * library that is genuinely empty with nothing requested.
 */
function BookOpenError({ onRetry, onBack, backLabel }) {
  return (
    <div className="page page-reader page-enter">
      <div className="sw-empty-page">
        <div className="sw-empty-icon">
          <Icon name="book" size={25} />
        </div>
        <h1>没能打开这本书</h1>
        <p className="book-open-error-copy">这本书可能还没同步到这台设备，或者已经被删除。</p>
        <Button icon="refresh" onClick={onRetry}>重试</Button>
        <Button variant="ghost" onClick={onBack}>{backLabel}</Button>
      </div>
    </div>
  );
}

function Home({ onNavigate, onOpenStory, onDeleteStory, activeStory, stories, draft, account, onOpenAccount, authClient, avatar, onOpenAvatar, syncNote, onOpenHelp, onOpenLibrary }) {
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
  // SALT §51 (motion #7): resume-hero parallax. The art layer trails
  // the scroll at a 0.15 ratio, clamped to ±12px inside its 16px bleed;
  // writes happen only inside rAF and only while the hero is on screen.
  // The motion policy (data-motion="off" on the shell) and
  // prefers-reduced-motion both leave the layer parked at rest.
  const heroSceneRef = useRef(null);
  useEffect(() => {
    const scene = heroSceneRef.current;
    if (!scene) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let raf = 0;
    let parked = false;
    const update = () => {
      raf = 0;
      if (scene.closest(".app-shell")?.dataset.motion === "off") {
        if (!parked) { scene.style.transform = ""; parked = true; }
        return;
      }
      parked = false;
      const hero = scene.parentElement;
      const rect = hero.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      const shift = Math.max(-12, Math.min(12, (window.innerHeight / 2 - (rect.top + rect.height / 2)) * 0.15));
      scene.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [activeStory?.id]);

  return (
    <div className="page page-home page-enter">
      <div className="home-heading">
        <p className="home-welcome">{activeStory ? "故事还在，等你回来。" : "你的世界，从这一页开始。"}</p>
        {!account.user && <button className="home-account-link" onClick={onOpenAccount}>登录 / 注册<Icon name="chevron" size={14}/></button>}
      </div>
      <section className={`home-hero ${activeStory ? "has-story" : "first-story"}`}>
        <div className="hero-scene" ref={heroSceneRef}>
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
                <span>{genre.label} · {activeStory.kind === "merged" ? `${activeStory.config?.protagonists?.length || 2} 位主角` : displayName(activeStory)}</span>
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
                ? isStoryComplete(activeStory)
                  ? "重新阅读"
                  : currentChapter === activeTotal
                    ? "回看终章"
                    : "继续阅读"
                : "开启第一本书"}
            </Button>
            {activeStory && isManualStory(activeStory) && !activeStory.readOnly && (
              <Button
                variant="ghost"
                icon="pencil"
                onClick={() => onNavigate("write", { storyId: activeStory.id })}
              >
                回写作台
              </Button>
            )}
            {activeStory && activeStory.kind !== "merged" && !activeStory.readOnly && !isManualStory(activeStory) && (
              <Button
                variant="ghost"
                icon="git"
                onClick={() => onNavigate("merge", { storyId: activeStory.id })}
              >
                与另一条线合流
              </Button>
            )}
          </div>
        </div>
      </section>

      {draft && <button className="home-draft-row" onClick={() => onNavigate("forge")}>
        <Icon name="book" size={20}/><span><strong>继续上次设定</strong><small>第 {migratedDraftStep(draft)} 步 · 已保存在本机</small></span><Icon name="chevron" size={16}/>
      </button>}

      <button className="home-draft-row" onClick={onOpenAvatar}>
        {avatar ? (
          <span className="home-avatar-face-frame" aria-hidden="true">
            <AvatarPortrait avatar={avatar} getAccessToken={() => authClient.getAccessToken()} />
          </span>
        ) : (
          <Icon name="users" size={20}/>
        )}
        <span><strong>我的化身</strong><small>{avatar ? `${avatar.name} · ${avatarAppearanceText(avatar)}` : "让同一个角色，走进每一个世界"}</small></span><Icon name="chevron" size={16}/>
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
          onFuseStory={(storyId) => onNavigate("merge", { storyId })}
          onDeleteStory={onDeleteStory}
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

      {/* First rule (§40 ①): one fusion entry per screen — the
          contextual one in the continue card above; the footer's old
          generic 世界合流 stood down for duplicating it. */}
      <footer className="home-footer">
        <button type="button" className="small-link" onClick={onOpenLibrary}>
          <Icon name="book" size={15} /> 备份与恢复
        </button>
        <button type="button" className="small-link" onClick={onOpenHelp}>
          <Icon name="spark" size={15} /> 帮助与常见问题
        </button>
        <span className="home-footer-legal">
          <a className="small-link" href="/legal/terms.html" target="_blank" rel="noreferrer">用户协议</a>
          <a className="small-link" href="/legal/privacy.html" target="_blank" rel="noreferrer">隐私政策</a>
          <a className="small-link" href="/legal/member-rules.html" target="_blank" rel="noreferrer">会员服务规则</a>
        </span>
      </footer>
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

/**
 * The one confirmation for deleting a book (DELETE-BOOK batch). Reached
 * from the shelf cell and from the book's own 设定集； both paths land
 * here so the consequences read identically: chapters, reading progress
 * and bookmarks go together, a plaza publication of the line is taken
 * down with it, and lines derived from this one are independent books
 * that stay untouched. The confirm button names the book — never a
 * bare 「确定」.
 */
function DeleteBookDialog({ story, busy = false, error = "", onCancel, onConfirm }) {
  if (!story) return null;
  return (
    <ReadingDialog title="删除这本书" onClose={busy ? () => {} : onCancel}>
      <div className="delete-book-copy">
        <p>
          《{story.title}》的全部章节、阅读进度和书签都会一并删除，<strong>删掉后无法恢复</strong>。
        </p>
        <p>如果这条线已经发布到广场，广场上的发布会同步下架。</p>
        <p>由这条线合流、或带化身进入生成的其他书，是独立的故事，不受影响。</p>
      </div>
      {error && <p className="god-error" role="alert">{error}</p>}
      <div className="reading-dialog-actions">
        <Button variant="danger" disabled={busy} onClick={() => void onConfirm()}>
          {busy ? "正在删除…" : `删除《${story.title}》`}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          不删了
        </Button>
      </div>
    </ReadingDialog>
  );
}

function LibrarySwitcher({ stories, activeStoryId, onOpenStory, onFuseStory, onDeleteStory, authClient, authSignal = '' }) {
  const otherStories = stories.filter((story) => story.id !== activeStoryId);
  const capacity = useShelfCapacity();
  const [pulledId, setPulledId] = useState(null);
  const [shelfQuery, setShelfQuery] = useState("");
  const [shelfSort, setShelfSort] = useState("recent");
  const pullTimer = useRef(null);
  useEffect(() => () => { if (pullTimer.current) window.clearTimeout(pullTimer.current); }, []);
  if (otherStories.length === 0) return null;

  // F-24: a crowded shelf gets search + sort. Recent = last touched
  // first; progress = furthest-read first; title = name order. Search
  // matches the title and the world name.
  const query = shelfQuery.trim();
  // N-03: same-titled books on the shelf carry their distinguisher in
  // the face line, so two identical spines can still be told apart.
  const duplicateShelfTitles = new Set(
    Object.entries(
      otherStories.reduce((counts, story) => ({ ...counts, [story.title]: (counts[story.title] || 0) + 1 }), {}),
    ).filter(([, count]) => count > 1).map(([title]) => title),
  );
  const visibleStories = otherStories
    .filter((story) => {
      if (!query) return true;
      const genre = genreOf(story);
      return story.title.includes(query)
        || genre.label.includes(query)
        || (genre.world || "").includes(query)
        || (story.config?.customWorldName || "").includes(query);
    })
    .slice()
    .sort((a, b) => {
      if (shelfSort === "title") return a.title.localeCompare(b.title, "zh-CN");
      if (shelfSort === "progress") {
        const ratio = (story) => (story.chapters?.length ? readerIndexFor(story) / Math.max(1, totalChaptersFor(story)) : 0);
        return ratio(b) - ratio(a);
      }
      return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
    });
  const shelves = chunkShelves(visibleStories, capacity);
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
    <section className="sw-shelf sw-shelf-wood" aria-label="书架上的其他故事" style={{ "--shelf-cap": capacity }}>
      {otherStories.length >= 4 && (
        <div className="shelf-controls">
          <label className="shelf-search">
            <Icon name="search" size={17} />
            <input
              value={shelfQuery}
              onChange={(event) => setShelfQuery(event.target.value)}
              placeholder="在书架上找书"
              aria-label="搜索书架"
            />
            {shelfQuery && (
              <button type="button" onClick={() => setShelfQuery("")} aria-label="清空书架搜索">
                <Icon name="x" size={13} />
              </button>
            )}
          </label>
          <div className="shelf-sort" role="group" aria-label="书架排序">
            {[
              { id: "recent", label: "最近" },
              { id: "progress", label: "进度" },
              { id: "title", label: "标题" },
            ].map((option) => (
              <button
                type="button"
                key={option.id}
                aria-pressed={shelfSort === option.id}
                className={shelfSort === option.id ? "is-active" : ""}
                onClick={() => setShelfSort(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {visibleStories.length === 0 && (
        <div className="shelf-empty-note" role="status">
          <img className="empty-inline-art" src="/art/empty-search-512.webp" alt="" loading="lazy" />
          书架上没有找到「{query}」。
        </div>
      )}
      {shelves.map((row) => {
        return (
          <div className="wood-shelf" key={row.map((story) => story.id).join("|")}>
            <div className="wood-shelf-books">
              {row.map((story) => {
                const genre = genreOf(story);
                const complete = storyComplete(story);
                const ribbonKind = complete ? "is-complete" : seasonLabel(story) ? "is-season" : "is-serial";
                const titleLayout = coverTitleLayoutFor(story);
                return (
                  <div className="wood-book-cell" key={story.id}>
                    <button
                      type="button"
                      className={`wood-book ${pulledId === story.id ? "is-pulled" : ""}`}
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
                          <small>{duplicateShelfTitles.has(story.title) && storyDistinguisherFor(story)
                            ? `${storyDistinguisherFor(story)} · ${shelfMetaFor(story)}`
                            : shelfMetaFor(story)}</small>
                        </span>
                      </span>
                    </button>
                    {/* BH-14: fuse/delete live in an in-flow action row under
                        the cover (always rendered so cover bottoms align);
                        absolute pills used to overlap the face meta line. */}
                    <div className="wood-book-actions">
                      {!story.readOnly && onDeleteStory && (
                        <button
                          type="button"
                          className="wood-book-delete"
                          aria-label={`删除《${story.title}》`}
                          onClick={() => onDeleteStory(story)}
                        >
                          删除
                        </button>
                      )}
                      {story.kind !== "merged" && !story.readOnly && !isManualStory(story) && onFuseStory && (
                        <button
                          type="button"
                          className="wood-book-fuse"
                          aria-label={`让《${story.title}》与另一条线合流`}
                          onClick={() => onFuseStory(story.id)}
                        >
                          合流
                        </button>
                      )}
                    </div>
                  </div>
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

// The reader's avatar collection, shared by every surface that needs it.
// The server is the source of truth (the avatars follow the account, not
// the browser); surfaces read through this one hook instead of keeping
// copies. `avatar` is the main avatar — the identity the home row,
// profile and plaza resolve; pickers read the whole `avatars` list.
function useAvatarProfile(authClient, account) {
  const [avatars, setAvatars] = useState([]);
  const [mainId, setMainId] = useState(null);
  const [quota, setQuota] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const status = account?.status;
  const refresh = useCallback(async () => {
    if (status !== "authenticated") {
      setAvatars([]);
      setMainId(null);
      setQuota(null);
      setLoaded(true);
      return null;
    }
    try {
      const result = await fetchAvatars({ getAccessToken: () => authClient.getAccessToken() });
      setAvatars(result.avatars);
      setMainId(result.mainId);
      setQuota(result.quota);
      return result;
    } catch {
      return null;
    } finally {
      setLoaded(true);
    }
  }, [authClient, status]);
  useEffect(() => { void refresh(); }, [refresh]);
  const avatar = mainAvatarOf(avatars, mainId);
  const updateAvatar = useCallback((profile) => {
    if (!profile?.id) return;
    setAvatars((current) => {
      const at = current.findIndex((item) => item.id === profile.id);
      if (at === -1) return [...current, profile];
      const next = [...current];
      next[at] = profile;
      return next;
    });
  }, []);
  const applyCollection = useCallback((result) => {
    if (!result) return;
    if (Array.isArray(result.avatars)) setAvatars(result.avatars);
    if ("mainId" in result) setMainId(result.mainId);
  }, []);
  return { avatar, avatars, mainId, quota, loaded, refresh, updateAvatar, applyCollection };
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

function AvatarPage({ authClient, account, avatarState, stories, onOpenStory, onOpenAccount, onNavigate }) {
  const { avatars, mainId, quota } = avatarState;
  // editingId: undefined = not seeded yet, "" = creating a new avatar,
  // otherwise the id of the avatar in the editor. The form is seeded
  // imperatively at selection time (never by an effect watching the
  // collection), so a background refresh can never stomp an edit.
  const [editingId, setEditingId] = useState(undefined);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPrevious, setShowPrevious] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // REQ-57: the signature-ability editor's open panel (library grid or
  // the hand-written form) and the hand-written form's own text. The
  // chosen ability itself lives on the form; these are view state.
  const [abilityEditMode, setAbilityEditMode] = useState(null);
  const [abilityCustomName, setAbilityCustomName] = useState("");
  const [abilityCustomDesc, setAbilityCustomDesc] = useState("");
  const getToken = useCallback(() => authClient.getAccessToken(), [authClient]);
  const signedIn = account?.status === "authenticated" && Boolean(account?.user);

  const selected = editingId ? avatars.find((item) => item.id === editingId) || null : null;
  const creating = editingId === "";

  const seedForm = (target) => {
    // The form is name + description only (AVATAR-TRIM): a stored
    // legacy `appearance` object is never seeded into the form, so it
    // can neither render nor be submitted back. The signature ability
    // (REQ-57) is the one further field: seeded normalised, and the
    // key is ALWAYS present on the form (null = none set) so a save
    // speaks tri-state — see validateAvatarProfile.
    setForm(target
      ? { id: target.id, name: target.name, description: target.description || "", ability: avatarAbilityOf(target) }
      : { id: "", name: "", description: "", ability: null });
    setAbilityEditMode(null);
    setConfirmDelete(false);
    setShowPrevious(false);
    setError("");
  };
  const selectAvatar = (item) => { setEditingId(item.id); seedForm(item); setNotice(""); };
  const startCreate = () => { setEditingId(""); seedForm(null); setNotice(""); };

  // First seed once the collection lands: edit the main avatar, or open
  // the creation form when there is none yet. The seed must wait for
  // sign-in: on a cold deep link the guest refresh marks loaded=true
  // with an empty list, and seeding then would strand a signed-in
  // owner on a blank creation form (the guard below would never reseed).
  useEffect(() => {
    if (!signedIn) {
      if (editingId !== undefined) { setEditingId(undefined); setForm(null); }
      return;
    }
    if (!avatarState.loaded || editingId !== undefined) return;
    const main = mainAvatarOf(avatars, mainId);
    if (main) { setEditingId(main.id); seedForm(main); }
    else { setEditingId(""); seedForm(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarState.loaded, editingId, signedIn]);

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
        <div className="merge-heading"><div><h1>我的化身</h1><p className="da-load-row"><span className="da-spinner da-spinner--sm" aria-hidden="true" />正在打开…</p></div></div>
      </div>
    );
  }

  const portrait = avatarPortraitState(selected);
  const painting = busy || portrait.status === "pending";
  const previewAvatar = selected
    ? { ...selected, name: form.name || selected.name }
    : { id: form.id || "", name: form.name, portrait: { status: painting ? "pending" : "none", version: 0, hasPrevious: false } };
  const journeys = selected ? avatarJourneys(selected, stories) : [];
  const profileDirty = Boolean(selected) && (
    form.name !== selected.name
    || form.description !== (selected.description || "")
    || JSON.stringify(form.ability || null) !== JSON.stringify(avatarAbilityOf(selected) || null)
  );
  const atLimit = avatars.length >= AVATAR_LIMIT;
  const quotaLine = quota ? `今天已用 ${quota.used} / ${quota.limit} 次` : "";

  const paint = async (nextForm) => {
    if (busy) return;
    if (!nextForm.name.trim()) { setError("先给化身取个名字。"); return; }
    setBusy(true);
    setError("");
    setNotice("");
    let targetId = nextForm.id || "";
    try {
      if (!targetId) {
        const created = await createAvatar({ profile: nextForm, getAccessToken: getToken });
        targetId = created.id;
      }
      const painted = await generateAvatar({
        profile: { ...nextForm, id: targetId },
        avatarId: targetId,
        getAccessToken: getToken,
      });
      avatarState.updateAvatar(painted);
      setEditingId(painted.id);
      seedForm(painted);
      setNotice("立绘已更新。");
      void avatarState.refresh();
    } catch (failure) {
      setError(failure.message || "立绘暂时没能生成，请稍后再试。");
      // The server persisted what it could (the profile, a failed
      // portrait state); reconcile so the page shows the truth.
      const result = await avatarState.refresh();
      if (targetId && result?.avatars.some((item) => item.id === targetId)) setEditingId(targetId);
    } finally {
      setBusy(false);
    }
  };

  const saveProfileOnly = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await saveAvatar({ profile: form, getAccessToken: getToken });
      avatarState.updateAvatar(saved);
      setNotice("资料已保存。");
    } catch (failure) {
      setError(failure.message || "资料暂时没能保存，请稍后再试。");
    } finally {
      setBusy(false);
    }
  };
  const adoptPreset = (preset) => {
    setForm({ id: "", name: preset.name, description: preset.description, ability: avatarAbilityOf(preset) });
    setAbilityEditMode(null);
    setError("");
  };
  // REQ-57 editor actions: the library pick and the hand-written apply
  // both land on the form (saved through the ordinary profile paths);
  // opening the hand-written panel seeds it from a custom ability the
  // form already carries, so re-editing starts from the current words.
  const openAbilityCustom = () => {
    const current = form.ability;
    const isCustom = current && !ALL_ABILITIES.some((item) => item.id === current.id);
    setAbilityCustomName(isCustom ? current.name : "");
    setAbilityCustomDesc(isCustom ? current.desc : "");
    setAbilityEditMode("custom");
  };
  const applyAbilityCustom = () => {
    const name = abilityCustomName.trim();
    if (!name) { setError("先给这个能力取个名字。"); return; }
    setForm({ ...form, ability: normalizeAvatarAbility({ id: "custom", name, desc: abilityCustomDesc }) });
    setAbilityEditMode(null);
    setError("");
  };
  const makeMain = async () => {
    if (!selected || busy || selected.id === mainId) return;
    setBusy(true);
    setError("");
    try {
      const result = await setMainAvatar({ avatarId: selected.id, getAccessToken: getToken });
      avatarState.applyCollection(result);
      setNotice(`${selected.name} 现在是你的主化身。`);
    } catch (failure) {
      setError(failure.message || "主化身暂时没能切换，请稍后再试。");
    } finally {
      setBusy(false);
    }
  };
  const removeSelected = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await deleteAvatar({ avatarId: selected.id, getAccessToken: getToken });
      avatarState.applyCollection(result);
      void avatarState.refresh();
      const next = mainAvatarOf(result.avatars, result.mainId);
      if (next) { setEditingId(next.id); seedForm(next); }
      else { setEditingId(""); seedForm(null); }
      setNotice("这位化身已删除。TA 走过的故事都还在书架上。");
    } catch (failure) {
      setError(failure.message || "删除没能完成，请稍后再试。");
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page-avatar page-enter">
      <div className="merge-heading">
        <div>
          <h1>我的化身</h1>
          <p>主化身是你的身份，其余化身陪你走进不同的世界。各条故事线互不影响，化身是它们之间的连接。</p>
        </div>
      </div>
      {error && <div className="sw-inline-alert" role="alert">{error}</div>}
      {notice && <p className="field-hint" role="status">{notice}</p>}
      {avatars.length > 0 && (
        <section className="avatar-collection" aria-label="化身列表">
          <div className="avatar-list">
            {avatars.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`avatar-card ${!creating && selected?.id === item.id ? "active" : ""}`}
                aria-pressed={!creating && selected?.id === item.id}
                disabled={busy}
                onClick={() => selectAvatar(item)}
              >
                <span className="avatar-card-thumb">
                  <AvatarPortrait avatar={item} getAccessToken={getToken} />
                </span>
                <span className="avatar-card-copy">
                  <span className="avatar-card-name-row">
                    <b>{item.name}</b>
                    {item.id === mainId && <span className="avatar-main-badge">主化身</span>}
                  </span>
                  <small>{avatarAppearanceText(item)}</small>
                  {avatarAbilityOf(item) && <small className="avatar-card-ability">专属能力 · {avatarAbilityOf(item).name}</small>}
                </span>
              </button>
            ))}
            <button
              type="button"
              className={`avatar-card avatar-card-new ${creating ? "active" : ""}`}
              disabled={busy || atLimit}
              onClick={startCreate}
            >
              <span className="avatar-card-copy">
                <b>新建化身</b>
                <small>{atLimit ? `最多 ${AVATAR_LIMIT} 位，先删掉一位再建` : `已 ${avatars.length} / ${AVATAR_LIMIT} 位 · 新立绘用掉今天 1 次额度`}</small>
              </span>
            </button>
          </div>
        </section>
      )}
      <div className="avatar-layout">
        <section className="avatar-stage">
          <div className="avatar-frame">
            <AvatarPortrait avatar={previewAvatar} getAccessToken={getToken} which={showPrevious ? "previous" : "current"} />
            {painting && <div className="avatar-frame-state">正在画…</div>}
            {!painting && portrait.status === "failed" && <div className="avatar-frame-state is-error">上次没画成</div>}
          </div>
          {selected && portrait.hasPrevious && (
            <button type="button" className="small-link" onClick={() => setShowPrevious((value) => !value)}>
              {showPrevious ? "看当前版本" : "回看上一版"}
            </button>
          )}
          {selected && portrait.version > 0 && <span className="avatar-version">立绘 v{portrait.version}</span>}
          {creating && <p className="field-hint">写下名字和样子，第一张立绘就会画出来。</p>}
          {selected && portrait.status !== "ready" && !painting && (
            <Button icon="spark" disabled={busy} onClick={() => void paint(form)}>
              {portrait.status === "failed" ? "重新生成立绘" : "生成立绘"}
            </Button>
          )}
          {selected && (
            <div className="avatar-stage-actions">
              {selected.id !== mainId && (
                <button type="button" className="small-link" disabled={busy} onClick={() => void makeMain()}>
                  设为主化身
                </button>
              )}
              {!confirmDelete ? (
                <button type="button" className="small-link is-danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
                  删除这位化身
                </button>
              ) : (
                <>
                  <button type="button" className="small-link is-danger" disabled={busy} onClick={() => void removeSelected()}>
                    确认删除
                  </button>
                  <button type="button" className="small-link" disabled={busy} onClick={() => setConfirmDelete(false)}>
                    不删了
                  </button>
                </>
              )}
            </div>
          )}
          {selected && confirmDelete && (
            <p className="field-hint">删掉后，这位化身走过的故事仍留在书架上（开书时带入的样子已经记在书里），只是不能再带 TA 开新书。</p>
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
          {/* REQ-57: the signature ability editor. The ability itself
              is one { name, desc } — picked from the same library the
              forge's ability step uses, or written by hand under the
              same bounds. It presets HERE only; entering a world may
              swap or rewrite it for that book without touching this. */}
          <div className="form-block avatar-ability-editor">
            <span className="field-label">专属能力（选填）</span>
            {form.ability ? (
              <div className="ability-card active avatar-ability-current">
                <span>
                  <b>{form.ability.name}</b>
                  <small>{form.ability.desc || "还没有写效果"}</small>
                </span>
              </div>
            ) : (
              <p className="field-hint">还没设置。设好之后，带 TA 进任何世界，默认就用这个能力开局。</p>
            )}
            <div className="avatar-ability-actions">
              <button
                type="button"
                className="small-link"
                disabled={busy}
                onClick={() => setAbilityEditMode(abilityEditMode === "library" ? null : "library")}
              >
                {form.ability ? "从能力库换一个" : "从能力库选"}
              </button>
              <button type="button" className="small-link" disabled={busy} onClick={openAbilityCustom}>
                自己写一个
              </button>
              {form.ability && (
                <button
                  type="button"
                  className="small-link"
                  disabled={busy}
                  onClick={() => { setForm({ ...form, ability: null }); setAbilityEditMode(null); }}
                >
                  清除
                </button>
              )}
            </div>
            {abilityEditMode === "library" && (
              <div className="ability-list avatar-ability-library">
                {ALL_ABILITIES.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`ability-card ${form.ability?.id === item.id ? "active" : ""}`}
                    aria-pressed={form.ability?.id === item.id}
                    disabled={busy}
                    onClick={() => {
                      setForm({ ...form, ability: { id: item.id, name: item.name, desc: item.desc } });
                      setAbilityEditMode(null);
                    }}
                  >
                    <span>
                      <b>{item.name}</b>
                      <small>{item.desc}</small>
                    </span>
                    <span className="ability-radio">
                      {form.ability?.id === item.id && <i />}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {abilityEditMode === "custom" && (
              <div className="avatar-ability-custom">
                <label className="field-label">
                  能力名
                  <input
                    maxLength={40}
                    autoComplete="off"
                    value={abilityCustomName}
                    disabled={busy}
                    onChange={(event) => setAbilityCustomName(event.target.value)}
                    placeholder="给这个能力取个名字"
                  />
                </label>
                <label className="field-label">
                  它能做到什么
                  <input
                    maxLength={120}
                    autoComplete="off"
                    value={abilityCustomDesc}
                    disabled={busy}
                    onChange={(event) => setAbilityCustomDesc(event.target.value)}
                    placeholder="一句话写清效果和边界"
                  />
                </label>
                <div className="avatar-ability-actions">
                  <button type="button" className="small-link" disabled={busy} onClick={applyAbilityCustom}>
                    就用这个
                  </button>
                  <button type="button" className="small-link" disabled={busy} onClick={() => setAbilityEditMode(null)}>
                    先不写了
                  </button>
                </div>
              </div>
            )}
          </div>
          {creating && avatars.length === 0 && (
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
                  </button>
                ))}
              </div>
            </div>
          )}
          {selected && (
            <p className="avatar-repaint-note">
              改描述后点「按描述重画立绘」，整张图重新生成。每次重画用掉今天 1 次立绘额度{quotaLine ? `（${quotaLine}）` : ""}。
            </p>
          )}
          <div className="avatar-actions">
            {creating && (
              <Button icon="spark" disabled={busy || !form.name.trim()} onClick={() => void paint(form)}>
                {busy ? "正在画…" : "创建并生成立绘"}
              </Button>
            )}
            {creating && quotaLine && <span className="field-hint">新立绘用掉今天 1 次额度（{quotaLine}）。</span>}
            {selected && portrait.status === "ready" && (
              <Button icon="spark" disabled={busy} onClick={() => void paint(form)}>
                {busy ? "正在画…" : "按描述重画立绘"}
              </Button>
            )}
            {profileDirty && (
              <button type="button" className="small-link" disabled={busy} onClick={() => void saveProfileOnly()}>
                只保存资料
              </button>
            )}
          </div>
          {selected && painting && <p className="field-hint">正在重画立绘，请稍等。</p>}
        </section>
      </div>
      {selected && (
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
        {/* REQ-59: the card face carries name + one line of atmosphere
            + artwork only. The world's setting text is the editable
            draft inside the step (below the grid, once picked), not
            fixed copy printed on the card. */}
      </span>
      {selected && (
        <span className="selected-mark">
          <Icon name="check" size={13} />
        </span>
      )}
    </button>
  );
}

function PreviewPanel({ world, template, draft, ability, spawn, onJump }) {
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
      <dl className="preview-facts da-kv-list">
        {factRow("题材", template ? twoSegmentTemplateName(template) : "完全自由", isCustom ? 2 : 1, "修改题材")}
        {factRow("世界", world.name, 2, "修改世界")}
        <div><dt>篇幅</dt><dd>{lengthLabelFor({ config: draft })}</dd></div>
        <div><dt>身份</dt><dd>{origin ? (origin.localTitle !== origin.name ? `${origin.name} · ${origin.localTitle}` : origin.name) : (draft.origin || "未定")}</dd></div>
        <div><dt>出生点</dt><dd>{spawn ? spawn.name : "由设定决定"}</dd></div>
        {draft.genreId === CUSTOM_GENRE.id && (
          <div><dt>设定</dt><dd>{(draft.customWorldSetting || "").trim().slice(0, 80) || "尚未写下设定"}</dd></div>
        )}
        {draft.genreId !== CUSTOM_GENRE.id && (
          <div><dt>设定</dt><dd>{worldSettingOf(genreById[draft.genreId] || GENRES[0], draft).slice(0, 80)}</dd></div>
        )}
        <div><dt>主角</dt><dd>{person}</dd></div>
        <div><dt>性格</dt><dd>{draft.avatarId ? "化身自带" : draft.trait}</dd></div>
        <div><dt>能力</dt><dd>{ability?.name || "未定"}</dd></div>
      </dl>
    </aside>
  );
}

function GenerationMode({ provider, value, onChange, disabled }) {
  return <div className="generation-mode">
    <div className="generation-options" role="group" aria-label="故事方式">
      <button disabled={disabled} aria-pressed={value === "local"} onClick={() => onChange("local")}>预设体验</button>
      <button disabled={disabled || !provider.configured} aria-pressed={value === "gemini"} onClick={() => onChange("gemini")}>在线塑造</button>
    </div>
    <p className="experience-note">{value === "gemini"
      ? "设定与剧情会用于在线塑造。请使用昵称或虚构资料；每次续写会使用服务端额度。"
      : provider.configured ? "无需等待，按所选篇幅体验预设故事。" : provider.reason === "generation-disabled" ? "在线创作暂未开放，可先体验预设故事。" : "预设剧情体验 · 在线塑造暂不可用"}</p>
  </div>;
}

/**
 * 自己写 · 建书 (WRITE-MODE §50): the whole act of opening a hand-written
 * book is this one short form — a name and the author's own introduction
 * up front; the family shelf and the tags ride one row below (progressive
 * disclosure: file it if you care, skip it if you don't). No world, no
 * protagonist, no length — chapters are added in the writing desk.
 * onCreate returns a human error string, or null once the book exists.
 */
function ManualBookForm({ onCreate, onCancel }) {
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [shelfId, setShelfId] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    const tags = tagsText.split(/[、，,\s]+/).map((tag) => tag.trim()).filter(Boolean);
    const failure = onCreate ? onCreate({ title, synopsis, shelfId, tags }) : "建书没能完成，请再试一次。";
    if (failure) setError(failure);
  };
  return (
    <div className="manual-book-form">
      <div className="forge-section-heading">
        <div>
          <h2 tabIndex={-1}>自己写一本</h2>
          <p className="step-intro">这本书的每一章都由你亲手写。先给它一个名字和一句介绍，剩下的到写作台里慢慢写。</p>
        </div>
      </div>
      <label className="field-label">
        书名
        <input
          type="text"
          maxLength={BOOK_TITLE_MAX * 2}
          value={title}
          aria-label="书名"
          placeholder="给这本书起个名字"
          onChange={(event) => { setTitle(event.target.value); setError(""); }}
        />
      </label>
      <label className="field-label">
        简介
        <textarea
          rows={4}
          maxLength={SYNOPSIS_MAX}
          value={synopsis}
          aria-label="本书简介"
          placeholder="用几句话介绍这本书：它讲什么、谁在里面、会往哪里走。之后在设定集里随时能改。"
          onChange={(event) => setSynopsis(event.target.value)}
        />
      </label>
      <div className="manual-book-more">
        <span className="field-label">题材分类（可不选）</span>
        <div className="manual-shelf-row" role="group" aria-label="题材分类">
          <button
            type="button"
            className={`choice-chip ${shelfId === "" ? "active" : ""}`}
            aria-pressed={shelfId === ""}
            onClick={() => setShelfId("")}
          >
            不分类
          </button>
          {GENRE_SHELVES.map((shelf) => (
            <button
              type="button"
              key={shelf.id}
              className={`choice-chip ${shelfId === shelf.id ? "active" : ""}`}
              aria-pressed={shelfId === shelf.id}
              onClick={() => setShelfId(shelf.id)}
            >
              {shelf.name}
            </button>
          ))}
        </div>
        <label className="field-label">
          标签（可不填，用顿号隔开，最多 5 个）
          <input
            type="text"
            value={tagsText}
            aria-label="标签"
            placeholder="例如：海港、旧信、慢热"
            onChange={(event) => setTagsText(event.target.value)}
          />
        </label>
      </div>
      {error && (
        <p className="intervention-error" role="alert">
          {error}
        </p>
      )}
      <div className="forge-actions">
        <button type="button" className="back-button" onClick={onCancel}>
          <Icon name="chevron" size={15} className="rotate-180" />
          回到造世
        </button>
        <div className="forge-actions-right">
          <Button icon="pencil" onClick={submit}>
            建书，开始写
          </Button>
        </div>
      </div>
    </div>
  );
}

function Forge({ onGenerate, onCreateManual, initialDraft, onDraftChange, provider, authClient, avatar, avatars = [], mainId = null, avatarLoaded, onOpenAvatar }) {
  const forgeRef = useRef(null);
  const operation = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 自己写 (WRITE-MODE §50): the forge's first screen carries one more
  // door beside the AI flow — a book the reader writes by hand. It swaps
  // the whole forge body for the short create form; the AI draft under
  // way is untouched and waits exactly where it was left.
  const [manualOpen, setManualOpen] = useState(false);
  const [mode, setMode] = useState(null);
  const engine = mode || (provider.configured ? "gemini" : "local");
  useEffect(() => () => operation.current?.abort(), []);
  // The main avatar is pre-selected as this book's protagonist (F-27):
  // applied once per forge visit, only into a draft that carries neither
  // a pick nor a hand-typed name, and always cancellable in step 4.
  const avatarPreselectDone = useRef(false);
  useEffect(() => {
    if (avatarPreselectDone.current || !avatarLoaded || !mainId) return;
    avatarPreselectDone.current = true;
    setDraft((current) => {
      if (current.avatarId || (current.name || "").trim()) return current;
      const main = avatars.find((item) => item.id === mainId);
      const patch = main ? avatarDraftPatch(main) : null;
      if (!patch) return current;
      return { ...current, ...patch };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarLoaded, mainId]);
  const [step, setStep] = useState(
    clampForgeStep(initialDraft?.step),
  );
  // REQ-71 motion wiring: the step transition reads its direction from
  // the previously shown step; the roll nonce re-fires the dice-settle
  // flicker on every random pick. The motion policy silences both
  // whole (animate=false renders everything at rest, complete).
  const { animate: forgeAnimate } = useMotionPolicy("forge");
  const prevStepRef = useRef(step);
  const [rollFx, setRollFx] = useState(0);
  // REQ-71: directional step transition (DESIGN §5 --dur-step). §53
  // forbids whole-page horizontal slides, so direction rides the
  // vertical axis — forward steps rise in from below, backward steps
  // settle in from above — and the panel's blocks stagger 30ms apart
  // with the whole cascade capped near 180ms. clearProps on both the
  // tweens and the cleanup leaves no residue behind.
  useEffect(() => {
    const direction = Math.sign(step - prevStepRef.current);
    prevStepRef.current = step;
    if (!forgeAnimate || direction === 0) return undefined;
    const panel = forgeRef.current?.querySelector(".forge-step-panel");
    if (!panel) return undefined;
    const blocks = panel.querySelectorAll(":scope > *");
    const forward = direction > 0;
    const tweens = [
      gsap.fromTo(
        panel,
        { y: forward ? 16 : -8, opacity: 0 },
        { y: 0, opacity: 1, duration: forward ? 0.42 : 0.32, ease: "power3.out", clearProps: "transform,opacity" },
      ),
    ];
    if (blocks.length > 1) {
      tweens.push(gsap.fromTo(
        blocks,
        { y: 10, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.38, ease: "power3.out", clearProps: "transform,opacity", delay: 0.04, stagger: 0.03 },
      ));
    }
    return () => {
      tweens.forEach((tween) => tween.kill());
      gsap.set([panel, ...blocks], { clearProps: "transform,opacity" });
    };
  }, [step, forgeAnimate]);
  // REQ-71: the free-creation hero breathes. Entrance is staggered by
  // layer (the nebula settles out of a slow push-in, the ring scales
  // up through a quarter-turn, the stardust fades in last); the
  // ambient loop then breathes ring and glow on offset sine cycles
  // and drifts the stardust sheet across the plate. Transform/opacity
  // only; with the policy off nothing is set and the composed plate
  // simply sits, complete.
  useEffect(() => {
    if (!forgeAnimate || step !== 1) return undefined;
    const root = forgeRef.current;
    const nebula = root?.querySelector(".genre-hero-nebula");
    const dust = root?.querySelector(".genre-hero-dust");
    const vortex = root?.querySelector(".genre-hero-vortex");
    const ring = root?.querySelector(".genre-hero-ring-img");
    const glow = root?.querySelector(".genre-hero-glow");
    if (!nebula || !vortex || !ring) return undefined;
    const tweens = [
      gsap.fromTo(nebula, { scale: 1.12, opacity: 0 }, { scale: 1.04, opacity: 1, duration: 1.1, ease: "power2.out" }),
      gsap.fromTo(vortex, { scale: 0.82, opacity: 0, rotate: -10 }, { scale: 1, opacity: 1, rotate: 0, duration: 1.2, ease: "expo.out", delay: 0.1, clearProps: "transform,opacity" }),
      gsap.to(ring, { scale: 1.05, duration: 7, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 1.3 }),
      gsap.to(nebula, { xPercent: 1.2, duration: 30, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 1.2 }),
    ];
    if (dust) {
      tweens.push(gsap.fromTo(dust, { opacity: 0 }, { opacity: 0.85, duration: 1.4, delay: 0.25 }));
      tweens.push(gsap.to(dust, { xPercent: -2.5, yPercent: 1.5, duration: 26, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 1.6 }));
    }
    if (glow) {
      tweens.push(gsap.to(glow, { opacity: 0.62, scale: 1.12, duration: 5, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 1.3 }));
    }
    return () => {
      tweens.forEach((tween) => tween.kill());
      gsap.set([nebula, dust, vortex, ring, glow].filter(Boolean), { clearProps: "transform,opacity" });
    };
  }, [step, forgeAnimate]);
  // REQ-71: a roll lands with a dice-settle — the result line flickers
  // three times in 90ms steps and settles, the way a slot reel stops.
  // Restrained on purpose: no spinning bricks, no confetti.
  useEffect(() => {
    if (!forgeAnimate || rollFx === 0) return undefined;
    const lines = forgeRef.current?.querySelectorAll(".random-combo-row p, .world-selection-note");
    if (!lines?.length) return undefined;
    const tween = gsap.timeline()
      .to(lines, { opacity: 0.25, duration: 0.09, ease: "steps(1)" })
      .to(lines, { opacity: 1, duration: 0.09, ease: "steps(1)" })
      .to(lines, { opacity: 0.35, duration: 0.09, ease: "steps(1)" })
      .to(lines, { opacity: 1, duration: 0.3, ease: "power3.out", clearProps: "opacity" });
    return () => {
      tween.kill();
      gsap.set(lines, { clearProps: "opacity" });
    };
  }, [rollFx, forgeAnimate]);
  // 「默认即选中」 governance: a value the system filled in silently (the
  // first template, the default trait/style/length) is NOT shown as a
  // deliberate pick. A restored draft's stored values were all confirmed
  // on its own summary screen in their session, so they count as picked;
  // a fresh draft's untouched defaults render with a 「默认」 tag until
  // the reader actually taps a choice (or the summary restates them).
  const wasRestored = initialDraft?.restoredDraft === true;
  // The template is the one pick a silent default can counterfeit
  // (PHONE-FIX §37): the draft initializer fills the wall's first brick
  // so generation always has a category, and merely opening the forge
  // persists that fill — a restored draft carrying it is NOT a pick,
  // and must not teleport the reader into that family on re-entry. A
  // restored template counts as picked only when the draft carries
  // the explicit marker (saved by the flow itself from now on) or when
  // its id is anything but the silent default — only a deliberate tap
  // or roll can have put it there.
  const templateWasPicked = wasRestored && (
    initialDraft?.templatePicked === true
    || (Boolean(initialDraft?.genreTemplateId)
      && initialDraft.genreTemplateId !== (templateWall[0]?.id || ""))
  );
  const [pickedTemplate, setPickedTemplate] = useState(templateWasPicked);
  const [pickedTrait, setPickedTrait] = useState(wasRestored);
  const [pickedLength, setPickedLength] = useState(wasRestored);
  // FORGE-TRIM: the three personality entries currently offered under
  // the trait input, and the four inspiration fragments currently
  // offered in the god-mode form. Both batches are drawn once per forge
  // visit; the trait batch redraws on refresh (excluding the batch on
  // screen), the fragment batch redraws each time god mode is entered.
  const [traitBatch, setTraitBatch] = useState(() => drawPersonalityTraits(3));
  const [fragmentBatch, setFragmentBatch] = useState(() => drawInspirationFragments(4));
  // Step one's open shelf (two-level taxonomy): a genuinely picked
  // template resumes on its own L2 screen with the pick lit; every
  // other entry — fresh, or restored-but-never-picked — starts on the
  // L1 shelf screen with nothing pre-opened.
  const [shelfId, setShelfId] = useState(() => {
    if (!templateWasPicked) return null;
    const shelf = shelfForTemplate(initialDraft?.genreTemplateId || "");
    return shelf && shelf.templateIds.length > 1 ? shelf.id : null;
  });
  // REQ-51 revised layout: the shelf taxonomy is step 1's SECOND layer.
  // It starts open only when a restored draft actually picked a
  // template (so the pick is visible and changeable); a fresh start or
  // a custom-genre draft lands on the free-creation hero with the
  // shelves tucked behind their door.
  const [shelvesOpen, setShelvesOpen] = useState(() => Boolean(
    templateWasPicked && initialDraft?.genreTemplateId !== CUSTOM_TEMPLATE_ID,
  ));
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
    // "completely free" and must survive the restore. A restored FREE
    // genre (REQ-51) is a real pick too: 'custom' with its words intact
    // resumes as itself, never folded into a stock template.
    if (base.genreTemplateId === CUSTOM_TEMPLATE_ID) {
      if (!(base.customGenreText || "").trim()) {
        base.genreTemplateId = templateWall[0]?.id || "";
        base.customGenreText = "";
      }
    } else if (base.genreId !== CUSTOM_GENRE.id && !genreTemplateById(base.genreTemplateId)) {
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
  // REQ-57: with an avatar brought in, the ability step asks WHERE this
  // book's ability comes from — the avatar's own signature ability
  // (the default), a swap from this world's candidates, or one the
  // reader writes for this book only. The pick never writes back to
  // the avatar profile. null = not chosen yet this visit; the
  // effective source is derived below (a linked avatar with a
  // signature ability defaults to "signature"). A restored draft's
  // stored source wins; a pre-REQ-57 draft whose stored ability IS the
  // linked avatar's signature reads as "signature" too.
  const [abilitySource, setAbilitySource] = useState(() => {
    const stored = initialDraft?.abilitySource;
    if (stored === "signature" || stored === "swap" || stored === "custom") return stored;
    const linked = (avatars || []).find((item) => item.id === initialDraft?.avatarId) || null;
    const signature = (linked ? avatarAbilityOf(linked) : null) || normalizeAvatarAbility(initialDraft?.avatarAbility);
    if (initialDraft?.avatarId && signature && initialDraft?.ability === signature.name) return "signature";
    return null;
  });
  const isCustom = draft.genreId === CUSTOM_GENRE.id;
  // True only once a world was deliberately picked, rolled or combo-rolled
  // (or the draft predates the world screen — see legacyDraftToDraft). The
  // bare genreId default never counts as a choice.
  const worldChosen = draft.worldChosen === true;
  const customWorldName = (draft.customWorldName || "").trim();
  // REQ-59: a preset world is a draft the creator may rename and
  // rewrite. The effective world name shown everywhere in the flow is
  // the draft's name when a draft exists; the setting text follows the
  // same rule (worldSettingOf), falling back to the preset's own text.
  const presetGenre = genreById[draft.genreId] || GENRES[0];
  const activeWorldDraft = isCustom ? null : worldDraftOf(presetGenre, draft);
  const world = isCustom
    ? { ...toWorld(CUSTOM_GENRE), name: customWorldName || CUSTOM_GENRE.world, location: customWorldName || CUSTOM_GENRE.location }
    : { ...toWorld(presetGenre), ...(activeWorldDraft?.name ? { name: activeWorldDraft.name } : {}) };
  const worldDraftName = activeWorldDraft ? activeWorldDraft.name : presetGenre.world;
  const worldDraftSetting = activeWorldDraft ? activeWorldDraft.setting : (presetGenre.description || "");
  // The first edit seeds the entry with the world's full effective text,
  // so the stored draft is always a complete snapshot (name + setting),
  // never a half-override the engine has to guess at.
  const setWorldDraft = (patch) => {
    const current = activeWorldDraft || { name: presetGenre.world, setting: presetGenre.description || "" };
    set({ worldDrafts: { ...(draft.worldDrafts || {}), [presetGenre.id]: { ...current, ...patch } } });
  };
  const clearWorldDraft = () => {
    const rest = { ...(draft.worldDrafts || {}) };
    delete rest[presetGenre.id];
    set({ worldDrafts: rest });
  };
  // 自由题材 (REQ-51): a custom pin presents as a template-shaped object
  // carrying the reader's own words, so every surface that names the
  // category （摘要/预览/已选行） speaks the reader's genre, never a
  // borrowed stock name. Its blurb stays empty — the step-one note has
  // its own custom line.
  const customGenreActive = draft.genreTemplateId === CUSTOM_TEMPLATE_ID
    && Boolean((draft.customGenreText || "").trim());
  const template =
    genreTemplateById(draft.genreTemplateId) ||
    (customGenreActive
      ? { id: CUSTOM_TEMPLATE_ID, name: (draft.customGenreText || "").trim(), fullName: (draft.customGenreText || "").trim(), blurb: "" }
      : (isCustom ? null : templateWall[0]));
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
      if (draft.startPointHook !== kept.hook || draft.startPointCustom) set({ startPointHook: kept.hook, startPointCustom: false });
    } else if (draft.startPointName || draft.startPointHook || draft.startPointCustom) {
      set({ startPointName: "", startPointHook: "", startPointCustom: false });
    }
    // Only the world switch matters here; the draft fields are read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.genreId]);
  // Changing the identity re-frames the spawn point: the old pick belonged
  // to the old identity's cell, so the spawn choice resets to the new
  // identity's default.
  const selectIdentity = (identityId) => {
    if (identityId === draft.originIdentityId) return;
    set({ originIdentityId: identityId, startPointName: "", startPointHook: "", startPointCustom: false });
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
      set({ originIdentityId: rolledIdentity.id, startPointName: "", startPointHook: "", startPointCustom: false });
      return;
    }
    const points = spawnPointsForIdentity(spawnGenre, rolledIdentity.id);
    const point = points.length ? points[Math.floor(Math.random() * points.length)] : null;
    set({
      originIdentityId: rolledIdentity.id,
      startPointName: point ? point.name : "",
      startPointHook: point ? point.hook : "",
      startPointCustom: false,
    });
  };
  // 题材与世界彻底解耦：题材屏只写分类，世界屏只写世界，两边互不跟随。
  // Picking a category touches the category field and nothing else — never
  // the world, never the world marker. It also counts as a deliberate pick
  // (the 「默认」 tag comes off) and clears any stale roll path.
  const selectTemplate = (item) => {
    setPickedTemplate(true);
    setRolledPath(null);
    set({ genreTemplateId: item.id, customGenreText: "" });
  };
  // 自由题材 (REQ-51): the input keeps its own text while typing (the
  // custom-length field's discipline) — the draft only carries the
  // words while the custom pin is live. Typing selects the pin;
  // clearing the field retires it back to the wall's default brick.
  // The local text survives template detours, so wandering off to a
  // stock brick and coming back never costs the reader their words.
  const [customGenreInput, setCustomGenreInput] = useState(() =>
    (initialDraft?.genreTemplateId === CUSTOM_TEMPLATE_ID ? (initialDraft?.customGenreText || "") : ""));
  const applyCustomGenreText = (value) => {
    const text = value.slice(0, CUSTOM_GENRE_TEXT_MAX);
    setCustomGenreInput(text);
    if (text.trim()) {
      setPickedTemplate(true);
      setRolledPath(null);
      setShelfId(null);
      set({ genreTemplateId: CUSTOM_TEMPLATE_ID, customGenreText: text });
    } else if (draft.genreTemplateId === CUSTOM_TEMPLATE_ID) {
      set({ genreTemplateId: templateWall[0]?.id || "", customGenreText: "" });
    }
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
    set({ genreTemplateId: rolledTemplate.id, customGenreText: "" });
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
      // A roll is a swap by definition (REQ-57): with an avatar linked
      // it leaves the signature/custom source for the candidate list.
      if (draft.avatarId) setAbilitySource("swap");
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
    // Each god-mode entry offers a fresh handful of inspiration sparks.
    setFragmentBatch(drawInspirationFragments(4));
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
      customGenreText: "",
      genreId: stageGenre.id,
      worldChosen: true,
      originIdentityId: nextIdentity.id,
      startPointName: point ? point.name : "",
      startPointHook: point ? point.hook : "",
      startPointCustom: false,
    });
    setPickedTemplate(true);
    setRolledPath(null);
    const comboShelf = shelfForTemplate(nextTemplate.id);
    setShelfId(comboShelf && comboShelf.templateIds.length > 1 ? comboShelf.id : null);
    setRolled({ template: nextTemplate, world: stageGenre.world, identity: nextIdentity, point });
  };
  // REQ-57: the avatar linked into this draft (when the collection has
  // it) and its preset signature ability. A draft whose avatar is no
  // longer in the collection falls back to the ability snapshot the
  // bring-in patch recorded on the draft itself.
  const linkedAvatar = draft.avatarId
    ? (avatars.find((item) => item.id === draft.avatarId) || null)
    : null;
  const signatureAbility = linkedAvatar
    ? avatarAbilityOf(linkedAvatar)
    : normalizeAvatarAbility(draft.avatarAbility);
  // The effective three-way source: only meaningful with an avatar
  // linked. "signature" counts only while the avatar actually has one;
  // an avatar without a preset opens on "swap" (today's behaviour).
  const abilitySourceEff = !draft.avatarId
    ? null
    : abilitySource === "signature" && !signatureAbility
      ? "swap"
      : abilitySource || (signatureAbility ? "signature" : "swap");
  // A pick only counts while it belongs to the current candidate list (or
  // is the reader's own custom text): switching world or template retires
  // a stale pick instead of silently carrying another world's ability.
  // The signature source stands outside that rule by design — the
  // avatar's own ability is world-independent, like its character.
  const abilityPick = abilitySourceEff === "signature" && signatureAbility
    ? { id: signatureAbility.id || "signature", name: signatureAbility.name, desc: signatureAbility.desc, bounds: signatureAbility.bounds || "" }
    : abilityId === "custom"
      ? (customAbility.trim() ? { id: "custom", name: customAbility.trim(), desc: "你亲手写下的能力", bounds: "" } : null)
      : abilityCandidates.find((item) => item.id === abilityId) || null;
  const abilityName = abilityPick?.name || "";
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
    setFragmentBatch(drawInspirationFragments(4));
    setWorldImportNote(note);
    setError("");
  };
  const handleWorldFile = async (file) => {
    if (!file) return;
    try {
      // IMPORT-DAYLIGHT: size gate at the door, and text arrives via
      // the encoding rescue (GBK/Big5 files from real editors decode
      // instead of garbling) — the note says when a rescue happened.
      assertImportFileSize(file.size, "text");
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".json")) {
        const { text, encoding } = decodeImportText(new Uint8Array(await file.arrayBuffer()));
        const parsed = parseWorldInfoJson(text);
        const setting = (parsed.description || "").slice(0, CUSTOM_WORLD_SETTING_MAX);
        const violation = findSettingViolation([setting, ...parsed.entries.map((entry) => entry.content)].join("\n"));
        if (violation) { setError(violation); return; }
        const constants = parsed.entries.filter((entry) => entry.constant).length;
        applyImportedWorld({
          name: parsed.name,
          setting,
          entries: parsed.entries,
          note: `已导入世界书${parsed.name ? `《${parsed.name}》` : ""}：${parsed.entries.length} 条条目（其中 ${constants} 条常驻），挂在这本书上，生成时按关键词命中注入。${parsed.degradedConstants ? `常驻条目超过 ${LOREBOOK_CONSTANT_MAX} 条上限，多出的 ${parsed.degradedConstants} 条已改成按关键词触发。` : ""}${encoding !== "utf-8" ? "文件不是 UTF-8 编码，已自动转好。" : ""}世界名与设定可以在下面改；条目开书后在阅读器的「设定集」里查看和修改。`,
        });
      } else if (/\.(txt|md|markdown)$/.test(lower)) {
        const { text, encoding } = decodeImportText(new Uint8Array(await file.arrayBuffer()));
        const parsed = parseWorldText(text, file.name);
        const violation = findSettingViolation(parsed.text);
        if (violation) { setError(violation); return; }
        const long = parsed.text.trim().length > CUSTOM_WORLD_SETTING_MAX;
        const entries = long ? splitWorldTextIntoEntries(parsed.text) : [];
        applyImportedWorld({
          name: parsed.name,
          setting: leadingExcerpt(parsed.text, CUSTOM_WORLD_SETTING_MAX),
          entries,
          note: `已导入世界设定${parsed.name ? `《${parsed.name}》` : ""}（${parsed.text.trim().length} 字）${parsed.truncated ? "，文件过长，只取了前一部分" : ""}${long ? `：全文拆成 ${entries.length} 条世界书条目挂在这本书上，第一条常驻，其余按标题关键词命中注入；设定框里是开头摘要，可以改` : ""}${encoding !== "utf-8" ? "。文件不是 UTF-8 编码，已自动转好" : ""}。开书后在阅读器的「设定集」里能看全和修改。`,
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
      if (lower.endsWith(".png")) {
        assertImportFileSize(file.size, "png");
        card = parseCharacterCardPng(new Uint8Array(await file.arrayBuffer()));
      } else if (lower.endsWith(".json")) {
        assertImportFileSize(file.size, "text");
        card = parseCharacterCardJson(decodeImportText(new Uint8Array(await file.arrayBuffer())).text);
      } else { setError("角色卡可以导入 .json，或内嵌了角色卡的 .png 图片。"); return; }
      const persona = personaTextFromCard(card);
      const violation = findSettingViolation([persona, ...(card.book?.entries || []).map((entry) => entry.content)].join("\n"));
      if (violation) { setError(violation); return; }
      // Nothing is applied yet: the parsed card is shown first, and the
      // reader confirms (or edits) it into the protagonist profile. A
      // card may also carry its own little world book; it rides along
      // in the preview and lands on the book at the same confirmation.
      setCardPreview({ name: card.name, persona, book: card.book || null });
      setError("");
    } catch (failure) {
      setError(failure.message || "这张卡没能读进来，换个文件试试。");
    }
  };
  const applyCardPreview = () => {
    if (!cardPreview) return;
    // The card's character becomes this book's protagonist; a brought-in
    // avatar yields to it (the avatar itself is untouched). The card's
    // embedded world book APPENDS to whatever the world step already
    // hung on this book (the world step defines the world; the card's
    // book is its own travelling material), inside the entry cap.
    const bookEntries = cardPreview.book?.entries || [];
    const lorebook = bookEntries.length
      ? normalizeLorebookEntries([...(draft.lorebook || []), ...bookEntries])
      : draft.lorebook;
    set({ name: cardPreview.name, persona: cardPreview.persona, avatarId: "", avatarAppearance: "", avatarAbility: null, ...(bookEntries.length ? { lorebook } : {}) });
    setAbilitySource(null);
    setCardPreview(null);
  };
  const next = () => {
    // A free genre is reader-authored text like the god-mode setting:
    // same red-line check on leaving its step, never while typing.
    if (step === 1 && customGenreActive) {
      const violation = findSettingViolation(draft.customGenreText);
      if (violation) { setError(violation); return; }
    }
    // God-mode settings are checked when leaving the world step (the god
    // form lives there now), not while typing: a refused setting stays on
    // screen, editable, with the reason shown.
    if (step === 2 && isCustom) {
      const violation = findSettingViolation(draft.customWorldSetting);
      if (violation) { setError(violation); return; }
    }
    // REQ-59: an edited preset-world draft passes the same hard
    // pre-check as a god-mode setting, at the same moment (leaving the
    // world step), never while typing.
    if (step === 2 && !isCustom && activeWorldDraft) {
      const violation = findSettingViolation(activeWorldDraft.setting);
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
      abilityId: abilityPick?.id || "",
      // REQ-57: the picked ability's effect line and the three-way
      // source ride the draft too, so a restored forge reopens on the
      // same source with the same custom text (the custom text itself
      // is the stored ability name, as before).
      abilityDesc: abilityPick?.desc || "",
      // REQ-69 W5: the pick's bounds ride the draft beside its effect.
      abilityBounds: abilityPick?.bounds || "",
      abilitySource: abilitySourceEff || "",
      step,
      // Whether the step-one template was EVER deliberately picked or
      // rolled in this draft's life (§37): the restore funnel reads it
      // back to tell a real pick from the silent default fill, which
      // this very effect would otherwise persist as a counterfeit.
      templatePicked: pickedTemplate,
      // The five-step flow stamps its drafts so the restore funnel can
      // tell current step numbers from seven/six-step ones (see
      // migratedDraftStep) instead of folding them a second time.
      flowVersion: 5,
    });
  }, [draft, abilityName, abilityPick?.id, abilityPick?.desc, abilityPick?.bounds, abilitySourceEff, step, pickedTemplate, onDraftChange]);
  useEffect(() => {
    scrollToTop();
    forgeRef.current
      ?.querySelector(".forge-section-heading h2")
      ?.focus({ preventScroll: true });
  }, [step]);
  const submit = async () => {
    if (operation.current) return;
    if (customGenreActive) {
      const violation = findSettingViolation(draft.customGenreText);
      if (violation) { setError(violation); setStep(1); return; }
    }
    if (isCustom) {
      const violation = findSettingViolation(draft.customWorldSetting);
      if (violation) { setError(violation); setStep(2); return; }
    }
    if (!isCustom && activeWorldDraft) {
      const violation = findSettingViolation(activeWorldDraft.setting);
      if (violation) { setError(violation); setStep(2); return; }
    }
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    try { await onGenerate({
      ...draft,
      ability: abilityName,
      abilityDesc: abilityPick?.desc || "",
      abilityBounds: abilityPick?.bounds || "",
      world,
      abilityOption: abilityPick || { id: "", name: "", desc: "" },
    }, { engine, signal: controller.signal });
      // The first chapter has landed (§37 G3 burst moment): one short
      // sparkle as the wait surface lifts and the reader opens.
      burstParticles(); }
    catch (failure) { if (!controller.signal.aborted) setError(failure.message || "暂时没能打开故事，草稿还在。"); }
    finally { if (operation.current === controller) { operation.current = null; setBusy(false); } }
  };
  const spawnName = spawn?.name || world.location;
  // The opening line is composed from the actual configuration — the
  // chosen birthpoint's own opening circumstance, verbatim — never a
  // hardcoded sample: a sci-fi-flavoured sentence must not leak into a
  // cultivation world just because it was written first.
  const previewText = isCustom && (draft.customWorldSetting || "").trim()
    ? `${draft.name || "主角"}会在${world.name}醒来——${(draft.customWorldSetting || "").trim().slice(0, 56)}`
    : draft.immersive && draft.hometown
      ? `来自${draft.hometown}的${draft.role || "旅人"}，会在${spawnName}听见第一声回响。`
      : spawn?.hook
        ? `${draft.name || "主角"}，${spawn.hook}`
        : `${draft.name || "主角"}会在${spawnName}醒来。`;
  // 书名 (TITLE-FLOW): the confirmation step names the book explicitly.
  // The suggestion is exactly what createStory would derive; the field
  // shows it as the placeholder so an untouched book still gets a sane
  // name, and anything the reader types replaces it wholesale. The
  // preview card above the field carries the EFFECTIVE title — never
  // the bare world name, which is what used to make readers think the
  // world name WAS the book title.
  const bookTitleSuggestion = bookTitleSuggestionFor(draft);
  const effectiveBookTitle = (draft.bookTitle || "").trim() || bookTitleSuggestion;
  // REQ-66: the family's measured title formula (KB TITLES), shown as
  // the 书名 field's craft hint — pattern, shape and the one hook
  // element the name must carry. Advisory only; the hard limit stays
  // BOOK_TITLE_MAX in the hint above it.
  const bookTitleFormula = bookTitleFormulaForDraft(draft);
  // REQ-66: the family's measured world skeleton (KB WORLDS), shown in
  // the world step's draft fold as a reference for the setting text.
  const worldSkeletonHint = worldSkeletonKbFor(
    genreTemplateById(draft.genreTemplateId)?.id
      || (customGenreActive ? customGenreAnchorTemplateId(draft.customGenreText || "") : ""),
  );
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
  // REQ-57: the ability step's pieces, composed by source below. The
  // candidate groups + random card are the 「换一个能力」 body (and,
  // with no avatar linked, the whole step as before); the custom field
  // is the 「自己编辑一个」 body (and the step's tail as before).
  const abilityCandidatesUi = (
    <>
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
    </>
  );
  const abilityCustomField = (
    <label className="field-label ability-custom">
      {abilitySourceEff === "custom" ? "写下这本书里用的能力" : "自定义能力（选填）"}
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
  );
  // The three-way source cards (REQ-57): shown only with an avatar
  // linked. The signature card names the actual ability it would
  // bring; an avatar without a preset shows the unset state with the
  // way to fix it, never a dead option.
  const abilitySourceUi = abilitySourceEff ? (
    <div className="ability-source">
      <div className="ability-source-list" role="radiogroup" aria-label="这本书的能力从哪来">
        {signatureAbility ? (
          <button
            type="button"
            role="radio"
            aria-checked={abilitySourceEff === "signature"}
            className={`ability-card ${abilitySourceEff === "signature" ? "active" : ""}`}
            onClick={() => setAbilitySource("signature")}
          >
            <span>
              <b>带{linkedAvatar?.name || "化身"}的专属能力进入</b>
              <small>{signatureAbility.name}{signatureAbility.desc ? ` · ${signatureAbility.desc}` : ""}</small>
            </span>
            <span className="ability-radio">{abilitySourceEff === "signature" && <i />}</span>
          </button>
        ) : (
          <div className="ability-card is-unset">
            <span>
              <b>专属能力还没设置</b>
              <small>在化身页给{linkedAvatar?.name || "TA"}预设一个，进任何世界都能直接带上。</small>
            </span>
            <button type="button" className="small-link" onClick={onOpenAvatar}>去设置</button>
          </div>
        )}
        <button
          type="button"
          role="radio"
          aria-checked={abilitySourceEff === "swap"}
          className={`ability-card ${abilitySourceEff === "swap" ? "active" : ""}`}
          onClick={() => {
            setAbilitySource("swap");
            if (abilityId === "custom") { setAbilityId(""); setCustomAbility(""); }
          }}
        >
          <span>
            <b>换一个能力</b>
            <small>从这个世界的候选里挑，只用在这本书</small>
          </span>
          <span className="ability-radio">{abilitySourceEff === "swap" && <i />}</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={abilitySourceEff === "custom"}
          className={`ability-card ${abilitySourceEff === "custom" ? "active" : ""}`}
          onClick={() => {
            setAbilitySource("custom");
            if (customAbility.trim()) setAbilityId("custom");
          }}
        >
          <span>
            <b>自己编辑一个</b>
            <small>写一个只属于这本书的能力，不改化身的预设</small>
          </span>
          <span className="ability-radio">{abilitySourceEff === "custom" && <i />}</span>
        </button>
      </div>
      {abilitySourceEff === "signature" && signatureAbility && (
        <p className="field-hint">这本书就用「{signatureAbility.name}」开局。上面另两项随时能换，只影响这一本。</p>
      )}
    </div>
  ) : null;
  if (manualOpen) {
    return (
      <div className="page page-forge page-enter">
        <ManualBookForm
          onCreate={onCreateManual}
          onCancel={() => setManualOpen(false)}
        />
      </div>
    );
  }
  return (
    <div ref={forgeRef} className="page page-forge page-enter" data-step={step}>
      <div className="forge-progress">
        <h1 className="sr-only">新故事</h1>
        <Stepper step={step} setStep={(value) => { if (!busy) setStep(value); }} />
      </div>
      <div className="forge-layout">
        <main className="forge-main">
          <div className="forge-step-panel" key={step}>
          {step === 1 && (
            <>
              <div className="forge-ambient-wrap">
                <ParticleField density="forge" />
                <div className="forge-section-heading">
                  <div>
                    <h2 tabIndex={-1}>想写哪种故事？</h2>
                    <p className="step-intro">先写你自己的题材；写不出来，分类也备好了。故事发生在哪个世界，下一步由你自己选。</p>
                  </div>
                </div>
                <div className="random-combo-row random-combo-row--top">
                <p>{rolled
                  ? <>已配好：<b>{rolled.template.fullName} · {rolled.world}</b>，以「{rolled.identity.name}」的身份{rolled.point ? <>，从「{rolled.point.name}」醒来</> : null}。不满意就再掷一次。</>
                  : <>没想好？<b>随机组合</b>一次配好题材、世界、身份和出生点。</>}</p>
                <Button variant="secondary" icon="spark" className="random-combo-button" onClick={() => { rollCombo(); setRollFx((count) => count + 1); }}>
                  {rolled ? "再掷一次" : "随机组合"}
                </Button>
                </div>
              </div>
              {/* 自由创世 (REQ-51 修订，2026-10-30 23:43 用户亲定): the
                  open door is the hero of this step now — a large
                  black-hole visual region with the free-genre input
                  inside it, so creating is never gated by a category
                  list. REQ-71: the visual is layered generated art —
                  a nebula plate, a screen-blended stardust sheet and a
                  black-backed accretion-ring plate inside the vortex
                  frame, orbited by two thin CSS rings. GSAP breathes
                  and drifts the layers (transform/opacity only, see
                  the forge hero effect); the motion policy and
                  prefers-reduced-motion still every layer, complete.
                  Typing selects the custom genre; the example chips
                  fill the field for readers who want a running start. */}
              <div className={`genre-hero ${customGenreActive ? "selected" : ""}`}>
                <div className="genre-hero-visual" aria-hidden="true">
                  <img className="genre-hero-nebula" src="/art/hero-genesis-nebula-640.webp" srcSet="/art/hero-genesis-nebula-640.webp 640w, /art/hero-genesis-nebula-1122.webp 1122w" sizes="(min-width: 700px) 60vw, 100vw" alt="" decoding="async" />
                  <img className="genre-hero-dust" src="/art/hero-genesis-dust-1122.webp" alt="" decoding="async" />
                  <div className="genre-hero-vortex">
                    <span className="genre-hero-glow" />
                    <img className="genre-hero-ring-img" src="/art/hero-genesis-ring-640.webp" alt="" decoding="async" />
                    <span className="genre-hero-orbit genre-hero-orbit--a" />
                    <span className="genre-hero-orbit genre-hero-orbit--b" />
                  </div>
                  <span className="genre-hero-scrim" />
                </div>
                <div className="genre-hero-body">
                  <div className="genre-hero-head">
                    <strong>自由创世</strong>
                    {customGenreActive
                      ? <span className="selected-mark"><Icon name="check" size={13} /></span>
                      : null}
                  </div>
                  <p className="genre-hero-sub">分类里没有的题材，直接写在这里。写法会贴着你写的题材走，借最接近的家族手法打底。</p>
                  <input
                    className="custom-genre-input"
                    type="text"
                    value={customGenreInput}
                    maxLength={CUSTOM_GENRE_TEXT_MAX}
                    autoComplete="off"
                    aria-label="自己写个题材"
                    placeholder="例如：民国谍战、末世种田、赛博侦探"
                    onChange={(event) => applyCustomGenreText(event.target.value)}
                    onFocus={() => { if (customGenreInput.trim() && !customGenreActive) applyCustomGenreText(customGenreInput); }}
                  />
                  <div className="custom-genre-chips">
                    {["民国谍战", "末世种田", "赛博侦探"].map((example) => (
                      <button type="button" key={example} className="stage-chip" onClick={() => applyCustomGenreText(example)}>
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* 分类的第二层入口：文案是用户原话。当前已选的分类在
                  入口旁常驻可见，随时能展开回去改。 */}
              <div className="genre-shelves-door">
                <button
                  type="button"
                  className="genre-shelves-toggle"
                  aria-expanded={shelvesOpen}
                  onClick={() => setShelvesOpen((open) => !open)}
                >
                  没灵感？试试从分类里找
                  <span className="genre-shelves-toggle-state">{shelvesOpen ? "收起" : "展开"}</span>
                </button>
                {!customGenreActive && template && genreTemplateById(draft.genreTemplateId)
                  ? <span className="genre-shelves-current">已选：<b>{twoSegmentTemplateName(template)}</b></span>
                  : null}
              </div>
              {shelvesOpen && (openShelf ? (
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
                          className={`shelf-brick has-art ${holdsPick ? "selected" : ""}`}
                          aria-pressed={only ? holdsPick : undefined}
                          aria-label={shelf.name}
                          onClick={() => (only ? selectTemplate(only) : setShelfId(shelf.id))}
                        >
                          <img
                            className="shelf-brick-art"
                            src={`/art/${shelfArtBase(shelf)}-640.webp`}
                            srcSet={`/art/${shelfArtBase(shelf)}-640.webp 640w, /art/${shelfArtBase(shelf)}-1122.webp 1122w`}
                            sizes="(min-width: 700px) 40vw, 44vw"
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                          <strong>{shelf.name}</strong>
                          {/* GENRE-FREEDOM (REQ-51): the per-family
                              template-count line is gone — it was
                              internal bookkeeping wearing a label's
                              clothes, and it framed the families as a
                              closed set. The bricks are inspiration
                              starts now; the only overlays are the pick
                              state itself. */}
                          {holdsPick && !pickedTemplate
                            ? <span className="default-badge">默认</span>
                            : holdsPick
                              ? <span className="selected-mark"><Icon name="check" size={13} /></span>
                              : null}
                        </button>
                      </AnimatedContent>
                    );
                  })}
                  <AnimatedContent className="shelf-brick-wrap" distance={8} delay={0.45}>
                    {/* GENRE-FREEDOM (REQ-51): the random brick is a
                        full citizen of the grid — same size, same art
                        treatment (a 3×3 collage of every family's art:
                        any of them could be the roll), same pick
                        grammar. No dashed special-case card. */}
                    <button type="button" className="shelf-brick has-art shelf-brick-random" onClick={() => { rollTemplate(); setRollFx((count) => count + 1); }}>
                      <span className="shelf-brick-collage" aria-hidden="true">
                        {GENRE_SHELVES.slice(0, 9).map((shelf) => (
                          <img key={shelf.id} src={`/art/${shelfArtBase(shelf)}-640.webp`} alt="" loading="lazy" decoding="async" />
                        ))}
                      </span>
                      <strong>随机题材</strong>
                      <span className="shelf-brick-count">掷一次，落在哪算哪</span>
                    </button>
                  </AnimatedContent>
                </div>
              ))}
              <p className="world-selection-note" aria-live="polite">{rolledPath
                ? <>命运指到了：<b>{rolledPath.shelf} · {rolledPath.template.name}</b>。不喜欢就再掷一次，或自己挑。</>
                : customGenreActive
                  ? <>已选：自定义题材<b>「{draft.customGenreText}」</b>。写法按这个题材的读者预设走，借「{customGenreHomeShelfFor(draft.customGenreText).name}」家族的手法打底。世界在下一步由你决定。</>
                  : template
                    ? <>已选：<b>{twoSegmentTemplateName(template)}</b>{pickedTemplate ? "" : "（默认）"}。{template.blurb}。</>
                    : "不绑任何题材模板，写法完全自由。世界在下一步由你决定。"}</p>
              <button type="button" className="forge-manual-entry" onClick={() => setManualOpen(true)}>
                <Icon name="pencil" size={20} />
                <span className="forge-manual-copy">
                  <strong>自己写一本</strong>
                  <small>纯手写——书名、简介和每一章都由你亲手写，草稿存在云端书库，换设备接着写。</small>
                </span>
                <Icon name="chevron" size={16} />
              </button>
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
                      onChange={(event) => set({ customWorldName: clipToUnits(event.target.value, 12) })}
                      placeholder="给你的世界起个名字"
                    />
                  </label>
                  <div className="god-setting-meta">
                    <span className="field-hint">留空也行：故事会先以「未命名世界」开始，回到这一步随时能改名。</span>
                    <span className="da-count">{(draft.customWorldName || "").length} / {CUSTOM_WORLD_NAME_MAX}</span>
                  </div>
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
                      {fragmentBatch.map((fragment) => (
                        <button type="button" key={fragment.id} className="stage-chip" onClick={() => appendFragment(fragment.text)}>
                          {fragment.text}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* FORGE-TRIM: the 写法 chips that used to live here are
                      gone — they re-asked step one's category pick in a
                      second costume. The craft is whatever step one
                      pinned; to change it, go back to step one. */}
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
                    <button type="button" className="world-card world-card-random" onClick={() => { rollWorld(); setRollFx((count) => count + 1); }}>
                      <span className="world-card-cover world-card-cover--symbol" aria-hidden="true">
                        <span className="world-card-symbol">掷</span>
                      </span>
                      <span className="world-card-copy">
                        <strong>随机</strong>
                        <em>交给命运</em>
                        <small>从六个世界里抽一个，抽中哪个就去哪个世界。</small>
                      </span>
                    </button>
                    {worlds.map((item) => (
                      <WorldCard
                        key={item.id}
                        world={item}
                        selected={draft.worldChosen && draft.genreId === item.id}
                        onSelect={selectStage}
                      />
                    ))}
                  </div>
                  {/* IMPORT-DAYLIGHT (progressive disclosure): importing
                      your own world is a power-user path, so it lives in
                      the "more ways" fold below the world grid instead
                      of competing with the six worlds as a seventh card. */}
                  <details className="forge-more">
                    <summary>更多方式：导入自己的世界</summary>
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
                  </details>
                  <p className="god-ip-note">请勿直接使用他人作品或 IP 的设定——换上你自己的世界，故事才真正属于你。</p>
                  {/* REQ-59 (progressive disclosure): a picked preset is an
                      editable draft. The fold stays shut for readers who
                      just want to start; opening it lets them rename the
                      world and rewrite its setting text — the edited text
                      is what the story config and the world bible are
                      built from. Untouched, the preset's own text is the
                      draft and nothing extra is asked. */}
                  {worldChosen && (
                    <details className="forge-more world-draft-fold">
                      <summary>改一改这个世界（名字和设定都能改）</summary>
                      <div className="world-draft-form">
                        <label className="field-label">
                          世界的名字
                          <input
                            maxLength={CUSTOM_WORLD_NAME_MAX}
                            autoComplete="off"
                            value={worldDraftName}
                            onChange={(event) => setWorldDraft({ name: clipToUnits(event.target.value, 12) })}
                          />
                        </label>
                        <label className="field-label">
                          这个世界的设定
                          <textarea
                            className="god-setting"
                            rows={5}
                            maxLength={PRESET_WORLD_SETTING_MAX}
                            value={worldDraftSetting}
                            onChange={(event) => setWorldDraft({ setting: event.target.value })}
                          />
                        </label>
                        <div className="god-setting-meta">
                          <span className="field-hint">不改也行，现在这样就能开书。改过的名字和设定会成为这本书的世界依据。</span>
                          <span className="da-count">{worldDraftSetting.length} / {PRESET_WORLD_SETTING_MAX}</span>
                        </div>
                        {worldSkeletonHint && (
                          <p className="field-hint">这个题材的世界骨架（百本实测）：{worldSkeletonHint}</p>
                        )}
                        {activeWorldDraft && (
                          <button type="button" className="small-link" onClick={clearWorldDraft}>
                            恢复这个世界的预设原文
                          </button>
                        )}
                      </div>
                    </details>
                  )}
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
                          const deliberate = !draft.startPointCustom && draft.startPointName === point.name;
                          const isDefault = !draft.startPointName && pointIndex === 0;
                          return (
                            <button
                              type="button"
                              key={point.name}
                              className={`spawn-card ${deliberate ? "active" : ""}`}
                              aria-pressed={deliberate}
                              onClick={() => set({ startPointName: point.name, startPointHook: point.hook, startPointCustom: false })}
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
                      {/* REQ-59 (progressive disclosure): preset spawn
                          points are options, not a cage — the creator may
                          rename one or write their own, with the same
                          free-form fields god mode uses. The flag is what
                          the engine resolves by (startPointCustom). */}
                      {draft.startPointCustom && draft.startPointName ? (
                        <p className="field-hint spawn-custom-status">
                          这一本从你写的「{draft.startPointName}」开始。
                          <button type="button" className="small-link" onClick={() => set({ startPointName: "", startPointHook: "", startPointCustom: false })}>
                            改用预设出生点
                          </button>
                        </p>
                      ) : null}
                      <details className="forge-more spawn-custom-fold">
                        <summary>没有合心意的？自己写一个出生点</summary>
                        <div className="spawn-form">
                          <label className="field-label">
                            出生点的名字
                            <input
                              maxLength={START_POINT_NAME_MAX}
                              autoComplete="off"
                              value={draft.startPointCustom ? (draft.startPointName || "") : ""}
                              onChange={(event) => set(draft.startPointCustom
                                ? { startPointName: event.target.value, startPointCustom: true }
                                : { startPointName: event.target.value, startPointHook: "", startPointCustom: true })}
                              placeholder="例如：醒来的地方——一张草席、一间值班室、一段舰桥"
                            />
                          </label>
                          <label className="field-label">
                            开局处境（选填）
                            <input
                              maxLength={START_POINT_HOOK_MAX}
                              autoComplete="off"
                              value={draft.startPointCustom ? (draft.startPointHook || "") : ""}
                              onChange={(event) => set(draft.startPointCustom
                                ? { startPointHook: event.target.value, startPointCustom: true }
                                : { startPointName: "", startPointHook: event.target.value, startPointCustom: true })}
                              placeholder="睁开眼时，正在发生什么"
                            />
                          </label>
                          <p className="field-hint">写一个小而具体的地方——主角睁开眼时，就在那里。只管这一本，不会改掉预设。</p>
                        </div>
                      </details>
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
              {avatars.length > 0 && (
                <div className="avatar-picker">
                  <span className="field-label">用我的化身</span>
                  {avatars.map((item) => draft.avatarId === item.id ? (
                    <div className="avatar-bring active" key={item.id}>
                      <span className="avatar-bring-thumb">
                        <AvatarPortrait avatar={item} getAccessToken={() => authClient.getAccessToken()} />
                      </span>
                      <span className="avatar-bring-copy">
                        <b>这一本由{item.name}来走</b>
                        <small>名字、样子和设定已带入，只改这本书，不动化身档案。</small>
                      </span>
                      <button type="button" className="small-link" onClick={() => { set({ avatarId: "", avatarAppearance: "", avatarAbility: null }); setAbilitySource(null); }}>
                        取消带入
                      </button>
                    </div>
                  ) : (
                    <div className="avatar-bring" key={item.id}>
                      <span className="avatar-bring-thumb">
                        <AvatarPortrait avatar={item} getAccessToken={() => authClient.getAccessToken()} />
                      </span>
                      <span className="avatar-bring-copy">
                        <b>{item.name}{item.id === mainId ? " · 主化身" : ""}</b>
                        <small>{avatarAppearanceText(item)}</small>
                      </span>
                      <button
                        type="button"
                        className="small-link"
                        onClick={() => {
                          const patch = avatarDraftPatch(item);
                          if (patch) set({ avatarAbility: null, ...patch });
                          // REQ-57: a fresh bring-in reopens the
                          // ability source on this avatar's default —
                          // its signature ability when it has one.
                          setAbilitySource(avatarAbilityOf(item) ? "signature" : "swap");
                        }}
                      >
                        用这个化身
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {draft.avatarId && !avatars.some((item) => item.id === draft.avatarId) && (
                <div className="avatar-bring active">
                  <span className="avatar-bring-copy">
                    <b>已带入化身</b>
                    <small>{draft.avatarAppearance}</small>
                  </span>
                  <button type="button" className="small-link" onClick={() => { set({ avatarId: "", avatarAppearance: "", avatarAbility: null }); setAbilitySource(null); }}>
                    取消带入
                  </button>
                </div>
              )}
              {/* IMPORT-DAYLIGHT (progressive disclosure): the card
                  import folds into "more ways" on this step too; the
                  preview it produces stays outside the fold — a result
                  the reader must see and confirm. */}
              <details className="forge-more">
                <summary>更多方式：导入角色卡</summary>
                <div className="card-import">
                  <div className="card-import-copy">
                    <b>导入角色卡</b>
                    <small>酒馆 / Flai 的角色卡（.json，或内嵌了卡的 .png）——先预览，确认了才填进主角档案。卡里若带着自己的世界书，会一并挂到这本书上。</small>
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
              </details>
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
                  {cardPreview.book && (
                    <p className="field-hint">这张卡还带着一本自己的世界书（{cardPreview.book.entries.length} 条条目）——点「用这张卡」会一并挂到这本书上，只属于你，不会出现在广场。开书后在阅读器的「设定集」里能看和改。</p>
                  )}
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
                {/* FORGE-TRIM: with an avatar brought in, this whole
                    section steps aside — the avatar's own profile (its
                    description, carried in the persona field above) IS
                    this book's 性格与设定， and asking again was the
                    jarring part. Without an avatar, the trait is the
                    reader's own text first: an input, with three
                    entries drawn from the 100-entry library underneath
                    as one-tap fills and a refresh for three more. */}
                {!draft.avatarId && (
                  <div className="form-block trait-editor">
                    <span className="field-label">性格{pickedTrait ? "" : "（默认）"}</span>
                    <input
                      className="trait-input da-input-under"
                      maxLength={80}
                      autoComplete="off"
                      value={draft.trait}
                      aria-label="性格"
                      placeholder="写下主角的性格，或点下面一条填入"
                      onChange={(event) => { setPickedTrait(true); set({ trait: event.target.value }); }}
                    />
                    <div className="trait-suggestions">
                      {traitBatch.map((entry) => (
                        <button
                          type="button"
                          key={entry.id}
                          className="choice-chip trait-chip"
                          onClick={() => { setPickedTrait(true); set({ trait: personalityTraitText(entry) }); }}
                        >
                          <span>{entry.name}</span>
                          <small>{entry.desc}</small>
                        </button>
                      ))}
                      <button
                        type="button"
                        className="trait-refresh da-btn da-btn--ghost"
                        aria-label="换一批性格词条"
                        onClick={() => setTraitBatch(drawPersonalityTraits(3, traitBatch.map((entry) => entry.id)))}
                      >
                        换一批
                      </button>
                    </div>
                    <p className="field-hint">性格以你写的为准；下面三条从词条库里随机抽，点一条填进来，还能再改。</p>
                  </div>
                )}
                <div className="life-import">
                  <div className="life-import-heading">
                    <div>
                      <b>带入人生经历</b>
                      <small>你现实里的底子，会揉进主角的来历里</small>
                    </div>
                    <label className="da-switch">
                      <input
                        type="checkbox"
                        checked={draft.immersive}
                        onChange={() => set({ immersive: !draft.immersive })}
                        aria-label="带入人生经历（选填）"
                      />
                      <span className="da-switch-ui" aria-hidden="true" />
                    </label>
                  </div>
                  {draft.immersive && (
                    <div className="life-fields">
                      <p className="field-hint">这是你现实里的底子，会揉进主角的来历里——和前面选的虚构身份并不冲突。建议用昵称或虚构内容；在线塑造时，设定会发送到织界处理。</p>
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
                  <p className="field-hint">{abilitySourceEff
                    ? "化身带着自己的专属能力：默认就用它进这个世界，也可以换一个，或写一个只属于这本书的——换和写都不改化身的预设。"
                    : isCustom
                      ? "创世神世界没有现成的能力池：候选来自你选的写法（或通用池），也可以写一个自己的。不选直接继续，会从候选里随机落定一个。"
                      : "候选分两组：上面是所选题材的招牌能力，下面是这个世界的本事。不选直接继续，会从候选里随机落定一个。"}</p>
                </div>
              </div>
              {/* REQ-57: with an avatar linked, the three-way source
                  cards come first; the candidate groups belong to
                  「换一个能力」, the editor to 「自己编辑一个」. With
                  no avatar, everything shows as it always did. */}
              {abilitySourceUi}
              {(!abilitySourceEff || abilitySourceEff === "swap") && abilityCandidatesUi}
              {(!abilitySourceEff || abilitySourceEff === "custom") && abilityCustomField}
              {/* FORGE-TRIM: the 故事风格 cards are offline. The same
                  three cards hung off every category and read as noise;
                  the forge no longer asks. Stored tone values on older
                  stories still read fine — the engine keeps its own
                  table and nothing new writes a choice here. */}
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
                <h3>{effectiveBookTitle}</h3>
                <p>{previewText}</p>
              </div>
              <div className="book-title-field">
                <label className="field-label" htmlFor="forge-book-title">
                  这本书的书名
                  <input
                    id="forge-book-title"
                    type="text"
                    maxLength={BOOK_TITLE_MAX * 2}
                    autoComplete="off"
                    value={draft.bookTitle || ""}
                    placeholder={bookTitleSuggestion}
                    aria-label="这本书的书名"
                    onChange={(event) => set({ bookTitle: event.target.value })}
                  />
                </label>
                <p className="field-hint">书名可以和世界不一样，最多 {BOOK_TITLE_MAX} 字。不改，就用上面这个建议名；开书以后也能在设定集里改。</p>
                <p className="field-hint">这个题材的取名公式（百本实测）：{bookTitleFormula.pattern}——{bookTitleFormula.formula}；钩子要带{bookTitleFormula.hook}；{bookTitleFormula.target}最稳。</p>
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
                <button disabled={busy} onClick={() => setStep(4)} aria-label="修改主角设定"><span>主角</span><b>{draft.name || "留空 · 开篇时定名"} · {draft.avatarId ? "性格由化身自带" : `${draft.trait}${pickedTrait ? "" : "（默认）"}`}</b><Icon name="chevron" size={15} /></button>
                {draft.immersive && (
                  <button disabled={busy} onClick={() => setStep(4)} aria-label="修改人生经历"><span>人生经历</span><b>已带入</b><Icon name="chevron" size={15} /></button>
                )}
                <button disabled={busy} onClick={() => setStep(4)} aria-label="修改能力"><span>能力</span><b>{abilityName || "未定"}{abilitySourceEff === "signature" && abilityName ? " · 化身专属" : ""}</b><Icon name="chevron" size={15} /></button>

              </div>
              {/* The shelf-requirement disclosure (FINAL-FIX R-06): a
                  line forged without an avatar can be read and kept,
                  but it cannot be listed — say so BEFORE the book
                  exists, not at the publish gate months later. The
                  remedy (bring one in later) is named too, so this
                  reads as a fact, not a trap. */}
              {!draft.avatarId && (
                <p className="field-hint opening-avatar-note">这条线没有带化身：写完可以读、可以留在书架，但不能上架书城——上架的书，主角得是你的化身。成书之后也能在发布页或设定集里随时补带。</p>
              )}
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
          </div>
          {/* FORGE-TRIM (scroll fix): the status line renders BEFORE the
              docked action bar, so the bar is the last in-flow element
              of the forge column. It used to render after the bar, and
              together with the page's old 190px bottom padding it left
              ~240px of dead space below the bar at max scroll — pulled
              past the end, the whole page rode up over a void. */}
          <div className="generation-feedback" role="status" aria-live="polite">{busy ? "第一章准备好后，即可开始阅读。" : error}</div>
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
          {busy && <GenerationOverlay kind="story" onCancel={() => { operation.current?.abort(); operation.current = null; setBusy(false); }} />}
        </main>
        {step !== 5 && (
          <PreviewPanel
            world={world}
            template={template}
            draft={draft}
            ability={abilityPick}
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
  const manual = isManualStory(story);
  return (
    <ReadingDialog title="分享预览" onClose={onClose}>
      <p>
        {manual
          ? "只读副本，仅保存在本机书城，不会上传。正文是你亲手写的原文，一个字都不会改。"
          : requiresReview ? "仅保存在本机书城。已替换设定中的原始资料，但正文仍可能含有可识别的线索，请逐章检查。" : "匿名只读副本，仅保存在本机书城，不会上传。姓名与现实资料已移除。"}
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
        <div className="share-prose-preview">{preview.chapters.map((chapter, chapterIndex) => <details key={chapter.id}>
          <summary>{chapterTitleTextFor(chapter.title) || `第 ${chapterIndex + 1} 章`}</summary>
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

/**
 * The signed-out account surface (PHONE-FIX §37 H, presentation
 * rework; LOGIN-REDO §43 for the current composition): NOT a sheet.
 * The starfield scene inside AccountPanel is a full-screen ground
 * in its own right, so it gets a full-screen overlay instead of
 * the ReadingDialog chrome — no title bar, no grabber, nothing of
 * the shell (topbar, tab bar, the page behind) showing through or
 * coexisting. The brand stands in the pure-black sky and the login
 * card rises from the bottom edge; the only chrome is a glass ✕ in
 * the scene's top-right corner.
 * Housekeeping mirrors ReadingDialog (body scroll lock, Escape,
 * focus restore to the trigger) so the surface behaves like the
 * dialog it replaces in every way a caller can observe.
 */
function AccountSceneDialog({ children, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    // Capture the trigger BEFORE moving focus to the close button:
    // with autoFocus doing it during commit, an effect-time read of
    // activeElement would capture the ✕ itself and the restore
    // below would silently aim at a node that unmounts with us.
    // (ReadingDialog gets away with the naive read because a native
    // <dialog> restores focus on close by itself; a div overlay has
    // no such mechanism, so the capture order is load-bearing.)
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
    // Mount-once housekeeping, same contract as ReadingDialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="account-overlay" role="dialog" aria-modal="true" aria-label="登录与注册" data-lenis-prevent>
      {children}
      <button ref={closeRef} type="button" className="account-overlay-close" onClick={onClose} aria-label="关闭面板">
        <Icon name="x" size={20} />
      </button>
    </div>
  );
}

const NOTIFY_TABS = [
  { id: "activity", label: "互动", icon: "users" },
  { id: "announcements", label: "公告", icon: "megaphone" },
  { id: "system", label: "系统", icon: "sliders" },
];

function notifyTime(iso) {
  const stamp = typeof iso === "string" ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(stamp)) return "";
  const diff = Date.now() - stamp;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  const days = Math.floor(diff / 86_400_000);
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  const date = new Date(stamp);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

const NOTIFY_SYSTEM_COPY = {
  "password-reset": {
    title: "密码已重设",
    body: "你的账号密码刚刚通过恢复邮箱重设。如果不是你本人操作，请尽快再重设一次，并检查账号。",
  },
  "recovery-email:set": {
    title: "恢复邮箱已更新",
    body: "绑定或更换了恢复邮箱；忘了密码时，可以用它找回。",
  },
  "recovery-email:unbound": {
    title: "恢复邮箱已取消绑定",
    body: "这个账号暂时不能用邮箱找回密码了。",
  },
};

function notifySystemCopy(item) {
  // 合流申请结果 (REQ-49): the event's detail carries the book title,
  // so these two are composed, not tabled. The approved body keeps
  // the wording the applicant was promised: 申请已通过，可以进行合流了。
  if (item.kind === "fusion-approved") {
    return {
      title: "合流申请已通过",
      body: item.detail ? `你申请合流的《${item.detail}》已通过，可以进行合流了。` : "你的合流申请已通过，可以进行合流了。",
    };
  }
  if (item.kind === "fusion-rejected") {
    return {
      title: "合流申请未通过",
      body: item.detail ? `《${item.detail}》的作者这次没有同意合流申请。` : "对方这次没有同意合流申请。",
    };
  }
  return NOTIFY_SYSTEM_COPY[`${item.kind}:${item.detail || ""}`]
    || NOTIFY_SYSTEM_COPY[item.kind]
    || { title: "账号动态", body: "" };
}

function NotificationsPanel({ authClient, onOpenProfile, onUnreadChange }) {
  // The message centre (NOTIFY-SETTINGS §36): three categories over
  // one server payload. Opening a category marks THAT category read
  // (the watermark lives server-side, per user × category), and the
  // bell badge follows the same totals the panel shows.
  const [tab, setTab] = useState("activity");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const getToken = useCallback(() => authClient.getAccessToken(), [authClient]);
  // 合流申请裁决 (REQ-49): approving writes the applicant's durable
  // grant server-side; either answer retracts the item, so the panel
  // simply refetches and the row is gone.
  const [decidingId, setDecidingId] = useState("");
  const decideFusion = async (item, approve) => {
    if (!item.requestId || decidingId) return;
    setDecidingId(item.requestId);
    try {
      await decideFusionRequest({ requestId: item.requestId, approve, getAccessToken: getToken });
      setRetry((value) => value + 1);
    } catch {
      setDecidingId("");
    }
  };

  useEffect(() => {
    let live = true;
    setError("");
    fetchNotifications({ getAccessToken: getToken })
      .then((result) => { if (live) setData(result); })
      .catch(() => { if (live) setError("消息没能打开，请稍后再试。"); });
    return () => { live = false; };
  }, [getToken, retry]);

  const activeUnread = data?.categories?.[tab]?.unread || 0;
  useEffect(() => {
    if (!data || activeUnread <= 0) return undefined;
    let live = true;
    markNotificationsRead({ category: tab, getAccessToken: getToken })
      .then(() => {
        if (!live) return;
        setData((current) => {
          if (!current?.categories?.[tab]) return current;
          const next = {
            ...current,
            categories: { ...current.categories, [tab]: { ...current.categories[tab], unread: 0 } },
          };
          next.totalUnread = NOTIFY_TABS.reduce((sum, entry) => sum + (next.categories[entry.id]?.unread || 0), 0);
          onUnreadChange?.(next.totalUnread);
          return next;
        });
      })
      .catch(() => { /* the watermark retries on the next open */ });
    return () => { live = false; };
  }, [data, tab, activeUnread, getToken, onUnreadChange]);

  const category = data?.categories?.[tab] || { unread: 0, items: [] };
  const items = Array.isArray(category.items) ? category.items : [];

  return (
    <div className="notify-panel">
      <div className="notify-tabs" role="tablist" aria-label="消息分类">
        {NOTIFY_TABS.map((entry) => {
          const unread = data?.categories?.[entry.id]?.unread || 0;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              className={`notify-tab ${tab === entry.id ? "is-active" : ""}`}
              onClick={() => setTab(entry.id)}
            >
              <Icon name={entry.icon} size={15} />
              {entry.label}
              {unread > 0 && <span className="notify-tab-badge" aria-label={`${unread} 条未读`}>{unread > 99 ? "99+" : unread}</span>}
            </button>
          );
        })}
      </div>
      {error ? (
        <div className="notify-empty" role="alert">
          <p>{error}</p>
          <button type="button" className="small-link" onClick={() => setRetry((value) => value + 1)}>再试一次</button>
        </div>
      ) : !data ? (
        <div role="status" aria-label="正在打开消息">
          {[0, 1, 2].map((i) => (
            <div className="da-skel-row" key={i} aria-hidden="true">
              <span className="da-skel da-skel--circle" style={{ width: 40, height: 40 }} />
              <span className="da-skel-colline">
                <span className="da-skel da-skel--line" style={{ width: "62%" }} />
                <span className="da-skel da-skel--line" style={{ width: "38%" }} />
              </span>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="notify-empty">
          <img className="empty-art" src="/art/empty-messages-512.webp" alt="" loading="lazy" />
          <p>
            {tab === "activity" && "还没有互动消息——关注、好友申请、合流申请、评论和评价都会记在这里。"}
            {tab === "announcements" && "暂无公告。"}
            {tab === "system" && "暂无系统消息。密码重设、恢复邮箱变更、合流申请结果这类账号动态会记在这里。"}
          </p>
        </div>
      ) : (
        <ul className="notify-list">
          {items.map((item) => {
            if (tab === "activity") {
              const portrait = item.picture?.kind === "avatar";
              if (item.kind === "fusion_request") {
                // 合流申请 (REQ-49): the one actionable row in the
                // centre — the author answers here, and the answer
                // (grant or refusal) is written server-side.
                return (
                  <li key={item.id}>
                    <div className="notify-row notify-row-static">
                      <span className={`nav-face-frame is-person ${portrait ? "is-portrait" : ""}`} aria-hidden="true">
                        <img className="nav-face-img" src={item.picture?.url || "/default-avatar.svg"} alt="" loading="lazy" />
                      </span>
                      <span className="notify-row-copy">
                        <span className="notify-row-text">
                          <strong>{item.displayName}</strong>
                          {" 申请用你的"}
                          {item.target?.bookTitle ? `《${item.target.bookTitle}》` : "书"}
                          {"合流"}
                        </span>
                        {item.target?.storyTitle ? (
                          <span className="notify-row-body">对方的线：《{item.target.storyTitle}》</span>
                        ) : null}
                        {item.at && <small>{notifyTime(item.at)}</small>}
                        <span className="notify-actions">
                          <button
                            type="button"
                            className="notify-action is-approve"
                            disabled={Boolean(decidingId)}
                            onClick={() => void decideFusion(item, true)}
                          >
                            同意
                          </button>
                          <button
                            type="button"
                            className="notify-action"
                            disabled={Boolean(decidingId)}
                            onClick={() => void decideFusion(item, false)}
                          >
                            拒绝
                          </button>
                        </span>
                      </span>
                    </div>
                  </li>
                );
              }
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="notify-row"
                    onClick={() => item.actorUid && onOpenProfile?.(item.actorUid)}
                  >
                    <span className={`nav-face-frame is-person ${portrait ? "is-portrait" : ""}`} aria-hidden="true">
                      <img className="nav-face-img" src={item.picture?.url || "/default-avatar.svg"} alt="" loading="lazy" />
                    </span>
                    <span className="notify-row-copy">
                      <span className="notify-row-text">
                        <strong>{item.displayName}</strong>
                        {item.kind === "follow"
                          ? " 关注了你"
                          : item.kind === "friend_request"
                            ? " 想加你为好友"
                            : item.kind === "friend_accepted"
                              ? " 和你成为了好友"
                              : item.kind === "like"
                                ? " 赞了你的帖子"
                                : item.kind === "comment"
                                  ? " 评论了你的帖子"
                                  : item.kind === "rating"
                                    ? " 评价了你的书"
                                    : " 与你有了新的互动"}
                      </span>
                      {item.kind === "friend_request" && item.message ? (
                        <span className="notify-row-body">「{item.message}」</span>
                      ) : null}
                      {item.kind === "comment" && item.target?.commentText ? (
                        <span className="notify-row-body">「{item.target.commentText}」</span>
                      ) : null}
                      {item.kind === "like" && item.target?.excerpt ? (
                        <span className="notify-row-body">帖子：{item.target.excerpt}</span>
                      ) : null}
                      {item.kind === "rating" && item.target?.bookTitle ? (
                        <span className="notify-row-body">《{item.target.bookTitle}》· {item.target.stars} 星{item.target.ratingText ? `：「${item.target.ratingText}」` : ""}</span>
                      ) : null}
                      {item.at && <small>{notifyTime(item.at)}</small>}
                    </span>
                  </button>
                </li>
              );
            }
            if (tab === "announcements") {
              return (
                <li key={item.id} className="notify-row notify-row-static">
                  <span className="notify-row-icon" aria-hidden="true"><Icon name="spark" size={18} /></span>
                  <span className="notify-row-copy">
                    <strong className="notify-row-title">{item.title}</strong>
                    <span className="notify-row-body">{item.body}</span>
                    {item.at && <small>{notifyTime(item.at)}</small>}
                  </span>
                </li>
              );
            }
            const copy = notifySystemCopy(item);
            return (
              <li key={item.id} className="notify-row notify-row-static">
                <span className="notify-row-icon" aria-hidden="true"><Icon name="lock" size={18} /></span>
                <span className="notify-row-copy">
                  <strong className="notify-row-title">{copy.title}</strong>
                  {copy.body && <span className="notify-row-body">{copy.body}</span>}
                  {item.at && <small>{notifyTime(item.at)}</small>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ChapterDirectory({ story, index, readOnly, onSelect, onClose, onRenameChapters }) {
  // A running endless line has no total to enumerate: list the chapters
  // that exist plus the one being written, never an unbounded range.
  const total = mapTotalFor(totalChaptersFor(story), story.chapters?.length || 0, index);
  const last = lastAccessibleIndex(story, readOnly);
  const listRef = useRef(null);
  // 编辑目录 (EDIT-BOOK): renaming titles in place, offered only on the
  // owner's own copy. Drafts cover the chapters that exist; unwritten
  // slots have no title to rename and drop out of the edit list.
  const writtenChapters = Array.isArray(story.chapters) ? story.chapters : [];
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [editError, setEditError] = useState("");
  const beginEdit = () => {
    setDrafts(writtenChapters.map((chapter) => chapter.title));
    setEditError("");
    setEditing(true);
  };
  const saveEdit = () => {
    const error = onRenameChapters ? onRenameChapters(drafts) : "目录没能保存，请再试一次。";
    if (error) {
      setEditError(error);
      return;
    }
    setEditError("");
    setEditing(false);
  };
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
      {!editing && (
        <div className="directory-starmap">
          <b>剧情星图</b>
          <StoryMap
            total={total}
            generated={story.chapters?.length || 0}
            current={index}
            onSelect={onSelect}
          />
        </div>
      )}
      {editing ? (
        <div className="chapter-directory-edit">
          <p className="field-hint">只改标题：顺序和正文一个字都不会动，已经定稿的章节也可以改名。</p>
          {writtenChapters.map((chapter, position) => (
            <label className="field-label" key={chapter.id || position}>
              第 {position + 1} 章
              <input
                value={drafts[position] ?? ""}
                aria-label={`第 ${position + 1} 章标题`}
                onChange={(event) =>
                  setDrafts((list) => list.map((title, itemIndex) => (itemIndex === position ? event.target.value : title)))
                }
              />
            </label>
          ))}
          {editError && (
            <p className="intervention-error" role="alert">
              {editError}
            </p>
          )}
          <div className="settings-inline-actions">
            <Button onClick={saveEdit}>保存目录</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditError("");
                setEditing(false);
              }}
            >
              取消
            </Button>
          </div>
        </div>
      ) : (
        <>
          {!readOnly && onRenameChapters && writtenChapters.length > 0 && (
            <div className="settings-inline-actions">
              <Button variant="secondary" onClick={beginEdit}>
                编辑目录
              </Button>
            </div>
          )}
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
        </>
      )}
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
    const trimmed = text.trim();
    if (chipId && !trimmed) {
      onSubmit({ kind: "chip", chipId });
      return;
    }
    if (chipId) {
      // A chip used to silently discard typed text at submit time. Merge
      // instead: the reader's own words lead, the chip direction follows.
      const chip = INTERVENTION_CHIPS.find((item) => item.id === chipId);
      const combined = chip?.text ? `${trimmed}${trimmed.endsWith("。") ? "" : "。"}${chip.text}` : trimmed;
      const violation = findSettingViolation(combined);
      if (violation) {
        setError(violation);
        return;
      }
      onSubmit({ kind: "text", text: combined });
      return;
    }
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
          {chipId && text.trim() && (
            <p className="intervention-hint">
              提交时，你写的文字会和这个方向一并送出。
            </p>
          )}
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
        这是你正在读的最新章节——现在改还来得及。改动保存后就是这本书的正文，后面的章节会接着你改过的文字往下写；翻开下一章，这一章就此定稿，再不能改。
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
function StorySettingsBook({ story, avatars = [], onBringAvatar, onOpenAvatarPage, onClose, onSave, onFuse, onDelete, onSaveSynopsis, onSaveBookTitle, onSaveChapterTitles, onSaveIntro }) {
  // 自己写 (WRITE-MODE §50): a hand-written book has no world bible to
  // steer, no lorebook to inject and no style preset to dial — those
  // sections would be dead controls. Its settings book keeps only what
  // is real for it: 书名 / 本书简介 / 章节目录 / 删除.
  const manual = isManualStory(story);
  const [premise, setPremise] = useState(story.worldBible?.premise || "");
  // 书名 (TITLE-FLOW): the book's own name, editable here next to the
  // synopsis. Unlike the synopsis (a publish-time snapshot on the
  // plaza), a saved rename is mirrored onto the publication by the
  // server — the hint under the field says exactly that, in one line.
  const [bookTitle, setBookTitle] = useState(story.title || "");
  const [bookTitleError, setBookTitleError] = useState("");
  const [bookTitleSaved, setBookTitleSaved] = useState(false);
  const saveBookTitle = () => {
    const error = onSaveBookTitle ? onSaveBookTitle(bookTitle) : "书名没能保存，请再试一次。";
    if (error) {
      setBookTitleError(error);
      setBookTitleSaved(false);
      return;
    }
    setBookTitleError("");
    setBookTitleSaved(true);
  };
  // 本书简介 (EDIT-BOOK): the editor opens on the effective synopsis —
  // the owner's own words when set, otherwise the premise the surfaces
  // have always shown as this book's introduction.
  const [synopsis, setSynopsis] = useState(() => synopsisOf(story));
  const [synopsisError, setSynopsisError] = useState("");
  const [synopsisSaved, setSynopsisSaved] = useState(false);
  // 章节目录 (EDIT-BOOK): titles are metadata — renaming is offered for
  // every written chapter here and in the reader's directory drawer.
  const tocChapters = Array.isArray(story.chapters) ? story.chapters : [];
  const [tocEditing, setTocEditing] = useState(false);
  const [tocTitles, setTocTitles] = useState(() => tocChapters.map((chapter) => chapter.title));
  const [tocError, setTocError] = useState("");
  const saveSynopsis = () => {
    const error = onSaveSynopsis ? onSaveSynopsis(synopsis) : "简介没能保存，请再试一次。";
    if (error) {
      setSynopsisError(error);
      setSynopsisSaved(false);
      return;
    }
    setSynopsisError("");
    setSynopsisSaved(true);
  };
  // 世界设定（发布版）(REQ-56): the three public paragraphs the detail
  // page prints. The editor opens on the EFFECTIVE intro — the
  // generated draft when the book carries one, otherwise the factual
  // fallback the surfaces show — so what the owner sees here is what
  // readers see, and the first save makes it the book's own words.
  // Rules are edited one per line.
  const effectiveIntro = effectiveIntroFor(story);
  const [introBackground, setIntroBackground] = useState(() => effectiveIntro?.background || "");
  const [introRulesText, setIntroRulesText] = useState(() => (effectiveIntro?.rules || []).join("\n"));
  const [introThread, setIntroThread] = useState(() => effectiveIntro?.thread || "");
  const [introError, setIntroError] = useState("");
  const [introSaved, setIntroSaved] = useState(false);
  const saveIntro = () => {
    const error = onSaveIntro
      ? onSaveIntro({
          background: introBackground,
          rules: introRulesText.split("\n").map((line) => line.trim()).filter(Boolean),
          thread: introThread,
        })
      : "世界设定没能保存，请再试一次。";
    if (error) {
      setIntroError(error);
      setIntroSaved(false);
      return;
    }
    setIntroError("");
    setIntroSaved(true);
  };
  const beginTocEdit = () => {
    setTocTitles(tocChapters.map((chapter) => chapter.title));
    setTocError("");
    setTocEditing(true);
  };
  const saveToc = () => {
    const error = onSaveChapterTitles ? onSaveChapterTitles(tocTitles) : "目录没能保存，请再试一次。";
    if (error) {
      setTocError(error);
      return;
    }
    setTocError("");
    setTocEditing(false);
  };
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
        {manual
          ? "这本书是你自己写的：这里只有书名、简介和目录。正文在写作台里改，这里的每一处保存都只动名字，不动正文。"
          : "这本书的世界设定都在这里。在这里改，只影响之后生成的章节——已经写好的章节，一个字都不会动。"}
      </p>
      {/* The carried-avatar row (FINAL-FIX R-06): the second remedy
          surface for a line forged without an avatar. It states who
          rides this line, or offers the bring-in when nobody does —
          a fused line's cast is fixed at the merge, and a hand-written
          book has no such row at all (manual returns early above via
          its own sections). */}
      {!manual && story.kind !== "merged" && (
        <div className="settings-section">
          <h3>随行化身</h3>
          {story.config?.avatarId ? (
            <p className="field-hint">
              这条线由化身「{(avatars.find((item) => item.id === story.config.avatarId)?.name) || story.config?.name || "你的化身"}」走完——上架书城时，它就是这本书的主角。
            </p>
          ) : (
            <>
              <p className="field-hint">这条线还没有带化身：可以读、可以留在书架，但上架书城要求主角是你的化身。把化身带进来，这条线就能上架。</p>
              {avatars.length > 0 ? (
                <div className="settings-avatar-row">
                  {avatars.map((item) => (
                    <Button key={item.id} variant="secondary" onClick={() => onBringAvatar?.(item)}>带入「{item.name}」</Button>
                  ))}
                </div>
              ) : (
                <Button variant="secondary" onClick={() => { onClose(); onOpenAvatarPage?.(); }}>先去创建化身</Button>
              )}
            </>
          )}
        </div>
      )}
      <div className="settings-section">
        <h3>书名</h3>
        <p className="field-hint">
          书架、主页和广场上显示的都是这个名字；改名会同步到已经发布的广场版本。书名最多 {BOOK_TITLE_MAX} 字。
        </p>
        <label className="field-label">
          书名
          <input
            type="text"
            maxLength={BOOK_TITLE_MAX * 2}
            value={bookTitle}
            aria-label="书名"
            placeholder="给这本书起个名字"
            onChange={(event) => { setBookTitle(event.target.value); setBookTitleSaved(false); }}
          />
        </label>
        {bookTitleError && (
          <p className="intervention-error" role="alert">
            {bookTitleError}
          </p>
        )}
        <div className="settings-inline-actions">
          <Button variant="secondary" onClick={saveBookTitle}>
            保存书名
          </Button>
          {bookTitleSaved && !bookTitleError && <span role="status">已保存。</span>}
        </div>
      </div>
      <div className="settings-section">
        <h3>本书简介</h3>
        <p className="field-hint">
          这是这本书对外的介绍，写给还没打开它的人看。改动只落在你自己的书上；已经发布到广场的版本不会自动跟着变，重新发布一次即可同步。
        </p>
        <label className="field-label">
          简介
          <textarea
            rows={4}
            maxLength={SYNOPSIS_MAX}
            value={synopsis}
            aria-label="本书简介"
            placeholder="用几句话介绍这本书：它讲什么、谁在里面、会往哪里走。"
            onChange={(event) => { setSynopsis(event.target.value); setSynopsisSaved(false); }}
          />
        </label>
        {synopsisError && (
          <p className="intervention-error" role="alert">
            {synopsisError}
          </p>
        )}
        <div className="settings-inline-actions">
          <Button variant="secondary" onClick={saveSynopsis}>
            保存简介
          </Button>
          {synopsisSaved && !synopsisError && <span role="status">已保存。</span>}
        </div>
      </div>
      {!manual && (
      <div className="settings-section">
        <h3>世界设定（发布版）</h3>
        <p className="field-hint">
          这三段就是书城和详情页里介绍这本书的文字，开书时已经替你写好了一版，你可以照自己的想法改。改动先落在你自己的书上；已经发布的，重新发布一次才会同步。
        </p>
        <label className="field-label">
          世界背景
          <textarea
            rows={4}
            maxLength={INTRO_BACKGROUND_MAX}
            value={introBackground}
            aria-label="世界背景（发布版）"
            placeholder="这个世界是什么样子，主角身处其中的什么位置。"
            onChange={(event) => { setIntroBackground(event.target.value); setIntroSaved(false); }}
          />
        </label>
        <label className="field-label">
          核心规则（一行一条，最多三条）
          <textarea
            rows={3}
            maxLength={INTRO_RULES_MAX * (INTRO_RULE_MAX + 1)}
            value={introRulesText}
            aria-label="核心规则（发布版）"
            placeholder="这本书自己的规矩：能力怎么用、代价是什么。"
            onChange={(event) => { setIntroRulesText(event.target.value); setIntroSaved(false); }}
          />
        </label>
        <label className="field-label">
          主角与主线
          <textarea
            rows={4}
            maxLength={INTRO_THREAD_MAX}
            value={introThread}
            aria-label="主角与主线（发布版）"
            placeholder="主角的处境、目标、对手与代价，这条线具体怎么走。"
            onChange={(event) => { setIntroThread(event.target.value); setIntroSaved(false); }}
          />
        </label>
        {introError && (
          <p className="intervention-error" role="alert">
            {introError}
          </p>
        )}
        <div className="settings-inline-actions">
          <Button variant="secondary" onClick={saveIntro}>
            保存世界设定
          </Button>
          {introSaved && !introError && <span role="status">已保存。</span>}
        </div>
      </div>
      )}
      {!manual && story.kind === "merged" ? (
        <div className="settings-section settings-fusion">
          <h3>这本书的来历</h3>
          <p className="settings-fusion-line">
            {Array.isArray(story.sourceTitles) && story.sourceTitles.length >= 2
              ? <>由{story.sourceTitles.map((title) => `《${title}》`).join("×")}融合而来，{story.sourceTitles.length} 位主角共同走这条线。</>
              : <>由多条故事线融合而来，主角们共同走这条线。</>}
          </p>
          <p className="field-hint">
            {storyLengthModeOf(story) === "endless"
              ? "这条线继承了无限连载：没有预设终章，每 12 章一弧，直到你亲手为它完结。"
              : "这是一本 6 章的合流短篇，走完即止。"}
            合流故事是多条线合流的结晶，不能再作合流的来源。
          </p>
        </div>
      ) : !manual && onFuse ? (
        <div className="settings-section settings-fusion">
          <h3>合流</h3>
          <p className="field-hint">让这条线与其它线相遇（2–10 条），融合成一本多主角的新书——原书保留。如果有线还在连载中（无限连载），新线会继承无限连载继续往下写。</p>
          <Button variant="secondary" icon="git" onClick={onFuse}>
            与另一条线合流
          </Button>
        </div>
      ) : null}
      {!manual && (
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
      )}
      <div className="settings-section">
        <h3>章节目录</h3>
        <p className="field-hint">
          章节标题只是名字：随时可改，已经定稿的章节也能改；顺序和正文一个字都不会动。
        </p>
        {tocChapters.length === 0 ? (
          <p className="field-hint">还没有写好的章节。</p>
        ) : tocEditing ? (
          <>
            {tocChapters.map((chapter, position) => (
              <label className="field-label" key={chapter.id || position}>
                第 {position + 1} 章
                <input
                  value={tocTitles[position] ?? ""}
                  aria-label={`第 ${position + 1} 章标题`}
                  onChange={(event) =>
                    setTocTitles((list) => list.map((title, index) => (index === position ? event.target.value : title)))
                  }
                />
              </label>
            ))}
            {tocError && (
              <p className="intervention-error" role="alert">
                {tocError}
              </p>
            )}
            <div className="settings-inline-actions">
              <Button variant="secondary" onClick={saveToc}>
                保存目录
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setTocError("");
                  setTocEditing(false);
                }}
              >
                取消
              </Button>
            </div>
          </>
        ) : (
          <>
            <ol className="settings-outline">
              {tocChapters.map((chapter, position) => {
                const itemTitle = chapterTitleTextFor(chapter.title);
                return (
                  <li key={chapter.id || position}>
                    第 {position + 1} 章{itemTitle ? ` · ${itemTitle}` : ""}
                  </li>
                );
              })}
            </ol>
            <div className="settings-inline-actions">
              <Button variant="secondary" onClick={beginTocEdit}>
                编辑目录
              </Button>
            </div>
          </>
        )}
      </div>
      {!manual && (
      <>
      <div className="settings-section">
        <h3>世界书条目</h3>
        <p className="field-hint">
          条目是这本书的私有资料（导入的，或你自己写的），只在你自己的书里生效，永远不会出现在广场和分享里。常驻条目每章都带上；带关键词的条目，在章节上下文出现关键词时才注入。注入有总量上限，常驻优先。
        </p>
        {entries.length === 0 && (
          <div className="lorebook-empty">
            <img className="empty-inline-art" src="/art/empty-lorebook-512.webp" alt="" loading="lazy" />
            <p className="field-hint">还没有条目。在造世的世界一步导入世界书，或在下面自己写一条。</p>
          </div>
        )}
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
      </>
      )}
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
      {onDelete && (
        <div className="settings-section settings-danger">
          <h3>删除这本书</h3>
          <p className="field-hint">
            全部章节、阅读进度和书签一并删除，删掉后无法恢复；如果这条线已发布到广场，会同步下架。
          </p>
          <Button variant="danger" onClick={onDelete}>
            删除这本书
          </Button>
        </div>
      )}
      <div className="reading-dialog-actions">
        {!manual && <Button onClick={save}>保存设定集</Button>}
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
  avatars = [],
  onOpenAvatarPage,
  unsaved = false,
  onPrepareChapter,
  onReviseChapter,
  onRerollChapter,
  onStartNextSeason,
  onDeleteStory,
  authClient,
  onRerollCover,
  authSignal = "",
}) {
  const [snapshotIndex, setSnapshotIndex] = useState(0);
  // READER-PAGE (REQ-39): opening a book lands on its cover, then the
  // contents page, then the prose. frontStage is per-entry state: it
  // resets when a different book (or the read-only flip) mounts, and
  // never on story revisions — a chapter landing mid-entry must not
  // throw the cover back up.
  const [frontStage, setFrontStage] = useState("cover");
  const [frontLeaving, setFrontLeaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [finishConfirm, setFinishConfirm] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  // 番茄式 chrome: reading is full-screen immersion — two hairlines
  // (chapter line on top, progress + clock at the bottom) and nothing
  // else. Tapping the middle of the screen summons the menu chrome;
  // tapping again, opening any sheet, changing chapter, or starting to
  // scroll puts it away. The state lives in React (not a DOM flag): a
  // toggle tap is a deliberate gesture, never a scroll listener firing
  // mid-gesture.
  const [chromeOpen, setChromeOpen] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 20_000);
    return () => clearInterval(timer);
  }, []);
  const seekStamp = useRef(0);
  useEffect(() => {
    if (!chromeOpen) return undefined;
    let base = window.scrollY;
    const onScroll = () => {
      // Scrolls the slider itself causes while scrubbing must not fold
      // the menu away under the reader's finger — re-baseline instead.
      if (performance.now() - seekStamp.current < 800) { base = window.scrollY; return; }
      if (Math.abs(window.scrollY - base) > 24) setChromeOpen(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [chromeOpen]);
  // Edge compensation (PERSONA-QA N-07): the summoned chrome overlays
  // prose by design, but at the chapter's edges it would sit on the
  // chapter title (top bar) or the end matter (bottom bar) with nowhere
  // for them to go. When the menu opens while the reader is at the very
  // top or bottom, the page lends the bars room — extra top padding at
  // the top, extra bottom padding plus a settle scroll at the bottom.
  // Mid-chapter opens get no compensation: the bars float over ordinary
  // scrollback exactly as the model intends, and the reading position
  // never jumps.
  const [chromeLift, setChromeLift] = useState("");
  useEffect(() => {
    if (!chromeOpen) { setChromeLift(""); return; }
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    setChromeLift(window.scrollY <= 2 ? "top" : window.scrollY >= maxY - 2 ? "bottom" : "");
  }, [chromeOpen]);
  // Runs after the lift padding has rendered: the added bottom room
  // only creates headroom, so settle into it and the end matter rises
  // clear of the bottom bar. The seek stamp keeps the chrome's own
  // scroll-close watcher from reading this deliberate move as a
  // reader scroll.
  useEffect(() => {
    if (chromeLift !== "bottom") return;
    seekStamp.current = performance.now();
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
  }, [chromeLift]);
  const [bookmarkVersion, setBookmarkVersion] = useState(0);
  const bookmarkAnchor = useRef(null);
  const requestedLocation = useRef(null);
  const [preferencesStore] = useState(() => createReadingPreferencesStore());
  const preferences = useSyncExternalStore(preferencesStore.subscribe, preferencesStore.getSnapshot);
  const [interveneOpen, setInterveneOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [intervening, setIntervening] = useState(false);
  const [interveneSettled, setInterveneSettled] = useState(false);
  // Cancelling the overlay only releases the UI trap: the revision pass
  // keeps running and its landing (or the surviving queue, on failure)
  // still applies, so post-cancel settle/error updates are suppressed.
  const interveneCancelledRef = useRef(false);
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
  const locationKey = story && chapterLocationKey(story.id, index, chapter.paragraphs, readOnly);
  const { animate: readerMotionAnimate } = useMotionPolicy("reader");
  // READER-PAGE (REQ-38): page turns animate only when the motion
  // policy allows it and the input is not the keyboard (whose turns
  // the appearance layer already marks motion-off).
  const turnMotion = readerMotionAnimate && preferences.inputMethod !== "keyboard";
  const reading = useReaderExperience({ readerRef, locationKey, settings: preferences.settings, turnMotion,
    blocked: preferencesOpen || toolsOpen || directoryOpen || shareOpen || interveneOpen || settingsOpen || proseOpen || frontStage !== null });
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
    setChromeOpen(false);
    setInterveneOpen(false);
    setSettingsOpen(false);
    setInterveneNote("");
    setRerollConfirm(false);
    setProseOpen(false);
    setError("");
  }, [story?.id, story?.revision, readOnly]);

  useEffect(() => {
    setFrontStage("cover");
    setFrontLeaving(false);
  }, [story?.id, readOnly]);

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
      if (prepared !== story) {
        // Landing the prepared window is also the reader standing on
        // this chapter: route it through moveReadingPosition so the
        // opened-through watermark advances with the position (the act
        // that finalises the chapter before it, FRONTIER-FIX). The
        // spread fallback is the degenerate unreachable-index case,
        // kept so a materialisation landing is never lost.
        const positioned = moveReadingPosition(prepared, index);
        onUpdateStory?.(positioned === prepared ? { ...prepared, readerIndex: index } : positioned);
      }
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
  // 自己写 (WRITE-MODE §50): a hand-written book in its owner's reader
  // keeps the reading chrome and the settings book, but every AI
  // semantic is absent — no intervention, no frontier re-roll, no
  // prepared next chapter; in their place the reader offers the desk.
  const manual = isManualStory(story);
  // A running endless line: no denominator anywhere — the position reads
  // as a serialising count, progress is measured against what exists,
  // and the map shows the chapters written plus the one being written.
  const serializing = lengthMode === "endless" && !isManuallyFinished(story);
  const displayTotal = mapTotalFor(total, story.chapters?.length || 0, index);
  const nextAvailable = index < lastAccessibleIndex(story, readOnly);
  const isFinal = index >= total - 1
    || (lengthMode === "endless" && isManuallyFinished(story) && index >= (story.chapters?.length || 1) - 1);
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
  // 编辑简介 / 编辑目录 (EDIT-BOOK): presentation metadata on the
  // owner's own copy — the synopsis and the chapter titles. Both land
  // through the ordinary story update, so the cloud sync carries them
  // like any other edit (it keys on updatedAt); plaza publications are
  // publish-time snapshots and only follow on a re-publish — the one
  // exception is the book title itself (TITLE-FLOW, saveBookTitle
  // below), which the server mirrors onto the publication at sync time.
  // Handlers return a human error string (or null on success) so the
  // calling section can keep its editor open on a validation failure.
  const saveSynopsis = (text) => {
    try {
      const next = updateSynopsis(story, text);
      if (next !== story) update(next);
      return null;
    } catch (failure) {
      return failure.message || "简介没能保存，请再试一次。";
    }
  };
  // 世界设定（发布版）(REQ-56): the public intro's three parts land
  // through the same story update as the synopsis — local book at
  // once, plaza publication on the next re-publish.
  const saveIntro = (intro) => {
    try {
      const next = updateIntro(story, intro);
      if (next !== story) update(next);
      return null;
    } catch (failure) {
      return failure.message || "世界设定没能保存，请再试一次。";
    }
  };
  // 改书名 (TITLE-FLOW): the title is metadata like the synopsis, so it
  // lands through the same story update — but unlike the synopsis, the
  // server mirrors a rename onto the book's plaza publication when the
  // sync carries it up (see server/plaza.js syncTitleForStory).
  const saveBookTitle = (title) => {
    try {
      const next = renameBookTitle(story, title);
      if (next !== story) update(next);
      return null;
    } catch (failure) {
      return failure.message || "书名没能保存，请再试一次。";
    }
  };
  const saveChapterTitles = (titles) => {
    try {
      let next = story;
      (Array.isArray(titles) ? titles : []).forEach((title, chapterIndex) => {
        if (typeof title === "string" && title !== next.chapters[chapterIndex]?.title) {
          next = renameChapterTitle(next, chapterIndex, title);
        }
      });
      if (next !== story) update(next);
      return null;
    } catch (failure) {
      return failure.message || "目录没能保存，请再试一次。";
    }
  };
  // 生成控制 (frontier levers): this chapter may still be re-rolled or
  // edited by hand while it is the latest one written — no later chapter
  // exists yet. Both levers vanish by omission everywhere else; earlier
  // chapters offer nothing, which is their locked state.
  const isFrontier = !readOnly && !manual && isFrontierChapter(story, index) && Boolean(story.chapters?.[index]);
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
    interveneCancelledRef.current = false;
    if (story.engine === "gemini" && onReviseChapter) {
      try {
        await onReviseChapter(story.id, target, queuedStory);
        if (!interveneCancelledRef.current) setInterveneSettled(true);
      } catch (failure) {
        // The queue was landed before the pass ran, so the nudge survives
        // the failure and folds into the chapter's next generation.
        setIntervening(false);
        if (!interveneCancelledRef.current) setError(failure.message || "重写没能完成，介入还排在队列里。");
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
    // A hand-written book has no next chapter until its author writes
    // one: paging past the last written chapter is a no-op here, and
    // the chapter-end block below offers the desk instead.
    if (manual) {
      if (nextAvailable) goToChapter(index + 1);
      return;
    }
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
  // READER-PAGE (REQ-38): a tap-turn crossing a chapter boundary
  // slides like a page turn in paged mode with motion on — the hook
  // captures the old chapter's screen, the advance swaps the chapter,
  // and the layout effect below completes the slide against the new
  // chapter. Otherwise the advance is the plain jump it always was.
  const chapterTurn = (direction) => {
    const advance = () => {
      if (direction > 0) handleNext();
      else goToChapter(index - 1);
    };
    if (preferences.settings.readingMode === "page") reading.beginCrossTurn(direction);
    advance();
  };
  useEffect(() => { reading.completeCrossTurn(); }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const toggleStoryBookmark = () =>
    onToggleBookmark?.({ ...story, bookmarked: !story.bookmarked });
  const goBack = () =>
    backRoute ? onNavigate(backRoute.view, { id: backRoute.id }) : onNavigate(readOnly ? "store" : "home");
  const anySheetOpen = preferencesOpen || toolsOpen || directoryOpen || shareOpen
    || interveneOpen || settingsOpen || proseOpen || coverOpen;
  useEffect(() => { if (anySheetOpen) setChromeOpen(false); }, [anySheetOpen]);
  useEffect(() => { if (focused) setChromeOpen(false); }, [focused]);
  // Tap zones (番茄 model): left / right thirds turn one screen, the
  // middle third toggles the chrome. Zones are judged on the pointerup's
  // viewport coordinates and the finger's own displacement — never on
  // scrollY. The previous click-path guard (reject when scrollY moved
  // >4px between pointerdown and click) silently ate real taps on iOS:
  // momentum settle and scroll anchoring shift scrollY by far more than
  // 4px between touchstart and the synthetic click everywhere except at
  // the very top, where scrollY is clamped to 0 and cannot drift — the
  // exact symptom the user reported (menu only summonable at the top).
  // Finger displacement is the ground truth of tap intent: a scroll
  // gesture moves the finger, a tap does not, however far the page
  // itself glides underneath a stationary finger.
  const tapStart = useRef(null);
  const noteTapStart = (event) => {
    tapStart.current = {
      x: event.clientX,
      y: event.clientY,
      at: performance.now(),
      pointerId: event.pointerId,
      interactive: Boolean(event.target.closest("button, a, input, textarea, select, summary, label, dialog, .reader-chrome")),
    };
    if (!tapStart.current.interactive && !frontStage) reading.dragStart(event.clientX, event.clientY);
  };
  const forgetTap = () => { tapStart.current = null; };
  // READER-PAGE (REQ-38/39): horizontal drags feed the turn engine;
  // on the cover page a leftward swipe turns to the contents page.
  const handleReaderMove = (event) => {
    if (frontStage === "cover") {
      const start = tapStart.current;
      if (start && event.clientX - start.x < -56) {
        tapStart.current = null;
        setFrontStage("toc");
      }
      return;
    }
    if (frontStage) return;
    if (reading.dragMove(event.clientX)) {
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* capture is a nicety, not a requirement */ }
    }
  };
  const handleReaderCancel = () => { reading.dragCancel(); forgetTap(); };
  const turnScreen = (direction, tapY = null) => {
    setChromeOpen(false);
    if (preferences.settings.readingMode === "page") {
      // READER-FIX2 (REQ-46): in paged mode the window never scrolls,
      // so chapter edges are page edges — the pager's own page/total
      // decides whether a tap turns a page or crosses the chapter.
      const info = reading.pageInfo();
      if (!info) return;
      if (direction > 0 && info.page >= info.total - 1) { chapterTurn(1); return; }
      if (direction < 0 && info.page <= 0) { if (index > 0) chapterTurn(-1); return; }
      reading.pageBy(direction, { tapY });
      return;
    }
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (direction > 0 && window.scrollY >= maxY - 2) { chapterTurn(1); return; }
    if (direction < 0 && window.scrollY <= 2) { if (index > 0) chapterTurn(-1); return; }
    const step = Math.max(160, window.innerHeight - 56);
    window.scrollTo({ top: Math.min(maxY, Math.max(0, window.scrollY + direction * step)), behavior: "smooth" });
  };
  const handleReaderTap = (event) => {
    // A drag that turned (or settled back) owns this pointerup.
    if (reading.dragEnd()) { tapStart.current = null; return; }
    const start = tapStart.current;
    tapStart.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    if (anySheetOpen || intervening || rerolling) return;
    if (window.getSelection && window.getSelection().toString()) return;
    if (start.interactive) return;
    if (event.target.closest("button, a, input, textarea, select, summary, label, dialog, .reader-chrome")) return;
    if (Math.abs(event.clientX - start.x) > 12 || Math.abs(event.clientY - start.y) > 12) return;
    if (performance.now() - start.at > 800) return;
    const zone = event.clientX / Math.max(1, window.innerWidth);
    if (frontStage) {
      // READER-PAGE (REQ-39): front-matter taps never reach the prose
      // zones. The cover turns to the contents page from its right
      // side; the contents page navigates by its own rows and its
      // primary entry, which are interactive targets handled above.
      if (frontStage === "cover" && zone >= 1 / 3) setFrontStage("toc");
      return;
    }
    if (zone < 1 / 3) turnScreen(-1, start.y);
    else if (zone > 2 / 3) turnScreen(1, start.y);
    else setChromeOpen((open) => !open);
  };
  const clockText = clock.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  // A stored bare-number title (early generation artifact) prints as
  // nothing: the header and the chapter heading fall back to the
  // ordinal alone instead of 「第 3 章 · 3」 (ENTRY-OPTIONS).
  const displayChapterTitle = chapterTitleTextFor(chapter.title);
  // READER-PAGE (REQ-39): front matter — cover, then contents, then
  // prose. The pages overlay the always-mounted prose and never touch
  // chapter progress, the pre-generation window, or the
  // opened-through watermark, which all key off the chapter index
  // exactly as before.
  const frontTotal = story ? mapTotalFor(totalChaptersFor(story), story.chapters?.length || 0, index) : 0;
  const frontLast = story ? lastAccessibleIndex(story, readOnly) : -1;
  const frontByline = readOnly && story?.authorName ? `作者 ${story.authorName}` : `主角 ${displayName(story)}`;
  const frontProgress = !story
    ? ""
    : isStoryComplete(story)
      ? `全 ${story.chapters?.length || 0} 章 · 已完结`
      : storyLengthModeOf(story) === "endless" && !isManuallyFinished(story)
        ? `连载中 · 已更新 ${story.chapters?.length || 0} 章`
        : `共 ${frontTotal} 章 · 读到第 ${index + 1} 章`;
  const frontAtStart = index === 0 && reading.progress === 0;
  const enterProse = (target) => {
    if (target !== null && target !== undefined && target !== index) goToChapter(target);
    if (turnMotion) {
      setFrontLeaving(true);
      window.setTimeout(() => { setFrontStage(null); setFrontLeaving(false); }, 350);
    } else setFrontStage(null);
  };

  // READER-FIX2 (REQ-46): the chapter-end matter renders after the
  // prose in scroll mode and as the pager's final page in paged mode —
  // one definition, two hosts.
  const endMatter = (
    <>
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
        这是你正在读的最新章节——现在还能亲手调度这一章。翻开下一章，这一章就此定稿。
      </p>
      {chapter.degraded && (
        <p className="frontier-degraded">本章由备用通道生成</p>
      )}
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
  {!isFinal && (!readOnly || nextAvailable) && !(manual && !nextAvailable) && (
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
  {manual && !readOnly && !isFinal && !nextAvailable && (
    <div className="sw-next-action">
      <Button icon="pencil" onClick={() => onNavigate("write", { storyId: story.id })}>
        写下一章
      </Button>
      <span>这一章之后还空着——下一章由你来写。</span>
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
      ) : manual && !readOnly ? (
        <>
          <p>这本书是你一个字一个字写下来的。书名和简介在设定集里改，正文在写作台里写。</p>
          <Button icon="pencil" onClick={() => onNavigate("write", { storyId: story.id })}>
            回写作台
          </Button>
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
    </>
  );
  return (
    <div ref={readerRef} className="page page-reader page-enter" data-reader-focused={focused ? 'true' : 'false'} data-chrome-lift={chromeLift || undefined} data-chrome-open={chromeOpen || undefined} onPointerDown={noteTapStart} onPointerUp={handleReaderTap} onPointerMove={handleReaderMove} onPointerCancel={handleReaderCancel} {...getReaderAppearance(preferences.settings, { inputMethod: preferences.inputMethod })}>
      {frontStage && story && (
        <div className={`reader-front${frontLeaving ? " leaving" : ""}`} data-stage={frontStage} role="region" aria-label="开卷">
          <div className="reader-front-track">
            <section className="reader-front-page reader-front-cover">
              <button type="button" className="reader-front-back" onClick={goBack} aria-label="返回">
                <Icon name="chevron" size={18} className="rotate-180" />
              </button>
              <div className="reader-front-art">
                <StoryCover story={story} genreId={genreOf(story).id} sources={coverSources(story)} eager getAccessToken={() => authClient.getAccessToken()} authSignal={authSignal} />
              </div>
              <h2 className="reader-front-title">{story.title}</h2>
              <p className="reader-front-byline">{frontByline}</p>
              <p className="reader-front-meta">{frontProgress}</p>
              <button type="button" className="reader-front-enter" onClick={() => setFrontStage("toc")}>
                翻开目录 <Icon name="chevron" size={15} />
              </button>
              <p className="reader-front-hint">轻点右侧或向左滑动，翻到目录</p>
            </section>
            <section className="reader-front-page reader-front-toc">
              <button type="button" className="reader-front-back" onClick={goBack} aria-label="返回">
                <Icon name="chevron" size={18} className="rotate-180" />
              </button>
              <h2 className="reader-front-toc-title">{story.title}</h2>
              <p className="reader-front-meta">{frontProgress}</p>
              <Button variant="primary" className="reader-front-cta" onClick={() => enterProse(null)}>
                {frontAtStart ? "开始阅读" : "继续阅读"} · 第 {index + 1} 章
              </Button>
              <div className="chapter-directory-list reader-front-list">
                {Array.from({ length: frontTotal }, (_, chapterIndex) => {
                  const available = chapterIndex <= frontLast;
                  const frontChapter = story.chapters[chapterIndex];
                  const status =
                    index === chapterIndex
                      ? "正在阅读"
                      : !available
                        ? readOnly
                          ? "尚未分享"
                          : "继续阅读后开启"
                        : frontChapter?.interventions?.length
                          ? "介入"
                          : "";
                  return (
                    <button
                      key={chapterIndex}
                      disabled={!available}
                      aria-current={index === chapterIndex ? "page" : undefined}
                      onClick={() => enterProse(chapterIndex)}
                    >
                      <b>{String(chapterIndex + 1).padStart(2, "0")}</b>
                      <span>
                        <strong>{available ? frontChapter.title : "故事待续"}</strong>
                        {status && <small>{status}</small>}
                      </span>
                      <Icon name={available ? "chevron" : "lock"} size={16} />
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      )}
      <div className="reader-status-top">
        <button
          type="button"
          className="reader-status-back"
          aria-label={backText || (readOnly ? "返回书城" : "我的世界")}
          onClick={goBack}
        >
          <Icon name="chevron" size={13} className="rotate-180" />
          <span>第 {index + 1} 章{displayChapterTitle ? ` · ${displayChapterTitle}` : ""}</span>
        </button>
        <span
          className="sr-only"
          role="progressbar"
          aria-label="阅读进度"
          aria-valuemin={1}
          aria-valuemax={displayTotal}
          aria-valuenow={index + 1}
          aria-valuetext={serializing ? `第 ${index + 1} 章，连载中` : `第 ${index + 1} 章，共 ${total} 章`}
        />
      </div>
      <div className="reader-status-bottom" aria-hidden="true">
        <span>{Number.isFinite(total) && !serializing
          ? `第 ${index + 1} / ${total} 章 · 本章 ${reading.progress}%`
          : `第 ${index + 1} 章 · 本章 ${reading.progress}%`}</span>
        <span>{clockText}</span>
      </div>
      {chromeOpen && (
        <>
          <div className="reader-chrome reader-chrome-top">
            <button
              type="button"
              className="reader-chrome-back"
              aria-label="返回"
              onClick={goBack}
            >
              <Icon name="chevron" size={20} className="rotate-180" />
            </button>
            <div className="reader-chrome-title">
              <b>{story.title}</b>
              <span> · 第 {index + 1} 章{displayChapterTitle ? ` · ${displayChapterTitle}` : ""}</span>
            </div>
            {!readOnly && (
              <div className="reader-chrome-actions">
                <button type="button" aria-label="设定集" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>
                  <Icon name="sliders" size={19} />
                </button>
                <button type="button" aria-label="封面" aria-haspopup="dialog" onClick={() => setCoverOpen(true)}>
                  <Icon name="image" size={19} />
                </button>
                <button type="button" aria-label="分享" onClick={() => setShareOpen(true)}>
                  <Icon name="send" size={17} />
                </button>
              </div>
            )}
          </div>
          <div className="reader-chrome reader-chrome-bottom">
            <div className="reader-chrome-navrow">
              <button
                type="button"
                className="reader-chrome-chapter-nav"
                onClick={() => goToChapter(index - 1)}
                disabled={index <= 0}
              >
                上一章
              </button>
              <input
                type="range"
                className="reader-chrome-slider"
                min={0}
                max={100}
                step={1}
                value={reading.progress}
                onChange={(event) => { seekStamp.current = performance.now(); reading.seekToProgress(Number(event.target.value)); }}
                aria-label="本章进度"
              />
              <button
                type="button"
                className="reader-chrome-chapter-nav"
                onClick={handleNext}
                disabled={isFinal || (readOnly && !nextAvailable)}
              >
                下一章
              </button>
            </div>
            <div className="reader-chrome-grid" role="group" aria-label="阅读工具栏">
              <button type="button" onClick={() => setDirectoryOpen(true)} aria-haspopup="dialog">
                <Icon name="menu" size={20} />
                <span>目录</span>
              </button>
              <button type="button" aria-label="阅读设置" aria-haspopup="dialog" onClick={() => setPreferencesOpen(true)}>
                <b aria-hidden="true">Aa</b>
                <span>设置</span>
              </button>
              <button type="button" onClick={openTools} aria-haspopup="dialog">
                <Icon name="search" size={20} />
                <span>查找</span>
              </button>
              <button type="button" aria-pressed={focused} onClick={() => setFocused((value) => !value)}>
                <Icon name="book" size={20} />
                <span>专注</span>
              </button>
              {!readOnly && (manual ? (
                <button type="button" className="reader-chrome-intervene" onClick={() => onNavigate("write", { storyId: story.id })}>
                  <Icon name="pencil" size={20} />
                  <span>写作</span>
                </button>
              ) : (
                <button type="button" className="reader-chrome-intervene" onClick={() => setInterveneOpen(true)} aria-haspopup="dialog">
                  <Icon name="ripple" size={20} />
                  <span>介入</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {/* READER-POLISH2 (REQ-54): the read-only note no longer rides
          above every chapter — it is stated once on the book's detail
          page (PlazaDetail) and nowhere in the reader. */}
      {error && (
        <div className="sw-inline-alert" role="alert">
          <Icon name="x" size={14} />
          {error}
        </div>
      )}
      <div className="reader-layout">
        {preferences.settings.readingMode === "page" ? (
          <ReaderPager
            registerPager={reading.registerPager}
            chapterKey={locationKey}
            title={displayChapterTitle || `第 ${index + 1} 章`}
            paragraphs={chapter.paragraphs}
            endMatter={endMatter}
            motionOn={turnMotion}
            turnStyle={preferences.settings.turnStyle}
            onSettle={reading.notePagerSettle}
          />
        ) : (
          <article className="reader-article">
            <h1 ref={titleRef} tabIndex={-1}>
              {displayChapterTitle || `第 ${index + 1} 章`}
            </h1>
            <div className="reader-prose" lang="zh-CN">
              <p className="article-lede" data-reading-paragraph="0">{chapter.paragraphs[0]}</p>
              <div className="article-body">
                {chapter.paragraphs.slice(1).map((paragraph, paragraphIndex) => (
                  <p data-reading-paragraph={paragraphIndex + 1} key={`${chapter.id}-${paragraphIndex}`}>{paragraph}</p>
                ))}
              </div>
            </div>
            {endMatter}
          </article>
        )}
      </div>
      {reading.warning && <p className="reader-location-warning" role="status">{reading.warning}</p>}
      {preferencesOpen && <ReadingDialog title="阅读设置" onClose={() => setPreferencesOpen(false)}>
        <ReadingPreferences value={preferences.settings} onChange={changePreferences} storageWarning={preferences.storageWarning}/>
        {reading.wakeStatus && <p className="reading-tools-status" role="status">{reading.wakeStatus}</p>}
      </ReadingDialog>}
      {toolsOpen && <ReadingDialog title="查找与书签" onClose={() => setToolsOpen(false)}>
        <ReadingTools chapters={readingChapters} lastAccessible={lastAccessibleIndex(story, readOnly)} bookmarks={bookmarks}
          story={story} currentChapterIndex={index}
          storyBookmarked={Boolean(story.bookmarked)}
          onToggleStoryBookmark={readOnly ? undefined : toggleStoryBookmark}
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
          onRenameChapters={readOnly ? undefined : saveChapterTitles}
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
          avatars={avatars}
          onOpenAvatarPage={onOpenAvatarPage}
          onBringAvatar={(avatar) => {
            const next = bringAvatarIntoStory(story, avatar);
            if (next !== story) update(next);
          }}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
          onSaveSynopsis={saveSynopsis}
          onSaveIntro={saveIntro}
          onSaveBookTitle={saveBookTitle}
          onSaveChapterTitles={saveChapterTitles}
          onFuse={() => { setSettingsOpen(false); onNavigate("merge", { storyId: story.id }); }}
          onDelete={onDeleteStory ? () => { setSettingsOpen(false); onDeleteStory(story); } : undefined}
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
          onCancel={() => { interveneCancelledRef.current = true; setIntervening(false); }}
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

/**
 * One bookstore card (BOOKSTORE-PLAZA): a bare cover, then the body —
 * title row, byline, handle, and the pinned footer (status+length /
 * rating). STORE-DESIGN v3 (user rule, 2026-10-30): NO introduction
 * and NO tag chips on this card — their lengths cannot be budgeted,
 * so they live only on the book detail page. Nothing appears twice
 * on one card (first rule).
 */
function StoreBookCard({ book, onOpen }) {
  const genre = genreById[book.genreId] || GENRES[0];
  const authorHandle = typeof book.authorHandle === "string" ? book.authorHandle.trim() : "";
  const showHandle = Boolean(authorHandle)
    && authorHandle.toLowerCase() !== String(book.authorName || "").toLowerCase();
  // STORE-DESIGN v2: the footer's first line carries status + length
  // together — the status word leads (so it forms a column down the
  // grid) unless the length label already opens with it (endless
  // serializing labels do: 连载中 · 已更 N 章).
  const lengthLabel = plazaLengthLabel(book);
  const statusWord = plazaLineStatusFor(book) === "serializing" ? "连载中" : "已完结";
  const lengthLine = lengthLabel.includes(statusWord) ? lengthLabel : `${statusWord} · ${lengthLabel}`;
  return (
    <article className="store-book-card">
      <button
        type="button"
        className="plaza-card-cover"
        onClick={() => onOpen(book)}
        aria-label={`查看《${book.title}》详情`}
      >
        {/* STORE-DESIGN v2 (user rule, 2026-10-30): the cover is a
            bare rectangle of art — NO overlay of any kind rides it:
            no shade, no printed title, no status capsule, no share
            badge. The title lives in the body's first row, the
            status in the footer, and the share count only on the
            book detail page. Art baked into a generated cover image
            itself is the picture, not an overlay. */}
        <PublicationArtwork publication={book} genreId={genre.id} />
      </button>
      <div className="store-book-body">
        {/* DEVICE-FIX3 (REQ-37, DESIGN §54): fixed slots, spec-first.
            Every information item owns a slot sized by its budget —
            name (18 units; the official badge spends from the same
            line) on its own line, the handle (≤20 chars by the
            username pattern) on its own line. STORE-DESIGN
            (proposed, STORE-DESIGN.md): the meta block (status+length
            / rating) is pinned to the card foot by margin-top:auto
            inside a framed card — its joint absorbs the one remaining
            variance (a hidden handle) — and an unrated book says
            暂无评价 instead of leaving a blank slot, so no slot is
            ever an invisible void.
            STORE-DESIGN v2: the title is the body's FIRST row (it
            left the cover, which is now bare art), sized by the
            BH-06 fit formula fed by --title-glyphs (title characters
            + the 《》 pair) so it always fits whole on one line.
            REQ-63: the title may now wrap to TWO lines — the slot is
            two lines tall, --title-glyphs counts §54 wide units
            (《title》 included) so the formula sizes for a two-line
            fit, and the platform title limit (BOOK_TITLE_MAX) keeps
            every new title inside those two lines at the source.
            STORE-DESIGN v3: the intro slot and the chip rows are
            GONE (user rule — unbudgetable lengths do not ride a list
            card; both live on the detail page only).
            Text hierarchy (STORE-DESIGN.md §2): title 16/700 --ink,
            author 14/600 --ink, handle 12 --dim-2, footer 12.5 --dim
            with the rating in --amber. Nothing in this body
            ellipsizes: over-budget legacy strings are whole-character
            clipped by clipToUnits as a safety net, and new input is
            capped at the source (§54). */}
        <div className="store-slot store-slot-title">
          <span className="store-book-title" style={{"--title-glyphs": Math.ceil(textUnitsFor(`《${book.title || ""}》`) / 2)}}>《{book.title}》</span>
        </div>
        <div className="store-slot store-slot-name">
          {/* §54: the name LINE budget is 18 units; the official
              badge (≈6 units measured) is spent from the same line,
              so an official name renders at most 12 units here. */}
          <span className="store-author-name">{clipToUnits(book.authorName, book.official ? 12 : 18)}</span>
          {book.official && <span className="plaza-byline-official">官方</span>}
        </div>
        <div className="store-slot store-slot-handle">
          {showHandle ? <span>@{authorHandle}</span> : null}
        </div>
        <div className="store-meta-block">
          <div className="store-slot store-slot-meta">
            <span>{lengthLine}</span>
          </div>
          <div className="store-slot store-slot-meta">
            {book.ratingCount > 0 && ratingAverageText(book) ? (
              <span className="store-card-rating">★ {ratingAverageText(book)} · {countTextFor(book.ratingCount)} 条评价</span>
            ) : (
              <span className="store-rating-empty">暂无评价</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

const STORE_SORTS = [
  { id: "latest", label: "最新上架" },
  { id: "hot", label: "热门" },
  { id: "complete", label: "完本" },
];

/**
 * The bookstore (BOOKSTORE-PLAZA): the site's formal catalogue,
 * served by /api/store. Shelves are the L1 genre families; rankings
 * are the server's honest sorts (shelving time / real engagement /
 * finish time); search is a plain substring over title, author and
 * world. Publishing a line shelves it here — the publish flow lives
 * one tap away in the heading.
 */
function Store({ onNavigate, onOpenBook, onPublish, resumeSignal }) {
  const [kind, setKind] = useState("normal");
  const [shelf, setShelf] = useState("");
  const [sort, setSort] = useState("latest");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  // Keep-alive freshness (RATINGS): the store view stays mounted
  // (§37 J), so without this its cards would keep the counts they
  // were fetched with — rate a book in its detail page, come back,
  // and the card must already carry the average. Every navigation
  // hands the active view a fresh route object; when it changes
  // while this view is the mounted one, silently refetch (existing
  // cards stay on screen, scroll and filters untouched).
  const mountedSignal = useRef(resumeSignal);
  useEffect(() => {
    if (resumeSignal === mountedSignal.current) return;
    mountedSignal.current = resumeSignal;
    setRetry((value) => value + 1);
  }, [resumeSignal]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let live = true;
    setError("");
    fetchStoreBooks({ shelfId: shelf, kind, sort, q: debouncedQuery, limit: 60 })
      .then((result) => { if (live) setData(result); })
      .catch(() => { if (live) { setData({ books: [], total: 0 }); setError("书城暂时没能打开，请稍后再试。"); } });
    return () => { live = false; };
  }, [shelf, kind, sort, debouncedQuery, retry]);

  const books = data?.books || [];
  const searching = debouncedQuery.length > 0;
  return (
    <div className="page page-store page-enter">
      {/* Store banner (BUGHUNT-FIX asset wiring): the many-worlds
          painting heads the store and the page title rides its
          reserved darker band — one title, on the art. */}
      <div className="store-banner">
        <img src="/art/banner-store-1600.webp" alt="" width="1600" height="533" />
        <span className="store-banner-shade" aria-hidden="true" />
        <header className="store-heading">
          <h1>书城</h1>
          <button type="button" className="small-link" onClick={onPublish}>
            上架我的故事 <Icon name="send" size={17} />
          </button>
        </header>
      </div>
      <div className="store-search">
        <Icon name="search" size={17} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜书名、作者或世界"
          aria-label="搜索书城"
        />
        {query && (
          <button type="button" className="store-search-clear" onClick={() => setQuery("")} aria-label="清除搜索">
            <Icon name="x" size={15} />
          </button>
        )}
      </div>

      {/* First-level division （普通 / 合流）: two separate catalogues,
          each with its own family shelves below — a fused book never
          appears under 普通， an ordinary book never under 合流. */}
      <div className="store-filters store-divisions" role="group" aria-label="书城大分类">
        {[
          { id: "normal", label: "普通" },
          { id: "fusion", label: "合流" },
        ].map((division) => (
          <button
            type="button"
            key={division.id}
            className={kind === division.id ? "active" : ""}
            aria-pressed={kind === division.id}
            onClick={() => { setKind(division.id); setShelf(""); }}
          >
            {division.label}
          </button>
        ))}
      </div>

      <div className="store-toolbar">
        <div className="store-filters" role="group" aria-label="小说分类">
          <button
            type="button"
            className={shelf === "" ? "active" : ""}
            aria-pressed={shelf === ""}
            onClick={() => setShelf("")}
          >
            全部
          </button>
          {GENRE_SHELVES.map((family) => (
            <button
              type="button"
              key={family.id}
              className={shelf === family.id ? "active" : ""}
              aria-pressed={shelf === family.id}
              onClick={() => setShelf(family.id)}
            >
              {family.name}
            </button>
          ))}
        </div>
        <div className="store-sorts" role="group" aria-label="书城排序">
          {STORE_SORTS.map((entry) => (
            <button
              type="button"
              key={entry.id}
              className={sort === entry.id ? "active" : ""}
              aria-pressed={sort === entry.id}
              onClick={() => setSort(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="plaza-empty" role="alert">
          <p>{error}</p>
          <Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>再试一次</Button>
        </div>
      )}
      {data === null && !error && (
        <div className="store-grid" role="status" aria-label="正在打开书城…">
          {[[76, 48], [64, 52], [70, 44], [80, 50]].map(([titleWidth, authorWidth], index) => (
            <div className="da-skel-book" key={index} aria-hidden="true">
              <span className="da-skel da-skel--cover" />
              <span className="da-skel da-skel--line" style={{ width: `${titleWidth}%` }} />
              <span className="da-skel da-skel--line" style={{ width: `${authorWidth}%` }} />
            </div>
          ))}
        </div>
      )}
      {data !== null && !error && books.length === 0 && (
        <div className="store-empty" role="status">
          <img className="empty-art" src={searching ? "/art/empty-search-512.webp" : "/art/empty-store-512.webp"} alt="" loading="lazy" />
          <h3>{searching ? `没有搜到「${debouncedQuery}」` : "这个分类还没有上架的书"}</h3>
          <p>{searching ? "换个书名、作者名或世界名试试。" : "走完一条故事线，就能把它上架到书城。"}</p>
          <Button variant="secondary" icon="arrow" onClick={() => onNavigate("forge")}>
            开一本新书
          </Button>
        </div>
      )}
      {books.length > 0 && (
        <div className="store-grid">
          {books.map((book) => (
            <StoreBookCard key={book.id} book={book} onOpen={onOpenBook} />
          ))}
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
  // Face anchor (user order 2026-10-28, DESIGN §27): when the picture IS
  // the avatar's full-body portrait, the small frame crops to the head —
  // the frame clips, the image zooms to the face anchor — so a round
  // slot never shows a torso. Uploaded pictures get the top anchor only.
  const resolved = publication?.avatar?.pictureUrl || "/default-avatar.svg";
  const [src, setSrc] = useState(resolved);
  useEffect(() => { setSrc(resolved); }, [resolved]);
  const portrait = publication?.avatar?.pictureKind === "avatar";
  return (
    <span className={`plaza-avatar-frame ${large ? "is-large" : ""} ${portrait ? "is-portrait" : ""}`}>
      <img
        className="plaza-avatar-img"
        src={src}
        alt=""
        loading="lazy"
        onError={() => { if (src !== "/default-avatar.svg") setSrc("/default-avatar.svg"); }}
      />
    </span>
  );
}

// A publication's face — ONE chain on every surface that shows a
// published line (COVER-FIX): the book's OWN generated cover first
// (publication.coverUrl, resolved server-side from the cover store
// under the publication id); the shared world artwork only when the
// line has no cover, or when the cover image itself fails to load;
// never skip the cover for any other reason.
function PublicationArtwork({ publication, genreId, eager = false }) {
  const coverUrl = typeof publication?.coverUrl === "string" && publication.coverUrl ? publication.coverUrl : null;
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => { setCoverFailed(false); }, [coverUrl]);
  if (coverUrl && !coverFailed) {
    return (
      <span className="world-art publication-art" aria-hidden="true">
        <img
          src={coverUrl}
          alt=""
          width="768"
          height="1052"
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onError={() => setCoverFailed(true)}
        />
      </span>
    );
  }
  return <WorldArtwork genreId={genreId} eager={eager} />;
}

function plazaFeedTime(iso) {
  const stamp = typeof iso === "string" ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(stamp)) return "";
  const days = Math.floor((Date.now() - stamp) / 86_400_000);
  if (days <= 0) return "今天更新";
  if (days === 1) return "昨天更新";
  if (days < 30) return `${days} 天前更新`;
  return `${new Date(stamp).getMonth() + 1}月${new Date(stamp).getDate()}日更新`;
}

/** Relative time for a post or comment: 刚刚 / N分钟前 / N小时前 / 昨天 / N天前 / 日期. */
function postTimeFor(iso) {
  const stamp = typeof iso === "string" ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(stamp)) return "";
  const seconds = Math.floor((Date.now() - stamp) / 1000);
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "昨天";
  if (days < 30) return `${days}天前`;
  const date = new Date(stamp);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** A person's resolved picture (post/comment author), with the default asset as the floor. */
function PersonPicture({ picture, size = 40 }) {
  const [src, setSrc] = useState(picture?.url || "/default-avatar.svg");
  useEffect(() => { setSrc(picture?.url || "/default-avatar.svg"); }, [picture?.url]);
  const portrait = picture?.kind === "avatar";
  return (
    <span
      className={`plaza-avatar-frame ${portrait ? "is-portrait" : ""}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img
        className="plaza-avatar-img"
        src={src}
        alt=""
        loading="lazy"
        onError={() => { if (src !== "/default-avatar.svg") setSrc("/default-avatar.svg"); }}
      />
    </span>
  );
}

/**
 * The post editor (BOOKSTORE-PLAZA): two modes — free text, or share
 * a book with your own words on it. Used by the plaza's composer bar
 * (progressive disclosure: one line until tapped) and by the book
 * detail's 分享到广场 action (pre-set to the book). The book list is
 * the bookstore's own catalogue; the server re-checks everything.
 */
function PlazaComposerEditor({ account, authClient, initialBook = null, onPosted, onCancel }) {
  const [mode, setMode] = useState(initialBook ? "share" : "text");
  const [content, setContent] = useState("");
  const [book, setBook] = useState(initialBook);
  const [books, setBooks] = useState(null);
  const [booksFailed, setBooksFailed] = useState(false);
  const [bookQuery, setBookQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const length = [...content].length;
  const overLimit = length > 500;

  useEffect(() => {
    if (mode !== "share" || books !== null) return undefined;
    let live = true;
    fetchStoreBooks({ limit: 60 })
      .then((result) => { if (live) { setBooks(result.books); setBooksFailed(false); } })
      .catch(() => { if (live) { setBooks([]); setBooksFailed(true); } });
    return () => { live = false; };
  }, [mode, books]);

  const pickable = (books || []).filter((entry) => !bookQuery.trim()
    || entry.title.includes(bookQuery.trim())
    || String(entry.authorName || "").includes(bookQuery.trim()));

  const submit = async () => {
    if (busy || overLimit) return;
    if (!content.trim()) { setError("先写点什么，再发出来吧。"); return; }
    if (mode === "share" && !book) { setError("先选一本要分享的书。"); return; }
    setBusy(true);
    setError("");
    try {
      const post = await createPlazaPost({
        type: mode === "share" ? "book_share" : "free_text",
        content: content.trim(),
        bookId: mode === "share" ? book.id : undefined,
        getAccessToken: () => authClient.getAccessToken(),
      });
      onPosted?.(post);
    } catch (failure) {
      if (failure?.code === "auth-required") setError("登录状态过期了，重新登录后再发。");
      else setError(failure?.message || "没能发出去，请稍后再试。");
      setBusy(false);
    }
  };

  return (
    <div className="plaza-composer">
      <div className="plaza-composer-tabs" role="group" aria-label="发帖类型">
        <button
          type="button"
          className={mode === "text" ? "active" : ""}
          aria-pressed={mode === "text"}
          onClick={() => setMode("text")}
        >
          自由文字
        </button>
        <button
          type="button"
          className={mode === "share" ? "active" : ""}
          aria-pressed={mode === "share"}
          onClick={() => setMode("share")}
        >
          分享书籍
        </button>
      </div>
      {mode === "share" && (
        book ? (
          <div className="plaza-composer-book">
            <span className="plaza-composer-book-cover">
              <PublicationArtwork publication={book} genreId={book.genreId} />
            </span>
            <span className="plaza-composer-book-copy">
              <strong>《{book.title}》</strong>
              <small>{book.authorName} · {plazaLengthLabel(book)}</small>
            </span>
            <button type="button" className="small-link" onClick={() => setBook(null)}>更换</button>
          </div>
        ) : (
          <div className="plaza-composer-picker">
            <div className="store-search plaza-composer-search">
              <Icon name="search" size={16} />
              <input
                type="search"
                value={bookQuery}
                onChange={(event) => setBookQuery(event.target.value)}
                placeholder="从书城选一本书"
                aria-label="选择要分享的书"
              />
            </div>
            {books === null ? (
              <p className="plaza-note">正在打开书城…</p>
            ) : booksFailed ? (
              <p className="plaza-note">书城这次没能打开，你的书还在，不用担心。<button type="button" className="small-link" onClick={() => { setBooksFailed(false); setBooks(null); }}>再试一次</button></p>
            ) : pickable.length === 0 ? (
              <p className="plaza-note">书城里还没有能分享的书。</p>
            ) : (
              <ul className="plaza-composer-booklist da-scroll">
                {pickable.slice(0, 12).map((entry) => (
                  <li key={entry.id}>
                    <button type="button" onClick={() => setBook(entry)}>
                      <strong>《{entry.title}》</strong>
                      <small>{entry.authorName} · {plazaLengthLabel(entry)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      )}
      <textarea
        className="plaza-composer-input"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={mode === "share" ? "说说为什么想分享这本书…" : "说点什么，或聊聊正在走的世界…"}
        aria-label="帖子内容"
        rows={4}
        autoFocus
      />
      <div className="plaza-composer-foot">
        <span className={`plaza-composer-count ${overLimit ? "is-over" : length >= 480 ? "is-near" : ""}`}>
          {length} / 500
        </span>
        <span className="plaza-composer-actions">
          {onCancel && <Button variant="ghost" disabled={busy} onClick={onCancel}>取消</Button>}
          <Button disabled={busy || overLimit || !content.trim() || (mode === "share" && !book)} onClick={() => void submit()}>
            {busy ? "正在发布…" : "发布到广场"}
          </Button>
        </span>
      </div>
      {error && <div className="sw-inline-alert" role="alert">{error}</div>}
    </div>
  );
}

/** The flat comment thread under a post: oldest first, one level, no nesting. */
function PlazaCommentThread({ post, account, authClient, onOpenAccount, onCountChange }) {
  const [comments, setComments] = useState(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const viewerUid = account.user?.uid || "";

  useEffect(() => {
    let live = true;
    fetchPostComments({ postId: post.id })
      .then((result) => { if (live) setComments(result.comments); })
      .catch(() => { if (live) { setComments([]); setError("评论没能打开，请稍后再试。"); } });
    return () => { live = false; };
  }, [post.id]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    if (!account.user) { onOpenAccount(); return; }
    setBusy(true);
    setError("");
    try {
      const comment = await createPostComment({
        postId: post.id,
        content: text,
        getAccessToken: () => authClient.getAccessToken(),
      });
      setComments((current) => [...(current || []), comment]);
      setDraft("");
      onCountChange?.(1);
    } catch (failure) {
      if (failure?.code === "auth-required") onOpenAccount();
      else setError(failure?.message || "评论没能发出去，请稍后再试。");
    } finally { setBusy(false); }
  };

  const remove = async (comment) => {
    try {
      await deletePostComment({
        postId: post.id,
        commentId: comment.id,
        getAccessToken: () => authClient.getAccessToken(),
      });
      setComments((current) => (current || []).filter((entry) => entry.id !== comment.id));
      onCountChange?.(-1);
    } catch { setError("这条评论没能删掉，请稍后再试。"); }
  };

  return (
    <div className="plaza-thread">
      {comments === null && (
        <div className="da-skel-lines" role="status" aria-label="正在打开评论">
          <span className="da-skel da-skel--line" style={{ width: "88%" }} aria-hidden="true" />
          <span className="da-skel da-skel--line" style={{ width: "64%" }} aria-hidden="true" />
          <span className="da-skel da-skel--line" style={{ width: "79%" }} aria-hidden="true" />
        </div>
      )}
      {comments !== null && comments.length === 0 && (
        <p className="plaza-thread-empty"><img className="empty-row-art" src="/art/empty-comments-512.webp" alt="" loading="lazy" />暂无评论，来发表第一条看法吧。</p>
      )}
      {comments !== null && comments.length > 0 && (
        <ul className="plaza-thread-list">
          {comments.map((comment) => {
            const canDelete = viewerUid && (comment.authorUid === viewerUid || post.authorUid === viewerUid);
            return (
              <li key={comment.id} className="plaza-thread-row">
                <PersonPicture picture={comment.authorPicture} size={32} />
                <div className="plaza-thread-copy">
                  <div className="plaza-thread-head">
                    <strong>{comment.authorName}</strong>
                    {comment.official && <span className="plaza-byline-official">官方</span>}
                    <small>{postTimeFor(comment.createdAt)}</small>
                    {canDelete && (
                      <button type="button" className="plaza-thread-delete" onClick={() => void remove(comment)}>
                        删除
                      </button>
                    )}
                  </div>
                  <p>{comment.content}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="plaza-thread-error" role="alert">{error}</p>}
      <div className="plaza-thread-composer">
        <input
          type="text"
          value={draft}
          maxLength={300}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void send(); } }}
          placeholder={account.user ? "写下你的看法…" : "登录后参与评论"}
          aria-label="写评论"
        />
        <Button
          variant="secondary"
          disabled={busy || !draft.trim()}
          onClick={() => void send()}
        >
          发送
        </Button>
      </div>
    </div>
  );
}

/** The book card embedded in a share post: live while shelved, an honest placeholder once not. */
function PlazaPostBookCard({ book, onOpenDetail, onReadLine, onEnter }) {
  if (!book) return null;
  if (book.status !== "published") {
    return (
      <div className="plaza-post-book is-unavailable" aria-label="这本书已下架">
        <span className="plaza-post-book-cover is-unavailable" aria-hidden="true">
          <Icon name="lock" size={22} />
        </span>
        <span className="plaza-post-book-copy">
          <strong>《{book.title || "这本书"}》</strong>
          <small>{book.status === "deleted" ? "这本书已被作者删除。" : "该故事线已由作者下架或不可见。"}</small>
        </span>
      </div>
    );
  }
  const genre = genreById[book.genreId] || GENRES[0];
  const templateName = plazaTemplateNameFor(book) || genre.label;
  // DEVICE-FIX3 §54: the plaza book card shares the store card's
  // intro spec — the clause-bounded excerpt, not the raw synopsis.
  const intro = cardIntroExcerptFor(book);
  return (
    <div className="plaza-post-book">
      <button
        type="button"
        className="plaza-post-book-main"
        onClick={() => onOpenDetail(book)}
        aria-label={`查看《${book.title}》详情`}
      >
        <span className="plaza-post-book-cover">
          <PublicationArtwork publication={book} genreId={genre.id} />
        </span>
        <span className="plaza-post-book-copy">
          <strong>《{book.title}》</strong>
          {intro && <small className="plaza-post-book-intro">{intro}</small>}
          <small>{book.authorName} · {book.manual ? "作者手写" : templateName} · {plazaLengthLabel(book)}</small>
        </span>
        <Icon name="chevron" size={16} />
      </button>
      <div className="plaza-post-book-actions">
        <button type="button" onClick={() => onReadLine(book)}>读原作线</button>
        {!book.manual && <button type="button" onClick={() => onEnter(book)}>带化身进入</button>}
      </div>
    </div>
  );
}

function PlazaPostCard({ post, account, authClient, onOpenDetail, onReadLine, onEnter, onOpenProfile, onOpenAccount, onToast, onDeleted }) {
  const viewerUid = account.user?.uid || "";
  const own = Boolean(viewerUid) && post.authorUid === viewerUid;
  const [liked, setLiked] = useState(Boolean(post.viewerLiked));
  const [likeCount, setLikeCount] = useState(post.likeCount || 0);
  const [commentCount, setCommentCount] = useState(post.commentCount || 0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef(null);
  // A post menu that never closes on outside tap / Esc can stack up
  // across posts, so close it on either.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [content, setContent] = useState(post.content);
  const [edited, setEdited] = useState(Boolean(post.updatedAt) && post.updatedAt !== post.createdAt);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const toggleLike = async () => {
    if (!account.user) { onOpenAccount(); return; }
    const wasLiked = liked;
    const wasCount = likeCount;
    setLiked(!wasLiked);
    setLikeCount((count) => Math.max(0, count + (wasLiked ? -1 : 1)));
    try {
      const result = await togglePlazaPostLike({ id: post.id, getAccessToken: () => authClient.getAccessToken() });
      setLiked(Boolean(result.liked));
      setLikeCount(result.likeCount);
    } catch (failure) {
      setLiked(wasLiked);
      setLikeCount(wasCount);
      if (failure?.code === "auth-required") onOpenAccount();
    }
  };

  const report = async () => {
    if (!account.user) { onOpenAccount(); return; }
    setBusy(true);
    try {
      await reportPlazaPost({ id: post.id, getAccessToken: () => authClient.getAccessToken() });
      setNote("已举报，谢谢。举报累计到三人，这条帖子会自动隐藏等待核查。");
    } catch (failure) {
      setNote(failure?.message || "举报没能送出，请稍后再试。");
    } finally { setBusy(false); setMenuOpen(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deletePlazaPost({ id: post.id, getAccessToken: () => authClient.getAccessToken() });
      onDeleted?.(post.id);
      onToast?.("帖子已删除，书城里的书不受影响。");
    } catch {
      setNote("这条帖子没能删掉，请稍后再试。");
      setBusy(false);
      setConfirmingDelete(false);
    }
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      const updated = await updatePlazaPost({ id: post.id, content: draft, getAccessToken: () => authClient.getAccessToken() });
      if (updated) {
        setContent(updated.content);
        setEdited(Boolean(updated.updatedAt) && updated.updatedAt !== updated.createdAt);
      }
      setEditing(false);
      onToast?.("帖子已更新。");
    } catch (failure) {
      setNote(failure?.message || "没能保存，请稍后再试。");
    } finally { setBusy(false); }
  };

  const shareLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/plaza/post-${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      onToast?.("已复制帖子链接。");
    } catch {
      setNote(url);
    }
  };

  return (
    <article className="plaza-post" id={`plaza-post-${post.id}`}>
      <header className="plaza-post-head">
        <button
          type="button"
          className="plaza-post-person"
          onClick={() => post.authorUid && onOpenProfile?.(post.authorUid)}
          aria-label={`打开 ${post.authorName} 的主页`}
        >
          <PersonPicture picture={post.authorPicture} size={40} />
          <span className="plaza-post-person-copy">
            <span className="plaza-post-person-name">
              <strong>{post.authorName}</strong>
              {post.official && <span className="plaza-byline-official">官方</span>}
            </span>
            <small>
              {post.authorHandle ? `@${post.authorHandle} · ` : ""}{postTimeFor(post.createdAt)}{edited ? " · 已编辑" : ""}
            </small>
          </span>
        </button>
        <div className="plaza-post-menu-wrap" ref={menuWrapRef}>
          <button
            type="button"
            className="plaza-post-menu-button"
            aria-label="帖子操作"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name="dots" size={19} />
          </button>
          {menuOpen && (
            <div className="plaza-post-menu" role="menu">
              {own ? (
                <>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setConfirmingDelete(false); setDraft(content); setEditing(true); }}>
                    编辑该帖
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setEditing(false); setConfirmingDelete(true); }}>
                    删除该帖
                  </button>
                </>
              ) : (
                <button type="button" role="menuitem" disabled={busy} onClick={() => void report()}>
                  举报该帖
                </button>
              )}
            </div>
          )}
        </div>
      </header>
      {confirmingDelete && (
        <div className="plaza-post-confirm" role="alertdialog" aria-label="确认删除帖子">
          <span>删掉这条帖子？它分享的书在书城里不受影响。</span>
          <Button variant="secondary" disabled={busy} onClick={() => void remove()}>确认删除</Button>
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmingDelete(false)}>再想想</Button>
        </div>
      )}
      {editing && (
        <div className="plaza-post-edit">
          <textarea
            className="plaza-post-edit-input"
            value={draft}
            rows={4}
            maxLength={600}
            aria-label="编辑帖子正文"
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="plaza-post-edit-actions">
            <small>{[...draft].length}/500</small>
            <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>取消</Button>
            <Button variant="secondary" disabled={busy || !draft.trim()} onClick={() => void saveEdit()}>保存</Button>
          </div>
        </div>
      )}
      <p className="plaza-post-content">{content}</p>
      {post.type === "book_share" && (
        <PlazaPostBookCard
          book={post.book}
          onOpenDetail={onOpenDetail}
          onReadLine={onReadLine}
          onEnter={onEnter}
        />
      )}
      <footer className="plaza-post-actions">
        <button
          type="button"
          className={`plaza-post-action ${liked ? "is-liked" : ""}`}
          aria-pressed={liked}
          aria-label={liked ? "取消点赞" : "点赞"}
          onClick={() => void toggleLike()}
        >
          <Icon name="heart" size={18} />
          <span>{likeCount > 0 ? likeCount : "赞"}</span>
        </button>
        <button
          type="button"
          className="plaza-post-action"
          aria-expanded={threadOpen}
          onClick={() => setThreadOpen((open) => !open)}
        >
          <Icon name="chat" size={18} />
          <span>{commentCount > 0 ? commentCount : "评论"}</span>
        </button>
        <button type="button" className="plaza-post-action" onClick={() => void shareLink()}>
          <Icon name="share" size={18} />
          <span>分享链接</span>
        </button>
      </footer>
      {note && <p className="plaza-inline-note" role="status">{note}</p>}
      {threadOpen && (
        <PlazaCommentThread
          post={post}
          account={account}
          authClient={authClient}
          onOpenAccount={onOpenAccount}
          onCountChange={(delta) => setCommentCount((count) => Math.max(0, count + delta))}
        />
      )}
    </article>
  );
}

function PlazaFeed({ account, authClient, activeStory, stories, focusPostId = "", onNavigate, onOpenStory, onOpenDetail, onReadLine, onEnter, onOpenProfile, onOpenAccount, onToast }) {
  const [posts, setPosts] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [focusPost, setFocusPost] = useState(null);
  const [followingUids, setFollowingUids] = useState([]);
  const viewerUid = account.user?.uid || "";
  const getToken = useCallback(() => authClient?.getAccessToken(), [authClient]);
  useEffect(() => {
    if (!viewerUid || !authClient) { setFollowingUids([]); return undefined; }
    let live = true;
    fetchUserProfile({ uid: viewerUid, getAccessToken: () => authClient.getAccessToken() })
      .then((profile) => { if (live) setFollowingUids(Array.isArray(profile?.followingUids) ? profile.followingUids : []); })
      .catch(() => {});
    return () => { live = false; };
  }, [viewerUid, authClient]);

  const load = useCallback(async () => {
    const result = await fetchPlazaPosts({ getAccessToken: getToken, limit: 20 });
    setPosts(result.posts);
    setNextCursor(result.nextCursor);
    setOnlineCount(result.onlineCount);
  }, [getToken]);

  // The 60s tick must never silently drop pages the reader already
  // flipped to: once loadMore has run, the tick only merges the fresh
  // first page in front (dedupe by id) and leaves the cursor alone.
  const pagedRef = useRef(false);
  const refreshFeed = useCallback(async () => {
    const result = await fetchPlazaPosts({ getAccessToken: getToken, limit: 20 });
    setOnlineCount(result.onlineCount);
    if (pagedRef.current) {
      const freshIds = new Set((result.posts || []).map((post) => post.id));
      setPosts((current) => [...(result.posts || []), ...(current || []).filter((post) => !freshIds.has(post.id))]);
    } else {
      setPosts(result.posts);
      setNextCursor(result.nextCursor);
    }
  }, [getToken]);

  useEffect(() => {
    let live = true;
    setError("");
    load().catch(() => { if (live) { setPosts([]); setError("广场暂时没能打开，请稍后再试。"); } });
    // The presence count must not go stale while the plaza sits open:
    // refetch on a slow tick (which also freshens the list itself).
    const timer = window.setInterval(() => { void refreshFeed().catch(() => {}); }, 60_000);
    return () => { live = false; window.clearInterval(timer); };
  }, [load, refreshFeed, retry]);

  // A post permalink (#/plaza/post-<id>) pins its post above the
  // stream: the post itself, fetched on its own, so the link works
  // even when the post has scrolled out of the first page.
  useEffect(() => {
    if (!focusPostId) { setFocusPost(null); return undefined; }
    let live = true;
    fetchPlazaPost({ id: focusPostId, getAccessToken: getToken })
      .then((post) => { if (live) setFocusPost(post); })
      .catch(() => { if (live) setFocusPost(null); });
    return () => { live = false; };
  }, [focusPostId, getToken]);

  const publishable = useMemo(
    () => (stories || []).some((story) => plazaGateFor(story).publishable),
    [stories],
  );
  const followedPosts = useMemo(() => {
    if (!posts || followingUids.length === 0) return [];
    const followed = new Set(followingUids);
    return posts
      .filter((post) => post.authorUid && post.authorUid !== viewerUid && followed.has(post.authorUid))
      .slice(0, 6);
  }, [posts, followingUids, viewerUid]);
  const officialPost = useMemo(
    () => (posts || []).find((post) => post.official && post.type === "book_share" && post.book?.status === "published"),
    [posts],
  );

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchPlazaPosts({ getAccessToken: getToken, cursor: nextCursor, limit: 20 });
      setPosts((current) => {
        const seen = new Set((current || []).map((post) => post.id));
        return [...(current || []), ...(result.posts || []).filter((post) => !seen.has(post.id))];
      });
      pagedRef.current = true;
      setNextCursor(result.nextCursor);
    } catch { /* the button stays; a tap retries */ } finally { setLoadingMore(false); }
  };

  const handlePosted = (post) => {
    setComposerOpen(false);
    if (post) setPosts((current) => [post, ...(current || [])]);
    onToast?.("已发布到广场。");
  };

  const activeTotal = activeStory ? totalChaptersFor(activeStory) : 0;
  const activeChapter = activeStory ? Math.min(activeTotal, readerIndexFor(activeStory) + 1) : 0;
  const activeSerializing = activeStory
    ? storyLengthModeOf(activeStory) === "endless" && !isManuallyFinished(activeStory)
    : false;
  const streamPosts = (posts || []).filter((post) => !focusPost || post.id !== focusPost.id);
  return (
    <div className="page page-plaza page-enter">
      <div className="plaza-ambient-wrap">
        <ParticleField density="faint" />
        <header className="plaza-heading">
          <h1>广场</h1>
          {onlineCount >= 1 && (
            <span className="plaza-online" role="status">
              <span className="plaza-online-dot" aria-hidden="true" />
              {onlineCount} 人在线
            </span>
          )}
        </header>
        {/* The value line takes a formal seat on the front door
            (DESIGNER-QA #7, closed in §33): a cold visitor's first screen
            carries one sentence worth remembering. The explaining
            caption under it was deleted as text noise (DEVICE-FIX
            REQ-26) — the value line stands alone. */}
        <p className="plaza-value-line">这一次，<em>你是主角。</em></p>
      </div>

      {activeStory && (
        <button type="button" className="plaza-continue-card" onClick={() => onOpenStory(activeStory.id)}>
          <span className="plaza-continue-cover">
            {/* Single painting only (BUGHUNT-FIX, BH-04): the pair
                composition is for large faces — in this 54×72 thumb
                it tiled the same scene twice across a hard seam. */}
            <StoryCover story={activeStory} genreId={genreOf(activeStory).id} sources={coverSources(activeStory)?.slice(0, 1)} getAccessToken={() => authClient?.getAccessToken()} authSignal={account.status} />
          </span>
          <span className="plaza-continue-copy">
            <small>继续阅读</small>
            <strong>《{activeStory.title}》</strong>
            <span>{activeSerializing ? `连载中 · 已读到第 ${activeChapter} 章` : `已读到第 ${activeChapter} / ${activeTotal} 章`}</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
      )}

      {/* The composer (BOOKSTORE-PLAZA): progressive disclosure — one
          quiet line until tapped, then the full editor. Signing in is
          asked for at the tap, not before. */}
      {composerOpen ? (
        <PlazaComposerEditor
          account={account}
          authClient={authClient}
          onPosted={handlePosted}
          onCancel={() => setComposerOpen(false)}
        />
      ) : (
        <button
          type="button"
          className="plaza-composer-bar"
          onClick={() => (account.user ? setComposerOpen(true) : onOpenAccount())}
        >
          <span className="plaza-composer-bar-text">说点什么，或分享一本书…</span>
          <Icon name="pencil" size={17} />
        </button>
      )}

      {followedPosts.length > 0 && (
        <section className="plaza-following" aria-label="关注动态">
          <div className="plaza-feed-heading">
            <h2>关注动态</h2>
          </div>
          <div className="plaza-following-row da-fade-x">
            {followedPosts.map((post) => (
              <button
                type="button"
                key={post.id}
                className="plaza-following-card"
                onClick={() => document.getElementById(`plaza-post-${post.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
              >
                <span className="plaza-following-head">
                  <PersonPicture picture={post.authorPicture} size={28} />
                  <span className="plaza-following-author">{post.authorName}</span>
                </span>
                <strong>{post.type === "book_share" && post.book?.title ? `分享了《${post.book.title}》` : post.content.slice(0, 42)}</strong>
                <small>{postTimeFor(post.createdAt)}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {officialPost && (
        <button type="button" className="plaza-mine-row" onClick={() => onOpenDetail(officialPost.book)}>
          <Icon name="book" size={20} />
          <span>
            <strong>先看看一条走完的线长什么样</strong>
            <small>官方示例线 · 完整一季，可以直接读原作</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
      )}

      <button type="button" className="plaza-mine-row" onClick={() => onNavigate("home")}>
        <Icon name="book" size={20} />
        <span>
          <strong>我的世界</strong>
          <small>{activeStory ? <>正在读《{activeStory.title}》 · {activeSerializing ? <>连载中 · <span className="mine-row-tail">第 {activeChapter} 章</span></> : <span className="mine-row-tail">第 {activeChapter} / {activeTotal} 章</span>}</> : "你的书架、化身与草稿都在这里"}</small>
        </span>
        <Icon name="chevron" size={16} />
      </button>

      {publishable ? (
        <section className="plaza-publish-card">
          <div>
            <strong>把你的故事线上架到书城</strong>
            <p>走完的故事线可以上架；无限连载的线连载中就能上架，新章会自己跟上。上架后也能分享到广场。</p>
          </div>
          <Button onClick={() => onNavigate("plaza-publish")}>上架 <Icon name="arrow" size={15} /></Button>
        </section>
      ) : (
        <button type="button" className="plaza-mine-row" onClick={() => onNavigate("plaza-publish")}>
          <Icon name="plus" size={20} />
          <span>
            <strong>把你的故事线上架到书城</strong>
            <small>走完一季、长线，或连载中上架</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
      )}

      <div className="plaza-feed-heading">
        <h2>最新动态</h2>
        <span>全站一条时间流，最新在前</span>
      </div>

      {error && (
        <div className="plaza-empty" role="alert">
          <p>{error}</p>
          <Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>再试一次</Button>
        </div>
      )}
      {posts === null && !error && (
        <div className="da-skel-feed" role="status" aria-label="正在打开广场">
          <div className="da-skel-post" aria-hidden="true">
            <div className="da-skel-rowline">
              <span className="da-skel da-skel--circle" style={{ width: 38, height: 38 }} />
              <span className="da-skel da-skel--line" style={{ width: "36%" }} />
            </div>
            <span className="da-skel da-skel--line" style={{ width: "94%" }} />
            <span className="da-skel da-skel--line" style={{ width: "71%" }} />
            <span className="da-skel da-skel--media" style={{ height: 118 }} />
          </div>
          <div className="da-skel-post" aria-hidden="true">
            <div className="da-skel-rowline">
              <span className="da-skel da-skel--circle" style={{ width: 38, height: 38 }} />
              <span className="da-skel da-skel--line" style={{ width: "28%" }} />
            </div>
            <span className="da-skel da-skel--line" style={{ width: "88%" }} />
            <span className="da-skel da-skel--line" style={{ width: "57%" }} />
          </div>
        </div>
      )}
      {focusPost && (
        <PlazaPostCard
          key={`focus-${focusPost.id}`}
          post={focusPost}
          account={account}
          authClient={authClient}
          onOpenDetail={onOpenDetail}
          onReadLine={onReadLine}
          onEnter={onEnter}
          onOpenProfile={onOpenProfile}
          onOpenAccount={onOpenAccount}
          onToast={onToast}
          onDeleted={() => setFocusPost(null)}
        />
      )}
      {posts !== null && posts.length === 0 && !focusPost && !error && (
        <div className="plaza-empty" role="status">
          <img className="empty-art" src="/art/empty-plaza-512.webp" alt="" loading="lazy" />
          <h3>广场还没有人发帖</h3>
          <p>畅所欲言，或把你在书城读到的好书分享到广场，点亮第一条动态。</p>
          <Button
            variant="secondary"
            icon="arrow"
            onClick={() => (account.user ? setComposerOpen(true) : onOpenAccount())}
          >
            发一条动态
          </Button>
        </div>
      )}
      {posts !== null && streamPosts.length > 0 && (
        <div className="plaza-feed-list">
          {streamPosts.map((post) => (
            <PlazaPostCard
              key={post.id}
              post={post}
              account={account}
              authClient={authClient}
              onOpenDetail={onOpenDetail}
              onReadLine={onReadLine}
              onEnter={onEnter}
              onOpenProfile={onOpenProfile}
              onOpenAccount={onOpenAccount}
              onToast={onToast}
              onDeleted={(postId) => setPosts((current) => (current || []).filter((entry) => entry.id !== postId))}
            />
          ))}
        </div>
      )}
      {nextCursor && (
        <div className="plaza-more">
          <Button variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "正在加载…" : "加载更多"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Display stars for a value: whole filled stars, the precise number always rides beside it as text. */
function RatingStars({ value = 0 }) {
  const full = Math.round(Math.min(5, Math.max(0, Number(value) || 0)));
  return (
    <span className="rating-stars" aria-hidden="true">
      {"★".repeat(full)}
      <span className="rating-stars-off">{"★".repeat(5 - full)}</span>
    </span>
  );
}

/**
 * The book's rating panel (RATINGS): the honest average + count, the
 * review list (newest first), and the signed-in reader's own rating
 * form — one rating per reader, re-posting edits it, deleting
 * removes it. The author of the book gets an explanation instead of
 * a form (the server hard-rejects self-rating anyway); a signed-out
 * reader gets the sign-in door. No average is ever printed for a
 * book nobody has rated.
 */
function BookRatingsSection({ bookId, account, authClient, onOpenAccount, onOpenProfile }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [draftStars, setDraftStars] = useState(0);
  const [draftText, setDraftText] = useState("");
  const [seededFor, setSeededFor] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const token = () => authClient.getAccessToken();

  const load = useCallback(async () => {
    try {
      const payload = await fetchBookRatings({
        id: bookId,
        getAccessToken: account.user ? token : undefined,
      });
      setData(payload);
      setError("");
      return payload;
    } catch {
      setError("评价暂时没能打开，请稍后再试。");
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, account.user]);

  useEffect(() => { void load(); }, [load]);

  // Prefill the form from my existing rating once per server copy of
  // it — an edit in progress is never overwritten by a later refetch.
  useEffect(() => {
    const mine = data?.viewerRating;
    const seed = mine ? `${mine.id}:${mine.updatedAt}` : "";
    if (seed && seed !== seededFor) {
      setSeededFor(seed);
      setDraftStars(mine.stars);
      setDraftText(mine.text || "");
    }
    if (!mine && seededFor) {
      setSeededFor("");
      setDraftStars(0);
      setDraftText("");
    }
  }, [data, seededFor]);

  const submit = async () => {
    if (!account.user) { onOpenAccount(); return; }
    if (!draftStars) { setFormError("先点一下星星，给这本书打个分吧。"); return; }
    setBusy(true);
    setFormError("");
    try {
      await rateBook({ id: bookId, stars: draftStars, text: draftText, getAccessToken: token });
      await load();
    } catch (failure) {
      if (failure?.code === "auth-required") onOpenAccount();
      else setFormError(failure?.message || "评价没能保存，请稍后再试。");
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    setFormError("");
    try {
      await deleteBookRating({ id: bookId, getAccessToken: token });
      setSeededFor("");
      setDraftStars(0);
      setDraftText("");
      await load();
    } catch (failure) {
      if (failure?.code === "auth-required") onOpenAccount();
      else setFormError(failure?.message || "评价没能删掉，请稍后再试。");
    } finally { setBusy(false); }
  };

  const loadMore = async () => {
    if (!data?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchBookRatings({
        id: bookId,
        cursor: data.nextCursor,
        getAccessToken: account.user ? token : undefined,
      });
      setData((current) => current ? { ...current, ratings: [...current.ratings, ...page.ratings], nextCursor: page.nextCursor } : current);
    } catch { setError("更多评价没能打开，请稍后再试。"); } finally { setLoadingMore(false); }
  };

  const mine = data?.viewerRating || null;
  const draftLength = [...draftText].length;
  // DETAIL-FIX2: the author's own empty state is two text lines and
  // no form — the panel hugs that content (is-compact) instead of
  // holding the full stage the rating form needs.
  const idleEmpty = Boolean(data && data.ratingCount === 0 && data.viewerIsAuthor);
  return (
    <section className={`plaza-panel book-ratings${idleEmpty ? " is-compact" : ""}`} aria-label="读者评价">
      <div className="plaza-panel-heading">
        <h2>读者评价</h2>
        {data && data.ratingCount > 0 && <span className="book-ratings-count">{data.ratingCount} 条评价</span>}
      </div>
      {!data && !error && (
        <div className="da-skel-lines" role="status" aria-label="正在打开评价">
          <span className="da-skel da-skel--line" style={{ width: "42%" }} aria-hidden="true" />
          <span className="da-skel da-skel--line" style={{ width: "91%" }} aria-hidden="true" />
          <span className="da-skel da-skel--line" style={{ width: "68%" }} aria-hidden="true" />
        </div>
      )}
      {error && <p className="plaza-thread-error" role="alert">{error}</p>}
      {data && (
        <>
          {data.ratingCount > 0 ? (
            <div className="book-ratings-summary">
              <strong className="book-ratings-average">{ratingAverageText(data)}</strong>
              <RatingStars value={data.ratingAverage} />
              <span className="book-ratings-summary-note">读者打分</span>
            </div>
          ) : (
            <p className="book-ratings-empty">还没有人评价这本书——读过的话，来打第一个分吧。</p>
          )}

          {data.viewerIsAuthor ? (
            <p className="plaza-note book-ratings-own-note">这是你的书，不能给自己评分；读者的评价会记在这里。</p>
          ) : !account.user ? (
            <button type="button" className="book-ratings-signin" onClick={onOpenAccount}>
              登录后评价这本书
            </button>
          ) : (
            <div className="book-ratings-form">
              <div className="book-ratings-picker" role="group" aria-label="给这本书打分">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`book-ratings-pick ${value <= draftStars ? "is-on" : ""}`}
                    aria-label={`打 ${value} 星`}
                    aria-pressed={draftStars === value}
                    onClick={() => setDraftStars(value)}
                  >
                    ★
                  </button>
                ))}
                <span className="book-ratings-pick-note">{draftStars ? `${draftStars} 星` : "点星打分"}</span>
              </div>
              <textarea
                className="plaza-composer-input book-ratings-input"
                value={draftText}
                maxLength={300}
                rows={3}
                onChange={(event) => setDraftText(event.target.value)}
                placeholder="写点读后感（可不写）"
                aria-label="写评价"
              />
              <div className="book-ratings-form-foot">
                <span className={`plaza-composer-count ${draftLength > 270 ? "is-near" : ""}`}>{draftLength} / 300</span>
                <span className="book-ratings-actions">
                  {mine && (
                    <button type="button" className="plaza-thread-delete" disabled={busy} onClick={() => void remove()}>
                      删除我的评价
                    </button>
                  )}
                  <Button variant="secondary" disabled={busy || !draftStars} onClick={() => void submit()}>
                    {mine ? "保存修改" : "发表评价"}
                  </Button>
                </span>
              </div>
              {formError && <p className="plaza-thread-error" role="alert">{formError}</p>}
            </div>
          )}

          {data.ratings.length > 0 && (
            <ul className="book-ratings-list">
              {data.ratings.map((rating) => (
                <li key={rating.id} className="book-ratings-row">
                  {onOpenProfile && rating.authorUid ? (
                    <button
                      type="button"
                      className="book-ratings-face"
                      onClick={() => onOpenProfile(rating.authorUid)}
                      aria-label={`打开 ${rating.authorName} 的主页`}
                    >
                      <PersonPicture picture={rating.authorPicture} size={36} />
                    </button>
                  ) : (
                    <PersonPicture picture={rating.authorPicture} size={36} />
                  )}
                  <div className="book-ratings-copy">
                    <div className="book-ratings-head">
                      <strong>{rating.authorName}</strong>
                      {rating.authorHandle && <span className="book-ratings-handle">@{rating.authorHandle}</span>}
                      {rating.official && <span className="plaza-byline-official">官方</span>}
                      <span className="book-ratings-row-stars"><RatingStars value={rating.stars} /></span>
                      <small>{postTimeFor(rating.createdAt)}{rating.edited ? " · 已编辑" : ""}</small>
                    </div>
                    {rating.text && <p>{rating.text}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data.nextCursor && (
            <button type="button" className="book-ratings-more" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? "正在打开…" : "更多评价"}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function PlazaDetail({ id, account, authClient, stories = [], onNavigate, onBack, backLabel = "返回广场", onReadLine, onEnter, onOpenAccount, onToast, onOpenProfile, onOpenBook }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const goBack = onBack || (() => onNavigate("plaza"));
  const own = useMemo(() => plazaMineIds().has(id), [id]);
  // The fusion card's honest state against the reader's own shelf —
  // the same resolution the merge page runs (fusion.js).
  const fusionEntry = useMemo(
    () => plazaFusionEntryFor({ stories, publicationId: id, mine: plazaMine() }),
    [stories, id],
  );
  // REQ-55: this device's saved place in THIS book, read from the
  // same reading-locations record the reader resumes from (keys are
  // `public:plaza-line-<id>:<chapterIndex>:<hash>`). null = never
  // opened here; otherwise the chapter index of the latest saved
  // place. Storage trouble reads as "never opened", never as a crash.
  // A hook, so it lives up here with the others — above the loading
  // and error early returns below.
  const readProgress = useMemo(() => {
    try {
      const raw = globalThis.localStorage?.getItem(READING_LOCATION_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const locations = Array.isArray(parsed?.locations) ? parsed.locations : [];
      const prefix = `public:plaza-line-${id}:`;
      const mine = locations.filter(
        (entry) => typeof entry?.key === "string" && entry.key.startsWith(prefix),
      );
      if (!mine.length) return null;
      const chapterIndex = Number(mine[mine.length - 1].key.slice(prefix.length).split(":")[0]);
      return Number.isInteger(chapterIndex) && chapterIndex >= 0 ? chapterIndex : 0;
    } catch { return null; }
  }, [id]);
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
        <button type="button" className="back-link" onClick={goBack}>
          <Icon name="chevron" size={15} className="rotate-180" /> {backLabel}
        </button>
        <div className="plaza-empty" role="alert">
          <h3>{error}</h3>
          <Button variant="secondary" onClick={goBack}>回去看看</Button>
        </div>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="page page-plaza page-enter">
        <button type="button" className="back-link" onClick={goBack}>
          <Icon name="chevron" size={15} className="rotate-180" /> {backLabel}
        </button>
        <p className="plaza-loading" role="status">正在打开这条故事线…</p>
      </div>
    );
  }
  const genre = genreById[detail.genreId] || GENRES[0];
  const templateName = plazaTemplateNameFor(detail) || genre.label;
  // The composed public world outline (§40 ④); falls back to the
  // detail's stored copy when the server baked one in at publish or
  // refresh time — same composer either way, so the two never drift.
  const worldIntro = detail.worldIntro && detail.worldIntroVersion === WORLD_INTRO_VERSION
    ? detail.worldIntro
    : plazaWorldIntroFor(detail, templateName);
  const beats = Array.isArray(detail.beats) ? detail.beats : [];
  const scrollToBeats = () => {
    document.getElementById("plaza-detail-beats")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
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
      onToast("已下架，书城里不再显示这本书。");
      onNavigate("store");
    } catch {
      setNote("下架没能完成，请稍后再试。");
      setBusy(false);
    }
  };
  const openShare = () => {
    if (!account.user) { onOpenAccount(); return; }
    setShareOpen(true);
  };
  const handleShared = (post) => {
    setShareOpen(false);
    onToast("已分享到广场。");
    if (post?.id) onNavigate("plaza", { postId: post.id });
  };
  return (
    <div className="page page-plaza page-enter">
      {/* SALT-3 cover ambience: a blurred copy of this book's own
          artwork laid behind the first screen, so the glass panels
          below refract the cover's colours. CSS confines the effect
          to the black/white themes and hides the layer elsewhere. */}
      <span className="detail-ambience" aria-hidden="true">
        <PublicationArtwork publication={detail} genreId={genre.id} eager />
      </span>
      <div className="plaza-detail-top">
        <button type="button" className="back-link" onClick={goBack}>
          <Icon name="chevron" size={15} className="rotate-180" /> {backLabel}
        </button>
        {detail.manual && <span className="plaza-manual-note">作者手写</span>}
      </div>

      <section className="plaza-detail-cover">
        <PublicationArtwork publication={detail} genreId={genre.id} eager />
        <span className="plaza-cover-shade" aria-hidden="true" />
        <div className="plaza-detail-cover-copy">
          <h1 className={`is-${plazaTitleTierFor(detail.title)}`}>《{detail.title}》</h1>
          <p>{detail.manual
            ? <>{shelfById(detail.shelfId)?.name ? `${shelfById(detail.shelfId).name} · ` : ""}作者手写 · {plazaLengthLabel(detail)} · {plazaLineStatusFor(detail) === "serializing" ? "连载中" : "已完结"} · 作者 {detail.authorName}</>
            : <>{detail.worldName} × {templateName} · {plazaLengthLabel(detail)} · {plazaLineStatusFor(detail) === "serializing" ? "连载中" : "已完结"} · 作者 {detail.authorName}</>} · 阅读量 {countTextFor(detail.readCount)}</p>
          {/* READER-POLISH2 (REQ-54): the one place the read-only
              nature of the original line is stated — the detail
              page's status area, once. The reader itself stays
              silent about it. */}
          <p className="plaza-detail-readonly">只读版本 · 不会改变原作</p>
          {detail.merged && Array.isArray(detail.sourceTitles) && detail.sourceTitles.length >= 2 && (
            <span className="plaza-badge is-fused">由{detail.sourceTitles.map((title) => `《${title}》`).join("×")}融合而来</span>
          )}
          {detail.official && <span className="plaza-badge is-official">官方示例 · 织界官方走完的完整故事线</span>}
          {/* REQ-55: the header carries the rating as ONE summary
              line only — stars, the average, the count. The full
              ratings section (form + list) lives at the foot of the
              page: a first-time visitor meets the book first and
              rates it after. The numbers ride the detail record
              itself, so this line costs no extra request. */}
          <p className="plaza-detail-rating">
            {ratingAverageText(detail) ? (
              <>
                <RatingStars value={detail.ratingAverage} />
                <strong>{ratingAverageText(detail)}</strong>
                <span>{detail.ratingCount} 条评价</span>
              </>
            ) : (
              <span>暂无评价</span>
            )}
          </p>
        </div>
      </section>

      {/* REQ-55: the reading entry group hugs the header — one
          primary button, one row of quiet secondary actions. The
          label follows this device's saved place in the book (the
          same reading-locations record the reader resumes from), so
          the detail and the reader's cover page agree on 开始/继续. */}
      <section className="plaza-panel plaza-entry-panel" aria-label="阅读入口">
        <Button variant="primary" className="plaza-entry-read" onClick={() => onReadLine(detail)}>
          {readProgress === null
            ? "开始阅读"
            : readProgress > 0
              ? `继续阅读 · 第 ${readProgress + 1} 章`
              : "继续阅读"}
        </Button>
        <div className="plaza-entry-row">
          {!detail.manual && beats.length > 0 && (
            <button type="button" className="plaza-entry-action" onClick={scrollToBeats}>
              <Icon name="menu" size={16} /> 目录
            </button>
          )}
          {!detail.manual && (
            <button type="button" className="plaza-entry-action" onClick={() => onEnter(detail)}>
              <Icon name="user" size={16} /> 化身进入
            </button>
          )}
          {!detail.manual && (
            <button
              type="button"
              className={`plaza-entry-action${fusionEntry.state === "no-line" ? " is-muted" : ""}`}
              onClick={() => (fusionEntry.state === "no-line"
                ? onNavigate("forge")
                : onNavigate("merge", { publicationId: detail.id }))}
            >
              <Icon name="git" size={16} /> 合流
            </button>
          )}
          <button type="button" className="plaza-entry-action" onClick={openShare}>
            <Icon name="share" size={16} /> 分享
          </button>
        </div>
        {detail.manual ? (
          <p className="plaza-note">这本书是作者自己写的，没有化身世界可以进入，也不能合流——它就是一本拿来读的书。</p>
        ) : (
          <p className="plaza-note">读原作不消耗你的生成额度 · 化身进入与合流的新章节会消耗你的生成额度</p>
        )}
      </section>

      {detail.synopsis && (
        <section className="plaza-panel">
          <div className="plaza-panel-heading">
            <h2>本书简介</h2>
          </div>
          <p className="plaza-prose">{detail.synopsis}</p>
        </section>
      )}

      {!detail.manual && (
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
          {detail.avatar?.appearance && <small>化身设定：{detail.avatar.appearance}</small>}
        </div>
      </section>
      )}

      {!detail.manual && (
      <>
      <section className="plaza-panel plaza-world-intro">
        <div className="plaza-panel-heading">
          <h2>世界设定</h2>
        </div>
        {/* §40 ④: the public world setting is a composed outline in
            plain words — 世界背景 / 核心规则 / 主角与主线 — never the
            raw engine premise (which could stuff the book's title in
            as a sentence subject and leak engine vocabulary). The
            脱敏 explainer that used to tail this panel was deleted as
            text noise (DEVICE-FIX REQ-26): the outline stands alone. */}
        <h3 className="plaza-intro-head">世界背景</h3>
        <p className="plaza-prose">{worldIntro.background}</p>
        {worldIntro.rules.length > 0 && (
          <>
            <h3 className="plaza-intro-head">核心规则</h3>
            <ul className="plaza-intro-rules">
              {worldIntro.rules.map((rule) => <li key={rule}>{rule}</li>)}
            </ul>
          </>
        )}
        <h3 className="plaza-intro-head">主角与主线</h3>
        <p className="plaza-prose">{worldIntro.thread}</p>
      </section>

      {/* 来源 (REQ-53): a fused book names the lines it was fused from.
          Live sources open their own detail; a source that left the
          shelf shows 已下架 and never becomes a dead link; the
          publisher's own unpublished lines list by title and author
          only. Ordinary books never render this section. Placement
          follows the REQ-55 order: after 世界设定， before 主线节拍. */}
      {detail.merged && detailSourcesFor(detail).length > 0 && (
        <section className="plaza-panel plaza-sources-panel">
          <h2>来源</h2>
          <p className="plaza-sources-note">这本书由下面这些故事线合流而成。</p>
          <div className="plaza-sources-list">
            {detailSourcesFor(detail).map((source) => {
              const cover = (
                <span className="plaza-source-thumb">
                  <PublicationArtwork publication={source} genreId={source.genreId || detail.genreId} />
                </span>
              );
              const copy = (
                <span className="plaza-source-copy">
                  <b>《{source.title}》</b>
                  {source.authorName && (
                    <small>{source.authorName}{source.authorHandle ? ` · @${source.authorHandle}` : ""}</small>
                  )}
                </span>
              );
              return source.state === "live" && onOpenBook ? (
                <button
                  type="button"
                  key={source.publicationId}
                  className="plaza-source-row is-link"
                  onClick={() => onOpenBook(source.publicationId)}
                >
                  {cover}
                  {copy}
                  <Icon name="chevron" size={15} />
                </button>
              ) : (
                <div key={source.publicationId || source.title} className="plaza-source-row">
                  {cover}
                  {copy}
                  {source.state === "gone" && <span className="plaza-source-gone">已下架</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="plaza-panel" id="plaza-detail-beats">
        <div className="plaza-panel-heading">
          <h2>主线节拍</h2>
        </div>
        <ol className="plaza-beats">
          {beats.slice(0, 4).map((beat) => {
            const beatTitle = chapterTitleTextFor(beat.title);
            return (
              <li key={beat.chapter}>
                <span className="plaza-beat-dot" aria-hidden="true" />
                <span>第 {beat.chapter} 章</span>
                {beatTitle && <strong>{beatTitle}</strong>}
              </li>
            );
          })}
        </ol>
        {beats.length > 4 && <small className="plaza-note">其余 {beats.length - 4} 章节拍，进入后逐步展开</small>}
      </section>
      </>
      )}

      {/* Ratings (RATINGS, moved by REQ-55): average + count +
          review list + the viewer's own rating form, hung on the
          book — at the FOOT of the page, after the book has had its
          say. The header above carries only the one-line summary. */}
      <BookRatingsSection
        bookId={detail.id}
        account={account}
        authClient={authClient}
        onOpenAccount={onOpenAccount}
        onOpenProfile={onOpenProfile}
      />

      {shareOpen && (
        <ReadingDialog title="分享到广场" onClose={() => setShareOpen(false)}>
          <PlazaComposerEditor
            account={account}
            authClient={authClient}
            initialBook={detail}
            onPosted={handleShared}
            onCancel={() => setShareOpen(false)}
          />
        </ReadingDialog>
      )}

      {note && <p className="plaza-inline-note" role="status">{note}</p>}
      {own ? (
        <div className="plaza-owner-row">
          {confirmingWithdraw ? (
            <>
              <span>下架后书城不再显示这本书，广场上分享过它的帖子会显示已下架；本地原作不受影响。</span>
              <Button variant="secondary" disabled={busy} onClick={() => void withdraw()}>确认下架</Button>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirmingWithdraw(false)}>再想想</Button>
            </>
          ) : (
            <>
              <span>这是你上架的书。</span>
              <Button variant="ghost" onClick={() => setConfirmingWithdraw(true)}>下架</Button>
            </>
          )}
        </div>
      ) : (
        <button type="button" className="plaza-report" disabled={busy} onClick={() => void report()}>
          内容有问题？举报这本书
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

/**
 * The picture crop step (PHONE-FIX §37): after picking a file, the
 * reader frames the square themselves — drag to position, slider to
 * zoom — inside a viewport whose inscribed circle is dimmed outside,
 * so what the round avatar will show is exactly what they see. The
 * small round preview at the slider repeats the same transform.
 * Confirming hands the chosen source rect to
 * bitmapRegionToSquareJpeg; cancelling discards everything.
 *
 * DEVICE-FIX REQ-19 parameterised the same skeleton for the profile
 * banner: shape="banner" swaps the square viewport for a 3:1 frame
 * (rectangular mask, wide preview) and the confirm rect becomes
 * `{ cx, cy, width, height }` (the circle path also carries
 * `side = width`, so the square consumer is untouched).
 */
function PictureCropper({ bitmap, url, busy, onCancel, onConfirm, shape = "circle" }) {
  const isBanner = shape === "banner";
  const viewRef = useRef(null);
  const [viewSize, setViewSize] = useState(280);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  useEffect(() => {
    const measure = () => {
      const rect = viewRef.current?.getBoundingClientRect();
      if (rect?.width) setViewSize(rect.width);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const iw = bitmap.width;
  const ih = bitmap.height;
  const viewW = viewSize;
  const viewH = viewSize / (isBanner ? 3 : 1);
  const baseScale = Math.max(viewW / iw, viewH / ih);
  const scale = baseScale * zoom;
  const dispW = iw * scale;
  const dispH = ih * scale;
  const clampOffset = (next, forZoom = zoom) => {
    const s = baseScale * forZoom;
    const maxX = Math.max(0, (iw * s - viewW) / 2);
    const maxY = Math.max(0, (ih * s - viewH) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };
  const onPointerDown = (event) => {
    if (busy) return;
    dragRef.current = { id: event.pointerId, sx: event.clientX, sy: event.clientY, ox: offset.x, oy: offset.y };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    setOffset(clampOffset({ x: drag.ox + event.clientX - drag.sx, y: drag.oy + event.clientY - drag.sy }));
  };
  const onPointerEnd = () => { dragRef.current = null; };
  const confirm = () => {
    const cropW = viewW / scale;
    const cropH = viewH / scale;
    const cx = Math.min(iw - cropW, Math.max(0, iw / 2 - offset.x / scale - cropW / 2));
    const cy = Math.min(ih - cropH, Math.max(0, ih / 2 - offset.y / scale - cropH / 2));
    onConfirm({ cx, cy, side: cropW, width: cropW, height: cropH });
  };
  const previewRatio = (isBanner ? 92 : 46) / viewSize;
  return (
    <div className="profile-crop">
      <div
        className={`profile-crop-view${isBanner ? " is-banner" : ""}`}
        ref={viewRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <img
          src={url}
          alt=""
          draggable={false}
          style={{
            width: dispW,
            height: dispH,
            transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
          }}
        />
        {isBanner
          ? <span className="profile-crop-frame" aria-hidden="true" />
          : <span className="profile-crop-circle" aria-hidden="true" />}
      </div>
      <div className="profile-crop-controls">
        <span className={`profile-crop-preview${isBanner ? " is-banner" : ""}`} aria-hidden="true">
          <img
            src={url}
            alt=""
            draggable={false}
            style={{
              width: dispW * previewRatio,
              height: dispH * previewRatio,
              transform: `translate(-50%, -50%) translate(${offset.x * previewRatio}px, ${offset.y * previewRatio}px)`,
            }}
          />
        </span>
        <input
          type="range"
          min="1"
          max="3"
          step="0.01"
          value={zoom}
          disabled={busy}
          aria-label="缩放"
          onChange={(event) => {
            const next = Number(event.target.value);
            setZoom(next);
            setOffset((current) => clampOffset(current, next));
          }}
        />
      </div>
      <p className="profile-crop-hint">{isBanner ? "拖动调整位置，框里就是头图最终的样子。" : "拖动调整位置，圆圈里就是头像最终的样子。"}</p>
      <div className="profile-crop-actions">
        <button type="button" onClick={onCancel} disabled={busy}>取消</button>
        <button type="button" className="is-primary" onClick={confirm} disabled={busy}>
          {busy ? "上传中…" : "使用这张"}
        </button>
      </div>
    </div>
  );
}

function EditProfileSheet({ profile, getToken, onClose, onSaved }) {
  const editable = profile.editable || {};
  // The name field starts from what the owner actually stored
  // (editable), never from the resolved public name — pre-filling the
  // fallback would silently save the avatar's name (or, before the
  // email guard, the account email) as a deliberate display name.
  const [displayName, setDisplayName] = useState(editable.displayName || "");
  const [bio, setBio] = useState(editable.bio || "");
  const bioCount = [...bio].length;
  const bioOverLimit = bioCount > 120;
  const [handle, setHandle] = useState(editable.handle || "");
  const [handleState, setHandleState] = useState(null);
  // USERNAME-IMMUTABLE (2026-10-28 user rule): the @ID is fixed once
  // it exists — the login name for username accounts (which the
  // editable block never carried, so the field used to open blank and
  // invite a divergent claim), the claimed handle for the rest. The
  // resolved profile.handle is the effective @ID: when it is set, the
  // field is not rendered at all (DEVICE-FIX REQ-24) and saves stop
  // sending handle (the server refuses a differing value with 400
  // regardless).
  const lockedHandle = profile.handle || "";
  const idLocked = Boolean(lockedHandle);
  const [busy, setBusy] = useState(false);
  const [pictureBusy, setPictureBusy] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  // A picked picture waits here (decoded bitmap + object URL) while
  // the reader frames it in the crop step; nothing is uploaded until
  // they confirm the crop (§37).
  const [crop, setCrop] = useState(null);
  const cropRef = useRef(null);
  cropRef.current = crop;
  // The banner crop (REQ-19) keeps its own pending bitmap, disposed
  // the same way when the sheet goes away mid-crop.
  const [bannerCrop, setBannerCrop] = useState(null);
  const bannerCropRef = useRef(null);
  bannerCropRef.current = bannerCrop;
  const bannerFileRef = useRef(null);
  useEffect(() => () => {
    for (const pending of [cropRef.current, bannerCropRef.current]) {
      if (pending) {
        pending.bitmap.close?.();
        URL.revokeObjectURL(pending.url);
      }
    }
  }, []);
  // DEVICE-FIX2 (REQ-27): the sheet is a DRAFT. Picture kind picks,
  // cropped uploads and the banner reset used to write through the
  // moment they were tapped, so closing the sheet without 保存 still
  // changed the profile. Now every control only stages a local value
  // (a cropped upload waits as its processed payload, never sent);
  // save() is the single write path and closing discards everything.
  const [stagedPictureKind, setStagedPictureKind] = useState(null);
  const [stagedPictureUpload, setStagedPictureUpload] = useState(null);
  const [stagedBannerUpload, setStagedBannerUpload] = useState(null);
  const [stagedBannerReset, setStagedBannerReset] = useState(false);
  const pictureKind = profile.picture?.kind || "default";
  // What the preview must show: the staged state when there is one,
  // the stored state otherwise.
  const effectivePictureKind = stagedPictureUpload ? "upload" : (stagedPictureKind || pictureKind);
  const pictureStateLabel = effectivePictureKind === "upload" ? "自定义图片" : effectivePictureKind === "avatar" ? "化身立绘" : "默认头像";
  const picturePreviewUrl = stagedPictureUpload
    ? `data:${stagedPictureUpload.contentType};base64,${stagedPictureUpload.image}`
    : stagedPictureKind === "avatar"
      ? (profile.avatar?.portraitUrl || profile.picture?.url || "/default-avatar.svg")
      : stagedPictureKind === "default"
        ? "/default-avatar.svg"
        : (profile.picture?.url || "/default-avatar.svg");
  // The hero banner's resolved state (REQ-19): the preview mirrors
  // what the hero shows — the upload/default file itself, or the
  // portrait the blurred fallback borrows.
  const bannerKind = profile.banner?.kind || "default";
  const effectiveBannerKind = stagedBannerUpload ? "upload" : stagedBannerReset ? "default" : bannerKind;
  const bannerStateLabel = effectiveBannerKind === "upload" ? "自定义图片" : effectiveBannerKind === "avatar" ? "化身立绘" : "默认头图";
  const bannerPreviewUrl = stagedBannerUpload
    ? `data:${stagedBannerUpload.contentType};base64,${stagedBannerUpload.image}`
    : stagedBannerReset
      ? "/art/banner-profile-1600.webp"
      : bannerKind === "avatar"
        ? (profile.avatar?.portraitUrl || "")
        : (profile.banner?.url || "");

  const checkHandle = async () => {
    const value = handle.trim().toLowerCase();
    if (!value || value === (editable.handle || "")) { setHandleState(null); return; }
    try {
      setHandleState(await checkHandleAvailable({ handle: value, getAccessToken: getToken }));
    } catch { setHandleState(null); }
  };

  // REQ-27: a kind pick only stages the choice (and supersedes any
  // staged upload, and vice versa) — nothing leaves the device until
  // 保存 runs the staged writes.
  const pickKind = (kind) => {
    if (pictureBusy || busy) return;
    setError("");
    setStagedPictureKind(kind);
    setStagedPictureUpload(null);
  };

  const closeCrop = () => {
    const current = cropRef.current;
    if (current) {
      current.bitmap.close?.();
      URL.revokeObjectURL(current.url);
    }
    setCrop(null);
  };

  const onPickFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || pictureBusy) return;
    setError("");
    try {
      const bitmap = await createImageBitmap(file);
      setCrop({ bitmap, url: URL.createObjectURL(file) });
    } catch {
      setError("这张图片读不出来，换一张试试。");
    }
  };

  const confirmCrop = async (rect) => {
    if (!crop || pictureBusy) return;
    setPictureBusy("upload");
    setError("");
    try {
      // REQ-27: the processed payload is STAGED, not uploaded — it
      // rides to the server only when 保存 runs.
      const processed = await bitmapRegionToSquareJpeg(crop.bitmap, rect);
      setStagedPictureUpload(processed);
      setStagedPictureKind(null);
      closeCrop();
    } catch (failure) {
      setError(failure?.message || "图片没能处理，请换一张试试。");
    } finally { setPictureBusy(""); }
  };

  const closeBannerCrop = () => {
    const current = bannerCropRef.current;
    if (current) {
      current.bitmap.close?.();
      URL.revokeObjectURL(current.url);
    }
    setBannerCrop(null);
  };

  const onPickBannerFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || pictureBusy) return;
    setError("");
    try {
      const bitmap = await createImageBitmap(file);
      setBannerCrop({ bitmap, url: URL.createObjectURL(file) });
    } catch {
      setError("这张图片读不出来，换一张试试。");
    }
  };

  const confirmBannerCrop = async (rect) => {
    if (!bannerCrop || pictureBusy) return;
    setPictureBusy("banner-upload");
    setError("");
    try {
      // REQ-27: staged like the picture — uploaded only on 保存.
      const processed = await bitmapRegionToBannerJpeg(bannerCrop.bitmap, rect);
      setStagedBannerUpload(processed);
      setStagedBannerReset(false);
      closeBannerCrop();
    } catch (failure) {
      setError(failure?.message || "头图没能处理，请换一张试试。");
    } finally { setPictureBusy(""); }
  };

  // REQ-27: restoring the default banner is a staged state too — it
  // also cancels a staged upload — and only reaches the server (as a
  // DELETE) when 保存 runs and a stored banner actually exists.
  const resetBanner = () => {
    if (pictureBusy || busy) return;
    setError("");
    setStagedBannerUpload(null);
    setStagedBannerReset(Boolean(editable.hasBanner));
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // REQ-27: the sheet's single write path. Staged binary writes
      // land first (a staged banner reset only fires when no staged
      // upload supersedes it), then the field patch — which also
      // carries a staged picture-kind pick — returns the final
      // profile. If an early write succeeds and a later one fails the
      // error surfaces and the sheet stays open; the landed part is
      // simply the new stored state, never a hidden one.
      let next = null;
      if (stagedPictureUpload) {
        next = await uploadMyPicture({ ...stagedPictureUpload, getAccessToken: getToken });
      }
      if (stagedBannerUpload) {
        next = await uploadMyBanner({ ...stagedBannerUpload, getAccessToken: getToken });
      } else if (stagedBannerReset) {
        next = await deleteMyBanner({ getAccessToken: getToken });
      }
      const patch = {
        displayName: displayName.trim(),
        bio: bio.trim(),
      };
      if (!idLocked) patch.handle = handle.trim().toLowerCase() || null;
      if (stagedPictureKind) patch.pictureKind = stagedPictureKind;
      next = await updateMyProfile({
        patch,
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
      <div className="profile-edit-sheet da-sheet-frame">
        <span className="ryan-sheet-handle" aria-hidden="true" />
        <div className="profile-edit-heading">
          <h2>{crop ? "裁剪头像" : bannerCrop ? "裁剪头图" : "编辑资料"}</h2>
          <button type="button" className="profile-edit-close" onClick={onClose} aria-label="关闭">
            <Icon name="x" size={16} />
          </button>
        </div>

        {crop ? (
          <>
            {error && <p className="profile-edit-error" role="alert">{error}</p>}
            <PictureCropper
              bitmap={crop.bitmap}
              url={crop.url}
              busy={pictureBusy === "upload"}
              onCancel={closeCrop}
              onConfirm={(rect) => void confirmCrop(rect)}
            />
          </>
        ) : bannerCrop ? (
          <>
            {error && <p className="profile-edit-error" role="alert">{error}</p>}
            <PictureCropper
              shape="banner"
              bitmap={bannerCrop.bitmap}
              url={bannerCrop.url}
              busy={pictureBusy === "banner-upload"}
              onCancel={closeBannerCrop}
              onConfirm={(rect) => void confirmBannerCrop(rect)}
            />
          </>
        ) : (
        <>
        <div className="profile-edit-picture">
          <span className={`profile-edit-preview-frame${effectivePictureKind === "avatar" ? " is-portrait" : ""}`}>
            <img className="profile-edit-preview" src={picturePreviewUrl} alt="" />
          </span>
          <div className="profile-edit-picture-copy">
            <strong>头像</strong>
            <small>现在使用的是：{pictureStateLabel}</small>
          </div>
        </div>
        <div className="profile-edit-picture-actions">
          <button type="button" disabled={Boolean(pictureBusy) || busy} onClick={() => fileRef.current?.click()}>
            {pictureBusy === "upload" ? "处理中…" : "上传图片"}
          </button>
          <button
            type="button"
            disabled={Boolean(pictureBusy) || busy || !editable.hasPortrait}
            onClick={() => pickKind("avatar")}
            title={editable.hasPortrait ? "" : "还没有化身立绘"}
          >
            用化身立绘
          </button>
          <button type="button" disabled={Boolean(pictureBusy) || busy} onClick={() => pickKind("default")}>
            恢复默认
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => void onPickFile(event)} />
        </div>

        <div className="profile-edit-banner">
          <span className="profile-edit-banner-preview">
            {bannerPreviewUrl ? <img src={bannerPreviewUrl} alt="" /> : null}
          </span>
          <div className="profile-edit-picture-copy">
            <strong>主页头图</strong>
            <small>现在使用的是：{bannerStateLabel}</small>
          </div>
        </div>
        <div className="profile-edit-picture-actions">
          <button type="button" disabled={Boolean(pictureBusy) || busy} onClick={() => bannerFileRef.current?.click()}>
            {pictureBusy === "banner-upload" ? "处理中…" : "上传图片"}
          </button>
          <button
            type="button"
            disabled={Boolean(pictureBusy) || busy || (!editable.hasBanner && !stagedBannerUpload)}
            onClick={() => resetBanner()}
            title={editable.hasBanner || stagedBannerUpload ? "" : "现在就是默认头图"}
          >
            恢复默认
          </button>
          <input ref={bannerFileRef} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => void onPickBannerFile(event)} />
        </div>

        <label className="profile-edit-field">
          <span>显示名</span>
          <input
            value={displayName}
            maxLength={20}
            onChange={(event) => setDisplayName(clipToUnits(event.target.value, 18))}
            placeholder="给自己起个名字"
          />
        </label>
        <label className="profile-edit-field">
          <span>个人简介</span>
          <textarea
            value={bio}
            rows={3}
            onChange={(event) => setBio(event.target.value)}
            placeholder="写一句介绍自己"
          />
          <small className={`profile-edit-bio-count${bioOverLimit ? " is-over" : ""}`} aria-live="polite">
            {bioCount}/120
          </small>
        </label>
        {/* DEVICE-FIX REQ-24: once the @ID exists it can never change,
            so the field leaves the editor entirely (user order: 不可改
            的东西别放在编辑里）. Only a first claim (no @ID yet)
            still renders the editable field + availability check. */}
        {!idLocked && (
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
        )}

        {error && <p className="profile-edit-error" role="alert">{error}</p>}
        <div className="da-sheet-actions">
          <button type="button" className="profile-edit-save" disabled={busy || bioOverLimit} onClick={() => void save()}>
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

// A line's face on the profile shelf and store list: the shared
// publication chain (PublicationArtwork) — its OWN generated cover
// first, the shared world artwork only for lines never painted or
// when the cover image itself fails to load.
function ProfileCoverArt({ publication }) {
  const genre = genreById[publication.genreId] || GENRES[0];
  return <PublicationArtwork publication={publication} genreId={genre.id} />;
}

function ProfileConnectionRow({ person, account, busyUid, onToggleFollow, onOpenProfile }) {
  const portrait = person.picture?.kind === "avatar";
  return (
    <div className="profile-connection-row">
      <button
        type="button"
        className="profile-connection-main"
        onClick={() => onOpenProfile?.(person.uid)}
        aria-label={`打开 ${person.displayName} 的主页`}
      >
        <span className={`nav-face-frame is-person ${portrait ? "is-portrait" : ""}`} aria-hidden="true">
          <img className="nav-face-img" src={person.picture?.url || "/default-avatar.svg"} alt="" loading="lazy" />
        </span>
        <span className="profile-connection-copy">
          <strong>{person.displayName}</strong>
          {person.handle && person.displayName.toLowerCase() !== person.handle.toLowerCase() && <small>@{person.handle}</small>}
        </span>
      </button>
      {account.user && !person.isSelf && (
        <button
          type="button"
          className={`profile-connection-follow ${person.isFollowing ? "is-following" : ""}`}
          disabled={busyUid === person.uid}
          aria-pressed={Boolean(person.isFollowing)}
          onClick={() => void onToggleFollow(person)}
        >
          {person.isFollowing ? "已关注" : "关注"}
        </button>
      )}
    </div>
  );
}

// ——— FRIENDS section pieces ———
// One person row across the friend surfaces (friend list, request
// lists, search results): the same face-anchored row grammar as the
// 粉丝/关注 lists, with a caller-supplied trailing action.
function FriendPersonRow({ person, trailing = null, onOpenProfile }) {
  const portrait = person.picture?.kind === "avatar";
  return (
    <div className="profile-connection-row">
      <button
        type="button"
        className="profile-connection-main"
        onClick={() => onOpenProfile?.(person.uid)}
        aria-label={`打开 ${person.displayName} 的主页`}
      >
        <span className={`nav-face-frame is-person ${portrait ? "is-portrait" : ""}`} aria-hidden="true">
          <img className="nav-face-img" src={person.picture?.url || "/default-avatar.svg"} alt="" loading="lazy" />
        </span>
        <span className="profile-connection-copy">
          <strong>{person.displayName}</strong>
          {person.handle && person.displayName.toLowerCase() !== person.handle.toLowerCase() && <small>@{person.handle}</small>}
        </span>
      </button>
      {trailing}
    </div>
  );
}

const FRIEND_OUTGOING_COPY = {
  pending: "等待对方确认",
  accepted: "已成为好友",
  declined: "对方这次没有通过",
  cancelled: "已取消",
};

function FriendsPanel({ authClient, onOpenProfile }) {
  // The 好友区 on my own page (FRIENDS batch). Progressive disclosure:
  // the first paint is the friend list itself plus two counts — the
  // request lists and the people search live one tap away in the tab
  // row, and 找朋友 is a single entry line in the section head.
  const getToken = useCallback(() => authClient.getAccessToken(), [authClient]);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState("friends");
  const [busyUid, setBusyUid] = useState("");
  const [note, setNote] = useState("");
  const [searchMode, setSearchMode] = useState("name");
  const [searchText, setSearchText] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const [composingUid, setComposingUid] = useState("");
  const [draft, setDraft] = useState("");

  const reload = useCallback(() => {
    setLoadError("");
    fetchFriends({ getAccessToken: getToken })
      .then((next) => setData(next))
      .catch(() => setLoadError("好友没能打开，请稍后再试。"));
  }, [getToken]);
  useEffect(() => { reload(); }, [reload]);

  const pendingCount = data?.counts?.incomingPending || 0;

  const act = async (person, action) => {
    if (busyUid) return;
    setBusyUid(person.uid);
    setNote("");
    try {
      if (action === "send") {
        const result = await sendFriendRequest({ uid: person.uid, message: draft.trim(), getAccessToken: getToken });
        setComposingUid("");
        setDraft("");
        setNote(result.state === "friends" ? "你们已经是好友了。" : "好友申请已发出。");
        setSearchResult((current) => current ? {
          ...current,
          people: current.people.map((row) => (row.uid === person.uid ? { ...row, friendState: result.state || "pending-out" } : row)),
        } : current);
      } else if (action === "accept") {
        await respondFriendRequest({ uid: person.uid, accept: true, getAccessToken: getToken });
        setNote(`你和 ${person.displayName} 已经是好友了。`);
        setSearchResult((current) => current ? {
          ...current,
          people: current.people.map((row) => (row.uid === person.uid ? { ...row, friendState: "friends" } : row)),
        } : current);
      } else if (action === "decline") {
        await respondFriendRequest({ uid: person.uid, accept: false, getAccessToken: getToken });
        setNote("已婉拒这条申请。");
        setSearchResult((current) => current ? {
          ...current,
          people: current.people.map((row) => (row.uid === person.uid ? { ...row, friendState: "none" } : row)),
        } : current);
      } else if (action === "cancel") {
        await cancelFriendRequest({ uid: person.uid, getAccessToken: getToken });
        setNote("申请已取消。");
        setSearchResult((current) => current ? {
          ...current,
          people: current.people.map((row) => (row.uid === person.uid ? { ...row, friendState: "none" } : row)),
        } : current);
      }
      reload();
    } catch (failure) {
      setNote(failure?.message || "操作没能完成，请稍后再试。");
    } finally { setBusyUid(""); }
  };

  const runSearch = async () => {
    const value = searchText.trim();
    if (!value || searching) return;
    setSearching(true);
    setSearchError("");
    setSearchResult(null);
    try {
      const result = await searchPeople({
        ...(searchMode === "email" ? { email: value } : { q: value }),
        getAccessToken: getToken,
      });
      setSearchResult(result);
    } catch (failure) {
      setSearchError(failure?.message || "没能搜到，请稍后再试。");
    } finally { setSearching(false); }
  };

  // The action a search row offers, per the standing relationship.
  const searchAction = (person) => {
    if (person.isSelf) return <span className="friend-state-chip">这是你</span>;
    if (person.friendState === "friends") return <span className="friend-state-chip">已是好友</span>;
    if (person.friendState === "pending-in") {
      return (
        <button type="button" className="profile-connection-follow" disabled={busyUid === person.uid} onClick={() => void act(person, "accept")}>
          同意申请
        </button>
      );
    }
    if (person.friendState === "pending-out") {
      return (
        <span className="friend-state-actions">
          <span className="friend-state-chip">申请中</span>
          <button type="button" className="friend-text-btn" disabled={busyUid === person.uid} onClick={() => void act(person, "cancel")}>取消</button>
        </span>
      );
    }
    return (
      <button
        type="button"
        className="profile-connection-follow"
        disabled={busyUid === person.uid}
        onClick={() => { setComposingUid(person.uid); setDraft(""); }}
      >
        加好友
      </button>
    );
  };

  return (
    <section className="profile-sec friends-sec" aria-label="好友" data-enter>
      <div className="profile-sec-head">
        <h2 className="profile-sec-title">好友{data ? <small>{data.counts.friends} 人</small> : null}</h2>
        <button type="button" className="profile-sec-more" onClick={() => setTab("search")}>找朋友 ›</button>
      </div>
      <div className="friends-tabs" role="tablist" aria-label="好友分区">
        {[
          { id: "friends", label: "好友" },
          { id: "requests", label: "申请", badge: pendingCount },
          { id: "search", label: "找朋友" },
        ].map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={`friends-tab ${tab === entry.id ? "is-active" : ""}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            {entry.badge > 0 && <span className="notify-tab-badge" aria-label={`${entry.badge} 条待处理`}>{entry.badge > 99 ? "99+" : entry.badge}</span>}
          </button>
        ))}
      </div>
      {note && <p className="ryan-note" role="status">{note}</p>}
      {loadError ? (
        <p className="profile-line-empty" role="alert">{loadError}</p>
      ) : !data ? (
        <div role="status" aria-label="正在打开好友">
          {[0, 1].map((i) => (
            <div className="da-skel-row" key={i} aria-hidden="true">
              <span className="da-skel da-skel--circle" style={{ width: 40, height: 40 }} />
              <span className="da-skel-colline">
                <span className="da-skel da-skel--line" style={{ width: "48%" }} />
                <span className="da-skel da-skel--line" style={{ width: "30%" }} />
              </span>
            </div>
          ))}
        </div>
      ) : tab === "friends" ? (
        data.friends.length === 0 ? (
          <div>
            <img className="empty-inline-art" src="/art/empty-friends-512.webp" alt="" loading="lazy" />
            <p className="profile-line-empty">还没有好友。去找朋友，把认识的人加进来。</p>
          </div>
        ) : (
          <div className="profile-connection-list">
            {data.friends.map((person) => (
              <FriendPersonRow key={person.uid} person={person} onOpenProfile={onOpenProfile} />
            ))}
          </div>
        )
      ) : tab === "requests" ? (
        <>
          {data.incoming.length === 0 && data.outgoing.length === 0 && (
            <div>
              <img className="empty-inline-art" src="/art/empty-friends-512.webp" alt="" loading="lazy" />
              <p className="profile-line-empty">还没有好友申请。</p>
            </div>
          )}
          {data.incoming.length > 0 && (
            <div className="profile-connection-list" aria-label="收到的申请">
              {data.incoming.map((entry) => (
                <div key={entry.id} className="friend-request-block">
                  <FriendPersonRow
                    person={entry.person}
                    onOpenProfile={onOpenProfile}
                    trailing={(
                      <span className="friend-state-actions">
                        <button type="button" className="profile-connection-follow" disabled={busyUid === entry.person.uid} onClick={() => void act(entry.person, "accept")}>同意</button>
                        <button type="button" className="friend-text-btn" disabled={busyUid === entry.person.uid} onClick={() => void act(entry.person, "decline")}>拒绝</button>
                      </span>
                    )}
                  />
                  {entry.message && <p className="friend-request-message">「{entry.message}」</p>}
                </div>
              ))}
            </div>
          )}
          {data.outgoing.length > 0 && (
            <div className="profile-connection-list" aria-label="我发出的申请">
              {data.outgoing.map((entry) => (
                <FriendPersonRow
                  key={entry.id}
                  person={entry.person}
                  onOpenProfile={onOpenProfile}
                  trailing={(
                    <span className="friend-state-actions">
                      <span className="friend-state-chip">{FRIEND_OUTGOING_COPY[entry.status] || entry.status}</span>
                      {entry.status === "pending" && (
                        <button type="button" className="friend-text-btn" disabled={busyUid === entry.person.uid} onClick={() => void act(entry.person, "cancel")}>取消</button>
                      )}
                    </span>
                  )}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="friends-search">
          <div className="friends-search-modes" role="group" aria-label="查找方式">
            <button type="button" className={searchMode === "name" ? "is-active" : ""} aria-pressed={searchMode === "name"} onClick={() => setSearchMode("name")}>按用户名</button>
            <button type="button" className={searchMode === "email" ? "is-active" : ""} aria-pressed={searchMode === "email"} onClick={() => setSearchMode("email")}>按邮箱</button>
          </div>
          <div className="friends-search-bar">
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void runSearch(); }}
              placeholder={searchMode === "email" ? "输入对方的完整邮箱" : "输入用户名或 @ID 的一部分"}
              aria-label={searchMode === "email" ? "按邮箱找人" : "按用户名找人"}
              inputMode={searchMode === "email" ? "email" : "search"}
            />
            <button type="button" disabled={searching || !searchText.trim()} onClick={() => void runSearch()}>
              <Icon name="search" size={17} />
              搜索
            </button>
          </div>
          <p className="friends-search-note">
            {searchMode === "email"
              ? "邮箱是精确查找：找到就显示对方的主页卡片，邮箱本身不会出现在这里。"
              : "按用户名或显示名模糊查找，点头像可以先看看对方的主页。"}
          </p>
          {searchError ? (
            <p className="profile-line-empty" role="alert">{searchError}</p>
          ) : searching ? (
            <p className="profile-line-empty" role="status"><span className="da-load-row"><span className="da-spinner da-spinner--sm" aria-hidden="true" />正在找…</span></p>
          ) : searchResult ? (
            searchResult.people.length === 0 ? (
              <div>
                <img className="empty-inline-art" src="/art/empty-search-512.webp" alt="" loading="lazy" />
                <p className="profile-line-empty">{searchResult.mode === "email" ? "没有找到这个邮箱对应的账号。" : "没有找到符合的人，换个关键词试试。"}</p>
              </div>
            ) : (
              <div className="profile-connection-list">
                {searchResult.people.map((person) => (
                  <div key={person.uid} className="friend-request-block">
                    <FriendPersonRow person={person} onOpenProfile={onOpenProfile} trailing={searchAction(person)} />
                    {composingUid === person.uid && (
                      <div className="friend-compose">
                        <input
                          value={draft}
                          maxLength={50}
                          onChange={(event) => setDraft(event.target.value)}
                          placeholder="说一句打个招呼（可不填，最多 50 字）"
                          aria-label="好友申请留言"
                        />
                        <button type="button" className="friend-compose-send" disabled={busyUid === person.uid} onClick={() => void act(person, "send")}>发送</button>
                        <button type="button" className="friend-text-btn" onClick={() => setComposingUid("")}>取消</button>
                      </div>
                    )}
                  </div>
                ))}
                {searchResult.total > searchResult.people.length && (
                  <p className="profile-line-empty">只列出前 {searchResult.people.length} 人，换个更准的关键词能缩小范围。</p>
                )}
              </div>
            )
          ) : null}
        </div>
      )}
    </section>
  );
}

// ——— PROFILE-ENRICH (§35) section pieces ———
// One book standing in the profile's mini-shelf: the same cover
// sources as the shelf page, a slimmer footprint. Books stand
// straight everywhere (DEVICE-FIX REQ-20).
// Own books come from the live library (drafts included, it is your
// home); other people's books are their public lines.
function ProfileShelfStoryBook({ story, authClient, account, onOpen }) {
  const genre = genreOf(story);
  return (
    <button
      type="button"
      className="profile-shelf-book"
      onClick={() => onOpen(story.id)}
      aria-label={`打开《${story.title || "未命名故事"}》`}
    >
      <span className="profile-shelf-cover">
        <StoryCover story={story} genreId={genre.id} sources={coverSources(story)} getAccessToken={() => authClient.getAccessToken()} authSignal={account.status} />
      </span>
      <span className="profile-shelf-name">{story.title || "未命名故事"}</span>
      <span className="profile-shelf-meta">{shelfMetaFor(story)}</span>
    </button>
  );
}

function ProfileShelfPubBook({ publication, onOpen }) {
  const serializing = plazaLineStatusFor(publication) === "serializing";
  // The shelf meta is one short line: the length label already leads
  // with 连载中 for serializing lines; finished lines drop the season
  // segment (the store card below carries the full label).
  const label = plazaLengthLabel(publication);
  const meta = serializing
    ? publication.storyLengthMode === "endless" && Number.isInteger(publication.chapterCount)
      ? `连载中 · ${publication.chapterCount} 章`
      : label
    : `已完结 · ${label.split(" · ").pop()}`;
  return (
    <button
      type="button"
      className="profile-shelf-book"
      onClick={() => onOpen(publication)}
      aria-label={`打开《${publication.title}》`}
    >
      <span className="profile-shelf-cover">
        <ProfileCoverArt publication={publication} />
      </span>
      <span className="profile-shelf-name">{publication.title}</span>
      <span className="profile-shelf-meta">{meta}</span>
    </button>
  );
}

// One listed book in the 上架区: a small horizontal card — cover, title,
// a status chip (连载 / 完结), and the progress line under it.
function ProfileStoreCard({ publication, onOpen }) {
  const serializing = plazaLineStatusFor(publication) === "serializing";
  const templateName = plazaTemplateNameFor(publication);
  const meta = serializing
    ? `${templateName ? `${templateName} · ` : ""}更新至第 ${publication.chapterCount} 章`
    : `${templateName ? `${templateName} · ` : ""}${plazaLengthLabel(publication)}`;
  return (
    <button type="button" className="profile-store-card" onClick={() => onOpen(publication)} aria-label={`查看《${publication.title}》`}>
      <span className="profile-store-art"><ProfileCoverArt publication={publication} /></span>
      <span className="profile-store-copy">
        <span className="profile-store-title-row">
          <strong>{publication.title}</strong>
          <span className={`profile-store-chip ${serializing ? "is-live" : ""}`}>{serializing ? "连载中" : "完结"}</span>
        </span>
        <small>{meta}</small>
      </span>
      <Icon name="chevron" size={16} />
    </button>
  );
}

function ProfileSettings({ account, authClient, shellTheme, onShellThemeChange, onOpenAccount, onOpenBilling, onOpenLibrary, onOpenHelp, onOpenProfile, onNavigate }) {
  // 设置 (NOTIFY-SETTINGS §36; window form DEDUP-FIX §40 ②, user
  // order 2026-10-28): the groups live INSIDE the settings window —
  // appearance (theme + the motion switch that used to live in the
  // topbar), account, data, about. The profile page itself keeps one
  // entry row; this component is only the window's contents. Rows
  // open the existing panels; nothing here re-implements them.
  const motion = useMotionSettings();
  const systemPaused = motion.reducedMotion || motion.saveData;
  const motionOn = motion.enabled && !systemPaused;
  // 合流权限 (REQ-49): the account-level consent for other readers
  // fusing MY books — free / ask / forbidden, default free. The saved
  // value rides the profile record; this control loads it from the
  // owner's own profile payload and saves through the same profile
  // endpoint as every other profile field.
  const ownUid = account?.user?.uid || "";
  const [fusionPermission, setFusionPermission] = useState("free");
  const [fusionLoaded, setFusionLoaded] = useState(false);
  const [fusionSaving, setFusionSaving] = useState(false);
  const [fusionError, setFusionError] = useState("");
  useEffect(() => {
    if (!ownUid) return undefined;
    let live = true;
    fetchUserProfile({ uid: ownUid, getAccessToken: () => authClient.getAccessToken() })
      .then((profile) => {
        if (!live) return;
        setFusionPermission(normalizeFusionPermission(profile?.editable?.fusionPermission));
        setFusionLoaded(true);
      })
      .catch(() => { if (live) setFusionLoaded(true); });
    return () => { live = false; };
  }, [ownUid, authClient]);
  const changeFusionPermission = async (next) => {
    if (!fusionLoaded || fusionSaving || next === fusionPermission) return;
    const previous = fusionPermission;
    setFusionPermission(next);
    setFusionSaving(true);
    setFusionError("");
    try {
      const saved = await updateMyProfile({
        patch: { fusionPermission: next },
        getAccessToken: () => authClient.getAccessToken(),
      });
      setFusionPermission(normalizeFusionPermission(saved?.editable?.fusionPermission || next));
    } catch {
      setFusionPermission(previous);
      setFusionError("合流权限没能保存，请稍后再试。");
    } finally { setFusionSaving(false); }
  };
  const [signingOut, setSigningOut] = useState(false);
  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await authClient.signOut();
      onNavigate("plaza");
    } catch {
      setSigningOut(false);
    }
  };
  return (
    <div className="profile-settings">
      <h3 className="settings-group-title">外观</h3>
      <div className="settings-card">
        <div className="settings-row settings-row-static">
          <span className="settings-row-ic"><Icon name="palette" size={19} /></span>
          <span className="settings-row-copy">
            <strong>外观主题</strong>
            <small>三套外观主题</small>
          </span>
          <ShellThemeSegments shellTheme={shellTheme} onShellThemeChange={onShellThemeChange} />
        </div>
        <div className="settings-row settings-row-motion">
          <span className="settings-row-ic"><Icon name="ripple" size={19} /></span>
          <span className="settings-row-copy">
            <strong>动态效果</strong>
            <small>{systemPaused ? "系统已要求减少动态效果，动效保持关闭" : motionOn ? "界面动效开启中" : "界面动效已暂停"}</small>
          </span>
          <label className="da-switch">
            <input
              type="checkbox"
              checked={motionOn}
              disabled={systemPaused}
              onChange={motion.toggle}
              aria-label="动态效果"
            />
            <span className="da-switch-ui" aria-hidden="true" />
          </label>
        </div>
      </div>

      <h3 className="settings-group-title">账号</h3>
      <div className="settings-card">
        <button type="button" className="settings-row" onClick={onOpenAccount}>
          <span className="settings-row-ic"><Icon name="shield" size={19} /></span>
          <span className="settings-row-copy">
            <strong>我的账号</strong>
            <small>用量、登录方式与恢复邮箱都在账号页里</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
        <button type="button" className="settings-row" onClick={onOpenBilling}>
          <span className="settings-row-ic"><Icon name="spark" size={19} /></span>
          <span className="settings-row-copy">
            <strong>会员与额度</strong>
            <small>会员到期、章额度与兑换码</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
      </div>
      <div className="settings-card settings-card-signout">
        <button type="button" className="settings-row settings-row-danger" onClick={() => void signOut()} disabled={signingOut}>
          <span className="settings-row-ic"><Icon name="logout" size={19} /></span>
          <span className="settings-row-copy">
            <strong>{signingOut ? "正在退出…" : "退出登录"}</strong>
          </span>
        </button>
      </div>

      <h3 className="settings-group-title">社交</h3>
      <div className="settings-card">
        <div className="settings-row settings-row-static">
          <span className="settings-row-ic"><Icon name="git" size={19} /></span>
          <span className="settings-row-copy">
            <strong>合流权限</strong>
            <small>别人用你的书合流时按这里办。选「询问」，对方要先申请、你同意后才能合。</small>
          </span>
        </div>
        <div className="fusion-permission-options">
          <div className="account-theme-options" role="group" aria-label="合流权限">
            {FUSION_PERMISSION_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={fusionPermission === option.id}
                className={fusionPermission === option.id ? "is-active" : ""}
                disabled={!fusionLoaded || fusionSaving}
                onClick={() => void changeFusionPermission(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {fusionError && <p className="fusion-permission-error" role="alert">{fusionError}</p>}
        </div>
      </div>

      <h3 className="settings-group-title">数据</h3>
      <div className="settings-card">
        <button type="button" className="settings-row" onClick={onOpenLibrary}>
          <span className="settings-row-ic"><Icon name="database" size={19} /></span>
          <span className="settings-row-copy">
            <strong>书架备份与恢复</strong>
            <small>导出、导入与本机存储</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
      </div>

      <h3 className="settings-group-title">关于</h3>
      <div className="settings-card">
        <div className="settings-row settings-row-static">
          <span className="settings-row-ic"><Icon name="info" size={19} /></span>
          <span className="settings-row-copy">
            <strong>版本</strong>
          </span>
          {/* Kept in step with package.json "version" by hand — there
              is no build-time injection for it. */}
          <span className="settings-row-value">织界 v0.3.0</span>
        </div>
        <button type="button" className="settings-row" onClick={() => onOpenProfile?.("username:storyweave")}>
          <span className="settings-row-ic"><Icon name="spark" size={19} /></span>
          <span className="settings-row-copy">
            <strong>织界官方</strong>
            <small>官方账号与示例故事</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
        <button type="button" className="settings-row" onClick={onOpenHelp}>
          <span className="settings-row-ic"><Icon name="help" size={19} /></span>
          <span className="settings-row-copy">
            <strong>帮助与常见问题</strong>
            <small>额度、找回、广场规则</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
      </div>
      <p className="settings-foot-note">阅读时的纸色、字号与翻页方式在阅读器里的「阅读设置」单独调，不在这里。</p>
    </div>
  );
}

/**
 * The share sheet's ready-made copy (§37 I): one plain pitch line +
 * the person's @handle + the real profile URL — the same URL the old
 * copy-link action used, never a re-invented one. The main avatar is
 * named only when there is one. Own profile pitches in first person;
 * someone else's stays neutral and names them. Written to be pasted
 * as-is into any chat, and editable in the sheet before copying.
 */
function profileShareText({ profile, isSelf, shownName, shownHandle, url }) {
  const avatarName = profile?.avatar?.name || "";
  const tail = shownHandle ? ` 👉 @${shownHandle} ${url}` : ` ${url}`;
  if (isSelf) {
    return avatarName
      ? `我在织界养了一个化身「${avatarName}」，陪我走进一个个故事世界。来看看我的主页${tail}`
      : `我在织界走进一个个故事世界。来看看我的主页${tail}`;
  }
  return avatarName
    ? `来看看 ${shownName} 的织界主页，TA 的化身「${avatarName}」陪 TA 走进一个个故事世界${tail}`
    : `来看看 ${shownName} 的织界主页，TA 在织界走进一个个故事世界${tail}`;
}

/**
 * The one share door (§37 I): a bottom sheet in the edit sheet's
 * language. The copy is pre-written and editable; 复制分享文案 takes
 * the whole text; 系统分享 appears only when navigator.share really
 * exists — never as a decoration that does nothing.
 */
function ShareProfileSheet({ text, isSelf, onClose, onCopied, onCopyFailed }) {
  const [value, setValue] = useState(text);
  const [busy, setBusy] = useState(false);
  const canSystemShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const copy = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await navigator.clipboard.writeText(value);
      onCopied?.();
      onClose();
    } catch {
      onCopyFailed?.();
      setBusy(false);
    }
  };
  const systemShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await navigator.share({ text: value });
      onClose();
    } catch {
      /* The reader dismissed the system sheet — nothing to report. */
      setBusy(false);
    }
  };
  return (
    <div className="profile-edit-overlay" role="dialog" aria-modal="true" aria-label="分享主页">
      <div className="profile-edit-sheet">
        <span className="ryan-sheet-handle" aria-hidden="true" />
        <div className="profile-edit-heading">
          <h2>分享主页</h2>
          <button type="button" className="profile-edit-close" onClick={onClose} aria-label="关闭">
            <Icon name="x" size={16} />
          </button>
        </div>
        <label className="profile-edit-field">
          <span>分享文案</span>
          <textarea value={value} rows={4} onChange={(event) => setValue(event.target.value)} />
        </label>
        <p className="profile-share-hint">改成你自己的话也行，链接留着——点开就到{isSelf ? "你的" : " TA 的"}主页。</p>
        <div className="profile-share-actions">
          <button type="button" className="profile-share-copy" disabled={busy || !value.trim()} onClick={() => void copy()}>
            复制分享文案
          </button>
          {canSystemShare && (
            <button type="button" className="profile-share-system" disabled={busy || !value.trim()} onClick={() => void systemShare()}>
              系统分享
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// The designed default banner ships two widths; small viewports take
// the 800w file (66KB) instead of the 1600w one (227KB) — the hero is
// at most ~430 CSS px wide, so the smaller file looks identical and
// the first paint no longer flashes the pale placeholder while the
// big file loads. Uploaded banners (API URLs) are never rewritten.
const responsiveDefaultBannerUrl = (url) => (url === "/art/banner-profile-1600.webp"
  && typeof window !== "undefined" && window.innerWidth <= 640
  ? "/art/banner-profile-800.webp"
  : url);

// REQ-70: the showcase figure's ground. It is painted from the
// portrait's own edge tones (samplePortraitEdges) as a soft top→
// bottom falloff, so the painting stands on its own colours and a
// pale-matted portrait's matte simply continues to the figure's
// edges — there is no seam to see. Until the tones land (or if they
// never do) the span keeps the plain panel ground from CSS.
function ShowcaseFill({ url }) {
  const [edges, setEdges] = useState(null);
  useEffect(() => {
    let live = true;
    setEdges(null);
    if (url) {
      samplePortraitEdges(url).then((found) => { if (live) setEdges(found); }, () => {});
    }
    return () => { live = false; };
  }, [url]);
  return (
    <span
      className="profile-showcase-fill"
      aria-hidden="true"
      style={edges ? { background: `linear-gradient(180deg, ${edges.top} 0%, ${edges.average} 52%, ${edges.bottom} 100%)` } : undefined}
    />
  );
}

function ProfilePage({ uid, account, authClient, onNavigate, onOpenAccount, onOpenAvatar, onOpenDetail, onOpenProfile, onClose = null, ownStories = null, onOpenStory = null, shellTheme, onShellThemeChange, onOpenLibrary, onOpenHelp }) {
  // Two forms, one component (PROFILE-FIX §33): the WINDOW form (a
  // sheet over the current page, onClose set) for someone else's
  // profile, and the PAGE form (a bottom-nav tab) for your own. The
  // page form has no close button and never plays the entrance
  // stagger — it is home, not a visit.
  const windowForm = Boolean(onClose);
  const viewerUid = account.user?.uid || "";
  const [profile, setProfile] = useState(() => peekProfile({ viewerUid, uid }));
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pictureSrc, setPictureSrc] = useState("");
  // (Hoisted above the early returns with the other state: a hook
  // below the skeleton/error returns changes the hook count when the
  // profile lands and crashes the page — React error #310.)
  const [shareOpen, setShareOpen] = useState(false);
  // The settings window (§40 ②): the page carries one entry row; the
  // groups themselves render inside a ReadingDialog.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The member window (BILLING): opened from the settings window's
  // 账号 group, in the same dialog form.
  const [billingOpen, setBillingOpen] = useState(false);
  // The avatar on the stage (PROFILE-ENRICH §35): the main avatar by
  // default; a return visit restores the tile left selected.
  const [stageAvatarId, setStageAvatarId] = useState(() => profileViewState(uid)?.avatarId || "");
  const [stageFailedFor, setStageFailedFor] = useState("");
  const [connectionsKind, setConnectionsKind] = useState(null);
  const [connections, setConnections] = useState(null);
  const [connectionsError, setConnectionsError] = useState("");
  const [connectionBusyUid, setConnectionBusyUid] = useState("");
  // The friend relationship with this page's owner (FRIENDS batch):
  // seeded from the payload's viewerState.friendState, then driven by
  // the actions taken here — the server stays the source of truth on
  // every fresh load.
  const [friendState, setFriendState] = useState("none");
  const [friendBusy, setFriendBusy] = useState(false);
  const [friendComposing, setFriendComposing] = useState(false);
  const [friendDraft, setFriendDraft] = useState("");
  const getToken = useCallback(() => authClient.getAccessToken(), [authClient]);
  const { animate } = useMotionPolicy("profile");
  const pageRef = useRef(null);
  const enteredUidRef = useRef("");
  const dragRef = useRef(null);
  // Data (PROFILE-FEEL A5): profiles load through the per-(viewer, uid)
  // cache — a cached payload renders on the first frame and revalidates
  // in the background, so the skeleton is a once-per-person sight, not
  // an every-visit ritual. The staged avatar restores from the session
  // memory instead of resetting per visit; scroll position never does
  // (REQ-64: profile surfaces carry no scroll bookkeeping at all).
  useEffect(() => {
    let live = true;
    const cached = peekProfile({ viewerUid, uid });
    setProfile(cached);
    setError("");
    setNote("");
    setMenuOpen(false);
    setReported(false);
    setEditOpen(false);
    setSettingsOpen(false);
    setStageFailedFor("");
    setConnectionsKind(null);
    setConnections(null);
    setConnectionsError("");
    const remembered = profileViewState(uid);
    setStageAvatarId(remembered?.avatarId || "");
    loadProfile({ viewerUid, uid, getAccessToken: getToken })
      .then((next) => { if (live && next) setProfile(next); })
      .catch((failure) => {
        if (live && !peekProfile({ viewerUid, uid })) {
          setError(failure?.code === "not-found" ? "这位用户还不存在。" : "暂时没能打开这个主页，请稍后再试。");
        }
      });
    const unsubscribe = subscribeProfile({ viewerUid, uid }, (next) => { if (live) setProfile(next); });
    return () => { live = false; unsubscribe(); };
  }, [uid, getToken, viewerUid]);
  // Persist the visit's view state as it changes (B4): which avatar
  // stands on the showcase. Scroll position is deliberately NOT part
  // of it — REQ-64 deleted the scroll memory, its verbatim restore
  // and both stage guards (REQ-48/REQ-62) wholesale: the profile
  // surface never records, restores, parks or otherwise moves the
  // scroll position. Scrolling here is 100% native.
  useEffect(() => {
    rememberProfileViewState(uid, { avatarId: stageAvatarId });
  }, [uid, stageAvatarId]);
  // One orchestrated entrance (frontend-design playbook): the SHELF
  // rises in a single staggered sequence — window form only, and only
  // the first time this session meets this person (PROFILE-FEEL B4).
  // The identity block (avatar / name / counts / actions) is NOT part
  // of the stagger — identity renders the instant its data lands
  // (zero-wait, DESIGN §27). Nothing loops, and the app's motion
  // policy silences the stagger entirely.
  useEffect(() => {
    if (!profile || !animate || !windowForm || !pageRef.current) return;
    if (profileIntroSeen(profile.uid)) return;
    if (enteredUidRef.current === profile.uid) return;
    enteredUidRef.current = profile.uid;
    markProfileIntroSeen(profile.uid);
    const targets = pageRef.current.querySelectorAll("[data-enter]");
    if (!targets.length) return;
    gsap.fromTo(
      targets,
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.055, ease: "power3.out", clearProps: "transform,opacity" },
    );
  }, [profile, animate, windowForm]);
  useEffect(() => { setPictureSrc(profile?.picture?.url || ""); }, [profile?.picture?.url]);
  useEffect(() => {
    setFriendState(profile?.viewerState?.friendState || "none");
    setFriendComposing(false);
    setFriendDraft("");
  }, [profile?.uid, profile?.viewerState?.friendState]);

  // The name-list behind the counts (PROFILE-FIX C3): fetched when the
  // reader taps 粉丝 / 关注; rows carry the viewer's follow state.
  useEffect(() => {
    if (!connectionsKind) return undefined;
    let live = true;
    setConnections(null);
    setConnectionsError("");
    fetchUserConnections({ uid, kind: connectionsKind, getAccessToken: getToken })
      .then((result) => { if (live) setConnections(result); })
      .catch(() => { if (live) setConnectionsError("名单没能打开，请稍后再试。"); });
    return () => { live = false; };
  }, [connectionsKind, uid, getToken]);

  const rootClass = `page page-profile ${windowForm ? "" : "is-page-form"} ${windowForm ? "" : "page-enter"}`;

  if (error) {
    return (
      <div className={rootClass}>
        <div className="plaza-empty" role="alert">
          <h3>{error}</h3>
          <Button variant="secondary" onClick={() => (onClose ? onClose() : onNavigate("plaza"))}>{onClose ? "关闭" : "回到广场"}</Button>
        </div>
      </div>
    );
  }
  if (!profile) {
    // Identity zero-wait (DESIGN §27): the loading state holds the
    // header's exact geometry — 136px avatar disc, name bar, counts
    // bar — so the name and counts land in reserved space instead of
    // popping in seconds later and shoving the shelf down.
    return (
      <div className={rootClass} aria-busy="true">
        <div className="profile-skeleton" role="status" aria-label="正在打开主页">
          <span className="profile-skeleton-hero" />
          <span className="profile-skeleton-stats" />
          <span className="profile-skeleton-action" />
          <span className="profile-skeleton-shelf" />
        </div>
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
  // F-09: an account with no display name presents its username as the
  // title; printing the same string again as @handle directly under it
  // is one identity said twice — the handle row stands down then.
  const nameIsHandle = Boolean(shownHandle) && shownName.toLowerCase() === shownHandle.toLowerCase();
  const nameTier = [...shownName].length <= 8 ? "full" : [...shownName].length <= 16 ? "mid" : "long";
  const publications = profile.publications || [];
  // The avatar collection (PROFILE-ENRICH §35): the payload carries
  // every avatar the person keeps; a payload cached before the field
  // existed only knows the main one, so a single-entry collection is
  // synthesised from it rather than rendering an empty 化身区 until
  // the revalidation lands.
  const collection = Array.isArray(profile.avatars) && profile.avatars.length > 0
    ? profile.avatars
    : profile.avatar
      ? [{
          id: "__main__",
          name: profile.avatar.name,
          description: profile.avatar.description,
          appearance: profile.avatar.appearance,
          isMain: true,
          hasPortrait: profile.avatar.hasPortrait,
          ...(profile.avatar.portraitUrl ? { portraitUrl: profile.avatar.portraitUrl } : {}),
          ...(profile.avatar.currentWorld ? { currentWorld: profile.avatar.currentWorld } : {}),
        }]
      : [];
  const mainAvatar = collection.find((item) => item.isMain) || collection[0] || null;
  const stageAvatar = collection.find((item) => item.id === stageAvatarId) || mainAvatar;
  // The shelf: your own live library on your own page (unpublished
  // lines included — it is your home), the public lines on anyone
  // else's. The works count follows the same source so the number
  // and the row beneath it can never disagree.
  const ownBooks = isSelf && Array.isArray(ownStories) ? ownStories : null;
  const worksCount = ownBooks ? ownBooks.length : (profile.counts?.works ?? publications.length);

  const toggleFollow = async (fromElement = null) => {
    if (busy) return;
    if (!account.user) { onOpenAccount(); return; }
    setBusy(true);
    setNote("");
    try {
      const result = following
        ? await unfollowUser({ uid, getAccessToken: getToken })
        : await followUser({ uid, getAccessToken: getToken });
      // A follow landing is one of the three burst moments (§37 G3):
      // a ≤1s sparkle from the button, only on follow, never on unfollow.
      if (result.following) burstFromElement(fromElement);
      const next = {
        ...profile,
        counts: { ...profile.counts, followers: result.followers },
        viewerState: { ...profile.viewerState, isFollowing: result.following },
      };
      setProfile(next);
      rememberProfile({ viewerUid, profile: next });
    } catch (failure) {
      if (failure?.code === "auth-required") onOpenAccount();
      else setNote(failure?.message || "操作没能完成，请稍后再试。");
    } finally { setBusy(false); }
  };

  const toggleConnectionFollow = async (person) => {
    if (connectionBusyUid) return;
    if (!account.user) { onOpenAccount(); return; }
    setConnectionBusyUid(person.uid);
    try {
      const result = person.isFollowing
        ? await unfollowUser({ uid: person.uid, getAccessToken: getToken })
        : await followUser({ uid: person.uid, getAccessToken: getToken });
      setConnections((current) => current ? {
        ...current,
        people: current.people.map((row) => (row.uid === person.uid ? { ...row, isFollowing: result.following } : row)),
      } : current);
      // The page's own counts move with the list: following someone
      // from the 关注/粉丝 list changes this profile's following count
      // only when this profile is the viewer's own page.
      if (isSelf) {
        const next = { ...profile, counts: { ...profile.counts, following: result.following ? profile.counts.following + 1 : Math.max(0, profile.counts.following - 1) } };
        setProfile(next);
        rememberProfile({ viewerUid, profile: next });
      }
    } catch (failure) {
      if (failure?.code === "auth-required") onOpenAccount();
      else setNote(failure?.message || "操作没能完成，请稍后再试。");
    } finally { setConnectionBusyUid(""); }
  };

  const profileUrl = `${window.location.origin}${window.location.pathname}#/profile/${encodeURIComponent(uid)}`;
  const shareText = profileShareText({ profile, isSelf, shownName, shownHandle, url: profileUrl });

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

  // Friend actions from this person's page (FRIENDS batch): ask (with
  // the optional note drafted in the compose row), accept an ask they
  // sent me, or withdraw my own pending ask. Each lands on the state
  // the server reports back.
  const actOnFriend = async (action) => {
    if (friendBusy) return;
    if (!account.user) { onOpenAccount(); return; }
    setFriendBusy(true);
    setNote("");
    try {
      if (action === "send") {
        const result = await sendFriendRequest({ uid, message: friendDraft.trim(), getAccessToken: getToken });
        setFriendState(result.state || "pending-out");
        setFriendComposing(false);
        setFriendDraft("");
        setNote(result.state === "friends" ? "你们已经是好友了。" : "好友申请已发出。");
      } else if (action === "accept") {
        const result = await respondFriendRequest({ uid, accept: true, getAccessToken: getToken });
        setFriendState(result.state || "friends");
        setNote("你们已经是好友了。");
      } else if (action === "cancel") {
        const result = await cancelFriendRequest({ uid, getAccessToken: getToken });
        setFriendState(result.state || "none");
        setNote("申请已取消。");
      }
    } catch (failure) {
      if (failure?.code === "auth-required") onOpenAccount();
      else setNote(failure?.message || "操作没能完成，请稍后再试。");
    } finally { setFriendBusy(false); }
  };

  // Swipe-to-close (PROFILE-FEEL B5, window form): the grab zone at
  // the sheet's top drags the sheet with the finger; past the
  // threshold (or a fast flick) the release completes the close
  // through the same exit animation as every other close path.
  const onGrabPointerDown = (event) => {
    if (!windowForm || !onClose) return;
    const sheet = pageRef.current?.closest(".profile-window-sheet");
    if (!sheet) return;
    dragRef.current = { sheet, startY: event.clientY, lastY: event.clientY, lastAt: performance.now(), dy: 0 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onGrabPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const now = performance.now();
    drag.dy = Math.max(0, event.clientY - drag.startY);
    drag.velocity = (event.clientY - drag.lastY) / Math.max(1, now - drag.lastAt);
    drag.lastY = event.clientY;
    drag.lastAt = now;
    drag.sheet.style.transform = drag.dy ? `translateY(${drag.dy}px)` : "";
  };
  const onGrabPointerEnd = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const finish = drag.dy > 90 || (drag.dy > 36 && (drag.velocity || 0) > 0.45);
    drag.sheet.style.transform = "";
    if (finish) onClose();
  };

  return (
    <>
    <div className={rootClass} ref={pageRef}>
      {windowForm && (
        <div
          className="profile-window-grab"
          aria-hidden="true"
          onPointerDown={onGrabPointerDown}
          onPointerMove={onGrabPointerMove}
          onPointerUp={onGrabPointerEnd}
          onPointerCancel={onGrabPointerEnd}
        >
          <span className="profile-window-grabber da-sheet-grab" />
        </div>
      )}
      <header className="profile-hero">
        {/* DEVICE-FIX REQ-19: the hero background follows the resolved
            banner — an upload or the designed default shows SHARP;
            only the portrait fallback keeps the blurred ambience. */}
        {profile.banner?.kind === "upload" || profile.banner?.kind === "default" ? (
          <span className="profile-hero-bg is-clear" style={{ backgroundImage: `url("${responsiveDefaultBannerUrl(profile.banner.url)}")` }} aria-hidden="true" />
        ) : mainAvatar?.hasPortrait && mainAvatar?.portraitUrl ? (
          <span className="profile-hero-bg" style={{ backgroundImage: `url("${mainAvatar.portraitUrl}")` }} aria-hidden="true" />
        ) : null}
        <span className="profile-hero-tint" aria-hidden="true" />
        <span className="profile-hero-shade" aria-hidden="true" />
        <div className="ryan-topbar">
          {windowForm ? (
            <button type="button" className="ryan-glyph-btn" onClick={onClose} aria-label="关闭主页">
              <Icon name="x" size={20} />
            </button>
          ) : <span aria-hidden="true" />}
          <span className="ryan-topbar-actions">
            <button type="button" className="ryan-glyph-btn" onClick={() => setShareOpen(true)} aria-label="分享主页">
              <Icon name="share" size={20} />
            </button>
            {/* The ··· menu only exists while it has something in it:
                with the duplicate copy-link item gone, its one job is
                reporting someone else — on your own profile the button
                itself retires (§37 I). */}
            {!isSelf && (
              <button
                type="button"
                className="ryan-glyph-btn"
                aria-label="更多操作"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <Icon name="dots" size={20} />
              </button>
            )}
          </span>
        </div>
        {menuOpen && !isSelf && (
          <div className="ryan-menu" role="menu">
            <button type="button" disabled={reported} onClick={() => void reportThisUser()}>
              {reported ? "已举报" : "举报该用户"}
            </button>
          </div>
        )}
        <div className="profile-hero-id">
          <span className={`profile-hero-face${profile.picture?.kind === "avatar" ? " is-portrait" : ""}`}>
            <img
              src={pictureSrc || "/default-avatar.svg"}
              alt=""
              onError={() => { if (pictureSrc !== "/default-avatar.svg") setPictureSrc("/default-avatar.svg"); }}
            />
          </span>
          <div className="profile-hero-name-row">
            <h1 className="profile-hero-name" data-name-tier={nameTier}>{shownName}</h1>
            {profile.avatar?.name ? <span className="profile-main-chip">主化身 · {profile.avatar.name}</span> : null}
          </div>
          {shownHandle && !nameIsHandle && <p className="profile-hero-handle">@{shownHandle}</p>}
          {/* The hero line is the PERSON's own introduction (§37): the
              stored bio, written in the same 编辑资料 sheet as the
              name. The avatar's description used to be borrowed for
              this slot; it describes the avatar, not the person, and
              never belonged here. No bio: the owner gets a tappable
              prompt, a visitor gets no line at all. */}
          {profile.bio ? (
            <p className="profile-hero-bio">{profile.bio}</p>
          ) : isSelf ? (
            <button type="button" className="profile-hero-bio is-placeholder" onClick={() => setEditOpen(true)}>
              写一句介绍自己
            </button>
          ) : null}
        </div>
      </header>

      <div className="profile-stats">
        <div className="profile-stat">
          <strong>{worksCount}</strong>
          <span>作品</span>
        </div>
        <div className="profile-stat">
          <strong>{profile.counts.publications}</strong>
          <span>上架</span>
        </div>
        <button type="button" className="profile-stat is-button" onClick={() => setConnectionsKind("followers")} aria-label={`查看 ${profile.counts.followers} 位粉丝`}>
          <strong>{profile.counts.followers}</strong>
          <span>粉丝</span>
        </button>
        <button type="button" className="profile-stat is-button" onClick={() => setConnectionsKind("following")} aria-label={`查看关注的 ${profile.counts.following} 人`}>
          <strong>{profile.counts.following}</strong>
          <span>关注</span>
        </button>
      </div>

      <div className="profile-actions">
        {isSelf ? (
          <button type="button" className="btn-pill-white" onClick={() => setEditOpen(true)}>编辑资料</button>
        ) : (
          <>
            <button
              type="button"
              className={`btn-pill-white profile-follow-btn ${following ? "is-following" : ""}`}
              disabled={busy}
              aria-pressed={following}
              onClick={(event) => void toggleFollow(event.currentTarget)}
            >
              {following ? "已关注" : "关注"}
            </button>
            <button type="button" className="profile-share-btn" onClick={() => setShareOpen(true)} aria-label="分享主页">
              <Icon name="share" size={18} />
            </button>
            {friendState === "friends" ? (
              <span className="profile-friend-chip">已是好友</span>
            ) : friendState === "pending-in" ? (
              <button type="button" className="profile-friend-btn" disabled={friendBusy} onClick={() => void actOnFriend("accept")}>
                同意好友申请
              </button>
            ) : friendState === "pending-out" ? (
              <button type="button" className="profile-friend-btn is-quiet" disabled={friendBusy} onClick={() => void actOnFriend("cancel")}>
                申请中 · 取消
              </button>
            ) : (
              <button
                type="button"
                className="profile-friend-btn"
                aria-expanded={friendComposing}
                onClick={() => {
                  if (!account.user) { onOpenAccount(); return; }
                  setFriendComposing((open) => !open);
                }}
              >
                <Icon name="users" size={16} /> 加好友
              </button>
            )}
          </>
        )}
      </div>
      {!isSelf && friendComposing && friendState === "none" && (
        <div className="friend-compose">
          <input
            value={friendDraft}
            maxLength={50}
            onChange={(event) => setFriendDraft(event.target.value)}
            placeholder="说一句打个招呼（可不填，最多 50 字）"
            aria-label="好友申请留言"
          />
          <button type="button" className="friend-compose-send" disabled={friendBusy} onClick={() => void actOnFriend("send")}>发送申请</button>
          <button type="button" className="friend-text-btn" onClick={() => setFriendComposing(false)}>取消</button>
        </div>
      )}
      {note && <p className="ryan-note" role="status">{note}</p>}

      {connectionsKind ? (
        <section className="profile-connections" aria-label={connectionsKind === "followers" ? "粉丝名单" : "关注名单"}>
          <div className="profile-collection-heading">
            <button
              type="button"
              className="profile-back-chip"
              onClick={() => setConnectionsKind(null)}
              aria-label="返回书架"
            >
              <Icon name="chevron" size={15} className="rotate-180" />
              书架
            </button>
            <div>
              <h2>{connectionsKind === "followers" ? "粉丝" : "关注"}</h2>
              <p>{connections ? `${connections.total} 人` : <span className="da-load-row"><span className="da-spinner da-spinner--sm" aria-hidden="true" />正在打开…</span>}</p>
            </div>
          </div>
          {connectionsError ? (
            <p className="profile-line-empty" role="alert">{connectionsError}</p>
          ) : !connections ? (
            <div role="status" aria-label="正在打开名单">
              {[0, 1, 2].map((i) => (
                <div className="da-skel-row" key={i} aria-hidden="true">
                  <span className="da-skel da-skel--circle" style={{ width: 40, height: 40 }} />
                  <span className="da-skel-colline">
                    <span className="da-skel da-skel--line" style={{ width: "52%" }} />
                    <span className="da-skel da-skel--line" style={{ width: "33%" }} />
                  </span>
                </div>
              ))}
            </div>
          ) : connections.people.length === 0 ? (
            <div>
              <img className="empty-inline-art" src="/art/empty-follows-512.webp" alt="" loading="lazy" />
              <p className="profile-line-empty">{connectionsKind === "followers" ? "还没有粉丝。" : "还没有关注任何人。"}</p>
            </div>
          ) : (
            <div className="profile-connection-list">
              {connections.people.map((person) => (
                <ProfileConnectionRow
                  key={person.uid}
                  person={person}
                  account={account}
                  busyUid={connectionBusyUid}
                  onToggleFollow={toggleConnectionFollow}
                  onOpenProfile={onOpenProfile}
                />
              ))}
              {connections.total > connections.people.length && (
                <p className="profile-line-empty">只列出最近的 {connections.people.length} 人。</p>
              )}
            </div>
          )}
        </section>
      ) : (
      <>
      <section className="profile-sec profile-shelf" aria-label="书架">
        <div className="profile-sec-head">
          {/* No count here: the stats row above already carries the
              作品 number — the same figure twice on one screen is
              first-rule noise (§40 ①). */}
          <h2 className="profile-sec-title">书架</h2>
          {ownBooks && (
            <button type="button" className="profile-sec-more" onClick={() => onNavigate("home")}>全部 ›</button>
          )}
        </div>
        {(ownBooks || publications).length > 0 ? (
          <>
            <div className="profile-shelf-row">
              {ownBooks
                ? ownBooks.map((story) => (
                    <ProfileShelfStoryBook
                      key={story.id}
                      story={story}
                      authClient={authClient}
                      account={account}
                      onOpen={onOpenStory || (() => {})}
                    />
                  ))
                : publications.map((publication) => (
                    <ProfileShelfPubBook key={publication.id} publication={publication} onOpen={onOpenDetail} />
                  ))}
              {isSelf && (
                <button type="button" className="profile-shelf-new" onClick={() => onNavigate("forge")} aria-label="新建故事">
                  <span className="profile-shelf-new-plus" aria-hidden="true"><Icon name="plus" size={20} /></span>
                  开新书
                </button>
              )}
            </div>
            <div className="profile-shelf-plank" aria-hidden="true" />
          </>
        ) : (
          <div className="profile-empty">
            <img className="profile-empty-art" src="/art/empty-shelf-512.webp" alt="" loading="lazy" />
            <div className="profile-empty-copy">
              <p>书架还是空的</p>
              <small>{isSelf ? "还没有属于自己的故事" : "TA 还没有公开的故事"}</small>
            </div>
            {isSelf && (
              <button type="button" className="profile-empty-go" onClick={() => onNavigate("forge")}>去造世 ›</button>
            )}
          </div>
        )}
      </section>

      <section className="profile-sec" aria-label="上架" data-enter>
        <div className="profile-sec-head">
          <h2 className="profile-sec-title">上架<small>书城在售</small></h2>
          {isSelf && publications.length > 0 && (
            <button type="button" className="profile-sec-more" onClick={() => onNavigate("plaza-publish")}>管理 ›</button>
          )}
        </div>
        {publications.length > 0 ? (
          <div className="profile-store-list">
            {publications.map((publication) => (
              <ProfileStoreCard key={publication.id} publication={publication} onOpen={onOpenDetail} />
            ))}
          </div>
        ) : (
          <div className="profile-empty">
            <img className="profile-empty-art" src="/art/empty-published-512.webp" alt="" loading="lazy" />
            <div className="profile-empty-copy">
              <p>暂无上架作品</p>
              <small>{isSelf ? "完结的故事线可以发布，连载中的无限长线也能边写边发" : "TA 还没有上架的书"}</small>
            </div>
          </div>
        )}
      </section>

      {(collection.length > 0 || isSelf) && (
        <section className="profile-sec" aria-label="化身" data-enter>
          <div className="profile-sec-head">
            <h2 className="profile-sec-title">化身<small>{isSelf ? "陪我走过每个世界" : "陪 TA 走过每个世界"}</small></h2>
            {isSelf && (
              <button type="button" className="profile-sec-more" onClick={onOpenAvatar}>全部 ›</button>
            )}
          </div>
          {stageAvatar ? (
            <>
              {/* REQ-64 showcase: the rebuilt avatar container. The
                  figure lives in its own 4:3 box (contain-fit, so the
                  head and shoes are inside the box by construction)
                  and the name plate flows BELOW it in normal layout —
                  nothing overlays the painting, and no scroll guard,
                  restore or parking logic exists on this surface any
                  more. The whole card is short enough to fit the
                  visible band between the topbar and the bottom nav
                  whole, so no resting scroll position can slice it. */}
              <div className="profile-showcase">
                <div className="profile-showcase-figure">
                  {stageAvatar.hasPortrait && stageAvatar.portraitUrl && stageFailedFor !== stageAvatar.id ? (
                    <>
                      {/* REQ-70: one painting, one proportion. The
                          ground is the portrait's own edge tones
                          (ShowcaseFill) and the halo behind the figure
                          is the SAME image at the SAME contain
                          geometry — only blurred, breathing ~10% past
                          the figure's edges — so no second scale of
                          the painting ever appears and a pale matte
                          melts into its own ground instead of ending
                          at a hard seam. The foreground copy stays
                          contain-fit: head to shoes always in frame. */}
                      <ShowcaseFill url={stageAvatar.portraitUrl} />
                      <img
                        className="profile-showcase-halo"
                        src={stageAvatar.portraitUrl}
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                      />
                      <img
                        className="profile-showcase-img"
                        src={stageAvatar.portraitUrl}
                        alt=""
                        loading="lazy"
                        onError={() => setStageFailedFor(stageAvatar.id)}
                      />
                      <ParticleField density="dust" className="profile-showcase-motes" />
                    </>
                  ) : (
                    <span className="profile-showcase-noface" aria-hidden="true">{[...(stageAvatar.name || "化")][0]}</span>
                  )}
                </div>
                <div className="profile-showcase-plate">
                  <div className="profile-showcase-main">
                    <p className="profile-showcase-name">
                      <strong>{stageAvatar.name}</strong>
                      {stageAvatar.isMain && <span className="profile-main-badge">主化身</span>}
                    </p>
                    {stageAvatar.appearance ? <p className="profile-showcase-desc">{stageAvatar.appearance}</p> : null}
                    {stageAvatar.ability?.name ? <p className="profile-showcase-ability">专属能力 · {stageAvatar.ability.name}</p> : null}
                  </div>
                  {stageAvatar.currentWorld ? <span className="profile-showcase-world">现驻 · {stageAvatar.currentWorld}</span> : null}
                </div>
              </div>
              <div className="profile-avatar-row">
                {collection.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`profile-avatar-tile${item.id === stageAvatar.id ? " is-selected" : ""}${item.isMain ? " is-main" : ""}`}
                    onClick={() => setStageAvatarId(item.id)}
                    aria-pressed={item.id === stageAvatar.id}
                    aria-label={`把 ${item.name} 放上展台`}
                  >
                    <span className="profile-avatar-tile-img">
                      {item.hasPortrait && item.portraitUrl ? (
                        <img src={item.portraitUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="profile-avatar-tile-letter" aria-hidden="true">{[...(item.name || "化")][0]}</span>
                      )}
                    </span>
                    <span className="profile-avatar-tile-name">{item.name}</span>
                  </button>
                ))}
                {isSelf && (
                  <button type="button" className="profile-avatar-new" onClick={onOpenAvatar} aria-label="新建化身">
                    <span className="profile-avatar-new-plus" aria-hidden="true">+</span>
                    <span className="profile-avatar-tile-name">新建化身</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="profile-empty">
              <img className="profile-empty-art" src="/art/empty-avatar-512.webp" alt="" loading="lazy" />
              <div className="profile-empty-copy">
                <p>还没有化身</p>
                <small>捏一个属于你的角色，陪你走过每个世界</small>
              </div>
              <button type="button" className="profile-empty-go" onClick={onOpenAvatar}>去创建 ›</button>
            </div>
          )}
        </section>
      )}
      {isSelf && !windowForm && (
        <FriendsPanel authClient={authClient} onOpenProfile={onOpenProfile} />
      )}
      {isSelf && !windowForm && (
        <section className="profile-sec profile-settings-entry" aria-label="设置">
          <div className="settings-card">
            <button type="button" className="settings-row settings-entry-row" onClick={() => setSettingsOpen(true)}>
              <span className="settings-row-ic"><Icon name="gear" size={19} /></span>
              <span className="settings-row-copy">
                <strong>设置</strong>
              </span>
              <Icon name="chevron" size={16} />
            </button>
          </div>
        </section>
      )}
      </>
      )}

    </div>
    {editOpen && isSelf && (
      <EditProfileSheet
        profile={profile}
        getToken={getToken}
        onClose={() => setEditOpen(false)}
        onSaved={(next) => {
          if (next) {
            setProfile(next);
            rememberProfile({ viewerUid, profile: next });
          }
        }}
      />
    )}
    {shareOpen && (
      <ShareProfileSheet
        text={shareText}
        isSelf={isSelf}
        onClose={() => setShareOpen(false)}
        onCopied={() => setNote("分享文案已复制。")}
        onCopyFailed={() => setNote("没能复制，请稍后再试。")}
      />
    )}
    {settingsOpen && isSelf && !windowForm && (
      <ReadingDialog title="设置" onClose={() => setSettingsOpen(false)}>
        <ProfileSettings
          account={account}
          authClient={authClient}
          shellTheme={shellTheme}
          onShellThemeChange={onShellThemeChange}
          onOpenAccount={() => { setSettingsOpen(false); onOpenAccount(); }}
          onOpenBilling={() => { setSettingsOpen(false); setBillingOpen(true); }}
          onOpenLibrary={() => { setSettingsOpen(false); onOpenLibrary(); }}
          onOpenHelp={() => { setSettingsOpen(false); onOpenHelp(); }}
          onOpenProfile={(target) => { setSettingsOpen(false); onOpenProfile?.(target); }}
          onNavigate={(next) => { setSettingsOpen(false); onNavigate(next); }}
        />
      </ReadingDialog>
    )}
    {billingOpen && isSelf && !windowForm && (
      <ReadingDialog title="会员与额度" onClose={() => setBillingOpen(false)}>
        <BillingPanel getToken={getToken} />
      </ReadingDialog>
    )}
    </>
  );
}
function OfficialDemoEntry({ onNavigate }) {
  // The publish gate explains the order (avatar first, then a finished
  // line) — this entry shows a newcomer what the destination looks like
  // before they walk it. It renders ONLY when an official sample line
  // actually exists in the bookstore; otherwise it stays absent entirely.
  const [official, setOfficial] = useState(null);
  useEffect(() => {
    let live = true;
    fetchStoreBooks({ limit: 60 })
      .then(({ books }) => { if (live) setOfficial(books.find((item) => item.official) || null); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  if (!official) return null;
  return (
    <section className="plaza-panel plaza-demo-entry">
      <div className="plaza-panel-heading">
        <h2>先看看一条走完的线长什么样</h2>
        <span className="plaza-badge is-official">官方示例</span>
      </div>
      <p className="plaza-note">《{official.title}》——织界官方的化身走完的完整故事线。读原作线不消耗你的生成额度，也能带自己的化身进去重演。</p>
      <Button variant="secondary" onClick={() => onNavigate("plaza-detail", { id: official.id })}>去看示例线 <Icon name="arrow" size={15} /></Button>
    </section>
  );
}

function PlazaPublish({ stories, avatar, avatarLoaded, account, authClient, onNavigate, onOpenAccount, onOpenAvatar, onToast, onBringAvatar }) {
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
      // Publish landing is a burst moment (§37 G3) — the canvas is
      // body-level, so it survives the navigation to the plaza.
      burstParticles();
      onToast("已上架到书城。");
      onNavigate("store");
    } catch (failure) {
      if (failure?.code === "auth-required") { onOpenAccount(); setError("请先登录，再上架。"); }
      else setError(failure?.message || "发布没能完成，请稍后再试。");
      setBusy(false);
    }
  };
  return (
    <div className="page page-plaza page-enter">
      <button type="button" className="back-link" onClick={() => onNavigate("store")}>
        <Icon name="chevron" size={15} className="rotate-180" /> 返回
      </button>
      <header className="plaza-heading">
        <h1>上架到书城</h1>
      </header>
      <OfficialDemoEntry onNavigate={onNavigate} />

      {!account.user ? (
        <div className="plaza-empty" role="status">
          <h3>先登录，再上架你的故事线</h3>
          <p>上架会记在你的账号名下，别人举报时也由你下架处理。</p>
          <Button onClick={onOpenAccount}>登录 / 注册</Button>
        </div>
      ) : avatarLoaded && !avatar && !rows.some((row) => isManualStory(row.story)) ? (
        <div className="plaza-empty" role="status">
          <h3>先有化身，才能上架它的故事线</h3>
          <p>书城里的故事线，都是某个化身走完的旅程。自己写的书不用化身——去造世选「自己写」就能开一本。</p>
          <Button onClick={onOpenAvatar}>创建我的化身</Button>
        </div>
      ) : (
        <>
          <h2 className="plaza-section-title">选择要上架的故事线</h2>
          {rows.length === 0 && (
            <div className="plaza-empty" role="status">
              <p>你还没有故事线。先用化身走一季、开一条无限连载，或者自己写一本，再来上架。</p>
              <Button variant="secondary" icon="arrow" onClick={() => onNavigate("forge")}>去造世</Button>
            </div>
          )}
          <div className="plaza-pick-list">
            {rows.map(({ story, gate }) => {
              const genre = genreOf(story);
              const published = Boolean(mine[story.id]);
              // The avatar-blocked row is the R-06 remedy surface: it
              // cannot be picked, but it is not a dead end either — the
              // main avatar can be brought into the line right here,
              // after which the gate re-reads and the row unlocks.
              const avatarBlocked = !gate.publishable && gate.needsAvatar === true;
              const copy = (
                <>
                  <span className="plaza-pick-cover"><WorldArtwork genreId={genre.id} /></span>
                  <span className="plaza-pick-copy">
                    <strong>《{story.title}》</strong>
                    <span>
                      {gate.publishable
                        ? gate.lineStatus === "serializing"
                          ? <><span className="plaza-badge">连载中</span> {plazaLengthLabel(story)} · 发布后新章自动跟上{isManualStory(story) ? " · 作者手写" : ""}{published ? " · 已在书城上" : ""}</>
                          : <><span className="plaza-badge">已完结</span> {plazaLengthLabel(story)}{isManualStory(story) ? " · 作者手写" : ""}{published ? " · 已在书城上，再次上架会更新" : ""}</>
                        : <>{story.kind === "merged" ? "合流故事" : isManualStory(story) ? "作者手写" : "连载中"} · {gate.reason}</>}
                    </span>
                  </span>
                </>
              );
              if (avatarBlocked) {
                return (
                  <div key={story.id} className="plaza-pick is-disabled plaza-pick-remedy">
                    {copy}
                    {avatar ? (
                      <Button
                        variant="secondary"
                        onClick={() => { onBringAvatar?.(story, avatar); setSelectedId(story.id); }}
                      >
                        带入化身「{avatar.name}」
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={onOpenAvatar}>先创建化身</Button>
                    )}
                  </div>
                );
              }
              return (
                <button
                  type="button"
                  key={story.id}
                  className={`plaza-pick ${selectedId === story.id && gate.publishable ? "active" : ""} ${gate.publishable ? "" : "is-disabled"}`}
                  aria-pressed={selectedId === story.id && gate.publishable}
                  disabled={!gate.publishable}
                  onClick={() => setSelectedId(story.id)}
                >
                  {copy}
                  {selectedId === story.id && gate.publishable && <Icon name="check" size={18} />}
                </button>
              );
            })}
          </div>

          <section className="plaza-panel">
            <h2>将上架的内容</h2>
            {selected && isManualStory(selected) ? (
              <ul className="plaza-checklist">
                <li><Icon name="check" size={15} /><span><strong>本书简介</strong><small>你自己写的那段介绍，原样上架</small></span></li>
                <li><Icon name="check" size={15} /><span><strong>正文全文</strong><small>已经写完的章节（还没写的空章不上架；连载中上架后，新章会自己跟上）</small></span></li>
                <li><Icon name="check" size={15} /><span><strong>作者手写</strong><small>这本书没有化身旅程，别人只能读，不能带化身进入，也不能合流</small></span></li>
              </ul>
            ) : (
              <ul className="plaza-checklist">
                <li><Icon name="check" size={15} /><span><strong>世界设定（脱敏版）</strong><small>私有设定与未公开分支不会上架</small></span></li>
                <li><Icon name="check" size={15} /><span><strong>原作线全文</strong><small>你化身走过的全部章节与当时的选择（连载中的线随新章更新）</small></span></li>
                <li><Icon name="check" size={15} /><span><strong>可进入的世界模板</strong><small>主线节拍骨架，供他人带化身重演</small></span></li>
              </ul>
            )}
          </section>

          <section className="plaza-panel">
            <div className="plaza-panel-heading">
              <h2>红线自动检查</h2>
              <span className="plaza-chip is-mint">发布时由服务端执行</span>
            </div>
            <p className="plaza-note">已扫描的口径与造世相同：世界设定与全部章节都会过一遍，命中违规内容会被拒绝上架，不会留下半截记录。</p>
          </section>

          <section className="plaza-panel">
            <h2>审核与下架</h2>
            <p className="plaza-note">上架后进入书城书目。下架只影响书城展示（广场上分享过它的帖子会显示已下架），不影响你本地的原作存档，随时可以重新上架。</p>
          </section>

          {error && <div className="sw-inline-alert" role="alert">{error}</div>}
          <div className="plaza-publish-actions">
            <Button disabled={!selected || busy} onClick={() => void publish()}>{busy ? "正在上架…" : "上架到书城"}</Button>
            {/* 「暂不上架」 read as a shelving state (上架's negation) and
                sat one tap away from the publish button (FINAL-FIX
                R-15): renamed to the plain deferral it actually is. */}
            <Button variant="ghost" disabled={busy} onClick={() => onNavigate("store")}>先不发布</Button>
          </div>
        </>
      )}
    </div>
  );
}

function PlazaEnter({ id, account, authClient, avatar, avatars = [], mainId = null, avatarLoaded, onNavigate, onOpenAccount, onOpenAvatar, onEnterLine }) {
  const [detail, setDetail] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [identityId, setIdentityId] = useState("");
  const [spawnName, setSpawnName] = useState("");
  const [spawnHook, setSpawnHook] = useState("");
  const [abilityName, setAbilityName] = useState("");
  // REQ-57: the same three-way ability source as the forge — the
  // chosen avatar's signature ability by default, a swap from this
  // book's candidates, or one written for this entry only. null = the
  // derived default (signature when the avatar has one, else swap).
  const [enterAbilitySource, setEnterAbilitySource] = useState(null);
  const [enterCustomAbility, setEnterCustomAbility] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [enterAvatarId, setEnterAvatarId] = useState(null);
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
        ability: enterAbilityName,
        abilityDesc: enterAbilityDesc,
        abilityBounds: enterAbilityBounds,
        avatarId: chosenAvatar?.id || "",
      }, { signal: controller.signal });
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure?.message || "进入没能完成，请稍后再试。");
    } finally {
      if (operation.current === controller) { operation.current = null; setBusy(false); }
    }
  };

  const chosenAvatar = avatars.find((item) => item.id === enterAvatarId)
    || mainAvatarOf(avatars, mainId)
    || avatar;
  // REQ-57 derived ability state: the chosen avatar's signature, the
  // effective source (signature only counts while one exists), and the
  // ability this entry will actually carry — falling back to the
  // book's first candidate exactly like the pre-REQ-57 default did.
  const chosenSignature = chosenAvatar ? avatarAbilityOf(chosenAvatar) : null;
  const enterSourceEff = !chosenAvatar
    ? null
    : enterAbilitySource === "signature" && !chosenSignature
      ? "swap"
      : enterAbilitySource || (chosenSignature ? "signature" : "swap");
  const enterPickedAbility = (enterSourceEff === "signature" && chosenSignature
    ? chosenSignature
    : enterSourceEff === "custom"
      ? (enterCustomAbility.trim() ? { id: "custom", name: enterCustomAbility.trim(), desc: "你亲手写下的能力" } : null)
      : abilities.find((item) => item.name === abilityName) || null) || abilities[0] || null;
  const enterAbilityName = enterPickedAbility?.name || "";
  const enterAbilityDesc = enterPickedAbility?.desc || "";
  const enterAbilityBounds = enterPickedAbility?.bounds || "";
  // Switching the avatar reopens the source choice on the new avatar's
  // own default; a half-typed custom ability does not follow across.
  const chosenAvatarId = chosenAvatar?.id || "";
  useEffect(() => {
    setEnterAbilitySource(null);
    setEnterCustomAbility("");
  }, [chosenAvatarId]);

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
          <p>进入后生成的新线会记在你的账号名下，生成费用也计入你的额度。</p>
          <Button onClick={onOpenAccount}>登录 / 注册</Button>
        </div>
      ) : avatarLoaded && avatars.length === 0 ? (
        <div className="plaza-empty" role="status">
          <h3>还没有你自己的化身</h3>
          <p>进入别人的世界，走的必须是属于你的那个人。</p>
          <Button onClick={onOpenAvatar}>创建我的化身</Button>
        </div>
      ) : (
        <>
          <div className="avatar-picker">
            <span className="field-label">带哪位化身进入？</span>
            {avatars.map((item) => (
              <div className={`avatar-bring ${chosenAvatar?.id === item.id ? "active" : ""}`} key={item.id}>
                <span className="avatar-bring-thumb">
                  <AvatarPortrait avatar={item} getAccessToken={() => authClient.getAccessToken()} />
                </span>
                <span className="avatar-bring-copy">
                  <b>{item.name}{item.id === mainId ? " · 主化身" : ""}</b>
                  <small>{avatarAppearanceText(item)}</small>
                </span>
                {chosenAvatar?.id === item.id
                  ? <span className="plaza-chip">就 TA 了</span>
                  : (
                    <button type="button" className="small-link" disabled={busy} onClick={() => setEnterAvatarId(item.id)}>
                      选 TA
                    </button>
                  )}
              </div>
            ))}
          </div>

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
            {/* REQ-57: with an avatar chosen, the source is asked out
                loud — signature by default, swap and hand-written as
                equals. Without an avatar (still loading) the plain
                candidate chips show, as before. */}
            {enterSourceEff ? (
              <>
                <div className="ability-source-list" role="radiogroup" aria-label="这本书的能力从哪来">
                  {chosenSignature ? (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={enterSourceEff === "signature"}
                      className={`ability-card ${enterSourceEff === "signature" ? "active" : ""}`}
                      disabled={busy}
                      onClick={() => setEnterAbilitySource("signature")}
                    >
                      <span>
                        <b>带{chosenAvatar?.name || "化身"}的专属能力进入</b>
                        <small>{chosenSignature.name}{chosenSignature.desc ? ` · ${chosenSignature.desc}` : ""}</small>
                      </span>
                      <span className="ability-radio">{enterSourceEff === "signature" && <i />}</span>
                    </button>
                  ) : (
                    <div className="ability-card is-unset">
                      <span>
                        <b>专属能力还没设置</b>
                        <small>在化身页给{chosenAvatar?.name || "TA"}预设一个，进任何世界都能直接带上。</small>
                      </span>
                      <button type="button" className="small-link" onClick={onOpenAvatar}>去设置</button>
                    </div>
                  )}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={enterSourceEff === "swap"}
                    className={`ability-card ${enterSourceEff === "swap" ? "active" : ""}`}
                    disabled={busy}
                    onClick={() => setEnterAbilitySource("swap")}
                  >
                    <span>
                      <b>换一个能力</b>
                      <small>从这本书的候选里挑，只用在这条新线</small>
                    </span>
                    <span className="ability-radio">{enterSourceEff === "swap" && <i />}</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={enterSourceEff === "custom"}
                    className={`ability-card ${enterSourceEff === "custom" ? "active" : ""}`}
                    disabled={busy}
                    onClick={() => setEnterAbilitySource("custom")}
                  >
                    <span>
                      <b>自己编辑一个</b>
                      <small>写一个只属于这条新线的能力，不改化身的预设</small>
                    </span>
                    <span className="ability-radio">{enterSourceEff === "custom" && <i />}</span>
                  </button>
                </div>
                {enterSourceEff === "signature" && chosenSignature && (
                  <p className="field-hint">这条新线就用「{chosenSignature.name}」开局。</p>
                )}
                {enterSourceEff === "swap" && (
                  <>
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
                  </>
                )}
                {enterSourceEff === "custom" && (
                  <label className="field-label ability-custom">
                    写下这条新线里用的能力
                    <input
                      maxLength={40}
                      autoComplete="off"
                      value={enterCustomAbility}
                      disabled={busy}
                      onChange={(event) => setEnterCustomAbility(event.target.value)}
                      placeholder="也可以写一个只属于你的能力"
                    />
                  </label>
                )}
              </>
            ) : (
              <>
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
              </>
            )}
          </div>

          <p className="plaza-note">进入后，新章节的生成费用计入你自己的额度。</p>
          {error && <div className="sw-inline-alert" role="alert">{error}</div>}
          <div className="plaza-publish-actions">
            <Button disabled={!identityId || busy} onClick={() => void enter()}>
              {busy ? "正在进入…" : `带${chosenAvatar?.name || ""}进入 · 写下第一章`}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => onNavigate("plaza-detail", { id })}>先不进入</Button>
          </div>
          {busy && <GenerationOverlay kind="story" onCancel={() => { operation.current?.abort(); operation.current = null; setBusy(false); }} />}
        </>
      )}
    </div>
  );
}

function MergeLineCard({ book, selected, onSelect, badge = "", ambiguous = false, gate = null }) {
  const genre = genreOf(book);
  const meta = fusionLineMetaFor(book);
  // N-03: when the same title appears twice in one picker, the card
  // grows a second fact line (world · protagonist · birth point) so
  // the two lines can be told apart before choosing, not after.
  const distinguisher = ambiguous ? storyDistinguisherFor(book) : "";
  // 合流权限 (REQ-49): a line entered from someone else's book carries
  // the author's consent state as its badge — 已获授权 when a grant
  // covers the reader, 需先申请 / 申请中 / 对方未开放合流 while it
  // cannot be picked. A locked card still takes the click so the page
  // can explain (or, for 需先申请， submit the application).
  const locked = Boolean(gate && !gate.canFuse);
  const badgeText = gate?.label || badge || meta.stateLabel;
  const badgeClass = gate?.label ? "is-gate" : badge ? "is-sample" : meta.stateKind;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-disabled={locked || undefined}
      className={`merge-line-card ${selected ? "active" : ""} ${locked ? "is-locked" : ""}`}
      onClick={onSelect}
    >
      <span className="merge-line-thumb">
        <WorldArtwork genreId={genre.id} />
      </span>
      <span className="merge-line-copy">
        <b>{book.title}</b>
        <small>{genre.world} · {meta.modeLabel} · {meta.progressLabel}</small>
        {distinguisher && <small className="merge-line-distinguisher">{distinguisher}</small>}
      </span>
      <span className={`merge-line-badge ${badgeClass}`}>{badgeText}</span>
      {selected && <Icon name="check" size={15} />}
    </button>
  );
}

function Merge({ activeStory, stories, onNavigate, onMerged, provider, authClient, onAuthRequired, avatar, avatars = [], preselect = null, onEnterPublication }) {
  const operation = useRef(null);
  const candidate = useRef(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null);
  const engine = mode || (provider.configured ? "gemini" : "local");
  useEffect(() => () => operation.current?.abort(), []);
  const originals = fusionCandidatesFor(stories);
  // N-03: titles that collide inside this picker — their cards grow a
  // distinguisher line (world · protagonist · birth point).
  const duplicateLineTitles = useMemo(() => {
    const counts = new Map();
    for (const story of originals) counts.set(story.title, (counts.get(story.title) || 0) + 1);
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([title]) => title));
  }, [originals]);
  // Contextual entries （书籍详情 / 书架 / 广场详情） arrive with a
  // preselected source; the plain 合流 entry arrives with none and keeps
  // the historical default (the active story, then the first other).
  const resolution = useMemo(
    () => resolveFusionPreselect({
      stories,
      storyId: preselect?.storyId || "",
      publicationId: preselect?.publicationId || "",
      mine: plazaMine(),
    }),
    [stories, preselect?.storyId, preselect?.publicationId],
  );
  // 合流多源 (REQ-53): the picker is one multi-select list — two to ten
  // lines, in pick order. The historical defaults seed it exactly as
  // the old two-pickers did (preselected source, then preselected
  // partner; else the active story, then the first other original;
  // the sample line fills the second seat when only one original
  // exists).
  const seedSelection = () => {
    const seeds = [];
    const push = (id) => { if (id && !seeds.includes(id)) seeds.push(id); };
    push(resolution.sourceId);
    push(resolution.partnerId);
    if (!seeds.length) {
      push(activeStory?.kind !== "merged" ? activeStory?.id : originals[0]?.id);
      push(originals.find((story) => story.id !== seeds[0])?.id);
    }
    if (seeds.length === 1 && originals.length <= 1) push(FRIEND_BOOK.id);
    return seeds.slice(0, MERGE_SOURCE_LIMIT);
  };
  const [selectedIds, setSelectedIds] = useState(seedSelection);
  const [leadId, setLeadId] = useState("");
  // A preselection that resolves after mount (the route changed while
  // the flow was open) still lands — once; afterwards the picks belong
  // to the reader.
  const appliedPreselect = useRef("");
  useEffect(() => {
    const key = `${resolution.sourceId}|${resolution.partnerId}|${resolution.pendingPublication}`;
    if (!resolution.sourceId && !resolution.partnerId && !resolution.pendingPublication) return;
    if (appliedPreselect.current === key) return;
    appliedPreselect.current = key;
    const seeds = [resolution.sourceId, resolution.partnerId].filter(Boolean);
    if (seeds.length) setSelectedIds([...new Set(seeds)].slice(0, MERGE_SOURCE_LIMIT));
  }, [resolution]);
  // The pending-publication notice reads better with the line's title;
  // the fetch is best-effort and the notice stands without it.
  const [pendingTitle, setPendingTitle] = useState("");
  useEffect(() => {
    if (!resolution.pendingPublication) { setPendingTitle(""); return undefined; }
    let live = true;
    fetchPlazaDetail({ id: resolution.pendingPublication })
      .then((detail) => { if (live && detail) setPendingTitle(detail.title || ""); })
      .catch(() => {});
    return () => { live = false; };
  }, [resolution.pendingPublication]);
  // The picked lines, in pick order; the sample line resolves to the
  // built-in demo book. Ids that stop resolving (a line deleted while
  // the flow is open) drop out of the cast rather than breaking it.
  const selectedStories = selectedIds
    .map((id) => (id === FRIEND_BOOK.id ? FRIEND_BOOK : originals.find((story) => story.id === id)))
    .filter(Boolean);
  const leadStory = selectedStories.find((story) => story.id === leadId) || selectedStories[0] || null;
  const leadIndex = Math.max(0, selectedStories.indexOf(leadStory));
  // Each line's avatar is the one that lived it, resolved from the
  // collection — any avatar, not only the main one. A deleted avatar
  // resolves to nothing and the card falls back to the story's own
  // protagonist (the config snapshot keeps the book intact).
  const avatarForStory = (story) => avatars.find((item) => item.id === story?.config?.avatarId) || null;
  // 合流权限 (REQ-49): lines entered from someone else's published
  // book fuse under THAT author's account setting. The server answers
  // per publication (setting + my durable grant + my pending
  // application); until it answers — or when it cannot be reached —
  // gates stay open and the publish-time check remains the backstop.
  const fusionPublicationIds = useMemo(
    () => [...new Set(originals.map((story) => story.config?.sourcePublicationId).filter(Boolean))],
    [originals],
  );
  const [fusionStatus, setFusionStatus] = useState({});
  const fusionStatusKey = fusionPublicationIds.join("|");
  useEffect(() => {
    if (!fusionStatusKey) return undefined;
    let live = true;
    fetchFusionStatus({
      publicationIds: fusionStatusKey.split("|"),
      getAccessToken: () => authClient.getAccessToken(),
    })
      .then((statuses) => { if (live) setFusionStatus(statuses || {}); })
      .catch(() => { /* offline posture: no gate without the server's word */ });
    return () => { live = false; };
  }, [fusionStatusKey]);
  const gateForStory = (story) => {
    const publicationId = story?.config?.sourcePublicationId || "";
    if (!publicationId) return fusionGateFor(null);
    return fusionGateFor(fusionStatus[publicationId]);
  };
  const [fusionNote, setFusionNote] = useState("");
  const [applyingId, setApplyingId] = useState("");
  const applyForLine = async (book, otherStory) => {
    const publicationId = book.config?.sourcePublicationId;
    if (!publicationId || applyingId) return;
    setApplyingId(book.id);
    setError("");
    try {
      await applyForFusion({
        publicationId,
        storyTitle: otherStory && otherStory.id !== FRIEND_BOOK.id ? otherStory.title || "" : "",
        avatarName: otherStory ? displayName(otherStory) : "",
        getAccessToken: () => authClient.getAccessToken(),
      });
      setFusionStatus((current) => ({
        ...current,
        [publicationId]: { ...(current[publicationId] || {}), pending: true },
      }));
      setFusionNote(`已向《${book.title}》的作者提交合流申请，对方同意后就能选它合流。`);
    } catch (failure) {
      if (failure?.code === "auth-required") onAuthRequired?.();
      else if (failure?.code === "conflict") {
        setFusionStatus((current) => ({
          ...current,
          [publicationId]: { ...(current[publicationId] || {}), pending: true },
        }));
        setFusionNote(failure.message);
      } else setError(failure?.message || "申请没能提交，请稍后再试。");
    } finally { setApplyingId(""); }
  };
  // Multi-select toggle (REQ-53): a gated line keeps the REQ-49
  // behaviour — 需先申请 submits the application on tap, pending /
  // forbidden explain instead of selecting. Picking past the ceiling
  // is refused with the limit said out loud; un-picking is always free.
  const toggleLine = (book) => {
    if (selectedIds.includes(book.id)) {
      setSelectedIds((current) => current.filter((id) => id !== book.id));
      return;
    }
    const gate = gateForStory(book);
    if (gate.state === "apply") {
      void applyForLine(book, selectedStories.find((story) => story.id !== book.id) || null);
      return;
    }
    if (!gate.canFuse) {
      setError(gate.state === "pending"
        ? `《${book.title}》的合流申请还在等对方同意，同意后就能选它合流。`
        : `《${book.title}》的作者未开放合流，这条线不能用来合流。`);
      return;
    }
    if (selectedIds.length >= MERGE_SOURCE_LIMIT) {
      setError(`一次合流最多选择 ${MERGE_SOURCE_LIMIT} 条故事线。`);
      return;
    }
    setError("");
    setSelectedIds((current) => (current.includes(book.id) ? current : [...current, book.id]));
  };
  const [rules, setRules] = useState("bridge");
  const [bond, setBond] = useState("allies");
  // 合流篇幅 (owner ruling 2026-10-30, UI landed at integration): the
  // reader picks the fused line's length — 短篇 6 章 / 一季 24 章 /
  // 长线 100 章 / 无限连载. Untouched, the combination table preselects
  // (every source finished → short; any source still serialising →
  // endless), exactly fusionProductModeFor; an explicit pick is passed
  // to the engine as storyLengthMode and wins over the table.
  const [lengthChoice, setLengthChoice] = useState(null);
  const lengthMode = lengthChoice || fusionProductModeFor(selectedStories);
  const [mergedStory, setMergedStory] = useState(null);
  const [error, setError] = useState("");
  const started = Boolean(mergedStory);
  if (!originals.length)
    return (
      <div className="page page-merge page-enter">
        <div className="sw-empty-page">
          <img className="empty-art" src="/art/empty-fusion-512.webp" alt="" loading="lazy" />
          <h1>先有你的故事。</h1>
          <p>再与另一个主角相遇，开启独立的新书。</p>
          <Button icon="arrow" onClick={() => onNavigate("forge")}>
            开启第一本书
          </Button>
        </div>
      </div>
    );
  const runMerge = async () => {
    if (operation.current) return;
    if (selectedStories.length < 2) {
      setError("至少选择两条故事线才能合流。");
      return;
    }
    // 合流权限 (REQ-49): no picked line may be one whose author has
    // not consented — the picker refuses the selection already, and
    // this is the same check, per line, at the moment of fusion.
    const blockedSide = selectedStories
      .map((story) => ({ story, gate: gateForStory(story) }))
      .find(({ gate }) => !gate.canFuse);
    if (blockedSide) {
      setError(blockedSide.gate.state === "pending"
        ? `《${blockedSide.story.title}》的合流申请还在等对方同意，同意后才能合流。`
        : blockedSide.gate.state === "ask"
          ? `《${blockedSide.story.title}》需要先向作者申请合流，对方同意后才能合流。`
          : `《${blockedSide.story.title}》的作者未开放合流，不能合流。`);
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    try {
      const signature = JSON.stringify([selectedStories, rules, leadIndex, bond, lengthMode, engine]);
      if (candidate.current?.signature !== signature) candidate.current = { signature, story: {
        ...createMergedStory(selectedStories, { rules, lead: leadIndex, bond, storyLengthMode: lengthMode }),
        mergeContext: selectedStories.map((story) => mergeSourceContext(story)),
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
          <p>选 2–10 条故事线，一本新故事。原书保留。</p>
        </div>
      </div>
      {!started && resolution.pendingPublication && (
        <div className="merge-pending" role="note">
          <p>
            广场上的{pendingTitle ? `《${pendingTitle}》` : "这条故事线"}还不在你的书架上——合流的来源只能是你自己的线，或你已带化身进入过的广场线。先进入这条线，它就会出现在下面的选择里。
          </p>
          {onEnterPublication && (
            <Button variant="secondary" onClick={() => onEnterPublication(resolution.pendingPublication)}>
              先带化身进入这条线
            </Button>
          )}
        </div>
      )}
      {!started && <div className="merge-book-selectors" inert={busy ? true : undefined}>
        <div className="merge-picker">
          <span className="field-label" id="merge-lines-label">选择故事线</span>
          <p className="merge-count" aria-live="polite">
            已选 {selectedStories.length} / {MERGE_SOURCE_LIMIT} 条
            {selectedStories.length < 2 ? "，至少选 2 条" : ""}
          </p>
          <div className="merge-line-list" role="group" aria-labelledby="merge-lines-label">
            {originals.map((book) => (
              <MergeLineCard
                key={book.id}
                book={book}
                ambiguous={duplicateLineTitles.has(book.title)}
                selected={selectedIds.includes(book.id)}
                gate={gateForStory(book)}
                onSelect={() => toggleLine(book)}
              />
            ))}
            <MergeLineCard
              book={FRIEND_BOOK}
              badge="示例"
              selected={selectedIds.includes(FRIEND_BOOK.id)}
              onSelect={() => toggleLine(FRIEND_BOOK)}
            />
          </div>
        </div>
      </div>}
      <div className="merge-stage merge-stage-multi">
        <div className={`merge-center ${started ? "started" : ""}`}>
          <div className="merge-core">
            <Icon name={started ? "check" : "git"} size={25} />
          </div>
        </div>
        {selectedStories.length ? (
          <div className="merge-stage-cast">
            {selectedStories.map((story) => {
              const storyGenre = genreOf(story);
              const storyAvatar = avatarForStory(story);
              return (
                <div className="merge-stage-chip" key={story.id}>
                  <span className="merge-stage-thumb">
                    <WorldArtwork genreId={storyGenre.id} />
                  </span>
                  <span className="merge-stage-chip-copy">
                    <b>{displayName(story)}</b>
                    <small>
                      {storyAvatar
                        ? `化身 · ${storyAvatar.name}`
                        : story.id === FRIEND_BOOK.id
                          ? "示例角色"
                          : "书架中的主角"}
                      {" · "}{storyGenre.label}
                    </small>
                  </span>
                  {leadStory?.id === story.id && <span className="merge-stage-lead">先开口</span>}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="merge-stage-empty">还没有选中的故事线——在上面点选至少两条。</p>
        )}
      </div>
      {error && (
        <div className="sw-inline-alert" role="alert">
          {error}
        </div>
      )}
      {!error && fusionNote && (
        <div className="merge-fusion-note" role="status">
          {fusionNote}
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
                {Array.isArray(mergedStory.sourceTitles) && mergedStory.sourceTitles.length >= 2 && (
                  <small className="merge-result-source">由{mergedStory.sourceTitles.map((title) => `《${title}》`).join("×")}融合而来</small>
                )}
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
                {selectedStories.map((story) => (
                  <button
                    key={story.id}
                    aria-pressed={leadStory?.id === story.id}
                    className={leadStory?.id === story.id ? "active" : ""}
                    onClick={() => setLeadId(story.id)}
                  >
                    {displayName(story)}
                  </button>
                ))}
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
              <span
                className="field-label sw-merge-subtitle"
                id="merge-length-label"
              >
                篇幅
              </span>
              <div
                className="priority-options"
                role="group"
                aria-labelledby="merge-length-label"
              >
                {[
                  ["short", "短篇 · 6 章"],
                  ["season", "一季 · 24 章"],
                  ["long", "长线 · 100 章"],
                  ["endless", "无限连载"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={lengthMode === value}
                    className={lengthMode === value ? "active" : ""}
                    onClick={() => setLengthChoice(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
          {!started && (
            <p className="merge-product-note">
              {lengthMode === "endless"
                ? "无限连载：没有预设终章，每 12 章一弧小升格，直到你亲手为它完结；各条原线未回收的伏笔，都会记到新线的账上。"
                : lengthMode === "season"
                  ? "一季 24 章：分 4 幕推进，走到季终收束全线。"
                  : lengthMode === "long"
                    ? "长线 100 章：分 4 弧推进，弧末是大节点。"
                    : "短篇 6 章：走完即止。"}
            </p>
          )}
          {!started && (
          <div className="merge-action">
            <GenerationMode provider={provider} value={engine} onChange={setMode} disabled={busy} />
            <Button icon={busy ? undefined : "arrow"} onClick={runMerge} disabled={busy}>
              {busy ? "正在翻开…" : "开启合流故事"}
            </Button>
            {busy && <button className="small-link" onClick={() => { operation.current?.abort(); operation.current = null; setBusy(false); }}>取消等待</button>}
            <p className="experience-note">{selectedStories.some((story) => story.id === FRIEND_BOOK.id) ? "包含示例角色。也可以新建另一本书，再来合流。" : "原书保留，新故事单独存入书架。"}</p>
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
  // IMPORT-DAYLIGHT: the backup panel is a real flow now, not a bare
  // file input. First screen (progressive disclosure): the shelf count,
  // an Export button, an Import button — the merge rules and the file
  // fine print live in the expandable notes below. Importing runs
  // choose → validate → summary confirmation → merge → receipt.
  const [candidate, setCandidate] = useState(null);
  const [receipt, setReceipt] = useState(null);
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
    setReceipt(null);
    setMessage("");
    setBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("备份不能超过 5 MB。");
      const restored = importLibrary(await file.text());
      if (request === fileRequest.current) {
        setCandidate({ library: restored, summary: summarizeLibraryImport(library, restored) });
      }
    } catch (error) {
      if (request === fileRequest.current) setMessage(error.message || "无法读取这份备份。");
    } finally {
      if (request === fileRequest.current) setBusy(false);
      event.target.value = "";
    }
  };
  const confirmImport = () => {
    if (!candidate) return;
    try {
      const { library: merged, summary } = mergeLibraryImport(library, candidate.library);
      store.restore(merged);
      setReceipt(summary);
      setCandidate(null);
    } catch (error) { setMessage(error.message); }
  };
  return <ReadingDialog title="书架与备份" onClose={onClose}>
    <div className="library-tools">
      <p>{library.stories.length} 本故事 · {library.publications.length} 份分享</p>
      {syncNote && <p className="field-hint">{syncNote}</p>}
      <div className="reading-dialog-actions">
        <Button variant="secondary" onClick={() => {
          try {
            downloadText(exportLibrary(library), `storyweave-${new Date().toISOString().slice(0, 10)}.json`);
            setMessage("备份已交给浏览器下载。");
          } catch (error) { setMessage(error.message); }
        }}>导出备份</Button>
        <label className="button button-primary backup-import-button">{busy ? "正在读取…" : "导入备份"}
          <input type="file" accept=".json,application/json" aria-label="选择备份文件" onChange={chooseBackup} disabled={busy} hidden />
        </label>
      </div>
      {candidate && <section className="backup-confirm">
        <h3>把这份备份并入书架？</h3>
        <p>
          备份里有 {candidate.summary.totalStories} 本故事：{candidate.summary.added} 本是新的，会加入书架
          {candidate.summary.updated > 0 && <>；{candidate.summary.updated} 本和现有的同名同 id，内容不同，会以备份里的为准更新</>}
          {candidate.summary.unchanged > 0 && <>；{candidate.summary.unchanged} 本和现有一模一样，不动</>}。
          现在书架上的 {candidate.summary.currentStories} 本故事一本都不会少。
          {candidate.summary.publicationsAdded > 0 && <>另有 {candidate.summary.publicationsAdded} 份分享记录会一并并入。</>}
          {candidate.summary.draftAdopted && <>备份里还有一份没写完的造世草稿，这台设备上正好没有，会一并带入。</>}
        </p>
        <div className="reading-dialog-actions">
          <Button onClick={confirmImport}>确认导入</Button>
          <Button variant="ghost" onClick={() => setCandidate(null)}>先不导入</Button>
        </div>
      </section>}
      {receipt && <section className="backup-confirm">
        <h3>导入完成</h3>
        <p>新增 {receipt.added} 本、更新 {receipt.updated} 本{receipt.publicationsAdded > 0 && <>、并入 {receipt.publicationsAdded} 份分享记录</>}。书架现在共 {library.stories.length} 本故事。</p>
        <div className="reading-dialog-actions">
          <Button onClick={onRestored}>去书架看看</Button>
        </div>
      </section>}
      <details className="backup-details">
        <summary>导入细则与说明</summary>
        <p className="field-hint">导入是「并入」不是「覆盖」：备份里有的新书会加入；同一本书两边都有、内容不同时以备份为准；这台设备上正在写的造世草稿不会被备份里的草稿冲掉。</p>
        <p className="field-hint">备份含个人设定（世界书条目、主角档案都在书里），请自行保管，别转发给不信任的人。化身不在书架备份里——化身跟着账号走，登录后自动回来。</p>
      </details>
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

function HelpContent() {
  // F-33: one honest help surface — how generation is metered, where
  // stories live, how recovery works, the plaza rules, and where to send
  // feedback. No invented support channels: feedback goes to the public
  // repository's issue tracker.
  const items = [
    {
      q: "织界是什么？怎么开始？",
      a: "织界是一部由你亲手塑造走向的互动小说：选世界、定出生点、捏一个化身，就能开一本只属于你的书。先去「造世」开第一本；读到中途想改走向，用阅读器里的「介入」给世界线添一把力——已经发生的不会变，下一章会绕着你的介入走。",
    },
    {
      q: "生成要花什么？额度怎么算？",
      a: "塑造按量计量，汇总在你的账号里（账号页「我的消耗」能看到累计）。全站每天有一个总上限（按 UTC 日计算），到达上限后当天的新塑造会暂停，第二天自动恢复。读已经写好的章节、介入已排队的内容都不额外计费。",
    },
    {
      q: "我的故事存在哪里？换设备会丢吗？",
      a: "故事先保存在当前浏览器；登录后，书架与阅读进度会同步到你的账号，换设备登录就能接着读。没登录时清理浏览器缓存会清掉本机故事，建议在「书架与备份」里导出一份。",
    },
    {
      q: "离线能读吗？",
      a: "能读已经在你设备上的书：本机书架的故事、已同步到这台设备的章节、打开过的广场故事线，断网时照常打开。生成新章、发布、合流这些需要联网的操作，离线时会等你回来再继续。",
    },
    {
      q: "密码忘了怎么办？",
      a: "邮箱账号可以用「忘记密码」收重设邮件。用户名账号如果在注册时或账号设置里绑了恢复邮箱，邮箱找回通道开通后能用邮箱验证码重设（通道没开通时账号页会如实说明）；没绑恢复邮箱又忘了密码，目前没法自助找回——所以建议尽早在账号设置里补绑。",
    },
    {
      q: "广场上的故事线是怎么来的？",
      a: "每条线都是一位读者的化身真实走完（或正在连载）的故事。走完一季、长线、自定义篇幅，或连载中的无限长线，可以发布到广场；别人能读原作，也能带自己的化身进入你的世界重走一遍。违规内容被 3 位不同读者举报后会自动下架。",
    },
    {
      q: "界面太亮/太暗，能换个样子吗？",
      a: "可以。在「我的主页」最下面的「设置」里切换外观主题：黑夜（默认）、白昼、极光（最初的深藏青玻璃风）；动效开关也收在设置里。阅读时的纸色、字号在阅读器自己的「阅读设置」里调，和外观主题互不影响。",
    },
  ];
  return (
    <div className="help-content">
      {items.map((item) => (
        <details key={item.q} className="help-item">
          <summary>{item.q}</summary>
          <p>{item.a}</p>
        </details>
      ))}
      <p className="help-feedback">
        没找到答案，或者想提建议、报问题：
        <a href="https://github.com/honru09/storyverse/issues" target="_blank" rel="noreferrer">在 GitHub 上反馈</a>
        ——写清你在哪一步、看到了什么，我们会在那里回复。
      </p>
    </div>
  );
}

/**
 * 写作台 (WRITE-MODE §50): the author's own surface over a hand-written
 * book. A chapter list on top (order, word counts, up/down/delete), one
 * plain editor below. The editor autosaves through the ordinary story
 * update, so a draft rides the same cloud-library sync as every other
 * book — write on the phone, continue on the desktop. No AI lives here:
 * no generate button, no quota, nothing that invents text.
 */
function WriteDesk({ story, onUpdateStory, onNavigate }) {
  const chapters = Array.isArray(story.chapters) ? story.chapters : [];
  const [selected, setSelected] = useState(() => Math.max(0, chapters.length - 1));
  const [draftTitle, setDraftTitle] = useState("");
  const [draftText, setDraftText] = useState("");
  const [saveNote, setSaveNote] = useState("");
  const [deskError, setDeskError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(-1);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const storyRef = useRef(story);
  storyRef.current = story;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const draftRef = useRef({ title: "", text: "" });
  draftRef.current = { title: draftTitle, text: draftText };
  const dirtyRef = useRef(false);
  const loadedKeyRef = useRef("");

  const loadChapter = useCallback((book, index) => {
    const chapter = (book.chapters || [])[index];
    loadedKeyRef.current = `${book.id}:${index}`;
    dirtyRef.current = false;
    setDraftTitle(chapter ? chapter.title || "" : "");
    setDraftText(chapter ? manualParagraphsToText(chapter.paragraphs) : "");
    setSaveNote("");
    setDeskError("");
  }, []);

  useEffect(() => {
    loadChapter(storyRef.current, selectedRef.current);
    // Loading is keyed to the book and the chosen chapter only: story
    // updates landing from our own autosave must never reload the
    // editor under the author's fingers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id, selected, loadChapter]);

  const commitDraft = useCallback(() => {
    if (!dirtyRef.current) return true;
    const book = storyRef.current;
    const index = selectedRef.current;
    if (!book.chapters?.[index]) { dirtyRef.current = false; return true; }
    try {
      const next = updateManualChapter(book, index, { title: draftRef.current.title, text: draftRef.current.text });
      dirtyRef.current = false;
      onUpdateStory?.(next);
      setSaveNote(`已保存 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
      setDeskError("");
      return true;
    } catch (failure) {
      setDeskError(failure.message || "这一章没能保存，请再试一次。");
      return false;
    }
  }, [onUpdateStory]);

  // Autosave: a short quiet beat after the last keystroke.
  useEffect(() => {
    if (!dirtyRef.current) return undefined;
    setSaveNote("正在保存…");
    const timer = window.setTimeout(() => { commitDraft(); }, 700);
    return () => window.clearTimeout(timer);
  }, [draftTitle, draftText, commitDraft]);

  // Leaving must not lose words: flush on unmount, and hold the tab
  // while a draft is still unsaved.
  useEffect(() => () => { commitDraft(); }, [commitDraft]);
  useEffect(() => {
    const warn = (event) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const pickChapter = (index) => {
    if (index === selected) return;
    if (!commitDraft()) return;
    setConfirmDelete(-1);
    setSelected(index);
  };
  const addChapter = () => {
    if (!commitDraft()) return;
    try {
      const next = appendManualChapter(storyRef.current, {});
      onUpdateStory?.(next);
      setConfirmDelete(-1);
      setSelected(next.chapters.length - 1);
    } catch (failure) {
      setDeskError(failure.message || "新章节没能建起来，请再试一次。");
    }
  };
  const deleteChapter = (index) => {
    try {
      const next = removeManualChapter(storyRef.current, index);
      dirtyRef.current = false;
      onUpdateStory?.(next);
      setConfirmDelete(-1);
      setSelected((current) => Math.max(0, Math.min(current, next.chapters.length - 1)));
    } catch (failure) {
      setDeskError(failure.message || "这一章没能删掉，请再试一次。");
    }
  };
  const moveChapter = (index, delta) => {
    if (!commitDraft()) return;
    const target = index + delta;
    try {
      const next = moveManualChapter(storyRef.current, index, target);
      if (next !== storyRef.current) onUpdateStory?.(next);
      if (selected === index) setSelected(target);
    } catch (failure) {
      setDeskError(failure.message || "章节没能移动，请再试一次。");
    }
  };
  const finishBook = () => {
    if (!commitDraft()) return;
    onUpdateStory?.(finishEndlessLine(storyRef.current));
    setConfirmFinish(false);
  };

  const finished = isManuallyFinished(story);
  const written = manualWrittenChapterCount(story);
  const draftWords = draftText.replace(/\s/g, "").length;
  const shelf = shelfById(story.config?.manualShelfId || "");
  const tags = manualTagsOf(story);
  const current = chapters[selected] || null;

  return (
    <div className="page page-write page-enter">
      <button type="button" className="back-link" onClick={() => { commitDraft(); onNavigate("home"); }}>
        <Icon name="chevron" size={15} className="rotate-180" /> 回书架
      </button>
      <header className="write-heading">
        <h1>《{story.title}》</h1>
        <p className="write-meta">
          <span className="plaza-badge">作者手写</span>
          共 {chapters.length} 章 · 写完 {written} 章 · {finished ? "已完结" : "连载中"}
          {shelf ? ` · ${shelf.name}` : ""}
          {tags.length > 0 ? ` · ${tags.join("、")}` : ""}
        </p>
      </header>

      <div className="write-actions">
        <Button variant="secondary" icon="book" onClick={() => { commitDraft(); onNavigate("reader", { storyId: story.id }); }}>
          在阅读器里看
        </Button>
        <Button variant="secondary" icon="send" onClick={() => { commitDraft(); onNavigate("plaza-publish"); }}>
          上架到书城
        </Button>
        {finished ? (
          <span className="write-finished-note">这本书已经完结。</span>
        ) : confirmFinish ? (
          <span className="write-finish-confirm">
            写完了？完结后书城里会标成已完结。
            <button type="button" className="small-link" onClick={finishBook}>确认完结</button>
            <button type="button" className="small-link" onClick={() => setConfirmFinish(false)}>再想想</button>
          </span>
        ) : (
          <button type="button" className="small-link" onClick={() => setConfirmFinish(true)}>
            标记完结
          </button>
        )}
      </div>
      <p className="field-hint">写完一章就能上架；上架后新写的章节会自己跟上。改书名和简介在阅读器的设定集里。</p>

      <section className="write-chapters" aria-label="章节列表">
        {chapters.length === 0 ? (
          <div className="plaza-empty" role="status">
            <img className="empty-art" src="/art/empty-write-512.webp" alt="" loading="lazy" />
            <h3>还没有章节</h3>
            <p>第一章从一句话开始就行——草稿自动保存，写错了随时改。</p>
            <Button icon="pencil" onClick={addChapter}>写第一章</Button>
          </div>
        ) : (
          <>
            <ol className="write-chapter-list">
              {chapters.map((chapter, index) => {
                const isCurrent = index === selected;
                // One counting source per screen (FINAL-FIX R-16): the
                // chapter being edited shows the editor's own live
                // count (draftWords — the same number over the
                // textarea), so the list and the editor can never
                // disagree mid-autosave; other rows count their saved
                // prose with the engine's counter, which is the same
                // whitespace-stripped measure.
                const words = isCurrent ? draftWords : manualChapterWordCount(chapter);
                return (
                  <li key={chapter.id} className={`write-chapter-row ${isCurrent ? "is-current" : ""}`}>
                    <button
                      type="button"
                      className="write-chapter-main"
                      aria-pressed={isCurrent}
                      onClick={() => pickChapter(index)}
                    >
                      <span className="write-chapter-index">第 {index + 1} 章</span>
                      <strong>{chapterTitleTextFor(chapter.title) || chapter.title}</strong>
                      <span className="write-chapter-words">{words > 0 ? `${words} 字` : "还没写"}</span>
                    </button>
                    <span className="write-chapter-tools">
                      <button type="button" className="small-link" disabled={index === 0} onClick={() => moveChapter(index, -1)}>上移</button>
                      <button type="button" className="small-link" disabled={index === chapters.length - 1} onClick={() => moveChapter(index, 1)}>下移</button>
                      {confirmDelete === index ? (
                        <>
                          <button type="button" className="small-link write-delete-confirm" onClick={() => deleteChapter(index)}>确认删除</button>
                          <button type="button" className="small-link" onClick={() => setConfirmDelete(-1)}>取消</button>
                        </>
                      ) : (
                        <button type="button" className="small-link" onClick={() => setConfirmDelete(index)}>删除</button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
            <Button variant="secondary" icon="plus" onClick={addChapter}>
              新建一章
            </Button>
          </>
        )}
      </section>

      {current && (
        <section className="write-editor" aria-label="章节编辑">
          <label className="field-label">
            第 {selected + 1} 章 · 标题
            <input
              type="text"
              maxLength={CHAPTER_TITLE_MAX}
              value={draftTitle}
              aria-label="章节标题"
              placeholder={`第 ${selected + 1} 章`}
              onChange={(event) => { dirtyRef.current = true; setDraftTitle(event.target.value); }}
            />
          </label>
          <label className="field-label">
            正文
            <textarea
              className="write-textarea"
              rows={16}
              value={draftText}
              aria-label="章节正文"
              placeholder="在这里写这一章。空行分段——回车两次，就是新的一段。"
              onChange={(event) => { dirtyRef.current = true; setDraftText(event.target.value); }}
            />
          </label>
          <div className="write-editor-foot">
            <span>{draftWords} 字</span>
            <span role="status">{deskError ? "" : saveNote}</span>
          </div>
          {deskError && (
            <p className="intervention-error" role="alert">
              {deskError}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function App() {
  const sceneRef = useRef(null);
  const [authClient] = useState(() => createAuthClient());
  const account = useSyncExternalStore(authClient.subscribe, authClient.getSnapshot);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountIntent, setAccountIntent] = useState(null);
  // The post-login hand-off (FINAL-FIX N4): the account sheet used to
  // stay open after a successful sign-in, swapping the login scene for
  // the account view whose first block is the recovery-binding form —
  // the first thing a reader saw after logging in was homework, and
  // whatever they were doing waited behind it. When the sheet was
  // opened while signed OUT and a user lands, it now closes itself
  // and resumes the interrupted intent. The binding reminder is not
  // deleted: opening the sheet while already signed in still shows it
  // — account housekeeping lives in the account sheet, it just no
  // longer ambushes the sign-in.
  const accountOpenedSignedOut = useRef(false);
  useEffect(() => {
    if (accountOpen && !account.user) accountOpenedSignedOut.current = true;
    if (accountOpen && account.user && accountOpenedSignedOut.current) {
      accountOpenedSignedOut.current = false;
      setAccountOpen(false);
      if (accountIntent === "forge") navigate("forge");
      setAccountIntent(null);
    }
    if (!accountOpen) accountOpenedSignedOut.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountOpen, account.user]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifyUnread, setNotifyUnread] = useState(0);
  useEffect(() => { void authClient.start(); return () => authClient.stop(); }, [authClient]);
  const [store] = useState(() => createLibraryStore());
  useEffect(() => { installRipple(); }, []);
  // Offline shell (F-18): register the service worker once; failures are
  // silent — the app simply stays online-only on that browser.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    // LOCAL-CACHE (REQ-50): ask the browser to keep the shell/media
    // caches out of best-effort eviction. Persistence is a request,
    // never a guarantee — iOS may still reclaim the storage under
    // pressure, and the app must (and does) stay correct when it does.
    try { void navigator.storage?.persist?.().catch(() => {}); } catch { /* older engines */ }
  }, []);
  const { library, warning, unsaved } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const setLibrary = store.update;
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  // Profile forms (PROFILE-FIX, DESIGN §33; user order 2026-10-28):
  // MY profile is a first-class PAGE — a bottom-nav tab like the other
  // three — while SOMEONE ELSE'S profile is a WINDOW over the current
  // page: baseRoute remembers the page underneath (which keeps
  // rendering, slightly receded) and the profile renders as an overlay
  // sheet on top of it. Deep links (#/profile/<uid>) land on the plaza
  // as their base; a deep link to your own profile resolves to the
  // page form as soon as the account does.
  const sessionUid = account.user?.uid || "";
  const ownProfilePage = Boolean(sessionUid) && route.view === "profile" && route.id === sessionUid;
  const [baseRoute, setBaseRoute] = useState(() => (route.view === "profile" ? { view: "plaza" } : route));
  useEffect(() => {
    if (route.view !== "profile" || ownProfilePage) setBaseRoute(route);
  }, [route, ownProfilePage]);
  const profileRoute = route.view === "profile" && !ownProfilePage ? route : null;
  const pageRoute = profileRoute ? baseRoute : route;
  const view = pageRoute.view;
  // Plaza sub-views (detail / publish / enter / plaza-read) all keep the
  // 广场 tab active in the sidebar and the bottom bar.
  const navView = pageRoute.plaza || view.startsWith("plaza") ? "plaza" : view;
  // Page keep-alive (PHONE-FIX §37 J): the main tab views — plaza,
  // home (the shelf), forge, store and my profile page — stay MOUNTED
  // after their first visit, hidden rather than unmounted, so coming
  // back is instant: component state (a forge run half-way through,
  // the plaza feed and its 60s silent refresh, the profile SWR cache)
  // and the window scroll position are exactly where they were left.
  // The bound is deliberate: only these five views + the one profile
  // WINDOW (SWR-cached, never stacked twice) are ever kept; the
  // reader is NOT kept (item K) — it mounts fresh on every entry and
  // unmounts on exit, its progress living in the reading store.
  const KEEPALIVE_VIEWS = ["plaza", "home", "forge", "store", "profile"];
  const isReaderTop = view === "reader" && !profileRoute;
  const [visitedViews, setVisitedViews] = useState(() => new Set([view]));
  useEffect(() => {
    if (KEEPALIVE_VIEWS.includes(view)) {
      setVisitedViews((current) => (current.has(view) ? current : new Set(current).add(view)));
    }
  }, [view]);
  const visitedSet = new Set(visitedViews);
  if (KEEPALIVE_VIEWS.includes(view)) visitedSet.add(view);
  const pageCacheRef = useRef({});
  const scrollPositionsRef = useRef({});
  // Navigation itself scrolls (to top, or to a restored position) —
  // the tracker must not record THOSE scrolls as the view's own
  // position, or leaving a view would save 0 over the reader's real
  // place. navigate() stamps this guard; the tracker sits out the
  // 120ms that follow any navigation.
  const scrollGuardRef = useRef(0);
  useEffect(() => {
    if (!KEEPALIVE_VIEWS.includes(view)) return undefined;
    const onScroll = () => {
      if (performance.now() - scrollGuardRef.current < 120) return;
      scrollPositionsRef.current[view] = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [view]);
  // Idle prefetch (J2/J3): once the first screen is interactive, warm
  // the surfaces a tab tap is likely to land on — the family wall art,
  // the waiting painting, the empty-state art — and, when signed in,
  // the viewer's own profile payload through the SWR cache. Guests
  // prefetch NO private data. The store list is derived locally from
  // the library + official sample, so it has no endpoint to warm.
  const prefetchDoneRef = useRef(false);
  useEffect(() => {
    if (prefetchDoneRef.current || account.status === "loading") return undefined;
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback.bind(window)
      : (callback) => window.setTimeout(callback, 1200);
    const cancelIdle = window.cancelIdleCallback
      ? window.cancelIdleCallback.bind(window)
      : (handle) => window.clearTimeout(handle);
    const handle = idle(() => {
      prefetchDoneRef.current = true;
      const warm = [
        ...["xuanzhen", "yanqing", "dushi", "lishi", "kehuan", "xuanyi", "fuben", "duanpian", "fanpai"]
          .map((id) => `/art/family-${id}-640.webp`),
        "/art/waiting-weaving-1600.webp",
        "/art/waiting-birth-1600.webp",
        "/art/waiting-growth-1600.webp",
        "/art/waiting-chapter-1600.webp",
        "/art/banner-store-1600.webp",
        "/art/empty-plaza-512.webp",
        "/art/empty-store-512.webp",
        "/art/empty-shelf-512.webp",
        "/art/empty-published-512.webp",
        "/art/empty-avatar-512.webp",
        "/art/empty-messages-512.webp",
      ];
      for (const src of warm) { const image = new Image(); image.src = src; }
      const uid = account.user?.uid || "";
      if (uid) {
        void loadProfile({ viewerUid: uid, uid, getAccessToken: () => authClient.getAccessToken() }).catch(() => {});
      }
    });
    return () => cancelIdle(handle);
  }, [account.status, account.user?.uid, authClient]);
  const [shellTheme, setShellThemeState] = useState(() => readShellTheme());
  const [helpOpen, setHelpOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [shareRequest, setShareRequest] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [toast, setToast] = useState("");
  const [provider, setProvider] = useState({ configured: false });
  const opening = useRef(null);
  const handledRouteRef = useRef("");
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
  // The bell badge (NOTIFY-SETTINGS §36): the unread total comes from
  // the same payload the panel renders, refreshed on sign-in and
  // once a minute while foregrounded. The panel reports back after
  // each category it marks read, so the badge never waits for the
  // next poll to clear.
  useEffect(() => {
    if (!viewerUid) { setNotifyUnread(0); return undefined; }
    let live = true;
    const load = () => {
      fetchNotifications({ getAccessToken: () => authClient.getAccessToken() })
        .then((result) => { if (live && result) setNotifyUnread(result.totalUnread || 0); })
        .catch(() => { /* a missed poll only leaves the badge stale */ });
    };
    load();
    const timer = window.setInterval(() => { if (!document.hidden) load(); }, 60_000);
    return () => { live = false; window.clearInterval(timer); };
  }, [authClient, viewerUid]);
  // Sign-out drops every cached profile payload: viewerState (follow
  // flags, self view) must never leak into the next account's session.
  const prevViewerUidRef = useRef("");
  useEffect(() => {
    if (prevViewerUidRef.current && !viewerUid) clearProfileCache();
    prevViewerUidRef.current = viewerUid;
  }, [viewerUid]);
  const openOwnProfile = useCallback(() => {
    if (viewerUid) navigate("profile", { id: viewerUid });
    else { setAccountIntent(null); setAccountOpen(true); }
  }, [viewerUid]);
  // Closing a profile WINDOW plays the entrance in reverse first
  // (PROFILE-FIX B1): the sheet slides back down over 320ms on the
  // same --ease-drawer curve and the backdrop fades with it, and only
  // then does the route change — never the old behaviour where the
  // sheet vanished in one frame while the base page spent another
  // half-second scaling back on its own. With motion off the close is
  // immediate (the CSS policy kills the keyframes anyway).
  const [profileClosing, setProfileClosing] = useState(false);
  const closeTimerRef = useRef(null);
  const closeProfile = useCallback(() => {
    if (closeTimerRef.current) { window.clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    setProfileClosing(false);
    const hash = routeHash(baseRoute);
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    setRoute(parseRoute(hash));
  }, [baseRoute]);
  const requestCloseProfile = useCallback(() => {
    if (profileClosing) return;
    if (sceneRef.current?.getAttribute("data-motion") === "off") { closeProfile(); return; }
    // Keyboard modality kills every animation (styles.css input-mode
    // rule), so an animated exit would sit frozen for the full timer
    // and then vanish — close at once instead, same as motion-off.
    if (document.documentElement.dataset.input === "keyboard") { closeProfile(); return; }
    setProfileClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      // A browser-back during the exit beats the timer: if the route
      // already left the profile, just drop the closing state.
      if (parseRoute(window.location.hash).view === "profile") closeProfile();
      else setProfileClosing(false);
    }, 330);
  }, [closeProfile, profileClosing]);
  // Scroll continuity (PROFILE-FIX B2, the P0): opening a window must
  // not move the page underneath, and closing returns to the exact
  // scroll position the reader left. navigate() no longer scrolls to
  // top for window opens; this ref restores the position on close as
  // the belt to that braces (deep links, hash edits).
  const baseScrollRef = useRef(null);
  const prevProfileRouteRef = useRef(null);
  useEffect(() => {
    const prev = prevProfileRouteRef.current;
    prevProfileRouteRef.current = profileRoute;
    if (!prev && profileRoute) baseScrollRef.current = window.scrollY;
    if (prev && !profileRoute && baseScrollRef.current != null) {
      const y = baseScrollRef.current;
      baseScrollRef.current = null;
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [profileRoute]);
  useEffect(() => {
    if (!profileRoute) return undefined;
    const onKey = (event) => { if (event.key === "Escape") requestCloseProfile(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profileRoute, requestCloseProfile]);
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
  // Keep the cloud shelf whole when the page goes away (FINAL-FIX
  // R-02): generation lands locally first and the debounced sync used
  // to be the only road up — closing the tab inside that window lost
  // the book. On hide/unload the sync drains what it owes with
  // keepalive requests instead.
  useEffect(() => {
    if (!cloudUid) return undefined;
    const drain = () => cloudSync.flushOnHide(cloudUid);
    const onVisibility = () => { if (document.visibilityState === "hidden") drain(); };
    window.addEventListener("pagehide", drain);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", drain);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [cloudUid, cloudSync]);
  // DEVICE-FIX REQ-26: the signed-in "shelf is synced" success line
  // is text noise — it no longer renders anywhere. Only the at-risk
  // states (signed out with local-only stories) still speak.
  const syncNote = account.user
    ? null
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
  // The bookstore's sample copy: when an official sample line exists on
  // the plaza, its real chapters ARE the sample (read-only). Resolved
  // once here so both the store shelf and the shared-reader route can
  // find the same story object.
  const [officialSample, setOfficialSample] = useState(null);
  // Whether the one-shot sample lookup has settled at all: a shared
  // reader route may only declare "book not found" once this is true,
  // otherwise a slow sample fetch would flash a false error (§40 ⓪).
  const [sampleSettled, setSampleSettled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { books } = await fetchStoreBooks({ limit: 60 });
        const official = books.find((item) => item.official);
        if (!official || cancelled) return;
        const detail = await fetchPlazaDetail({ id: official.id });
        if (cancelled || !detail) return;
        const story = plazaReaderStory(detail);
        if (story) {
          setOfficialSample({
            ...story,
            status: plazaLineStatusFor(detail) === "serializing" ? "ongoing" : "complete",
          });
        }
      } catch { /* no sample: the store falls back to its placeholders */ }
      finally { if (!cancelled) setSampleSettled(true); }
    })();
    return () => { cancelled = true; };
  }, []);
  const readerExternal = pageRoute.shared
    ? COMMUNITY_BOOKS.find((book) => book.id === pageRoute.id)
      || (officialSample && officialSample.id === pageRoute.id ? officialSample : null)
      || library.publications.find((item) => item.id === pageRoute.id)?.snapshot
    : null;
  const [plazaLines, setPlazaLines] = useState({});
  const readerStory = pageRoute.shared
    ? readerExternal
    : pageRoute.plaza
      ? plazaLines[pageRoute.id]
      : library.stories.find((story) => story.id === pageRoute.id);
  // A plaza reader route whose detail fetch failed must say so, not
  // sit on "正在打开…" forever (§40 ⓪).
  const [plazaRouteFailed, setPlazaRouteFailed] = useState(false);
  const [plazaRetryTick, setPlazaRetryTick] = useState(0);
  useEffect(() => { setPlazaRouteFailed(false); }, [pageRoute.id]);
  useEffect(() => {
    if (!pageRoute.plaza || !pageRoute.id || plazaLines[pageRoute.id]) return;
    let cancelled = false;
    fetchPlazaDetail({ id: pageRoute.id })
      .then((detail) => {
        if (cancelled) return;
        const story = detail ? plazaReaderStory(detail) : null;
        if (story) setPlazaLines((current) => ({ ...current, [pageRoute.id]: story }));
        else setPlazaRouteFailed(true);
      })
      .catch(() => { if (!cancelled) setPlazaRouteFailed(true); });
    return () => { cancelled = true; };
  }, [pageRoute.plaza, pageRoute.id, plazaLines, plazaRetryTick]);
  // READ-COUNT (REQ-42): a shelved book's text resolving into the
  // reader IS the open that counts — the same moment the line lands
  // for reading, beside where its opened-through reading begins.
  // Fired once per publication per app session (the server's daily
  // claim dedups across sessions), only for signed-in readers, and
  // strictly fire-and-forget: counting must never gate or disturb
  // reading. Shelf books and entered copies carry local story ids,
  // so only plaza-line stories (the published text itself, including
  // the shared official sample) can ever fire this.
  const readCountFiredRef = useRef(new Set());
  useEffect(() => {
    if (view !== "reader" || !account?.user) return;
    const storyId = readerStory?.id || "";
    if (!storyId.startsWith("plaza-line-")) return;
    const publicationId = storyId.slice("plaza-line-".length);
    if (!publicationId || readCountFiredRef.current.has(publicationId)) return;
    readCountFiredRef.current.add(publicationId);
    recordPlazaRead({ id: publicationId, getAccessToken: () => authClient.getAccessToken() }).catch(() => {});
  }, [view, readerStory?.id, account?.user]);
  // Reader-miss grace (§40 ⓪): a requested book that does not resolve
  // gets a short window for the cloud library to land before the route
  // may call it missing — and once declared missing it shows an honest
  // error, NEVER the empty-shelf page. The empty state is reserved for
  // a library that is genuinely empty with no book requested.
  const readerMiss = view === "reader" && !readerStory && !pageRoute.plaza
    && (Boolean(pageRoute.id) || library.stories.length > 0);
  // A shared route waits out the one-shot sample lookup first; every
  // other miss starts its grace timer immediately.
  const readerMissArmed = readerMiss && (!pageRoute.shared || sampleSettled);
  const [readerMissSettled, setReaderMissSettled] = useState(false);
  const [readerMissTick, setReaderMissTick] = useState(0);
  useEffect(() => {
    if (!readerMissArmed) { setReaderMissSettled(false); return undefined; }
    setReaderMissSettled(false);
    const timer = window.setTimeout(() => setReaderMissSettled(true), 1200);
    return () => window.clearTimeout(timer);
  }, [readerMissArmed, pageRoute.id, readerMissTick]);
  const { animate } = useMotionPolicy(view);
  // Shell theme switching (DESIGN §27): persist the device choice,
  // repaint the token attribute, and run the one-shot cross-fade veil —
  // unless the motion policy says stay still.
  const changeShellTheme = useCallback((next) => {
    const resolved = storeShellTheme(next);
    applyShellTheme(resolved);
    setShellThemeState(resolved);
    if (!animate) return;
    const root = document.documentElement;
    root.classList.add("theme-switching");
    window.setTimeout(() => root.classList.remove("theme-switching"), 360);
  }, [animate]);
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
      write: "写作台",
      store: "书城",
      merge: "世界合流",
      avatar: "我的化身",
    };
    // Someone else's profile WINDOW never rewrites the document
    // title (PROFILE-FIX B7): the page underneath keeps its name.
    // My own profile PAGE is a tab and titles itself like any tab.
    if (!profileRoute) {
      document.title = `${view === "reader" ? readerStory?.title || "故事未找到" : titles[view]} · 织界`;
    }
    // Opening or closing the profile window must not yank the base
    // page: no focus steal, no scroll reset — the reader returns to
    // exactly where they were (user order 2026-10-28).
    if (profileRoute) return;
    const routeKey = `${view}:${pageRoute.id || ""}`;
    if (handledRouteRef.current === routeKey) return;
    handledRouteRef.current = routeKey;
    if (view !== "reader" && view !== "forge") {
      const scope = sceneRef.current?.querySelector(`[data-keepalive="${view}"]`) || sceneRef.current;
      const heading = scope?.querySelector(".page h1");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus({ preventScroll: true });
      // Keep-alive returns restore the scroll the view was left at
      // (J1); a first visit still starts at the top.
      const saved = KEEPALIVE_VIEWS.includes(view) ? scrollPositionsRef.current[view] : null;
      scrollGuardRef.current = performance.now();
      if (typeof saved === "number" && saved > 0) {
        requestAnimationFrame(() => window.scrollTo(0, saved));
      } else {
        scrollToTop();
      }
      // REQ-64: no stage guard is armed here any more — the guard
      // module and every arming point were deleted with the old
      // stage. The generic keep-alive restore above is shell
      // infrastructure shared by all views and stays as is.
    }
  }, [view, pageRoute.id, readerStory?.title, profileRoute]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const navigate = (next, options = {}) => {
    // Freeze the outgoing view's scroll position BEFORE anything
    // scrolls, and arm the guard so the navigation's own scrolling
    // is never recorded as a view position (J1).
    if (KEEPALIVE_VIEWS.includes(view)) scrollPositionsRef.current[view] = window.scrollY;
    scrollGuardRef.current = performance.now();
    const nextRoute = next === "reader"
      ? {
          view: next,
          id: options.storyId || activeStory?.id,
          shared: Boolean(options.shared),
          ...(options.plaza ? { plaza: true } : {}),
          // DEVICE-FIX REQ-25: the surface the reader was opened FROM
          // (memory-only route state — never in the hash, so a refresh
          // drops it and the reader falls back to its default back
          // target). Reader.goBack honours it before the readOnly rule.
          ...(options.from ? { from: options.from } : {}),
        }
      : next === "plaza" && options.postId
        ? { view: next, postId: options.postId }
        : next === "write"
        ? { view: next, id: options.storyId }
        : next === "plaza-detail" || next === "plaza-enter" || next === "profile"
        ? { view: next, id: options.id }
        : next === "merge"
          ? {
              view: next,
              ...(options.storyId ? { id: options.storyId } : {}),
              ...(options.publicationId ? { publicationId: options.publicationId } : {}),
            }
          : { view: next };
    const hash = routeHash(nextRoute);
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    // parseRoute cannot see memory-only route state (REQ-25 `from`):
    // re-attach it so the reader still knows its origin surface.
    setRoute(nextRoute.from
      ? { ...parseRoute(hash), from: nextRoute.from }
      : parseRoute(hash));
    if (next !== "reader") setShareRequest(false);
    // Opening someone else's profile WINDOW must not scroll the page
    // underneath back to the top (PROFILE-FIX B2); every real page
    // change — including my own profile tab — keeps the scroll-to-top.
    const opensWindow = next === "profile" && Boolean(options.id) && options.id !== (account.user?.uid || "");
    if (!opensWindow && !KEEPALIVE_VIEWS.includes(next)) scrollToTop();
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
        const publication = await publishToPlaza({ story, getAccessToken: () => authClient.getAccessToken() });
        if (publication?.id) plazaMineRemember(undefined, story.id, publication);
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
    // BILLING gate: preparing a chapter nobody has asked for yet is a
    // background spend, so it is reserved for members and for lines
    // touched within the last three days (a line being read right now
    // always qualifies — opening it just stamped updatedAt; a record
    // with no timestamp at all is legacy and also qualifies, so the
    // gate never takes the prepared-next-chapter feel away from an
    // active reader). On-demand generation is never gated here.
    const updatedMs = source.updatedAt ? Date.parse(source.updatedAt) : NaN;
    const activeRecently = !Number.isFinite(updatedMs) || Date.now() - updatedMs < 3 * 86_400_000;
    if (!activeRecently && !(await billingGateMember({ getAccessToken: () => authClient.getAccessToken() }))) return;
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
  // pre-generation computed from the old telling — in flight or already
  // landed behind the frontier), then the pass runs over the same
  // /api/generate endpoint and usage accounting as any other chapter. A
  // failed pass leaves the old chapter standing — only its revision has
  // moved on. If the reader opens the next chapter while the pass is in
  // flight, the accept refuses the swap and the caller hears about it:
  // the chapter has locked, which is the house rule working.
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
    // A live request is never doubled; an orphaned pending stamp
    // (session died mid-flight, FINAL-FIX R-13) no longer blocks.
    if (!story || coverRequestInFlight(story)) return;
    const previous = coverStateOf(story);
    updateCoverState(id, { status: "pending", updatedAt: new Date().toISOString() });
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
  // REQ-58: the profile tab renders its avatar row from the public
  // profile payload, which lives in the profile cache — and avatar
  // mutations only refreshed the avatar hook above, so a freshly
  // created avatar stayed invisible on the (keep-alive) profile tab
  // until a full reload. Whenever the collection's content signature
  // really changes, revalidate the owner's own payload: the cache
  // notifies the mounted profile view in place. Content-equal
  // refreshes keep the signature, so this cannot loop.
  const ownAvatarSignature = avatarCollectionSignature(avatarState.avatars, avatarState.mainId);
  useEffect(() => {
    if (!viewerUid || !avatarState.loaded) return;
    void loadProfile({ viewerUid, uid: viewerUid, getAccessToken: () => authClient.getAccessToken() });
  }, [ownAvatarSignature, viewerUid, avatarState.loaded, authClient]);
  const generate = async (payload, { engine, signal }) => {
      const settingViolation = findSettingViolation(payload.customWorldSetting);
      if (settingViolation) throw new Error(settingViolation);
      // REQ-59: an edited preset-world draft is creator text too — same
      // hard pre-check before it can become a story.
      const worldDraftViolation = payload.genreId && payload.genreId !== CUSTOM_GENRE_ID
        ? findSettingViolation(payload.worldDrafts?.[payload.genreId]?.setting)
        : null;
      if (worldDraftViolation) throw new Error(worldDraftViolation);
      // REQ-63: a typed book title is refused at the same pre-check
      // gate as creator setting text, in the same human words the
      // rename path uses — never silently clipped into a name the
      // creator did not choose.
      const typedBookTitle = typeof payload.bookTitle === "string" ? payload.bookTitle.trim() : "";
      if (typedBookTitle && !bookTitleWithinLimit(typedBookTitle)) {
        throw new Error(`书名最多 ${BOOK_TITLE_MAX} 字。`);
      }
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
          worldDrafts: payload.worldDrafts,
          bookTitle: payload.bookTitle,
          lorebook: payload.lorebook,
          startPointName: payload.startPointName,
          startPointHook: payload.startPointHook,
          startPointCustom: payload.startPointCustom,
          name: payload.name,
          anchors: payload.anchors,
          persona: payload.persona,
          avatarId: payload.avatarId,
          avatarAppearance: payload.avatarAppearance,
          trait: payload.trait,
          origin: payload.origin,
          ability: payload.ability,
          abilityDesc: payload.abilityDesc,
          abilityBounds: payload.abilityBounds,
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
  // 自己写 (WRITE-MODE §50): opening a hand-written book is a local,
  // quota-free act — the record lands in the library like any other
  // book (and so rides the cloud sync), and the author lands in the
  // writing desk, not the reader.
  const createManualBook = ({ title, synopsis, shelfId, tags }) => {
    try {
      const story = createManualStory({ title, synopsis, shelfId, tags });
      setLibrary((current) => libraryWithStory(current, story));
      navigate("write", { storyId: story.id });
      return null;
    } catch (failure) {
      return failure.message || "这本书没能建起来，请再试一次。";
    }
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
  /**
   * Delete one of the reader's own books (DELETE-BOOK batch). While
   * signed in, the server delete runs first — it removes the cloud
   * copy, writes the tombstone other devices sync from, and cascades
   * to the line's plaza publication and generated cover — and only a
   * successful delete removes the book locally, so a failure leaves
   * the shelf exactly as it was and says why in plain words. Signed
   * out (or for a never-synced demo fixture) the book only ever lived
   * in this browser, so the removal is local. Reading positions and
   * bookmarks keyed to the book go with it; derived lines (entered or
   * fused copies) are separate stories and stay.
   */
  const confirmDeleteBook = async () => {
    const target = deleteTarget;
    if (!target || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      if (account.user && !target.isDemo) {
        await deleteCloudStory({ storyId: target.id, getAccessToken: () => authClient.getAccessToken() });
      }
    } catch (failure) {
      // 'library-unavailable' means the server keeps no account copy at
      // all — there is nothing server-side to clean, so the local
      // removal below is the whole delete. Anything else (offline,
      // expired session, server error) keeps the book and says why.
      if (failure?.code !== "library-unavailable") {
        setDeleteError(failure?.message || "删除没能完成，这本书还留在书架上，请稍后再试。");
        setDeleteBusy(false);
        return;
      }
    }
    try {
      const raw = window.localStorage.getItem(READING_LOCATION_KEY);
      if (raw) {
        const pruned = readingStateWithoutStory(JSON.parse(raw), target.id);
        window.localStorage.setItem(READING_LOCATION_KEY, JSON.stringify(pruned));
      }
    } catch { /* positions are a courtesy; the book itself is already gone */ }
    setLibrary((current) => {
      const stories = current.stories.filter((story) => story.id !== target.id);
      return {
        ...current,
        stories,
        activeStoryId: current.activeStoryId === target.id ? (stories[0]?.id ?? null) : current.activeStoryId,
      };
    });
    setDeleteBusy(false);
    setDeleteTarget(null);
    if (view === "reader" && pageRoute.id === target.id && !pageRoute.shared && !pageRoute.plaza) {
      navigate("home");
    }
    setToast(`《${target.title}》已删除。`);
  };
  const requestDeleteBook = (story) => {
    if (!story || story.readOnly) return;
    setDeleteError("");
    setDeleteTarget(story);
  };
  const openOwnReader = (storyId = activeStory?.id, options = {}) => {
    // Callers pass an id; one historical caller passed the whole story
    // object, which serialised into the route as "[object Object]" and
    // landed the reader on the empty-shelf page (DEDUP-FIX §40 ⓪).
    // Normalise here so no caller can reintroduce that shape.
    const id = typeof storyId === "string" ? storyId : storyId?.id;
    setShareRequest(Boolean(options.share));
    if (id)
      setLibrary((current) => ({ ...current, activeStoryId: id }));
    navigate("reader", { storyId: id, ...(options.from ? { from: options.from } : {}) });
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
  // Where the book detail was opened from decides its back target
  // (BOOKSTORE-PLAZA): the shelf returns to the bookstore, the stream
  // returns to the plaza.
  const [detailOrigin, setDetailOrigin] = useState("plaza");
  const openPlazaDetail = (publication, origin = "plaza") => {
    setDetailOrigin(origin);
    navigate("plaza-detail", { id: publication.id });
  };
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
    const ownAvatar = avatarState.avatars.find((item) => item.id === picks.avatarId) || avatarState.avatar;
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
  if (view === "write") {
    const writeStory = library.stories.find((story) => story.id === pageRoute.id);
    page = writeStory && isManualStory(writeStory) ? (
      <WriteDesk
        key={writeStory.id}
        story={writeStory}
        onUpdateStory={commitStory}
        onNavigate={navigate}
      />
    ) : (
      <div className="page page-enter">
        <p className="plaza-loading" role="status">正在打开写作台…</p>
        <Button variant="secondary" onClick={() => navigate("home")}>返回书架</Button>
      </div>
    );
  } else if (view === "forge")
    page = (
      <Forge
        provider={provider}
        onGenerate={generate}
        onCreateManual={createManualBook}
        initialDraft={legacyDraftToDraft(library)}
        onDraftChange={saveDraft}
        authClient={authClient}
        avatar={avatarState.avatar}
        avatars={avatarState.avatars}
        mainId={avatarState.mainId}
        avatarLoaded={avatarState.loaded}
        onOpenAvatar={() => navigate("avatar")}
      />
    );
  else if (view === "reader")
    page = route.plaza && !readerStory ? (
      plazaRouteFailed ? (
        <BookOpenError
          onRetry={() => { setPlazaRouteFailed(false); setPlazaRetryTick((tick) => tick + 1); }}
          onBack={() => navigate("plaza")}
          backLabel="回到广场"
        />
      ) : (
        <div className="page page-plaza page-enter">
          <p className="plaza-loading" role="status">正在打开这条故事线…</p>
          <Button variant="secondary" onClick={() => navigate("plaza")}>回到广场</Button>
        </div>
      )
    ) : readerMiss ? (
      readerMissSettled ? (
        <BookOpenError
          onRetry={() => { store.sync(); setReaderMissTick((tick) => tick + 1); }}
          onBack={() => navigate(pageRoute.shared ? "plaza" : "home")}
          backLabel={pageRoute.shared ? "回到广场" : "返回书架"}
        />
      ) : (
        <div className="page page-plaza page-enter">
          <p className="plaza-loading" role="status">正在打开这本书…</p>
        </div>
      )
    ) : (
      <Reader
        key={`${readerStory?.id || "empty"}:${readerExternal ? "shared" : route.plaza ? "plaza" : "own"}`}
        story={readerStory}
        readOnly={Boolean(readerExternal) || Boolean(route.plaza)}
        backRoute={route.plaza
          ? { view: "plaza-detail", id: route.id }
          : route.from === "plaza"
            ? { view: "plaza" }
            : null}
        backText={route.plaza || route.from === "plaza" ? "返回广场" : ""}
        onNavigate={navigate}
        onUpdateStory={commitStory}
        avatars={avatarState.avatars}
        onOpenAvatarPage={() => navigate("avatar")}
        onPrepareChapter={prepareChapter}
        onReviseChapter={reviseChapter}
        onRerollChapter={rerollChapter}
        onStartNextSeason={startNextSeasonFor}
        onToggleBookmark={commitStory}
        onPublish={publish}
        onDeleteStory={requestDeleteBook}
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
        onOpenBook={(book) => openPlazaDetail(book, "store")}
        onPublish={() => navigate("plaza-publish")}
        resumeSignal={route}
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
        preselect={{ storyId: pageRoute.id || "", publicationId: pageRoute.publicationId || "" }}
        onEnterPublication={(id) => navigate("plaza-enter", { id })}
        authClient={authClient}
        onAuthRequired={() => { setAccountIntent(null); setAccountOpen(true); }}
        avatar={avatarState.avatar}
        avatars={avatarState.avatars}
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
        authClient={authClient}
        activeStory={activeStory}
        stories={library.stories}
        focusPostId={pageRoute.postId || ""}
        onNavigate={navigate}
        onOpenStory={(storyId) => openOwnReader(storyId, { from: "plaza" })}
        onOpenDetail={openPlazaDetail}
        onReadLine={(publication) => void openPlazaLine(publication)}
        onEnter={(publication) => navigate("plaza-enter", { id: publication.id })}
        onOpenProfile={openProfile}
        onOpenAccount={() => { setAccountIntent(null); setAccountOpen(true); }}
        onToast={setToast}
      />
    );
  else if (view === "plaza-detail")
    page = (
      <PlazaDetail
        id={pageRoute.id}
        account={account}
        authClient={authClient}
        stories={library.stories}
        onNavigate={navigate}
        onBack={() => navigate(detailOrigin === "store" ? "store" : "plaza")}
        backLabel={detailOrigin === "store" ? "返回书城" : "返回广场"}
        onReadLine={(detail) => void openPlazaLine(detail)}
        onEnter={(detail) => navigate("plaza-enter", { id: detail.id })}
        onOpenAccount={() => { setAccountIntent(null); setAccountOpen(true); }}
        onToast={setToast}
        onOpenProfile={openProfile}
        onOpenBook={(publicationId) => openPlazaDetail({ id: publicationId }, detailOrigin)}
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
        onBringAvatar={(story, avatar) => {
          const next = bringAvatarIntoStory(story, avatar);
          if (next !== story) {
            commitStory(next);
            setToast(`已把化身带入《${story.title}》，这条线现在可以上架了。`);
          }
        }}
      />
    );
  else if (view === "plaza-enter")
    page = (
      <PlazaEnter
        id={pageRoute.id}
        account={account}
        authClient={authClient}
        avatar={avatarState.avatar}
        avatars={avatarState.avatars}
        mainId={avatarState.mainId}
        avatarLoaded={avatarState.loaded}
        onNavigate={navigate}
        onOpenAccount={() => { setAccountIntent(null); setAccountOpen(true); }}
        onOpenAvatar={() => navigate("avatar")}
        onEnterLine={enterPlazaLine}
      />
    );
  else if (view === "profile")
    page = (
      <ProfilePage
        uid={pageRoute.id}
        account={account}
        authClient={authClient}
        onNavigate={navigate}
        onOpenAccount={() => { setAccountIntent(null); setAccountOpen(true); }}
        onOpenAvatar={() => navigate("avatar")}
        onOpenDetail={openPlazaDetail}
        onOpenProfile={openProfile}
        ownStories={library.stories}
        onOpenStory={openOwnReader}
        shellTheme={shellTheme}
        onShellThemeChange={changeShellTheme}
        onOpenLibrary={() => setLibraryOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
      />
    );
  else
    page = (
      <Home
        onNavigate={navigate}
        onOpenStory={openOwnReader}
        onDeleteStory={requestDeleteBook}
        activeStory={activeStory}
        stories={library.stories}
        draft={library.draft}
        account={account}
        authClient={authClient}
        onOpenAccount={() => { setAccountIntent(activeStory ? null : "forge"); setAccountOpen(true); }}
        avatar={avatarState.avatar}
        onOpenAvatar={() => navigate("avatar")}
        syncNote={syncNote}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenLibrary={() => setLibraryOpen(true)}
      />
    );
  if (KEEPALIVE_VIEWS.includes(view)) pageCacheRef.current[view] = page;
  return (
    <div
      ref={sceneRef}
      className={`app-shell ${profileRoute && !profileClosing ? "has-profile-window" : ""} ${isReaderTop ? "is-reader-top" : ""}`}
      data-view={view}
      data-motion={animate ? "on" : "off"}
    >
      {!isReaderTop && <AuroraBackground />}
      {!isReaderTop && <Sidebar view={profileRoute ? "profile" : navView} onNavigate={navigate} onOpenProfile={openOwnProfile} />}
      <main className="main-shell">
        {!isReaderTop && <Topbar onNavigate={navigate} account={account} unreadCount={notifyUnread} onOpenNotifications={() => setNotificationsOpen(true)} onOpenAccount={() => { setAccountIntent(null); setAccountOpen(true); }} />}
        {warning && !isReaderTop && (
          <div className="sw-storage-warning" role="alert">
            <Icon name="lock" size={14} />
            <span>{warning}</span>
            <button onClick={() => setLibraryOpen(true)}>备份与恢复</button>
          </div>
        )}
        {!isReaderTop && <div className="da-fade-blur da-fade-blur--nav" aria-hidden="true" />}
        {!isReaderTop && <MobileBottomNav view={profileRoute ? "profile" : navView} onNavigate={navigate} onOpenProfile={openOwnProfile} />}
        {/* Keep-alive slots (J): every visited main view stays mounted
            in its own slot, hidden while inactive. The reader (K) is
            NOT slotted — it renders as a direct child of the shell's
            main region, a sibling of the slots, never inside any
            page's subtree, and unmounts on exit. */}
        {KEEPALIVE_VIEWS.filter((slot) => visitedSet.has(slot)).map((slot) => (
          <div key={slot} className="keepalive-view" data-keepalive={slot} hidden={isReaderTop || view !== slot}>
            {view === slot && !isReaderTop ? page : pageCacheRef.current[slot] || null}
          </div>
        ))}
        {!KEEPALIVE_VIEWS.includes(view) && page}
      </main>
      {profileRoute && (
        <div className={`profile-window ${profileClosing ? "is-closing" : ""}`} role="dialog" aria-modal="true" aria-label="个人主页">
          <button type="button" className="profile-window-backdrop" aria-label="关闭主页" onClick={requestCloseProfile} />
          <div className="profile-window-sheet da-sheet-frame">
            <ProfilePage
              uid={profileRoute.id}
              account={account}
              authClient={authClient}
              onNavigate={navigate}
              onOpenAccount={() => { setAccountIntent(null); setAccountOpen(true); }}
              onOpenAvatar={() => navigate("avatar")}
              onOpenDetail={openPlazaDetail}
              onOpenProfile={openProfile}
              onClose={requestCloseProfile}
            />
            <span className="da-fade-blur da-fade-blur--sheet da-fade-blur--over" aria-hidden="true" />
          </div>
        </div>
      )}
      {notificationsOpen && account.user && <ReadingDialog title="消息" onClose={() => setNotificationsOpen(false)}>
        <NotificationsPanel
          authClient={authClient}
          onUnreadChange={setNotifyUnread}
          onOpenProfile={(uid) => { setNotificationsOpen(false); openProfile(uid); }}
        />
      </ReadingDialog>}
      {accountOpen && !account.user && (
        <AccountSceneDialog onClose={() => setAccountOpen(false)}>
          <AccountPanel client={authClient} account={account} shellTheme={shellTheme} onShellThemeChange={changeShellTheme} onOpenHelp={() => { setAccountOpen(false); setHelpOpen(true); }} onOpenAvatar={() => { setAccountOpen(false); navigate("avatar"); }} onOpenProfile={() => { setAccountOpen(false); if (account.user?.uid) navigate("profile", { id: account.user.uid }); }} onContinue={() => {
            setAccountOpen(false);
            if (accountIntent === "forge") navigate("forge");
            setAccountIntent(null);
          }}/>
        </AccountSceneDialog>
      )}
      {accountOpen && account.user && <ReadingDialog title="我的账号" onClose={() => setAccountOpen(false)}>
        <AccountPanel client={authClient} account={account} shellTheme={shellTheme} onShellThemeChange={changeShellTheme} onOpenHelp={() => { setAccountOpen(false); setHelpOpen(true); }} onOpenAvatar={() => { setAccountOpen(false); navigate("avatar"); }} onOpenProfile={() => { setAccountOpen(false); if (account.user?.uid) navigate("profile", { id: account.user.uid }); }} onContinue={() => {
          setAccountOpen(false);
          if (accountIntent === "forge") navigate("forge");
          setAccountIntent(null);
        }}/>
      </ReadingDialog>}
      {helpOpen && <ReadingDialog title="帮助与常见问题" onClose={() => setHelpOpen(false)}>
        <HelpContent />
      </ReadingDialog>}
      {libraryOpen && <LibraryTools store={store} library={library} syncNote={syncNote} onClose={() => setLibraryOpen(false)} onRestored={() => {
        setLibraryOpen(false);
        navigate("home");
        setToast("书架已恢复。");
      }} />}
      {deleteTarget && (
        <DeleteBookDialog
          story={deleteTarget}
          busy={deleteBusy}
          error={deleteError}
          onCancel={() => { setDeleteTarget(null); setDeleteError(""); }}
          onConfirm={confirmDeleteBook}
        />
      )}
      {toast && (
        <div className="sw-toast da-toast" role="status" aria-live="polite">
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
