# Pepsiman — native browser remake

A web-native recreation of the 1999 PlayStation runner. This is **not an emulator**: gameplay, collision, rendering, UI, input, and progression run as JavaScript/WebGL in the browser.

The player character uses data decoded from the supplied Japanese disc:

- original 17-part TMD character mesh
- original 256×256 VRAM texture page
- original TOD parent/child joint hierarchy
- 50 validated compact animation clips decoded from the original TOD stream
- original CD-audio music track
- 2,170 TIM textures extracted as PNG for continued level reconstruction

## Play locally

```sh
python3 serve.py
```

Open <http://127.0.0.1:8080>.

Edit and inspect the original skeleton at <http://127.0.0.1:8080/skeleton.html>. The lab exposes the recovered root plus all 16 TOD joints, parent links, transform gizmos, exact local values, 20-step undo history, explicit browser save, JSON export, FBX downloads, and a clickable preview list for every extracted motion clip. `DEFAULT · T-POSE` always restores the editable bind pose. The `≈` action labels are documented inferences; retail motion IDs remain attached to every clip.

## Rig and animation downloads

- [Combined skinned rig with all 50 animation stacks](exports/pepsiman/Pepsiman_Rig.fbx)
- [All 50 individual animation FBXs](exports/pepsiman/Pepsiman_Animation_Clips.zip)
- [Rig/FBX reconstruction notes](docs/rig-and-fbx.md)

### Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | Left / Right or A / D | Arrow buttons |
| Jump | Up or Space | Up button |
| Slide | Down or S | Down button |
| Start | Enter | Run button |

Gamepads work through browser keyboard mapping tools; direct Gamepad API mapping is planned.

## Rebuild ripped assets

The committed browser assets can be regenerated from a legally obtained Pepsiman CUE/BIN dump:

```sh
./tools/rip_assets.sh
```

The pipeline:

1. strips Mode 2 sector headers into an ISO-9660 image;
2. extracts the proprietary `CDDATA` packs;
3. reconstructs PS1 VRAM and decodes TIM textures to PNG;
4. converts the original TMD segmented character mesh to compact web JSON;
5. converts standard and Pepsiman-compressed TOD motion packets to browser animation tracks;
6. converts the selected Red Book CD-audio track to MP3.

The `.bin` and `.cue` disc files are explicitly gitignored and must never be committed.

## Deployment

Push `main` to GitHub. The workflow in `.github/workflows/pages.yml` publishes the static build to GitHub Pages automatically. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** if it is not already selected.

No build step, backend, ROM, BIOS, or emulator core is required.

## Technical notes

- Rendering: Three.js/WebGL with pixelated nearest-neighbor PS1 textures
- Rigging: recovered root + original 16-joint TOD hierarchy, rigid skin weights, corrected bind transforms, and validated absolute integer-degree motion packets
- Gameplay: deterministic lane runner, jumping, sliding, pickups, obstacles, health, scaling speed, keyboard and touch controls
- Hosting: static and subpath-safe for `https://mandlcho.github.io/pepsiman/`

This fan project contains assets from the original game. Do not distribute it unless you have the necessary rights.
