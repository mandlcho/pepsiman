# Retail flow reconstruction

## Acceptance target

The browser port treats the Japanese retail disc as authoritative. The goal is a faithful native reconstruction of the classic presentation and game flow, not a visually modern reinterpretation and not an embedded PlayStation emulator.

Fidelity checks cover:

- stage geometry, textures, draw distance, fog, camera framing, and PS1-style filtering;
- original object placement, pickups, hazards, checkpoints, scripted events, and set pieces;
- character state transitions, motion IDs, animation timing, collision timing, and controls;
- title/menu flow, HUD proportions, stage transitions, results, continues, game over, and progression;
- music, sound effects, speech, and cutscenes where the retail formats can be decoded for browsers.

Any human-readable label not present on the disc must remain marked as inferred. Numeric retail identifiers remain authoritative.

## First inventory milestone

The extracted filesystem contains the retail executable `SLPS_017.62`, boot configuration, and 30 MiB of numbered data under `CDDATA`.

Confirmed tagged archives include:

- `CDDATA/0/0000`: two TMD character-model entries;
- `CDDATA/0/0001`: 30 TIM texture entries;
- `CDDATA/0/0002`: 51 TOD setup/motion entries;
- `CDDATA/0/0003`: one PIC entry;
- `CDDATA/0/0004`: 134 SEQ entries;
- `CDDATA/0/0100` through `0108`: paired VH/VB sound banks;
- numbered scene families containing large TIM archives and TMD geometry.

The global `CDDATA/0/0003` PIC archive is now losslessly traversed as a sequential chain of 30 embedded TIM images plus four zero-padding bytes. The exported artwork includes the original HUD glyph sheets, warning/callout graphics, particles, results-background tiles, scene-clear/results labels, record/perfect graphics, and pause art. `tools/extract_pic.py` writes the browser PNGs and an offset/dimension/hash manifest to `assets/ripped/ui`. Runtime asset identifiers remain deliberately unassigned in that manifest until the executable registration path is proven; visual recognition alone is not treated as numeric provenance.

The numbered scene families are not ordinary file extensions. Each family mixes direct TMD geometry, table-based containers, texture archives, and runtime/script data. Their roles and retail ordering must be established from executable references before assigning stage names.

## Authoritative retail segment order

The retail executable stores the current gameplay-segment index at `0x80095830`. Scene-specific initialization dispatches through the function at `0x8004121c`; its jump table maps segment indices `0–14` to resource selectors `3–17`. The actual scene update and completion tables bound normal gameplay to indices `0–13`, establishing fourteen retail gameplay segments plus one reserved selector.

Those fourteen indices correspond sequentially to the fourteen numbered disc families `CDDATA/2` through `CDDATA/F`:

| Segment index | Resource selector | Disc family |
|---:|---:|---:|
| 0 | 3 | `2` |
| 1 | 4 | `3` |
| 2 | 5 | `4` |
| 3 | 6 | `5` |
| 4 | 7 | `6` |
| 5 | 8 | `7` |
| 6 | 9 | `8` |
| 7 | 10 | `9` |
| 8 | 11 | `A` |
| 9 | 12 | `B` |
| 10 | 13 | `C` |
| 11 | 14 | `D` |
| 12 | 15 | `E` |
| 13 | 16 | `F` |

The first Stage 1 segment is therefore retail segment `0`, backed by `CDDATA/2`. Human-readable stage/area names will be added only after the corresponding retail transition logic is decoded.

The ordinary-scene pipeline is now also validated and exported for families `5`, `6`, `8`, `9`, `B`, `C`, `E`, and `F`. Together they add 252 authored world chunks, 2,489 course points, 1,171 visible prop placements, 87 dynamic controllers, 346 encounter records, and 4,238 collision spheres. Each browser scene loads its original `x003` world, `x004` 80-object prop library, `x005` encounter sprites, and `x006` gameplay tables through the same Stage 1 loader; one headless pass renders all eight without missing resources or page errors. Families `E` and `F` additionally prove the standard lit TMD packet path. The converter discards source normal indices because Three.js already computes mesh normals, while preserving the authored vertex indices, UVs, and textures.

All fourteen gameplay segment environments are now loadable in retail order. Family `7` exports its four-chunk `7002` world, 38-object `7004` prop library, and compact `7006` placement/event/encounter pack. Controller-only families `A` and `D` export their four-chunk `A002` and `D002` worlds without inventing absent prop or entity files. The TMD converter now supports both textured and untextured lit packets and emits finite zero bounds for authored empty objects. A browser regression loads and renders segments 0 through 13 in one session with no resource or page errors.

