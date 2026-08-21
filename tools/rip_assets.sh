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
python3 "$ROOT/tools/extract_pic.py" \
  "$WORK/disc/CDDATA/0/0003" "$ROOT/assets/ripped/ui"
python3 "$ROOT/tools/extract_stage_tmd.py" \
  "$WORK/disc/CDDATA/2/2003" "$ROOT/assets/ripped/stages/2" \
  --tim "$WORK/disc/CDDATA/2/2002" --tim "$WORK/disc/CDDATA/2/2005"
python3 "$ROOT/tools/extract_stage_tmd.py" \
  "$WORK/disc/CDDATA/2/2004" "$ROOT/assets/ripped/stages/2" \
  --tim "$WORK/disc/CDDATA/2/2002" --tim "$WORK/disc/CDDATA/2/2005"
python3 "$ROOT/tools/extract_stage_entities.py" \
  "$WORK/disc/CDDATA/2/2006" "$ROOT/assets/ripped/stages/2/2006-entities.json"
python3 "$ROOT/tools/extract_stage_auxiliary.py" \
  "$WORK/disc/CDDATA/2/2007" "$ROOT/assets/ripped/stages/2/2007-auxiliary.json"
python3 "$ROOT/tools/extract_stage_tmd.py" \
  "$WORK/disc/CDDATA/3/3003" "$ROOT/assets/ripped/stages/3" \
  --tim "$WORK/disc/CDDATA/3/3002" --tim "$WORK/disc/CDDATA/3/3005"
python3 "$ROOT/tools/extract_stage_tmd.py" \
  "$WORK/disc/CDDATA/3/3004" "$ROOT/assets/ripped/stages/3" \
  --tim "$WORK/disc/CDDATA/3/3002" --tim "$WORK/disc/CDDATA/3/3005"
python3 "$ROOT/tools/extract_stage_entities.py" \
  "$WORK/disc/CDDATA/3/3006" "$ROOT/assets/ripped/stages/3/3006-entities.json"
python3 "$ROOT/tools/extract_stage_tmd.py" \
  "$WORK/disc/CDDATA/4/4002" "$ROOT/assets/ripped/stages/4" \
  --tim "$WORK/disc/CDDATA/4/4003" --tim "$WORK/disc/CDDATA/4/4005"
python3 "$ROOT/tools/extract_stage_tmd.py" \
  "$WORK/disc/CDDATA/4/4004" "$ROOT/assets/ripped/stages/4" \
  --tim "$WORK/disc/CDDATA/4/4003" --tim "$WORK/disc/CDDATA/4/4005"
python3 "$ROOT/tools/extract_stage_setpiece.py" \
  "$WORK/disc/CDDATA/4/4006" "$ROOT/assets/ripped/stages/4/4006-setpiece.json"
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
