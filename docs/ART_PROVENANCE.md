# Storyweave artwork provenance

These four illustrations were created for the user-selected code-first **故事扉页** visual direction on 2026-10-22. They are fictional narrative illustrations, not documentary photographs, product screenshots, UI comps, or claims about deployed functionality. No approved UI comp or crop was used as a source. The Impeccable asset-producer and imagegen workflows governed creation, inspection and provenance.

## Shipping inventory

All 640w versions are **640 × 800**; all full-width versions and source masters are **1122 × 1402**. Every image is opaque. Responsive outputs use WebP quality 82, effort 6, with no cropping or intentional visual change. All eight shipping rasters total **1,944,400 bytes**; one 640w file per world totals **564,988 bytes**. Source PNG masters are outside `public/` and should not be bundled as runtime art.

| ID | 640w file | Bytes | 1122w file | Bytes | Non-public source master |
| --- | --- | ---: | --- | ---: | --- |
| mist | `public/art/mist-640.webp` | 144,698 | `public/art/mist-1122.webp` | 353,156 | `assets/art-source/mist.png` (3,086,977 bytes) |
| cultivation | `public/art/cultivation-640.webp` | 140,392 | `public/art/cultivation-1122.webp` | 356,740 | `assets/art-source/cultivation.png` (3,075,461 bytes) |
| neon | `public/art/neon-640.webp` | 162,590 | `public/art/neon-1122.webp` | 425,850 | `assets/art-source/neon.png` (3,397,088 bytes) |
| city | `public/art/city-640.webp` | 117,308 | `public/art/city-1122.webp` | 243,666 | `assets/art-source/city.png` (2,445,419 bytes) |

Machine-readable inventory, SHA-256 hashes, dimensions, exact prompt history and semantic implementation handoff: [manifest](../public/art/manifest.json).

## Production and validation

- Generated four separate assets using the built-in `image_gen.imagegen` tool, one call per image. No CLI/API fallback, external stock, package install or UI-code change was used.
- Inspected every generated workspace PNG. City received one targeted native edit to remove a glyph-like detail on the tram nose; the full edit prompt is recorded below.
- Copied selected generated output non-destructively, then moved only the four agent-created PNG masters to `assets/art-source/` after checking exact source and destination paths. Raw native originals remain in the generated-images directory.
- Converted with bundled `sharp` at `C:/Users/wangxr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp` using width 640 or 1122, `withoutEnlargement: true`, `webp({quality:82, effort:6})`.
- Embedded the exact latest generation/edit prompt with `C:/Users/wangxr/.codex/skills/impeccable/scripts/embed-prompt.mjs`. PNG stores it in the `impeccable:prompt` tEXt chunk. For WebP, the script writes the adjacent `.webp.json` sidecar; keep these sidecars with the art. The complete initial-plus-edit history remains here and in the manifest.
- Visually checked all final 640w variants. Metadata verification covers all twelve raster files. Provenance scan returned **12 rasters, 0 missing**. No readable title, lettered sign, UI control, border, rounded-card treatment, watermark or face was intentionally included.

## Notes for composition

The four assets are accepted as reusable illustration ingredients. Main scene structure is concentrated above the dark foreground. Text, titles, CTA buttons, icons, borders, clipping and responsive cropping must remain in semantic code. Use `srcSet` and `sizes` to load a suitable width. A navy code-owned contrast scrim may be needed over the neon street reflections; final text contrast and crop behavior require the builder's UI screenshot pass.

Minor generated secondary details are disclosed rather than silently treated as requested facts: cultivation includes small unlettered mountaintop buildings; neon includes a vermilion skyline disc; city has a coastal background and wet dawn street. City's corrected source retains a faint unlabeled circular hardware impression at full resolution, with no readable glyph in the reviewed final derivative. These do not represent real places or organizations.

## mist: exact generation prompt

Tool: built-in `image_gen.imagegen`, generate mode, no reference images.

Native original: `C:/Users/wangxr/.codex/generated_images/01a15f46-233c-77d1-86d9-bb229527c8b3/exec-80265437-561a-4693-b983-ff68f334351a.png`