Post-Stage-1 finish overlays are not decoded yet. Until they are, segments 3 through 13 use an explicitly marked browser route-end handoff into the shared results/progression path; families `7`, `A`, and `D` use their render-chunk centers as an inferred route. This makes the extracted environments continuously playable without claiming that those temporary finish triggers or controller-only routes reproduce retail behavior.

## Stage 1 overlay and resource loading

`CDDATA/2/2000` is not an opaque placement blob. The executable loads it at `0x800f0000`; its internal pointers resolve against that address, and its body contains valid MIPS code plus scene-specific dispatch tables. It is the first retail segment's executable overlay.

Resource selector `3` points to an eighteen-word record in `SLPS_017.62`:

- the first nine words hold CD locations for files in family `2`;
- the next nine words hold sector counts;
- the nonzero counts are `0x20, 0x68, 0x54, 0xbe, 0x20, 0x21, 0x22, 0x12`;
- those values exactly equal the rounded-up 2048-byte sector counts of `2000` through `2007`.

After the main executable loads `2000`, its overlay drives the remaining resource-loading states and installs segment-specific initialization, update, completion, camera, and hazard callbacks. Reconstructing Stage 1 therefore requires both data decoding and behavioral recovery from this overlay; treating the numbered files as meshes alone would omit essential retail flow.

The TMD conversion now establishes two concrete Stage 1 geometry roles:

- `2003` contains 21 world-positioned course chunks, totaling 5,904 browser triangles after quad triangulation;
- `2004` contains 80 reusable local-space prop models, totaling 2,949 browser triangles;
- `2001` is a contiguous stream of 144 raw TIMs ending at `0x33cd0` plus four zero bytes, and supplies all 25 CLUT/texture-page combinations referenced by the `2003` world;
- the `2004` prop packets use the tagged `2002` and `2005` archives, bringing the family total to 133 unique referenced combinations;
- the ordered course-chunk centers form an approximately 813-unit browser-space route, including the retail road's turns.

The initial converter applied the tagged prop/sprite archives to both TMD files.
That left most `2003` world pages as transparent 334-byte PNGs even though the
geometry was present, producing floating cars and pedestrians over the clear
color. The source-aware conversion now uploads `2001` at its authored VRAM
coordinates for `2003`; headless gameplay captures verify that the original road,
intersections, sidewalks, grass lots, lane markings, and moving traffic render
together. The raw source images are also exported individually and reproducibly.

The v3 mesh export also preserves each TMD primitive's semitransparency bit.
Stage 1's world contains 2,936 opaque primitives and only 36 semitransparent
primitives; treating every texture as blended made the opaque house, tree, and
streetscape pages fade and sort incorrectly. The browser now depth-writes opaque
primitives and restricts blending to the authored semitransparent groups. Prop
conversion also reconstructs the cumulative runtime VRAM state—global, world,
prop, and encounter TIM sources in load order—instead of decoding the prop pack
in isolation. This restores the previously transparent `7d51`–`7d53` Stage 1
pages and the matching segment-2 pages.

The `2006` loader establishes a fixed-capacity layout used by the retail executable:

- an 80-entry model/collision index followed by 400 records of 44 bytes;
- a second 80-entry index followed by 100 records of 76 bytes;
- 200 world-entity records of 72 bytes beginning at file offset `0x6778`;
- 200 runtime event records of 92 bytes immediately afterward;
- 100 encounter records of 60 bytes at `0xe798`, followed by a 2,048-byte course-indexed collectible table at `0xff08`;
- a 2,020-byte embedded compact TOD archive beginning at `0x10708` and ending exactly at the end of the file; its single ID-1 clip contains 16 frames of 16-joint character motion at 30 Hz.

The layout is proven by the retail copy routine at `0x8002c2b4`: it copies `0x3840` bytes (`200×72`) to the live entity array, `0x47e0` bytes (`200×92`) to the live event array, `0x1770` bytes (`100×60`) to the live encounter array, and the following `0x800` bytes to a separate runtime table. The event updater uses an encounter record's halfword at `0x2c` to index the 92-byte event array. The renderer receives the encounter's first halfword as its retail model identifier, while the player-contact path at `0x8002bd00` iterates all 100 records and calls the retail player collision detector at `0x80028ae4` for enabled records.

All 100 encounter records duplicate their signed 32-bit position, and 67 are active (`renderModelId >= 0`). Encounter identifiers `30–85` are consumed through the retail sprite renderer and must not be treated as indices into the 80-object `2004` TMD. Their original-frame mapping is now proven by the resource-loader path: at `0x8001696c`, the executable passes the loaded `2005` pack at `0x8016d000` and base asset ID `0x1e` (30) to `0x8002b7c8`; that function reads the pack's 60-entry count and registers every TIM sequentially. Consequently retail asset ID 30 maps to `2005-001.png`, ID 31 to `2005-002.png`, and so on through ID 89 to `2005-060.png`. All 67 active Stage 1 records resolve within that exact range, and the v5 export includes each resolved frame ID and browser texture path.

