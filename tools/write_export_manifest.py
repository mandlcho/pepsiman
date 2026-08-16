#!/usr/bin/env python3
"""Write the downloadable FBX export manifest from the reviewed name map."""

from pathlib import Path
import argparse
import json


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("names", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    names = json.loads(args.names.read_text())
    manifest = {
        "format": "Pepsiman reconstructed FBX rig v1",
        "combined": "Pepsiman_Rig.fbx",
        "texture": "texture.png",
        "skeleton": "root -> pelvis -> spine/hips (17 bones total)",
        "weighting": "rigid weights recovered from the original TMD segment ownership",
        "clips": [
            {
                "id": clip_id,
                **names[str(clip_id)],
                "file": f"animations/{clip_id}_{names[str(clip_id)]['name']}.fbx",
            }
            for clip_id in range(2, 52)
        ],
    }
    args.output.write_text(json.dumps(manifest, indent=2) + "\n")
