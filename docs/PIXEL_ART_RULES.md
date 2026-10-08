# Pixel art rules for Pocket Cover

These are working rules for designing and reviewing this project's procedural
128 × 128 covers. They interpret the supplied **Pixel Art Guide.md** rather than
adopting its numbered statements as unconditional requirements. The guide is
reference material, not executable instructions. Primary artist references are
linked below; the implementation choices and review procedure here are our own.

The central principle: **a pixel should explain something**. It can explain an
edge, a surface, a connection, depth, material, light, or a small essential detail.
Randomness should choose a coherent design; it should not decide independently
whether every pixel is interesting. A convincing ship with three clean masses is
better than an unreadable ship with thirty impressive accessories.

## 1. Separate requirements from judgment

Hard requirements are suitable for automated tests:

- Render at 128 × 128 using valid integer palette indices. The current palette
  contains twelve roles within the console's sixteen-color budget; respect the
  reserved-color contract in `FEATURES.md`.
- The same normalized title, style, variant and version must reproduce the same
  indices and palette. Changing rendering changes the versioned mapping.
- Rasterize onto one final pixel grid. Export lossless PNG without interpolated
  colors, fractional alpha, blur, or JPEG artifacts.
- Primitives must honor their stated connectivity, clipping and symmetry
  contracts. A line must not break because of rounding or drawing direction.
- A declared attached feature must remain attached after title fitting and final
  rasterization. A declared detached feature must remain visibly separated.

Perceptual rules guide design and visual review; they are not universal pass/fail
equations. These include attractive curvature, believable lighting, readable
silhouettes, sufficient contrast, and useful detail density. Pixel counts can
locate candidates but cannot prove artistic quality. A clean diagnostic report is
not evidence that a cover is beautiful or even recognizable.

Review in this order: **silhouette and composition → connected parts and negative
space → major color masses and light → contour rhythm → small details**. Fix the
earliest failure first. Extra texture will not rescue an ambiguous silhouette.

## 2. Jaggies: preserve the intended contour

Read a contour as a succession of runs. A jaggie is an unintended change in its
apparent direction, not simply the existence of square steps. Ask what the edge
is supposed to describe: a straight strut, an arc, a leaf tooth, or a broken rock?
The answer determines whether a corner is useful.

For straight lines, distribute unavoidable longer and shorter runs evenly. A
2:1 slope has a repeated two-across, one-up rhythm; arbitrary slopes can need a
balanced mixture. Short runs at endpoints are often just truncation. Do not
reject a line because its first run differs from the interior runs.

For curves, compare runs locally within each monotonic arc or octant. Horizontal
runs generally lengthen toward a horizontal tangent and shorten toward a
vertical tangent; change the measuring axis when appropriate. There is **no
universal `3,5,7,5,3` recipe**, nor must all run lengths change by one. Small
circles and ellipses have too few pixels for a perfect numerical progression.
Use mirrored octants when symmetry is intended, then judge the whole silhouette.

For thin stroke joins, look for unintended three- or four-pixel elbows in a 2 × 2
neighborhood. Repair the path or join rule that produced a bulge. Do not globally
erase these patterns: filled areas, thick lines, branch junctions and real square
corners contain them legitimately. Tooth tips, antenna ends and tiny circular
extrema also need contextual review instead of automatic shaving.

Implementation rule: improve the shared line, arc or shape construction before
adding per-recipe coordinate patches. Keep intentional polygon corners sharp.
This interpretation draws on Saint11's distinction between accidental stroke
corners and an edge's overall rhythm in [Working with lines](https://medium.com/pixel-grimoire/how-to-start-making-pixel-art-7-e504bfa4ddf2).

## 3. Clusters: distinguish noise from useful small information

