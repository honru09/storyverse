// REQ-48: the profile stage restore guard.
//
// The defect (measured end to end on honru-like state, WebKit
// 393x852, black theme, the owner's real portrait): a profile visit
// remembers its scroll position — in ProfileView's view-state for
// window opens and remounts, and in the shell's keep-alive memory
// for tab returns — and the next visit restores it verbatim. When
// the remembered stop parks the avatar stage straddling the shell
// topbar (page form) or the sheet's top edge (window form), the
// portrait's head band sits behind the bar and the profile "opens
// headless" on every return. Anchor landings were already protected
// by scroll-margin-top; restores were not. This module computes the
// one scroll position that parks the stage's top on the safe line,
// and arms the post-restore checks that apply it.

/** Page form: if the shell topbar cannot be measured, fall back to
 *  the scroll-margin the stage already carries (84px). */
export const STAGE_SAFE_TOP_FALLBACK = 84

/** Window form: the sheet's floating grab zone overlays its top
 *  ~26px; the stage must park below that band. */
export const STAGE_SHEET_SAFE_INSET = 30

/** Breathing room between the safe line and the parked stage top. */
export const STAGE_SAFE_GAP = 8

/**
 * The scroll position that parks the stage's top edge exactly on
 * the safe line, or null when the stage is not straddling it.
 * Inputs are viewport-coordinate rect edges plus the scroller's
 * current position and range. Parking is always reachable from a
 * straddle: the target is the stage's document position minus the
 * safe line, which lies inside the scroll range whenever the stage
 * genuinely crosses the line.
 */
export function stageParkScrollTop({ scrollTop, stageTop, stageBottom, safeTop, maxScrollTop } = {}) {
  if (![scrollTop, stageTop, stageBottom, safeTop, maxScrollTop].every((v) => Number.isFinite(v))) return null
  // Straddling = the card crosses the safe line: top above it, body
  // still below it. Fully past or not yet reached are ordinary
  // reading positions and are left alone.
  if (!(stageTop < safeTop - 0.5 && stageBottom > safeTop)) return null
  const target = Math.round((scrollTop + stageTop - safeTop) * 10) / 10
  const clamped = Math.min(maxScrollTop, Math.max(0, target))
  return clamped === scrollTop ? null : clamped
}

/**
 * Measure the stage inside a profile root and compute the park
 * target for its scroller. Returns null when there is nothing to
 * fix. `root` is the profile page element (the sheet column itself
 * in window form; the in-flow page in page form).
 */
export function stageParkTarget({ windowForm, root } = {}) {
  const stage = root?.querySelector?.(".profile-stage")
  if (!root || !stage) return null
  const rect = stage.getBoundingClientRect()
  if (windowForm) {
    const sheet = root.closest(".profile-window-sheet")
    if (!sheet) return null
    return stageParkScrollTop({
      scrollTop: root.scrollTop,
      stageTop: rect.top,
      stageBottom: rect.bottom,
      safeTop: sheet.getBoundingClientRect().top + STAGE_SHEET_SAFE_INSET,
      maxScrollTop: root.scrollHeight - root.clientHeight,
    })
  }
  const bar = document.querySelector(".topbar")
  const doc = document.documentElement
  return stageParkScrollTop({
    scrollTop: window.scrollY,
    stageTop: rect.top,
    stageBottom: rect.bottom,
    safeTop: (bar ? bar.getBoundingClientRect().bottom : STAGE_SAFE_TOP_FALLBACK) + STAGE_SAFE_GAP,
    maxScrollTop: doc.scrollHeight - window.innerHeight,
  })
}

/**
 * Arm the post-restore guard: after a verbatim scroll restore,
 * check at a few settle points whether the stage ended up
 * straddling its safe line, and if so park it. The guard tracks the
 * position it expects the scroller to hold; the moment the actual
 * position differs (the reader scrolled, another restore won), it
 * stands down and never fights. Returns a disarm function.
 */
export function armRestoredStageGuard({ windowForm, root, saved, delays = [200, 600, 1200, 2000] } = {}) {
  if (!root || !Number.isFinite(saved)) return () => {}
  let expected = saved
  const check = () => {
    const current = windowForm ? root.scrollTop : window.scrollY
    if (Math.abs(current - expected) > 2) return
    const target = stageParkTarget({ windowForm, root })
    if (target == null) return
    expected = target
    if (windowForm) root.scrollTop = target
    else window.scrollTo(0, target)
  }
  const timers = delays.map((delay) => window.setTimeout(check, delay))
  return () => timers.forEach((timer) => window.clearTimeout(timer))
}
