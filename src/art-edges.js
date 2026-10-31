// REQ-70 (SHOWCASE-VISUAL): edge-tone sampling for the profile
// showcase figure. The figure's ground is painted from the portrait's
// OWN edge tones, so a portrait that arrives with a pale matte reads
// as one painting standing on its own ground — never as a small
// picture pasted over a differently-scaled blur of itself. The pure
// pixel math lives in sampleEdgeColors so tests can drive it with
// decoded image data; the browser wrapper only moves bytes.

export function sampleEdgeColors(imageData, bandRatio = 0.05) {
  const { data, width, height } = imageData || {};
  if (!data || !width || !height) return null;
  const bandX = Math.max(1, Math.round(width * bandRatio));
  const bandY = Math.max(1, Math.round(height * bandRatio));
  const sum = (x0, y0, x1, y1) => {
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * width + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
      }
    }
    return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [0, 0, 0];
  };
  const rgb = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`;
  const top = sum(0, 0, width, bandY);
  const bottom = sum(0, height - bandY, width, height);
  const left = sum(0, 0, bandX, height);
  const right = sum(width - bandX, 0, width, height);
  const average = [0, 1, 2].map((i) => Math.round((top[i] + bottom[i] + left[i] + right[i]) / 4));
  return { top: rgb(top), bottom: rgb(bottom), left: rgb(left), right: rgb(right), average: rgb(average) };
}

const edgeCache = new Map();

// Loads the portrait once (same-origin or blob URL, so the canvas
// stays readable), downscales it, and resolves its edge tones.
// Any failure — decode, taint, network — resolves null and the
// figure keeps its plain panel ground.
export function samplePortraitEdges(url) {
  if (!url) return Promise.resolve(null);
  if (edgeCache.has(url)) return edgeCache.get(url);
  const pending = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 144 / img.naturalWidth);
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(sampleEdgeColors(ctx.getImageData(0, 0, canvas.width, canvas.height)));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  edgeCache.set(url, pending);
  return pending;
}
