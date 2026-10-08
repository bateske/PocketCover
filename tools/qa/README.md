# QA tools (development only)

These tools are not in package.json `files` and never ship. They do not change the runtime. Run them from the project root with Node 20 or later.

`baseline` is shorthand for the frozen engine-18 copy at `baseline/engine18/index.js`; never edit that folder. An engine argument is any tree's `index.js`. Paths are resolved from the current directory first, then from the project root.

Diagnostics are not art review. A clean digest, merge or bench run says nothing about silhouettes, lighting or composition. To judge those, look at the sheets at 1x and at an integer enlargement.

## Package scripts (in `scripts/`)

| Command | Purpose |
|---|---|
| `npm run digest -- --scope all\|compat\|raster\|scenery[,..]` | Compares the current tree with the baseline, another engine, or a snapshot. Exits 1 on any mismatch. Options: `--against baseline\|<index.js>\|<snapshot>\|none`, `--engine <index.js>`, `--write <name>` (writes `examples/qa/digests/<name>.json` plus `.pixels.gz` and `.detail.json.gz`), `--fields indices,palette,traits,composition,title,quality`, `--styles`, `--exclude`, `--titles "A\|B"`, `--variants 0-23`, `--framings varied,classic`, `--strict-order`, `--limit 20`, `--quiet`. |
| `npm run compare -- [--before baseline\|<index.js>] [--after <index.js>] [--styles a,b] [--variants 0-11] [--scale 2] [--title T] [--framing varied] [--out examples/qa/compare]` | Renders before and after sheets live. Writes `<style>.png`, `<style>-native.png`, `overview.png`, `overview-native.png`, `compare.json` and `index.html`. |

What each digest scope covers:
- `all`: 12 styles × 6 titles × variants 0–23 × both framings, with `diagnostics:true`.
- `compat`: classic mascot, the 12 `tests/mascot-v8.json` cases (also checked against their stored sha), and the raster fixtures.
- `raster`: about 90 primitive, transform, group, dither and variation fixtures from `scripts/digest-fixtures.mjs`.
- `scenery`: `renderBackground` with the `procedural-contract` and `variation.test` bounds and traits.

JSON fields are compared with sorted keys. A change only in key insertion order is reported as a note; `--strict-order` turns it into a mismatch.

## Tools in `tools/qa/`

| Tool | CLI |
|---|---|
| `merge.mjs` | `--base <snapshot dir> --from <sandbox> --to <main> --allow "<glob>,<glob>" [--ignore "<globs>"] [--apply]`. A dry run unless `--apply`. It refuses changes outside the globs, refuses deletions, and refuses files whose main copy differs from the base. Always ignored: `examples/**`, `node_modules/**`, `.git/**`, `standalone.html`, `**/*.log`. |
| `manifest.mjs` | `[<dir>] [--out file.json] [--check file.json] [--exclude "<globs>"]`. A sha256 manifest that excludes `examples/`, `node_modules/`, `baseline/` and `.git/`. `--check` exits 1 if anything changed. |
| `bench.mjs` | `[--engines a,b] [--titles 4\|"A\|B"] [--variants 0-23] [--repeat 3] [--styles] [--framing] [--diagnostics] [--json out]`. Reports the median ms per cover after a warm-up, with ratios against the first engine. |
| `sheet.mjs` | `[--engine] [--style a,b] [--titles "A\|B"] [--variants 0-11 \| --pool 0-399 --wild n] [--scales 1,2,4] [--modes cover,menu,silhouette,indexed] [--framing] [--cols 6] [--no-labels] [--out dir]`. See the notes below. |
| `crop.mjs` | `--style s [--title T] [--variant n] [--framing] [--engine] [--rect x,y,w,h] [--ascii] [--out crop.png] [--scale 8] [--grid]`. See the notes below. |
| `size.mjs` | `[--engines a,b] [--flash-ratio 0.41] [--json out]`. See the notes below. |

`sheet.mjs` modes:
- `menu`: a 1px border plus the install bar over x 8–119, y 110–119, as in artkit's menu view.
- `silhouette`: the diagnostics subject layer in black.
- `indexed`: a fixed debug colour per palette index.

With `--wild`, it keeps only covers with `cover.look.tier >= 2`. Engines without `cover.look` skip it.

`crop.mjs` prints the palette-index grid as hex, and a layer map: S is subject, B is background, T is title, `?` means the subject is unknown (legacy mascot). It takes the title footprint from `quality.titleMask` when present. Otherwise it replays the tree's `title.js`.

`size.mjs` reports "dense" bytes: comments stripped and whitespace collapsed. It covers each runtime module, each per-style recipe closure, a trimmed single-style total and the overall total. Estimated flash is dense × 0.41 (approximate).

Example wave check:
```sh
node tools/qa/manifest.mjs --out ../CHProcGen-work/manifests/pre-wave.json
node tools/qa/merge.mjs --base ../CHProcGen-work/snapshots/<base> --from ../CHProcGen-work/sandboxes/<id> --to . --allow "recipes/planets*.js,tests/planets*.test.js"
npm run digest -- --scope compat
```
