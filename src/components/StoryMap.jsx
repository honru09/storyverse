import React from "react";
import { CHAPTER_COUNT } from "../reading-flow.js";

/**
 * Story map (DESIGN.md §8): chapters are star nodes, progress is the lit
 * path. Read-only over the existing story shape — chapters[], choices{},
 * readerIndex — nothing here writes story data.
 *
 * Node states:
 * - done    已读：index < current, solid pink
 * - current 正在读：pulsing cyan
 * - ready   已备好：generated ahead of the reader, solid mint
 * - pending 生成中/待生成：the next ungenerated chapter, dashed violet breath
 * - locked  未解锁：dim
 */

export function chapterStates({ total = CHAPTER_COUNT, generated = 0, current = 0 }) {
  return Array.from({ length: total }, (_, index) => {
    if (index === current) return "current";
    if (index < current && index < generated) return "done";
    if (index < generated) return "ready";
    if (index === generated) return "pending";
    return "locked";
  });
}

/** The one-line generation state, same words + same colors everywhere. */
export function generationState({ total = CHAPTER_COUNT, generated = 0, current = 0, engine, preparing = false, complete = false }) {
  if (complete || (generated >= total && current >= total - 1)) return { key: "done", label: "已完结", className: "is-ready" };
  if (engine !== "gemini") return generated > current + 1
    ? { key: "ready", label: "下一章已备好", className: "is-ready" }
    : { key: "waiting", label: "下一章待生成", className: "is-waiting" };
  if (preparing) return { key: "generating", label: "下一章生成中", className: "is-generating" };
  if (generated > current + 1) return { key: "ready", label: "下一章已备好", className: "is-ready" };
  return { key: "waiting", label: "下一章待生成", className: "is-waiting" };
}

export function GenState({ state }) {
  if (!state) return null;
  return (
    <span className={`gen-state ${state.className}`}>
      <i aria-hidden="true" />
      {state.label}
    </span>
  );
}

const nodePoint = (index, total, width, height) => {
  const x = total <= 1 ? width / 2 : 34 + (index * (width - 68)) / (total - 1);
  const y = height / 2 + Math.sin(index * 1.35) * (height * 0.26);
  return { x, y };
};

export default function StoryMap({
  total = CHAPTER_COUNT,
  generated = 0,
  current = 0,
  onSelect,
  variant = "full",
  className = "",
}) {
  const states = chapterStates({ total, generated, current });
  const width = Math.max(300, total * 64);
  const height = variant === "mini" ? 44 : 92;
  const cy = height / 2;
  const points = states.map((_, index) => nodePoint(index, total, width, height));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const litUntil = Math.max(0, Math.min(generated - 1, current));
  const litPath = points.slice(0, litUntil + 1).map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const label = `共 ${total} 章，已读到第 ${current + 1} 章`;
  return (
    <svg
      className={`storymap ${className}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="storymap-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f0a6ff" />
          <stop offset="1" stopColor="#6ee7ff" />
        </linearGradient>
      </defs>
      <path className="storymap-link" d={path} />
      {litUntil > 0 && <path className="storymap-link lit" d={litPath} />}
      {states.map((state, index) => {
        const point = points[index];
        const clickable = onSelect && (state === "done" || state === "current" || state === "ready");
        const radius = state === "current" ? 8 : 6;
        return (
          <g
            key={index}
            className={`storymap-node-group ${clickable ? "" : "locked"}`}
            onClick={clickable ? () => onSelect(index) : undefined}
          >
            {clickable && <circle className="storymap-hit" cx={point.x} cy={point.y} r="17" />}
            {state === "current" && <circle className="storymap-pulse" cx={point.x} cy={point.y} r={radius + 3} />}
            <circle className={`storymap-node ${state}`} cx={point.x} cy={point.y} r={radius} />
            {variant !== "mini" && (
              <text className={`storymap-label ${state === "current" ? "current" : ""}`} x={point.x} y={cy + (point.y >= cy ? 30 : -22)}>
                第{index + 1}章
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Compact strip: mini map + the shared generation-state words. */
export function StoryMapMini({ total = CHAPTER_COUNT, generated = 0, current = 0, state, onSelect }) {
  return (
    <div className="storymap-mini">
      <StoryMap total={total} generated={generated} current={current} onSelect={onSelect} variant="mini" />
      <GenState state={state} />
    </div>
  );
}
