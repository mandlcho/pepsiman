import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { applyExtractedPelvisMotion, applySetupTransform, TOD_TRANSLATION_SCALE } from "./rig-math.js";

const ASSET_ROOT = "./assets/ripped/pepsiman/";
const RETAIL_SEGMENTS = {
  0:{root:"./assets/ripped/stages/2/",world:"2003",props:"2004",entities:"2006-entities",spriteRoot:"./assets/ripped/textures/2/",spritePack:"2005"},
  1:{root:"./assets/ripped/stages/3/",world:"3003",props:"3004",entities:"3006-entities",spriteRoot:"./assets/ripped/textures/3/",spritePack:"3005"},
  2:{root:"./assets/ripped/stages/4/",world:"4002",props:"4004",entities:"4006-setpiece",overlayActors:"4000-overlay-setpiece",spriteRoot:"./assets/ripped/textures/4/",spritePack:"4005",chaseSprite:"4001-106.png",setpiece:true},
  3:{root:"./assets/ripped/stages/5/",world:"5003",props:"5004",entities:"5006-entities",spriteRoot:"./assets/ripped/textures/5/",spritePack:"5005"},
  4:{root:"./assets/ripped/stages/6/",world:"6003",props:"6004",entities:"6006-entities",spriteRoot:"./assets/ripped/textures/6/",spritePack:"6005"},
  5:{root:"./assets/ripped/stages/7/",world:"7002",props:"7004",entities:"7006-setpiece",overlayActors:"7000-overlay-actors",spriteRoot:"./assets/ripped/textures/7/",spritePack:"7005",setpiece:true,inferredRouteEnd:true},
  6:{root:"./assets/ripped/stages/8/",world:"8003",props:"8004",entities:"8006-entities",spriteRoot:"./assets/ripped/textures/8/",spritePack:"8005"},
  7:{root:"./assets/ripped/stages/9/",world:"9003",props:"9004",entities:"9006-entities",spriteRoot:"./assets/ripped/textures/9/",spritePack:"9005"},
  8:{root:"./assets/ripped/stages/A/",world:"A002",inferredRouteEnd:true},
  9:{root:"./assets/ripped/stages/B/",world:"B003",props:"B004",entities:"B006-entities",spriteRoot:"./assets/ripped/textures/B/",spritePack:"B005"},
  10:{root:"./assets/ripped/stages/C/",world:"C003",props:"C004",entities:"C006-entities",spriteRoot:"./assets/ripped/textures/C/",spritePack:"C005"},
  11:{root:"./assets/ripped/stages/D/",world:"D002",inferredRouteEnd:true},
  12:{root:"./assets/ripped/stages/E/",world:"E003",props:"E004",entities:"E006-entities",spriteRoot:"./assets/ripped/textures/E/",spritePack:"E005"},
  13:{root:"./assets/ripped/stages/F/",world:"F003",props:"F004",entities:"F006-entities",spriteRoot:"./assets/ripped/textures/F/",spritePack:"F005"}
};
const RETAIL_SEGMENT_COUNT=Object.keys(RETAIL_SEGMENTS).length;
const RETAIL_TEXTURE_ROOT = "./assets/ripped/textures/0/";
const RETAIL_WORLD_SCALE = .008;
const RETAIL_PICKUP_RADIUS = 50 * RETAIL_WORLD_SCALE;
const RETAIL_PLAYER_PICKUP_RADIUS = 35 * RETAIL_WORLD_SCALE;
const RETAIL_ENCOUNTER_PROXIMITY = 600 * RETAIL_WORLD_SCALE;
const RETAIL_REACTION_FPS = 30;
const RETAIL_REACTION_FRAMES = 15;
const RETAIL_FPS = 30;
const lanes = [-2.25, 0, 2.25];
const ROAD_EDGE_X = 3.8;
const STEER_SPEED = 7.2;
const GROUND_Y = 0;
const GRAVITY = 20;
const JUMP_VELOCITY = 8.3;
const LANDING_CONTACT_FRAME = 14;
const CHARACTER_FACING_YAW = Math.PI + THREE.MathUtils.degToRad(15);
const GAMEPLAY_CAMERA = {position:[0,3.8,6.2],lookAt:[0,1.45,-5.5]};
const RETAIL_STAGE_MOVIES = new Map([[3,2],[6,3],[9,4]]);
const ui = {
  start: document.querySelector("#start-screen"), button: document.querySelector("#start-button"), continueButton: document.querySelector("#continue-button"), openingButton: document.querySelector("#opening-button"),
  cinematic: document.querySelector("#cinematic"), cutscene: document.querySelector("#cutscene"), skipCutscene: document.querySelector("#skip-cutscene"),
  loading: document.querySelector("#loading"), hud: document.querySelector(".hud"),
  distance: document.querySelector("#distance"), cans: document.querySelector("#cans"),
  timeLeft: document.querySelector("#time-left"), totalTime: document.querySelector("#total-time"), progressFill: document.querySelector("#progress-fill"), lifeCount: document.querySelector("#life-count"), pause: document.querySelector("#pause-screen"), over: document.querySelector("#game-over"),
  overKicker: document.querySelector("#game-over > p"), overTitle: document.querySelector("#game-over h2"),
  final: document.querySelector("#final-distance"), retry: document.querySelector("#retry"),
  resultCans: document.querySelector("#result-cans"), resultTime: document.querySelector("#result-time"), resultHeading: document.querySelector("#result-heading"), resultStageNumber: document.querySelector("#result-stage-number"),
  callout: document.querySelector("#callout"), sound: document.querySelector("#sound"),
  music: document.querySelector("#music"), endingFlash: document.querySelector("#retail-ending-flash")
};

const renderer = new THREE.WebGLRenderer({ antialias:false, powerPreference:"high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
document.querySelector("#game").append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x64bce9);
scene.fog = new THREE.Fog(0x7dbbd5, 24, 105);
const camera = new THREE.PerspectiveCamera(53, innerWidth / innerHeight, .1, 180);
camera.position.fromArray(GAMEPLAY_CAMERA.position);
camera.lookAt(...GAMEPLAY_CAMERA.lookAt);
scene.add(new THREE.HemisphereLight(0xd9f4ff, 0x20334a, 2.3));
const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(-8, 13, 5); sun.castShadow = true; scene.add(sun);

const world = new THREE.Group(); scene.add(world);
const prototypeRoad = new THREE.Group(); world.add(prototypeRoad);
const prototypeBuildings = new THREE.Group(); world.add(prototypeBuildings);
const roadMaterial = new THREE.MeshLambertMaterial({ color:0x33404a });
const road = new THREE.Mesh(new THREE.PlaneGeometry(10, 220), roadMaterial);
road.rotation.x = -Math.PI / 2; road.position.z = -80; road.receiveShadow = true; prototypeRoad.add(road);
const curbMaterial = new THREE.MeshLambertMaterial({ color:0xd9e0df });
for (const x of [-5.25, 5.25]) {
  const curb = new THREE.Mesh(new THREE.BoxGeometry(.5,.22,220),curbMaterial);
  curb.position.set(x,.08,-80); prototypeRoad.add(curb);
}
const markings = [];
for (let z=-105; z<18; z+=7) for (const x of [-1.12,1.12]) {
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(.1,3.5),new THREE.MeshBasicMaterial({color:0xe9edf0}));
  mark.rotation.x=-Math.PI/2; mark.position.set(x,.015,z); prototypeRoad.add(mark); markings.push(mark);
}

const buildingMaterials = [0x345d7b,0x526d7e,0x23536b,0x6f7880].map(color=>new THREE.MeshLambertMaterial({color}));
for (let z=-110;z<12;z+=8) for (const side of [-1,1]) {
  const height=4+Math.random()*9, width=3+Math.random()*4;
  const b=new THREE.Mesh(new THREE.BoxGeometry(width,height,6),buildingMaterials[(Math.random()*4)|0]);
  b.position.set(side*(8+Math.random()*4),height/2-.1,z+Math.random()*3); prototypeBuildings.add(b);
  for(let y=1.4;y<height-1;y+=1.6) {
    const win=new THREE.Mesh(new THREE.PlaneGeometry(width*.65,.45),new THREE.MeshBasicMaterial({color:0x9ee4ff}));
    win.position.set(b.position.x-side*(width/2+.01),y,b.position.z+1); win.rotation.y=side*Math.PI/2; prototypeBuildings.add(win);
  }
}

