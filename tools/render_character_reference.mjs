#!/usr/bin/env node
import fs from "node:fs";

const [modelPath, animationPath, outputPath, divisorArgument = "5"] = process.argv.slice(2);
if (!modelPath || !animationPath || !outputPath) {
  throw new Error("usage: render_character_reference.mjs MODEL_JSON ANIMATIONS_JSON OUTPUT_SVG [DIVISOR]");
}
const divisor = Number(divisorArgument);
const model = JSON.parse(fs.readFileSync(modelPath, "utf8"));
const animations = JSON.parse(fs.readFileSync(animationPath, "utf8"));

function multiply(a, b) {
  const result = Array(16).fill(0);
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
    for (let inner = 0; inner < 4; inner++) result[row * 4 + column] += a[row * 4 + inner] * b[inner * 4 + column];
  }
  return result;
}

function localMatrix(frame = {}) {
  const [sourceX = 0, sourceY = 0, sourceZ = 0] = frame.rotation || [];
  const [x, y, z] = [sourceX, -sourceY, -sourceZ];
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y), Math.cos(z), Math.sin(z)];
  const rotationX = [1,0,0,0, 0,cx,-sx,0, 0,sx,cx,0, 0,0,0,1];
  const rotationY = [cy,0,sy,0, 0,1,0,0, -sy,0,cy,0, 0,0,0,1];
  const rotationZ = [cz,-sz,0,0, sz,cz,0,0, 0,0,1,0, 0,0,0,1];
  const matrix = multiply(multiply(rotationX, rotationY), rotationZ);
  const translation = frame.translation || [0, 0, 0];
  matrix[3] = translation[0] / divisor;
  matrix[7] = -translation[1] / divisor;
  matrix[11] = -translation[2] / divisor;
  return matrix;
}

function transform(matrix, point) {
  return [
    matrix[0] * point[0] + matrix[1] * point[1] + matrix[2] * point[2] + matrix[3],
    matrix[4] * point[0] + matrix[5] * point[1] + matrix[6] * point[2] + matrix[7],
    matrix[8] * point[0] + matrix[9] * point[1] + matrix[10] * point[2] + matrix[11],
  ];
}

const setup = new Map(animations.setup.objects.map(object => [object.id, object]));
const world = new Map([[1001, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]]]);
const triangles = [];
for (const part of model.objects.slice(0, 16)) {
  const object = setup.get(part.id);
  const matrix = multiply(world.get(object.parentId), localMatrix(object.frames[0]));
  world.set(part.id, matrix);
  for (let offset = 0; offset < part.positions.length; offset += 9) {
    triangles.push({
      id: part.id,
      points: [0, 3, 6].map(index => transform(matrix, part.positions.slice(offset + index, offset + index + 3))),
    });
  }
}

const colors = ["#1478d4", "#e7edf2", "#d81f38", "#2c91de", "#f3f5f6"];
function panel(project, xOffset, title) {
  const projected = triangles.map(triangle => ({
    ...triangle,
    points2d: triangle.points.map(project),
    depth: triangle.points.reduce((sum, point) => sum + point[2], 0) / 3,
  })).sort((a, b) => a.depth - b.depth);
  const values = projected.flatMap(triangle => triangle.points2d);
  const minX = Math.min(...values.map(point => point[0]));
  const maxX = Math.max(...values.map(point => point[0]));
  const minY = Math.min(...values.map(point => point[1]));
  const maxY = Math.max(...values.map(point => point[1]));
  const scale = Math.min(480 / (maxX - minX), 500 / (maxY - minY));
  const body = projected.map(triangle => {
    const points = triangle.points2d.map(([x, y]) => `${xOffset + 300 + (x - (minX + maxX) / 2) * scale},${550 - (y - minY) * scale}`).join(" ");
    return `<polygon points="${points}" fill="${colors[triangle.id % colors.length]}" stroke="#07101b" stroke-width="0.45"/>`;
  }).join("");
  return `<title>${title}</title>${body}`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600"><rect width="1200" height="600" fill="#080c14"/>${panel(([x,y,z]) => [x,y,z], 0, `FRONT · TOD ÷ ${divisor}`)}${panel(([x,y,z]) => [z,y,-x], 600, `SIDE · TOD ÷ ${divisor}`)}</svg>`;
fs.writeFileSync(outputPath, svg);