Encounter visibility is gated by the linked 92-byte event record. The updater at `0x8002aa60` visits state-0 records, compares the player's X/Z position against the four authored trigger edges stored in the record, and changes the record to state 1 on entry. The encounter loop at `0x8002bd00` draws and collision-tests only records whose linked event is in state 1. Event bytes `0x04`–`0x1b` provide the four local trigger corners around the signed 32-bit center at `0x50`/`0x54`/`0x58`; those centers and converted absolute trigger vertices are now exported explicitly. This supplies the retail activation timing needed to keep later encounters hidden until their authored approach point.

The post-trigger pass at `0x8002c5d0` establishes paired lifetimes: it examines odd event indices, and when an odd record reaches state 1 it immediately changes that exit record and the preceding even activation record to state 2. All 26 event IDs referenced by active encounter records are even. The browser therefore loads both each activation record and its following exit record, activates encounters while the even record is state 1, and retires the pair when the player enters the authored odd-record exit quad.

The Stage 1 world file `2003` also contains the authoritative runner path and spawn before its TMD at file offset `0x30`. Its twelve-word scene-control header points to 211 eight-byte course records at `0x5da6c` and the eight-byte spawn record at `0x5ec70`. Each course record supplies signed X/Z and boundary-normal halfwords. The Stage 1 initializer at `0x800faa30` reads the spawn record through runtime pointer `0x80095840`, negates its X/Y/Z/heading into the player state, and initializes course index zero. The resulting browser-space spawn is `(-23940, 9079, 19480)` with heading zero; its X/Z exactly matches event 0's trigger center. The v2 `2003.json` export now preserves the header offsets, all 211 course points and normals, and the source/game/browser spawn forms. The browser follows this retail path instead of approximating the route from the 21 render-chunk centers.

## Retail segment 1 extraction

The ordinary result handoff from segment 0 selects `CDDATA/3`. Its file roles match
the proven family-2 pipeline: `3000` is a 65,344-byte relocated scene overlay,
`3001` is a 139-image raw TIM stream ending at `0x3a8c0` plus four zero bytes,
`3002`/`3005` are tagged TIM packs, `3003` is the world TMD container, `3004` is
the 80-object prop TMD, and `3006` is the collision/entity/event/encounter/pickup pack.
Files `3007` and `3008` are additional 32-entry TIM packs loaded by the special
`segmentIndex % 3 == 1` resource path and are not folded into geometry textures
without tracing their runtime registration role.

The repeatable world conversion resolves `3003` against `3001` and proves 27 world chunks with 7,003 triangles, 80
prop objects with 3,309 triangles, 271 authored course points, and browser spawn
`(-27100, 9079, -26000)` with source heading 1024. The generalized entity extractor
validates 125 active entities, 302 collision spheres, 9 landing surfaces, 106 active
event records, 99 active encounter records, and 100 course-indexed Pepsi pickups.
The entity pack retains an 8,248-byte embedded compact TOD beginning at the same
`0x10708` offset used by family 2. It contains nine 30 Hz, 16-joint character clips
with IDs 1–9 and frame counts 2, 3, 3, 3, 3, 6, 26, 3, and 6. The repeatable entity
export now decodes every joint frame while preserving the complete source bytes.
These assets are preserved under `assets/ripped/stages/3`.
The browser course loader is now segment-aware and, after the result effect and
the proven 9-frame handoff, replaces family 2 with the original family-3 world,
props, collisions, pickups, encounters, authored path, and spawn. Family-2-only
event IDs 194 and 196 are not injected into the second segment. The second
segment instead registers its source-proven ending trigger at event ID 198 and
uses its separately decoded controller timings below.

Segment 1 is not vertically flat. Its authored world starts at raw elevation 9080,
descends through successive ramp chunks, and finishes at elevation 0. The initial
browser integration incorrectly copied the first chunk's elevation onto every
course point, which displaced later geometry by as much as 72.64 browser units.
The loader now samples the original TMD triangles under every authored X/Z path
point and uses the resulting surface elevation when moving the world beneath the
runner. All Stage 1 points resolve at the expected road height; segment 1 now
follows the full 9080-to-0 descent instead of losing its environment underground.

## Retail segment 2 extraction

