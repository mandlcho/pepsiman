#!/usr/bin/env python3
"""Classify Pepsiman retail-disc files without modifying the extracted disc."""

from __future__ import annotations

from argparse import ArgumentParser
from collections import Counter
from dataclasses import asdict, dataclass
import json
from pathlib import Path
import struct


KNOWN_ARCHIVE_TAGS = {"PIC", "SEQ", "TIM", "TMD", "TOD", "VB", "VH"}


def u32(data: bytes, offset: int = 0) -> int:
    return struct.unpack_from("<I", data, offset)[0]


@dataclass
class DiscFile:
    path: str
    size: int
    kind: str
    entries: int = 0
    tags: dict[str, int] | None = None


def archive_tags(data: bytes) -> list[str] | None:
    if len(data) < 16:
        return None
    table_size = u32(data)
    if table_size == 0 or table_size % 16 or table_size > len(data):
        return None
    count = table_size // 16
    if count > 4096:
        return None
    tags = []
    previous_offset = table_size
    for index in range(count):
        header = index * 16
        offset, size = struct.unpack_from("<II", data, header)
        tag = data[header + 8 : header + 12].rstrip(b"\0").decode("ascii", "replace")
        if tag not in KNOWN_ARCHIVE_TAGS:
            return None
        if offset < table_size or offset < previous_offset or offset + size > len(data):
            return None
        previous_offset = offset
        tags.append(tag)
    return tags


def classify(path: Path, root: Path) -> DiscFile:
    data = path.read_bytes()
    relative = path.relative_to(root).as_posix()
    family = path.parent.name
    if path.name == f"{family}000" and family in "23456789ABCDEF" and len(data) >= 4:
        load_address = 0x800F0000
        pointers = sum(
            load_address <= u32(data, offset) < load_address + len(data)
            for offset in range(0, len(data) - 3, 4)
        )
        return DiscFile(
            relative,
            len(data),
            f"relocated MIPS scene overlay at {load_address:#010x}",
            pointers,
            {"internal pointers": pointers},
        )
    tags = archive_tags(data)
    if tags:
        counts = dict(sorted(Counter(tags).items()))
        return DiscFile(relative, len(data), "tagged archive", len(tags), counts)
    if len(data) >= 4 and u32(data) == 0x41:
        objects = u32(data, 8) if len(data) >= 12 else 0
        return DiscFile(relative, len(data), "direct TMD", objects, {"TMD objects": objects})
    if len(data) >= 4 and 0x80000000 <= u32(data) <= 0x801FFFFF:
        return DiscFile(relative, len(data), "runtime pointer/data table")
    if data.startswith(b"PS-X EXE"):
        return DiscFile(relative, len(data), "PlayStation executable")
    if path.name == "SYSTEM.CNF":
        return DiscFile(relative, len(data), "PlayStation boot config")
    embedded_tmd = data.find(struct.pack("<I", 0x41), 4, min(len(data), 256))
    if embedded_tmd >= 0 and embedded_tmd + 12 <= len(data):
        return DiscFile(
            relative,
            len(data),
            f"container with TMD at 0x{embedded_tmd:x}",
            u32(data, embedded_tmd + 8),
        )
    return DiscFile(relative, len(data), "unclassified")


def inventory(root: Path) -> list[DiscFile]:
    return [classify(path, root) for path in sorted(root.rglob("*")) if path.is_file()]


def print_markdown(items: list[DiscFile]) -> None:
    print("| File | Bytes | Classification | Entries | Tags |")
    print("|---|---:|---|---:|---|")
    for item in items:
        tags = ", ".join(f"{key}×{value}" for key, value in (item.tags or {}).items())
        print(f"| `{item.path}` | {item.size} | {item.kind} | {item.entries or ''} | {tags} |")


if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("disc_root", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    files = inventory(args.disc_root)
    if args.json:
        print(json.dumps([asdict(item) for item in files], indent=2))
    else:
        print_markdown(files)