const retailCourse={group:null,path:[],length:0,ready:false,setpiece:false,chunkCount:0,visiblePropCount:0,collectibleCount:0,encounterCount:0,collisionMeshes:[]};
const retailColliders=[];
const retailCollisionSurfaces=[];
const retailCollidedEntities=new Set();
const retailCollectibles=[];
const retailCollectedIds=new Set();
const retailEvents=new Map();
const retailEncounters=[];
const retailCollidedEncounterIds=new Set();
const retailScriptParticles=[];
const retailDynamicEntities=[];
const retailSetpieceActors=[];
let retailSetpieceCan=null;
let retailCanTexture=null;
let retailSetpieceFlow=null;
let stageOneEndingFlow=null;
let stageOneScriptedFlow=null;
let retailFinishFlow=null;
let retailPropTemplates=[];
const upAxis=new THREE.Vector3(0,1,0);
function coursePointAt(distance){
  if(!retailCourse.path.length)return null;
  const clamped=THREE.MathUtils.clamp(distance,0,retailCourse.length);
  for(let index=0;index<retailCourse.path.length-1;index++){
    const a=retailCourse.path[index],b=retailCourse.path[index+1];
    if(clamped<=b.distance){
      const mix=(clamped-a.distance)/(b.distance-a.distance||1);
      return{position:a.position.clone().lerp(b.position,mix),tangent:a.tangent.clone().lerp(b.tangent,mix).normalize()};
    }
  }
  const last=retailCourse.path.at(-1),previous=retailCourse.path.at(-2)||last;
  return{position:last.position.clone(),tangent:last.tangent||last.position.clone().sub(previous.position).normalize()};
}
function nearestCourseDistance(position){
  let nearest=0,best=Infinity;
  for(let index=0;index<retailCourse.path.length-1;index++){
    const a=retailCourse.path[index],b=retailCourse.path[index+1],segment=b.position.clone().sub(a.position),lengthSquared=segment.lengthSq();
    const mix=lengthSquared?THREE.MathUtils.clamp(position.clone().sub(a.position).dot(segment)/lengthSquared,0,1):0;
    const projected=a.position.clone().addScaledVector(segment,mix),distance=projected.distanceToSquared(position);
    if(distance<best){best=distance;nearest=THREE.MathUtils.lerp(a.distance,b.distance,mix);}
  }
  return nearest;
}
function retailCourseHeadingAt(position){
  let heading=0,best=Infinity;
  for(let index=0;index<retailCourse.path.length-1;index++){
    const a=retailCourse.path[index].position,b=retailCourse.path[index+1].position,dx=b.x-a.x,dz=b.z-a.z,lengthSquared=dx*dx+dz*dz;
    const mix=lengthSquared?THREE.MathUtils.clamp(((position.x-a.x)*dx+(position.z-a.z)*dz)/lengthSquared,0,1):0,offsetX=position.x-(a.x+dx*mix),offsetZ=position.z-(a.z+dz*mix),distance=offsetX*offsetX+offsetZ*offsetZ;
    if(distance<best){best=distance;heading=Math.atan2(dx,-dz);}
  }
  return heading;
}
function updateRetailCourse(distance){
  if(!retailCourse.ready)return;
  const sample=coursePointAt(distance),yaw=Math.atan2(sample.tangent.x,-sample.tangent.z);
  retailCourse.group.rotation.y=yaw;
  const anchor=sample.position.clone().multiplyScalar(RETAIL_WORLD_SCALE).applyAxisAngle(upAxis,yaw);
  retailCourse.group.position.set(-anchor.x,-anchor.y,1.3-anchor.z);
}
function unloadRetailCourse(){
  retailCourse.group?.removeFromParent();retailCourse.group=null;retailCourse.path.length=0;retailCourse.length=0;retailCourse.ready=false;retailCourse.setpiece=false;retailCourse.chunkCount=0;retailCourse.visiblePropCount=0;retailCourse.collectibleCount=0;retailCourse.encounterCount=0;retailCourse.collisionMeshes.length=0;
  retailColliders.length=0;retailCollisionSurfaces.length=0;retailCollectibles.length=0;retailEvents.clear();retailEncounters.length=0;retailDynamicEntities.length=0;retailSetpieceActors.length=0;retailSetpieceCan=null;retailSetpieceFlow=null;retailPropTemplates=[];
}
function worldSurfaceHeight(model,x,z){
  let height=-Infinity;
  for(const object of model.objects){
    const bounds=object.bounds;if(x<bounds.min[0]||x>bounds.max[0]||z<bounds.min[2]||z>bounds.max[2])continue;
    for(const primitive of object.groups){const positions=primitive.positions;for(let index=0;index<positions.length;index+=9){
      const ax=positions[index],ay=positions[index+1],az=positions[index+2],bx=positions[index+3],by=positions[index+4],bz=positions[index+5],cx=positions[index+6],cy=positions[index+7],cz=positions[index+8];
      const denominator=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(denominator)<1e-6)continue;
      const a=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/denominator,b=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/denominator,c=1-a-b;
      if(a>=-.001&&b>=-.001&&c>=-.001)height=Math.max(height,a*ay+b*by+c*cy);
    }}
  }
  return height;
}
async function loadRetailCourse(segmentIndex=0){
  const resources=RETAIL_SEGMENTS[segmentIndex];if(!resources)throw new Error(`Retail segment ${segmentIndex} has not been extracted yet`);
  unloadRetailCourse();
  const [model,propModel,entityTable,retailFlow,setpieceTable]=await Promise.all([
    fetch(`${resources.root}${resources.world}.json`).then(response=>response.json()),
    resources.props?fetch(`${resources.root}${resources.props}.json`).then(response=>response.json()):{objects:[]},
    resources.entities?fetch(`${resources.root}${resources.entities}.json`).then(response=>response.json()):{entities:[],collisionSpheres:[],collisionSurfaces:[],collectibles:[],encounterRecords:[],eventRecords:[]},
    fetch("./assets/ripped/retail-flow.json").then(response=>response.json()),
    resources.overlayActors?fetch(`${resources.root}${resources.overlayActors}.json`).then(response=>response.json()):null
  ]);
  stageOneEndingFlow=retailFlow.scenes.find(scene=>scene.sceneIndex===segmentIndex)?.ending||null;
  stageOneScriptedFlow=segmentIndex===0?retailFlow.stageOneScriptedEvents.find(event=>event.eventRecordIndex===194)||null:null;
  retailFinishFlow=retailFlow.finishController||null;
  const group=new THREE.Group();group.name=`retail-segment-${segmentIndex}-course`;group.scale.setScalar(RETAIL_WORLD_SCALE);world.add(group);
  const textureLoader=new THREE.TextureLoader(),materials=new Map();
  const materialFor=(name,semiTransparent=false)=>{
    const key=`${name}:${semiTransparent}`;
    if(materials.has(key))return materials.get(key);
    const pending=(async()=>{
      if(name==="vertex-color")return new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:semiTransparent,opacity:semiTransparent?.5:1,depthWrite:!semiTransparent});
      const texture=await textureLoader.loadAsync(`${resources.root}textures/${name.slice(4)}.png`);
      texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;
      return new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,transparent:semiTransparent,alphaTest:.05,depthWrite:!semiTransparent});
    })();
    materials.set(key,pending);return pending;
  };
  const materialDefinitions=new Map([...model.objects,...propModel.objects].flatMap(object=>object.groups.map(primitive=>[`${primitive.material}:${Boolean(primitive.semiTransparent)}`,primitive])));
  await Promise.all([...materialDefinitions.values()].map(primitive=>materialFor(primitive.material,primitive.semiTransparent)));
  const makeObject=async(object,name)=>{
    const objectGroup=new THREE.Group();objectGroup.name=name;
    for(const primitive of object.groups){
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.Float32BufferAttribute(primitive.positions,3));
      if(primitive.uvs.length)geometry.setAttribute("uv",new THREE.Float32BufferAttribute(primitive.uvs,2));
      if(primitive.colors.length)geometry.setAttribute("color",new THREE.Float32BufferAttribute(primitive.colors,3));
      const mesh=new THREE.Mesh(geometry,await materialFor(primitive.material,primitive.semiTransparent));mesh.frustumCulled=false;objectGroup.add(mesh);
    }
    return objectGroup;
  };
  const roadHeight=model.objects[0].bounds.min[1];
  for(const object of model.objects){
    const chunk=await makeObject(object,`course-chunk-${object.id}`);group.add(chunk);
    chunk.traverse(child=>{if(child.isMesh)retailCourse.collisionMeshes.push(child);});
  }
  retailCourse.chunkCount=model.objects.length;
  const propTemplates=await Promise.all(propModel.objects.map(object=>makeObject(object,`prop-template-${object.id}`)));
  retailPropTemplates=propTemplates;
  const collisionSpheresByModel=Array.from({length:propModel.objects.length},()=>[]);
  const collisionSurfacesByModel=Array.from({length:propModel.objects.length},()=>[]);
  for(const sphere of entityTable.collisionSpheres||[])collisionSpheresByModel[sphere.model].push(sphere);
  for(const surface of entityTable.collisionSurfaces||[])collisionSurfacesByModel[surface.model].push(surface);
  for(const entity of entityTable.entities){
    if(!entity.active||entity.currentModel<0)continue;
    const prop=propTemplates[entity.currentModel].clone(true);prop.name=`retail-entity-${entity.id}`;
    prop.position.fromArray(entity.position);prop.rotation.y=entity.baseYawRadians??-(entity.baseRotation?.[1]||0)*Math.PI*2/4096;
    prop.scale.set(Math.abs(entity.scale[0]),Math.abs(entity.scale[1]),Math.abs(entity.scale[0]));group.add(prop);retailCourse.visiblePropCount++;
    let dynamic=null;
    if([1,2,5,6,7,8,15,18,20,36,38,43,44,45,46].includes(entity.behavior)){
      dynamic={entityId:entity.id,object:prop,secondary:null,behavior:entity.behavior,variant:entity.motionVariant,heading:entity.motionHeadingRadians,initialHeading:entity.motionHeadingRadians,baseRotationY:prop.rotation.y,basePosition:prop.position.clone(),baseModel:entity.currentModel,currentModel:entity.currentModel,collisionSpheresByModel,scaleFactor:Math.max(Math.abs(entity.scale[0]),Math.abs(entity.scale[1])),colliders:[],courseDistance:0,ageFrames:0,phase:0,phaseFrames:0,phaseDistance:0,active:false};
      if([15,18,43].includes(entity.behavior)&&propTemplates[entity.currentModel+1]){
        const secondary=propTemplates[entity.currentModel+1].clone(true);secondary.name=`retail-entity-${entity.id}-paired`;secondary.position.copy(prop.position);secondary.rotation.copy(prop.rotation);secondary.scale.copy(prop.scale);secondary.visible=false;group.add(secondary);dynamic.secondary=secondary;
      }
      retailDynamicEntities.push(dynamic);
    }
    for(const sphere of collisionSpheresByModel[entity.currentModel]){
      const collider={entityId:entity.id,behavior:entity.behavior,object:prop,center:new THREE.Vector3().fromArray(sphere.center),radius:sphere.radius*RETAIL_WORLD_SCALE*Math.max(Math.abs(entity.scale[0]),Math.abs(entity.scale[1])),collisionClass:sphere.collisionClass,collisionVariant:sphere.collisionVariant,reactionParameters:sphere.reactionParameters};
      retailColliders.push(collider);dynamic?.colliders.push(collider);
    }
    if(dynamic?.secondary)for(const sphere of collisionSpheresByModel[entity.currentModel+1]){
      const collider={entityId:entity.id,behavior:entity.behavior,object:dynamic.secondary,center:new THREE.Vector3().fromArray(sphere.center),radius:sphere.radius*RETAIL_WORLD_SCALE*dynamic.scaleFactor,collisionClass:sphere.collisionClass,collisionVariant:sphere.collisionVariant,reactionParameters:sphere.reactionParameters};
      retailColliders.push(collider);dynamic.colliders.push(collider);
    }
    for(const surface of collisionSurfacesByModel[entity.currentModel])retailCollisionSurfaces.push({
      entityId:entity.id,
      object:prop,
      vertices:surface.vertices.map(vertex=>new THREE.Vector3().fromArray(vertex))
    });
  }
  retailCanTexture=await textureLoader.loadAsync(`${RETAIL_TEXTURE_ROOT}0001-023.png`);
  retailCanTexture.colorSpace=THREE.SRGBColorSpace;retailCanTexture.magFilter=THREE.NearestFilter;retailCanTexture.minFilter=THREE.NearestFilter;retailCanTexture.repeat.set(.5,1);
  const canMaterial=new THREE.SpriteMaterial({map:retailCanTexture,transparent:true,alphaTest:.05,depthWrite:false});
  for(const collectible of entityTable.collectibles||[]){
    if(!collectible.active)continue;
    const sprite=new THREE.Sprite(canMaterial);sprite.name=`retail-collectible-${collectible.id}`;sprite.position.fromArray(collectible.position);sprite.scale.set(60,60,1);sprite.center.set(.5,0);group.add(sprite);
    retailCollectibles.push({id:collectible.id,sprite});
  }
  retailCourse.collectibleCount=retailCollectibles.length;
  const setpieceDefinitions=resources.setpiece?entityTable.encounterRecords.filter(record=>record.active):[];
  const activeEncounterRecords=resources.setpiece?[]:entityTable.encounterRecords.filter(record=>record.active);
  const encounterFrameIds=[...new Set(activeEncounterRecords.flatMap(record=>{
    const behaviorState=record.runtimeBytes36To39[2]&0x3f;
    return behaviorState===1||behaviorState===2?[record.spriteFrameId,record.spriteFrameId+1]:[record.spriteFrameId];
  }))];
  const encounterMaterials=new Map(await Promise.all(encounterFrameIds.map(async frameId=>{
    const texture=await textureLoader.loadAsync(`${resources.spriteRoot}${resources.spritePack}-${String(frameId).padStart(3,"0")}.png`);
    texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;
    return[frameId,new THREE.SpriteMaterial({map:texture,transparent:true,alphaTest:.05,depthWrite:false})];
  })));
  const encounterActivationEventIds=new Set(activeEncounterRecords.map(record=>record.eventRecordIndex));
  const linkedEventIds=new Set([...encounterActivationEventIds].flatMap(eventId=>[eventId,eventId+1]));if(segmentIndex===0){linkedEventIds.add(194);linkedEventIds.add(196);}else if(segmentIndex===1)linkedEventIds.add(198);
  for(const event of entityTable.eventRecords){
    if(!linkedEventIds.has(event.id))continue;
    retailEvents.set(event.id,{id:event.id,initialState:event.initialState,state:event.initialState,vertices:event.triggerVertices.map(vertex=>new THREE.Vector3().fromArray(vertex))});
  }
  for(const encounter of activeEncounterRecords){
    const sprite=new THREE.Sprite(encounterMaterials.get(encounter.spriteFrameId));sprite.name=`retail-encounter-${encounter.id}`;sprite.position.fromArray(encounter.position);
    const height=Math.abs(encounter.field30),width=height*.5*(encounter.field28<0?-1:1);sprite.scale.set(width,height,1);sprite.center.set(.5,0);sprite.visible=false;group.add(sprite);
    const behaviorState=encounter.runtimeBytes36To39[2]&0x3f;
    retailEncounters.push({id:encounter.id,eventId:encounter.eventRecordIndex,sprite,basePosition:sprite.position.clone(),baseMaterial:sprite.material,nextMaterial:encounterMaterials.get(encounter.spriteFrameId+1),behaviorState,collisionEnabled:Boolean(encounter.runtimeBytes36To39[2]&0x80),radius:Math.abs(encounter.field32)/3*RETAIL_WORLD_SCALE,reaction:null,removed:false});
  }
  retailCourse.encounterCount=retailEncounters.length;
  if(setpieceTable){
    retailSetpieceFlow=setpieceTable;
    const definitionByType=new Map(setpieceDefinitions.map((definition,index)=>[index,definition]));
    const setpieceMaterials=new Map(await Promise.all([...definitionByType].map(async([type])=>{
      const frameId=type+1,texture=await textureLoader.loadAsync(`${resources.spriteRoot}${resources.spritePack}-${String(frameId).padStart(3,"0")}.png`);
      texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;
      return[type,new THREE.SpriteMaterial({map:texture,transparent:true,alphaTest:.05,depthWrite:false})];
    })));
    const controllerByType=new Map(setpieceTable.activeControllerMetadata.map(controller=>[controller.controllerType,controller]));
    for(const authored of setpieceTable.actors){
      const definition=definitionByType.get(authored.controllerType),material=setpieceMaterials.get(authored.controllerType)?.clone();if(!definition||!material)continue;
      const displayYOffset=[5,7].includes(authored.controllerType)?60:0;
      const sprite=new THREE.Sprite(material);sprite.name=`retail-setpiece-actor-${authored.id}`;sprite.position.set(authored.forward,-authored.vertical+displayYOffset,-authored.lateral);
      const height=Math.abs(definition.field30),width=height*.5;sprite.scale.set(width,height,1);sprite.center.set(.5,0);group.add(sprite);
      const controller=controllerByType.get(authored.controllerType);
      retailSetpieceActors.push({id:authored.id,type:authored.controllerType,sprite,sourcePosition:new THREE.Vector3(authored.forward,-authored.vertical,-authored.lateral),basePosition:sprite.position.clone(),bounds:{forward:controller.collisionForwardRadius,lateral:controller.collisionLateralRadius,vertical:controller.collisionVerticalLowerExtent,damage:controller.collisionResponse==="damage",blockForwardOffset:controller.blockForwardOffset},state:0,frame:0});
    }
    if(resources.chaseSprite&&setpieceTable.chaseCan){
      const texture=await textureLoader.loadAsync(`${resources.spriteRoot}${resources.chaseSprite}`);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;
      const material=new THREE.SpriteMaterial({map:texture,transparent:true,alphaTest:.75,depthWrite:false});
      const sprite=new THREE.Sprite(material);sprite.name="retail-setpiece-chase-can";sprite.center.set(.5,.5);sprite.scale.setScalar(setpieceTable.chaseCan.browserBillboardSize);group.add(sprite);
      retailSetpieceCan={sprite,sourceForward:setpieceTable.chaseCan.initialForward,initialForward:setpieceTable.chaseCan.initialForward,vertical:setpieceTable.chaseCan.browserVerticalCenter,lateral:-setpieceTable.chaseCan.initialLateral};
      sprite.position.set(retailSetpieceCan.sourceForward,retailSetpieceCan.vertical,retailSetpieceCan.lateral);
    }
    retailCourse.encounterCount=retailSetpieceActors.length;
  }
  const authoredPath=model.sceneControl?.coursePath||[];
  const authoredSpawn=model.sceneControl?.spawn?.position;
  if(resources.setpiece){
    retailCourse.path.push({position:new THREE.Vector3(setpieceTable.playerStartForward,roadHeight,0),distance:0,tangent:null},{position:new THREE.Vector3(setpieceTable.finishForward,roadHeight,0),distance:0,tangent:null});
  }else if(authoredSpawn&&authoredPath.length){
    const sourcePoints=[[authoredSpawn[0],authoredSpawn[2]],...authoredPath.slice(1).map(point=>point.position)];
    const heights=sourcePoints.map(([x,z])=>worldSurfaceHeight(model,x,z));
    for(let index=0;index<heights.length;index++)if(!Number.isFinite(heights[index]))heights[index]=heights[index-1]??heights.slice(index+1).find(Number.isFinite)??roadHeight;
    sourcePoints.forEach(([x,z],index)=>retailCourse.path.push({position:new THREE.Vector3(x,heights[index],z),distance:0,tangent:null}));
  }else{
    for(const object of model.objects){
      const min=object.bounds.min,max=object.bounds.max;
      retailCourse.path.push({position:new THREE.Vector3((min[0]+max[0])/2,roadHeight,(min[2]+max[2])/2),distance:0,tangent:null});
    }
  }
  for(let index=0;index<retailCourse.path.length;index++){
    const previous=retailCourse.path[Math.max(0,index-1)].position,next=retailCourse.path[Math.min(retailCourse.path.length-1,index+1)].position;
    retailCourse.path[index].tangent=next.clone().sub(previous).normalize();
    if(index>0)retailCourse.path[index].distance=retailCourse.path[index-1].distance+retailCourse.path[index].position.distanceTo(retailCourse.path[index-1].position)*RETAIL_WORLD_SCALE;
  }
  for(const dynamic of retailDynamicEntities){const localPosition=dynamic.basePosition.clone();dynamic.courseDistance=nearestCourseDistance(localPosition);dynamic.object.visible=[20,44,45].includes(dynamic.behavior);}
  retailCourse.group=group;retailCourse.length=retailCourse.path.at(-1).distance;retailCourse.ready=true;retailCourse.setpiece=Boolean(resources.setpiece);prototypeRoad.visible=false;prototypeBuildings.visible=false;updateRetailCourse(0);
  state.segmentIndex=segmentIndex;
}

