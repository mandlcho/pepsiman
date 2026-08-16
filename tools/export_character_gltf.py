#!/usr/bin/env python3
"""Export the recovered Pepsiman rigid-segment skeleton as skinned glTF 2.0."""

from pathlib import Path
import argparse
import json
import math
import shutil
import struct


TRANSLATION_SCALE = 1 / 5
ROOT_BASIS_X = math.radians(-103)
JOINT_NAMES = {
    1001: "root", 1: "pelvis", 2: "spine", 3: "shoulder.R", 4: "elbow.R", 5: "hand.R",
    6: "shoulder.L", 7: "elbow.L", 8: "hand.L", 9: "neck", 10: "head",
    11: "hip.R", 12: "knee.R", 13: "foot.R", 14: "hip.L", 15: "knee.L", 16: "foot.L",
}


def multiply(left, right):
    return [[sum(left[row][inner] * right[inner][column] for inner in range(4))
             for column in range(4)] for row in range(4)]


def rotation_matrix(rotation, remove_root_basis=False):
    source_x, source_y, source_z = rotation
    x = source_x - ROOT_BASIS_X if remove_root_basis else source_x
    y, z = -source_y, -source_z
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    rx = [[1, 0, 0, 0], [0, cx, -sx, 0], [0, sx, cx, 0], [0, 0, 0, 1]]
    ry = [[cy, 0, sy, 0], [0, 1, 0, 0], [-sy, 0, cy, 0], [0, 0, 0, 1]]
    rz = [[cz, -sz, 0, 0], [sz, cz, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
    return multiply(multiply(rx, ry), rz)


def local_matrix(frame, remove_root_basis=False):
    result = rotation_matrix(frame.get("rotation", [0, 0, 0]), remove_root_basis)
    translation = frame.get("translation", [0, 0, 0])
    result[0][3] = translation[0] * TRANSLATION_SCALE
    result[1][3] = -translation[1] * TRANSLATION_SCALE
    result[2][3] = -translation[2] * TRANSLATION_SCALE
    return result


def rigid_inverse(matrix):
    result = [[matrix[column][row] if row < 3 and column < 3 else 0 for column in range(4)] for row in range(4)]
    result[3] = [0, 0, 0, 1]
    for row in range(3):
        result[row][3] = -sum(result[row][column] * matrix[column][3] for column in range(3))
    return result


def transform_point(matrix, point):
    return [sum(matrix[row][column] * point[column] for column in range(3)) + matrix[row][3] for row in range(3)]


def transform_direction(matrix, direction):
    return [sum(matrix[row][column] * direction[column] for column in range(3)) for row in range(3)]


def normalize(vector):
    length = math.sqrt(sum(value * value for value in vector)) or 1
    return [value / length for value in vector]


def cross(left, right):
    return [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]]


def quaternion_from_matrix(matrix):
    m00, m11, m22 = matrix[0][0], matrix[1][1], matrix[2][2]
    trace = m00 + m11 + m22
    if trace > 0:
        s = math.sqrt(trace + 1) * 2
        quaternion = [(matrix[2][1] - matrix[1][2]) / s, (matrix[0][2] - matrix[2][0]) / s, (matrix[1][0] - matrix[0][1]) / s, s / 4]
    elif m00 > m11 and m00 > m22:
        s = math.sqrt(1 + m00 - m11 - m22) * 2
        quaternion = [s / 4, (matrix[0][1] + matrix[1][0]) / s, (matrix[0][2] + matrix[2][0]) / s, (matrix[2][1] - matrix[1][2]) / s]
    elif m11 > m22:
        s = math.sqrt(1 + m11 - m00 - m22) * 2
        quaternion = [(matrix[0][1] + matrix[1][0]) / s, s / 4, (matrix[1][2] + matrix[2][1]) / s, (matrix[0][2] - matrix[2][0]) / s]
    else:
        s = math.sqrt(1 + m22 - m00 - m11) * 2
        quaternion = [(matrix[0][2] + matrix[2][0]) / s, (matrix[1][2] + matrix[2][1]) / s, s / 4, (matrix[1][0] - matrix[0][1]) / s]
    return normalize(quaternion)


def matrix_column_major(matrix):
    return [matrix[row][column] for column in range(4) for row in range(4)]


class BufferBuilder:
    def __init__(self):
        self.data = bytearray()
        self.views = []
        self.accessors = []

    def add(self, values, component_type, kind, target=None, minimum=None, maximum=None):
        while len(self.data) % 4:
            self.data.append(0)
        offset = len(self.data)
        formats = {5126: "f", 5123: "H", 5125: "I"}
        flat = [component for value in values for component in (value if isinstance(value, (list, tuple)) else [value])]
        self.data.extend(struct.pack("<" + formats[component_type] * len(flat), *flat))
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(self.data) - offset}
        if target:
            view["target"] = target
        view_index = len(self.views)
        self.views.append(view)
        accessor = {"bufferView": view_index, "componentType": component_type, "count": len(values), "type": kind}
        if minimum is not None:
            accessor["min"] = minimum
        if maximum is not None:
            accessor["max"] = maximum
        self.accessors.append(accessor)
        return len(self.accessors) - 1


