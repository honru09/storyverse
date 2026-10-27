// List-surface helpers for the shelf grid, store ranking card and store
// cover grid (DESIGN.md §2 list type scale). Everything here is derived
// from real story fields only — chapter counts, completion and season
// numbers that the engine actually stores. There is deliberately no
// popularity/heat input: the site has no such data, so list surfaces
// never display any.
import { GENRES, isStoryComplete, storyLengthModeOf, totalChaptersFor } from "./story-engine.js";
import { readerIndexFor } from "./reading-flow.js";

export const generatedCount = (story) =>
  Array.isArray(story?.chapters) ? story.chapters.length : 0;

export const storyComplete = (story) =>
  Boolean(story) && (story.status === "complete" || isStoryComplete(story));

export const seasonNumberOf = (story) => {
  const value = story?.config?.seasonNumber;
  return Number.isInteger(value) && value >= 1 && value <= 99 ? value : 1;
};

// "第X季" only exists for season-mode stories; every other mode returns
// null so callers fall back to the 连载/完结 wording instead of inventing
// a season the story does not have.
export const seasonLabel = (story) =>
  storyLengthModeOf(story) === "season" ? `第${seasonNumberOf(story)}季` : null;

// Cover corner badge: completion wins, then the season marker, then the
// plain serial state. Mirrors the store's existing type wording.
export const statusBadgeFor = (story) => {
  if (storyComplete(story)) return "已完结";
  return seasonLabel(story) ?? "连载中";
};

// One-line progress text built from generated/total chapters only. A
// running endless line has no total: it reports its live count instead.
export const progressLabelFor = (story) => {
  const total = totalChaptersFor(story);
  const generated = generatedCount(story);
  if (storyComplete(story)) return `全 ${Number.isFinite(total) ? total : generated} 章`;
  if (!Number.isFinite(total)) return `连载中 · 已更 ${generated} 章`;
  if (generated > 0) return `第 ${generated} / ${total} 章`;
  return `共 ${total} 章`;
};

// Shelf meta line: where the reader currently is, plus the serial state.
// Season stories name their season instead of a bare 连载中.
export const shelfMetaFor = (story) => {
  const total = totalChaptersFor(story);
  if (storyComplete(story)) return `已完结 · 全 ${total} 章`;
  const current = Math.min(total, readerIndexFor(story) + 1);
  return `第 ${current} 章 · ${seasonLabel(story) ?? "连载中"}`;
};

// Big-cover overlay line (store grid): season marker first when the story
// really is a season, then the chapter progress.
export const coverInfoFor = (story) => {
  const season = seasonLabel(story);
  const progress = progressLabelFor(story);
  return season && !storyComplete(story) ? `${season} · ${progress}` : progress;
};

// Ranking order is honest: most generated chapters first (the only
// quantity the site actually has), title as a stable tiebreak. Entries
// are store book objects; counts come from their snapshots.
export function rankStoreBooks(books, { completeOnly = false } = {}) {
  return (books || [])
    .filter((book) => !completeOnly || storyComplete(book.snapshot))
    .slice()
    .sort((a, b) => {
      const byChapters = generatedCount(b.snapshot) - generatedCount(a.snapshot);
      if (byChapters !== 0) return byChapters;
      return String(a.title).localeCompare(String(b.title), "zh");
    });
}

// Ranking meta line: category is rendered separately (aurora accent), the
// rest is plain data — world name when the genre provides one, then the
// chapter progress. No world, no segment; nothing is padded or invented.
export const rankMetaFor = (book) => {
  const world = book.snapshot ? genreWorldOf(book.snapshot) : null;
  const progress = progressLabelFor(book.snapshot);
  return world ? `${world} · ${progress}` : progress;
};

// Mirror of main.jsx genreOf's resolution (story.genreId, then
// config.genreId, then the first genre) so the ranking card names the
// same world the rest of the site shows for a story.
export function genreWorldOf(story) {
  if (!story) return null;
  const genre =
    GENRES.find((item) => item.id === story.genreId) ||
    GENRES.find((item) => item.id === story.config?.genreId) ||
    GENRES[0];
  return genre?.world || null;
}

// --- Wooden shelf (DESIGN.md 「书架（木质 2.5D）」) -----------------------
// The shelf groups books onto planks. The grouping is a pure function of
// the book list and the per-plank capacity for the current viewport, so
// the render order — and which plank is the partial last one — is stable
// and testable.
export function chunkShelves(stories, perShelf = 3) {
  const size = Number.isInteger(perShelf) && perShelf > 0 ? perShelf : 3;
  const rows = [];
  const list = Array.isArray(stories) ? stories : [];
  for (let index = 0; index < list.length; index += size) {
    rows.push(list.slice(index, index + size));
  }
  return rows;
}

// A book's resting tilt is seeded from its id (FNV-1a): the same book
// leans the same way on every visit, neighbours do not mirror each other,
// and the lean stays inside ±1.2° so spines read as settled, not sloppy.
export function shelfTiltFor(story) {
  const id = String(story?.id || "");
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (((hash >>> 0) % 25) - 12) / 10;
}

// Printed cover titles: short titles sit horizontally over the cover's
// lower scrim; long ones switch to the vertical title label (题签) so a
// long name never wraps across the artwork.
export const coverTitleLayoutFor = (story) =>
  String(story?.title || "").length > 8 ? "vertical" : "horizontal";
