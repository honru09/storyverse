#!/usr/bin/env node
// PIXELFX-WAVE6 — pixelfx keyframe portraits & drift watch (DESIGN.md §60).
//
// fx-selfcheck answers "does every pick still paint, step within
// budget, and hold loop discipline". This script answers the other
// question: "does it still LOOK the same". For every scene in the
// placements table it renders the primary pick (black theme, the
// pick's own tabled seed) to the representative frame — the exact
// moment renderPixelfxStill pins down (≈45% through a one-shot,
// 0.8s into a loop; the same frame a motion-off reader is shown) —
// flattens it over black, and writes a PNG portrait.
//
//   npm run fx:keyframes -- --out <dir>        capture a portrait set
//   npm run fx:keyframes -- --compare <dir>    re-render and diff
//                                              against a captured set
//
// Compare counts a pixel as changed when any RGB channel moves by
// more than PIXELFX_KEYFRAME_PIXEL_DELTA, and flags a scene when
// the changed fraction exceeds PIXELFX_KEYFRAME_CHANGED_FRACTION.
// A flag is a question, not a verdict: an intentional pick change
// SHOULD flag — confirm the new look, then re-capture the baseline.
// The daily storyweave-daily-bughunt cron wiring for this lives in
// PIXELFX-WAVE6.md. Exit 0 when a compare finds no drift; exit 1
// with the changed-scene list otherwise.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";
import { pickFx, setPixelfxTheme, PIXELFX_SCENE } from "../src/fx/placements.js";
import { renderPixelfxStill } from "../src/fx/player-core.js";

/** Per-channel move (0–255) above which a pixel counts as changed. */
export const PIXELFX_KEYFRAME_PIXEL_DELTA = 24;
/** Changed-pixel fraction above which a scene is flagged as drifted. */
export const PIXELFX_KEYFRAME_CHANGED_FRACTION = 0.005;

const FX_ROOT = fileURLToPath(new URL("../src/fx/pixelfx/fx/", import.meta.url));

// ——— Minimal PNG codec (8-bit RGB/RGBA, filters 0–4) ———
// The repo carries no image dependency and this script must run
// anywhere node does, so the codec is hand-rolled: the encoder
// writes filter-0 RGB rows; the decoder accepts what any encoder
// might write back at us (all five row filters, RGB or RGBA).

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Encode { width, height, rgb } (RGB triplets) as a PNG buffer. */
export function encodePng({ width, height, rgb }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Decode a PNG buffer to { width, height, rgb } (alpha flattened over black). */
export function decodePng(buffer) {
  if (buffer.length < 8 || buffer[0] !== 0x89 || buffer[1] !== 0x50) {
    throw new Error("not a PNG");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bpp = 0;
  let seenIend = false;
  const idat = [];
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) throw new Error("truncated PNG chunk header");
    const length = buffer.readUInt32BE(offset);
    if (offset + 12 + length > buffer.length) throw new Error("truncated PNG chunk");
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      if (data.length < 13) throw new Error("invalid IHDR");
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      // Compression (10), filter method (11) and interlace (12)
      // must all be the plain values: an Adam7 stream unfilters to
      // scrambled pixels if read as flat scanlines, so refuse it
      // loudly instead of diffing garbage.
      if (data[8] !== 8 || (data[9] !== 2 && data[9] !== 6) || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
        throw new Error(
          `unsupported PNG format (depth ${data[8]}, type ${data[9]}, interlace ${data[12]})`,
        );
      }
      bpp = data[9] === 2 ? 3 : 4;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      seenIend = true;
      break;
    }
    offset += 12 + length;
  }
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  // Without this, a short inflated stream would decode through
  // subarray clamping into silently zero-filled rows — a corrupt
  // baseline must read as corrupt, never as a black portrait.
  if (!width || !height || !seenIend || raw.length !== (stride + 1) * height) {
    throw new Error("corrupt or incomplete PNG data");
  }
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const dst = rows.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? rows.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? dst[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`unsupported PNG row filter ${filter}`);
      }
      dst[x] = (src[x] + predictor) & 0xff;
    }
  }
  if (bpp === 3) return { width, height, rgb: rows };
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < rows.length; i += 4, j += 3) {
    const alpha = rows[i + 3] / 255;
    rgb[j] = Math.round(rows[i] * alpha);
    rgb[j + 1] = Math.round(rows[i + 1] * alpha);
    rgb[j + 2] = Math.round(rows[i + 2] * alpha);
  }
  return { width, height, rgb };
}

// ——— Portrait rendering ———

