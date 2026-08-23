#!/usr/bin/env python3
"""Recover PlayStation STR movies from their original raw CD sectors."""

from __future__ import annotations

from argparse import ArgumentParser
import hashlib
import json
from pathlib import Path
import struct


RAW_SECTOR_SIZE = 2352
FORM1_PAYLOAD_OFFSET = 24
FORM1_PAYLOAD_SIZE = 2048


def sector(track, lba: int) -> bytes:
    track.seek(lba * RAW_SECTOR_SIZE)
    data = track.read(RAW_SECTOR_SIZE)
    if len(data) != RAW_SECTOR_SIZE:
        raise ValueError(f"sector {lba} extends beyond the raw track")
    return data


def form1_payload(track, lba: int) -> bytes:
    return sector(track, lba)[FORM1_PAYLOAD_OFFSET : FORM1_PAYLOAD_OFFSET + FORM1_PAYLOAD_SIZE]


def directory_records(track, lba: int, size: int) -> list[dict]:
    data = b"".join(form1_payload(track, lba + index) for index in range((size + 2047) // 2048))[:size]
    records = []
    offset = 0
    while offset < len(data):
        record_size = data[offset]
        if record_size == 0:
            offset = (offset // FORM1_PAYLOAD_SIZE + 1) * FORM1_PAYLOAD_SIZE
            continue
        record = data[offset : offset + record_size]
        name_size = record[32]
        raw_name = record[33 : 33 + name_size]
        name = raw_name.decode("ascii", "replace").split(";", 1)[0]
        if name not in ("\x00", "\x01"):
            records.append({
                "name": name.rstrip("."),
                "lba": struct.unpack_from("<I", record, 2)[0],
                "size": struct.unpack_from("<I", record, 10)[0],
                "directory": bool(record[25] & 2),
            })
        offset += record_size
    return records


def root_records(track) -> list[dict]:
    descriptor = form1_payload(track, 16)
    if descriptor[1:6] != b"CD001":
        raise ValueError("raw track has no ISO 9660 primary volume descriptor")
    root_size = descriptor[156]
    root = descriptor[156 : 156 + root_size]
    return directory_records(
        track,
        struct.unpack_from("<I", root, 2)[0],
        struct.unpack_from("<I", root, 10)[0],
    )


def walk_records(track, records: list[dict], prefix: str = ""):
    for record in records:
        path = f"{prefix}/{record['name']}" if prefix else record["name"]
        yield path, record
        if record["directory"]:
            yield from walk_records(
                track,
                directory_records(track, record["lba"], record["size"]),
                path,
            )


def extract_raw_extent(track, record: dict, output: Path) -> dict:
    sector_count = (record["size"] + FORM1_PAYLOAD_SIZE - 1) // FORM1_PAYLOAD_SIZE
    digest = hashlib.sha256()
    submodes: dict[str, int] = {}
    with output.open("wb") as destination:
        for index in range(sector_count):
            raw = sector(track, record["lba"] + index)
            destination.write(raw)
            digest.update(raw)
            key = f"0x{raw[18]:02x}"
            submodes[key] = submodes.get(key, 0) + 1
    return {
        "lba": record["lba"],
        "directorySize": record["size"],
        "sectorCount": sector_count,
        "rawSize": sector_count * RAW_SECTOR_SIZE,
        "submodeCounts": submodes,
        "sha256": digest.hexdigest(),
        "path": output.name,
    }


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("track", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    args.destination.mkdir(parents=True, exist_ok=True)

    manifest = {
        "format": "Pepsiman raw PlayStation media export v1",
        "source": args.track.name,
        "sectorSize": RAW_SECTOR_SIZE,
        "movies": [],
    }
    with args.track.open("rb") as track:
        records = list(walk_records(track, root_records(track)))
        movies = sorted(
            (record for path, record in records if "/" not in path and record["name"].upper().endswith(".STR")),
            key=lambda record: record["name"],
        )
        if not movies:
            raise ValueError("no root-level STR movies found")
        for movie in movies:
            output = args.destination / movie["name"].lower()
            exported = extract_raw_extent(track, movie, output)
            manifest["movies"].append({"name": movie["name"], **exported})
            print(f"Recovered {movie['name']}: {exported['sectorCount']} raw sectors")
        xa_path, xa_record = next((item for item in records if item[0].upper() == "CDDATA/H/H000"), (None, None))
        if xa_record is None:
            raise ValueError("CDDATA/H/H000 XA program archive not found")
        xa_output = args.destination / "h000.raw.xa"
        manifest["xaArchive"] = {"name": xa_path, "streamCount": 6, **extract_raw_extent(track, xa_record, xa_output)}
        print(f"Recovered {xa_path}: {manifest['xaArchive']['sectorCount']} raw sectors")
    (args.destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