let rig, material, idleClip, runClip, jumpClip, airborneClip, landingClip, slideClip, collisionClip, proneClip, endingApproachClip, endingCameraClip;
const nodes = new Map();
const baseTransforms = new Map();
const bindTransforms = new Map();

async function loadCharacter() {
  const [model, animations, texture] = await Promise.all([
    fetch(`${ASSET_ROOT}model.json`).then(r=>r.json()),
    fetch(`${ASSET_ROOT}animations.json`).then(r=>r.json()),
    new THREE.TextureLoader().loadAsync(`${ASSET_ROOT}texture.png`)
  ]);
  texture.colorSpace=THREE.SRGBColorSpace; texture.magFilter=THREE.NearestFilter; texture.minFilter=THREE.NearestFilter;
  material=new THREE.MeshLambertMaterial({map:texture,side:THREE.DoubleSide,transparent:true,alphaTest:.05});
  rig=new THREE.Group(); rig.scale.setScalar(.008); rig.rotation.y=CHARACTER_FACING_YAW; scene.add(rig);
  let overrides={};
  try { overrides=JSON.parse(localStorage.getItem("pepsiman-skeleton-overrides-v1")||"{}").joints||{}; } catch { overrides={}; }

  for (const setup of animations.setup.objects) {
    const node=new THREE.Group(); node.name=setup.id===1001?"root-1001":`joint-${setup.id}`; nodes.set(setup.id,node);
    const frame=setup.frames[0]||{};
    applySetupTransform(node,frame);
    baseTransforms.set(setup.id,{position:node.position.clone(),rotation:node.rotation.clone()});
    const override=overrides[setup.id];
    if(override?.position)node.position.fromArray(override.position);
    if(override?.rotation)node.rotation.fromArray([...override.rotation,"XYZ"]);
    bindTransforms.set(setup.id,{position:node.position.clone(),rotation:node.rotation.clone()});
  }
  for (const setup of animations.setup.objects) {
    if (!nodes.has(setup.id)) continue;
    const parent=nodes.get(setup.parentId); (parent||rig).add(nodes.get(setup.id));
  }
  for (const part of model.objects.slice(0,16)) {
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(part.positions,3));
    geometry.setAttribute("uv",new THREE.Float32BufferAttribute(part.uvs,2));
    geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material); mesh.castShadow=true; mesh.receiveShadow=true;
    nodes.get(part.id)?.add(mesh);
  }
  rig.position.set(0,.02,1.3);
  idleClip=animations.clips.find(clip=>clip.id===51);
  runClip=animations.clips.find(clip=>clip.id===4);
  jumpClip=animations.clips.find(clip=>clip.id===6);
  airborneClip=animations.clips.find(clip=>clip.id===7);
  landingClip=animations.clips.find(clip=>clip.id===8);
  slideClip=animations.clips.find(clip=>clip.id===30);
  collisionClip=animations.clips.find(clip=>clip.id===9);
  proneClip=animations.clips.find(clip=>clip.id===19);
  endingApproachClip=animations.clips.find(clip=>clip.id===23);
  endingCameraClip=animations.clips.find(clip=>clip.id===25);
}

function lerpAngle(a,b,t){return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;}
function sampleTrack(track,frame,frameCount){
  let a=track.frames[0],b=a;
  for(let i=0;i<track.frames.length;i++)if(track.frames[i].time<=frame){a=track.frames[i];b=track.frames[(i+1)%track.frames.length]||a;}
  const span=((b.time-a.time+frameCount)%frameCount)||1,mix=((frame-a.time+frameCount)%frameCount)/span,br=b.rotation||a.rotation;
  return{rotation:a.rotation.map((value,index)=>lerpAngle(value,br[index],mix)),translation:a.translation?.map((value,index)=>THREE.MathUtils.lerp(value,(b.translation||a.translation)[index],mix))};
}
function sampleAnimation(clip,time,loop=true,lockPelvisHeight=false){
  if(!clip)return;
  for(const [id,node] of nodes){const bind=bindTransforms.get(id);node.position.copy(bind.position);node.rotation.copy(bind.rotation);}
  const frame=loop?(time*clip.fps)%clip.frameCount:Math.min(time*clip.fps,clip.frameCount-1);
  const rootTrack=clip.objects.find(track=>track.id===1);
  if(rootTrack?.frames.length){
    const rootSample=sampleTrack(rootTrack,frame,clip.frameCount);
    applyExtractedPelvisMotion(THREE,nodes.get(1),bindTransforms.get(1),baseTransforms.get(1),rootSample);
    if(lockPelvisHeight)nodes.get(1).position.y=bindTransforms.get(1).position.y;
  }
  for(const track of clip.objects){
    if(track.id===1)continue;
    const node=nodes.get(track.id),base=baseTransforms.get(track.id),bind=bindTransforms.get(track.id);if(!node||!track.frames.length)continue;
    const sample=sampleTrack(track,frame,clip.frameCount);
    node.rotation.set(sample.rotation[0]+bind.rotation.x-base.rotation.x,-sample.rotation[1]+bind.rotation.y-base.rotation.y,-sample.rotation[2]+bind.rotation.z-base.rotation.z,"XYZ");
    if(sample.translation)node.position.set(sample.translation[0]*TOD_TRANSLATION_SCALE+bind.position.x-base.position.x,-sample.translation[1]*TOD_TRANSLATION_SCALE+bind.position.y-base.position.y,-sample.translation[2]*TOD_TRANSLATION_SCALE+bind.position.z-base.position.z);
  }
}

