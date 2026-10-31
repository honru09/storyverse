import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PixelfxCanvas from "../fx/PixelfxCanvas.jsx";
import { pickFx, PIXELFX_SCENE } from "../fx/placements.js";
import { useMotionSettings } from "../motion/MotionProvider.jsx";

const STAGES = ["扰动世界线", "重写下一章", "落定"];
const STAGE_NOTES = [
  "已经发生的不会改变；力量只落在下一章。",
  "下一章正带着这股力量重新成形。",
  "世界线已经重新落定。",
];
const STAGE_MIN_MS = [850, 850, 0];

/**
 * The intervention sequence (INTERVENTION.md): while a revision pass runs,
 * the worldline visibly stirs — strands of the star map ripple and
 * reweave — through three named stages. Pure transform/opacity motion,
 * so the global motion policy ([data-motion="off"] and
 * prefers-reduced-motion, which freeze CSS animation) applies unchanged;
 * the stage labels still advance for readers who keep motion off.
 *
 * `settled` flips true when the underlying work (a model revision pass,
 * or the local retract + rematerialize) has landed; the sequence never
 * closes before the final stage has been shown.
 *
 * The frontier re-roll (CONTROL.md) runs through this same sequence with
 * its own title/stages/notes passed as props — one staged-writing
 * surface for every pass that rewrites a chapter, not two forks of it.
 */
export default function InterventionOverlay({
  settled = false,
  onDone,
  onCancel,
  title = "无名的力量正在伸手",
  stages = STAGES,
  notes = STAGE_NOTES,
  ariaLabel = "正在介入世界线",
  family,
}) {
  const [stage, setStage] = useState(0);
  // PIXELFX-WAVE1 (§60): the intervention beat gets one one-shot pixel
  // burst over the weave (arcane by default, family variants via
  // placements), removed the moment it finishes. Only the intervention
  // caller passes `family`; the re-roll reuse passes none and stays
  // exactly as before. Motion off / reduced motion skips it entirely.
  const settings = useMotionSettings();
  const motionOn = Boolean(settings?.enabled) && !settings?.reducedMotion && !settings?.saveData;
  const [fxDone, setFxDone] = useState(false);
  const fxPick = family !== undefined && motionOn ? pickFx(PIXELFX_SCENE.INTERVENE, family) : null;
  const doneRef = useRef(false);
  useEffect(() => {
    if (stage >= stages.length - 1) return undefined;
    const timer = window.setTimeout(
      () => setStage((value) => Math.min(value + 1, stages.length - 1)),
      STAGE_MIN_MS[stage],
    );
    return () => window.clearTimeout(timer);
  }, [stage, stages]);
  useEffect(() => {
    if (!settled || stage < stages.length - 1 || doneRef.current) return undefined;
    const timer = window.setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone?.();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [settled, stage, onDone]);
  // The bar follows the stage sequence: each stage fills its share as
  // it completes, and the last stage only reaches 100% once the work has
  // actually settled — presentation, never a percentage claim.
  const progress = ((stage + (settled ? 1 : 0.45)) / stages.length) * 100;
  return createPortal(
    <div className="intervention-overlay" role="alertdialog" aria-modal="false" aria-label={ariaLabel}>
      <div className="intervention-card">
        {fxPick && !fxDone && (
          <PixelfxCanvas
            className="intervention-fx"
            fx={fxPick.fx}
            palette={fxPick.palette}
            seed={fxPick.seed}
            loop={false}
            onDone={() => setFxDone(true)}
          />
        )}
        <svg className="intervention-weave" viewBox="0 0 120 72" aria-hidden="true">
          <path className="weave-strand strand-a" d="M4 52 C 30 20, 60 62, 116 18" />
          <path className="weave-strand strand-b" d="M4 30 C 36 58, 70 8, 116 44" />
          <path className="weave-strand strand-c" d="M4 64 C 44 30, 76 44, 116 8" />
          <circle className="weave-node node-a" cx="34" cy="36" r="2.6" />
          <circle className="weave-node node-b" cx="66" cy="34" r="2.6" />
          <circle className="weave-node node-c" cx="94" cy="26" r="2.6" />
        </svg>
        <h2>{title}</h2>
        <ol className="intervention-stages">
          {stages.map((label, stageIndex) => (
            <li
              key={label}
              className={stageIndex < stage ? "done" : stageIndex === stage ? "active" : ""}
              aria-current={stageIndex === stage ? "step" : undefined}
            >
              {label}
            </li>
          ))}
        </ol>
        <p className="intervention-stage-note" role="status">
          {notes[stage]}
        </p>
        <div className="intervention-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
        {onCancel && (
          <>
            <button type="button" className="intervention-cancel" onClick={onCancel}>
              回到阅读
            </button>
            <p className="intervention-cancel-note">重写在后台继续，落定后下一章自动换新版。</p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