```text
Use case: illustration-story.
Asset type: standalone full-bleed fictional narrative illustration for a mobile novel app and small book-cover crop, not a UI mockup or a book photographed as an object.
Style/medium: sophisticated bold screen-printed editorial adventure illustration, manga volume frontispiece meets modern illustrated book jacket. Crisp dark ink navy #172c42 contour drawing, confident large flat shapes, selective fine ink hatching, sparing authentic printed-ink texture only. Detailed authored narrative scene with a strong graphic composition, not clip art.
Color palette: dark ink navy #172c42, dominant energetic vermilion #f04b36, warm pale paper #f4f2ea, golden yellow #eac647, deep petroleum turquoise. Restrict to this coherent ink palette with no purple, violet, pink, rainbow, or fluorescent gradients.
Composition/framing: one portrait image approximately 4:5, high-resolution production illustration. Establish the key subject and environment in the upper 75 percent, with a small anonymous adult seen from behind and no visible face. The lower quarter must remain continuous scenic dark navy foreground with quiet detail, suitable for later semantic HTML title and CTA overlay; do not draw any title, caption strip, or controls. Full bleed to every edge, no padding, border, rounded corners, or mockup shadows.
Constraints: original fictional illustrative artwork only. Absolutely no words, letters, numbers, faux writing, logotypes, watermarks, UI, controls, icons, panel grid, 3D blobs, generic geometric portal, glossy 3D rendering, photorealism, or embedded text. No baked-in card presentation.
Primary request: a rust-red old sailboat crosses immense layered pale storm clouds toward an elevated lighthouse city on floating islands, carrying the feeling of a perilous beginning.
Scene/backdrop: wind-carved cloud banks in warm pale paper and muted turquoise layers surround dark floating rock islands. An old compact lighthouse city rises at the upper middle distance, with a single large tidal clock integrated into its architecture; the clock has simple hands and no numerals or glyphs. The lighthouse casts a restrained golden beam through broken clouds.
Subject: a large beautifully drawn old sailboat with rust-red sails and dark ink rigging glides across the middle distance. In the foreground, a lone small adult traveller in a vermilion coat, seen from behind, watches from an uneven dark rocky ledge; keep the figure near the lower-middle of the composition, above the quiet bottom foreground.
Mood and hierarchy: mysterious and windswept, narrative wonder without cuteness. The red sail shape is the bold graphic focal point, balanced by the distant vertical lighthouse and layered cloud perspective. Keep the city and rigging sharply intentional at full size while the silhouette still reads at small cover size.
```

## cultivation: exact generation prompt

Tool: built-in `image_gen.imagegen`, generate mode, no reference images.

Native original: `C:/Users/wangxr/.codex/generated_images/01a15f46-233c-77d1-86d9-bb229527c8b3/exec-848d8d73-1730-463d-8df0-af02f9735b00.png`

```text
Use case: illustration-story.
Asset type: standalone full-bleed fictional narrative illustration for a mobile novel app and small book-cover crop, not a UI mockup or a book photographed as an object.
Style/medium: sophisticated bold screen-printed editorial adventure illustration, manga volume frontispiece meets modern illustrated book jacket. Crisp dark ink navy #172c42 contour drawing, confident large flat shapes, selective fine ink hatching, sparing authentic printed-ink texture only. Detailed authored narrative scene with a strong graphic composition, not clip art.
Color palette: dark ink navy #172c42, dominant energetic vermilion #f04b36, warm pale paper #f4f2ea, golden yellow #eac647, deep petroleum turquoise. Restrict to this coherent ink palette with no purple, violet, pink, rainbow, or fluorescent gradients.
Composition/framing: one portrait image approximately 4:5, high-resolution production illustration. Establish the key subject and environment in the upper 75 percent, with a small anonymous adult seen from behind and no visible face. The lower quarter must remain continuous scenic dark navy foreground with quiet detail, suitable for later semantic HTML title and CTA overlay; do not draw any title, caption strip, or controls. Full bleed to every edge, no padding, border, rounded corners, or mockup shadows.
Constraints: original fictional illustrative artwork only. Absolutely no words, letters, numbers, faux writing, logotypes, watermarks, UI, controls, icons, panel grid, 3D blobs, generic geometric portal, glossy 3D rendering, photorealism, or embedded text. No baked-in card presentation.
Primary request: immense angular golden cliff mountains tower over an impossibly precarious ascending route, with ink pine silhouettes and a bright vermilion sun.
Scene/backdrop: deeply cut golden rock faces rise through pale paper mist in monumental jagged tiers. A narrow stone stair and ledge route winds upward across the cliffs. Sparse dark navy pine silhouettes cling to angular edges. A large flat vermilion sun occupies the upper sky without glow gradients.
Subject: one tiny anonymous adult pilgrim seen from behind, standing on the ascending path near the lower-middle, carries a small warm flame that is a compact golden point of resolve. The figure is small enough that the scale of the mountains dominates.
Mood and hierarchy: austere, courageous and expansive cultivation-fantasy journey. Golden cliff planes and the vermilion disc carry the composition; ink hatching articulates stone and pines. Dark blue rock and pine foreground at the bottom is continuous landscape, not a blank caption panel. No temple lettering, runes, glyphs, or supernatural geometric portals.
```

