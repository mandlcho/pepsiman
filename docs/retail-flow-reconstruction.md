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

Encounter visibility is gated by the linked 92-byte event record. The updater at `0x8002aa60` visits state-0 records, compares the player's X/Z position against the four authored trigger edges stored in the record, and changes the record to state 1 on entry. The encounter loop at `0x8002bd00` draws and collision-tests only records whose linked event is in state 1. Event bytes `0x04`–`0x1b` provide the four local trigger corners around the signed 32-bit center at `0x50`/`0x54`/`0x58`; those centers and converted absolute trigger vertices are now exported explicitly. This supplies the retail activation timing needed to keep later encounters hidden until their authored approach point. The browser treats the first event center as the inferred retail run origin: using the midpoint of course chunk 0 instead placed it 2,229 raw units (17.832 browser units) beyond that trigger, so its path now begins at event 0 before continuing through the 21 chunk centers. A direct player-spawn consumer trace is still required to promote that origin from inference to proven behavior.

The separate 2,048-byte table is now traced through its runtime consumer at `0x8002d0c4`. It begins with a 21-entry start/count index—exactly the number of `2003` course chunks—and an offset of 176 to 234 fixed-capacity records of eight bytes. The index covers records 0 through 99 once and in order; each indexed record is a signed `(x, y, z, type)` tuple with source type `1`, while all remaining capacity is zero-filled. The render path draws each indexed record with fixed retail asset ID `250`. The contact path calls the retail player collision routine with radius `0x32`, plays sound `0x35`, creates the pickup effects, and sets bit `0x8000` in the record type to mark it consumed. This identifies the indexed records as the authored Stage 1 collectible pickups rather than an index over encounter records. The repeatable v5 export exposes the 21 chunk ranges and all 234 records, including raw bytes; its 100 active records are the authoritative browser pickup positions.

The original extracted texture `assets/ripped/textures/0/0001-023.png` is a 32×16 two-frame Pepsi-can sprite sheet. The exact retail asset-ID-to-TIM lookup for asset 250 remains under trace, so the browser uses this visually verified original can sheet while keeping that final numeric mapping explicitly unclaimed. The browser currently renders the 170 active world entities, all 100 course-indexed pickups, and the 67 encounter sprites using original transforms and authored positions. The 26 linked event quads activate those sprites at their authored approach points, and collision-enabled records use the retail radius derived from `abs(field32) / 3`.

The encounter reaction flags are also traced. In `0x8002b8f8`, low state 1 renders the adjacent asset frame when both player-relative X and Z are within 600 raw units. In `0x8002bd00`, a collision while low state 2 increments the asset ID and changes the record to state 3. The state-3 updater at `0x8002bec0` runs for 15 frames, advances 20 raw units per frame, raises the sprite on a 200-unit sine arc, suppresses every third frame, and then removes it. The browser reproduces those values at 30 Hz. The retail movement direction comes from the global angle at `0x800a7682`; until that angle's producer is identified, the browser explicitly infers the direction as outward from Pepsiman to the encounter at contact. Broader event-state transitions remain under reconstruction.

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
