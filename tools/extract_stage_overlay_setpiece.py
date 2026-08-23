#!/usr/bin/env python3
"""Extract authored scene-2 actors and controller dispatch from CDDATA/4/4000."""

from __future__ import annotations

from argparse import ArgumentParser
from collections import Counter
import hashlib
import json
from pathlib import Path
import struct


OVERLAY_BASE = 0x800F0000
SCENE_STATE_TABLE_OFFSET = 0x0000
SCENE_STATE_COUNT = 61
ACTOR_TABLE_OFFSET = 0x7490
ACTOR_RECORD_SIZE = 0x10
ACTOR_COUNT_OFFSET = 0x7B00
ACTOR_DISPATCH_OFFSET = 0x7B0C
ACTOR_HANDLER_COUNT = 13
EXPECTED_SIZE = 33044

ACTIVE_CONTROLLER_METADATA = [
    {"soundId": 56, "collision": [20, 80, 80], "displayVerticalOffset": 0, "response": "damage"},
    {"soundId": 59, "collision": [20, 60, 120], "displayVerticalOffset": 0, "response": "damage"},
    {"soundId": 59, "collision": [20, 70, 200], "displayVerticalOffset": 0, "response": "damage"},
    {"soundId": 56, "collision": [50, 60, 80], "displayVerticalOffset": 0, "response": "damage"},
    {"soundId": 58, "collision": [20, 95, 100], "displayVerticalOffset": 0, "response": "damage"},
    {"soundId": 57, "collision": [35, 45, 80], "displayVerticalOffset": 60, "response": "damage"},
    {"soundId": 58, "collision": [20, 105, 90], "displayVerticalOffset": 0, "response": "damage"},
    {"soundId": 57, "collision": [60, 70, 150], "displayVerticalOffset": 60, "response": "block-forward"},
]


def pointer(data: bytes, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]


def validate_overlay_pointer(value: int, label: str) -> None:
    if not OVERLAY_BASE <= value < OVERLAY_BASE + EXPECTED_SIZE:
        raise ValueError(f"{label} pointer {value:#x} is outside the overlay")


