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
REACTION_PROFILES = [
    {"forward": 20, "lateral": 80, "vertical": 80, "response": "damage"},
    {"forward": 20, "lateral": 60, "vertical": 120, "response": "damage"},
    {"forward": 20, "lateral": 70, "vertical": 200, "response": "damage"},
    {"forward": 50, "lateral": 60, "vertical": 80, "response": "damage"},
    {"forward": 20, "lateral": 95, "vertical": 100, "response": "damage"},
    {"forward": 35, "lateral": 45, "vertical": 80, "response": "damage"},
    {"forward": 20, "lateral": 105, "vertical": 90, "response": "damage"},
    {"forward": 60, "lateral": 70, "vertical": 150, "response": "block-forward"},
    {"forward": 20, "lateral": 120, "lateralMin": -220, "lateralMax": 20, "vertical": 200, "response": "damage"},
    {"forward": 20, "lateral": 120, "lateralMin": -20, "lateralMax": 220, "vertical": 200, "response": "damage"},
    {"forward": 20, "lateral": 270, "lateralMin": -520, "lateralMax": 20, "vertical": 255, "response": "damage"},
    {"forward": 20, "lateral": 270, "lateralMin": -20, "lateralMax": 520, "vertical": 255, "response": "damage"},
]
PURSUIT_PROFILES = [
    {"forward": 35, "lateral": 140, "vertical": 205, "verticalMin": -205, "verticalMax": 25, "response": "damage", "renderAssetId": 30, "spriteFrameId": 31},
    {"forward": 35, "lateral": 140, "vertical": 205, "verticalMin": -205, "verticalMax": 25, "response": "damage", "renderAssetId": 30, "spriteFrameId": 31, "bobAmplitude": 316},
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


def extract(data: bytes, source_name: str, sprite_root: str, player_start: int, finish_forward: int, automatic_reaction_behind: int, mode: str = "reaction") -> dict:
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
    profiles = PURSUIT_PROFILES if mode == "pursuit" else REACTION_PROFILES
    controllers = []
    for actor_type, profile in enumerate(profiles):
        if actor_type >= len(handlers):
            break
        controllers.append({
            "controllerType": actor_type,
            "handlerAddress": f"0x{handlers[actor_type]:08x}",
            "spriteFrameId": profile.get("spriteFrameId", actor_type + 1),
            "spriteTexture": f"{sprite_root}-{profile.get('spriteFrameId', actor_type + 1):03d}.png",
            **({"renderAssetId": profile["renderAssetId"]} if "renderAssetId" in profile else {}),
            "collisionForwardRadius": profile["forward"],
            "collisionLateralRadius": profile["lateral"],
            **({
                "collisionLateralBrowserMin": profile["lateralMin"],
                "collisionLateralBrowserMax": profile["lateralMax"],
            } if "lateralMin" in profile else {}),
            "collisionVerticalLowerExtent": profile["vertical"],
            **({
                "collisionVerticalBrowserMin": profile["verticalMin"],
                "collisionVerticalBrowserMax": profile["verticalMax"],
            } if "verticalMin" in profile else {}),
            "displayBrowserVerticalOffset": 60 if actor_type in (5, 7) else 0,
            **({"browserBillboardHeight": 164} if actor_type >= 8 or mode == "pursuit" else {}),
            **({"bobAmplitude": profile["bobAmplitude"]} if "bobAmplitude" in profile else {}),
            "collisionResponse": profile["response"],
            "blockForwardOffset": 60 if profile["response"] == "block-forward" else None,
            "collisionProfileProvenance": "decoded from CDDATA/D/D000 controller slot" if mode == "pursuit" else (
                "instruction-equivalent CDDATA/4/4000 controller slot"
                if actor_type < 8 else "decoded from CDDATA/7/7000 controller slot"
            ),
        })
    result = {
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
        "automaticReactionBehindScrollingOrigin": automatic_reaction_behind,
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
        "controllerComparison": "slots 0-7 match CDDATA/4/4000 except overlay-global addresses and the authored automatic-reaction threshold",
        "inferredFlowFields": ["playerStartForward", "finishForward", "retailAdvanceUnitsPerFrame", "chaseCamera"],
        "actors": actors,
    }
    if mode == "pursuit":
        for field in ("automaticReactionBehindScrollingOrigin", "scrollingOriginBehindPlayer", "reactionFrames", "reactionForwardUnitsPerFrame", "reactionLateralUnitsPerFrame", "reactionVerticalAmplitude"):
            result.pop(field)
        result.update({
            "movementMode": "pursuit",
            "activationBehindPlayer": 1200,
            "spawnBehindPlayer": 1200,
            "despawnAheadPlayer": 500,
            "actorAdvanceUnitsPerFrame": 60,
            "actorSpinDegreesPerFrame": 10,
            "actorBaseBrowserVertical": 25,
            "browserBillboardHeight": 164,
            "controllerComparison": "both CDDATA/D/D000 handlers share asset ID 30; slot 1 adds the decoded vertical bob",
            "inferredFlowFields": ["playerStartForward", "finishForward", "chaseCamera", "browserBillboardHeight"],
        })
    return result


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--source-name", required=True)
    parser.add_argument("--sprite-root", required=True)
    parser.add_argument("--player-start", type=int, default=0)
    parser.add_argument("--finish-forward", type=int, required=True)
    parser.add_argument("--automatic-reaction-behind", type=int, default=120)
    parser.add_argument("--mode", choices=("reaction", "pursuit"), default="reaction")
    args = parser.parse_args()
    result = extract(args.source.read_bytes(), args.source_name, args.sprite_root, args.player_start, args.finish_forward, args.automatic_reaction_behind, args.mode)
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
