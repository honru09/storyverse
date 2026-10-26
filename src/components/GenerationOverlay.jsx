import React, { useEffect, useState } from "react";

const STEP_SETS = {
  story: ["正在铺设这个世界的规则…", "正在唤醒你的主角…", "正在写下第一幕…"],
  merge: ["正在让两个世界相遇…", "正在对齐两条世界线…", "正在写下相遇的第一幕…"],
};

/**
 * The designed generation wait (DESIGN.md §10): rotating step copy, a
 * flowing (never fake-percentage) progress band, and the skeleton of the
 * chapter being written. The pre-generation promise is stated on the card:
 * the next chapter is prepared while the reader reads.
 */
export default function GenerationOverlay({ kind = "story", onCancel }) {
  const steps = STEP_SETS[kind] || STEP_SETS.story;
  const [stepIndex, setStepIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setStepIndex((value) => (value + 1) % steps.length), 2200);
    return () => window.clearInterval(timer);
  }, [steps.length]);
  return (
    <div className="generation-overlay" role="alertdialog" aria-modal="false" aria-label="正在生成故事">
      <div className="generation-card">
        <div className="generation-orb" aria-hidden="true" />
        <h2>{kind === "merge" ? "两个世界正在相遇" : "你的故事正在成形"}</h2>
        <p className="generation-step" key={stepIndex} role="status">{steps[stepIndex]}</p>
        <div className="generation-flow" aria-hidden="true"><i /></div>
        <div className="generation-skeleton" aria-hidden="true">
          <span className="skeleton-line w60" />
          <span className="skeleton-line w85" />
          <span className="skeleton-line" />
          <span className="skeleton-line w45" />
        </div>
        <p className="generation-note">读这一章时，下一章会在后台提前备好，不用等。</p>
        {onCancel && (
          <button type="button" className="small-link generation-cancel" onClick={onCancel}>
            取消等待
          </button>
        )}
      </div>
    </div>
  );
}