const input={left:false,right:false,forward:false,backward:false,square:false,gamepadX:0};
const gamepadState={jump:false,slide:false,forward:false,backward:false};
const state={running:false,paused:false,completed:false,ending:null,scripted:null,results:null,segmentIndex:0,x:0,vx:0,y:GROUND_Y,vy:0,grounded:true,jumpTime:0,landingTime:0,slide:0,slideTime:0,sprint:0,brake:0,distance:0,elapsed:0,cans:0,lives:3,speed:12,lastSpawn:-90,muted:false,invulnerable:0,hurryShown:false};
function playerControlLocked(){return Boolean(state.paused||state.ending||(state.scripted&&state.scripted.phase<4));}
function setSteering(direction,active){if(direction<0)input.left=active;else input.right=active;}
function jump(){if(state.running&&!playerControlLocked()&&state.grounded&&state.slide<=0){state.vy=JUMP_VELOCITY;state.grounded=false;state.jumpTime=.0001;state.landingTime=0;}}
function slide(){if(state.running&&!playerControlLocked()&&state.grounded){state.landingTime=0;if(state.slide<=0)state.slideTime=0;state.slide=slideClip?(slideClip.frameCount-1)/slideClip.fps:.8;state.sprint=0;state.brake=0;}}
function squareAction(){if(!state.running||playerControlLocked()||!state.grounded)return;if(input.forward||gamepadState.forward){state.sprint=.7;state.brake=0;state.slide=0;state.slideTime=0;}else if(input.backward||gamepadState.backward){state.brake=.55;state.sprint=0;state.slide=0;state.slideTime=0;}else slide();}
function readGamepad(){
  const pad=navigator.getGamepads?.()[0];if(!pad){input.gamepadX=0;gamepadState.forward=false;gamepadState.backward=false;gamepadState.jump=false;gamepadState.slide=false;return;}
  const wasBackward=gamepadState.backward,stick=Math.abs(pad.axes[0]||0)>.16?pad.axes[0]:0,dpad=(pad.buttons[15]?.pressed?1:0)-(pad.buttons[14]?.pressed?1:0);input.gamepadX=THREE.MathUtils.clamp(stick||dpad,-1,1);gamepadState.forward=Boolean(pad.buttons[12]?.pressed);gamepadState.backward=Boolean(pad.buttons[13]?.pressed);
  const jumpPressed=Boolean(pad.buttons[0]?.pressed),slidePressed=Boolean(pad.buttons[2]?.pressed);if(jumpPressed&&!gamepadState.jump)jump();if(gamepadState.backward&&!wasBackward&&!slidePressed)slide();if(slidePressed&&!gamepadState.slide)squareAction();gamepadState.jump=jumpPressed;gamepadState.slide=slidePressed;
}
const surfaceWorldVertices=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
const groundRaycaster=new THREE.Raycaster();
const groundRayOrigin=new THREE.Vector3();
const downDirection=new THREE.Vector3(0,-1,0);
const GROUND_STEP_HEIGHT=.2;
function pointInTriangleXZ(px,pz,a,b,c){
  const edge=(u,v)=>(px-u.x)*(v.z-u.z)-(pz-u.z)*(v.x-u.x);
  const ab=edge(a,b),bc=edge(b,c),ca=edge(c,a);
  return(ab>=0&&bc>=0&&ca>=0)||(ab<=0&&bc<=0&&ca<=0);
}
function runnerGroundHeight(){
  let height=-Infinity;
  const runnerX=state.x,runnerZ=rig.position.z;
  groundRayOrigin.set(runnerX,50,runnerZ);groundRaycaster.set(groundRayOrigin,downDirection);groundRaycaster.far=100;
  for(const contact of groundRaycaster.intersectObjects(retailCourse.collisionMeshes,false)){
    if(state.y>=contact.point.y-GROUND_STEP_HEIGHT){height=Math.max(height,contact.point.y);break;}
  }
  for(const surface of retailCollisionSurfaces){
    if(!surface.object.visible)continue;
    for(let index=0;index<4;index++)surface.object.localToWorld(surfaceWorldVertices[index].copy(surface.vertices[index]));
    const [a,b,c,d]=surfaceWorldVertices;
    if(!pointInTriangleXZ(runnerX,runnerZ,a,b,c)&&!pointInTriangleXZ(runnerX,runnerZ,b,d,c))continue;
    const surfaceHeight=(a.y+b.y+c.y+d.y)/4;
    if(state.y>=surfaceHeight-GROUND_STEP_HEIGHT)height=Math.max(height,surfaceHeight);
  }
  return Number.isFinite(height)?height:GROUND_Y;
}
function updateVerticalMotion(dt,groundHeight){
  const wasGrounded=state.grounded;
  if(wasGrounded&&Math.abs(state.y-groundHeight)<=GROUND_STEP_HEIGHT){state.y=groundHeight;state.vy=0;if(state.landingTime>0)state.landingTime+=dt;return;}
  state.vy-=GRAVITY*dt;const nextY=state.y+state.vy*dt,landed=!wasGrounded&&state.vy<=0&&nextY<=groundHeight;
  if(nextY<=groundHeight&&state.vy<=0){state.y=groundHeight;state.vy=0;state.grounded=true;}else{state.y=nextY;state.grounded=false;state.jumpTime+=dt;}
  if(landed){state.jumpTime=0;state.landingTime=.0001;}else if(state.landingTime>0)state.landingTime+=dt;
}
function callout(kind){if(kind!=="danger"&&kind!=="hurry")return;ui.callout.dataset.kind=kind;ui.callout.classList.remove("show");requestAnimationFrame(()=>ui.callout.classList.add("show"));setTimeout(()=>ui.callout.classList.remove("show"),700);}
function togglePause(){if(!state.running||state.ending)return;state.paused=!state.paused;ui.pause.hidden=!state.paused;if(state.paused)ui.music.pause();else if(!state.muted)ui.music.play().catch(()=>{});}
function blip(frequency=650){if(state.muted)return;const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=frequency;gain.gain.setValueAtTime(.08,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.12);osc.connect(gain).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.13);}
function setRetailDynamicModel(dynamic,modelIndex){
  if(dynamic.currentModel===modelIndex)return;
  const replacement=retailPropTemplates[modelIndex]?.clone(true);if(!replacement)return;
  dynamic.object.clear();for(const child of [...replacement.children])dynamic.object.add(child);
  const profiles=dynamic.collisionSpheresByModel[modelIndex]||[];
  dynamic.colliders.forEach((collider,index)=>{
    const profile=profiles[index];
    if(!profile){collider.collisionClass=0;return;}
    collider.center.fromArray(profile.center);collider.radius=profile.radius*RETAIL_WORLD_SCALE*dynamic.scaleFactor;collider.collisionClass=profile.collisionClass;collider.collisionVariant=profile.collisionVariant;collider.reactionParameters=profile.reactionParameters;
  });
  dynamic.currentModel=modelIndex;
}

let cutsceneCompletion=null;
function finishCutscene(){
  if(!cutsceneCompletion)return;
  const completion=cutsceneCompletion;cutsceneCompletion=null;ui.cutscene.pause();ui.cutscene.removeAttribute("src");ui.cutscene.load();ui.cinematic.hidden=true;completion();
}
function playCutscene(movie,completion){
  if(cutsceneCompletion)return;
  cutsceneCompletion=completion;ui.start.classList.add("hidden");ui.cinematic.hidden=false;ui.cutscene.src=`./assets/video/movie${movie}.mp4`;ui.cutscene.currentTime=0;ui.cutscene.muted=state.muted;
  ui.cutscene.play().catch(error=>{console.error(error);finishCutscene();});
}
function beginRetailOpening(){if(!ui.button.disabled)playCutscene(1,startGame);}
function playOriginalOpening(){if(!ui.button.disabled)playCutscene(0,()=>ui.start.classList.remove("hidden"));}
function readRetailProgress(){try{return JSON.parse(localStorage.getItem("pepsiman-progress-v1")||"null");}catch{return null;}}
function updateContinueButton(){const progress=readRetailProgress(),segment=Number(progress?.currentSegment);ui.continueButton.hidden=!(segment>0&&segment<RETAIL_SEGMENT_COUNT);if(!ui.continueButton.hidden)ui.continueButton.querySelector("span").textContent=String(segment+1);}
function saveRetailProgress(segment){const previous=readRetailProgress()||{};try{localStorage.setItem("pepsiman-progress-v1",JSON.stringify({currentSegment:segment,unlockedSegment:Math.max(previous.unlockedSegment||0,segment)}));}catch{}updateContinueButton();}
async function continueRetailGame(){const segment=Number(readRetailProgress()?.currentSegment);if(!(segment>0&&segment<RETAIL_SEGMENT_COUNT)||ui.button.disabled)return;ui.button.disabled=true;ui.continueButton.disabled=true;try{await loadRetailCourse(segment);startGame();}catch(error){console.error(error);ui.loading.textContent="CONTINUE LOAD FAILED";}finally{ui.button.disabled=false;ui.continueButton.disabled=false;}}

