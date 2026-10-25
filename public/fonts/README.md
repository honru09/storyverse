# Story Serif display subset

`story-serif-800.woff2` is a self-hosted subset of **Noto Serif SC**, weight 800, licensed under the SIL Open Font License 1.1 in `OFL.txt`. No font request is made to Google at runtime.

Source: https://github.com/google/fonts/tree/main/ofl/notoserifsc

Downloaded from the Google Fonts stylesheet endpoint for Noto Serif SC (2026-10-22). Source font URL: https://fonts.gstatic.com/s/notoserifsc/v36/H4cyBXePl9DZ0Xe7gG9cyOj7uK2-n-D2rd4FY7QCrCWv.ttf

The original full download was 14,785,092 bytes. FontTools 4.67.0 with Brotli produced this 147,784-byte WOFF2 subset containing Chinese characters present in `src/main.jsx` and `src/story-engine.js`, Latin letters, digits and common punctuation. Original font naming/license records are retained. `Story Serif` is a CSS family alias, not a new licensed family name.

The subset is used only for titles, not body copy. Unknown characters in user-provided titles fall back to the user's Chinese serif font; a full commercial localization should extend the subset or use a segmented full font. Add newly introduced headline glyphs when rebuilding it. Source downloads and intermediate fonts are not runtime dependencies.
