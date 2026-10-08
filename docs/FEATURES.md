# Engine features and trimming guide

Current mapping: engine **18**, twelve styles. Mascots is revision **8**;
spaceships, machines, relics, plants, buildings, vehicles, planets and heraldry
are revision **4**; islands, glyphs and dungeons remain revision **3**. Import selected recipes
with `createGenerator` to remove unused grammars. The engine has no recipe registry
imports, plugin loader or runtime dependencies.

## Shared implementation

| File / feature | Responsibility | Consumers / trimming boundary |
| --- | --- | --- |
| `engine.js` | Validation, dispatch, independent seeded streams, fitting, output and canvas adapter | All recipes |
| `drawing.js` | Record geometry and sampling callbacks once; measure and replay without new RNG draws | Engine composition infrastructure; direct raster/recipe consumers can omit it |
| `composition.js` | Seeded placement, fitting actual filled bounds and occupied bounds for scenery | Varied framing; classic skips automatic fitting |
| `masks.js`: `outlineMask` | Border outside material from an integer Euclidean disk; 1px expansion is cardinal, without square corner blocks | Shared raster groups; Mascots and planets currently omit outlines |
| `masks.js`: exterior flood | Optional `exteriorOnly` keeps enclosed openings clear using four-connected outside space | **Ships, machines, buildings, vehicles and heraldry** |
| `masks.js`: `dropShadowMask` | Offset the original filled selection, excluding source pixels | Raster groups and varied Mascots; does not derive shadows from outlines |
| `raster.js`: `group` | Fill source and selection, then composite shadow → outline → source; nested groups propagate material occupancy | Primary geometry in expanded recipes; reusable independently of the engine |
| `raster.js`: `edgeShade` group option | Checker shade inside the original material's lower/right edge band | **Spaceships only** currently |
| `raster.js`: `effectMask` group option | Clip outline/shadow using recipe-local coordinates; retain all source material | **Plants only** currently, at root contact |
| `raster.js`: basic primitives | Indexed dots, rectangles, ellipses, polygons and rounded boxes | All recipes |
| `raster.js`: `sphere` | Symmetric final-grid disk, shaded through its surface normal; minimum diameter 4px | **Planet satellites, vehicle tires, track rollers, submarine portholes and relic crystal balls**; discrete edge flag currently used by **portholes only** |
| `raster.js`: `line`, `stroke` | Connected integer paths; canonical endpoint ordering in pixel-art mode | Expanded recipes and scenery |
| `raster.js`: `pipe` | Orthogonal tubing with optional one-device-pixel convex corner cuts | **Machines only** currently |
| `raster.js`: `ring`, `arc` | Hollow coherent digital ellipses; optional angular clipping | Rings shared broadly; angular clipping serves **planet orbits and dish rims** |
| `raster.js`: `sample` | Evaluate material once at each final pixel center; forward recipe and device coordinates | Planets, materials and shared scenery; no longer planet-only |
| `raster.js`: `viewport`, `part` | Uniform overall fitting, anchored independent proportions and horizontal reflection before rasterization | Shared transforms; `flipX` currently used by **vehicles and plants**; effect sizes remain device pixels |
| `raster.js`: `detail` | Reason-tagged isolated accent, including inside groups | **Relic aura sparks and tiny submarine bubbles** currently use it |
| `raster.js`: `superellipse` | Optional analytic shape | Currently unused by included recipes/faces; candidate to omit in a custom build |
| `materials.js`: `dither` | Surface-clipped deterministic device-grid patterns | Expanded subjects and backgrounds |
| `materials.js`: `ditherTone` | Quantize continuous illumination along a supplied ramp using the same checker thresholds | **Crystal balls, concave dishes and waterfalls**; no extra buffer |
| `geometry.js`: `preferredVector` | Soft preference for repeating integer run ratios while choosing geometry | **Car roofs, plant leaves and crystal highlights**; opt-in, never moves raster endpoints |
| `geometry.js`: `insidePolygon` | Point coverage for a recipe-owned polygon | **Tablets, island facets and lighthouse bands** |
| `variation.js`: `createVariation` | Stateless named integer/range choices from a seed; stable against unrelated parameter additions | All current recipes and scenery; direct raster consumers can omit it |
| `backgrounds.js`: `cloud` | Connected cloud base and a seeded count of variable lobes | Shared scenery and varied Mascots; classic Mascots bypasses it |
| `backgrounds.js` | Muted subject-specific scenery, independent of recipe RNG | Expanded subjects; trim scene branches with their consumers |
| `quality.js` | Read-only cluster candidates and narrow detached-single-pixel cleanup | Expanded subject layer; original mascot bypasses this cleanup |
| `random.js`, `palette.js` | Seed hashing, integer RNG and twelve semantic color roles | All recipes |
| `title.js`, `font.js` | Three native fonts, fitting two-line text and title rendering | All recipes |
| `face.js` | Mask-aware eyes, pupils and mouth fitting | **Original mascot only**; removing that recipe removes its import |