The next handoff selects `CDDATA/4`, whose resource roles differ from the first two
families. `4002`, not `4003`, contains the scene geometry: it has a TMD at offset
`0x14` with four objects. `4001` is a raw, contiguous stream of 135 TIM images
rather than the tagged archive used by the ordinary extractor. It ends at file
offset `0x3c930` followed by four zero padding bytes. All seven material CLUT/page
pairs referenced by `4002` resolve in this stream, including the streetscape,
shopfront, tree, sign, and crushed-can art. Feeding `4002` the later tagged packs
produced seven transparent 334-byte pages; the repeatable converter now uploads
`4001` at its authored VRAM coordinates and emits the populated 19–27 KB pages.
`4003` is a tagged archive of 181 TIM images used by the prop set, `4004` is a
direct 30-object prop TMD, and `4005` supplies another 34 TIM images. The
repeatable conversion exports the four world objects, 30 prop objects, all 135
raw source images, and 56 referenced texture palettes under
`assets/ripped/stages/4`; `tools/rip_assets.sh` rebuilds them from the original
disc.

`4006` is only 36,448 bytes and does not match the 67,348-byte fixed entity-pack
layout shared by `2006` and `3006`. Its exact compact layout is 200 entity records
of 60 bytes, 200 standard event records of 92 bytes, 100 compact encounter records
of 40 bytes, and a final 2,048-byte collectible table. The entity records retain
the ordinary position/rotation/scale/model prefix but omit the 12-byte behavior
tail. The placement pack contains 109 active entities using 15 of the 30 prop
models, 71 active state-0 event quads, eight active encounter assets (retail IDs
30–37), and no collectibles; its 25-bucket collectible index and remaining
capacity are entirely zero-filled. `tools/extract_stage_setpiece.py` validates
every boundary, duplicated position, model range, event state, asset range, and
zero-filled pickup byte while retaining each source record and the source SHA-256.
The browser still requires the scene-2 overlay controllers and authored movement
path before this set-piece can be registered as playable.

The scene-2 overlay supplies a second, independent authored actor stream. At
`0x800f6c60`, the retail code copies exactly 103 packed 16-byte records from
overlay offset `0x7490` into 20-byte runtime slots. Each source record is a
16-bit controller type followed by three signed coordinates; runtime dispatch at
`0x800f5e44` selects one of the function pointers at overlay offset `0x7b0c`.
The authored records use controller types 0 through 7 and span forward coordinate
700 through 29,500. Two deliberately non-monotonic groups remain in source order
(records 68 and 76), so the browser must not sort the stream. The overlay also
starts with a 61-entry top-level scene-state jump table used by `0x800f4794`.
`tools/extract_stage_overlay_setpiece.py` validates all overlay pointers and table
boundaries, preserves every raw actor record and exports both dispatch tables to
`assets/ripped/stages/4/4000-overlay-setpiece.json`. Controller semantics and the
browser coordinate mapping were then established from handlers `0x800f0bb8`
through `0x800f2bbc`. They share a player-relative visibility range of 2,000
source units ahead and 10,000 behind. The export now records each type's original
sprite frame, render-definition address, sound ID, collision envelope, display
offset, and collision response. Types 0 through 6 damage Pepsiman and enter a
16-frame knock-away; type 7 instead writes the player forward coordinate to 60
units before the pedestrian, acting as a blocker until the player steers around.
The knock-away advances 45 units per frame, moves laterally by 25 units per frame,
and uses a 200-unit sine lift. Scene state 20 at `0x800f58b0` proves the chase
spawn at source X -1,800, an advance of 30 source units per 30 Hz frame, and the
ending threshold at X 30,001. The browser registers segment 2 on that straight
course, loads all 109 active compact props and 103 authored pedestrian records,
and uses the exact 7.2 browser-unit-per-second retail base speed.

The missing pursuit graphic is now traced through state-20 draw handler
`0x800f0790`, which submits retail sprite asset 301. The raw `4001` registration
maps that identifier to image 106, the original crushed Pepsi-can graphic. The
separate source transform begins at `(-2420, -140, 0)`, advances 30 units per
retail frame, and is clamped to the player's forward coordinate minus 620. The
browser uses those exact forward values and source timing, keys the TIM's STP
black matte, and switches to the original front-facing chase presentation. The
billboard's browser-space size/vertical center and current Three.js camera
framing are explicitly marked inferred in the overlay export until the PS1
projection matrices are converted directly. The overlay ending states remain to
be connected before this segment is considered visually complete.

