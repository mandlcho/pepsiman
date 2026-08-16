#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUTPUT=${1:-"$ROOT/exports/pepsiman"}
SOURCE="$ROOT/assets/ripped/pepsiman"
NAMES="$ROOT/tools/animation_names.json"

if ! command -v blender >/dev/null 2>&1 || ! command -v assimp >/dev/null 2>&1; then
  echo "Missing Blender or Assimp. Blender exports FBX and Assimp validates its structure." >&2
  exit 1
fi

mkdir -p "$OUTPUT/animations"
python3 "$ROOT/tools/export_character_gltf.py" \
  "$SOURCE/model.json" "$SOURCE/animations.json" "$OUTPUT/Pepsiman_Rig.gltf" \
  --names "$NAMES"
blender --background --python "$ROOT/tools/blender_export_fbx.py" -- \
  "$OUTPUT/Pepsiman_Rig.gltf" "$OUTPUT/Pepsiman_Rig.fbx" "$OUTPUT/animations" "$NAMES"
cp "$SOURCE/texture.png" "$OUTPUT/animations/texture.png"

python3 "$ROOT/tools/write_export_manifest.py" "$NAMES" "$OUTPUT/manifest.json"
(cd "$OUTPUT" && zip -q -FS -r Pepsiman_Animation_Clips.zip animations)
assimp info "$OUTPUT/Pepsiman_Rig.fbx"
python3 "$ROOT/tools/validate_fbx_exports.py" "$OUTPUT" --names "$NAMES"
echo "Exported combined rig and 50 individual FBX clips to $OUTPUT"