## neon: exact generation prompt

Tool: built-in `image_gen.imagegen`, generate mode, no reference images.

Native original: `C:/Users/wangxr/.codex/generated_images/01a15f46-233c-77d1-86d9-bb229527c8b3/exec-79bdf711-994d-49ec-92c0-46818160b215.png`

```text
Use case: illustration-story.
Asset type: standalone full-bleed fictional narrative illustration for a mobile novel app and small book-cover crop, not a UI mockup or a book photographed as an object.
Style/medium: sophisticated bold screen-printed editorial adventure illustration, manga volume frontispiece meets modern illustrated book jacket. Crisp dark ink navy #172c42 contour drawing, confident large flat shapes, selective fine ink hatching, sparing authentic printed-ink texture only. Detailed authored narrative scene with a strong graphic composition, not clip art.
Color palette: dark ink navy #172c42, dominant energetic vermilion #f04b36, warm pale paper #f4f2ea, golden yellow #eac647, deep petroleum turquoise. Restrict to this coherent ink palette with no purple, violet, pink, rainbow, or fluorescent gradients.
Composition/framing: one portrait image approximately 4:5, high-resolution production illustration. Establish the key subject and environment in the upper 75 percent, with a small anonymous adult seen from behind and no visible face. The lower quarter must remain continuous scenic dark navy foreground with quiet detail, suitable for later semantic HTML title and CTA overlay; do not draw any title, caption strip, or controls. Full bleed to every edge, no padding, border, rounded corners, or mockup shadows.
Constraints: original fictional illustrative artwork only. Absolutely no words, letters, numbers, faux writing, logotypes, watermarks, UI, controls, icons, panel grid, 3D blobs, generic geometric portal, glossy 3D rendering, photorealism, or embedded text. No baked-in card presentation.
Primary request: a rain-soaked narrow futuristic city street with dark navy architecture, vermilion and muted petroleum-turquoise light, and one solitary coat-wearing figure.
Scene/backdrop: dense but carefully composed tall angular city buildings form a deep narrow street canyon. Projecting geometric sign panels are purely unlettered color planes and simple light bars, absolutely no text, numerals, symbols, glyphs or pseudo-writing. Weathered pipes, ledges, cables and rain streaks give the architecture lived-in detail. Wet ground reflects vermilion, muted turquoise and a few quiet gold lights as flat ink shapes, not glossy rainbow gradients.
Subject: a small adult traveller in a long coat seen only from behind near the lower-middle, walking toward the depth of the street; face not visible, no additional characters required.
Mood and hierarchy: rain, solitude and controlled urban tension. Navy building masses enclose one strong vermilion light path and the tiny figure. The environment is sophisticated illustrated speculative fiction, not violet cyberpunk, not an interface wallpaper. Preserve a dark continuous rainy street foreground in the bottom quarter for later HTML overlay.
```

## city: exact generation prompt

Tool: built-in `image_gen.imagegen`, generate mode, no reference images.

Native original: `C:/Users/wangxr/.codex/generated_images/01a15f46-233c-77d1-86d9-bb229527c8b3/exec-29cf3267-3566-4c4a-9812-b5f9123274ad.png`