Group outline widths and shadow offsets are integer **final pixels**, unchanged
by nested `part` or `viewport` transforms. `outlineMask` expands the original
selection once and returns only pixels outside it; wider outlines do not repeatedly
expand an already stroked result. `dropShadowMask` also uses that original selection.
Nested outlines and shadows never become source material for a parent's effects.

`exteriorOnly:true` restricts an outline to four-connected background reachable
from the canvas edge. Diagonally touching material closes an opening; a real
gap reconnects it to outside space. This preserves bounded holes in assemblies.
`edgeShade:{color,width,density}` shades only the original fill's lower/right
boundary band; width is in final pixels and the checker stays on the device grid.
`effectMask(x,y)` clips only outline and shadow. Nested `part`/`viewport` wrappers
return its samples to recipe coordinates, so plant root contact remains fixed.

`p.pipe(points,color,width=5,radius=1)` requires an orthogonal path. Width scales
with the geometry; radius accepts only 0 or 1 final pixel. Radius 1 cuts convex
elbow and cap pixels from this pipe's own source mask. Pipes below three final
pixels wide retain the full stroke. This is source construction, not smoothing
or filtering the finished cover.

Pixel-art mode retains the established filled ellipse contour and polygon
sampling, canonicalizes line direction, snaps rectangle edges and keeps thin
positive rectangles visible. Rings reuse the ellipse boundary. Partial arcs
require radii of at least two final pixels; smaller partial arcs are omitted.
The original mascot's classic path retains legacy raster behavior and v8 output.

## Local grammar and scenery boundaries

`p.sphere(cx,cy,radius,colorAt)` snaps its center and diameter together on the
final pixel grid. It calls `colorAt(nx,ny,nz,deviceX,deviceY,edge)` only inside the
shared disk mask. The first three arguments form a unit surface normal; device
coordinates are pixel centers and `edge` identifies the four-neighbor boundary
of that exact disk. Existing three-argument callbacks continue to work. A constant palette index is also
accepted. The minimum final diameter is four pixels. `part` uses the smaller
axis scale to keep the silhouette circular. The primitive reuses the bounded
ellipse mask and its row/column arrays; it adds no full-frame buffer.

Engine 15 changes planet surface rendering without reseeding revision 4's
design choices. `sphereUV` in `recipes/planet-surfaces.js` inverse-maps a tilted
surface; all machine panels and conduits use that same projection. `orbitBand`
fills every radial interval between its inner and outer boundaries, then uses
the shared digital arc for a connected colored outer edge at small sizes.

Engine 18 keeps recipe seed namespaces stable, but changes the rendered mapping
for the revised grammars. The vehicle chooser gives two slots each to cars and
tanks, one each to submarines and rovers. Five car bodies include coupes and
supercars; four tank assemblies support tracks or wheels, varied barrel lengths
and either facing. Hovercraft are removed. Focused review grids remain views of
these existing recipes, not additional presets. No full-image buffer is added.

The renderer's complete runtime dependency graph is local JavaScript. Artwork
comes from geometry and material functions; PNG contact sheets are outputs, not
inputs. The stored bitmap font definitions are the sole typography exception.
Tests check this dependency/input contract and compare background index buffers
without RGB palettes to distinguish geometry variation from color changes.

`variation.integer(name,min,max)` is inclusive; `variation.range(name,min,max,steps=100)`
divides the range into a finite number of intervals. Repeating the same name,
seed and bounds repeats the choice, regardless of evaluation order. Include
instance IDs when repeated parts should differ; share names where bilateral
parts should agree. The helper adds no pixel buffers or retained state. The
engine supplies it in recipe context; standalone recipe callers supply their own.
Background parameter limits are exposed as `traits.sceneryParameters` (candidate
counts for scene families, not an inventory of visible objects).

