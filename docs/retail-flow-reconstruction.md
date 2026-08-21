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
- their polygon packets reference 133 unique CLUT/texture-page combinations reconstructed from `2002` and `2005`;
- the ordered course-chunk centers form an approximately 813-unit browser-space route, including the retail road's turns.

The `2006` loader establishes a fixed-capacity layout used by the retail executable:

- an 80-entry model/collision index followed by 400 records of 44 bytes;
- a second 80-entry index followed by 100 records of 76 bytes;
- 200 world-entity records of 72 bytes beginning at file offset `0x6778`;
- 200 runtime event records of 92 bytes immediately afterward;
- 100 encounter records of 60 bytes at `0xe798`, followed by a 2,048-byte course-indexed collectible table at `0xff08`;
- a 2,020-byte embedded TOD animation beginning at `0x10708` and ending exactly at the end of the file.

The layout is proven by the retail copy routine at `0x8002c2b4`: it copies `0x3840` bytes (`200×72`) to the live entity array, `0x47e0` bytes (`200×92`) to the live event array, `0x1770` bytes (`100×60`) to the live encounter array, and the following `0x800` bytes to a separate runtime table. The event updater uses an encounter record's halfword at `0x2c` to index the 92-byte event array. The renderer receives the encounter's first halfword as its retail model identifier, while the player-contact path at `0x8002bd00` iterates all 100 records and calls the retail player collision detector at `0x80028ae4` for enabled records.

All 100 encounter records duplicate their signed 32-bit position, and 67 are active (`renderModelId >= 0`). Encounter identifiers `30–85` are consumed through the retail sprite renderer and must not be treated as indices into the 80-object `2004` TMD. Their original-frame mapping is now proven by the resource-loader path: at `0x8001696c`, the executable passes the loaded `2005` pack at `0x8016d000` and base asset ID `0x1e` (30) to `0x8002b7c8`; that function reads the pack's 60-entry count and registers every TIM sequentially. Consequently retail asset ID 30 maps to `2005-001.png`, ID 31 to `2005-002.png`, and so on through ID 89 to `2005-060.png`. All 67 active Stage 1 records resolve within that exact range, and the v5 export includes each resolved frame ID and browser texture path.

Encounter visibility is gated by the linked 92-byte event record. The updater at `0x8002aa60` visits state-0 records, compares the player's X/Z position against the four authored trigger edges stored in the record, and changes the record to state 1 on entry. The encounter loop at `0x8002bd00` draws and collision-tests only records whose linked event is in state 1. Event bytes `0x04`–`0x1b` provide the four local trigger corners around the signed 32-bit center at `0x50`/`0x54`/`0x58`; those centers and converted absolute trigger vertices are now exported explicitly. This supplies the retail activation timing needed to keep later encounters hidden until their authored approach point.

The post-trigger pass at `0x8002c5d0` establishes paired lifetimes: it examines odd event indices, and when an odd record reaches state 1 it immediately changes that exit record and the preceding even activation record to state 2. All 26 event IDs referenced by active encounter records are even. The browser therefore loads both each activation record and its following exit record, activates encounters while the even record is state 1, and retires the pair when the player enters the authored odd-record exit quad.

The Stage 1 world file `2003` also contains the authoritative runner path and spawn before its TMD at file offset `0x30`. Its twelve-word scene-control header points to 211 eight-byte course records at `0x5da6c` and the eight-byte spawn record at `0x5ec70`. Each course record supplies signed X/Z and boundary-normal halfwords. The Stage 1 initializer at `0x800faa30` reads the spawn record through runtime pointer `0x80095840`, negates its X/Y/Z/heading into the player state, and initializes course index zero. The resulting browser-space spawn is `(-23940, 9079, 19480)` with heading zero; its X/Z exactly matches event 0's trigger center. The v2 `2003.json` export now preserves the header offsets, all 211 course points and normals, and the source/game/browser spawn forms. The browser follows this retail path instead of approximating the route from the 21 render-chunk centers.

## Retail segment 1 extraction

The ordinary result handoff from segment 0 selects `CDDATA/3`. Its file roles match
the proven family-2 pipeline: `3000` is a 65,344-byte relocated scene overlay,
`3002`/`3005` are TIM packs, `3003` is the world TMD container, `3004` is the
80-object prop TMD, and `3006` is the collision/entity/event/encounter/pickup pack.
Files `3007` and `3008` are additional 32-entry TIM packs loaded by the special
`segmentIndex % 3 == 1` resource path and are not folded into geometry textures
without tracing their runtime registration role.

The repeatable world conversion proves 27 world chunks with 7,003 triangles, 80
prop objects with 3,309 triangles, 271 authored course points, and browser spawn
`(-27100, 9079, -26000)` with source heading 1024. The generalized entity extractor
validates 125 active entities, 302 collision spheres, 9 landing surfaces, 106 active
event records, 99 active encounter records, and 100 course-indexed Pepsi pickups.
The entity pack retains an 8,248-byte embedded TOD beginning at the same `0x10708`
offset used by family 2. These assets are preserved under `assets/ripped/stages/3`.
The browser course loader is now segment-aware and, after the result effect and
the proven 9-frame handoff, replaces family 2 with the original family-3 world,
props, collisions, pickups, encounters, authored path, and spawn. Family-2-only
event IDs 194 and 196 are not injected into the second segment. The second
segment's overlay-specific scripted events and ending trigger still require the
same controller-level reconstruction already completed for family 2.

Segment 1 is not vertically flat. Its authored world starts at raw elevation 9080,
descends through successive ramp chunks, and finishes at elevation 0. The initial
browser integration incorrectly copied the first chunk's elevation onto every
course point, which displaced later geometry by as much as 72.64 browser units.
The loader now samples the original TMD triangles under every authored X/Z path
point and uses the resulting surface elevation when moving the world beneath the
runner. All Stage 1 points resolve at the expected road height; segment 1 now
follows the full 9080-to-0 descent instead of losing its environment underground.

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
the authored heading. That proven pre-impact movement is connected in the browser;
the controller's separate collision/crash phase still remains to be reproduced.

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
opposite 2,000- and 3,000-unit rotations. The browser applies that proven heading
to the visible model and its four attached collision spheres. Applying the local
collision-copy heading to the visible mesh is currently an explicit visual
inference; the embedded stage TOD linkage still needs to be decoded independently.

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

Event record 194 drives a separate five-state Stage 1 set-piece through overlay controller `0x800f7584`. It disables player input, preserves the initial player/camera transforms, and linearly centers X/Z over 25 frames at executable-table game position `(-5700, -9080, 18500)`, corresponding to browser position `(-5700, 9080, -18500)`. After a one-frame transition it runs a nine-frame sound phase, invoking retail sound ID 56 at counters 2, 4, and 6. It then submits 40 effects at ten-unit vertical intervals, changes player runtime state, restores control, and runs a closing screen effect for 30 frames.

The accompanying constructor at `0x800f1ae8` allocates eight randomized objects with retail render-model ID 184 and removes each after 61 update frames. The current browser mapping from that ID to `2004` TMD object 79 is inferred from the 80-object Stage 1 prop-library range and remains labelled as such until its loader base is proven. The browser now performs the exact control lock, authored centering target, phase durations, course-distance resumption, alternating sound cues, eight-model burst, 61-frame cleanup, and simultaneous closing-phase control restoration. Particle velocity distributions and the synthesized sound are approximations; the 40 additional effect submissions and closing framebuffer effect remain pending their render-path decode.

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
