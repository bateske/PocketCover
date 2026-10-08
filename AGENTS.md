# Pixel-art generator work

Read `docs/PIXEL_ART_RULES.md` before changing drawing behavior or reviewing generated
art. It records this project's interpretation of pixel-art practice, with source
references and explicit exceptions. `docs/FEATURES.md` identifies shared code and
features that can be trimmed with an individual recipe.

Fix geometry and recipe placement before applying cleanup. Never use a complete
image blur, majority-color filter, or blanket removal of single-color pixels.
Preserve intentional stars, highlights, eyes and glyph details. Keep indexed
pixels within CHGame's palette budget and preserve deterministic title/style/
variant behavior. Keep the original mascot's v8 snapshot tests passing with
`framing:'classic'`; default varied framing applies to every style.

For rendering changes, run `npm test`, regenerate `npm run examples` and
`npm run standalone`, and inspect representative output at native resolution and
integer enlargement. Share updated seeded contact sheets for art feedback. Keep
diagnostic findings separate from claims of artistic quality: passing a pixel
connectivity test does not establish good silhouettes, lighting or composition.
