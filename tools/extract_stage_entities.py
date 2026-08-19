#!/usr/bin/env python3
"""Extract Stage 1's fixed-capacity retail entity table from CDDATA/2/2006."""

from __future__ import annotations

from argparse import ArgumentParser
import json
import math
from pathlib import Path
import struct


ENTITY_TABLE_OFFSET = 0x6778
ENTITY_CAPACITY = 200
ENTITY_SIZE = 0x48
TMD_OBJECT_COUNT = 80


def s16(data: bytes, offset: int) -> int:
    return struct.unpack_from("<h", data, offset)[0]


def s32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<i", data, offset)[0]


def extract(data: bytes) -> dict:
    required = ENTITY_TABLE_OFFSET + ENTITY_CAPACITY * ENTITY_SIZE
    if len(data) < required:
        raise ValueError(f"entity pack is truncated: need {required} bytes, got {len(data)}")
    entities = []
    for index in range(ENTITY_CAPACITY):
        offset = ENTITY_TABLE_OFFSET + index * ENTITY_SIZE
        record = data[offset : offset + ENTITY_SIZE]
        current_model = s16(record, 0x36)
        base_model = s16(record, 0x38)
        if not -1 <= current_model < TMD_OBJECT_COUNT or not -1 <= base_model < TMD_OBJECT_COUNT:
            raise ValueError(f"entity {index} has invalid TMD model indices {current_model}/{base_model}")
        position = [s32(record, axis * 4) for axis in range(3)]
        base_position = [s32(record, 0x0C + axis * 4) for axis in range(3)]
        base_yaw = s16(record, 0x20)
        entities.append({
            "id": index,
            "active": base_model >= 0 and position != [0, 0, 0],
            "position": [position[0], -position[1], -position[2]],
            "basePosition": [base_position[0], -base_position[1], -base_position[2]],
            "baseYaw": base_yaw,
            "baseYawRadians": -base_yaw * math.tau / 4096,
            "scale": [s32(record, 0x2C) / 2048, s32(record, 0x30) / 2048],
            "definitionIndex": s16(record, 0x34),
            "currentModel": current_model,
            "baseModel": base_model,
            "behavior": record[0x42],
            "flags": list(record[0x40:0x48]),
            "raw": record.hex(),
        })
    return {
        "format": "Pepsiman Stage 1 retail entity table v1",
        "source": "CDDATA/2/2006",
        "tableOffset": ENTITY_TABLE_OFFSET,
        "recordSize": ENTITY_SIZE,
        "capacity": ENTITY_CAPACITY,
        "activeCount": sum(entity["active"] for entity in entities),
        "coordinateConversion": "(x, y, z) -> (x, -y, -z)",
        "entities": entities,
    }


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    result = extract(args.source.read_bytes())
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_text(json.dumps(result, separators=(",", ":")) + "\n")
    print(f"Extracted {result['activeCount']} active entities from {result['capacity']} retail records")


if __name__ == "__main__":
    main()
