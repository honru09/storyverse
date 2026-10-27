import React from "react";
import { CHAPTER_COUNT } from "../reading-flow.js";
import { aggregateStates, chapterStates } from "../story-map.js";

/**
 * Story map (DESIGN.md §8): chapters are star nodes, progress is the lit
 * path. Read-only over the existing story shape — chapters[], choices{},
 * readerIndex — nothing here writes story data. The state math lives in
 * src/story-map.js; this file only draws it.
 */

export { aggregateStates, chapterStates };

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
  // Long structures stay legible: past the readability floor the nodes
  // aggregate into segments (see aggregateStates) and only the first,
  // the current and the last segment carry labels.
  const nodes = aggregateStates(states);
  const aggregated = nodes.length !== states.length;
  const count = states.length;
  const nodeCount = nodes.length;
  const width = Math.max(300, nodeCount * (nodeCount <= 12 ? 64 : 30));
  const height = variant === "mini" ? 44 : 92;
  const cy = height / 2;
  const points = nodes.map((_, index) => nodePoint(index, nodeCount, width, height));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const litUntilNode = nodes.reduce((acc, node, index) => (node.from <= Math.max(0, Math.min(generated - 1, current)) ? index : acc), 0);
  const litPath = points.slice(0, litUntilNode + 1).map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const label = `共 ${count} 章，已读到第 ${current + 1} 章`;
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
      {litUntilNode > 0 && <path className="storymap-link lit" d={litPath} />}
      {nodes.map((node, index) => {
        const state = node.state;
        const point = points[index];
        const clickable = onSelect && (state === "done" || state === "current" || state === "ready");
        const radius = state === "current" ? 8 : 6;
        const showLabel = variant !== "mini" && (aggregated
          ? index === 0 || state === "current" || index === nodes.length - 1
          : count <= 24 || node.index === 0 || node.index === current || (node.index + 1) % (count > 24 ? 25 : 6) === 0);
        const labelText = aggregated
          ? (state === "current" ? `第${current + 1}章` : index === nodes.length - 1 ? `第${count}章` : `第${node.from + 1}章`)
          : `第${node.index + 1}章`;
        return (
          <g
            key={index}
            className={`storymap-node-group ${clickable ? "" : "locked"}`}
            onClick={clickable ? () => onSelect(node.index) : undefined}
          >
            {clickable && <circle className="storymap-hit" cx={point.x} cy={point.y} r="17" />}
            {state === "current" && <circle className="storymap-pulse" cx={point.x} cy={point.y} r={radius + 3} />}
            <circle className={`storymap-node ${state}`} cx={point.x} cy={point.y} r={radius} />
            {showLabel && (
              <text className={`storymap-label ${state === "current" ? "current" : ""}`} x={point.x} y={cy + (point.y >= cy ? 30 : -22)}>
                {labelText}
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