def export(model_path: Path, animations_path: Path, names_path: Path | None, output_path: Path, only_clip: int | None):
    model = json.loads(model_path.read_text())
    animations = json.loads(animations_path.read_text())
    names = json.loads(names_path.read_text()) if names_path and names_path.exists() else {}
    setup = {item["id"]: item for item in animations["setup"]["objects"]}
    joint_ids = [1001, *range(1, 17)]
    joint_index = {joint: index for index, joint in enumerate(joint_ids)}
    world = {1001: [[1,0,0,0], [0,1,0,0], [0,0,1,0], [0,0,0,1]]}
    local = {1001: world[1001]}
    for joint in range(1, 17):
        local[joint] = local_matrix(setup[joint]["frames"][0])
        world[joint] = multiply(world[setup[joint]["parentId"]], local[joint])

    positions, normals, uvs, joints, weights, indices = [], [], [], [], [], []
    for part in model["objects"][:16]:
        part_positions = [part["positions"][offset:offset + 3] for offset in range(0, len(part["positions"]), 3)]
        for triangle_start in range(0, len(part_positions), 3):
            triangle = [transform_point(world[part["id"]], point) for point in part_positions[triangle_start:triangle_start + 3]]
            edge_a = [triangle[1][axis] - triangle[0][axis] for axis in range(3)]
            edge_b = [triangle[2][axis] - triangle[0][axis] for axis in range(3)]
            normal = normalize(cross(edge_a, edge_b))
            for corner in range(3):
                positions.append(triangle[corner])
                normals.append(normal)
                uv_offset = (triangle_start + corner) * 2
                uvs.append(part["uvs"][uv_offset:uv_offset + 2])
                joints.append([joint_index[part["id"]], 0, 0, 0])
                weights.append([1, 0, 0, 0])
                indices.append(len(indices))

    buffer = BufferBuilder()
    position_accessor = buffer.add(positions, 5126, "VEC3", 34962, [min(row[i] for row in positions) for i in range(3)], [max(row[i] for row in positions) for i in range(3)])
    normal_accessor = buffer.add(normals, 5126, "VEC3", 34962)
    uv_accessor = buffer.add(uvs, 5126, "VEC2", 34962)
    joint_accessor = buffer.add(joints, 5123, "VEC4", 34962)
    weight_accessor = buffer.add(weights, 5126, "VEC4", 34962)
    index_accessor = buffer.add(indices, 5125, "SCALAR", 34963, [0], [len(indices) - 1])
    inverse_bind_accessor = buffer.add([matrix_column_major(rigid_inverse(world[joint])) for joint in joint_ids], 5126, "MAT4")

    nodes = [{"name": "Pepsiman_Mesh", "mesh": 0, "skin": 0}]
    node_for_joint = {}
    for joint in joint_ids:
        matrix_value = local[joint]
        node = {
            "name": JOINT_NAMES[joint],
            "translation": [matrix_value[0][3], matrix_value[1][3], matrix_value[2][3]],
            "rotation": quaternion_from_matrix(matrix_value),
        }
        node_for_joint[joint] = len(nodes)
        nodes.append(node)
    for joint in joint_ids:
        children = [child for child in joint_ids if setup.get(child, {}).get("parentId") == joint]
        if children:
            nodes[node_for_joint[joint]]["children"] = [node_for_joint[child] for child in children]

    exported_animations = []
    clips = [clip for clip in animations["clips"] if only_clip is None or clip["id"] == only_clip]
    if only_clip is not None and not clips:
        raise ValueError(f"clip {only_clip} not found")
    for clip in clips:
        samplers, channels = [], []
        times = [frame["time"] / clip["fps"] for frame in clip["objects"][0]["frames"]]
        time_accessor = buffer.add(times, 5126, "SCALAR", minimum=[min(times)], maximum=[max(times)])

        pelvis_translations, pelvis_rotations = [], []
        for frame in clip["objects"][0]["frames"]:
            pelvis_matrix = local_matrix(frame, remove_root_basis=True)
            pelvis_translations.append([pelvis_matrix[0][3], pelvis_matrix[1][3], pelvis_matrix[2][3]])
            pelvis_rotations.append(quaternion_from_matrix(pelvis_matrix))
        for path, values in (("translation", pelvis_translations), ("rotation", pelvis_rotations)):
            output_accessor = buffer.add(values, 5126, "VEC3" if path == "translation" else "VEC4")
            samplers.append({"input": time_accessor, "output": output_accessor, "interpolation": "LINEAR"})
            channels.append({"sampler": len(samplers) - 1, "target": {"node": node_for_joint[1], "path": path}})

        for joint in range(2, 17):
            rotations = [quaternion_from_matrix(rotation_matrix(frame["rotation"])) for frame in clip["objects"][joint - 1]["frames"]]
            output_accessor = buffer.add(rotations, 5126, "VEC4")
            samplers.append({"input": time_accessor, "output": output_accessor, "interpolation": "LINEAR"})
            channels.append({"sampler": len(samplers) - 1, "target": {"node": node_for_joint[joint], "path": "rotation"}})
        entry = names.get(str(clip["id"]), clip)
        clip_name = entry.get("name", f"motion_{clip['id']:02d}")
        exported_animations.append({"name": clip_name, "extras": {"sourceClipId": clip["id"], "nameProvenance": entry.get("provenance", "numeric-retail-id")}, "samplers": samplers, "channels": channels})

    output_path.parent.mkdir(parents=True, exist_ok=True)
    binary_name = output_path.with_suffix(".bin").name
    texture_name = "texture.png"
    document = {
        "asset": {"version": "2.0", "generator": "Pepsiman native rig exporter"},
        "scene": 0,
        "scenes": [{"name": "Pepsiman", "nodes": [0, node_for_joint[1001]]}],
        "nodes": nodes,
        "meshes": [{"name": "Pepsiman_Original_TMD", "primitives": [{"attributes": {"POSITION": position_accessor, "NORMAL": normal_accessor, "TEXCOORD_0": uv_accessor, "JOINTS_0": joint_accessor, "WEIGHTS_0": weight_accessor}, "indices": index_accessor, "material": 0}]}],
        "skins": [{"name": "Pepsiman_Rig", "inverseBindMatrices": inverse_bind_accessor, "skeleton": node_for_joint[1001], "joints": [node_for_joint[joint] for joint in joint_ids]}],
        "materials": [{"name": "Pepsiman_Texture", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": 1}, "alphaMode": "MASK", "alphaCutoff": 0.05, "doubleSided": True}],
        "textures": [{"source": 0, "sampler": 0}],
        "samplers": [{"magFilter": 9728, "minFilter": 9728, "wrapS": 10497, "wrapT": 10497}],
        "images": [{"uri": texture_name}],
        "animations": exported_animations,
        "buffers": [{"uri": binary_name, "byteLength": len(buffer.data)}],
        "bufferViews": buffer.views,
        "accessors": buffer.accessors,
    }
    output_path.write_text(json.dumps(document, separators=(",", ":")))
    output_path.with_suffix(".bin").write_bytes(buffer.data)
    shutil.copyfile(model_path.parent / "texture.png", output_path.parent / texture_name)
    print(f"Exported {output_path} with root + 16 joints, {len(positions)} weighted vertices, and {len(exported_animations)} animation(s)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("model", type=Path)
    parser.add_argument("animations", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--names", type=Path)
    parser.add_argument("--clip", type=int)
    args = parser.parse_args()
    export(args.model, args.animations, args.names, args.output, args.clip)
