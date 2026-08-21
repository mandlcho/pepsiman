#!/usr/bin/env python3
"""Extract the embedded TIM sequence from Pepsiman's global PIC archive."""

from __future__ import annotations

from argparse import ArgumentParser
import hashlib
import json
from pathlib import Path
import struct

from extract_tim import decode_tim, write_png


def u32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]


def tim_end(data: bytes, offset: int) -> int:
    if u32(data, offset) != 0x10:
        raise ValueError(f"expected TIM at {offset:#x}")
    flags = u32(data, offset + 4)
    cursor = offset + 8
    if flags & 8:
        cursor += u32(data, cursor)
    cursor += u32(data, cursor)
    if cursor > len(data):
        raise ValueError(f"TIM at {offset:#x} exceeds archive size")
    return cursor


def extract(source: Path, destination: Path) -> dict:
    data = source.read_bytes()
    if len(data) < 16 or data[8:12] != b"PIC\0":
        raise ValueError(f"{source} is not a PIC archive")
    first_offset = u32(data, 0)
    if first_offset != 16:
        raise ValueError(f"unexpected PIC payload offset {first_offset:#x}")

    destination.mkdir(parents=True, exist_ok=True)
    entries = []
    offset = first_offset
    while offset < len(data):
        if len(data) - offset <= 16 and not any(data[offset:]):
            break
        width, height, rgba = decode_tim(data, offset)
        filename = f"global-{len(entries):03d}.png"
        write_png(destination / filename, width, height, rgba)
        entries.append({
            "picIndex": len(entries),
            "sourceOffset": offset,
            "width": width,
            "height": height,
            "file": filename,
            "retailAssetId": None,
        })
        offset = tim_end(data, offset)

    trailing_padding = len(data) - offset
    if trailing_padding > 16 or any(data[offset:]):
        raise ValueError(f"PIC chain ended at {offset:#x}, expected {len(data):#x}")
    return {
        "format": "Pepsiman global PIC web export v1",
        "source": f"CDDATA/{source.parent.name}/{source.name}",
        "sourceSize": len(data),
        "sourceSha256": hashlib.sha256(data).hexdigest(),
        "provenance": "sequential TIM payload beginning at the PIC header's first offset",
        "retailAssetMapping": "unassigned",
        "trailingPaddingBytes": trailing_padding,
        "entryCount": len(entries),
        "entries": entries,
    }


if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    manifest = extract(args.source, args.destination)
    (args.destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Extracted {manifest['entryCount']} PIC images to {args.destination}")