function startGame(){if(!rig)return;retailCollidedEntities.clear();retailCollectedIds.clear();retailCollidedEncounterIds.clear();for(const particle of retailScriptParticles)particle.object.removeFromParent();retailScriptParticles.length=0;for(const collectible of retailCollectibles)collectible.sprite.visible=true;for(const event of retailEvents.values())event.state=event.initialState;for(const encounter of retailEncounters){encounter.sprite.visible=false;encounter.sprite.position.copy(encounter.basePosition);encounter.sprite.material=encounter.baseMaterial;encounter.reaction=null;encounter.removed=false;}for(const actor of retailSetpieceActors){actor.sprite.position.copy(actor.basePosition);actor.sprite.material.rotation=0;actor.sprite.visible=false;actor.state=0;actor.frame=0;}if(retailSetpieceCan){retailSetpieceCan.sourceForward=retailSetpieceCan.initialForward;retailSetpieceCan.sprite.position.set(retailSetpieceCan.sourceForward,retailSetpieceCan.vertical,retailSetpieceCan.lateral);retailSetpieceCan.sprite.visible=true;}for(const dynamic of retailDynamicEntities){setRetailDynamicModel(dynamic,dynamic.baseModel);dynamic.object.position.copy(dynamic.basePosition);dynamic.object.rotation.y=dynamic.baseRotationY;dynamic.object.visible=[20,44,45].includes(dynamic.behavior);if(dynamic.secondary){dynamic.secondary.position.copy(dynamic.basePosition);dynamic.secondary.rotation.y=dynamic.baseRotationY;dynamic.secondary.visible=false;}dynamic.heading=dynamic.initialHeading;dynamic.ageFrames=0;dynamic.phase=0;dynamic.phaseFrames=0;dynamic.phaseDistance=0;dynamic.phaseStart=null;dynamic.turnStart=0;dynamic.active=false;}state.running=true;state.paused=false;state.completed=false;state.ending=null;state.scripted=null;state.results=null;state.distance=0;state.elapsed=0;state.cans=0;state.lives=3;state.speed=12;state.x=0;state.vx=0;state.y=GROUND_Y;state.vy=0;state.grounded=true;state.jumpTime=0;state.landingTime=0;state.slide=0;state.slideTime=0;state.sprint=0;state.brake=0;state.invulnerable=0;state.hurryShown=false;input.left=false;input.right=false;input.forward=false;input.backward=false;input.square=false;input.gamepadX=0;rig.position.x=0;rig.position.z=1.3;ui.pause.hidden=true;ui.over.className="game-over";ui.overKicker.textContent="REFRESHMENT INTERRUPTED";ui.overTitle.innerHTML="GAME<br>OVER";ui.retry.hidden=false;ui.retry.textContent="RUN AGAIN";ui.start.classList.add("hidden");ui.over.hidden=true;ui.hud.hidden=false;ui.music.currentTime=0;ui.music.volume=.5;ui.music.play().catch(()=>{});updateRetailCourse(0);updateHud();}
function hit(){if(state.invulnerable>0)return;state.invulnerable=1.25;state.lives--;blip(110);callout("danger");updateHud();if(state.lives<=0){state.running=false;ui.music.pause();ui.retry.hidden=false;ui.retry.textContent="CONTINUE";ui.final.textContent=`${Math.floor(state.distance)} m`;ui.over.hidden=false;}}
function beginRetailChaseCatch(){if(!state.ending)state.ending={kind:"retail-catch",frame:0};}
function updateRetailChaseCatch(dt){
  const ending=state.ending,frameDelta=dt*RETAIL_FPS;ending.frame+=frameDelta;advanceRetailEndingCan(frameDelta);sampleAnimation(collisionClip,Math.min(ending.frame,collisionClip.frameCount-1)/collisionClip.fps,false);
  if(ending.frame<retailSetpieceFlow.chaseCatch.recoveryFrames)return;
  if(state.lives<=1){state.ending=null;state.invulnerable=0;hit();return;}
  const lives=state.lives-1;startGame();state.lives=lives;updateHud();
}
function beginRetailSetpieceEnding(){
  if(!state.running||state.ending||!retailSetpieceFlow?.chaseEnding)return;
  state.ending={kind:"retail-setpiece",phase:"centering",frame:0,animationTime:0,baseRigYaw:rig.rotation.y,cameraShakeX:0,cameraShakeY:0,impactPulse:0,impactPlayed:false};
  state.vx=0;state.vy=0;state.grounded=true;input.left=false;input.right=false;input.gamepadX=0;rig.visible=true;ui.endingFlash.style.opacity="0";
}
function endingFrameDelta(previous,current,limit){return Math.max(0,Math.min(current,limit)-Math.min(previous,limit));}
function advanceRetailEndingCan(frameDelta){
  if(!retailSetpieceCan||frameDelta<=0)return;
  retailSetpieceCan.sourceForward+=retailSetpieceFlow.retailAdvanceUnitsPerFrame*frameDelta;
  retailSetpieceCan.sprite.position.set(retailSetpieceCan.sourceForward,retailSetpieceCan.vertical,retailSetpieceCan.lateral);
}
function spawnRetailEndingImpact(ending,flow){
  ending.effects=[];if(!retailSetpieceCan)return;
  for(let index=0;index<flow.impactEffectCount;index++){
    const angle=index/flow.impactEffectCount*Math.PI*2,sprite=new THREE.Sprite(retailSetpieceCan.sprite.material.clone());
    sprite.name=`retail-chase-impact-${index}`;sprite.position.copy(retailSetpieceCan.sprite.position);sprite.scale.setScalar(85);retailCourse.group.add(sprite);
    ending.effects.push({sprite,age:0,velocity:new THREE.Vector3(Math.cos(angle)*(20+index%4*5),18+(index*7)%24,Math.sin(angle)*(20+(index+2)%4*5))});
  }
}
function updateRetailEndingImpact(ending,frameDelta){
  for(const effect of ending.effects||[]){effect.age+=frameDelta;effect.velocity.y-=1.5*frameDelta;effect.sprite.position.addScaledVector(effect.velocity,frameDelta);effect.sprite.material.opacity=Math.max(0,1-effect.age/40);}
}
function removeRetailEndingImpact(ending){for(const effect of ending.effects||[]){effect.sprite.removeFromParent();effect.sprite.material.dispose();}ending.effects=[];}
function updateRetailSetpieceEnding(dt){
  const ending=state.ending,flow=retailSetpieceFlow.chaseEnding,previous=ending.frame;
  ending.frame+=dt*RETAIL_FPS;ending.animationTime+=dt;rig.visible=true;
  if(ending.phase==="centering"){
    const current=Math.min(ending.frame,flow.centeringFrames),frameDelta=current-previous;
    state.distance+=retailSetpieceFlow.retailAdvanceUnitsPerFrame*RETAIL_WORLD_SCALE*frameDelta;
    const centerStep=flow.lateralCenterUnitsPerFrame*RETAIL_WORLD_SCALE*frameDelta;
    state.x=Math.abs(state.x)<=centerStep?0:state.x-Math.sign(state.x)*centerStep;
    rig.position.x=state.x;rig.position.y=.02+state.y;updateRetailCourse(state.distance);advanceRetailEndingCan(frameDelta);sampleAnimation(runClip,ending.animationTime);
    if(ending.frame>=flow.centeringFrames){ending.phase="ending";ending.frame=0;ending.animationTime=0;}
    return;
  }
  const current=Math.min(ending.frame,flow.endingFrames);
  state.distance+=retailSetpieceFlow.retailAdvanceUnitsPerFrame*RETAIL_WORLD_SCALE*endingFrameDelta(previous,current,flow.playerAdvanceFrames);
  advanceRetailEndingCan(endingFrameDelta(previous,current,flow.canAdvanceFrames));
  updateRetailCourse(state.distance);rig.position.x=state.x;rig.position.y=.02+state.y;
  const headingFrame=Math.min(current,flow.headingTurnFrames);
  rig.rotation.y=ending.baseRigYaw+headingFrame*flow.headingUnitsPerFrame*Math.PI*2/flow.psxAngleUnitsPerTurn;
  sampleAnimation(runClip,ending.animationTime);
  if(current>=flow.cameraShakeStartFrame&&current<flow.cameraShakeEndFrame){
    const shakeFrame=Math.floor(current-flow.cameraShakeStartFrame);ending.cameraShakeX=Math.sin(shakeFrame*2.17)*.12;ending.cameraShakeY=Math.cos(shakeFrame*1.63)*.09;
  }else ending.cameraShakeX=ending.cameraShakeY=0;
  if(!ending.impactPlayed&&previous<flow.impactFrame&&current>=flow.impactFrame){ending.impactPlayed=true;ending.impactPulse=1;spawnRetailEndingImpact(ending,flow);blip(240);}
  updateRetailEndingImpact(ending,current-previous);
  ending.impactPulse=Math.max(0,ending.impactPulse-dt*5);
  const fadeIntensity=current>=flow.firstVisibleFadeFrame?(current-flow.fadeIntensityOriginFrame)*flow.fadeIntensityPerFrame/255:0;
  ui.endingFlash.style.opacity=String(THREE.MathUtils.clamp(Math.max(fadeIntensity,ending.impactPulse*.35),0,1));
  if(ending.frame>=flow.endingFrames){rig.rotation.y=ending.baseRigYaw;removeRetailEndingImpact(ending);ui.endingFlash.style.opacity="0";clearStageOne();}
}
function beginStageOneEnding(){
  if(!state.running||state.ending||!stageOneEndingFlow)return;
  scene.updateMatrixWorld(true);
  const toWorld=position=>retailCourse.group.localToWorld(new THREE.Vector3().fromArray(position));
  state.ending={phase:1,elapsed:0,animationTime:0,start:rig.position.clone(),approach:toWorld(stageOneEndingFlow.approachBrowserPosition),finish:toWorld(stageOneEndingFlow.finishBrowserPosition)};
  state.vx=0;state.vy=0;state.grounded=true;rig.visible=true;
}
function updateStageOneEnding(dt){
  if(state.ending?.kind==="retail-catch"){updateRetailChaseCatch(dt);return;}
  if(state.ending?.kind==="retail-setpiece"){updateRetailSetpieceEnding(dt);return;}
  if(stageOneEndingFlow.eventRecordIndex===198){updateSegmentOneEnding(dt);return;}
  const ending=state.ending,duration=stageOneEndingFlow.interpolationFrames/RETAIL_FPS;
  rig.visible=true;
  ending.elapsed+=dt;ending.animationTime+=dt;
  if(ending.phase===1){
    rig.position.lerpVectors(ending.start,ending.approach,THREE.MathUtils.clamp(ending.elapsed/duration,0,1));sampleAnimation(runClip,ending.animationTime);
    if(ending.elapsed>=duration){ending.phase=2;ending.elapsed-=duration;ending.start.copy(ending.approach);}
  }else if(ending.phase===2){
    rig.position.lerpVectors(ending.start,ending.finish,THREE.MathUtils.clamp(ending.elapsed/duration,0,1));sampleAnimation(runClip,ending.animationTime);
    if(ending.elapsed>=duration){ending.phase=3;ending.elapsed=0;ending.animationTime=0;rig.position.copy(ending.finish);}
  }else if(ending.phase===3){
    sampleAnimation(proneClip,ending.animationTime,false);
    if(ending.elapsed>=stageOneEndingFlow.cameraAdvanceCounterFrames/RETAIL_FPS){ending.phase=4;ending.elapsed=0;}
  }else{
    sampleAnimation(proneClip,ending.animationTime);
    if(ending.elapsed>=stageOneEndingFlow.holdFrames/RETAIL_FPS)clearStageOne();
  }
}
function beginSegmentOneEndingCamera(ending){
  const flow=stageOneEndingFlow.cameraTarget,angleScale=Math.PI*2/flow.psxAngleUnitsPerTurn,eyeAngle=flow.eyeHeadingOffsetPsx*angleScale,lookAngle=flow.lookHeadingOffsetPsx*angleScale;
  ending.cameraStartPosition=camera.position.clone();ending.cameraStartLookAt=new THREE.Vector3(...GAMEPLAY_CAMERA.lookAt);ending.cameraMix=0;
  ending.cameraEndPosition=new THREE.Vector3(rig.position.x+Math.sin(eyeAngle)*flow.eyeRadius*RETAIL_WORLD_SCALE,rig.position.y-flow.eyeVerticalOffset*RETAIL_WORLD_SCALE,rig.position.z-Math.cos(eyeAngle)*flow.eyeRadius*RETAIL_WORLD_SCALE);
  ending.cameraEndLookAt=new THREE.Vector3(rig.position.x+Math.sin(lookAngle)*flow.lookRadius*RETAIL_WORLD_SCALE,rig.position.y-flow.lookVerticalOffset*RETAIL_WORLD_SCALE,rig.position.z-Math.cos(lookAngle)*flow.lookRadius*RETAIL_WORLD_SCALE);
}
function updateSegmentOneEnding(dt){
  const ending=state.ending;ending.elapsed+=dt;ending.animationTime+=dt;rig.visible=true;
  if(ending.phase===1){
    const duration=stageOneEndingFlow.approachInterpolationFrames/RETAIL_FPS;
    rig.position.lerpVectors(ending.start,ending.approach,THREE.MathUtils.clamp(ending.elapsed/duration,0,1));sampleAnimation(runClip,ending.animationTime);
    if(ending.elapsed>=duration){ending.phase=2;ending.elapsed-=duration;ending.animationTime=0;ending.start.copy(ending.approach);rig.position.copy(ending.approach);}
  }else if(ending.phase===2){
    const movementDuration=stageOneEndingFlow.finishMovementFrames/RETAIL_FPS,mix=THREE.MathUtils.clamp(ending.elapsed*RETAIL_FPS/stageOneEndingFlow.finishInterpolationDenominatorFrames,0,1);
    rig.position.lerpVectors(ending.start,ending.finish,mix);sampleAnimation(endingApproachClip,ending.animationTime);
    if(ending.elapsed>=movementDuration){ending.phase=3;ending.elapsed=0;ending.animationTime=0;rig.position.copy(ending.finish);}
  }else if(ending.phase===3){
    sampleAnimation(proneClip,ending.animationTime);
    if(ending.elapsed>=stageOneEndingFlow.preCameraHoldFrames/RETAIL_FPS){ending.phase=4;ending.elapsed=0;ending.animationTime=0;beginSegmentOneEndingCamera(ending);}
  }else if(ending.phase===4){
    ending.cameraMix=THREE.MathUtils.clamp(ending.elapsed*RETAIL_FPS/stageOneEndingFlow.cameraInterpolationFrames,0,1);sampleAnimation(endingCameraClip,ending.animationTime);
    if(ending.elapsed>=stageOneEndingFlow.cameraAdvanceCounterFrames/RETAIL_FPS){ending.phase=5;ending.elapsed=0;}
  }else{
    sampleAnimation(endingCameraClip,ending.animationTime);
    if(ending.elapsed>=stageOneEndingFlow.preResultEffectFrames/RETAIL_FPS)clearStageOne();
  }
}
function setRetailDigits(element,text){const glyphs={":":10,"/":11};element.replaceChildren(...[...text].map(character=>{const glyph=document.createElement("i");glyph.style.setProperty("--glyph",glyphs[character]??Number(character));return glyph;}));}
function formatRetailTime(seconds){const minutes=Math.floor(seconds/60);return `${String(minutes).padStart(2,"0")}:${String(Math.floor(seconds%60)).padStart(2,"0")}`;}
function clearStageOne(){
  if(!state.running)return;
  const recordKey=`scene-${state.segmentIndex+1}`;let records={};
  try{records=JSON.parse(localStorage.getItem("pepsiman-records-v1")||"{}");}catch{}
  const previous=records[recordKey]||null;
  const recordCans=Math.max(previous?.cans||0,state.cans),recordTime=previous?.time?Math.min(previous.time,state.elapsed):state.elapsed;
  const newRecord=!previous||state.cans>previous.cans||state.elapsed<previous.time;
  records[recordKey]={cans:recordCans,time:recordTime};
  try{localStorage.setItem("pepsiman-records-v1",JSON.stringify(records));}catch{}
  if(state.segmentIndex<RETAIL_SEGMENT_COUNT-1)saveRetailProgress(state.segmentIndex+1);
  state.running=false;state.completed=true;state.results={elapsed:0,displayCans:0,transitioning:false,newRecord,perfect:retailCourse.collectibleCount>0&&state.cans>=retailCourse.collectibleCount};
  ui.music.pause();ui.over.className=`game-over retail-clear${newRecord?" new-record":""}${state.results.perfect?" perfect":""}`;ui.overKicker.textContent=`SCENE ${state.segmentIndex+1}`;ui.overTitle.innerHTML="SCENE<br>CLEAR";ui.retry.hidden=true;ui.retry.textContent="RUN AGAIN";ui.final.textContent=`${Math.floor(state.distance)} m`;
  const sceneSlot=state.segmentIndex%3,stageNumber=Math.floor(state.segmentIndex/3)+1,headingLine=ui.resultHeading.parentElement;
  headingLine.classList.toggle("stage",sceneSlot===2);ui.resultHeading.className=sceneSlot===0?"retail-scene-one":sceneSlot===1?"retail-scene-two":"retail-stage-heading";ui.resultStageNumber.style.setProperty("--stage-x",`${-264-(Math.min(stageNumber,4)-1)*32}px`);ui.over.querySelector(".retail-clear-title").setAttribute("aria-label",sceneSlot===2?`Stage ${stageNumber} clear`:`Scene ${sceneSlot+1} clear`);
  setRetailDigits(ui.resultCans,"000");setRetailDigits(document.querySelector("#record-cans"),String(recordCans).padStart(3,"0"));setRetailDigits(ui.resultTime,formatRetailTime(state.elapsed));setRetailDigits(document.querySelector("#record-time"),formatRetailTime(recordTime));ui.over.hidden=false;
}
async function advanceRetailSegment(){
  const nextSegment=state.segmentIndex+1,lives=state.lives;
  const resume=()=>{startGame();state.lives=lives;updateHud();};
  try{await loadRetailCourse(nextSegment);const movie=RETAIL_STAGE_MOVIES.get(nextSegment);if(movie)playCutscene(movie,resume);else resume();}
  catch(error){console.error(error);ui.retry.hidden=false;ui.retry.textContent="RUN AGAIN";}
}
function updateRetailResults(dt){
  if(!state.results||!retailFinishFlow)return;
  state.results.elapsed+=dt;const frame=Math.floor(state.results.elapsed*RETAIL_FPS),milestones=retailFinishFlow.resultRevealMilestones;
  ui.over.classList.toggle("results-slot-0",frame>=milestones.effectSlot0Frame);
  ui.over.classList.toggle("results-slot-1",frame>=milestones.effectSlot1Frame);
  ui.over.classList.toggle("results-slot-2",frame>=milestones.effectSlot2Frame);
  if(frame>=milestones.countStartFrame){const displayCans=Math.min(state.cans,frame-milestones.countStartFrame);if(displayCans!==state.results.displayCans){state.results.displayCans=displayCans;setRetailDigits(ui.resultCans,String(displayCans).padStart(3,"0"));}}
  const effectCompleteFrame=milestones.countStartFrame+state.cans+60;
  ui.over.classList.toggle("results-complete",frame>=effectCompleteFrame);
  if(!state.results.transitioning&&frame>=effectCompleteFrame+retailFinishFlow.transitionDelayFrames){state.results.transitioning=true;if(state.segmentIndex<13)advanceRetailSegment();else playCutscene(5,()=>{ui.retry.hidden=false;ui.retry.textContent="RUN AGAIN";});}
}
function beginStageOneScriptedEvent(){
  if(!state.running||state.scripted||!stageOneScriptedFlow)return;
  scene.updateMatrixWorld(true);
  const targetLocal=new THREE.Vector3().fromArray(stageOneScriptedFlow.targetBrowserPosition);
  state.scripted={phase:1,elapsed:0,lastSoundFrame:-1,start:rig.position.clone(),target:retailCourse.group.localToWorld(targetLocal.clone()),resumeDistance:nearestCourseDistance(targetLocal),closing:0};
  state.vx=0;state.vy=0;state.grounded=true;input.left=false;input.right=false;input.gamepadX=0;rig.visible=true;
}
function spawnStageOneScriptParticles(){
  const template=retailPropTemplates[stageOneScriptedFlow.randomParticleModelObject];if(!template)return;
  const origin=retailCourse.group.worldToLocal(rig.position.clone());
  for(let index=0;index<stageOneScriptedFlow.randomParticleCount;index++){
    const object=template.clone(true);object.name=`retail-event-194-particle-${index}`;object.position.copy(origin);object.position.x+=Math.random()*200-100;object.position.y+=50;object.position.z+=Math.random()*200-100;retailCourse.group.add(object);
    retailScriptParticles.push({object,age:0,velocity:new THREE.Vector3(Math.random()*360-180,Math.random()*280+180,Math.random()*360-180),spin:new THREE.Vector3(Math.random()*5-2.5,Math.random()*5-2.5,Math.random()*5-2.5)});
  }
}
function updateStageOneScriptedEvent(dt){
  const scripted=state.scripted;if(!scripted)return false;scripted.elapsed+=dt;rig.visible=true;
  if(scripted.phase<4){input.left=false;input.right=false;input.gamepadX=0;}
  if(scripted.phase===1){
    const duration=stageOneScriptedFlow.centeringFrames/RETAIL_FPS;rig.position.lerpVectors(scripted.start,scripted.target,THREE.MathUtils.clamp(scripted.elapsed/duration,0,1));sampleAnimation(runClip,scripted.elapsed);
    if(scripted.elapsed>=duration){scripted.phase=2;scripted.elapsed-=duration;rig.position.copy(scripted.target);}return true;
  }
  if(scripted.phase===2){sampleAnimation(runClip,scripted.elapsed);if(scripted.elapsed>=1/RETAIL_FPS){scripted.phase=3;scripted.elapsed=0;}return true;}
  if(scripted.phase===3){
    sampleAnimation(runClip,scripted.elapsed);const frame=Math.floor(scripted.elapsed*RETAIL_FPS)+1;if(frame<8&&frame%2===0&&frame!==scripted.lastSoundFrame){scripted.lastSoundFrame=frame;blip(560);}
    if(frame>=stageOneScriptedFlow.soundFrames){spawnStageOneScriptParticles();state.distance=scripted.resumeDistance;state.x=0;rig.position.set(0,.02+state.y,1.3);updateRetailCourse(state.distance);scripted.phase=4;scripted.elapsed=0;}return true;
  }
  scripted.closing+=dt;if(scripted.closing>=stageOneScriptedFlow.closingEffectFrames/RETAIL_FPS)state.scripted=null;return false;
}
function updateStageOneScriptParticles(dt){
  for(let index=retailScriptParticles.length-1;index>=0;index--){const particle=retailScriptParticles[index];particle.age+=dt;if(particle.age>=stageOneScriptedFlow.randomParticleLifetimeFrames/RETAIL_FPS){particle.object.removeFromParent();retailScriptParticles.splice(index,1);continue;}particle.velocity.y-=520*dt;particle.object.position.addScaledVector(particle.velocity,dt);particle.object.rotation.x+=particle.spin.x*dt;particle.object.rotation.y+=particle.spin.y*dt;particle.object.rotation.z+=particle.spin.z*dt;}
}
function setHudDigits(element,value,large=false){if(element.dataset.value===value)return;element.dataset.value=value;element.replaceChildren(...[...value].map(character=>{const glyph=document.createElement("i"),number=Number(character);if(large){const column=number<8?number:number-8,row=number<8?0:1;glyph.style.backgroundPosition=`${-column*32}px ${-row*32}px`;}else{const index=character>="0"&&character<="9"?number:{"'":10,'"':11,":":12}[character]??0;glyph.style.backgroundPosition=`${-index*8}px 0`;}return glyph;}));}
function updateHud(){
  const remaining=Math.max(0,100-Math.floor(state.elapsed)),minutes=Math.floor(state.elapsed/60),seconds=Math.floor(state.elapsed%60),frames=Math.floor(state.elapsed*RETAIL_FPS)%RETAIL_FPS;
  ui.distance.textContent=String(Math.floor(state.distance)).padStart(4,"0");setHudDigits(ui.cans,String(state.cans).padStart(2,"0"),true);setHudDigits(ui.timeLeft,String(remaining).padStart(2,"0"),true);setHudDigits(ui.lifeCount,String(Math.max(0,state.lives)),true);setHudDigits(ui.totalTime,`${minutes}'${String(seconds).padStart(2,"0")}"${String(frames).padStart(2,"0")}`);ui.progressFill.style.width=`${Math.round(80*THREE.MathUtils.clamp(state.distance/Math.max(1,retailCourse.length),0,1))}px`;
  if(remaining<=10&&!state.hurryShown){state.hurryShown=true;callout("hurry");}
}

