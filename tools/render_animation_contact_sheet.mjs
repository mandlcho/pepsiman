#!/usr/bin/env node
import fs from "node:fs";

const [modelPath, animationPath, outputPath] = process.argv.slice(2);
if (!modelPath || !animationPath || !outputPath) {
  throw new Error("usage: render_animation_contact_sheet.mjs MODEL_JSON ANIMATIONS_JSON OUTPUT_SVG");
}
const model = JSON.parse(fs.readFileSync(modelPath, "utf8"));
const animations = JSON.parse(fs.readFileSync(animationPath, "utf8"));
const setup = new Map(animations.setup.objects.map(object => [object.id, object]));

function multiply(a, b) {
  const result = Array(16).fill(0);
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
    for (let inner = 0; inner < 4; inner++) result[row * 4 + column] += a[row * 4 + inner] * b[inner * 4 + column];
  }
  return result;
}

function matrix(rotation = [0, 0, 0], translation = [0, 0, 0]) {
  const [x, y, z] = [rotation[0], -rotation[1], -rotation[2]];
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y), Math.cos(z), Math.sin(z)];
  const rx = [1,0,0,0, 0,cx,-sx,0, 0,sx,cx,0, 0,0,0,1];
  const ry = [cy,0,sy,0, 0,1,0,0, -sy,0,cy,0, 0,0,0,1];
  const rz = [cz,-sz,0,0, sz,cz,0,0, 0,0,1,0, 0,0,0,1];
  const result = multiply(multiply(rx, ry), rz);
  result[3] = translation[0] / 5;
  result[7] = -translation[1] / 5;
  result[11] = -translation[2] / 5;
  return result;
}

function transform(m, point) {
  return [m[0]*point[0]+m[1]*point[1]+m[2]*point[2]+m[3], m[4]*point[0]+m[5]*point[1]+m[6]*point[2]+m[7], m[8]*point[0]+m[9]*point[1]+m[10]*point[2]+m[11]];
}

function posedParts(clip, frameIndex) {
  const world = new Map();
  const pelvisFrame = clip.objects[0].frames[frameIndex];
  const pelvisRotation = [pelvisFrame.rotation[0] + 103 * Math.PI / 180, pelvisFrame.rotation[1], pelvisFrame.rotation[2]];
  const pelvisWorld = matrix(pelvisRotation, pelvisFrame.translation);
  world.set(1, pelvisWorld);
  const center = transform(pelvisWorld, [0, 0, 0]);
  const parts = [];
  for (const part of model.objects.slice(0, 16)) {
    const object = setup.get(part.id);
    if (part.id > 1) {
      const frame = clip.objects[part.id - 1].frames[frameIndex];
      world.set(part.id, multiply(world.get(object.parentId), matrix(frame.rotation, object.frames[0].translation)));
    }
    const transformMatrix = world.get(part.id);
    const points = [];
    for (let offset = 0; offset < part.positions.length; offset += 3) {
      const point = transform(transformMatrix, part.positions.slice(offset, offset + 3));
      points.push([point[0] - center[0], point[1] - center[1], point[2] - center[2]]);
    }
    parts.push({id: part.id, points});
  }
  return parts;
}

function convexHull(points) {
  const sorted = [...new Map(points.map(point => [`${point[0]},${point[1]}`, point])).values()]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (origin, a, b) => (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
  const half = sequence => {
    const result = [];
    for (const point of sequence) {
      while (result.length >= 2 && cross(result.at(-2), result.at(-1), point) <= 0) result.pop();
      result.push(point);
    }
    return result;
  };
  return [...half(sorted).slice(0, -1), ...half([...sorted].reverse()).slice(0, -1)];
}

const columns = 5, cellWidth = 300, cellHeight = 255;
let content = "";
for (let clipIndex = 0; clipIndex < animations.clips.length; clipIndex++) {
  const clip = animations.clips[clipIndex];
  const frameIndexes = [0, .25, .5, .75].map(fraction => Math.min(clip.frameCount - 1, Math.floor(clip.frameCount * fraction)));
  const poses = frameIndexes.map(frame => posedParts(clip, frame));
  const points = poses.flatMap(pose => pose.flatMap(part => part.points));
  const minX = Math.min(...points.map(point => point[0])), maxX = Math.max(...points.map(point => point[0]));
  const minY = Math.min(...points.map(point => point[1])), maxY = Math.max(...points.map(point => point[1]));
  const scale = Math.min(54 / Math.max(1, maxX - minX), 205 / Math.max(1, maxY - minY));
  const column = clipIndex % columns, row = Math.floor(clipIndex / columns);
  const originX = column * cellWidth, originY = row * cellHeight;
  content += `<rect x="${originX + 2}" y="${originY + 2}" width="${cellWidth - 4}" height="${cellHeight - 4}" fill="#101827" stroke="#2b405b"/>`;
  content += `<text x="${originX + 12}" y="${originY + 25}" fill="#f2d24b" font-family="Verdana" font-size="18">CLIP ${clip.id} · ${clip.frameCount}F</text>`;
  for (let poseIndex = 0; poseIndex < poses.length; poseIndex++) {
    const pose = poses[poseIndex].map(part => ({...part, depth: part.points.reduce((sum, point) => sum + point[2], 0) / part.points.length})).sort((a,b) => a.depth - b.depth);
    for (const part of pose) {
      const hull = convexHull(part.points);
      const polygon = hull.map(point => `${originX + 50 + poseIndex * 67 + (point[0] - (minX + maxX) / 2) * scale},${originY + 237 - (point[1] - minY) * scale}`).join(" ");
      content += `<polygon points="${polygon}" fill="#278be0" stroke="#07101b" stroke-width="0.35"/>`;
    }
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${columns * cellWidth}" height="${Math.ceil(animations.clips.length / columns) * cellHeight}"><rect width="100%" height="100%" fill="#080c14"/>${content}</svg>`;
fs.writeFileSync(outputPath, svg);