The first retail moving-entity dispatch is also connected. Overlay behaviors 1 and
2 route through `0x800f9190`/`0x800f9274`; their subtype supplies speeds in ten-unit
steps, and the shared movement controllers limit the active motion counter to 150
frames. Entity exports now retain the source motion heading and subtype. The browser
uses those proven speeds, headings, and the 150-frame window for the car records.
The current 18-unit look-ahead activation window is inferred because the common
visibility/lifecycle helper at `0x8002c0ec` is not fully decoded yet. Remaining
behavior classes—including rotating, falling, and scripted obstacle controllers—
remain next in the overlay reconstruction queue.

The next traffic family is dispatched by behaviors 5 through 8. Wrappers
`0x800f22b4` and `0x800f23ec` map the entity subtype into a speed and an initial
travel distance, then call the shared three-phase controller at `0x800f2f94`.
For the observed behavior-7/8 subtypes, `0x800f23ec` first routes through the
proximity gate at `0x800f9f20`: the stationary vehicle switches to its subtype
plus 100 only when the player comes within 3,000 source units, after which the
same movement profiles run. The browser uses that original three-dimensional
24-unit browser-space proximity test instead of the general inferred look-ahead.
The vehicle first travels that subtype-defined distance, turns left or right by
`0x400` PSX angle units (90 degrees) over 31 frames, and continues on the new
heading for a maximum of 150 frames. The browser reproduces those profiles and
updates the visible model rotation as well as its collider-bearing transform.
This covers the authored turning traffic in the first two extracted segments;
non-traffic behavior classes remain separately queued.

Behavior 15 drives the larger model-76/model-78 vehicles through wrapper
`0x800f95d8` and the shared vehicle controller at `0x800f3304`. For the active
records in the extracted segments, the subtype maps directly to 20, 30, or 40
source units per frame and the pre-impact controller advances continuously along
the authored heading while subtracting 120 from game-space Y each frame. The
controller renders both the entity's selected model and the next model ID from a
stack copy, so the model-76 and model-78 records are compound vehicles rather than
single meshes. The browser now moves both original component meshes and both sets
of collision spheres together. The controller's separate collision/crash phase
still remains to be reproduced.

Behavior 18 dispatches through `0x800f9700` to the paired-vehicle controller at
`0x800f36d4`. State 0 allocates a copy of the 72-byte entity record, increments
the copy's model index, and applies a game-space Y offset of -150 to both records.
The active retail records therefore render original model 76 together with model
77 and use both models' collision spheres. Subtypes 0 and 1 move the pair for 60
frames at 10 and 20 source units per frame respectively. State 2 then runs for 40
frames: speed interpolates from 45 to zero along heading +227 PSX angle units,
X/Z each receive random jitter from -2 through +2, the original heading decreases
by 11 angle units per frame, and the paired heading increases by 5. The browser
now reproduces the paired mesh/collider allocation, movement, deceleration, jitter,
and opposite rotations. The particle constructor called during the skid remains
queued with the broader retail effects work.

Behavior 43 uses wrapper `0x800f976c` and the same shared controller at
`0x800f3304`. Its active subtype 3 selects 10 source units per frame, mode 4, and
a 500-unit parameter; it also renders the compound model-78/model-79 pair and
applies the controller's -120 game-space Y update. Those proven transforms and
both collision profiles are connected. Mode 4 exits the movement phase based on
the signed difference between the global course index and the result of course
lookup helper `0x8002aeb8`; translating that index lifecycle exactly remains
pending, so the browser currently retains the moving pair until its normal
visibility cutoff.

Behaviors 44 and 45 are paired proximity model swaps rather than continuous
motion. Both dispatch through `0x800fa3c0` into `0x800f721c`; subtypes 0, 1, and 2
select 500-, 1,000-, and 1,500-source-unit trigger radii. Behavior 44 increments
the entity's model index while behavior 45 decrements it. In the active Stage 1
records this switches between flat model 21 (collision class 0) and raised model
22 (collision class 3). The browser now swaps the original mesh and its collision
profile together at the authored three-dimensional proximity threshold, and
restores both when a run restarts.

Behavior 46 dispatches through `0x800fa424` to the oscillator at `0x800f6db8`.
The active records use subtypes 0 and 1: they select lateral amplitudes of 125 and
250 source units and offsets of `0x400` and `0xc00` from the authored heading.
The lateral sine advances three degrees per retail frame, while the vertical
absolute-sine bob advances 20 degrees per frame with an amplitude of 41 source
units. The browser evaluates those cycles against elapsed 30 Hz retail time and
moves the source model plus all three of its collision spheres together.

