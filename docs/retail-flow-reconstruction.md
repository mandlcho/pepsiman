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

The browser currently renders and follows the recovered course geometry. Exact prop instances, hazards, pickups, and scripted events still depend on decoding the placement records and overlay callbacks.

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
