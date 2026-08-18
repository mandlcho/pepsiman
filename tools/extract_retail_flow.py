#!/usr/bin/env python3
"""Recover Pepsiman's retail gameplay-segment dispatch table from SLPS_017.62."""

from __future__ import annotations

from argparse import ArgumentParser
import json
from pathlib import Path
import struct


PSX_HEADER_SIZE = 0x800
SCENE_COUNT = 14
SCENE_INDEX_ADDRESS = 0x80095830
SCENE_SELECTOR_FUNCTION = 0x8004121C
SCENE_SELECTOR_TABLE = 0x8001205C


class PsxExecutable:
    def __init__(self, path: Path) -> None:
        self.data = path.read_bytes()
        if not self.data.startswith(b"PS-X EXE"):
            raise ValueError(f"{path} is not a PlayStation executable")
        self.load_address, self.load_size = struct.unpack_from("<II", self.data, 0x18)

    def offset(self, address: int) -> int:
        offset = PSX_HEADER_SIZE + address - self.load_address
        if offset < PSX_HEADER_SIZE or offset + 4 > len(self.data):
            raise ValueError(f"address {address:#x} is outside the executable image")
        return offset

    def word(self, address: int) -> int:
        return struct.unpack_from("<I", self.data, self.offset(address))[0]


def signed_16(value: int) -> int:
    return value if value < 0x8000 else value - 0x10000


def find_a0_immediate(executable: PsxExecutable, target: int) -> int:
    """Find `addiu a0, zero, immediate` in a tiny jump-table case stub."""
    for address in range(target, target + 12, 4):
        instruction = executable.word(address)
        opcode = instruction >> 26
        source = (instruction >> 21) & 31
        destination = (instruction >> 16) & 31
        if opcode == 0x09 and source == 0 and destination == 4:
            return signed_16(instruction & 0xFFFF)
    raise ValueError(f"no resource selector immediate in case stub {target:#x}")


def extract(executable: PsxExecutable) -> dict:
    case_targets = [executable.word(SCENE_SELECTOR_TABLE + index * 4) for index in range(15)]
    selectors = [find_a0_immediate(executable, target) for target in case_targets]
    expected = list(range(3, 18))
    if selectors != expected:
        raise ValueError(f"unexpected retail selector map: {selectors}")

    scenes = []
    for scene_index in range(SCENE_COUNT):
        scenes.append({
            "sceneIndex": scene_index,
            "resourceSelector": selectors[scene_index],
            "discFamily": f"{scene_index + 2:X}",
            "discDirectory": f"CDDATA/{scene_index + 2:X}",
        })
    return {
        "format": "Pepsiman retail flow map v1",
        "provenance": "SLPS_017.62 scene dispatch at 0x8004121c",
        "executableLoadAddress": f"0x{executable.load_address:08x}",
        "sceneIndexAddress": f"0x{SCENE_INDEX_ADDRESS:08x}",
        "sceneCount": SCENE_COUNT,
        "scenes": scenes,
        "reservedSelector": selectors[SCENE_COUNT],
    }


if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("executable", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = extract(PsxExecutable(args.executable))
    text = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.write_text(text)
    else:
        print(text, end="")
