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
ENDING_APPROACH_TABLE = 0x8007AE1C
ENDING_FINISH_TABLE = 0x8007AED0
SCRIPTED_CENTER_TABLE = 0x8007AD68


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

    def signed_words(self, address: int, count: int) -> tuple[int, ...]:
        return struct.unpack_from(f"<{count}i", self.data, self.offset(address))


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
        approach = executable.signed_words(ENDING_APPROACH_TABLE + scene_index * 12, 3)
        finish = executable.signed_words(ENDING_FINISH_TABLE + scene_index * 12, 3)
        scenes.append({
            "sceneIndex": scene_index,
            "resourceSelector": selectors[scene_index],
            "discFamily": f"{scene_index + 2:X}",
            "discDirectory": f"CDDATA/{scene_index + 2:X}",
            "ending": {
                "approachGamePosition": list(approach),
                "approachBrowserPosition": [approach[0], -approach[1], -approach[2]],
                "finishGamePosition": list(finish),
                "finishBrowserPosition": [finish[0], -finish[1], -finish[2]],
                "interpolationFrames": 35,
                "cameraInterpolationFrames": 30,
                "cameraAdvanceCounterFrames": 41,
                "holdFrames": 241,
                "finalDelayFrames": 9,
            },
        })
    return {
        "format": "Pepsiman retail flow map v3",
        "provenance": "SLPS_017.62 scene dispatch and position tables consumed by Stage 1 overlay controllers 0x800f7584 and 0x800f7abc",
        "executableLoadAddress": f"0x{executable.load_address:08x}",
        "sceneIndexAddress": f"0x{SCENE_INDEX_ADDRESS:08x}",
        "endingApproachTableAddress": f"0x{ENDING_APPROACH_TABLE:08x}",
        "endingFinishTableAddress": f"0x{ENDING_FINISH_TABLE:08x}",
        "scriptedCenterTableAddress": f"0x{SCRIPTED_CENTER_TABLE:08x}",
        "sceneCount": SCENE_COUNT,
        "scenes": scenes,
        "reservedSelector": selectors[SCENE_COUNT],
        "stageOneScriptedEvents": [{
            "eventRecordIndex": 194,
            "controllerAddress": "0x800f7584",
            "targetGamePosition": list(executable.signed_words(SCRIPTED_CENTER_TABLE, 3)),
            "targetBrowserPosition": [
                executable.signed_words(SCRIPTED_CENTER_TABLE, 3)[0],
                -executable.signed_words(SCRIPTED_CENTER_TABLE, 3)[1],
                -executable.signed_words(SCRIPTED_CENTER_TABLE, 3)[2],
            ],
            "centeringFrames": 25,
            "soundFrames": 9,
            "soundAssetId": 56,
            "effectSpawnCount": 40,
            "effectVerticalStep": 10,
            "randomParticleConstructorAddress": "0x800f1ae8",
            "randomParticleCount": 8,
            "randomParticleRetailModelId": 184,
            "randomParticleModelObject": 79,
            "randomParticleModelMappingProvenance": "inferred from the 80-object Stage 1 prop library ending at retail model ID 184",
            "randomParticleLifetimeFrames": 61,
            "closingEffectFrames": 30,
        }],
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
