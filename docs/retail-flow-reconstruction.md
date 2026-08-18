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