Behavior 20 dispatches through `0x800fa0bc` to `0x800f6708`. Subtype pairs select
1,000-, 2,000-, or 3,000-source-unit proximity radii and opposite directions.
Once triggered, the controller interpolates the obstacle heading from zero to
`0x800` (180 degrees) over exactly 40 retail frames and retains the rotated
collision profile afterward. The active records use subtypes 3 and 4, producing
opposite 2,000- and 3,000-unit rotations. The shared consumer at `0x8002a7d8`
passes each transformed copy through the entity renderer at `0x8002a5b0` before
testing its collision records, proving that the authored heading drives both the
visible model and its four collision spheres. The browser applies the same shared
transform.

The remaining Stage 1 car records use behaviors 36 and 38. Their wrapper at
`0x800fa1f8` selects the scene-zero controllers `0x800f87e4` and `0x800f82e0`
from the current retail scene index. Both save the authored start position, wait
until the player's three-dimensional distance is at most 1,500 source units, and
derive their live heading from the original 211-point course through helper
`0x8002af6c`. During the main travel phase both subtract 20 from game-space Y per
30 Hz tick. Behavior 38 advances 40 source units per tick until its three-axis
distance from the start exceeds 3,400 units. Behavior 36 advances 5 units per tick,
except when its phase counter modulo 47 equals 1, when the source effect helper and
a 40-unit step are used; its travel threshold is 7,600 units. The thresholds are
proven directly by squared constants `0x00b06440` and `0x03715900`.

After the threshold, both controllers interpolate over counters 0 through 30 and
move 20 units per tick. Behavior 38 turns by `-0x400` PSX angle units (left 90°),
while behavior 36 turns by `+0x400` (right 90°); their final state continues at 20
units per tick on the new heading. The browser now reproduces the proximity gate,
course-derived heading, vertical and forward motion, exact distance thresholds,
31-tick turns, final travel, mesh rotation, and collider-bearing transform. The
periodic constructor called by `0x800f85f0`/`0x800f8b2c` is an effects-only path
and remains queued with the retail particle pass.

The separate 2,048-byte table is now traced through its runtime consumer at `0x8002d0c4`. It begins with a 21-entry start/count index—exactly the number of `2003` course chunks—and an offset of 176 to 234 fixed-capacity records of eight bytes. The index covers records 0 through 99 once and in order; each indexed record is a signed `(x, y, z, type)` tuple with source type `1`, while all remaining capacity is zero-filled. The render path draws each indexed record with fixed retail asset ID `250`. The contact path calls the retail player collision routine with radius `0x32`, plays sound `0x35`, creates the pickup effects, and sets bit `0x8000` in the record type to mark it consumed. This identifies the indexed records as the authored Stage 1 collectible pickups rather than an index over encounter records. The repeatable v5 export exposes the 21 chunk ranges and all 234 records, including raw bytes; its 100 active records are the authoritative browser pickup positions.

The original extracted texture `assets/ripped/textures/0/0001-023.png` is a 32×16 two-frame Pepsi-can sprite sheet. The exact retail asset-ID-to-TIM lookup for asset 250 remains under trace, so the browser uses this visually verified original can sheet while keeping that final numeric mapping explicitly unclaimed. The browser currently renders the 170 active world entities, all 100 course-indexed pickups, and the 67 encounter sprites using original transforms and authored positions. The 26 linked event quads activate those sprites at their authored approach points, and collision-enabled records use the retail radius derived from `abs(field32) / 3`.

The encounter reaction flags are also traced. In `0x8002b8f8`, low state 1 renders the adjacent asset frame when both player-relative X and Z are within 600 raw units. In `0x8002bd00`, a collision while low state 2 increments the asset ID and changes the record to state 3. The state-3 updater at `0x8002bec0` runs for 15 frames, advances 20 raw units per frame, raises the sprite on a 200-unit sine arc from the player's contact height, suppresses every third frame, and then removes it. The browser reproduces those values at 30 Hz.

The reaction direction is now traced rather than inferred. Every active Stage 1 update, the overlay at `0x800f809c` passes the player X/Y/Z and current course index to `0x8003b9b4`. That helper advances the authored course index, derives the tangent angle between the current and following 211-point path records, and returns it; the overlay adds `0x800` (180 degrees) and stores the result at `0x800a7682`. The reaction updater converts that angle to a 20-unit sine/cosine vector and subtracts it from encounter X/Z, moving the hit sprite forward along the authored course. The browser now uses the matching current course tangent and player contact height. Broader event-state transitions remain under reconstruction.

Stage 1 completion is authored as event record 196 rather than a raw route-length test. The stage ending controller at `0x800f7abc` reads state byte `0x800d36f0`; with the live event base at `0x800cf080`, that address is exactly `base + 196 × 92`. Record 196's trigger center is browser-space `(26672, 9080, 5327)`, alongside path point 207 with about 12 browser route units remaining, and entering its quad changes the record to state 1 before the ending controller begins.

