#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [threePackage, fbxPath, animationsPath] = process.argv.slice(2);
if (!threePackage || !fbxPath || !animationsPath) throw new Error("usage: validate_fbx_three.mjs THREE_PACKAGE_DIR FBX ANIMATIONS_JSON");
const THREE = await import(pathToFileURL(path.join(threePackage, "build/three.module.js")));
const { FBXLoader } = await import(pathToFileURL(path.join(threePackage, "examples/jsm/loaders/FBXLoader.js")));

globalThis.window = { URL: { createObjectURL: () => "blob:embedded-fbx-texture" } };
THREE.TextureLoader.prototype.load = function load(_url, onLoad) {
  const texture = new THREE.Texture();
  queueMicrotask(() => onLoad?.(texture));
  return texture;
};

const source = fs.readFileSync(fbxPath);
const arrayBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
const character = new FBXLoader().parse(arrayBuffer, `${path.dirname(fbxPath)}/`);
for (const clip of character.animations) clip.name = clip.name.split("|").at(-1);
const sourceAnimations = JSON.parse(fs.readFileSync(animationsPath, "utf8"));
const bones = [], skinnedMeshes = [];
character.traverse(object => {
  if (object.isBone) bones.push(object);
  if (object.isSkinnedMesh) skinnedMeshes.push(object);
});
const expectedBones = ["root", "pelvis", "spine", "shoulderR", "elbowR", "handR", "shoulderL", "elbowL", "handL", "neck", "head", "hipR", "kneeR", "footR", "hipL", "kneeL", "footL"];
if (bones.length !== 17 || expectedBones.some(name => !bones.some(bone => bone.name === name))) throw new Error(`unexpected Three.js bones: ${bones.map(bone => bone.name)}`);
if (skinnedMeshes.length !== 1 || skinnedMeshes[0].skeleton.bones.length !== 17) throw new Error("FBX did not produce one 17-bone SkinnedMesh");
if (![1, 50].includes(character.animations.length)) throw new Error(`expected 1 or 50 FBX animations, found ${character.animations.length}`);
const skinIndex = skinnedMeshes[0].geometry.getAttribute("skinIndex");
const skinWeight = skinnedMeshes[0].geometry.getAttribute("skinWeight");
if (!skinIndex || !skinWeight || skinIndex.count !== skinnedMeshes[0].geometry.getAttribute("position").count) throw new Error("FBX skin attributes are missing or incomplete");
for (let vertex = 0; vertex < skinWeight.count; vertex++) {
  const total = skinWeight.getX(vertex) + skinWeight.getY(vertex) + skinWeight.getZ(vertex) + skinWeight.getW(vertex);
  if (Math.abs(total - 1) > 1e-5) throw new Error(`vertex ${vertex} has invalid total skin weight ${total}`);
}
const pelvis = bones.find(bone => bone.name === "pelvis");
if (Math.abs(pelvis.position.y - 103.8) > 1e-4 || Math.abs(pelvis.position.z - 3.8) > 1e-4) throw new Error(`unexpected FBX pelvis bind position ${pelvis.position.toArray()}`);

const boneById = new Map([[1001, bones.find(bone => bone.name === "root")], [1, pelvis]]);
for (const [id, name] of [[2,"spine"],[3,"shoulderR"],[4,"elbowR"],[5,"handR"],[6,"shoulderL"],[7,"elbowL"],[8,"handL"],[9,"neck"],[10,"head"],[11,"hipR"],[12,"kneeR"],[13,"footR"],[14,"hipL"],[15,"kneeL"],[16,"footL"]]) boneById.set(id,bones.find(bone=>bone.name===name));
const mixer = new THREE.AnimationMixer(character), expectedScale = new THREE.Vector3(1,1,1);
let validatedFrames = 0,maxQuaternionError=0,worstQuaternion="",maxMatrixError=0,worstMatrix="";
const sourceClips = sourceAnimations.clips.filter(sourceClip => character.animations.some(clip => clip.name === sourceClip.name));
if (sourceClips.length !== character.animations.length) throw new Error("FBX clip names do not map one-to-one to recovered source clips");
for (const sourceClip of sourceClips) {
  const fbxClip = character.animations.find(clip => clip.name === sourceClip.name);
  if (!fbxClip) throw new Error(`FBX clip ${sourceClip.name} is missing`);
  const action = mixer.clipAction(fbxClip);action.reset().setLoop(THREE.LoopOnce,0);action.clampWhenFinished=true;action.play();
  for (let frameIndex=0;frameIndex<sourceClip.frameCount;frameIndex++) {
    mixer.setTime(frameIndex/sourceClip.fps);
    const sourceRoot = sourceClip.objects[0].frames[frameIndex];
    const expectedPosition = new THREE.Vector3(sourceRoot.translation[0]/5,-sourceRoot.translation[1]/5,-sourceRoot.translation[2]/5);
    const expectedRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(sourceRoot.rotation[0]+103*Math.PI/180,-sourceRoot.rotation[1],-sourceRoot.rotation[2],"XYZ"));
    const expectedPelvisMatrix = new THREE.Matrix4().compose(expectedPosition,expectedRotation,expectedScale);
    character.updateMatrixWorld(true);
    const actualPelvisMatrix = pelvis.matrixWorld.clone();
    for(let element=0;element<16;element++){const error=Math.abs(actualPelvisMatrix.elements[element]-expectedPelvisMatrix.elements[element]);if(error>maxMatrixError){maxMatrixError=error;worstMatrix=`${sourceClip.name} frame ${frameIndex} element ${element}; actual ${actualPelvisMatrix.elements.join(",")}; expected ${expectedPelvisMatrix.elements.join(",")}`;}}
    for(let id=2;id<=16;id++){
      const rotation=sourceClip.objects[id-1].frames[frameIndex].rotation;
      const expected=new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0],-rotation[1],-rotation[2],"XYZ"));
      const quaternionError=1-Math.abs(expected.dot(boneById.get(id).quaternion));
      if(quaternionError>maxQuaternionError){maxQuaternionError=quaternionError;worstQuaternion=`${sourceClip.name} frame ${frameIndex} bone ${id}`;}
    }
    validatedFrames++;
  }
  action.stop();
}
const maxAngularError=THREE.MathUtils.radToDeg(2*Math.acos(Math.min(1,1-maxQuaternionError)));
if(maxMatrixError>2e-3||maxAngularError>2)throw new Error(`FBX animation drift exceeds tolerance: root matrix ${maxMatrixError} at ${worstMatrix}; rotation ${maxAngularError}° at ${worstQuaternion}`);
console.log(`Three.js FBXLoader validated 1 SkinnedMesh, ${skinWeight.count} weighted vertices, ${bones.length} bones, ${character.animations.length} clips / ${validatedFrames} frames (max rotation drift ${maxAngularError.toFixed(3)}°), and pelvis bind ${pelvis.position.toArray().join(",")}`);
