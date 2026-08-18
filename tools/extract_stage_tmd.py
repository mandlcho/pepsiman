#!/usr/bin/env python3
"""Convert a Pepsiman stage TMD and its TIM packs to browser-ready assets."""

from __future__ import annotations

from argparse import ArgumentParser
from collections import defaultdict
import json
import math
from pathlib import Path
import struct

from extract_tim import psx_color, u16, u32, write_png


def upload_tim_pack(vram: list[int], path: Path) -> None:
    data = path.read_bytes()
    if len(data) < 16:
        raise ValueError(f"{path} is not a TIM archive")
    entry_count = u32(data, 0) // 16
    for entry in range(entry_count):
        header = entry * 16
        if data[header + 8 : header + 12] != b"TIM\0":
            continue
        cursor = u32(data, header)
        if cursor + 8 > len(data) or u32(data, cursor) != 0x10:
            continue
        flags = u32(data, cursor + 4)
        cursor += 8
        blocks = 2 if flags & 8 else 1
        for _ in range(blocks):
            size = u32(data, cursor)
            x, y, width, height = struct.unpack_from("<4H", data, cursor + 4)
            pixels = data[cursor + 12 : cursor + size]
            for row in range(height):
                start = row * width * 2
                for column in range(width):
                    target = (y + row) * 1024 + x + column
                    if 0 <= target < len(vram):
                        vram[target] = u16(pixels, start + column * 2)
            cursor += size