const collisionCenter=new THREE.Vector3();
const collectibleCenter=new THREE.Vector3();
const dynamicWorldPosition=new THREE.Vector3();
const playerCoursePosition=new THREE.Vector3();
const eventWorldVertices=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
const playerProbeCenters=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
const PLAYER_PROBE_RADII=[20*RETAIL_WORLD_SCALE,35*RETAIL_WORLD_SCALE,35*RETAIL_WORLD_SCALE];
function moveRetailDynamicPair(dynamic,distance,heading=dynamic.heading){
  const x=Math.sin(heading)*distance,z=-Math.cos(heading)*distance;
  dynamic.object.position.x+=x;dynamic.object.position.z+=z;
  if(dynamic.secondary){dynamic.secondary.position.x+=x;dynamic.secondary.position.z+=z;}
}
function retailCrashJitter(entityId,frame,axis){
  let value=(entityId*0x45d9f3b+frame*0x27d4eb2d+axis*0x165667b1)|0;
  value=Math.imul(value^(value>>>16),0x45d9f3b);value=Math.imul(value^(value>>>16),0x45d9f3b);return((value^(value>>>16))>>>0)%5-2;
}
function updatePlayerProbeCenters(){
  scene.updateMatrixWorld(true);
  nodes.get(10).getWorldPosition(playerProbeCenters[0]);
  nodes.get(1).getWorldPosition(playerProbeCenters[1]);
  nodes.get(1).localToWorld(playerProbeCenters[2].set(0,0,-14));
}
function testRetailCollisions(){
  if(!retailCourse.ready||!rig)return;
  updatePlayerProbeCenters();
  for(const collider of retailColliders){
    if(!collider.object.visible||collider.collisionClass===0||retailCollidedEntities.has(collider.entityId))continue;
    if(state.slide>0&&collider.behavior===18)continue;
    collider.object.localToWorld(collisionCenter.copy(collider.center));
    for(let probeIndex=0;probeIndex<playerProbeCenters.length;probeIndex++){
      const combinedRadius=collider.radius+PLAYER_PROBE_RADII[probeIndex];
      if(collisionCenter.distanceToSquared(playerProbeCenters[probeIndex])<combinedRadius*combinedRadius){
        retailCollidedEntities.add(collider.entityId);hit();break;
      }
    }
  }
}
function updateRetailDynamicEntities(dt){
  for(const dynamic of retailDynamicEntities){
    if(!dynamic.active){
      if(dynamic.behavior===7||dynamic.behavior===8){
        dynamic.object.getWorldPosition(dynamicWorldPosition);
        if(dynamicWorldPosition.distanceTo(rig.position)>=3000*RETAIL_WORLD_SCALE)continue;
      }else if(dynamic.behavior===20){
        dynamic.object.getWorldPosition(dynamicWorldPosition);
        if(dynamicWorldPosition.distanceTo(rig.position)>=(Math.floor(dynamic.variant/2)+1)*1000*RETAIL_WORLD_SCALE)continue;
      }else if(dynamic.behavior===44||dynamic.behavior===45){
        dynamic.object.getWorldPosition(dynamicWorldPosition);
        if(dynamicWorldPosition.distanceTo(rig.position)>=(dynamic.variant+1)*500*RETAIL_WORLD_SCALE)continue;
      }else if(dynamic.behavior===36||dynamic.behavior===38){
        dynamic.object.getWorldPosition(dynamicWorldPosition);
        if(dynamicWorldPosition.distanceTo(rig.position)>1500*RETAIL_WORLD_SCALE)continue;
      }else if(state.distance<dynamic.courseDistance-18||state.distance>dynamic.courseDistance+8)continue;
      dynamic.active=true;dynamic.object.visible=true;
      if([15,18,43].includes(dynamic.behavior)){
        if(dynamic.behavior===18)dynamic.object.position.y=dynamic.basePosition.y+150;
        if(dynamic.secondary){dynamic.secondary.position.copy(dynamic.object.position);dynamic.secondary.visible=true;}
      }
      if(dynamic.behavior===44||dynamic.behavior===45)setRetailDynamicModel(dynamic,dynamic.baseModel+(dynamic.behavior===44?1:-1));
    }
    if(state.distance>dynamic.courseDistance+24&&dynamic.behavior!==36&&dynamic.behavior!==38){dynamic.object.visible=false;if(dynamic.secondary)dynamic.secondary.visible=false;continue;}
    if(dynamic.behavior===44||dynamic.behavior===45)continue;
    const frameDelta=dt*RETAIL_FPS;
    if(dynamic.behavior===20){
      dynamic.phaseFrames=Math.min(40,dynamic.phaseFrames+frameDelta);
      const direction=dynamic.variant%2===0?1:-1;
      dynamic.object.rotation.y=dynamic.baseRotationY-direction*Math.PI*(dynamic.phaseFrames/40);
      continue;
    }
    if(dynamic.behavior===46){
      dynamic.ageFrames=state.elapsed*RETAIL_FPS;
      const amplitude=dynamic.variant===1?250:125,sideHeading=dynamic.initialHeading+(dynamic.variant===1?Math.PI*1.5:Math.PI*.5),radius=Math.sin(THREE.MathUtils.degToRad(dynamic.ageFrames*3))*amplitude;
      dynamic.object.position.x=dynamic.basePosition.x-Math.sin(sideHeading)*radius;
      dynamic.object.position.y=dynamic.basePosition.y-Math.abs(Math.sin(THREE.MathUtils.degToRad(dynamic.ageFrames*20))*41);
      dynamic.object.position.z=dynamic.basePosition.z-Math.cos(sideHeading)*radius;
      continue;
    }
    if(dynamic.behavior===18){
      if(dynamic.phase===0){
        const duration=dynamic.variant<3?60:90,speed=(dynamic.variant<3?dynamic.variant+1:dynamic.variant-2)*10;
        const frames=Math.min(frameDelta,Math.max(0,duration-dynamic.phaseFrames));dynamic.phaseFrames+=frames;moveRetailDynamicPair(dynamic,speed*frames);
        if(dynamic.phaseFrames>=duration){dynamic.phase=1;dynamic.phaseFrames=0;}
      }else if(dynamic.phase===1){
        const previousFrame=Math.floor(dynamic.phaseFrames),nextFrames=Math.min(40,dynamic.phaseFrames+frameDelta);dynamic.phaseFrames=nextFrames;
        const skidHeading=dynamic.initialHeading+227/4096*Math.PI*2;
        for(let frame=previousFrame;frame<Math.floor(nextFrames);frame++){
          moveRetailDynamicPair(dynamic,45*(1-frame/40),skidHeading);
          const x=retailCrashJitter(dynamic.entityId,frame,0),z=retailCrashJitter(dynamic.entityId,frame,1);dynamic.object.position.x+=x;dynamic.object.position.z+=z;if(dynamic.secondary){dynamic.secondary.position.x+=x;dynamic.secondary.position.z+=z;}
        }
        dynamic.object.rotation.y=dynamic.baseRotationY+11/4096*Math.PI*2*dynamic.phaseFrames;
        if(dynamic.secondary)dynamic.secondary.rotation.y=dynamic.baseRotationY-5/4096*Math.PI*2*dynamic.phaseFrames;
        if(dynamic.phaseFrames>=40){dynamic.phase=2;dynamic.phaseFrames=0;}
      }
      continue;
    }
    if(dynamic.behavior===36||dynamic.behavior===38){
      if(dynamic.phase===0){dynamic.phaseStart=dynamic.object.position.clone();dynamic.phase=1;dynamic.phaseFrames=0;continue;}
      if(dynamic.phase===1){dynamic.phase=2;dynamic.phaseFrames=0;continue;}
      const previousFrame=Math.floor(dynamic.phaseFrames),nextFrames=dynamic.phaseFrames+frameDelta;
      if(dynamic.phase===2){
        const threshold=dynamic.behavior===38?3400:7600;
        for(let frame=previousFrame;frame<Math.floor(nextFrames);frame++){
          dynamic.object.position.y+=20;dynamic.heading=retailCourseHeadingAt(dynamic.object.position);
          const speed=dynamic.behavior===38?40:frame%47===1?40:5;moveRetailDynamicPair(dynamic,speed);dynamic.object.rotation.y=dynamic.baseRotationY-(dynamic.heading-dynamic.initialHeading);
          if(dynamic.object.position.distanceToSquared(dynamic.phaseStart)>threshold*threshold){dynamic.phase=3;dynamic.phaseFrames=0;dynamic.turnStart=dynamic.heading;break;}
        }
        if(dynamic.phase===2)dynamic.phaseFrames=nextFrames;
      }else if(dynamic.phase===3){
        const direction=dynamic.behavior===38?-1:1;
        for(let frame=previousFrame;frame<Math.floor(nextFrames);frame++){
          dynamic.heading=dynamic.turnStart+direction*Math.PI*.5*Math.min(frame/30,1);moveRetailDynamicPair(dynamic,20);dynamic.object.rotation.y=dynamic.baseRotationY-(dynamic.heading-dynamic.initialHeading);
          if(frame>=30){dynamic.phase=4;dynamic.phaseFrames=0;break;}
        }
        if(dynamic.phase===3)dynamic.phaseFrames=nextFrames;
      }else{
        dynamic.heading=dynamic.turnStart+(dynamic.behavior===38?-1:1)*Math.PI*.5;
        for(let frame=previousFrame;frame<Math.floor(nextFrames);frame++)moveRetailDynamicPair(dynamic,20);
        dynamic.phaseFrames=nextFrames;dynamic.object.rotation.y=dynamic.baseRotationY-(dynamic.heading-dynamic.initialHeading);
      }
      continue;
    }
    if(dynamic.behavior<=2||dynamic.behavior===15||dynamic.behavior===43){
      const motionFrames=dynamic.behavior===15||dynamic.behavior===43||dynamic.behavior===1&&dynamic.variant>10?Infinity:150;
      if(dynamic.ageFrames>=motionFrames)continue;
      dynamic.ageFrames=Math.min(motionFrames,dynamic.ageFrames+frameDelta);
      const speed=dynamic.behavior===43?10:(dynamic.behavior===15?dynamic.variant:dynamic.variant<=10?dynamic.variant:dynamic.variant-10)*10;
      const distance=speed*frameDelta;
      moveRetailDynamicPair(dynamic,distance);
      if(dynamic.behavior===15||dynamic.behavior===43){dynamic.object.position.y+=120*frameDelta;if(dynamic.secondary)dynamic.secondary.position.y+=120*frameDelta;}
      continue;
    }
    const variantIndex=Math.max(0,dynamic.variant-1),group=Math.floor(variantIndex/5),withinGroup=variantIndex%5;
    const speed=(withinGroup+(dynamic.behavior<=6?2:1))*10;
    const initialTravel=(group+1)*500+(dynamic.behavior<=6?500:0);
    if(dynamic.phase===0){
      const distance=Math.min(speed*frameDelta,Math.max(0,initialTravel-dynamic.phaseDistance));
      dynamic.phaseDistance+=distance;dynamic.object.position.x+=Math.sin(dynamic.heading)*distance;dynamic.object.position.z-=Math.cos(dynamic.heading)*distance;
      if(dynamic.phaseDistance>=initialTravel){dynamic.phase=1;dynamic.phaseFrames=0;}
    }else if(dynamic.phase===1){
      const frames=Math.min(frameDelta,31-dynamic.phaseFrames),distance=speed*frames;
      dynamic.phaseFrames+=frames;dynamic.object.position.x+=Math.sin(dynamic.heading)*distance;dynamic.object.position.z-=Math.cos(dynamic.heading)*distance;
      const direction=[5,7].includes(dynamic.behavior)?-1:1;
      dynamic.heading=dynamic.initialHeading+direction*Math.PI*.5*(dynamic.phaseFrames/31);
      dynamic.object.rotation.y=dynamic.baseRotationY-(dynamic.heading-dynamic.initialHeading);
      if(dynamic.phaseFrames>=31){dynamic.phase=2;dynamic.phaseFrames=0;}
    }else if(dynamic.phaseFrames<150){
      const frames=Math.min(frameDelta,150-dynamic.phaseFrames),distance=speed*frames;
      dynamic.phaseFrames+=frames;dynamic.object.position.x+=Math.sin(dynamic.heading)*distance;dynamic.object.position.z-=Math.cos(dynamic.heading)*distance;
    }
  }
}
function testRetailCollectibles(){
  if(!retailCourse.ready||!rig)return;
  const combinedRadius=RETAIL_PICKUP_RADIUS+RETAIL_PLAYER_PICKUP_RADIUS;
  for(const collectible of retailCollectibles){
    if(retailCollectedIds.has(collectible.id))continue;
    collectible.sprite.getWorldPosition(collectibleCenter);
    if(collectibleCenter.distanceToSquared(rig.position)>combinedRadius*combinedRadius)continue;
    retailCollectedIds.add(collectible.id);collectible.sprite.visible=false;state.cans++;blip(900);
  }
}
function updateRetailEncounters(dt){
  if(!retailCourse.ready||!rig)return;
  for(const event of retailEvents.values()){
    if(event.state!==0)continue;
    for(let index=0;index<4;index++)retailCourse.group.localToWorld(eventWorldVertices[index].copy(event.vertices[index]));
    const[a,b,c,d]=eventWorldVertices;
    if(pointInTriangleXZ(rig.position.x,rig.position.z,a,b,c)||pointInTriangleXZ(rig.position.x,rig.position.z,b,d,c)){event.state=1;if(event.id===194)beginStageOneScriptedEvent();if(event.id===196||event.id===198)beginStageOneEnding();}
  }
  for(const event of retailEvents.values()){
    if(event.id%2!==1||event.state!==1)continue;
    event.state=2;
    const activationEvent=retailEvents.get(event.id-1);if(activationEvent)activationEvent.state=2;
  }
  updatePlayerProbeCenters();
  for(const encounter of retailEncounters){
    if(encounter.removed){encounter.sprite.visible=false;continue;}
    const eventActive=retailEvents.get(encounter.eventId)?.state===1;
    encounter.sprite.visible=eventActive;
    if(encounter.reaction){
      encounter.reaction.elapsed+=dt;
      const frame=Math.floor(encounter.reaction.elapsed*RETAIL_REACTION_FPS)+1;
      if(frame>RETAIL_REACTION_FRAMES){encounter.removed=true;encounter.sprite.visible=false;continue;}
      const travel=frame*20,angle=THREE.MathUtils.degToRad(frame*10);
      encounter.sprite.position.copy(encounter.basePosition).addScaledVector(encounter.reaction.direction,travel);encounter.sprite.position.y=encounter.reaction.baseY+Math.abs(Math.sin(angle))*200;
      encounter.sprite.visible=eventActive&&frame%3!==0;
      continue;
    }
    if(encounter.behaviorState===1){
      encounter.sprite.getWorldPosition(collisionCenter);
      const close=Math.abs(collisionCenter.x-rig.position.x)<RETAIL_ENCOUNTER_PROXIMITY&&Math.abs(collisionCenter.z-rig.position.z)<RETAIL_ENCOUNTER_PROXIMITY;
      encounter.sprite.material=close&&encounter.nextMaterial?encounter.nextMaterial:encounter.baseMaterial;
    }
    if(!encounter.sprite.visible||!encounter.collisionEnabled||retailCollidedEncounterIds.has(encounter.id))continue;
    encounter.sprite.getWorldPosition(collisionCenter);
    for(let probeIndex=0;probeIndex<playerProbeCenters.length;probeIndex++){
      const combinedRadius=encounter.radius+PLAYER_PROBE_RADII[probeIndex];
      if(collisionCenter.distanceToSquared(playerProbeCenters[probeIndex])>combinedRadius*combinedRadius)continue;
      retailCollidedEncounterIds.add(encounter.id);
      if(encounter.behaviorState===2&&encounter.nextMaterial){
        encounter.sprite.material=encounter.nextMaterial;
        playerCoursePosition.copy(rig.position);retailCourse.group.worldToLocal(playerCoursePosition);
        const direction=(coursePointAt(state.distance)?.tangent||new THREE.Vector3(0,0,-1)).clone();direction.y=0;direction.normalize();
        encounter.reaction={elapsed:0,direction,baseY:playerCoursePosition.y};
      }
      hit();break;
    }
  }
}

