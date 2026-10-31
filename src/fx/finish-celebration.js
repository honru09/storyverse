// PIXELFX-WAVE4 (§60) — the season-finale celebration ledger.
//
// The finale beat belongs to a *presentation* moment: a book flipping
// to complete happens wherever the last chapter lands (the reader, a
// background pre-generation, the manual 标记完结 button), but the
// celebration should play where the finished book is first SEEN — on
// a shelf. So the flip and the party are decoupled through this tiny
// localStorage ledger:
//
// - App watches the library and calls stampFinishCelebration(id) the
//   moment a line it has already seen unfinished flips to complete
//   (a book first observed already-complete is never stamped — its
//   finish predates the witness, and a shelf full of old finished
//   books must not erupt on the feature's first run).
// - Whichever shelf surface presents that book first claims the
//   stamp via claimFinishCelebration(id): the claim flips pending →
//   done atomically with the read, so exactly one surface plays the
//   beat, exactly once, ever (per device — the ledger is local).
//
// Storage failures (private mode, quota) degrade to "no celebration",
// never to an error: every entry point is wrapped.

const KEY = (storyId) => `storyweave:finish-fx:${storyId}`;

function storage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** Record that a book just finished and its finale beat is owed. */
export function stampFinishCelebration(storyId) {
  const store = storage();
  if (!store || !storyId) return;
  try {
    if (store.getItem(KEY(storyId)) === null) {
      store.setItem(KEY(storyId), "pending");
    }
  } catch { /* a missing party is acceptable; a thrown error is not */ }
}

/** True when a finale beat is owed for this book (no side effects). */
export function peekFinishCelebration(storyId) {
  const store = storage();
  if (!store || !storyId) return false;
  try {
    return store.getItem(KEY(storyId)) === "pending";
  } catch {
    return false;
  }
}

/**
 * Claim the finale beat for this book: returns true exactly once —
 * for the first caller that finds the stamp pending — and marks it
 * done so no other surface (or later visit) ever replays it.
 */
// A flip only earns a stamp when the finish is FRESH. The library can
// gain an already-finished book without any local finishing moment —
// a cloud merge from another device, a backup import — and those books
// finished long ago, somewhere else; celebrating them here would be a
// false firework. Freshness rides the story's own updatedAt (the
// engine stamps it on every mutation): within the same 3-day window
// story-engine's pregeneration gate uses to call a book "recently
// active" it counts as just-finished. A record with no parseable
// timestamp is legacy and qualifies (the same house precedent as that
// gate); a future timestamp is another device's clock skew and also
// counts as fresh.
const FINISH_STAMP_WINDOW_MS = 3 * 86_400_000;

export function finishStampEligible(story, nowMs = Date.now()) {
  const stampedAt = Date.parse(story?.updatedAt || "");
  if (!Number.isFinite(stampedAt)) return true;
  return stampedAt >= nowMs - FINISH_STAMP_WINDOW_MS;
}

export function claimFinishCelebration(storyId) {
  const store = storage();
  if (!store || !storyId) return false;
  try {
    if (store.getItem(KEY(storyId)) !== "pending") return false;
    store.setItem(KEY(storyId), "done");
    return true;
  } catch {
    return false;
  }
}
