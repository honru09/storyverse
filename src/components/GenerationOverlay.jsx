import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ParticleField from "./ParticleField.jsx";

const STEP_SETS = {
  story: ["正在铺设这个世界的规则…", "正在唤醒你的主角…", "正在写下第一幕…"],
  merge: ["正在让两个世界相遇…", "正在对齐两条世界线…", "正在写下相遇的第一幕…"],
};

// The staged wait (RELIABILITY.md): four named stages advance with the
// elapsed wait, and the bar eases toward ~90% on the same clock — it is
// a progress *presentation*, never a percentage claim (no numerals are
// shown; DESIGN.md §10's "不假造百分比" still holds). The final stage
// completes when the chapter actually lands and this screen unmounts.
const STAGES = ["准备", "构思", "落笔", "成章"];
const STAGE_AT_SECONDS = [0, 2.5, 12, 40];
const SLOW_HINT_SECONDS = 30;

/**
 * The designed generation wait: rendered through a portal at the body
 * root and pinned to the visual viewport (100dvh, safe centering), so
 * on a phone the whole card is always on screen — the pre-fix overlay
 * could be laid out against a taller ancestor box and open with its
 * top off-screen. Motion stays transform/opacity only, so the global
 * motion policy ([data-motion="off"] / prefers-reduced-motion) freezes
 * every animation here too; the stage labels and bar still advance.
 */
export default function GenerationOverlay({ kind = "story", onCancel }) {
  const steps = STEP_SETS[kind] || STEP_SETS.story;
  const [stepIndex, setStepIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setStepIndex((value) => (value + 1) % steps.length), 2200);
    return () => window.clearInterval(timer);
  }, [steps.length]);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => window.clearInterval(timer);
  }, []);
  const stage = STAGE_AT_SECONDS.reduce((current, at, index) => (elapsed >= at ? index : current), 0);
  const progress = 90 * (1 - Math.exp(-elapsed / 30));
  const slow = elapsed >= SLOW_HINT_SECONDS;
  return createPortal(
    <div className="generation-overlay" role="alertdialog" aria-modal="false" aria-label="正在生成故事">
      <span className="generation-bg" aria-hidden="true" />
      <ParticleField density="waiting" />
      <div className="generation-card">
        <div className="generation-orb" aria-hidden="true"><span className="generation-halo" /></div>
        <h2>{kind === "merge" ? "两个世界正在相遇" : "你的故事正在成形"}</h2>
        <p className="generation-step" key={stepIndex} role="status">{steps[stepIndex]}</p>
        <ol className="generation-stages">
          {STAGES.map((label, index) => (
            <li
              key={label}
              className={index < stage ? "done" : index === stage ? "active" : ""}
              aria-current={index === stage ? "step" : undefined}
            >
              {label}
            </li>
          ))}
        </ol>
        <div className="generation-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
        <div className="generation-skeleton" aria-hidden="true">
          <span className="skeleton-line w60" />
          <span className="skeleton-line w85" />
          <span className="skeleton-line" />
          <span className="skeleton-line w45" />
        </div>
        {slow ? (
          <p className="generation-note" role="status">
            已经等了 {Math.floor(elapsed)} 秒 · 今晚可能有点慢，仍在生成中，慢的时候通常多等一会儿就好。
          </p>
        ) : (
          <p className="generation-note">读这一章时，下一章会在后台提前备好，不用等。</p>
        )}
        {onCancel && (
          <button type="button" className="small-link generation-cancel" onClick={onCancel}>
            取消等待
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
