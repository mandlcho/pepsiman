#!/usr/bin/env python3
"""Extract the shared authored actor-table footer from a retail overlay."""

from argparse import ArgumentParser
from collections import Counter
import hashlib
import json
from pathlib import Path
import struct


OVERLAY_BASE = 0x800F0000
RECORD_SIZE = 16
COLLISION_PROFILES = [
    (20, 80, 80, "damage"),
    (20, 60, 120, "damage"),
    (20, 70, 200, "damage"),
    (50, 60, 80, "damage"),
    (20, 95, 100, "damage"),
    (35, 45, 80, "damage"),
    (20, 105, 90, "damage"),
    (60, 70, 150, "block-forward"),
]


def u32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]


def is_pointer(value: int, size: int) -> bool:
    return OVERLAY_BASE <= value < OVERLAY_BASE + size


def find_footer(data: bytes) -> tuple[int, int]:
    matches = []
    for offset in range(0, len(data) - 16, 4):
        count, mode, angle_units, handler = struct.unpack_from("<4I", data, offset)
        if 1 <= count <= 500 and mode == 5 and angle_units == 4096 and is_pointer(handler, len(data)):
            table = offset - count * RECORD_SIZE
            if table >= 0 and all(struct.unpack_from("<H", data, table + index * RECORD_SIZE)[0] < 32 for index in range(count)):
                matches.append((table, offset))
    if len(matches) != 1:
        raise ValueError(f"expected one actor footer, found {matches}")
    return matches[0]


def extract(data: bytes, source_name: str, sprite_root: str, player_start: int, finish_forward: int) -> dict:
    table, footer = find_footer(data)
    count = u32(data, footer)
    handlers = []
    cursor = footer + 12
    while cursor + 4 <= len(data) and is_pointer(u32(data, cursor), len(data)):
        handlers.append(u32(data, cursor))
        cursor += 4
    actors = []
    counts = Counter()
    for index in range(count):
        offset = table + index * RECORD_SIZE
        actor_type, forward, vertical, lateral = struct.unpack_from("<H2xiii", data, offset)
        if actor_type >= len(handlers):
            raise ValueError(f"actor {index} references missing handler {actor_type}")
        counts[actor_type] += 1
        actors.append({
            "id": index,
            "controllerType": actor_type,
            "handlerAddress": f"0x{handlers[actor_type]:08x}",
            "sourcePosition": [forward, vertical, lateral],
            "forward": forward,
            "vertical": vertical,
            "lateral": lateral,
            "raw": data[offset : offset + RECORD_SIZE].hex(),
        })
    controllers = []
    for actor_type, (forward, lateral, vertical, response) in enumerate(COLLISION_PROFILES):
        if actor_type >= len(handlers):
            break
        controllers.append({
            "controllerType": actor_type,
            "handlerAddress": f"0x{handlers[actor_type]:08x}",
            "spriteFrameId": actor_type + 1,
            "spriteTexture": f"{sprite_root}-{actor_type + 1:03d}.png",
            "collisionForwardRadius": forward,
            "collisionLateralRadius": lateral,
            "collisionVerticalLowerExtent": vertical,
            "displayBrowserVerticalOffset": 60 if actor_type in (5, 7) else 0,
            "collisionResponse": response,
            "blockForwardOffset": 60 if response == "block-forward" else None,
            "browserCollisionProfileInferredFromSharedRetailControllerSlot": True,
        })
    return {
        "format": "Pepsiman shared retail overlay actor table v1",
        "source": source_name,
        "sourceSize": len(data),
        "sourceSha256": hashlib.sha256(data).hexdigest(),
        "overlayLoadAddress": f"0x{OVERLAY_BASE:08x}",
        "actorTableOffset": table,
        "actorRecordSize": RECORD_SIZE,
        "actorCountOffset": footer,
        "actorCount": count,
        "actorHandlerCount": len(handlers),
        "actorHandlers": [f"0x{handler:08x}" for handler in handlers],
        "activeControllerMetadata": controllers,
        "activeControllerTypeCounts": {str(key): value for key, value in sorted(counts.items())},
        "visibilityAhead": 2000,
        "visibilityBehind": 10000,
        "automaticReactionBehindScrollingOrigin": 120,
        "scrollingOriginBehindPlayer": 620,
        "playerStartForward": player_start,
        "finishForward": finish_forward,
        "retailAdvanceUnitsPerFrame": 30,
        "reactionFrames": 16,
        "reactionForwardUnitsPerFrame": 45,
        "reactionLateralUnitsPerFrame": 25,
        "reactionVerticalAmplitude": 200,
        "chaseCamera": {
            "presentation": "behind-facing",
            "browserPosition": [0, 3.8, 6.2],
            "browserLookAt": [0, 1.45, -5.5],
            "browserFramingInferred": True,
        },
        "inferredFlowFields": ["playerStartForward", "finishForward", "retailAdvanceUnitsPerFrame", "collisionProfiles", "chaseCamera"],
        "actors": actors,
    }


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--source-name", required=True)
    parser.add_argument("--sprite-root", required=True)
    parser.add_argument("--player-start", type=int, default=0)
    parser.add_argument("--finish-forward", type=int, required=True)
    args = parser.parse_args()
    result = extract(args.source.read_bytes(), args.source_name, args.sprite_root, args.player_start, args.finish_forward)
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