`part(p,{x,y,scaleX,scaleY,flipX:true})` reflects local x before translation.
Choose the anchor explicitly (for example `x:128` for a 128px-wide design).
Sampling callbacks and effect masks receive inverse-transformed coordinates;
ellipse/arc parameters are transformed geometrically. Sphere normals retain
screen-space lighting, and shadows retain their screen-space offsets.

`preferredVector(dx,dy)` keeps the major extent and suggests a nearby 1:N
slope, with more tolerance on longer edges. Share that result with connected
faces and markings. Final fitting and integer endpoints may still change a
run near its end; this helper is a geometry preference, not an edge filter.

| Consumer | Local feature / trim note |
| --- | --- |
| `mascot` | Labelled Mascots; original body/face/rim and landscape; varied framing adds plain clouds and a `(2,3)` shadow, without a dark outline |
| `spaceships` | Mirrored fuselage, wings, engines and simple rockets; whole 2px exterior outline, `(3,3)` shadow and source edge shading |
| `machines` | Gear teeth, gauges, rounded pipes, coils and dishes; restrained 25% black dither on platform and tank bottoms; whole 2px exterior outline and `(3,3)` shadow |
| `recipes/dish.js` | Concave bowl with checker tone transitions, rim shadow, opposite interior highlight and focal receiver; shared by **machines and survey vehicles**, removable only when neither needs dishes |
| `relics` | Colored prism facets, small specular highlights, joined crystal clusters, a single shaded crystal ball or carved tablet; all three material grammars local to this recipe |
| `plants` | Reflected branching, height-dependent leaf counts, pods, flowers, gills and teeth; effects stop at root contact while source geometry reaches the ground |
| `recipes/plant-mouth.js` | **Plants only**: one rotated mouth mask clips tooth and tongue materials; removes with the carnivorous bloom grammar |
| `islands` | Material-colored shaded rock facets, variable tree crowns and landmarks; continuous vertical waterfalls with sloping lips and clean ends, enabled on about one third of seeds |
| `buildings`, `recipes/building-geometry.js` | Building-local 2:1 footprint projection, face visibility/order, flat facade openings, plain/skylit factory roofs, cornices and octagonal towers; whole 2px outline and `(4,4)` shadow |
| `vehicles` | Concentric tires/rims/hubs, treads, submarine hulls and pointed glints, rover equipment; whole 2px exterior outline and `(3,3)` shadow; bubbles/exhaust excluded |
| `planets` | Spherical terrain, fissures, storms, satellites and front/back orbits; no outline, `(1,1)` shadow |
| `recipes/planet-surfaces.js` | Tilted longitude/latitude mapping for machine panels; filled multicolor annuli with complementary front/back halves | **Planets only**; pure material/projection helpers, no extra image buffers |
| `heraldry` | Divided fields, charges and ornaments; outer 1–3px outline favors 2px, fields use 2–3px; shadow offsets x=2–4, y=3–5; fine charge/ornament borders |
| `glyphs` | Connected rune paths, terminals and diacritics; shared 1px outline and offset shadow |
| `dungeons` | Coupled 2:1 projection, broad floor plans, short walls, occupancy and props; bounded channels on either axis, with variable lengths/widths and bridges spanning both banks |
| Island scenery only | Distant polygon terrain compressed into the bottom twelve pixels, with a shallow 1–2.5px horizon curve |
| Dungeon scenery only | Raised/randomized stone arches, dithered wall edges, bat silhouettes and two glowing wall torches; may share title vertical space |
| Vehicle scenery only | Underwater vegetation/bubbles, lunar craters, racetracks/badlands and simple battlefield silhouettes; cars/tanks get black ground shadows |
| Ships and planets | Distant spacecraft, planets, ringed bodies, nebulae and space motifs; shared by both consumers |

Background stages follow measured subject bounds; building horizons lie 4–10px
above the projected rear footprint (`groundRearScreenY`), and garden ground meets the roots. Distant
scenery remains in cover coordinates. Background branches are space, underwater, lunar, circuit,
badlands, battlefield, workshop, garden, hills/mist/skyline, catacombs and engraved alcoves.
Recipe-local projection and part meaning stay local; shared raster operations
do not acquire dungeon, island or spacecraft state.

## Composition and material patterns

