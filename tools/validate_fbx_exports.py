#!/usr/bin/env python3
"""Round-trip check the combined and per-clip Pepsiman FBX exports with Assimp."""

from pathlib import Path
import argparse
import json
import shutil
import subprocess


def inspect(path: Path) -> str:
    result = subprocess.run(["assimp", "info", str(path)], check=True, text=True, capture_output=True)
    return result.stdout


def validate(export_root: Path, names_path: Path) -> None:
    if not shutil.which("assimp"):
        raise RuntimeError("assimp CLI is required for FBX validation")
    names = json.loads(names_path.read_text())
    combined = inspect(export_root / "Pepsiman_Rig.fbx")
    for expected in ("Meshes:             1", "Animations:         50", "Bones:              17", "root", "pelvis"):
        assert expected in combined, f"combined FBX missing {expected!r}"
    assert (export_root / "texture.png").exists(), "combined FBX texture missing"

    animation_directory = export_root / "animations"
    files = sorted(animation_directory.glob("*.fbx"))
    assert len(files) == 50, f"expected 50 per-clip FBXs, found {len(files)}"
    for clip_id in range(2, 52):
        name = names[str(clip_id)]["name"]
        path = animation_directory / f"{clip_id}_{name}.fbx"
        report = inspect(path)
        for expected in ("Meshes:             1", "Animations:         1", "Bones:              17", name):
            assert expected in report, f"{path.name} missing {expected!r}"
    assert (animation_directory / "texture.png").exists(), "per-clip FBX texture missing"
    print("Validated combined FBX (1 mesh, 17 bones, 50 clips) and 50 individual named FBXs")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("export_root", type=Path)
    parser.add_argument("--names", type=Path, required=True)
    args = parser.parse_args()
    validate(args.export_root, args.names)
