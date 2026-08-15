#!/usr/bin/env python3
"""Convert a raw 2352-byte PlayStation Mode 2 track into a 2048-byte ISO."""

from pathlib import Path
import argparse


SECTOR_SIZE = 2352
PAYLOAD_OFFSET = 24
PAYLOAD_SIZE = 2048


def convert(source: Path, destination: Path) -> None:
    sectors = source.stat().st_size // SECTOR_SIZE
    with source.open("rb") as raw, destination.open("wb") as iso:
        for sector_number in range(sectors):
            sector = raw.read(SECTOR_SIZE)
            if len(sector) != SECTOR_SIZE:
                raise RuntimeError(f"Short sector at {sector_number}")
            iso.write(sector[PAYLOAD_OFFSET : PAYLOAD_OFFSET + PAYLOAD_SIZE])
    print(f"Extracted {sectors:,} sectors to {destination}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    convert(args.source, args.destination)
