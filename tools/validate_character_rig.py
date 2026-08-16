#!/usr/bin/env python3
"""Validate Pepsiman's assembled bind hierarchy and extracted root motion."""

from pathlib import Path
import argparse
import json
import math


TRANSLATION_SCALE = 1 / 5
EXPECTED_PARENTS = {
    1: 1001, 2: 1, 3: 2, 4: 3, 5: 4, 6: 2, 7: 6, 8: 7,
    9: 2, 10: 9, 11: 1, 12: 11, 13: 12, 14: 1, 15: 14, 16: 15,
}


def multiply(left: list[list[float]], right: list[list[float]]) -> list[list[float]]:
    return [[sum(left[row][inner] * right[inner][column] for inner in range(4))
             for column in range(4)] for row in range(4)]


def local_matrix(frame: dict) -> list[list[float]]:
    source_x, source_y, source_z = frame.get("rotation", [0, 0, 0])
    x, y, z = source_x, -source_y, -source_z
    cx, sx = math.cos(x), math.sin(x)
    cy, sy = math.cos(y), math.sin(y)
    cz, sz = math.cos(z), math.sin(z)
    rotation_x = [[1, 0, 0, 0], [0, cx, -sx, 0], [0, sx, cx, 0], [0, 0, 0, 1]]
    rotation_y = [[cy, 0, sy, 0], [0, 1, 0, 0], [-sy, 0, cy, 0], [0, 0, 0, 1]]
    rotation_z = [[cz, -sz, 0, 0], [sz, cz, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
    result = multiply(multiply(rotation_x, rotation_y), rotation_z)
    translation = frame.get("translation", [0, 0, 0])
    result[0][3] = translation[0] * TRANSLATION_SCALE
    result[1][3] = -translation[1] * TRANSLATION_SCALE
    result[2][3] = -translation[2] * TRANSLATION_SCALE
    return result


def transform(matrix: list[list[float]], point: list[float]) -> tuple[float, float, float]:
    return tuple(sum(matrix[row][column] * point[column] for column in range(3)) + matrix[row][3]
                 for row in range(3))


def nearest_vertex_distance(left: list[tuple[float, float, float]], right: list[tuple[float, float, float]]) -> float:
    return math.sqrt(min(sum((a[axis] - b[axis]) ** 2 for axis in range(3)) for a in left for b in right))


def validate(model_path: Path, animations_path: Path) -> None:
    model = json.loads(model_path.read_text())
    animations = json.loads(animations_path.read_text())
    setup = {item["id"]: item for item in animations["setup"]["objects"]}
    assert setup[1001]["parentId"] is None and not setup[1001]["frames"], "invalid identity root"
    assert {joint: setup[joint]["parentId"] for joint in EXPECTED_PARENTS} == EXPECTED_PARENTS

    meshes = {item["id"]: [item["positions"][offset:offset + 3]
                            for offset in range(0, len(item["positions"]), 3)]
              for item in model["objects"][:16]}
    identity = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
    world = {1001: identity}
    posed = {}
    seam_distances = {}
    for joint in range(1, 17):
        item = setup[joint]
        world[joint] = multiply(world[item["parentId"]], local_matrix(item["frames"][0]))
        posed[joint] = [transform(world[joint], point) for point in meshes[joint]]
        if item["parentId"] != 1001:
            seam_distances[joint] = nearest_vertex_distance(posed[joint], posed[item["parentId"]])
    worst_joint = max(seam_distances, key=seam_distances.get)
    assert seam_distances[worst_joint] < 3.2, (
        f"bind seam regression at joint {worst_joint}: {seam_distances[worst_joint]:.3f} source units"
    )

    pelvis_setup = setup[1]["frames"][0]
    run = next(clip for clip in animations["clips"] if clip["id"] == 4)
    run_pelvis = run["objects"][0]["frames"][0]
    setup_height = -pelvis_setup["translation"][1] * TRANSLATION_SCALE
    run_height = -run_pelvis["translation"][1] * TRANSLATION_SCALE
    assert abs(setup_height - run_height) < 0.5, "setup and compact pelvis scales disagree"

    pelvis_x_angles = {
        round(math.degrees(frame["rotation"][0]))
        for clip in animations["clips"] for frame in clip["objects"][0]["frames"]
    }
    assert pelvis_x_angles == {-103}, "joint-1 basis angle changed; revisit root extraction"
    print(
        f"Validated root + 16-joint hierarchy, ÷5 bind assembly, {len(seam_distances)} seams "
        f"(worst {seam_distances[worst_joint]:.2f}), and extracted -103° root basis"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("model", type=Path)
    parser.add_argument("animations", type=Path)
    args = parser.parse_args()
    validate(args.model, args.animations)
