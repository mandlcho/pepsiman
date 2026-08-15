#!/usr/bin/env python3
"""Convert Pepsiman's original TMD mesh, VRAM texture, and TOD animation rig."""

from pathlib import Path
import argparse
import json
import math
import struct

from extract_tim import decode_tim, u16, u32, write_png, psx_color


def s16(data: bytes, offset: int) -> int:
    return struct.unpack_from("<h", data, offset)[0]


def s32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<i", data, offset)[0]


def load_vram(pack: bytes) -> list[int]:
    vram = [0] * (1024 * 512)
    first_offset = u32(pack, 0)
    for entry in range(first_offset // 16):
        header = entry * 16
        if pack[header + 8 : header + 12] != b"TIM\0":
            continue
        cursor = u32(pack, header)
        if u32(pack, cursor) != 0x10:
            continue
        flags = u32(pack, cursor + 4)
        cursor += 8
        if flags & 8:
            block_size = u32(pack, cursor)
            x, y, width, height = struct.unpack_from("<4H", pack, cursor + 4)
            for row in range(height):
                for column in range(width):
                    vram[(y + row) * 1024 + x + column] = u16(pack, cursor + 12 + (row * width + column) * 2)
            cursor += block_size
        block_size = u32(pack, cursor)
        x, y, width, height = struct.unpack_from("<4H", pack, cursor + 4)
        for row in range(height):
            for column in range(width):
                vram[(y + row) * 1024 + x + column] = u16(pack, cursor + 12 + (row * width + column) * 2)
    return vram


def render_page(vram: list[int], cba: int, tsb: int) -> bytes:
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
            else:
                color = psx_color(vram[(page_y + y) * 1024 + page_x + x])
            rgba.extend(color)
    return bytes(rgba)


def parse_tmd(pack: bytes) -> tuple[dict, tuple[int, int]]:
    tmd_offset = u32(pack, 0)
    if u32(pack, tmd_offset) != 0x41:
        raise ValueError("first packed model is not a TMD")
    flags = u32(pack, tmd_offset + 4)
    object_count = u32(pack, tmd_offset + 8)
    if flags != 0:
        raise ValueError("absolute-address TMDs are unsupported")
    base = tmd_offset + 12
    objects = []
    material_pair = None
    bounds_min = [math.inf, math.inf, math.inf]
    bounds_max = [-math.inf, -math.inf, -math.inf]

    for object_index in range(object_count):
        table = base + object_index * 28
        vert_offset, vert_count, _, _, primitive_offset, primitive_count, scale = struct.unpack_from("<7I", pack, table)
        vertices = [struct.unpack_from("<3h", pack, base + vert_offset + index * 8) for index in range(vert_count)]
        positions: list[float] = []
        normals: list[float] = []
        uvs: list[float] = []
        cursor = base + primitive_offset

        def push(vertex_index: int, normal_index: int, u: int, v: int) -> None:
            x, y, z = vertices[vertex_index]
            positions.extend((x, -y, -z))
            for axis, value in enumerate((x, -y, -z)):
                bounds_min[axis] = min(bounds_min[axis], value)
                bounds_max[axis] = max(bounds_max[axis], value)
            # Original vertex normals are less useful after segment transforms; web recalculates flat normals.
            normals.extend((0, 0, 0))
            uvs.extend((u / 255, 1 - v / 255))

        for _ in range(primitive_count):
            _, ilen, flag, mode = pack[cursor : cursor + 4]
            packet = cursor + 4
            if flag == 0 and mode in (0x34, 0x3C):
                quad = mode == 0x3C
                uv_values = []
                cba = tsb = 0
                uv_count = 4 if quad else 3
                for uv_index in range(uv_count):
                    u, v = pack[packet + uv_index * 4 : packet + uv_index * 4 + 2]
                    extra = u16(pack, packet + uv_index * 4 + 2)
                    if uv_index == 0:
                        cba = extra
                    elif uv_index == 1:
                        tsb = extra
                    uv_values.append((u, v))
                material_pair = material_pair or (cba, tsb)
                index_cursor = packet + uv_count * 4
                pairs = [struct.unpack_from("<2H", pack, index_cursor + index * 4) for index in range(uv_count)]
                triangles = ((0, 1, 2), (1, 3, 2)) if quad else ((0, 1, 2),)
                for triangle in triangles:
                    for corner in triangle:
                        normal_index, vertex_index = pairs[corner]
                        push(vertex_index, normal_index, *uv_values[corner])
            cursor += 4 + ilen * 4
        objects.append({"id": object_index + 1, "positions": positions, "uvs": uvs, "scale": scale})

    if material_pair is None:
        raise ValueError("character model has no textured material")
    return {
        "format": "Pepsiman TMD web mesh v1",
        "objects": objects,
        "bounds": {"min": bounds_min, "max": bounds_max},
    }, material_pair


def parse_tod(data: bytes, offset: int, clip_id: int) -> dict:
    if data[offset] != 0x50:
        raise ValueError("invalid TOD")
    version = data[offset + 1]
    resolution = u16(data, offset + 2)
    frame_count = u32(data, offset + 4)
    cursor = offset + 8
    objects: dict[int, dict] = {}

    def animation_object(object_id: int) -> dict:
        return objects.setdefault(object_id, {"id": object_id, "tmdId": None, "parentId": None, "frames": []})

    for _ in range(frame_count):
        frame_start = cursor
        frame_length = u16(data, cursor) * 4
        packet_count = u16(data, cursor + 2)
        frame_number = u32(data, cursor + 4)
        cursor += 8
        for _ in range(packet_count):
            packet_start = cursor
            object_id = u16(data, cursor)
            type_and_flag = data[cursor + 2]
            packet_type = type_and_flag & 15
            flag = type_and_flag >> 4
            packet_length = data[cursor + 3] * 4
            cursor += 4
            obj = animation_object(object_id)
            if packet_type == 1:
                frame = {"time": frame_number, "absolute": (flag & 1) == 0}
                if flag & 2:
                    frame["rotation"] = [s32(data, cursor + axis * 4) / 4096 * math.pi / 180 for axis in range(3)]
                    cursor += 12
                if flag & 4:
                    frame["scale"] = [s16(data, cursor + axis * 2) / 4096 for axis in range(3)]
                    cursor += 8
                if flag & 8:
                    frame["translation"] = [s32(data, cursor + axis * 4) for axis in range(3)]
                    cursor += 12
                obj["frames"].append(frame)
            elif packet_type == 2:
                obj["tmdId"] = u16(data, cursor)
            elif packet_type == 3:
                parent = u16(data, cursor)
                obj["parentId"] = None if parent == 0xFFFF else parent
            elif packet_type == 4:
                matrix = [s16(data, cursor + axis * 2) / 4096 for axis in range(9)]
                translation = [s32(data, cursor + 20 + axis * 4) for axis in range(3)]
                obj["frames"].append({"time": frame_number, "matrix": matrix, "translation": translation})
            cursor = packet_start + packet_length
        cursor = frame_start + frame_length

    return {
        "id": clip_id,
        "version": version,
        "fps": 60 / resolution if resolution else 60,
        "frameCount": frame_count,
        "objects": [objects[key] for key in sorted(objects)],
    }


def parse_animation_pack(pack: bytes) -> list[dict]:
    first_offset = u32(pack, 0)
    clips = []
    for entry in range(first_offset // 16):
        header = entry * 16
        if pack[header + 8 : header + 12] != b"TOD\0":
            continue
        clip_id = u16(pack, header + 12)
        try:
            clips.append(parse_tod(pack, u32(pack, header), clip_id))
        except (IndexError, struct.error, ValueError):
            # A small tail section uses the game's own compressed TOD packet
            # extension. Keep the standard clips—including the complete run,
            # jump, slide, stumble, and idle sets—and report skipped IDs.
            print(f"Skipped compressed TOD clip {clip_id}")
    return clips


def parse_compressed_animation_pack(pack: bytes) -> list[dict]:
    """Decode Pepsiman's compact TOD joint stream.

    The game keeps standard TOD framing, but encodes joint IDs in the low 12
    bits of a 16-bit marker and stores Euler components as signed 12-bit-angle
    shorts. Missing components inherit from the previous frame.
    """
    first_offset = u32(pack, 0)
    clips = []
    for entry in range(1, first_offset // 16):
        header = entry * 16
        if pack[header + 8 : header + 12] != b"TOD\0":
            continue
        offset = u32(pack, header)
        clip_id = u16(pack, header + 12)
        resolution = u16(pack, offset + 2)
        frame_count = u32(pack, offset + 4)
        cursor = offset + 8
        tracks = {joint: [] for joint in range(1, 17)}
        previous = {joint: [0.0, 0.0, 0.0] for joint in range(1, 17)}
        decoded_frames = 0
        for _ in range(frame_count):
            if cursor + 8 > len(pack):
                break
            frame_start = cursor
            frame_length = u16(pack, cursor) * 4
            frame_number = u32(pack, cursor + 4)
            frame_end = min(frame_start + frame_length, len(pack))
            payload_start = cursor + 8
            markers = []
            search = payload_start
            for expected in range(1, 17):
                found = None
                while search + 2 <= frame_end:
                    value = u16(pack, search)
                    if (value & 0x0FFF) == expected and (value & 0xF000) >= 0x8000:
                        found = search
                        break
                    search += 2
                if found is None:
                    break
                markers.append((expected, found))
                search = found + 2
            if len(markers) >= 12:
                decoded_frames += 1
                for marker_index, (joint, position) in enumerate(markers):
                    record_end = markers[marker_index + 1][1] if marker_index + 1 < len(markers) else frame_end
                    values = [s16(pack, point) for point in range(position + 2, record_end, 2)]
                    rotation = previous[joint][:]
                    for axis, value in enumerate(values[:3]):
                        rotation[axis] = value / 4096 * math.tau
                    previous[joint] = rotation
                    tracks[joint].append({"time": frame_number, "rotation": rotation})
            cursor = frame_end
        if decoded_frames:
            clips.append({
                "id": clip_id,
                "fps": 60 / resolution if resolution else 60,
                "frameCount": frame_count,
                "decodedFrames": decoded_frames,
                "objects": [{"id": joint, "frames": tracks[joint]} for joint in tracks if tracks[joint]],
            })
    return clips


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("model_pack", type=Path)
    parser.add_argument("texture_pack", type=Path)
    parser.add_argument("animation_pack", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    args.destination.mkdir(parents=True, exist_ok=True)

    model, (cba, tsb) = parse_tmd(args.model_pack.read_bytes())
    (args.destination / "model.json").write_text(json.dumps(model, separators=(",", ":")))
    vram = load_vram(args.texture_pack.read_bytes())
    write_png(args.destination / "texture.png", 256, 256, render_page(vram, cba, tsb))
    animation_pack = args.animation_pack.read_bytes()
    setup_clip = parse_animation_pack(animation_pack)[0]
    clips = parse_compressed_animation_pack(animation_pack)
    animation_data = {"format": "Pepsiman TOD rig v2", "setup": setup_clip, "clips": clips}
    (args.destination / "animations.json").write_text(json.dumps(animation_data, separators=(",", ":")))
    print(f"Exported {len(model['objects'])} model segments and {len(clips)} compressed animation clips")
