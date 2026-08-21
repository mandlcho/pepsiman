#!/usr/bin/env python3
"""Extract the compact retail set-piece placement format used by CDDATA/4/4006."""

from __future__ import annotations

from argparse import ArgumentParser
from collections import Counter
import hashlib
import json
from pathlib import Path
import struct


ENTITY_OFFSET = 0
ENTITY_COUNT = 200
ENTITY_SIZE = 0x3C
EVENT_OFFSET = ENTITY_OFFSET + ENTITY_COUNT * ENTITY_SIZE
EVENT_COUNT = 200
EVENT_SIZE = 0x5C
ENCOUNTER_OFFSET = EVENT_OFFSET + EVENT_COUNT * EVENT_SIZE
ENCOUNTER_COUNT = 100
ENCOUNTER_SIZE = 0x28
COLLECTIBLE_OFFSET = ENCOUNTER_OFFSET + ENCOUNTER_COUNT * ENCOUNTER_SIZE
COLLECTIBLE_SIZE = 0x800
EXPECTED_SIZE = COLLECTIBLE_OFFSET + COLLECTIBLE_SIZE


def s16(data: bytes, offset: int) -> int:
    return struct.unpack_from("<h", data, offset)[0]


def s32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<i", data, offset)[0]


def browser_position(position: list[int]) -> list[int]:
    return [position[0], -position[1], -position[2]]