/** Flatten a composited RGBA frame over black (the black theme's ground). */
function flattenOverBlack({ width, height, data }) {
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    const alpha = data[i + 3] / 255;
    rgb[j] = Math.round(data[i] * alpha);
    rgb[j + 1] = Math.round(data[i + 1] * alpha);
    rgb[j + 2] = Math.round(data[i + 2] * alpha);
  }
  return { width, height, rgb };
}

const moduleCache = new Map();
const loadModule = async (id) => {
  if (!moduleCache.has(id)) {
    moduleCache.set(id, await import(pathToFileURL(join(FX_ROOT, `${id}.js`)).href));
  }
  return moduleCache.get(id);
};

/** Render every scene's primary pick to its representative frame. */
export async function renderKeyframes() {
  setPixelfxTheme("black");
  const frames = new Map();
  for (const scene of Object.values(PIXELFX_SCENE)) {
    const pick = pickFx(scene, null);
    if (!pick?.fx) throw new Error(`placements returned no primary pick for scene ${scene}`);
    const mod = await loadModule(pick.fx);
    const still = renderPixelfxStill(mod, {
      seed: pick.seed,
      palette: pick.palette,
      flashGuard: pick.flashGuard,
    });
    frames.set(scene, { pick, image: flattenOverBlack(still) });
  }
  setPixelfxTheme("black");
  return frames;
}

/** Pixel-diff two flattened RGB frames; null when dimensions differ. */
export function diffFrames(a, b) {
  if (a.width !== b.width || a.height !== b.height) return null;
  let changed = 0;
  let maxDelta = 0;
  for (let i = 0; i < a.rgb.length; i++) {
    const delta = Math.abs(a.rgb[i] - b.rgb[i]);
    if (delta > maxDelta) maxDelta = delta;
  }
  for (let i = 0; i < a.rgb.length; i += 3) {
    const delta = Math.max(
      Math.abs(a.rgb[i] - b.rgb[i]),
      Math.abs(a.rgb[i + 1] - b.rgb[i + 1]),
      Math.abs(a.rgb[i + 2] - b.rgb[i + 2]),
    );
    if (delta > PIXELFX_KEYFRAME_PIXEL_DELTA) changed += 1;
  }
  const total = a.width * a.height;
  return { changed, total, fraction: total ? changed / total : 0, maxDelta };
}

// ——— CLI ———

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const args = process.argv.slice(2);
  const argValue = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
  };
  const outDir = argValue("--out");
  const compareDir = argValue("--compare");
  if (!outDir && !compareDir) {
    console.error("usage: fx-keyframes --out <dir> [--compare <dir>] | --compare <dir>");
    process.exit(2);
  }
  const frames = await renderKeyframes();
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    const manifest = {
      tool: "fx-keyframes",
      theme: "black",
      capturedAt: new Date().toISOString(),
      scenes: {},
    };
    for (const [scene, { pick, image }] of frames) {
      const file = `${scene}.png`;
      writeFileSync(join(outDir, file), encodePng(image));
      manifest.scenes[scene] = {
        file,
        fx: pick.fx,
        seed: pick.seed ?? null,
        width: image.width,
        height: image.height,
      };
    }
    writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`fx-keyframes: wrote ${frames.size} keyframes to ${outDir}`);
  }
  if (compareDir) {
    // A missing baseline directory is not a crash: every scene
    // reports as a missing baseline portrait below.
    let existing = [];
    try {
      existing = readdirSync(compareDir);
    } catch {
      /* handled per-scene as missing baselines */
    }
    const baselineFiles = new Set(existing.filter((name) => name.endsWith(".png")));
    const changed = [];
    for (const [scene, { image }] of frames) {
      const file = `${scene}.png`;
      baselineFiles.delete(file);
      let baseline;
      try {
        baseline = decodePng(readFileSync(join(compareDir, file)));
      } catch {
        changed.push(`${scene}: no readable baseline portrait`);
        continue;
      }
      const diff = diffFrames(baseline, image);
      if (!diff) {
        changed.push(`${scene}: dimensions changed (${baseline.width}×${baseline.height} → ${image.width}×${image.height})`);
      } else if (diff.fraction > PIXELFX_KEYFRAME_CHANGED_FRACTION) {
        changed.push(
          `${scene}: ${(diff.fraction * 100).toFixed(2)}% of pixels moved (max Δ ${diff.maxDelta})`,
        );
      }
    }
    for (const stale of baselineFiles) {
      changed.push(`${stale.replace(/\.png$/, "")}: baseline portrait exists but the scene is gone`);
    }
    if (changed.length) {
      console.error(`fx-keyframes: ${changed.length} scene(s) drifted from ${compareDir}:`);
      for (const line of changed) console.error(`  - ${line}`);
      process.exit(1);
    }
    console.log(`fx-keyframes: OK — ${frames.size} scenes match the portraits in ${compareDir} (no drift).`);
  }
}
