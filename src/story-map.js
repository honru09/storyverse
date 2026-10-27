import { CHAPTER_COUNT } from "./reading-flow.js";

/**
 * Story map model (DESIGN.md §8): chapters are star nodes, progress is
 * the lit path. Pure state math for src/components/StoryMap.jsx.
 *
 * Node states:
 * - done    已读：index < current, solid pink
 * - current 正在读：pulsing cyan
 * - ready   已备好：generated ahead of the reader, solid mint
 * - pending 生成中/待生成：the next ungenerated chapter, dashed violet breath
 * - locked  未解锁：dim
 */

export function chapterStates({ total = CHAPTER_COUNT, generated = 0, current = 0 }) {
  // An unbounded total (a running endless line) must never reach the
  // array constructor: fall back to the chapters that exist plus the one
  // being written. Call sites pass a display total via mapTotalFor; this
  // is the belt under those braces.
  const safeTotal = Number.isFinite(total) && total > 0
    ? Math.floor(total)
    : Math.max(generated + 1, current + 1, 1);
  return Array.from({ length: safeTotal }, (_, index) => {
    if (index === current) return "current";
    if (index < current && index < generated) return "done";
    if (index < generated) return "ready";
    if (index === generated) return "pending";
    return "locked";
  });
}

/**
 * Small-size readability floor (DESIGN §27): a strip ~340px wide keeps
 * nodes legible down to ~22px of horizontal room each — beyond 16 nodes
 * the map aggregates into at most 12 segment nodes instead of shrinking
 * into mush (a 100-chapter line used to compress to ~3px per node).
 * Each segment summarises its run: current wins, then done (every
 * chapter read), ready (every chapter generated), pending (the run
 * holds the generation frontier), else locked. `index` is the chapter a
 * tap should open: the current chapter when inside, else the run's
 * first chapter.
 */
export function aggregateStates(states, maxNodes = 12) {
  const count = states.length;
  if (count <= 16) return states.map((state, index) => ({ state, index, from: index, to: index }));
  const size = Math.ceil(count / maxNodes);
  const segments = [];
  for (let from = 0; from < count; from += size) {
    const slice = states.slice(from, from + size);
    const to = from + slice.length - 1;
    const currentAt = slice.indexOf("current");
    let state = "locked";
    if (currentAt !== -1) state = "current";
    else if (slice.every((item) => item === "done")) state = "done";
    else if (slice.every((item) => item === "done" || item === "ready")) state = "ready";
    else if (slice.includes("pending") || slice.includes("ready") || slice.includes("done")) state = "pending";
    segments.push({ state, index: currentAt !== -1 ? from + currentAt : from, from, to });
  }
  return segments;
}