def extract(data: bytes, source_name: str = "CDDATA/4/4006") -> dict:
    if len(data) != EXPECTED_SIZE:
        raise ValueError(f"unexpected compact set-piece size {len(data)}; expected {EXPECTED_SIZE}")

    entities = []
    for index in range(ENTITY_COUNT):
        offset = ENTITY_OFFSET + index * ENTITY_SIZE
        record = data[offset : offset + ENTITY_SIZE]
        position = [s32(record, axis * 4) for axis in range(3)]
        duplicated = [s32(record, 0x0C + axis * 4) for axis in range(3)]
        if position != duplicated:
            raise ValueError(f"compact entity {index} does not repeat its position")
        current_model = s16(record, 0x36)
        if not -1 <= current_model < 30:
            raise ValueError(f"compact entity {index} has invalid model {current_model}")
        entities.append({
            "id": index,
            "active": current_model >= 0 and position != [0, 0, 0],
            "position": browser_position(position),
            "basePosition": browser_position(duplicated),
            "rotation": list(struct.unpack_from("<hhh", record, 0x18)),
            "baseRotation": list(struct.unpack_from("<hhh", record, 0x1E)),
            "field36": s32(record, 0x24),
            "field40": s32(record, 0x28),
            "scale": [s32(record, 0x2C) / 2048, s32(record, 0x30) / 2048],
            "definitionIndex": s16(record, 0x34),
            "currentModel": current_model,
            "field56": s16(record, 0x38),
            "field58": s16(record, 0x3A),
            "raw": record.hex(),
        })

    event_states: Counter[int] = Counter()
    events = []
    for index in range(EVENT_COUNT):
        offset = EVENT_OFFSET + index * EVENT_SIZE
        record = data[offset : offset + EVENT_SIZE]
        initial_state = record[0]
        event_states[initial_state] += 1
        center = [s32(record, 0x50), s32(record, 0x54), s32(record, 0x58)]
        vertices = []
        for x_offset, z_offset in ((0x04, 0x08), (0x0A, 0x0E), (0x10, 0x14), (0x16, 0x1A)):
            vertices.append([center[0] + s16(record, x_offset), -center[1], -(center[2] + s16(record, z_offset))])
        events.append({
            "id": index,
            "active": initial_state != 0xFF,
            "initialState": initial_state,
            "triggerCenter": browser_position(center),
            "triggerVertices": vertices,
            "s32": list(struct.unpack("<23i", record)),
            "raw": record.hex(),
        })
    if set(event_states) - {0, 0xFF}:
        raise ValueError(f"unexpected compact event states {dict(event_states)}")

    encounters = []
    for index in range(ENCOUNTER_COUNT):
        offset = ENCOUNTER_OFFSET + index * ENCOUNTER_SIZE
        record = data[offset : offset + ENCOUNTER_SIZE]
        render_model_id = s16(record, 0)
        position = [s32(record, 0x04), s32(record, 0x08), s32(record, 0x0C)]
        duplicated = [s32(record, 0x10), s32(record, 0x14), s32(record, 0x18)]
        if position != duplicated:
            raise ValueError(f"compact encounter {index} does not repeat its position")
        active = render_model_id >= 0 and position != [0, 0, 0]
        if active and not 30 <= render_model_id <= 37:
            raise ValueError(f"compact encounter {index} has unexpected retail asset {render_model_id}")
        encounters.append({
            "id": index,
            "active": active,
            "renderModelId": render_model_id,
            "spriteFrameId": render_model_id - 29 if active else None,
            "spriteTexture": f"assets/ripped/textures/4/4005-{render_model_id - 29:03d}.png" if active else None,
            "position": browser_position(position),
            "duplicatedPosition": browser_position(duplicated),
            "field28": s16(record, 0x1C),
            "field30": s16(record, 0x1E),
            "field32": s32(record, 0x20),
            "runtimeBytes36To39": list(record[0x24:0x28]),
            "raw": record.hex(),
        })

    collectible_data = data[COLLECTIBLE_OFFSET : COLLECTIBLE_OFFSET + COLLECTIBLE_SIZE]
    chunk_count, data_offset = struct.unpack_from("<II", collectible_data)
    if chunk_count != 25 or data_offset != 8 + chunk_count * 8:
        raise ValueError(f"unexpected compact collectible header {chunk_count}/{data_offset}")
    chunk_index = []
    indexed_records = []
    for chunk in range(chunk_count):
        start, count = struct.unpack_from("<II", collectible_data, 8 + chunk * 8)
        indexed_records.extend(range(start, start + count))
        chunk_index.append({"courseChunk": chunk, "start": start, "count": count})
    if indexed_records:
        raise ValueError("scene-2 compact collectible index is expected to be empty")
    if any(collectible_data[data_offset:]):
        raise ValueError("unused scene-2 compact collectible capacity is not zero-filled")

    return {
        "format": "Pepsiman compact retail set-piece placement v1",
        "source": source_name,
        "sourceSize": len(data),
        "sourceSha256": hashlib.sha256(data).hexdigest(),
        "coordinateConversion": "(x, y, z) -> (x, -y, -z)",
        "entityRecordOffset": ENTITY_OFFSET,
        "entityRecordSize": ENTITY_SIZE,
        "entityRecordCount": ENTITY_COUNT,
        "activeEntityCount": sum(entity["active"] for entity in entities),
        "entities": entities,
        "eventRecordOffset": EVENT_OFFSET,
        "eventRecordSize": EVENT_SIZE,
        "eventRecordCount": EVENT_COUNT,
        "activeEventRecordCount": sum(event["active"] for event in events),
        "eventInitialStateCounts": {str(key): value for key, value in sorted(event_states.items())},
        "eventRecords": events,
        "encounterRecordOffset": ENCOUNTER_OFFSET,
        "encounterRecordSize": ENCOUNTER_SIZE,
        "encounterRecordCount": ENCOUNTER_COUNT,
        "activeEncounterRecordCount": sum(encounter["active"] for encounter in encounters),
        "encounterRecords": encounters,
        "collectibleTableOffset": COLLECTIBLE_OFFSET,
        "collectibleTableSize": COLLECTIBLE_SIZE,
        "collectibleCourseChunkCount": chunk_count,
        "collectibleDataOffset": data_offset,
        "collectibleCount": 0,
        "collectibleChunkIndex": chunk_index,
        "collectibleRaw": collectible_data.hex(),
    }


if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--source-name", default="CDDATA/4/4006")
    args = parser.parse_args()
    result = extract(args.source.read_bytes(), args.source_name)
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_text(json.dumps(result, indent=2) + "\n")
