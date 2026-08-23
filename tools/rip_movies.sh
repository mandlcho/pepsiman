#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TRACK=${1:-"$ROOT/Pepsiman (Japan) (Track 1).bin"}
WORK=${TMPDIR:-/tmp}/pepsiman-movies
DESTINATION="$ROOT/assets/video"
XA_DESTINATION="$ROOT/assets/audio/xa"

mkdir -p "$WORK" "$DESTINATION" "$XA_DESTINATION"
python3 "$ROOT/tools/extract_psx_movies.py" "$TRACK" "$WORK"

for SOURCE in "$WORK"/movie*.str; do
  NAME=$(basename "$SOURCE" .str)
  ffmpeg -hide_banner -loglevel error -f psxstr -i "$SOURCE" \
    -map 0:v:0 -map 0:a:0 -c:v libx264 -preset slow -crf 18 \
    -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart \
    "$DESTINATION/$NAME.mp4" -y
done

for STREAM in 0 1 2 3 4 5; do
  ffmpeg -hide_banner -loglevel error -f psxstr -i "$WORK/h000.raw.xa" \
    -map "0:a:$STREAM" -c:a libmp3lame -q:a 4 \
    "$XA_DESTINATION/h000-$STREAM.mp3" -y
done

cp "$WORK/manifest.json" "$DESTINATION/source-manifest.json"
echo "Browser movies rebuilt successfully."
