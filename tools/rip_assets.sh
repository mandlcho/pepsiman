#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DISC="$ROOT/Pepsiman (Japan) (Track 1).bin"
WORK="${TMPDIR:-/tmp}/pepsiman-native-rip"

if [ ! -f "$DISC" ]; then
  echo "Missing original Track 1 BIN: $DISC" >&2
  exit 1
fi

mkdir -p "$WORK/disc" "$ROOT/assets/ripped/textures" "$ROOT/assets/audio"
python3 "$ROOT/tools/extract_mode2.py" "$DISC" "$WORK/pepsiman.iso"
bsdtar -xf "$WORK/pepsiman.iso" -C "$WORK/disc" CDDATA 2>/dev/null || true
python3 "$ROOT/tools/extract_tim.py" "$WORK/disc/CDDATA" "$ROOT/assets/ripped/textures"
python3 "$ROOT/tools/extract_character.py" \
  "$WORK/disc/CDDATA/0/0000" \
  "$WORK/disc/CDDATA/0/0001" \
  "$WORK/disc/CDDATA/0/0002" \
  "$ROOT/assets/ripped/pepsiman"
PYTHONPATH="$ROOT/tools" python3 "$ROOT/tools/validate_character_animations.py" \
  "$WORK/disc/CDDATA/0/0002" \
  --export "$ROOT/assets/ripped/pepsiman/animations.json"
python3 "$ROOT/tools/validate_character_rig.py" \
  "$ROOT/assets/ripped/pepsiman/model.json" \
  "$ROOT/assets/ripped/pepsiman/animations.json"

ffmpeg -hide_banner -loglevel error -f s16le -ar 44100 -ac 2 -ss 2 \
  -i "$ROOT/Pepsiman (Japan) (Track 2).bin" -c:a libmp3lame -q:a 4 \
  "$ROOT/assets/audio/run-theme.mp3" -y

echo "Native browser assets rebuilt successfully."
