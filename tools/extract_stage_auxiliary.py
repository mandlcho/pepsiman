#!/usr/bin/env python3
"""Losslessly extract the four proven sections of a retail stage's x007 file.

The gameplay meaning of these records is still being recovered from the retail
overlay.  This exporter therefore uses structural names and retains every byte
instead of assigning speculative camera, pickup, or event labels.
"""

from __future__ import annotations

from argparse import ArgumentParser
from collections import Counter
import hashlib
import json
from pathlib import Path
import struct


RECORDS_60_OFFSET = 0x0000
RECORDS_60_COUNT = 200
RECORDS_60_SIZE = 0x3C

RECORDS_92_OFFSET = 0x2EE0
RECORDS_92_COUNT = 200
RECORDS_92_SIZE = 0x5C

RECORDS_40_OFFSET = 0x76C0
RECORDS_40_COUNT = 100
RECORDS_40_SIZE = 0x28

TRAILING_OFFSET = 0x8660
TRAILING_SIZE = 0x800
FILE_SIZE = TRAILING_OFFSET + TRAILING_SIZE


def s32_words(record: bytes) -> list[int]:
    return list(struct.unpack(f"<{len(record) // 4}i", record))


def u32_words(record: bytes) -> list[int]:
    return list(struct.unpack(f"<{len(record) // 4}I", record))


def s16_words(record: bytes) -> list[int]:
    return list(struct.unpack(f"<{len(record) // 2}h", record))


def records(data: bytes, offset: int, count: int, size: int) -> list[bytes]:
    return [data[offset + index * size : offset + (index + 1) * size] for index in range(count)]


def extract(data: bytes, source_name: str = "CDDATA/2/2007") -> dict:
    if len(data) != FILE_SIZE:
        raise ValueError(f"unexpected x007 size: expected {FILE_SIZE} bytes, got {len(data)}")

    source_60 = records(data, RECORDS_60_OFFSET, RECORDS_60_COUNT, RECORDS_60_SIZE)
    source_92 = records(data, RECORDS_92_OFFSET, RECORDS_92_COUNT, RECORDS_92_SIZE)
    source_40 = records(data, RECORDS_40_OFFSET, RECORDS_40_COUNT, RECORDS_40_SIZE)
    trailing = data[TRAILING_OFFSET:]

    extracted_60 = []
    for index, record in enumerate(source_60):
        words = s32_words(record)
        position = words[0:3]
        duplicated_position = words[3:6]
        if position != duplicated_position:
            raise ValueError(f"60-byte record {index} does not repeat its first position")
        extracted_60.append({
            "id": index,
            "position": position,
            "duplicatedPosition": duplicated_position,
            "remainingS16": s16_words(record[0x18:]),
            "raw": record.hex(),
        })

    extracted_92 = []
    first_word_counts: Counter[int] = Counter()
    for index, record in enumerate(source_92):
        words = s32_words(record)
        first_word_counts[words[0]] += 1
        extracted_92.append({
            "id": index,
            "firstWord": words[0],
            "s32": words,
            "raw": record.hex(),
        })

    expected_first_words = {0: 79, 1: 5, 2: 16, 255: 100}
    if dict(sorted(first_word_counts.items())) != expected_first_words:
        raise ValueError(
            "unexpected 92-byte first-word distribution: "
            f"expected {expected_first_words}, got {dict(sorted(first_word_counts.items()))}"
        )

    extracted_40 = []
    for index, record in enumerate(source_40):
        words = s32_words(record)
        position = words[1:4]
        duplicated_position = words[4:7]
        if position != duplicated_position:
            raise ValueError(f"40-byte record {index} does not repeat its position")
        extracted_40.append({
            "id": index,
            "firstWord": words[0],
            "position": position,
            "duplicatedPosition": duplicated_position,
            "remainingS32": words[7:],
            "raw": record.hex(),
        })

    return {
        "format": "Pepsiman retail stage x007 structural export v1",
        "source": source_name,
        "sourceSize": len(data),
        "sourceSha256": hashlib.sha256(data).hexdigest(),
        "status": "Structure proven; gameplay roles intentionally unnamed pending overlay tracing.",
        "sections": {
            "records60": {
                "offset": RECORDS_60_OFFSET,
                "recordSize": RECORDS_60_SIZE,
                "count": RECORDS_60_COUNT,
                "records": extracted_60,
            },
            "records92": {
                "offset": RECORDS_92_OFFSET,
                "recordSize": RECORDS_92_SIZE,
                "count": RECORDS_92_COUNT,
                "firstWordCounts": {str(key): value for key, value in sorted(first_word_counts.items())},
                "records": extracted_92,
            },
            "records40": {
                "offset": RECORDS_40_OFFSET,
                "recordSize": RECORDS_40_SIZE,
                "count": RECORDS_40_COUNT,
                "records": extracted_40,
            },
            "trailing2048": {
                "offset": TRAILING_OFFSET,
                "size": TRAILING_SIZE,
                "u32": u32_words(trailing),
                "raw": trailing.hex(),
            },
        },
    }


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--source-name", default="CDDATA/2/2007")
    args = parser.parse_args()

    result = extract(args.source.read_bytes(), args.source_name)
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_text(json.dumps(result, separators=(",", ":")) + "\n")
    print(
        "Extracted x007 structure: "
        f"{RECORDS_60_COUNT}x{RECORDS_60_SIZE}, "
        f"{RECORDS_92_COUNT}x{RECORDS_92_SIZE}, "
        f"{RECORDS_40_COUNT}x{RECORDS_40_SIZE}, and {TRAILING_SIZE} trailing bytes"
    )


if __name__ == "__main__":
    main()
