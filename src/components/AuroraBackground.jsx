import React from "react";

/**
 * The fixed aurora layer behind every non-reader surface (DESIGN.md §4).
 * Pure CSS: four slow-drifting glow blobs (transform only) over a fine dot
 * grid. Motion policy is inherited — [data-motion="off"] and
 * prefers-reduced-motion freeze the drift in aurora.css.
 */
export default function AuroraBackground() {
  return (
    <div className="aurora-bg" aria-hidden="true">
      <span className="aurora-blob b1" />
      <span className="aurora-blob b2" />
      <span className="aurora-blob b3" />
      <span className="aurora-blob b4" />
      <span className="aurora-grid" />
    </div>
  );
}