The opening ending-controller states are now reproduced from executable data. State 0 disables player control and saves the contact position. States 1 and 2 interpolate X/Z for 35 frames each through helper `0x80018d04`, first toward game position `(26696, -9080, -5923)` and then `(26695, -9080, -6120)`. The helper is a signed 16-bit linear interpolation routine. On completion of the second movement, the controller writes state/animation value `19`; the recovered character animation with that ID is `prone_idle`. State 3 runs a separate 41-frame counter before advancing. The browser freezes the authored course transform at the finish, performs those two exact moves in browser coordinates, switches to clip 19, and preserves the final course position behind the interim clear screen.

The two fourteen-record destination tables at executable addresses `0x8007ae1c` and `0x8007aed0` are retained in `assets/ripped/retail-flow.json`, generated by `tools/extract_retail_flow.py`. A later byte write of value `27` targets a different player-structure field and is not treated as proof that animation clip 27 plays. State 4 waits until its timer reaches 241 before starting the retail results effect through `0x8003e444`; the browser now preserves that full hold instead of showing its results overlay immediately after state 3. The browser clear overlay uses the original eight-piece PIC results backdrop, `SCENE 1`/`CLEAR` glyphs, `GET PEPSI`/`CLEAR TIME` labels, and retail digit atlas. It reports the browser's collected-can count and finish-trigger time; record comparison remains pending.

State 5 starts the shared retail result effect with `0x8003e444` and polls `0x8003e544` until it completes. The actually dispatched result updater is `0x8003cc94`. Its initial state activates effect slot 0 at frame 0, writes the slot-1 position offset at frame 24, activates slot 1 at frame 40, slots 2 and 3 at frames 64 and 68, and enters the Pepsi-count phase at frame 80. These are executable-derived frame boundaries, not timings estimated from video. The relationship between these moving slots and individual pieces of extracted artwork is still kept separate from the proven timings.

The browser now drives its original-art results overlay from those exact boundaries and counts the collected Pepsi total upward from frame 80. The current visual assignment of effect slots to the title and two scorecard rows is a presentation approximation pending a complete retail draw-call-to-PIC registration map; the source JSON deliberately names raw effect slots rather than claiming those artwork identities. Its current effect-completion estimate is the count start plus one frame per collected can and a 60-frame settle, after which the proven 9-frame transition delay is applied. The estimate will be replaced once the remaining score/record branches of `0x8003cc94` are fully decoded.

State 6 waits for the overlay child controller and the global transition guard at `0x800958f8`. State 7 handles the special mode-3 exit. In the ordinary retail path, state 8 waits 9 frames and calls the lookup at `0x80041158`: its first table is the next-segment map `[1, 2, ..., 15, 0]`, so scene index 0 advances to scene index 1 (`CDDATA/3`). The adjacent `[2,2,2,3,3,3,...]` table is the retail stage-number grouping. The full score-count and record-comparison branches of the result effect remain under reconstruction.

Scene index 1 finishes through event record 198 and outer controller
`0x800f77a0`, rather than reusing event 196. Its child controller at
`0x800f7efc` first interpolates the player for 35 frames to browser position
`(6385, 0, 23383)` and selects character animation 23. It then interpolates
toward `(6123, 0, 23383)` with denominator 100 for 101 movement ticks and selects
animation 19. After a 31-tick hold, it selects animation 25 and advances a
41-tick camera phase whose transform interpolation occupies the first 20 ticks.
The child pre-result effect completes before the outer controller begins the
shared retail result sequence, after which transition selector 1 advances to
scene index 2. The browser now registers event 198 and reproduces the authored
player destinations, animation IDs, movement denominators, holds, camera-phase
duration, pre-result timing, and shared result transition instead of dead-ending
at the end of the second segment. The camera target built at `0x800f8194` places
the eye 200 units from the runner at heading offset `0x71d` and 280 units above,
and the look point 50 units away at offset `0x800` and 130 units above. State 4
interpolates all six components for 20 frames through `0x80018d04`. Those exact
values now drive the browser close-up; applying the relative PS1 camera vector
to the browser's fixed-runner coordinate system is explicitly marked inferred.

Event record 194 drives a separate five-state Stage 1 set-piece through overlay controller `0x800f7584`. It disables player input, preserves the initial player/camera transforms, and linearly centers X/Z over 25 frames at executable-table game position `(-5700, -9080, 18500)`, corresponding to browser position `(-5700, 9080, -18500)`. After a one-frame transition it runs a nine-frame sound phase, invoking retail sound ID 56 at counters 2, 4, and 6. It then submits 40 effects at ten-unit vertical intervals, changes player runtime state, restores control, and runs a closing screen effect for 30 frames.

