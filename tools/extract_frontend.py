#!/usr/bin/env python3
"""Extract the offset-table TIM and TMD assets used by Pepsiman's frontend."""

from argparse import ArgumentParser
import json
from pathlib import Path
import struct

from extract_stage_tmd import parse_tmd, render_texture_page, upload_tim
from extract_tim import decode_tim, u32, write_png


def offsets(data: bytes) -> list[int]:
    first = u32(data, 0)
    if first < 8 or first % 4 or first > len(data):
        raise ValueError("not an offset-table archive")
    values = list(struct.unpack_from(f"<{first // 4}I", data, 0))
    if values != sorted(values) or values[-1] >= len(data):
        raise ValueError("invalid frontend offsets")
    return values


def tim_offsets(data: bytes, start: int, end: int) -> list[int]:
    """Find structurally valid TIM uploads inside a frontend texture bank."""
    found = []
    cursor = start
    while cursor + 20 <= end:
        cursor = data.find(b"\x10\0\0\0", cursor, end)
        if cursor < 0:
            break
        try:
            flags = u32(data, cursor + 4)
            if flags & ~15 or flags & 7 > 3:
                raise ValueError
            block = cursor + 8
            for _ in range(2 if flags & 8 else 1):
                size = u32(data, block)
                x, y, width, height = struct.unpack_from("<4H", data, block + 4)
                if size != 12 + width * height * 2 or block + size > end or x + width > 1024 or y + height > 512:
                    raise ValueError
                block += size
            found.append(cursor)
            cursor = block
        except (ValueError, IndexError, struct.error):
            cursor += 4
    return found


def extract(source: Path, destination: Path) -> dict:
    data = source.read_bytes()
    starts = offsets(data)
    destination.mkdir(parents=True, exist_ok=True)
    vram = [0] * (1024 * 512)
    entries = []
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else len(data)
        magic = u32(data, start)
        kind = {0x10: "TIM", 0x41: "TMD", 0x250: "TOD"}.get(magic, f"0x{magic:08x}")
        entry = {"index": index, "offset": start, "size": end - start, "kind": kind}
        entries.append(entry)
        if magic == 0x10:
            uploads = tim_offsets(data, start, end)
            entry["textureUploads"] = len(uploads)
            for upload_index, upload in enumerate(uploads):
                width, height, rgba = decode_tim(data, upload)
                write_png(destination / f"{source.name}-{index:02d}-{upload_index:02d}.png", width, height, rgba)
                if upload_index == 0:
                    write_png(destination / f"{source.name}-{index:02d}.png", width, height, rgba)
                upload_tim(vram, data, upload)

    texture_directory = destination / "textures"
    texture_directory.mkdir(exist_ok=True)
    for entry in entries:
        if entry["kind"] != "TMD":
            continue
        start, size, index = entry["offset"], entry["size"], entry["index"]
        model, materials = parse_tmd(data[start : start + size], f"{source.name}-{index:02d}")
        (destination / f"{source.name}-{index:02d}.json").write_text(json.dumps(model, separators=(",", ":")) + "\n")
        entry["objects"] = len(model["objects"])
        entry["bounds"] = model["bounds"]
        for cba, tsb in materials:
            texture = texture_directory / f"{cba:04x}-{tsb:04x}.png"
            write_png(texture, 256, 256, render_texture_page(vram, cba, tsb))

    manifest = {"format": "Pepsiman frontend offset-table assets v1", "source": source.name, "entries": entries}
    (destination / f"{source.name}-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("destination", type=Path)
    parser.add_argument("sources", nargs="+", type=Path)
    args = parser.parse_args()
    for source in args.sources:
        manifest = extract(source, args.destination)
        print(f"{source}: {len(manifest['entries'])} frontend entries")


if __name__ == "__main__":
    main()
