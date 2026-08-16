# Pepsiman compact TOD animation format

The character animation pack at `CDDATA/0/0002` contains one standard TOD bind/setup clip followed by 50 compact clips (IDs 2–51). The compact records are not standard TOD transform packets even though they retain the TOD file and frame headers.

## Evidence

The decoding rules below were recovered from the original `SLPS_017.62` MIPS transform routine beginning at virtual address `0x80018df0`:

- `0x80018e38`: isolate component flags with `word & 0x7000`;
- `0x80018e3c`: test the absolute flag with `word & 0x8000`;
- `0x80018e40`: isolate the joint ID with `word & 0x0fff`;
- `0x80018e80`–`0x80018ec0`: test the X/Y/Z zero flags in bits 14/13/12;
- `0x80019084`–`0x80019158`: sign-extend present 16-bit components, set flagged components to zero, and convert them to fixed-degree values;
- `0x800192bc`–`0x8001937c`: convert fixed degrees into the PlayStation rotation representation before writing the joint transform.

## Frame and record layout

Each compact frame keeps the standard eight-byte TOD frame header:

| Offset | Type | Meaning |
| --- | --- | --- |
| `0x00` | `u16` | frame length in 32-bit words |
| `0x02` | `u16` | packet count (16 for this character) |
| `0x04` | `u32` | frame number |

Each joint record begins with a little-endian `u16`:

| Bits | Meaning |
| --- | --- |
| 15 | absolute-transform flag (set in this pack) |
| 14 | X rotation is exactly zero |
| 13 | Y rotation is exactly zero |
| 12 | Z rotation is exactly zero |
| 11–0 | joint ID, sequentially 1–16 |

For every zero flag that is clear, one signed 16-bit **whole-degree** component follows, in X/Y/Z order. Flagged components are zero; they do not inherit a previous value. The record is padded to a 32-bit boundary. Angles may contain several complete revolutions, so the web export wraps them to `[-180°, 180°)` before conversion to radians.

Joint 1 then stores a signed 16-bit scalar plus two padding bytes and three signed 32-bit absolute translations. The original routine divides translations by five (`0x8001945c`–`0x800194bc`). The same character-space scale must be applied to the standard TOD setup: at one fifth, the independently modeled TMD segments meet at their authored seams, and setup pelvis Y (`-519 / 5`) agrees with the compact clips (`-518 / 5` in the run clip). The scalar's gameplay purpose is not required for skeletal playback, but is preserved in the exported data as `rootScalar`.

## Web transform conversion

The TMD mesh is converted from PlayStation coordinates as `(x, y, z) → (x, -y, -z)`. Local TOD translations use the same reflection. Conjugating a local rotation by that coordinate conversion preserves X and negates Y and Z, so animation Euler values become `(rx, -ry, -rz)` in Three.js. Both the setup parser and runtime construct local rotations in XYZ order before applying the parent hierarchy. Saved editor corrections are stored as local bind offsets and added after this conversion; animation preview never replaces the saved correction itself.

Every decoded joint-1 frame in all 50 clips contains the same `-103°` X component. It is therefore a fixed character-basis conversion, not animated pelvis motion. The runtime removes that basis component before constructing the joint-1 matrix.

The corrected joint-1 matrix is then factored into the dummy root rather than written over the pelvis bind transform. If `A` is the basis-corrected animated joint-1 matrix and `B` is the setup pelvis matrix, the root receives `A × inverse(B)` while the pelvis remains at `B`; therefore `root × pelvis = A`. This exposes root translation and orientation on object 1001, keeps the pelvis at its authored bind transform, and prevents the character-wide `-103°` tilt.

Compact packets are absolute per frame: zero-mask bits produce literal zero components, not inherited values or deltas. The web runtime interpolates the resulting absolute Euler frames using shortest-angle interpolation. Root translation is interpolated linearly.

## Regression validation

Run:

```sh
PYTHONPATH=tools python3 tools/validate_character_animations.py \
  /path/to/CDDATA/0/0002 \
  --export assets/ripped/pepsiman/animations.json
```

The validator proves that every frame consumes its declared byte length, every clip contains all 16 joints, and every decoded frame of representative clip 4 matches a committed golden digest.
