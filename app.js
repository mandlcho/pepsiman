import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { applyExtractedPelvisMotion, applySetupTransform, TOD_TRANSLATION_SCALE } from "./rig-math.js";

const ASSET_ROOT = "./assets/ripped/pepsiman/";
const STAGE_ONE_ROOT = "./assets/ripped/stages/2/";
const RETAIL_TEXTURE_ROOT = "./assets/ripped/textures/0/";
const STAGE_ONE_SPRITE_ROOT = "./assets/ripped/textures/2/";
const RETAIL_WORLD_SCALE = .008;
const RETAIL_PICKUP_RADIUS = 50 * RETAIL_WORLD_SCALE;
const RETAIL_ENCOUNTER_PROXIMITY = 600 * RETAIL_WORLD_SCALE;
const RETAIL_REACTION_FPS = 30;
const RETAIL_REACTION_FRAMES = 15;
const lanes = [-2.25, 0, 2.25];
const ROAD_EDGE_X = 3.8;
const STEER_SPEED = 7.2;
const GROUND_Y = 0;
const GRAVITY = 20;
const JUMP_VELOCITY = 8.3;
const LANDING_CONTACT_FRAME = 14;
const CHARACTER_FACING_YAW = Math.PI + THREE.MathUtils.degToRad(15);
const ui = {
  start: document.querySelector("#start-screen"), button: document.querySelector("#start-button"),
  loading: document.querySelector("#loading"), hud: document.querySelector(".hud"),
  distance: document.querySelector("#distance"), cans: document.querySelector("#cans"),
  lives: [...document.querySelectorAll("#lives i")], over: document.querySelector("#game-over"),
  final: document.querySelector("#final-distance"), retry: document.querySelector("#retry"),
  callout: document.querySelector("#callout"), sound: document.querySelector("#sound"),
  music: document.querySelector("#music")
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
camera.position.set(0, 4.2, 8.5);
camera.lookAt(0, 1.5, -9);
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

const retailCourse={group:null,path:[],length:0,ready:false,chunkCount:0,visiblePropCount:0,collectibleCount:0,encounterCount:0,collisionMeshes:[]};
const retailColliders=[];
const retailCollisionSurfaces=[];
const retailCollidedEntities=new Set();
const retailCollectibles=[];
const retailCollectedIds=new Set();
const retailEvents=new Map();
const retailEncounters=[];
const retailCollidedEncounterIds=new Set();
let retailCanTexture=null;
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
function updateRetailCourse(distance){
  if(!retailCourse.ready)return;
  const sample=coursePointAt(distance),yaw=Math.atan2(sample.tangent.x,-sample.tangent.z);
  retailCourse.group.rotation.y=yaw;
  const anchor=sample.position.clone().multiplyScalar(RETAIL_WORLD_SCALE).applyAxisAngle(upAxis,yaw);
  retailCourse.group.position.set(-anchor.x,-anchor.y,1.3-anchor.z);
}
async function loadStageOneCourse(){
  const [model,propModel,entityTable]=await Promise.all([
    fetch(`${STAGE_ONE_ROOT}2003.json`).then(response=>response.json()),
    fetch(`${STAGE_ONE_ROOT}2004.json`).then(response=>response.json()),
    fetch(`${STAGE_ONE_ROOT}2006-entities.json`).then(response=>response.json())
  ]);
  const group=new THREE.Group();group.name="retail-stage-1-course";group.scale.setScalar(RETAIL_WORLD_SCALE);world.add(group);
  const textureLoader=new THREE.TextureLoader(),materials=new Map();
  const materialFor=name=>{
    if(materials.has(name))return materials.get(name);
    const pending=(async()=>{
      if(name==="vertex-color")return new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide});
      const texture=await textureLoader.loadAsync(`${STAGE_ONE_ROOT}textures/${name.slice(4)}.png`);
      texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;
      return new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,transparent:true,alphaTest:.05});
    })();
    materials.set(name,pending);return pending;
  };
  const materialNames=new Set([...model.objects,...propModel.objects].flatMap(object=>object.groups.map(primitive=>primitive.material)));
  await Promise.all([...materialNames].map(materialFor));
  const makeObject=async(object,name)=>{
    const objectGroup=new THREE.Group();objectGroup.name=name;
    for(const primitive of object.groups){
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.Float32BufferAttribute(primitive.positions,3));
      if(primitive.uvs.length)geometry.setAttribute("uv",new THREE.Float32BufferAttribute(primitive.uvs,2));
      if(primitive.colors.length)geometry.setAttribute("color",new THREE.Float32BufferAttribute(primitive.colors,3));
      const mesh=new THREE.Mesh(geometry,await materialFor(primitive.material));mesh.frustumCulled=false;objectGroup.add(mesh);
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
  const collisionSpheresByModel=Array.from({length:propModel.objects.length},()=>[]);
  const collisionSurfacesByModel=Array.from({length:propModel.objects.length},()=>[]);
  for(const sphere of entityTable.collisionSpheres)collisionSpheresByModel[sphere.model].push(sphere);
  for(const surface of entityTable.collisionSurfaces)collisionSurfacesByModel[surface.model].push(surface);
  for(const entity of entityTable.entities){
    if(!entity.active||entity.currentModel<0)continue;
    const prop=propTemplates[entity.currentModel].clone(true);prop.name=`retail-entity-${entity.id}`;
    prop.position.fromArray(entity.position);prop.rotation.y=entity.baseYawRadians;
    prop.scale.set(Math.abs(entity.scale[0]),Math.abs(entity.scale[1]),Math.abs(entity.scale[0]));group.add(prop);retailCourse.visiblePropCount++;
    for(const sphere of collisionSpheresByModel[entity.currentModel])retailColliders.push({
      entityId:entity.id,
      object:prop,
      center:new THREE.Vector3().fromArray(sphere.center),
      radius:sphere.radius*RETAIL_WORLD_SCALE*Math.max(Math.abs(entity.scale[0]),Math.abs(entity.scale[1])),
      collisionClass:sphere.collisionClass,
      collisionVariant:sphere.collisionVariant,
      reactionParameters:sphere.reactionParameters
    });
    for(const surface of collisionSurfacesByModel[entity.currentModel])retailCollisionSurfaces.push({
      entityId:entity.id,
      object:prop,
      vertices:surface.vertices.map(vertex=>new THREE.Vector3().fromArray(vertex))
    });
  }
  retailCanTexture=await textureLoader.loadAsync(`${RETAIL_TEXTURE_ROOT}0001-023.png`);
  retailCanTexture.colorSpace=THREE.SRGBColorSpace;retailCanTexture.magFilter=THREE.NearestFilter;retailCanTexture.minFilter=THREE.NearestFilter;retailCanTexture.repeat.set(.5,1);
  const canMaterial=new THREE.SpriteMaterial({map:retailCanTexture,transparent:true,alphaTest:.05,depthWrite:false});
  for(const collectible of entityTable.collectibles){
    if(!collectible.active)continue;
    const sprite=new THREE.Sprite(canMaterial);sprite.name=`retail-collectible-${collectible.id}`;sprite.position.fromArray(collectible.position);sprite.scale.set(60,60,1);sprite.center.set(.5,0);group.add(sprite);
    retailCollectibles.push({id:collectible.id,sprite});
  }
  retailCourse.collectibleCount=retailCollectibles.length;
  const activeEncounterRecords=entityTable.encounterRecords.filter(record=>record.active);
  const encounterFrameIds=[...new Set(activeEncounterRecords.flatMap(record=>{
    const behaviorState=record.runtimeBytes36To39[2]&0x3f;
    return behaviorState===1||behaviorState===2?[record.spriteFrameId,record.spriteFrameId+1]:[record.spriteFrameId];
  }))];
  const encounterMaterials=new Map(await Promise.all(encounterFrameIds.map(async frameId=>{
    const texture=await textureLoader.loadAsync(`${STAGE_ONE_SPRITE_ROOT}2005-${String(frameId).padStart(3,"0")}.png`);
    texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;
    return[frameId,new THREE.SpriteMaterial({map:texture,transparent:true,alphaTest:.05,depthWrite:false})];
  })));
  const encounterActivationEventIds=new Set(activeEncounterRecords.map(record=>record.eventRecordIndex));
  const linkedEventIds=new Set([...encounterActivationEventIds].flatMap(eventId=>[eventId,eventId+1]));
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
  const authoredPath=model.sceneControl?.coursePath||[];
  const authoredSpawn=model.sceneControl?.spawn?.position;
  if(authoredSpawn&&authoredPath.length){
    retailCourse.path.push({position:new THREE.Vector3(...authoredSpawn),distance:0,tangent:null});
    for(const point of authoredPath.slice(1))retailCourse.path.push({position:new THREE.Vector3(point.position[0],roadHeight,point.position[1]),distance:0,tangent:null});
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
  retailCourse.group=group;retailCourse.length=retailCourse.path.at(-1).distance;retailCourse.ready=true;prototypeRoad.visible=false;prototypeBuildings.visible=false;updateRetailCourse(0);
}

let rig, material, idleClip, runClip, jumpClip, airborneClip, landingClip;
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

const input={left:false,right:false,forward:false,backward:false,gamepadX:0};
const gamepadState={jump:false,slide:false,forward:false,backward:false};
const state={running:false,x:0,vx:0,y:GROUND_Y,vy:0,grounded:true,jumpTime:0,landingTime:0,slide:0,sprint:0,brake:0,distance:0,cans:0,lives:3,speed:12,lastSpawn:-90,muted:false,invulnerable:0};
function setSteering(direction,active){if(direction<0)input.left=active;else input.right=active;}
function jump(){if(state.running&&state.grounded&&state.slide<=0){state.vy=JUMP_VELOCITY;state.grounded=false;state.jumpTime=.0001;state.landingTime=0;callout("JUMP!");}}
function slide(){if(state.running&&state.grounded){state.landingTime=0;state.slide=.65;callout("SLIDE!");}}
function squareAction(){if(!state.running||!state.grounded)return;if(input.forward||gamepadState.forward){state.sprint=.7;state.brake=0;state.slide=0;callout("SPRINT!");}else if(input.backward||gamepadState.backward){state.brake=.55;state.sprint=0;state.slide=0;callout("SKID!");}else slide();}
function readGamepad(){
  const pad=navigator.getGamepads?.()[0];if(!pad){input.gamepadX=0;gamepadState.forward=false;gamepadState.backward=false;return;}
  const stick=Math.abs(pad.axes[0]||0)>.16?pad.axes[0]:0,dpad=(pad.buttons[15]?.pressed?1:0)-(pad.buttons[14]?.pressed?1:0);input.gamepadX=THREE.MathUtils.clamp(stick||dpad,-1,1);gamepadState.forward=Boolean(pad.buttons[12]?.pressed);gamepadState.backward=Boolean(pad.buttons[13]?.pressed);
  const jumpPressed=Boolean(pad.buttons[0]?.pressed),slidePressed=Boolean(pad.buttons[2]?.pressed);if(jumpPressed&&!gamepadState.jump)jump();if(slidePressed&&!gamepadState.slide)squareAction();gamepadState.jump=jumpPressed;gamepadState.slide=slidePressed;
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
function callout(text){ui.callout.textContent=text;ui.callout.classList.add("show");setTimeout(()=>ui.callout.classList.remove("show"),380);}
function blip(frequency=650){if(state.muted)return;const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=frequency;gain.gain.setValueAtTime(.08,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.12);osc.connect(gain).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.13);}

function startGame(){if(!rig)return;retailCollidedEntities.clear();retailCollectedIds.clear();retailCollidedEncounterIds.clear();for(const collectible of retailCollectibles)collectible.sprite.visible=true;for(const event of retailEvents.values())event.state=event.initialState;for(const encounter of retailEncounters){encounter.sprite.visible=false;encounter.sprite.position.copy(encounter.basePosition);encounter.sprite.material=encounter.baseMaterial;encounter.reaction=null;encounter.removed=false;}state.running=true;state.distance=0;state.cans=0;state.lives=3;state.speed=12;state.x=0;state.vx=0;state.y=GROUND_Y;state.vy=0;state.grounded=true;state.jumpTime=0;state.landingTime=0;state.slide=0;state.sprint=0;state.brake=0;state.invulnerable=0;input.left=false;input.right=false;input.forward=false;input.backward=false;input.gamepadX=0;rig.position.x=0;ui.start.classList.add("hidden");ui.over.hidden=true;ui.hud.hidden=false;ui.music.currentTime=0;ui.music.volume=.5;ui.music.play().catch(()=>{});updateHud();}
function hit(){if(state.invulnerable>0)return;state.invulnerable=1.25;state.lives--;blip(110);callout("OUCH!");updateHud();if(state.lives<=0){state.running=false;ui.music.pause();ui.final.textContent=`${Math.floor(state.distance)} m`;ui.over.hidden=false;}}
function updateHud(){ui.distance.textContent=String(Math.floor(state.distance)).padStart(4,"0");ui.cans.textContent=String(state.cans).padStart(2,"0");ui.lives.forEach((life,i)=>life.classList.toggle("off",i>=state.lives));}

const collisionCenter=new THREE.Vector3();
const collectibleCenter=new THREE.Vector3();
const playerCoursePosition=new THREE.Vector3();
const eventWorldVertices=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
const playerProbeCenters=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
const PLAYER_PROBE_RADII=[20*RETAIL_WORLD_SCALE,35*RETAIL_WORLD_SCALE,35*RETAIL_WORLD_SCALE];
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
    if(collider.collisionClass===0||retailCollidedEntities.has(collider.entityId))continue;
    collider.object.localToWorld(collisionCenter.copy(collider.center));
    for(let probeIndex=0;probeIndex<playerProbeCenters.length;probeIndex++){
      const combinedRadius=collider.radius+PLAYER_PROBE_RADII[probeIndex];
      if(collisionCenter.distanceToSquared(playerProbeCenters[probeIndex])<combinedRadius*combinedRadius){
        retailCollidedEntities.add(collider.entityId);hit();break;
      }
    }
  }
}
function testRetailCollectibles(){
  if(!retailCourse.ready||!rig)return;
  updatePlayerProbeCenters();
  for(const collectible of retailCollectibles){
    if(retailCollectedIds.has(collectible.id))continue;
    collectible.sprite.getWorldPosition(collectibleCenter);
    for(let probeIndex=0;probeIndex<playerProbeCenters.length;probeIndex++){
      const combinedRadius=RETAIL_PICKUP_RADIUS+PLAYER_PROBE_RADII[probeIndex];
      if(collectibleCenter.distanceToSquared(playerProbeCenters[probeIndex])>combinedRadius*combinedRadius)continue;
      retailCollectedIds.add(collectible.id);collectible.sprite.visible=false;state.cans++;blip(900);callout("PEPSI!");break;
    }
  }
}
function updateRetailEncounters(dt){
  if(!retailCourse.ready||!rig)return;
  for(const event of retailEvents.values()){
    if(event.state!==0)continue;
    for(let index=0;index<4;index++)retailCourse.group.localToWorld(eventWorldVertices[index].copy(event.vertices[index]));
    const[a,b,c,d]=eventWorldVertices;
    if(pointInTriangleXZ(rig.position.x,rig.position.z,a,b,c)||pointInTriangleXZ(rig.position.x,rig.position.z,b,d,c))event.state=1;
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

let previous=performance.now()/1000;
function tick(nowMs){requestAnimationFrame(tick);const now=nowMs/1000,dt=Math.min(.04,now-previous);previous=now;
  if(retailCanTexture)retailCanTexture.offset.x=(Math.floor(now*8)%2)*.5;
  if(state.running){
    readGamepad();
    state.sprint=Math.max(0,state.sprint-dt);state.brake=Math.max(0,state.brake-dt);const baseSpeed=Math.min(25,12+state.distance/500);state.speed=baseSpeed*(state.sprint>0?1.3:state.brake>0?.62:1);state.distance+=state.speed*dt;state.invulnerable=Math.max(0,state.invulnerable-dt);
    const keyboardSteering=(input.right?1:0)-(input.left?1:0),steering=keyboardSteering||input.gamepadX,targetVx=steering*STEER_SPEED;
    state.vx=THREE.MathUtils.damp(state.vx,targetVx,steering?14:9,dt);state.x=THREE.MathUtils.clamp(state.x+state.vx*dt,-ROAD_EDGE_X,ROAD_EDGE_X);if(Math.abs(state.x)===ROAD_EDGE_X&&Math.sign(state.vx)===Math.sign(state.x))state.vx=0;
    updateRetailCourse(state.distance);
    scene.updateMatrixWorld(true);updateVerticalMotion(dt,runnerGroundHeight());state.slide=Math.max(0,state.slide-dt);
    rig.position.x=state.x;rig.position.y=.02+state.y;rig.scale.y=state.slide>0?.0048:.008;
    const takeoffDuration=(jumpClip.frameCount-1)/jumpClip.fps,landingContactTime=LANDING_CONTACT_FRAME/landingClip.fps,landingRecoveryDuration=(landingClip.frameCount-1-LANDING_CONTACT_FRAME)/landingClip.fps;
    if(!state.grounded&&state.jumpTime<=takeoffDuration)sampleAnimation(jumpClip,state.jumpTime,false,true);
    else if(!state.grounded&&state.vy>0)sampleAnimation(airborneClip,state.jumpTime-takeoffDuration,true,true);
    else if(!state.grounded){const descentProgress=THREE.MathUtils.clamp(-state.vy/JUMP_VELOCITY,0,1);sampleAnimation(landingClip,descentProgress*landingContactTime,false,true);}
    else if(state.landingTime>0&&state.landingTime<=landingRecoveryDuration)sampleAnimation(landingClip,landingContactTime+state.landingTime,false,true);
    else{state.landingTime=0;sampleAnimation(runClip,now*1.15);}
    rig.visible=state.invulnerable<=0||Math.floor(state.invulnerable*14)%2===0;
    updateRetailEncounters(dt);testRetailCollectibles();testRetailCollisions();
    for(const mark of markings){mark.position.z+=state.speed*dt;if(mark.position.z>18)mark.position.z-=126;}
    updateHud();
  } else if(rig){rig.visible=true;sampleAnimation(idleClip,now);updateRetailCourse(0);}
  camera.position.x=THREE.MathUtils.damp(camera.position.x,(rig?.position.x||0)*.2,5,dt);renderer.render(scene,camera);
}
requestAnimationFrame(tick);

addEventListener("keydown",event=>{if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(event.key))event.preventDefault();if(event.key==="ArrowLeft"||event.key.toLowerCase()==="a")setSteering(-1,true);if(event.key==="ArrowRight"||event.key.toLowerCase()==="d")setSteering(1,true);if(event.key==="ArrowUp"||event.key.toLowerCase()==="w")input.forward=true;if(event.key==="ArrowDown"||event.key.toLowerCase()==="s")input.backward=true;if(!event.repeat&&(event.key===" "||event.key.toLowerCase()==="x"))jump();if(!event.repeat&&(event.key.toLowerCase()==="c"||event.key==="Shift"))squareAction();if(event.key==="Enter"&&!state.running)startGame();});
addEventListener("keyup",event=>{if(event.key==="ArrowLeft"||event.key.toLowerCase()==="a")setSteering(-1,false);if(event.key==="ArrowRight"||event.key.toLowerCase()==="d")setSteering(1,false);if(event.key==="ArrowUp"||event.key.toLowerCase()==="w")input.forward=false;if(event.key==="ArrowDown"||event.key.toLowerCase()==="s")input.backward=false;});
addEventListener("blur",()=>{input.left=false;input.right=false;input.forward=false;input.backward=false;input.gamepadX=0;});
document.querySelectorAll("[data-control]").forEach(button=>{const control=button.dataset.control;if(control==="left"||control==="right"){const direction=control==="left"?-1:1;button.addEventListener("pointerdown",event=>{button.setPointerCapture(event.pointerId);setSteering(direction,true);});for(const type of ["pointerup","pointercancel","lostpointercapture"])button.addEventListener(type,()=>setSteering(direction,false));}else button.addEventListener("pointerdown",()=>({jump,slide}[control]()));});
ui.button.disabled=true;ui.button.addEventListener("click",startGame);ui.retry.addEventListener("click",startGame);
ui.sound.addEventListener("click",()=>{state.muted=!state.muted;ui.music.muted=state.muted;ui.sound.textContent=state.muted?"×":"♪";});
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
Promise.all([loadCharacter(),loadStageOneCourse()]).then(()=>{ui.loading.textContent=`ORIGINAL RIG + RETAIL STAGE 1 READY · ${retailCourse.chunkCount} COURSE CHUNKS · ${retailCourse.visiblePropCount} ACTIVE PROPS · ${retailCourse.collectibleCount} RETAIL CANS · ${retailCourse.encounterCount} TRIGGERED ENCOUNTERS · ${retailColliders.length} SPHERES · ${retailCollisionSurfaces.length} LANDING SURFACES`;ui.button.disabled=false;}).catch(error=>{console.error(error);ui.loading.textContent="ASSET LOAD FAILED — USE A LOCAL WEB SERVER";});