def extract(data: bytes, source_name: str = "CDDATA/4/4000") -> dict:
    if len(data) != EXPECTED_SIZE:
        raise ValueError(f"unexpected scene-2 overlay size {len(data)}; expected {EXPECTED_SIZE}")

    actor_count = pointer(data, ACTOR_COUNT_OFFSET)
    if actor_count != 103:
        raise ValueError(f"unexpected authored actor count {actor_count}")
    if ACTOR_TABLE_OFFSET + actor_count * ACTOR_RECORD_SIZE != ACTOR_COUNT_OFFSET:
        raise ValueError("authored actor table does not end at its count word")

    scene_handlers = [pointer(data, SCENE_STATE_TABLE_OFFSET + index * 4) for index in range(SCENE_STATE_COUNT)]
    for index, handler in enumerate(scene_handlers):
        validate_overlay_pointer(handler, f"scene state {index}")

    actor_handlers = [pointer(data, ACTOR_DISPATCH_OFFSET + index * 4) for index in range(ACTOR_HANDLER_COUNT)]
    for index, handler in enumerate(actor_handlers):
        validate_overlay_pointer(handler, f"actor type {index}")

    actors = []
    type_counts: Counter[int] = Counter()
    previous_forward = -2**31
    backward_records = []
    for index in range(actor_count):
        offset = ACTOR_TABLE_OFFSET + index * ACTOR_RECORD_SIZE
        record = data[offset : offset + ACTOR_RECORD_SIZE]
        actor_type, forward, vertical, lateral = struct.unpack("<H2xiii", record)
        if actor_type >= ACTOR_HANDLER_COUNT:
            raise ValueError(f"actor {index} has invalid controller type {actor_type}")
        if forward < previous_forward:
            backward_records.append(index)
        previous_forward = forward
        type_counts[actor_type] += 1
        actors.append({
            "id": index,
            "controllerType": actor_type,
            "handlerAddress": f"0x{actor_handlers[actor_type]:08x}",
            "sourcePosition": [forward, vertical, lateral],
            "forward": forward,
            "vertical": vertical,
            "lateral": lateral,
            "raw": record.hex(),
        })

    return {
        "format": "Pepsiman retail scene-2 overlay set-piece v1",
        "source": source_name,
        "sourceSize": len(data),
        "sourceSha256": hashlib.sha256(data).hexdigest(),
        "overlayLoadAddress": f"0x{OVERLAY_BASE:08x}",
        "sceneStateTableOffset": SCENE_STATE_TABLE_OFFSET,
        "sceneStateCount": SCENE_STATE_COUNT,
        "sceneStateHandlers": [f"0x{handler:08x}" for handler in scene_handlers],
        "actorTableOffset": ACTOR_TABLE_OFFSET,
        "actorRecordSize": ACTOR_RECORD_SIZE,
        "actorCount": actor_count,
        "actorDispatchOffset": ACTOR_DISPATCH_OFFSET,
        "actorHandlerCount": ACTOR_HANDLER_COUNT,
        "actorHandlers": [f"0x{handler:08x}" for handler in actor_handlers],
        "activeControllerMetadata": [
            {
                "controllerType": index,
                "handlerAddress": f"0x{actor_handlers[index]:08x}",
                "spriteFrameId": index + 1,
                "spriteTexture": f"assets/ripped/textures/4/4005-{index + 1:03d}.png",
                "renderDefinitionAddress": f"0x{0x800960A8 + index * 0x10:08x}",
                "soundId": metadata["soundId"],
                "collisionForwardRadius": metadata["collision"][0],
                "collisionLateralRadius": metadata["collision"][1],
                "collisionVerticalLowerExtent": metadata["collision"][2],
                "displayBrowserVerticalOffset": metadata["displayVerticalOffset"],
                "collisionResponse": metadata["response"],
                "blockForwardOffset": 60 if metadata["response"] == "block-forward" else None,
            }
            for index, metadata in enumerate(ACTIVE_CONTROLLER_METADATA)
        ],
        "visibilityAhead": 2000,
        "visibilityBehind": 10000,
        "automaticReactionBehindScrollingOrigin": 120,
        "scrollingOriginBehindPlayer": 620,
        "chaseCan": {
            "spriteAssetId": 301,
            "spriteTexture": "assets/ripped/textures/4/4001-106.png",
            "spriteDrawHandlerAddress": "0x800f0790",
            "initialForward": -2420,
            "initialVertical": -140,
            "initialLateral": 0,
            "advanceUnitsPerFrame": 30,
            "trailingOffsetFromPlayer": 620,
            "browserVerticalCenter": 260,
            "browserBillboardSize": 520,
            "browserPresentationFieldsInferred": ["browserVerticalCenter", "browserBillboardSize"],
        },
        "chaseCamera": {
            "presentation": "front-facing",
            "browserPosition": [0, 3.7, -7.4],
            "browserLookAt": [0, 1.65, 5],
            "browserFramingInferred": True,
        },
        "chaseEnding": {
            "controllerState20Address": "0x800f58b0",
            "controllerState50Address": "0x800f6088",
            "centeringFrames": 61,
            "lateralCenterUnitsPerFrame": 15,
            "endingFrames": 223,
            "playerAdvanceFrames": 120,
            "headingTurnFrames": 52,
            "headingUnitsPerFrame": -11,
            "cameraTransformSaveFrame": 90,
            "cameraShakeStartFrame": 90,
            "cameraShakeEndFrame": 150,
            "canAdvanceFrames": 150,
            "impactFrame": 120,
            "impactSoundId": 62,
            "impactEffectCount": 20,
            "fadeIntensityOriginFrame": 160,
            "firstVisibleFadeFrame": 161,
            "fadeIntensityPerFrame": 4,
            "psxAngleUnitsPerTurn": 4096,
            "browserApproximationFields": ["cameraShakePattern", "impactSound", "impactEffectPresentation"],
        },
        "playerStartForward": -1800,
        "finishForward": 30001,
        "retailAdvanceUnitsPerFrame": 30,
        "reactionFrames": 16,
        "reactionForwardUnitsPerFrame": 45,
        "reactionLateralUnitsPerFrame": 25,
        "reactionVerticalAmplitude": 200,
        "activeControllerTypeCounts": {str(key): value for key, value in sorted(type_counts.items())},
        "nonMonotonicForwardRecordIds": backward_records,
        "actors": actors,
    }


if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--source-name", default="CDDATA/4/4000")
    args = parser.parse_args()
    result = extract(args.source.read_bytes(), args.source_name)
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_text(json.dumps(result, indent=2) + "\n")