```text
Use case: illustration-story.
Asset type: standalone full-bleed fictional narrative illustration for a mobile novel app and small book-cover crop, not a UI mockup or a book photographed as an object.
Style/medium: sophisticated bold screen-printed editorial adventure illustration, manga volume frontispiece meets modern illustrated book jacket. Crisp dark ink navy #172c42 contour drawing, confident large flat shapes, selective fine ink hatching, sparing authentic printed-ink texture only. Detailed authored narrative scene with a strong graphic composition, not clip art.
Color palette: dark ink navy #172c42, dominant energetic vermilion #f04b36, warm pale paper #f4f2ea, golden yellow #eac647, deep petroleum turquoise. Restrict to this coherent ink palette with no purple, violet, pink, rainbow, or fluorescent gradients.
Composition/framing: one portrait image approximately 4:5, high-resolution production illustration. Establish the key subject and environment in the upper 75 percent, with a small anonymous adult seen from behind and no visible face. The lower quarter must remain continuous scenic dark navy foreground with quiet detail, suitable for later semantic HTML title and CTA overlay; do not draw any title, caption strip, or controls. Full bleed to every edge, no padding, border, rounded corners, or mockup shadows.
Constraints: original fictional illustrative artwork only. Absolutely no words, letters, numbers, faux writing, logotypes, watermarks, UI, controls, icons, panel grid, 3D blobs, generic geometric portal, glossy 3D rendering, photorealism, or embedded text. No baked-in card presentation.
Primary request: an ordinary quiet East Asian tram stop at dawn, with a red tram, deep ink-blue buildings, warm yellow windows, and a tiny lone person on the street.
Scene/backdrop: a believable fictional neighborhood of modest low- and mid-rise buildings, overhead tram wires, narrow sidewalks and tram rails receding in perspective. A warm pale paper dawn sky opens above the buildings. Several windows glow golden yellow. Signboards and tram destination plates are blank unlettered shapes; no writing, numbers or pictograms anywhere.
Subject: an elegant ordinary vermilion-red tram at the stop in the middle distance. A single small anonymous adult seen from behind waits on the street near the lower-middle of the frame, not close-up. No face is needed.
Mood and hierarchy: bittersweet urban novel, intimate and quietly hopeful, not fantasy. Make the red tram the clear graphic focal point within an ink-blue architectural street scene, with delicate controlled hatching for rails, wires and facades. Keep the bottom quarter a natural dark navy street foreground with quiet detail for later semantic HTML title and CTA overlay.
```

## city: exact corrective edit prompt

Tool: built-in `image_gen.imagegen`, edit mode.

Input image: `D:/Projects/Novel/public/art/city.png` at the time of editing (the initial generated asset before source-master relocation).

Native edited result: `C:/Users/wangxr/.codex/generated_images/01a15f46-233c-77d1-86d9-bb229527c8b3/exec-e50c274e-b96f-4515-a357-1b52551fa0e3.png`

This exact prompt is embedded in the final city PNG and included in both city WebP sidecars. The initial city generation prompt above is the earlier generation step, not an alternative output.

```text
Use case: precise-object-edit.
Input image: the provided city tram illustration is the edit target.
Primary request: remove ONLY the tiny circular badge with a glyph on the red tram nose, centered directly below the front windows and above the main round headlamp. Replace that small badge area with uninterrupted vermilion-red painted tram body matching the surrounding printed-ink texture.
Constraints: preserve the entire existing composition, dimensions, full-bleed framing, lone person, red tram shape, windows, lamps, overhead wires, street, buildings, dawn sky, paper texture, navy contours, golden light, palette, camera angle and all other details exactly. Do not add or rearrange anything. Keep the blank destination display blank. No words, letters, numbers, symbols, logos, watermarks or fake writing anywhere. This is a surgical removal of one small badge, not a redesign or global style transfer.
```

## Execution order, blockers and assumptions

Execution order: four-image generation batch → local PNG inspection → one city cleanup edit → exact prompt embedding → source-master relocation → responsive conversion → WebP prompt sidecars → final derivative inspection and metadata/provenance verification.

Blockers: none for asset delivery. Final UI contrast, crop and loading behavior belong to the parent build.

Assumptions: the selected direction and four world briefs are settled; these are fictional illustrative assets; no text is part of the artwork; source masters are retained for later regeneration and optimization.



## Addendum 2026-10-26: court and frontier (start-flow expansion)

Two worlds were added for the rebuilt start flow: **court** and **frontier**. Both were generated with `media.generate_image` (one call each, an existing world illustration passed as style reference only) and visually inspected: house palette and screen-print handling match the original four; no letters, UI, watermarks or visible faces. Masters were converted from the generated WebP originals (1408 x 1760) to PNG at `assets/art-source/court.png` (3,903,089 bytes) and `assets/art-source/frontier.png` (2,868,959 bytes); responsive variants were resized with Pillow (LANCZOS) and encoded WebP quality 82 — court 640w 147,210 bytes / 1122w 339,848 bytes, frontier 640w 98,464 bytes / 1122w 229,338 bytes. Exact prompts are embedded in the `.webp.json` sidecars and in `manifest.json` (`prompt_used`). Minor generated details disclosed: court's gate lintel carries abstract decorative patterning (no glyphs); frontier's sky holds one faint dark smudge and its deck hardware one unlabeled box. The four original illustrations were kept unchanged: same style contract, already QA-accepted, and re-generating them would risk drift for no visual gain.