Design body, shadow and highlight regions as meaningful patches. Texture should
reinforce those patches rather than dissolve them into confetti. Saint11's
[Cluster Sketching and Painting](https://saint11.art/pixel_art_articles/article2/)
emphasizes larger color groups while allowing small accents with a clear purpose.

Two different diagnostics matter:

| Candidate | Meaning | Correct response |
| --- | --- | --- |
| Detached foreground fragment | A foreground component separated from the object's other material colors | Inspect its intended role and attachment; repair geometry or remove accidental debris |
| Isolated color pixel | No neighbor of the same color, even though surrounding pixels may belong to the object | Inspect whether it is an eye, glint, texture, corner transition or meaningless speck |
| Diagonal-only connection | Touches another pixel at a corner | Valid for a thin diagonal; often too weak for a thick stem or load-bearing attachment |

Use eight-neighbor connectivity when checking thin diagonals, so a one-pixel
45° stroke is not misclassified as many loose pixels. Four-neighbor checks can
help identify weak contacts, but their findings are warnings with context.

Prefer two- or three-pixel material marks where they convey the same information
more clearly. Removing a useless mark is often better than making it larger.
Do not impose a minimum cluster size on every color or force all artwork into
one connected component.

Explicit exceptions:

- **Stars and distant lights:** intentional background marks with restrained
  density, spacing and contrast. They should not imitate loose ship debris or
  intersect lettering.
- **Eyes, tiny windows, locks and instrument lights:** a single pixel may carry
  essential identity. Keep its placement tied to the relevant part.
- **Glints:** a bright isolated pixel can identify a sharp reflective surface.
  Place it according to material and lighting rather than scattering it randomly.
- **Glyph diacritics, moons and floating magic ornaments:** separate objects are
  valid. Give them an evident arrangement and sufficient clearance.
- **Dithering:** isolated color samples may belong to a deliberate tonal pattern.
  Assess the region and pattern, not each pixel independently.

Cure explicitly recognizes small essential features and specular highlights as
valid uses of individual pixels in [The Pixel Art Tutorial](https://pixeljoint.com/forum/forum_posts.asp?TID=11299).

Never run a blanket majority filter, morphological opening, or “delete every
singleton” pass on the complete cover. It can erase stars, thin strokes, eyes and
bitmap text while leaving larger defects untouched. Prefer preventing accidental
fragments at generation time. If a scoped repair is needed, apply it only to a
known material mask, preserve intentional details, and use the previous layer's
actual pixel when restoring background. Report diagnostics without silently
mutating the final image.

## 4. Shading explains form; detail explains material

Choose a lighting convention for each composition. The main body, attached
parts and cast shadows should agree with it. Flat planes usually need a single
readable tone; cylinders and spheres need a few shaped light regions. Shadows
at intersections explain which part overlaps which. Reserve small intense
highlights for reflective or emissive details. This follows the form-based
approach in Saint11's [Basic Shading](https://saint11.art/pixel_art_articles/article4/).

Avoid automatically nesting smaller copies of an outline to create shading.
That describes distance from the silhouette rather than surface orientation.
Front lighting, rim light, emissive crystals and radial designs are all valid
when their geometry and light explain the result. A ring is not automatically
pillow shading; a planet's latitude bands may describe material rather than
illumination.

Use the existing palette roles consistently: 4 for ink/contact shadow, 5–7 for
main material, 8 for scarce bright emphasis, and 10–11 for accents. Roles are
starting points, not proof of sufficient contrast. Judge colors together in the
rendered image; equal changes in RGB or HSV are not equal perceived changes.

Hue shifts can enrich a ramp, but warm highlights and cool shadows are not a
universal law. Let palette, illumination and material agree. Saint11 discusses
these choices as flexible in [Basic Color Theory](https://saint11.art/pixel_art_articles/article6/).

Repeated shade strips that copy the same staircase can produce banding. Improve
the shapes and extent of the light regions; do not add random offsets merely to
break alignment. Some parallel boundaries are necessary for pipes, rails,
outlines and mechanical surfaces. The question is whether they describe a
surface or accidentally make it look swollen and blurry.

For this engine, **draw the material first and derive effects from its mask**.
The outline should describe the object's boundary, not add another independently
scaled black version of each part. Use `p.group(draw, {outline:1, color:4,
shadow:{x:2, y:3, color:4}})` around filled source geometry. Internal ink still
has a role for seams, openings and readable detail. Choose a stronger outline
deliberately, as with 2–3px heraldic fields, rather than obtaining it accidentally
from overlapping borders.

Outline width and shadow offset are final-pixel decisions. They must remain
stable when the object is fitted smaller. Derive both effects from the original
filled selection; stroking the shadow or shadowing an already stroked object
changes their meaning and makes borders swell. Our shared mask uses an integer
Euclidean disk: a 1px outline grows into cardinal neighbors, without diagonal
corner blocks. This is a project construction rule, not a universal artistic
requirement that every shape needs a dark outline or cast shadow.

Give an assembly one deliberate outside contour; use finer internal borders to
explain overlapping parts. `exteriorOnly:true` preserves enclosed openings by
distinguishing outside space from bounded holes. Four-connected background is
the counterpart to our eight-connected silhouettes, so a diagonal join can close
an opening. Do not outline atmospheric bubbles or exhaust as if they were metal.

Let effects stop where their meaning changes. Plants keep their material at the
ground but clip outline and shadow at root contact through `effectMask(x,y)` in
recipe coordinates. Ships use `edgeShade` for a restrained checker band on lower
and right material edges; this is a style choice, not a complete lighting model.
Machine pipes round only their own orthogonal source mask by one final pixel at
convex corners. Thin pipes retain their stroke. None of these rules filters the
finished image or promises to repair every arbitrary contour.

## 5. AA and dithering are deliberate tools

The project's default is crisp indexed rasterization. Fix geometry before
considering anti-aliasing. Do not apply blur, supersampling, or an automatic
whole-image smoothing pass as a cure for jaggies.

If a future recipe needs AA, place palette-controlled transition pixels only
where they improve the intended edge at native size. The transition should read
between its neighbors in value, without expanding the silhouette or making a
halo. A suitable existing palette color can work without being an exact RGB
average. Ordinary horizontal, vertical and regular 45° edges generally need no
extra smoothing. These are conservative project defaults informed by
[Anti-Alias and Banding](https://saint11.art/pixel_art_articles/article5/), not a
claim that every pixel-art style must avoid AA.

Dithering needs an assigned region, two chosen colors and a purpose: tone or
material. Clip it to that surface and leave silhouette-critical edges clear.
Prefer a controlled pattern or clustered texture to independent random samples.
There is no universal 25% area cutoff; visible noise depends on contrast, scale,
pattern and intent. Do not add a new color automatically when a threshold is
crossed: the console budget still applies.

Our default is a simple checker with quarter-density levels. At 50% each pixel
alternates with its orthogonal neighbors. That regular structure should read as
an intentional surface pattern, not random grit. Reserve `lines` or `crosshatch`
for a material that benefits from their direction. The legacy 4×4 `ordered`
pattern remains available explicitly; it is not the current cover default.
Masks use local surface coordinates while pattern phase uses the final device
grid, so fitting a part does not stretch or scramble its texture. Cure discusses
purposeful pattern and texture in [The Pixel Art Tutorial](https://pixeljoint.com/forum/forum_posts.asp?TID=11299);
Surma's [Ditherpunk](https://surma.dev/things/ditherpunk/) explains deterministic
threshold maps. Our choice of checker levels and restraint is an interpretation
for these small covers, not a claim that ordered dithering is inherently bad.
`lines`, `crosshatch` and the shared `ordered` branch are available but unused
by current cover recipes. Continuous tone ramps use the same checker phase.
Original mascot
classic framing preserves its separate Bayer sky for compatibility.

## 6. Recipe and engine responsibilities

Shared raster code owns coordinate conventions, stroke coverage, shape sampling,
mask effects and clipping. Recipes own what a part means, how it attaches, intentional
disconnection, material pattern and light. Keep subject-specific projection,
occlusion or masks local until another recipe needs the same behavior, and
record memory/trimming boundaries in `FEATURES.md`.

| Subjects | Review emphasis |
| --- | --- |
| Spaceships, vehicles | Strong hull; paired parts share geometry; engines, wheels and guns attach convincingly |
| Machines | Pipes join tanks; rounded elbows stay connected; vessel highlights explain cylindrical form |
| Buildings | One 2:1 projected footprint; windows and roof repetition belong to their planes; near faces occlude far details |
| Relics, heraldry, glyphs | One readable central silhouette; ornaments have intentional spacing; stroke intersections stay open or closed as intended |
| Plants | Stem-to-branch-to-leaf continuity; clustered foliage; teeth and thorns are deliberate contour changes |
| Islands, dungeons | Clear plane order, visible landmarks, coherent projection, water and props contained by their surfaces |
| Planets | Coherent disk edge, clipped terrain, clean ring occlusion, quiet starfield and intentional satellites |
| Mascot | Preserve facial identity; treat eyes and glints separately from material noise; review any compatibility exception explicitly |

For a 2:1 projected grid use consistent axes: two pixels horizontally per one
vertically. Its angle is `atan(1/2) ≈ 26.565°`, commonly called pixel isometric;
it is not the true 30° isometric projection. A different consistent projection
can also work. Avoid independently varying axes merely to create randomness.
SLYNYRD's [Isometric Pixel Art](https://www.slynyrd.com/blog/2022/11/28/pixelblog-41-isometric-pixel-art)
explains this 2:1 convention and the grid behind it. Our implementation keeps
building coordinates and face projection together so doors, windows, roof ridges
and stairs cannot each invent a different slope.

Build architectural hierarchy before decoration: footprint → connected volumes
→ wall/roof planes → repeated bays → selected small details. This adapts the
mass-to-facade approach described in the abstract and indexed excerpt of Müller
et al.'s [Procedural Modeling of Buildings](https://doi.org/10.1145/1179352.1141931)
to our tiny images. The full paper was not reviewed; this is not an implementation
of the full CGA system.
Roof repetition needs a shared pitch and support. A window is a mark on a wall,
so a nearer roof must hide the wall and its window together. Architectural
variation should change proportions and assemblies while preserving these
relationships. Our review of the official
[SimCity 2000 screenshots](https://www.gog.com/en/game/simcity_2000_special_edition)
reinforced clear roof/wall tones, repeated facade rhythm and ground extending
behind lower floors. These are our observations, not instructions from the game.

For small side-view vehicles, preserve a dark tire, quieter inner rim and centered
axle before attempting spokes. Four scattered marks do not necessarily read as
four spokes. Roof highlights, dark windows and broad body planes should carry
the form before decals. Those interpretations come from visually reviewing
[Kauzz's Modern++ Sideview Cars](https://kauzz.itch.io/modern-sideview-cars).
Pointed glass reflections should remain inside the porthole; a rectangular glint
must not accidentally flatten its frame. We use these references to study visual
relationships, not to trace or include their sprite assets.

Viewport fitting changes geometry before rasterization. Review the **final**
128 × 128 image: clean source coordinates alone do not guarantee clean pixels
after rounding. Connected primitives should share transformed endpoints. Sampled
surfaces and their outlines should share a coverage convention or explicit mask.

A concave dish needs a visible hollow, not just an ellipse with a sphere's
highlight. Separate the raised rim, its shadow inside the bowl, the illuminated
opposite inner wall and the focal receiver. This interpretation follows the
discussion of self-cast shadows and reflected light in the accessible transcript
of Brent Eviston's [Concave Forms lesson](https://www.skillshare.com/en/classes/shading-beyond-the-basics-shade-any-subject-no-matter-how-complex/516140914).
Our tiny dishes simplify those lighting relationships into three broad tones;
they are not a physical light simulation.

An opening owns the coverage of anything inside it. Teeth attach at the jaw and
project inward, then clip to the mouth; glass highlights clip to the same disk
as their porthole. Adjacent crystal pieces should overlap and meet their common
socket. Flat facets read through angular boundaries and contrasting planes,
without texture softening every cut. At this scale, flat windows and doors often
describe a building more clearly than nested frames and tiny hardware.

The crystal study adds a more specific interpretation. Natural quartz specimens
in the [Joanneum mineral collection](https://www.museum-joanneum.at/naturkundemuseum/forschung/mineralogie/sammlungsbereiche/regionalsammlung-steiermark)
show long prism faces meeting angled terminal faces; they are not stacks of
rectangles. In [Rappenem's own pixel-crystal study](https://x.com/Rappenem/status/1827022531028549921),
the most useful relationships are large/medium/small masses, clearly colored
faces, narrow reflections and a little reflected light in the shadow. These are
observations from the reference images, not universal requirements or traced assets.
For this engine, keep the staff's colored cap and long contrasting face, reserve
cream for small glints, and anchor cluster pieces in one socket. A crystal ball
uses one disk, curved ramp transitions and a small specular highlight. An inscribed
tablet is a different material: beveled stone, one readable carved seal, quieter
secondary writing and texture kept away from the main inscription.

Prefer simple repeating diagonal ratios when selecting long straight features.
Use `preferredVector` before placing adjoining planes, and share its chosen
endpoint with the contour and details. Never independently snap finished strokes:
that can open joins. The preference is weaker for short lines, and preserves
angles that would need a large change. Uniform final fitting can still introduce
an end-run difference; inspect the actual pixels rather than promising that every
diagonal is mathematically perfect.

An island's underside turns away from the upper-left light: the left face is
lighter, the center darker and the right/deep faces darkest. Use the object's
material ramp with different checker densities, not unrelated flat background
gray. Waterfalls share the island's sloping rim, fall in a continuous vertical
ribbon and end together across their width. Tone may change down the ribbon;
transparency must not create detached drops. Lighthouse bands clip to the taper.

A building's entire projected footprint belongs below its distant horizon,
including the rear edge. Compute contact from the footprint, not just the lowest
visible pixel. Dungeon scenery is an intentional exception to the usual title
zone: quiet arches and torch glow may rise beside and behind the lettering,
which is still drawn last. Dither the distant wall edges to reduce hard framing.

## 7. Repeatable review workflow

A rectangular texture on a sphere must live in surface coordinates. Clipping a
flat grid to a disk gives it a circular boundary but no curvature. Inverse-map
the visible surface normal to longitude/latitude: cells narrow toward the limb,
and a tilted globe bends its latitude rows. Keep mechanical panels rectilinear
in this unwrapped space, without mixing in organic terrain.

For a multicolor planetary ring, fill one annular material region and assign a
color to every radius within it. Independent thin arcs leave accidental sky
gaps between stripes. Split the same band into complementary back/front halves
for planet occlusion. For tiny moons, fit a symmetric disk to the final grid and
shade only that disk; offset highlight shapes must never enlarge the silhouette.

1. Fix a title, style and variant set. Record engine and recipe revisions so a
   regression is reproducible. Include short and long two-line titles to exercise
   the title-safe viewport.
2. View the grid at **1× native size** first. Identify each subject, the focal
   feature and the largest silhouette weakness without inspecting individual
   pixels. Check whether title, background and object compete for attention.
3. Inspect at **2×, 4× or 8× nearest-neighbor**. Trace suspicious edges and
   attachments; distinguish accidental debris from intentional small marks.
   Any positive integer factor, including 3×, is valid; powers of two are not
   required. Fractional nearest-neighbor scaling can produce uneven pixel widths
   even when it does not blur. Browser zoom and display scaling can affect the
   apparent grid, so use exported native pixels for definitive inspection.
4. Look at large color masses and lighting. Temporarily inspect a silhouette or
   grayscale view if needed. Avoid letting an attractive palette conceal weak
   geometry.
5. Review diagnostic candidates with coordinates and layer/role context. Explain
   each retained singleton or disconnected element by what it depicts. A list of
   unexplained pixels is a useful backlog, not a reason to delete everything.
6. Fix the generating rule, rebuild the same grid, and compare native and enlarged
   images. Check nearby variants for newly broken joins or over-simplification.
7. Run deterministic/palette/raster checks and rebuild the offline studio and
   examples. Share numbered examples for visual feedback. Preserve deliberate
   variety while removing accidental artifacts.

Automation measures structural facts. Final acceptance still requires looking
at the pixels. Log what was actually inspected and keep claims narrower than
the evidence: reviewing twelve examples does not prove every possible seed.

## Current implementation: engine 18

There are twelve styles. Spaceships, machines, relics, plants, buildings, vehicles,
planets and heraldry use revision 4; islands, glyphs and dungeons use revision 3;
Mascots retains revision 8. Engine 18 is part of the reproduction record even
though it is not in the seed string. `framing:'classic'` retains exact original
mascot v8 output; it does not restore older revisions of the other recipes.
Varied Mascots preserves the character grammar and rim, adds occasional plain
clouds and a checker sky, and uses a `(2,3)` shadow without a dark outline or
scattered body texture.

Primary subject geometry uses shared filled-mask groups. Outline pixels lie
outside the source; shadows come from the same source without its outline.
Nested groups propagate fill selection separately from their effects. The
recorder evaluates recipe commands and group callbacks once, measures source
bounds on a padded surface, reserves room for effects, then replays geometry at
the final fit. Sampling callbacks describe pure material functions and must not
consume random values during replay. See `FEATURES.md` for the temporary-buffer
cost and the boundary for omitting automatic composition.

Ships, machines and vehicles have whole-assembly 2px exterior outlines and
`(3,3)` shadows with finer internal contours. Heraldry favors a 2px outer outline
within a 1–3px range, 2–3px fields and shadows offset x=2–4, y=3–5. Planets use
no outline and a `(1,1)` shadow. The shared exterior flood, directional material
shade, effect mask and rounded pipe each have explicit consumers and trim
boundaries in `FEATURES.md`.

The usual size range is 62–100% of the available fit. Simple ships use 28–78%,
medium ships 45–95%, and complex ships 62–100%. Buildings favor larger,
lower placement and islands favor larger framing. Heraldry and glyphs center
horizontally. Dungeon rooms keep their coupled 2:1 projection, broad footprint
of at least 90 final pixels, and 2px edge margin. Scenery floors follow occupied
bounds. Studio previews stay at 2×; PNGs stay at native 128 × 128.

Buildings use local 2:1 face geometry, attached facade details, ordered occlusion
and distinct wall/roof tones. Their horizon lies 4–10px above the projected rear
edge of the footprint. Island waterfalls occur on about one third of seeds and
end cleanly below the rock; windmills add another landmark grammar. Island scenery
compresses terrain near the bottom with only a 1–2.5px curve. Dungeon scenery uses
filled masonry arches, one or two bats and wall torches; garden ground follows plant
root bounds. These choices require native-size review for tangencies, crowding
and contrast like any other recipe detail.

The remaining structural safeguards have deliberately narrow contracts:

- Canonically ordered lines avoid direction-dependent rounding ties; snapped
  rectangles keep positive thin attachments visible. Rings and arcs share the
  filled ellipse boundary. Planet surfaces and material patterns sample the
  final pixel grid.
- Expanded subjects occupy a separate indexed layer. `cleanSubject()` removes
  only unmarked one-pixel components with no occupied eight-neighbor. It leaves
  isolated colors within an object, thin diagonals, larger fragments and
  background/title pixels alone.
- `p.detail(x, y, color, reason)` declares an intentional single-pixel accent,
  including inside groups. It requires a visual reason and protects the pixel
  only while its declared color remains. Current uses are relic aura sparks and
  tiny submarine bubbles. It is not a way to exempt broken geometry wholesale.
- Default `quality` includes occupied `bounds`, policy and removal count;
  original mascot bounds are null. For expanded subjects, `diagnostics:true`
  adds pre/post-cleanup candidates, removed coordinates and the indexed
  `subjectLayer`. `inspectSubject()` is read-only. Same-color
  singleton candidates are evidence to review, not automatic faults.

These checks do not detect all jaggies, banding, weak attachments, poor lighting
or unclear composition. Continue the visual review workflow and repair the
generating rule when a defect has meaning beyond a detached single pixel.

## Procedural variation contract

Cover subjects and scenery use geometry and sampled materials, never sprites or
imported texture assets. Rendered review PNGs are outputs. Title font glyphs are
the explicit stored-pixel exception; keep lettering legible and preserve the
classic mascot compatibility path.

Vary meaningful parameters, not arbitrary individual vertices or pixels. Counts,
proportions, spacing, local offsets and compatible assemblies should have bounded
seeded choices. A shelf chooses its bottle count once and divides its available
width; paired wings share dimensions; wall joints follow one course pitch. This
is how a motif becomes variable without losing its structure. Named choices in
`variation.js` are independent of evaluation order. Pixel-sampling callbacks must
still be pure, with every random parameter chosen before sampling begins.

Keep true constraints fixed: 128×128 output, palette indices, exact outline
widths, requested centering, circular spheres, 2:1 projection, minimum room size,
and attachment/clipping rules. Two side-view road wheels describe two axles;
varying that count indiscriminately would change the vehicle's meaning. The
goal is controlled diversity, not a random replacement for every numeric literal.
Review indexed geometry with a fixed palette as well as full-color covers.

## Reference scope

The supplied guide provided the topics and terminology. Saint11, Cure, Surma,
SLYNYRD and the Müller et al. abstract/excerpt inform the construction principles; reviewed official
SimCity screenshots and Kauzz's own asset preview inform the visual comparisons.
Their advice, demonstrations and technical explanations are distinct from this
project's implementation choices. Their illustrations and sprites are not
reproduced in the generator.

Michael Azzi's [official Pixel Logic page](https://pixellogicbook.com/) confirms
the book and links its preview. It is a further visual-study resource; these
rules do not claim to summarize or have reviewed the complete commercial book.
Animation and tile-seam rules become relevant if this engine gains animated or
tiled output; they are not new obligations for a static cover generator.
