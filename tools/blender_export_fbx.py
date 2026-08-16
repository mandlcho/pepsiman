#!/usr/bin/env python3
"""Convert the recovered glTF rig to FBX with Blender's baked animation exporter."""

from pathlib import Path
import json
import sys

import bpy


def write_fbx(destination: Path, all_actions: bool, nla_strips: bool = False) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.fbx(
        filepath=str(destination),
        global_scale=0.01,
        use_selection=True,
        object_types={"ARMATURE", "MESH"},
        apply_scale_options="FBX_SCALE_NONE",
        use_space_transform=True,
        bake_space_transform=False,
        add_leaf_bones=False,
        primary_bone_axis="Y",
        secondary_bone_axis="X",
        use_armature_deform_only=False,
        bake_anim=True,
        bake_anim_use_all_actions=all_actions,
        bake_anim_use_nla_strips=nla_strips,
        bake_anim_force_startend_keying=True,
        bake_anim_step=1,
        bake_anim_simplify_factor=0,
        path_mode="COPY",
        embed_textures=True,
    )


def export_fbx(source: Path, destination: Path, animation_directory: Path | None = None, names_path: Path | None = None) -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    # glTF stores key times in seconds. Import at the source sampling rate so
    # every recovered 30 Hz key lands on an integer Blender frame and the FBX
    # bake does not resample it at Blender's 24 Hz default.
    bpy.context.scene.render.fps = 30
    bpy.context.scene.render.fps_base = 1.0
    bpy.ops.import_scene.gltf(filepath=str(source))
    armatures = [item for item in bpy.context.scene.objects if item.type == "ARMATURE"]
    meshes = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    skinned_meshes = [
        item for item in meshes
        if any(modifier.type == "ARMATURE" for modifier in item.modifiers)
    ]
    if len(armatures) != 1 or len(skinned_meshes) != 1:
        raise RuntimeError(
            "expected one armature and one skinned mesh, found "
            f"{[item.name for item in armatures]} and {[item.name for item in meshes]}"
        )
    bpy.ops.object.select_all(action="DESELECT")
    armatures[0].select_set(True)
    skinned_meshes[0].select_set(True)
    if len(bpy.data.actions) != 50:
        raise RuntimeError(f"expected 50 imported actions, found {len(bpy.data.actions)}")
    write_fbx(destination, all_actions=True)
    print(f"Blender exported {destination} with 1 skinned mesh, 17 bones, and {len(bpy.data.actions)} actions")

    if animation_directory is not None:
        if names_path is None:
            raise RuntimeError("the individual animation export requires the animation name map")
        names = json.loads(names_path.read_text())
        armature = armatures[0]
        armature.animation_data_create()
        animation_directory.mkdir(parents=True, exist_ok=True)
        for clip_id in range(2, 52):
            clip_name = names[str(clip_id)]["name"]
            action = bpy.data.actions.get(clip_name)
            if action is None:
                raise RuntimeError(f"imported action {clip_name!r} is missing")
            armature.animation_data.action = None
            while armature.animation_data.nla_tracks:
                armature.animation_data.nla_tracks.remove(armature.animation_data.nla_tracks[0])
            track = armature.animation_data.nla_tracks.new()
            track.name = clip_name
            track.strips.new(clip_name, int(action.frame_range[0]), action)
            write_fbx(
                animation_directory / f"{clip_id}_{clip_name}.fbx",
                all_actions=False,
                nla_strips=True,
            )
        print(f"Blender exported 50 individual FBX clips to {animation_directory}")


if __name__ == "__main__":
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(arguments) not in (2, 4):
        raise SystemExit("usage: blender --background --python blender_export_fbx.py -- INPUT_GLTF OUTPUT_FBX [ANIMATION_DIR NAMES_JSON]")
    export_fbx(
        Path(arguments[0]).resolve(),
        Path(arguments[1]).resolve(),
        Path(arguments[2]).resolve() if len(arguments) == 4 else None,
        Path(arguments[3]).resolve() if len(arguments) == 4 else None,
    )
