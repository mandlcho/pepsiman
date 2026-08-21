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
