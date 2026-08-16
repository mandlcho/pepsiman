#!/usr/bin/env python3
"""Validate compact Pepsiman animation decoding against the original pack."""

from pathlib import Path
import argparse
import hashlib
import json
import math

from extract_character import add_animation_names, parse_compressed_animation_pack


CLIP_4_FRAME_HASHES = [
    "e606088b49e2d6569d766070ad43af6da892f82dd0b673614b98b3b1fcdd9e6a",
    "2727b60b4ef25191eb61292257b58d219342ce089a1e03fec9e7fcfbdbc98331",
    "b0178d461178bff9a34b8f6c8ef7922350f7bc499542020a448205a5fca5b368",
    "a90de8ffd80a8403845d63e442007c92a91fc969303fae8c909762c2a5c4d38a",
    "82dde89b2a2a050847e036f8de2ac761f78b1e9aeb71cbdd6e4e83183898f536",
    "fe974898dfdaf94a561ae6c62f84aec06d01ae8ec46fb998839a70a70b6dd046",
    "c38d8a892e812130a26814f8f8c2030c6f61a1892b0cae578975ecd28e359296",
    "2b78ef4977a8ba25f5cf576b4098217df65ac3aee77fed326ca0bb16e2d732b8",
    "7c6f14e11aeb4faf47debace33baa6a9bdf34648cfe417083f87fa7f777d75ef",
    "f16cb7e2c8f73afcfc292027b587868c051f12075a051621c4340b57f8932129",
    "6ad5b0f37a38b9c2511fc4465c83a1fa997dbd1771896be5ed50805467f634dd",
    "4984d59dd407f048724af96323fd060ccdab464f672e9150fb27ac0b777b49e5",
    "11a1791532f16e77df8ba9022a2226af9d5c5adbf401f4458a7eef7a0fa5400e",
    "d8af24fef146d47023ca59b90fa33650b87776d8a77c1f17107882234da7c1eb",
    "2f59097b0c50fd8a87359d977b40ec1d564b5c3fa02b64515e544cb30bd9d6de",
    "b7e163cc5bfabd6bf39602757b3a4dc22de57495bb0c66e64bcca043bfa39b56",
]


def frame_digest(clip: dict, frame_index: int) -> str:
    rotations = []
    for track in clip["objects"]:
        frame = track["frames"][frame_index]
        rotations.append([round(math.degrees(value)) for value in frame["rotation"]])
    root = clip["objects"][0]["frames"][frame_index]
    payload = {"r": rotations, "s": root["rootScalar"], "t": root["translation"]}
    encoded = json.dumps(payload, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def validate(pack_path: Path, export_path: Path | None = None) -> None:
    clips = parse_compressed_animation_pack(pack_path.read_bytes())
    assert [clip["id"] for clip in clips] == list(range(2, 52)), "expected clips 2 through 51"
    for clip in clips:
        assert len(clip["objects"]) == 16, f"clip {clip['id']} joint count"
        for expected_id, track in enumerate(clip["objects"], 1):
            assert track["id"] == expected_id, f"clip {clip['id']} joint order"
            assert len(track["frames"]) == clip["frameCount"], f"clip {clip['id']} joint {expected_id} frames"
    clip_4 = next(clip for clip in clips if clip["id"] == 4)
    actual_hashes = [frame_digest(clip_4, frame) for frame in range(clip_4["frameCount"])]
    assert actual_hashes == CLIP_4_FRAME_HASHES, "clip 4 frame regression mismatch"
    if export_path:
        exported = json.loads(export_path.read_text())
        assert exported["format"] == "Pepsiman TOD rig v3", "unexpected browser export version"
        setup_by_id = {item["id"]: item for item in exported["setup"]["objects"]}
        assert setup_by_id[1001]["parentId"] is None, "root 1001 must be parentless"
        assert setup_by_id[1001]["frames"] == [], "root 1001 must remain an identity transform"
        assert setup_by_id[1]["parentId"] == 1001, "pelvis joint 1 must be parented to root 1001"
        named_clips = add_animation_names(clips, Path(__file__).with_name("animation_names.json"))
        assert exported["clips"] == named_clips, "browser animation export is stale"
    suffix = " and the browser export" if export_path else ""
    print(f"Validated 50 clips, 16 joints per frame, all 16 golden frames of clip 4{suffix}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("animation_pack", type=Path)
    parser.add_argument("--export", type=Path)
    args = parser.parse_args()
    validate(args.animation_pack, args.export)
