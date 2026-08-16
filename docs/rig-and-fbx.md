# Reconstructed Pepsiman rig and FBX exports

## Authoritative hierarchy and bind pose

The standard TOD setup declares dummy object `1001` as a parentless transform and joint `1` (the pelvis mesh) as its child. The browser and interchange rigs therefore use `root (1001) -> pelvis (1) -> spine/hips`. The root has no TMD mesh and no setup frames.

The original TMD stores each body segment in local coordinates. Sony's PsyQ data-conversion documentation describes this exact workflow: separate local-coordinate objects are positioned by TOD coordinates, and dummy objects provide pivots and hierarchy. See [Data Conversion Utilities, pp. 3-61–3-63](https://psx.arthus.net/sdk/Psy-Q/DOCS/Devrefs/Dataconv.pdf).

All character TOD translations use a scale of `1 / 5`. This is directly visible in the retail transform routine at `SLPS_017.62:0x8001945c–0x800194bc`; it is also independently checked by the recovered geometry. Using `1 / 4` separates the knee/foot interfaces by more than ten source units. Using `1 / 5` reduces the worst nearest-vertex seam across all 15 parent/child mesh interfaces to 3.10 source units and produces a contiguous front/side bind render.

## Pelvis and root motion

Every one of the 1,061 decoded joint-1 frames contains X rotation `1697°`, equivalent to `-103°`. Because it never varies, it is a character coordinate-basis term rather than pelvis motion. The exporter cancels this fixed basis and factors the remaining joint-1 matrix onto root `1001`:

`root_delta = corrected_animated_joint_1 * inverse(bind_pelvis)`

The pelvis stays at its authored bind transform. Root translation and orientation animate on `1001`, and `root_delta * bind_pelvis` reproduces the corrected source joint-1 pose.

The rotation representation follows Sony's TOD specification: one degree is stored as 4096 fixed-point units, with X/Y/Z components in the RST packet. See [PsyQ File Formats, pp. 2-44–2-46](https://psx.arthus.net/sdk/Psy-Q/DOCS/Devrefs/Filefrmt.pdf).

## Skinning

The original PlayStation model uses rigid segmented animation, not blended deformation. The FBX combines all 16 visible TMD segments into one mesh and converts segment ownership into skinning data: every vertex receives weight `1.0` for its original segment joint. The skin contains 17 bones including the non-rendered root and stores inverse bind matrices for the corrected assembled pose.

## Animation names

The retail executable exposes the clips only as numeric motions (`MOTION %3d`), and the packed TOD headers contain IDs 2–51 without text names. Human-readable action labels in `tools/animation_names.json` are therefore descriptive inferences from recovered pose contact sheets. The lab prefixes them with `≈`, and the manifest records `provenance` and `confidence` for every label. Numeric retail IDs remain authoritative and are included in filenames and metadata.

## Files and validation

- `exports/pepsiman/Pepsiman_Rig.fbx`: combined skinned character with all 50 animation stacks.
- `exports/pepsiman/Pepsiman_Rig.gltf`: transparent intermediate representation with the same rig and animations.
- `exports/pepsiman/animations/*.fbx`: one FBX per retail motion ID.
- `exports/pepsiman/Pepsiman_Animation_Clips.zip`: all individual FBXs and their texture.
- `exports/pepsiman/manifest.json`: clip IDs, labels, provenance, confidence, and filenames.

Rebuild and validate with:

```sh
./tools/export_fbx.sh
python3 tools/validate_fbx_exports.py exports/pepsiman --names tools/animation_names.json
```

Blender imports the transparent glTF intermediate at the original 30 FPS and bakes FBX without key simplification. Assimp then validates file structure: one mesh, 17 bones, and 50 named animations in the combined file, plus one correctly named animation in each of the 50 individual files.

The browser-facing validation uses the exact Three.js `FBXLoader` used by Skeleton Lab:

```sh
node tools/validate_fbx_three.mjs /path/to/three exports/pepsiman/Pepsiman_Rig.fbx assets/ripped/pepsiman/animations.json
```

It checks the `SkinnedMesh`, normalized vertex weights, hierarchy, pelvis bind transform, clip names, and all 1,061 recovered frames. The current export's worst joint-rotation drift is `0.034°`.