The accompanying constructor at `0x800f1ae8` allocates eight randomized objects with retail render-model ID 184 and removes each after 61 update frames. The current browser mapping from that ID to `2004` TMD object 79 is inferred from the 80-object Stage 1 prop-library range and remains labelled as such until its loader base is proven. The browser now performs the exact control lock, authored centering target, phase durations, course-distance resumption, alternating sound cues, eight-model burst, 61-frame cleanup, and simultaneous closing-phase control restoration. Particle velocity distributions and the synthesized sound are approximations; the 40 additional effect submissions and closing framebuffer effect remain pending their render-path decode.

Scene index 2's chase ending is dispatched by state 20 at `0x800f58b0`. Reaching player-forward value 30001 starts a 61-frame handoff: the runner continues at 30 source units per frame while lateral position approaches zero by 15 source units per frame. The controller then enters state 50 at `0x800f6088` for 223 frames. Player advance lasts through frame 120, heading changes by -11 PSX angle units per frame for the first 52 frames, and the chase can continues through frame 150. The camera transform is saved at frame 90 and receives randomized jitter through frame 149. Frame 120 plays retail sound ID 62 and submits 20 effects. The gray/white fade first becomes visible at frame 161 with intensity `(frame - 160) * 4`, and frame 223 transitions to the shared Stage 1 results flow.

The browser now connects that complete timed handoff and transition. Exact counters, speeds, angle magnitude, cue ID, effect count, and fade ramp are exported reproducibly in `4000-overlay-setpiece.json`. The deterministic browser camera-jitter pattern, Web Audio cue used in place of unmapped sound 62, and billboard impact-particle presentation are explicitly marked as approximations; they do not claim to reconstruct the original random generator, sound sample, or effect constructor. A browser regression drives all 284 frames directly and verifies centering, the 20-effect cue, completion state, cleared fade layer, and visible retail results overlay.

The same state-20 controller performs the chase failure test at `0x800f5ec8`: after advancing the can, it catches Pepsiman when `playerForward < canForward + 120`, sets player state 3, and counts 90 frames before consuming an attempt and transitioning to a reload or game over. The browser now uses that exact threshold and recovery duration, restarts the current chase with one fewer life, and preserves the existing last-life game-over path. Recovered motion 9 (`forward_stumble`) is used for the browser catch pose, but that state-to-motion mapping remains explicitly inferred until the player-state dispatcher is traced.

`2007` has now been losslessly partitioned without assigning speculative gameplay roles:

- 200 records of 60 bytes from `0x0000` through `0x2edf`; every record repeats its initial three signed 32-bit coordinates;
- 200 records of 92 bytes from `0x2ee0` through `0x76bf`; their first-word distribution is 79 value-`0`, 5 value-`1`, 16 value-`2`, and 100 value-`255` records;
- 100 records of 40 bytes from `0x76c0` through `0x865f`; every record repeats the three coordinates at words 1–3 in words 4–6;
- one 2,048-byte trailing table/blob from `0x8660` through the exact end of the 36,448-byte file.

The repeatable export is `assets/ripped/stages/2/2007-auxiliary.json`, generated by `tools/extract_stage_auxiliary.py`. It retains every source byte as record-level raw hex while also exposing signed word arrays for analysis. Names such as camera path, pickup, trigger, or scripted event remain explicitly unassigned until a retail runtime consumer proves them. Unlike files `2001`–`2006`, `2007` is not loaded by the normal thirteen-state initialization dispatch in the Stage 1 overlay. The alternative main-executable loader at `0x800160e8` only loads resource slot 7 when `segmentIndex % 3 == 1`; Stage 1 segment 0 therefore skips `2007`. It is retained for provenance, but is not treated as active Stage 1 gameplay data.

Recover and verify the table directly with:

```sh
python3 tools/extract_retail_flow.py /path/to/extracted/disc/SLPS_017.62
```

Run the repeatable read-only inventory with:

```sh
python3 tools/inventory_disc.py /path/to/extracted/disc
```

Use `--json` when feeding the classification into later extraction tools.

## Delivery batches

1. Disc inventory and repeatable classification tooling.
2. Stage 1 geometry, textures, placement, camera, and event extraction.
3. Faithful PS1-style Stage 1 renderer and complete playable flow.
4. Frame/timing comparison against retail gameplay and Stage 1 deployment.
5. Remaining stages, menus, transitions, audio/cutscenes, and progression.
6. Complete-game regression pass and final deployment.