Varied composition records commands/callbacks once, measures source fills on a
padded 256 × 256 surface with effects disabled, reserves device-pixel effect
margins, and replays uniformly transformed geometry. A final occupied-bounds pass
aligns placement after rounding. No finished sprite is resized. Default size
choices are 62–100% of the available fit; tanks use 48–100%, buildings use 80–100% with lower
placement, islands 72–100%, and dungeons 88–100% plus a minimum 90px room width
and 2px edge margin. Heraldry and glyphs center horizontally. Original mascots
retain their own mask/face-fitting path with the shared composition choices.
Spaceship detail changes its fit range: simple 28–78%, medium 45–95%, complex
62–100%, still using the independent composition stream.

`dither(p, {x,y,w,h,color,density,mask,cell,phase,pattern})` overlays one existing
palette color. `density` may be a number or a function of recipe coordinates;
`mask` explicitly clips the material region. Pattern coordinates use final
device pixels through nested transforms. No mask is inferred from painted colors.

The default `checker` rounds density to 0%, 25%, 50%, 75% or 100%; 50% is exact
one-pixel orthogonal alternation. Explicit `lines` and `crosshatch` patterns are
available; `lines` and `crosshatch` are currently unused by cover recipes.
`ordered` retains the old 16-entry Bayer table for direct
callers; current cover recipes/backgrounds do not select that branch. These
unused branches are trim candidates. `ditherTone(light,ramp,x,y)` blends adjacent
entries of the caller's ramp using those same quarter-density checker levels.
It clamps illumination to 0–1 and requires a nonempty palette-index ramp.
Original mascot classic framing has its own
preserved Bayer sky constant; its varied sky uses shared checker. The material
patterns allocate no extra image buffers.

## Palette, diagnostics and memory

| Index | Role |
| --- | --- |
| 0 / 1 | Background / quiet illumination |
| 2 / 3 | Muted detail / dark material |
| 4 | Ink and contact shadow |
| 5 / 6 / 7 | Main material shadow / body / highlight |
| 8 | Reserved cream, `#FFF4D6` |
| 9 | Muted metal / secondary highlight |
| 10 / 11 | Accent / accent shade, also used by lettering |

These are eleven custom colors plus reserved cream within CHGame's sixteen-slot
contract. Returned indices are not hardware palette slots. The host encoder
handles packing and RGB565 conversion.
`bootloaderSafeColor` excludes `#FF00FF`, which the CHGame Rainbow bootloader
maps to animated slot 15, plus near-magenta values that could collide after
RGB565 conversion. It changes only the blue channel of that tiny region.
The contract is documented in the official
[CHGame image specification](https://github.com/bateske/chgame/blob/main/spec/chgame.md).

At 128 × 128, each result owns a 16KiB index buffer and 64KiB RGB buffer, plus a
48-byte palette and metadata. Expanded subjects also use a temporary 16KiB layer
and sparse intent markers. Each active raster group allocates a 16KiB source and
16KiB fill selection; each outline/shadow operation allocates another temporary
16KiB mask. `exteriorOnly` adds a temporary 16KiB outside mask and 64KiB flood
queue per outline call. Rounded `pipe` adds a 16KiB source mask per call; radius 0
and thin-pipe fallback avoid it. `edgeShade` reuses the group's source and selection
without another full image; `effectMask` adds a callback, not an image buffer.
Nested groups can coexist, so costs add with depth. The 256 × 256
measurement probe is 64KiB, and group buffers during that pass grow to its size.
Recorded geometry/callback storage scales with command count. Ellipses allocate
bounded local masks; the original mascot has additional full-frame shape masks.
Building-local face lists, marks and visibility edges scale with architectural
complexity and can be removed with the buildings recipe.

Default `quality` reports the policy, occupied `bounds` and removed count;
the original mascot's bounds are null. On expanded subjects, `diagnostics:true`
adds candidate lists, removed coordinates and a copied 16KiB `subjectLayer`.
`inspectSubject` is read-only. Cleanup removes only unmarked
one-pixel occupied components, not every isolated color or larger fragment.

Fonts are shared; renderers retain no image buffers between calls. PNG/contact
sheet encoding is host/development code. This JavaScript renderer honors console
image constraints; it is not a console-firmware runtime port. For a smaller
runtime, omit unused recipes/scenes/patterns, use raster and recipes without
`drawing.js` if automatic fitting is unnecessary, or consider an indexed-only
output adapter to avoid the 64KiB RGB copy.