const setpiecePlayerLocal=new THREE.Vector3();
function updateRetailSetpieceActors(dt){
  if(!retailCourse.setpiece||!retailCourse.group||!rig)return;
  scene.updateMatrixWorld(true);setpiecePlayerLocal.copy(rig.position);retailCourse.group.worldToLocal(setpiecePlayerLocal);
  const playerForward=retailSetpieceFlow.playerStartForward+state.distance/RETAIL_WORLD_SCALE;
  if(retailSetpieceCan){
    retailSetpieceCan.sourceForward+=retailSetpieceFlow.retailAdvanceUnitsPerFrame*dt*RETAIL_FPS;
    retailSetpieceCan.sourceForward=Math.max(retailSetpieceCan.sourceForward,playerForward-retailSetpieceFlow.scrollingOriginBehindPlayer);
    retailSetpieceCan.sprite.position.set(retailSetpieceCan.sourceForward,retailSetpieceCan.vertical,retailSetpieceCan.lateral);
    if(playerForward<retailSetpieceCan.sourceForward+retailSetpieceFlow.chaseCatch.canForwardOffset)beginRetailChaseCatch();
  }
  for(const actor of retailSetpieceActors){
    const delta=actor.sourcePosition.x-playerForward;
    if(actor.state===0){
      actor.sprite.visible=delta<=2000&&delta>=-10000;
      const reactionBehindPlayer=retailSetpieceFlow.scrollingOriginBehindPlayer-retailSetpieceFlow.automaticReactionBehindScrollingOrigin;
      if(playerForward>actor.sourcePosition.x+reactionBehindPlayer){actor.state=1;actor.frame=0;}
      else if(actor.sprite.visible&&Math.abs(setpiecePlayerLocal.x-actor.sourcePosition.x)<actor.bounds.forward&&Math.abs(setpiecePlayerLocal.z-actor.sourcePosition.z)<actor.bounds.lateral&&setpiecePlayerLocal.y<actor.sourcePosition.y+actor.bounds.vertical){
        if(actor.bounds.damage){actor.state=1;actor.frame=0;hit();}
        else state.distance=Math.max(0,(actor.sourcePosition.x-actor.bounds.blockForwardOffset-retailSetpieceFlow.playerStartForward)*RETAIL_WORLD_SCALE);
      }
    }
    if(actor.state===1){
      actor.frame+=dt*RETAIL_FPS;const frame=Math.min(retailSetpieceFlow.reactionFrames,actor.frame),sign=actor.basePosition.z<=0?1:-1,psxAngle=frame*40960/360;
      actor.sprite.position.set(actor.basePosition.x+frame*retailSetpieceFlow.reactionForwardUnitsPerFrame,actor.basePosition.y+Math.sin(psxAngle*Math.PI*2/4096)*retailSetpieceFlow.reactionVerticalAmplitude,actor.basePosition.z-sign*frame*retailSetpieceFlow.reactionLateralUnitsPerFrame);
      actor.sprite.material.rotation=sign*psxAngle*Math.PI*2/4096;actor.sprite.visible=frame<retailSetpieceFlow.reactionFrames;
      if(frame>=retailSetpieceFlow.reactionFrames)actor.state=2;
    }else if(actor.state===2)actor.sprite.visible=false;
  }
  if(state.distance>=retailCourse.length&&!state.completed&&!state.ending)beginRetailSetpieceEnding();
}

