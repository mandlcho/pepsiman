#!/usr/bin/env python3
"""Extract Stage 1's retail collision, entity, encounter, and pickup data from 2006."""

from __future__ import annotations

from argparse import ArgumentParser
from collections import Counter
import hashlib
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
EVENT_RECORDS_OFFSET = 0x9FB8
EVENT_RECORD_COUNT = 200
EVENT_RECORD_SIZE = 0x5C
ENCOUNTER_RECORDS_OFFSET = 0xE798
ENCOUNTER_RECORD_COUNT = 100
ENCOUNTER_RECORD_SIZE = 0x3C
ENCOUNTER_SPRITE_BASE_ASSET_ID = 30
ENCOUNTER_SPRITE_FRAME_COUNT = 60
COLLECTIBLE_TABLE_OFFSET = 0xFF08
COLLECTIBLE_TABLE_SIZE = 0x800
COLLECTIBLE_RECORD_SIZE = 0x08
EMBEDDED_TOD_OFFSET = 0x10708
EXPECTED_FILE_SIZE = 0x10EEC


def s16(data: bytes, offset: int) -> int:
    return struct.unpack_from("<h", data, offset)[0]


def s32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<i", data, offset)[0]


def extract(data: bytes) -> dict:
    if len(data) != EXPECTED_FILE_SIZE:
        raise ValueError(
            f"unexpected Stage 1 entity pack size: expected {EXPECTED_FILE_SIZE} bytes, got {len(data)}"
        )
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

    event_records = []
    initial_state_counts: Counter[int] = Counter()
    for index in range(EVENT_RECORD_COUNT):
        offset = EVENT_RECORDS_OFFSET + index * EVENT_RECORD_SIZE
        record = data[offset : offset + EVENT_RECORD_SIZE]
        initial_state = record[0]
        initial_state_counts[initial_state] += 1
        trigger_center = [s32(record, 0x50), s32(record, 0x54), s32(record, 0x58)]
        trigger_vertices = []
        for x_offset, z_offset in ((0x04, 0x08), (0x0A, 0x0E), (0x10, 0x14), (0x16, 0x1A)):
            x = trigger_center[0] + s16(record, x_offset)
            z = trigger_center[2] + s16(record, z_offset)
            trigger_vertices.append([x, -trigger_center[1], -z])
        event_records.append({
            "id": index,
            "active": initial_state != 0xFF,
            "initialState": initial_state,
            "triggerCenter": [trigger_center[0], -trigger_center[1], -trigger_center[2]],
            "triggerVertices": trigger_vertices,
            "s32": list(struct.unpack("<23i", record)),
            "raw": record.hex(),
        })

    expected_initial_states = {0: 96, 1: 1, 255: 103}
    if dict(sorted(initial_state_counts.items())) != expected_initial_states:
        raise ValueError(
            "unexpected event initial-state distribution: "
            f"expected {expected_initial_states}, got {dict(sorted(initial_state_counts.items()))}"
        )

    encounter_records = []
    for index in range(ENCOUNTER_RECORD_COUNT):
        offset = ENCOUNTER_RECORDS_OFFSET + index * ENCOUNTER_RECORD_SIZE
        record = data[offset : offset + ENCOUNTER_RECORD_SIZE]
        render_model_id = s16(record, 0x00)
        if render_model_id >= 0 and not (
            ENCOUNTER_SPRITE_BASE_ASSET_ID
            <= render_model_id
            < ENCOUNTER_SPRITE_BASE_ASSET_ID + ENCOUNTER_SPRITE_FRAME_COUNT
        ):
            raise ValueError(
                f"encounter record {index} references sprite asset {render_model_id} "
                "outside the Stage 1 TIM registration range"
            )
        sprite_frame_id = (
            render_model_id - ENCOUNTER_SPRITE_BASE_ASSET_ID + 1
            if render_model_id >= 0
            else None
        )
        position = [s32(record, 0x04), s32(record, 0x08), s32(record, 0x0C)]
        duplicated_position = [s32(record, 0x10), s32(record, 0x14), s32(record, 0x18)]
        if position != duplicated_position:
            raise ValueError(f"encounter record {index} does not repeat its position")
        event_record_index = s16(record, 0x2C)
        if render_model_id >= 0 and not 0 <= event_record_index < EVENT_RECORD_COUNT:
            raise ValueError(
                f"encounter record {index} links invalid event record {event_record_index}"
            )
        encounter_records.append({
            "id": index,
            "active": render_model_id >= 0,
            "renderModelId": render_model_id,
            "spriteFrameId": sprite_frame_id,
            "spriteTexture": (
                f"assets/ripped/textures/2/2005-{sprite_frame_id:03d}.png"
                if sprite_frame_id is not None
                else None
            ),
            "position": [position[0], -position[1], -position[2]],
            "duplicatedPosition": [
                duplicated_position[0],
                -duplicated_position[1],
                -duplicated_position[2],
            ],
            "field28": s16(record, 0x1C),
            "field30": s16(record, 0x1E),
            "field32": s32(record, 0x20),
            "runtimeBytes36To39": list(record[0x24:0x28]),
            "field40": s16(record, 0x28),
            "field42": s16(record, 0x2A),
            "eventRecordIndex": event_record_index,
            "field48": s16(record, 0x30),
            "field52": s16(record, 0x34),
            "field54": s16(record, 0x36),
            "field56": s32(record, 0x38),
            "raw": record.hex(),
        })

    collectible_table_data = data[
        COLLECTIBLE_TABLE_OFFSET : COLLECTIBLE_TABLE_OFFSET + COLLECTIBLE_TABLE_SIZE
    ]
    course_chunk_count, collectible_data_offset = struct.unpack_from("<II", collectible_table_data)
    if course_chunk_count != 21:
        raise ValueError(f"unexpected collectible course-chunk count {course_chunk_count}")
    expected_data_offset = 8 + course_chunk_count * 8
    if collectible_data_offset != expected_data_offset:
        raise ValueError(
            f"unexpected collectible data offset {collectible_data_offset}, "
            f"expected {expected_data_offset}"
        )
    collectible_chunk_index = []
    indexed_records = []
    for chunk in range(course_chunk_count):
        start, count = struct.unpack_from("<II", collectible_table_data, 8 + chunk * 8)
        indexed_records.extend(range(start, start + count))
        collectible_chunk_index.append({"courseChunk": chunk, "start": start, "count": count})
    collectible_count = len(indexed_records)
    if indexed_records != list(range(collectible_count)):
        raise ValueError("collectible course-chunk index is not contiguous from record zero")

    collectible_capacity = (
        COLLECTIBLE_TABLE_SIZE - collectible_data_offset
    ) // COLLECTIBLE_RECORD_SIZE
    collectibles = []
    for index in range(collectible_capacity):
        offset = collectible_data_offset + index * COLLECTIBLE_RECORD_SIZE
        record = collectible_table_data[offset : offset + COLLECTIBLE_RECORD_SIZE]
        x, y, z, raw_type = struct.unpack("<hhhh", record)
        active = index < collectible_count
        if active and raw_type == 0:
            raise ValueError(f"indexed collectible record {index} has no type")
        if not active and record != bytes(COLLECTIBLE_RECORD_SIZE):
            raise ValueError(f"unused collectible record {index} is not zero-filled")
        collectibles.append({
            "id": index,
            "active": active,
            "position": [x, -y, -z],
            "type": raw_type & 0x7FFF,
            "consumed": bool(raw_type & 0x8000),
            "rawType": raw_type,
            "raw": record.hex(),
        })

    active_collectible_types = Counter(
        collectible["type"] for collectible in collectibles if collectible["active"]
    )
    if active_collectible_types != {1: 100}:
        raise ValueError(
            "unexpected active collectible type distribution: "
            f"expected {{1: 100}}, got {dict(active_collectible_types)}"
        )

    embedded_tod = data[EMBEDDED_TOD_OFFSET:]
    if embedded_tod[8:12] != b"TOD\0":
        raise ValueError("embedded Stage 1 animation does not contain the expected TOD signature")

    return {
        "format": "Pepsiman Stage 1 retail collision, entity, encounter, and pickup data v5",
        "source": "CDDATA/2/2006",
        "sourceSize": len(data),
        "sourceSha256": hashlib.sha256(data).hexdigest(),
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
        "eventRecordOffset": EVENT_RECORDS_OFFSET,
        "eventRecordSize": EVENT_RECORD_SIZE,
        "eventRecordCount": EVENT_RECORD_COUNT,
        "activeEventRecordCount": sum(record["active"] for record in event_records),
        "eventInitialStateCounts": {
            str(key): value for key, value in sorted(initial_state_counts.items())
        },
        "eventRecords": event_records,
        "encounterRecordOffset": ENCOUNTER_RECORDS_OFFSET,
        "encounterRecordSize": ENCOUNTER_RECORD_SIZE,
        "encounterRecordCount": ENCOUNTER_RECORD_COUNT,
        "activeEncounterRecordCount": sum(record["active"] for record in encounter_records),
        "encounterSpriteBaseAssetId": ENCOUNTER_SPRITE_BASE_ASSET_ID,
        "encounterSpriteFrameCount": ENCOUNTER_SPRITE_FRAME_COUNT,
        "encounterSpriteSource": "CDDATA/2/2005",
        "encounterRecords": encounter_records,
        "collectibleTableOffset": COLLECTIBLE_TABLE_OFFSET,
        "collectibleTableSize": COLLECTIBLE_TABLE_SIZE,
        "collectibleDataOffset": collectible_data_offset,
        "collectibleRecordSize": COLLECTIBLE_RECORD_SIZE,
        "collectibleCapacity": collectible_capacity,
        "collectibleCount": collectible_count,
        "activeCollectibleTypeCounts": {
            str(key): value for key, value in sorted(active_collectible_types.items())
        },
        "collectibleChunkIndex": collectible_chunk_index,
        "collectibles": collectibles,
        "embeddedTodOffset": EMBEDDED_TOD_OFFSET,
        "embeddedTodSize": len(embedded_tod),
        "embeddedTodSha256": hashlib.sha256(embedded_tod).hexdigest(),
        "embeddedTodRaw": embedded_tod.hex(),
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
        f"{result['collisionSurfaceCount']} collision surfaces, "
        f"{result['activeEventRecordCount']} active event records, and "
        f"{result['activeEncounterRecordCount']} active encounter records, and "
        f"{result['collectibleCount']} collectibles"
    )


if __name__ == "__main__":
    main()
