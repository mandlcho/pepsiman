#!/usr/bin/env python3
"""Extract Stage 1's retail entities and model collision spheres from CDDATA/2/2006."""

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
COLLISION_INDEX_OFFSET = 0x04
COLLISION_INDEX_SIZE = 0x08
COLLISION_RECORDS_OFFSET = 0x284
COLLISION_RECORD_SIZE = 0x2C
SURFACE_INDEX_OFFSET = 0x4748
SURFACE_INDEX_SIZE = 0x08
SURFACE_RECORDS_OFFSET = 0x49C8
SURFACE_RECORD_SIZE = 0x4C


def s16(data: bytes, offset: int) -> int:
    return struct.unpack_from("<h", data, offset)[0]


def s32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<i", data, offset)[0]


def extract(data: bytes) -> dict:
    required = ENTITY_TABLE_OFFSET + ENTITY_CAPACITY * ENTITY_SIZE
    if len(data) < required:
        raise ValueError(f"entity pack is truncated: need {required} bytes, got {len(data)}")
    collision_index = []
    collision_record_count = 0
    for model in range(TMD_OBJECT_COUNT):
        offset = COLLISION_INDEX_OFFSET + model * COLLISION_INDEX_SIZE
        start, count = struct.unpack_from("<II", data, offset)
        collision_record_count = max(collision_record_count, start + count)
        collision_index.append({"model": model, "start": start, "count": count})

    collision_end = COLLISION_RECORDS_OFFSET + collision_record_count * COLLISION_RECORD_SIZE
    if collision_end > len(data):
        raise ValueError(
            f"collision sphere table is truncated: need {collision_end} bytes, got {len(data)}"
        )

    collision_spheres = []
    for model_entry in collision_index:
        model = model_entry["model"]
        for model_record_index in range(model_entry["count"]):
            index = model_entry["start"] + model_record_index
            offset = COLLISION_RECORDS_OFFSET + index * COLLISION_RECORD_SIZE
            record = data[offset : offset + COLLISION_RECORD_SIZE]
            owner_model = s32(record, 0x28)
            radius = s32(record, 0x14)
            if owner_model != model:
                raise ValueError(
                    f"collision sphere {index} belongs to model {owner_model}, expected {model}"
                )
            if radius <= 0:
                raise ValueError(f"collision sphere {index} has invalid radius {radius}")
            center = [s32(record, 0x1C), s32(record, 0x20), s32(record, 0x24)]
            collision_spheres.append({
                "id": index,
                "model": model,
                "modelRecordIndex": model_record_index,
                "center": [center[0], -center[1], -center[2]],
                "radius": radius,
                "collisionClass": record[0x18],
                "collisionVariant": record[0x19],
                "reactionParameters": [s16(record, 0x0C), s16(record, 0x0E), s16(record, 0x10)],
                "raw": record.hex(),
            })

    if len(collision_spheres) != collision_record_count:
        raise ValueError(
            "collision sphere index contains gaps or overlaps: "
            f"indexed {len(collision_spheres)} records, extent is {collision_record_count}"
        )

    surface_index = []
    surface_record_count = 0
    for model in range(TMD_OBJECT_COUNT):
        offset = SURFACE_INDEX_OFFSET + model * SURFACE_INDEX_SIZE
        start, count = struct.unpack_from("<II", data, offset)
        surface_record_count = max(surface_record_count, start + count)
        surface_index.append({"model": model, "start": start, "count": count})

    surface_end = SURFACE_RECORDS_OFFSET + surface_record_count * SURFACE_RECORD_SIZE
    if surface_end > len(data):
        raise ValueError(f"collision surface table is truncated: need {surface_end} bytes, got {len(data)}")

    collision_surfaces = []
    for model_entry in surface_index:
        model = model_entry["model"]
        for model_record_index in range(model_entry["count"]):
            index = model_entry["start"] + model_record_index
            offset = SURFACE_RECORDS_OFFSET + index * SURFACE_RECORD_SIZE
            record = data[offset : offset + SURFACE_RECORD_SIZE]
            vertices = []
            for vertex_index in range(4):
                x, y, z = struct.unpack_from("<hhh", record, vertex_index * 6)
                vertices.append([x, -y, -z])
            collision_surfaces.append({
                "id": index,
                "model": model,
                "modelRecordIndex": model_record_index,
                "vertices": vertices,
                "raw": record.hex(),
            })

    if len(collision_surfaces) != surface_record_count:
        raise ValueError(
            "collision surface index contains gaps or overlaps: "
            f"indexed {len(collision_surfaces)} records, extent is {surface_record_count}"
        )

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
        "format": "Pepsiman Stage 1 retail entities and collision spheres v2",
        "source": "CDDATA/2/2006",
        "tableOffset": ENTITY_TABLE_OFFSET,
        "recordSize": ENTITY_SIZE,
        "capacity": ENTITY_CAPACITY,
        "activeCount": sum(entity["active"] for entity in entities),
        "coordinateConversion": "(x, y, z) -> (x, -y, -z)",
        "collisionSphereIndexOffset": COLLISION_INDEX_OFFSET,
        "collisionSphereRecordsOffset": COLLISION_RECORDS_OFFSET,
        "collisionSphereRecordSize": COLLISION_RECORD_SIZE,
        "collisionSphereCount": len(collision_spheres),
        "collisionSphereIndex": collision_index,
        "collisionSpheres": collision_spheres,
        "collisionSurfaceIndexOffset": SURFACE_INDEX_OFFSET,
        "collisionSurfaceRecordsOffset": SURFACE_RECORDS_OFFSET,
        "collisionSurfaceRecordSize": SURFACE_RECORD_SIZE,
        "collisionSurfaceCount": len(collision_surfaces),
        "collisionSurfaceIndex": surface_index,
        "collisionSurfaces": collision_surfaces,
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
    print(
        f"Extracted {result['activeCount']} active entities and "
        f"{result['collisionSphereCount']} collision spheres and "
        f"{result['collisionSurfaceCount']} collision surfaces"
    )


if __name__ == "__main__":
    main()