let previous=performance.now()/1000;
function tick(nowMs){requestAnimationFrame(tick);const now=nowMs/1000,dt=state.paused?0:Math.min(.04,now-previous);previous=now;
  if(retailCanTexture)retailCanTexture.offset.x=(Math.floor(now*8)%2)*.5;
  if(state.running){
    readGamepad();
    if(!state.ending)state.elapsed+=dt;
    if(state.ending){updateStageOneEnding(dt);updateHud();}
    else if(updateStageOneScriptedEvent(dt)){updateHud();}
    else{
    state.sprint=Math.max(0,state.sprint-dt);state.brake=Math.max(0,state.brake-dt);const baseSpeed=retailCourse.setpiece?retailSetpieceFlow.retailAdvanceUnitsPerFrame*RETAIL_FPS*RETAIL_WORLD_SCALE:Math.min(25,12+state.distance/500);state.speed=baseSpeed*(state.sprint>0?1.3:state.brake>0?.62:1);state.distance+=state.speed*dt;state.invulnerable=Math.max(0,state.invulnerable-dt);
    const keyboardSteering=(input.right?1:0)-(input.left?1:0),steering=keyboardSteering||input.gamepadX,targetVx=steering*STEER_SPEED;
    state.vx=THREE.MathUtils.damp(state.vx,targetVx,steering?14:9,dt);const roadEdge=retailCourse.setpiece?2.2:ROAD_EDGE_X;state.x=THREE.MathUtils.clamp(state.x+state.vx*dt,-roadEdge,roadEdge);if(Math.abs(state.x)===roadEdge&&Math.sign(state.vx)===Math.sign(state.x))state.vx=0;
    updateRetailCourse(state.distance);
    scene.updateMatrixWorld(true);updateVerticalMotion(dt,runnerGroundHeight());
    state.slide=Math.max(0,state.slide-dt);state.slideTime=state.slide>0?state.slideTime+dt:0;
    rig.position.x=state.x;rig.position.y=.02+state.y;rig.scale.y=.008;
    const takeoffDuration=(jumpClip.frameCount-1)/jumpClip.fps,landingContactTime=LANDING_CONTACT_FRAME/landingClip.fps,landingRecoveryDuration=(landingClip.frameCount-1-LANDING_CONTACT_FRAME)/landingClip.fps;
    if(!state.grounded&&state.jumpTime<=takeoffDuration)sampleAnimation(jumpClip,state.jumpTime,false,true);
    else if(!state.grounded&&state.vy>0)sampleAnimation(airborneClip,state.jumpTime-takeoffDuration,true,true);
    else if(!state.grounded){const descentProgress=THREE.MathUtils.clamp(-state.vy/JUMP_VELOCITY,0,1);sampleAnimation(landingClip,descentProgress*landingContactTime,false,true);}
    else if(state.slide>0)sampleAnimation(slideClip,state.slideTime,false);
    else if(state.landingTime>0&&state.landingTime<=landingRecoveryDuration)sampleAnimation(landingClip,landingContactTime+state.landingTime,false,true);
    else{state.landingTime=0;sampleAnimation(runClip,state.elapsed*1.15);}
    rig.visible=state.invulnerable<=0||Math.floor(state.invulnerable*14)%2===0;
    updateRetailDynamicEntities(dt);updateRetailEncounters(dt);updateRetailSetpieceActors(dt);testRetailCollectibles();testRetailCollisions();
    // ponytail: route-end fallback for untraced post-Stage-1 overlays; replace with each authored finish event/controller.
    if(state.segmentIndex>=3&&state.distance>=retailCourse.length&&!state.ending)clearStageOne();
    for(const mark of markings){mark.position.z+=state.speed*dt;if(mark.position.z>18)mark.position.z-=126;}
    updateHud();
    }
  } else if(rig){rig.visible=true;if(state.completed){sampleAnimation(proneClip,(proneClip.frameCount-1)/proneClip.fps,false);updateRetailResults(dt);}else{sampleAnimation(idleClip,now);updateRetailCourse(0);}}
  updateStageOneScriptParticles(dt);
  const titleActive=!state.running&&!state.completed&&!ui.start.classList.contains("hidden");
  world.visible=!titleActive;scene.background.setHex(titleActive?0x000000:0x64bce9);
  if(titleActive&&rig){rig.position.set(-1.9,.02,.2);rig.rotation.y=CHARACTER_FACING_YAW;}
  const chaseCamera=retailCourse.setpiece&&state.running;
  const chaseView=retailSetpieceFlow?.chaseCamera;
  const endingShakeX=state.ending?.cameraShakeX||0,endingShakeY=state.ending?.cameraShakeY||0;
  if(titleActive){camera.position.set(0,2.8,6.4);camera.lookAt(-.7,1.2,0);}
  else if(state.ending?.cameraEndPosition){camera.position.lerpVectors(state.ending.cameraStartPosition,state.ending.cameraEndPosition,state.ending.cameraMix);camera.lookAt(new THREE.Vector3().lerpVectors(state.ending.cameraStartLookAt,state.ending.cameraEndLookAt,state.ending.cameraMix));}
  else{camera.position.x=THREE.MathUtils.damp(camera.position.x,(rig?.position.x||0)*.2+endingShakeX,5,dt);camera.position.y=THREE.MathUtils.damp(camera.position.y,(chaseCamera?chaseView.browserPosition[1]:GAMEPLAY_CAMERA.position[1])+endingShakeY,6,dt);camera.position.z=THREE.MathUtils.damp(camera.position.z,chaseCamera?chaseView.browserPosition[2]:GAMEPLAY_CAMERA.position[2],6,dt);camera.lookAt(endingShakeX,(chaseCamera?chaseView.browserLookAt[1]:GAMEPLAY_CAMERA.lookAt[1])+endingShakeY,chaseCamera?chaseView.browserLookAt[2]:GAMEPLAY_CAMERA.lookAt[2]);}renderer.render(scene,camera);
}
requestAnimationFrame(tick);

addEventListener("keydown",event=>{if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," ","Escape"].includes(event.key))event.preventDefault();if((event.key==="Escape"||event.key.toLowerCase()==="p")&&state.running){if(!event.repeat)togglePause();return;}if(state.paused)return;if(event.key==="Enter"&&cutsceneCompletion){finishCutscene();return;}if(event.key==="ArrowLeft"||event.key.toLowerCase()==="a")setSteering(-1,true);if(event.key==="ArrowRight"||event.key.toLowerCase()==="d")setSteering(1,true);if(event.key==="ArrowUp"||event.key.toLowerCase()==="w")input.forward=true;if(event.key==="ArrowDown"||event.key.toLowerCase()==="s"){input.backward=true;if(!event.repeat){if(input.square)squareAction();else slide();}}if(!event.repeat&&(event.key===" "||event.key.toLowerCase()==="x"))jump();if(event.key.toLowerCase()==="c"||event.key==="Shift"){input.square=true;if(!event.repeat)squareAction();}if(event.key==="Enter"&&!state.running)beginRetailOpening();});
addEventListener("keyup",event=>{if(event.key==="ArrowLeft"||event.key.toLowerCase()==="a")setSteering(-1,false);if(event.key==="ArrowRight"||event.key.toLowerCase()==="d")setSteering(1,false);if(event.key==="ArrowUp"||event.key.toLowerCase()==="w")input.forward=false;if(event.key==="ArrowDown"||event.key.toLowerCase()==="s")input.backward=false;if(event.key.toLowerCase()==="c"||event.key==="Shift")input.square=false;});
addEventListener("blur",()=>{input.left=false;input.right=false;input.forward=false;input.backward=false;input.square=false;input.gamepadX=0;});
document.querySelectorAll("[data-control]").forEach(button=>{const control=button.dataset.control;if(control==="left"||control==="right"){const direction=control==="left"?-1:1;button.addEventListener("pointerdown",event=>{button.setPointerCapture(event.pointerId);setSteering(direction,true);});for(const type of ["pointerup","pointercancel","lostpointercapture"])button.addEventListener(type,()=>setSteering(direction,false));}else button.addEventListener("pointerdown",()=>({jump,slide}[control]()));});
ui.button.disabled=true;ui.button.addEventListener("click",beginRetailOpening);ui.continueButton.addEventListener("click",continueRetailGame);ui.openingButton.addEventListener("click",playOriginalOpening);ui.retry.addEventListener("click",startGame);ui.cutscene.addEventListener("ended",finishCutscene);ui.cutscene.addEventListener("error",finishCutscene);ui.skipCutscene.addEventListener("click",finishCutscene);
ui.sound.addEventListener("click",()=>{state.muted=!state.muted;ui.music.muted=state.muted;ui.sound.textContent=state.muted?"×":"♪";});
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
Promise.all([loadCharacter(),loadRetailCourse(0)]).then(()=>{ui.loading.textContent=`ORIGINAL RIG + RETAIL STAGE 1 READY · ${retailCourse.chunkCount} COURSE CHUNKS · ${retailCourse.visiblePropCount} ACTIVE PROPS · ${retailCourse.collectibleCount} RETAIL CANS · ${retailCourse.encounterCount} TRIGGERED ENCOUNTERS · ${retailColliders.length} SPHERES · ${retailCollisionSurfaces.length} LANDING SURFACES`;ui.button.disabled=false;updateContinueButton();}).catch(error=>{console.error(error);ui.loading.textContent="ASSET LOAD FAILED — USE A LOCAL WEB SERVER";});