def render_texture_page(vram: list[int], cba: int, tsb: int) -> bytes:
    clut_x = (cba & 0x3F) * 16
    clut_y = (cba >> 6) & 0x1FF
    page_x = (tsb & 0x0F) * 64
    page_y = ((tsb >> 4) & 1) * 256
    mode = (tsb >> 7) & 3
    palette_size = 16 if mode == 0 else 256
    palette = [psx_color(vram[clut_y * 1024 + clut_x + index]) for index in range(palette_size)]
    rgba = bytearray()
    for y in range(256):
        for x in range(256):
            if mode == 0:
                word = vram[(page_y + y) * 1024 + page_x + x // 4]
                color = palette[(word >> ((x & 3) * 4)) & 15]
            elif mode == 1:
                word = vram[(page_y + y) * 1024 + page_x + x // 2]
                color = palette[(word >> ((x & 1) * 8)) & 255]
            elif mode == 2:
                color = psx_color(vram[(page_y + y) * 1024 + page_x + x])
            else:
                raise ValueError(f"unsupported 24-bit texture page {tsb:#x}")
            rgba.extend(color)
    return bytes(rgba)


def find_tmd(data: bytes) -> int:
    signature = struct.pack("<I", 0x41)
    for offset in range(0, min(len(data), 256), 4):
        if data[offset : offset + 4] == signature:
            return offset
    raise ValueError("no TMD header in the first 256 bytes")


def packet_layout(mode: int) -> tuple[int, bool, bool]:
    polygon = mode & 0x3C
    layouts = {
        0x20: (3, False, False),
        0x24: (3, True, False),
        0x28: (4, False, False),
        0x2C: (4, True, False),
        0x30: (3, False, True),
        0x34: (3, True, True),
        0x38: (4, False, True),
        0x3C: (4, True, True),
    }
    if polygon not in layouts:
        raise ValueError(f"unsupported TMD primitive mode {mode:#x}")
    return layouts[polygon]


def parse_tmd(data: bytes, source_name: str) -> tuple[dict, set[tuple[int, int]]]:
    tmd_offset = find_tmd(data)
    flags = u32(data, tmd_offset + 4)
    if flags != 0:
        raise ValueError("absolute-address TMDs are unsupported")
    object_count = u32(data, tmd_offset + 8)
    base = tmd_offset + 12
    objects = []
    materials: set[tuple[int, int]] = set()
    bounds_min = [math.inf, math.inf, math.inf]
    bounds_max = [-math.inf, -math.inf, -math.inf]

    for object_index in range(object_count):
        table = base + object_index * 28
        vertex_offset, vertex_count, _, _, primitive_offset, primitive_count, scale = struct.unpack_from(
            "<7I", data, table
        )
        vertices = [struct.unpack_from("<3h", data, base + vertex_offset + index * 8) for index in range(vertex_count)]
        groups: dict[str, dict[str, list]] = defaultdict(lambda: {"positions": [], "uvs": [], "colors": []})
        object_min = [math.inf, math.inf, math.inf]
        object_max = [-math.inf, -math.inf, -math.inf]
        cursor = base + primitive_offset

        for _ in range(primitive_count):
            _, input_words, flag, mode = data[cursor : cursor + 4]
            packet = cursor + 4
            vertex_total, textured, gouraud = packet_layout(mode)
            if flag & 1 == 0:
                raise ValueError(f"lit primitive {mode:#x} is not yet supported")

            uv_values: list[tuple[int, int]] = []
            cba = tsb = 0
            if textured:
                for corner in range(vertex_total):
                    u, v, extra = struct.unpack_from("<BBH", data, packet + corner * 4)
                    uv_values.append((u, v))
                    if corner == 0:
                        cba = extra
                    elif corner == 1:
                        tsb = extra
                material = f"tex-{cba:04x}-{tsb:04x}"
                materials.add((cba, tsb))
                color_cursor = packet + vertex_total * 4
            else:
                material = "vertex-color"
                color_cursor = packet

            color_total = vertex_total if gouraud else 1
            colors = []
            for color_index in range(color_total):
                red, green, blue = data[color_cursor + color_index * 4 : color_cursor + color_index * 4 + 3]
                colors.append((red / 255, green / 255, blue / 255))
            index_cursor = color_cursor + color_total * 4
            indices = [u16(data, index_cursor + corner * 2) for corner in range(vertex_total)]
            triangles = ((0, 1, 2), (1, 3, 2)) if vertex_total == 4 else ((0, 1, 2),)
            group = groups[material]
            for triangle in triangles:
                for corner in triangle:
                    x, y, z = vertices[indices[corner]]
                    converted = (x, -y, -z)
                    group["positions"].extend(converted)
                    group["colors"].extend(colors[corner if gouraud else 0])
                    if textured:
                        u, v = uv_values[corner]
                        group["uvs"].extend((u / 255, 1 - v / 255))
                    for axis, value in enumerate(converted):
                        object_min[axis] = min(object_min[axis], value)
                        object_max[axis] = max(object_max[axis], value)
                        bounds_min[axis] = min(bounds_min[axis], value)
                        bounds_max[axis] = max(bounds_max[axis], value)
            cursor += 4 + input_words * 4

        objects.append({
            "id": object_index,
            "scale": scale,
            "bounds": {"min": object_min, "max": object_max},
            "groups": [{"material": key, **value} for key, value in sorted(groups.items())],
        })

    return ({
        "format": "Pepsiman stage TMD web mesh v1",
        "source": source_name,
        "tmdOffset": tmd_offset,
        "objects": objects,
        "bounds": {"min": bounds_min, "max": bounds_max},
    }, materials)


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("tmd", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--tim", type=Path, action="append", default=[])
    args = parser.parse_args()

    model, materials = parse_tmd(args.tmd.read_bytes(), args.tmd.name)
    args.destination.mkdir(parents=True, exist_ok=True)
    texture_directory = args.destination / "textures"
    texture_directory.mkdir(exist_ok=True)
    vram = [0] * (1024 * 512)
    for tim_pack in args.tim:
        upload_tim_pack(vram, tim_pack)
    for cba, tsb in sorted(materials):
        write_png(texture_directory / f"{cba:04x}-{tsb:04x}.png", 256, 256, render_texture_page(vram, cba, tsb))
    (args.destination / f"{args.tmd.name}.json").write_text(json.dumps(model, separators=(",", ":")) + "\n")
    print(f"Extracted {len(model['objects'])} objects and {len(materials)} texture palettes from {args.tmd}")


if __name__ == "__main__":
    main()
