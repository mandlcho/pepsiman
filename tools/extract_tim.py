#!/usr/bin/env python3
"""Extract PlayStation TIM texture packs used by Pepsiman into browser PNGs."""

from pathlib import Path
import argparse
import struct
import zlib


def u16(data: bytes, offset: int) -> int:
    return struct.unpack_from("<H", data, offset)[0]


def u32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]


def psx_color(value: int) -> tuple[int, int, int, int]:
    red = (value & 31) * 255 // 31
    green = ((value >> 5) & 31) * 255 // 31
    blue = ((value >> 10) & 31) * 255 // 31
    alpha = 0 if value == 0 else (128 if value & 0x8000 else 255)
    return red, green, blue, alpha


def chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))


def write_png(path: Path, width: int, height: int, rgba: bytes) -> None:
    scanlines = b"".join(b"\0" + rgba[row * width * 4 : (row + 1) * width * 4] for row in range(height))
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(scanlines, 9)) + chunk(b"IEND", b""))


def decode_tim(data: bytes, offset: int) -> tuple[int, int, bytes]:
    if u32(data, offset) != 0x10:
        raise ValueError("not a TIM image")
    flags = u32(data, offset + 4)
    mode = flags & 7
    has_clut = bool(flags & 8)
    cursor = offset + 8
    palette: list[tuple[int, int, int, int]] = []

    if has_clut:
        block_size = u32(data, cursor)
        colors = u16(data, cursor + 8) * u16(data, cursor + 10)
        palette = [psx_color(u16(data, cursor + 12 + index * 2)) for index in range(colors)]
        cursor += block_size

    block_size = u32(data, cursor)
    word_width = u16(data, cursor + 8)
    height = u16(data, cursor + 10)
    pixels = data[cursor + 12 : cursor + block_size]
    output = bytearray()

    if mode == 0:
        width = word_width * 4
        for byte in pixels[: width * height // 2]:
            for index in (byte & 15, byte >> 4):
                output.extend(palette[index] if index < len(palette) else (255, 0, 255, 255))
    elif mode == 1:
        width = word_width * 2
        for index in pixels[: width * height]:
            output.extend(palette[index] if index < len(palette) else (255, 0, 255, 255))
    elif mode == 2:
        width = word_width
        for index in range(width * height):
            output.extend(psx_color(u16(pixels, index * 2)))
    elif mode == 3:
        width = word_width * 2 // 3
        for index in range(width * height):
            blue, green, red = pixels[index * 3 : index * 3 + 3]
            output.extend((red, green, blue, 255))
    else:
        raise ValueError(f"unsupported TIM mode {mode}")

    return width, height, bytes(output[: width * height * 4])


def extract_pack(source: Path, destination: Path) -> int:
    data = source.read_bytes()
    if len(data) < 16 or data[8:12] != b"TIM\0":
        return 0
    first_offset = u32(data, 0)
    entry_count = first_offset // 16
    destination.mkdir(parents=True, exist_ok=True)
    extracted = 0
    for entry in range(entry_count):
        header = entry * 16
        offset = u32(data, header)
        asset_id = u16(data, header + 12)
        if data[header + 8 : header + 12] != b"TIM\0" or offset + 8 > len(data):
            continue
        try:
            width, height, rgba = decode_tim(data, offset)
            write_png(destination / f"{source.name}-{asset_id:03d}.png", width, height, rgba)
            extracted += 1
        except (ValueError, IndexError, struct.error):
            continue
    return extracted


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    total = 0
    sources = args.source.rglob("*") if args.source.is_dir() else [args.source]
    for source in sources:
        if source.is_file():
            count = extract_pack(source, args.destination / source.parent.name)
            if count:
                print(f"{source}: {count} textures")
                total += count
    print(f"Extracted {total} textures")
