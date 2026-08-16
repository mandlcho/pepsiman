import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { applyExtractedPelvisMotion, applySetupTransform, TOD_TRANSLATION_SCALE } from "./rig-math.js";

const ASSET_ROOT = "./assets/ripped/pepsiman/";
const lanes = [-2.25, 0, 2.25];
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
const roadMaterial = new THREE.MeshLambertMaterial({ color:0x33404a });
const road = new THREE.Mesh(new THREE.PlaneGeometry(10, 220), roadMaterial);
road.rotation.x = -Math.PI / 2; road.position.z = -80; road.receiveShadow = true; world.add(road);
const curbMaterial = new THREE.MeshLambertMaterial({ color:0xd9e0df });
for (const x of [-5.25, 5.25]) {
  const curb = new THREE.Mesh(new THREE.BoxGeometry(.5,.22,220),curbMaterial);
  curb.position.set(x,.08,-80); world.add(curb);
}
const markings = [];
for (let z=-105; z<18; z+=7) for (const x of [-1.12,1.12]) {
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(.1,3.5),new THREE.MeshBasicMaterial({color:0xe9edf0}));
  mark.rotation.x=-Math.PI/2; mark.position.set(x,.015,z); world.add(mark); markings.push(mark);
}

const buildingMaterials = [0x345d7b,0x526d7e,0x23536b,0x6f7880].map(color=>new THREE.MeshLambertMaterial({color}));
for (let z=-110;z<12;z+=8) for (const side of [-1,1]) {
  const height=4+Math.random()*9, width=3+Math.random()*4;
  const b=new THREE.Mesh(new THREE.BoxGeometry(width,height,6),buildingMaterials[(Math.random()*4)|0]);
  b.position.set(side*(8+Math.random()*4),height/2-.1,z+Math.random()*3); world.add(b);
  for(let y=1.4;y<height-1;y+=1.6) {
    const win=new THREE.Mesh(new THREE.PlaneGeometry(width*.65,.45),new THREE.MeshBasicMaterial({color:0x9ee4ff}));
    win.position.set(b.position.x-side*(width/2+.01),y,b.position.z+1); win.rotation.y=side*Math.PI/2; world.add(win);
  }
}

let rig, material, idleClip, runClip;
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
  rig=new THREE.Group(); rig.scale.setScalar(.008); rig.rotation.y=Math.PI; scene.add(rig);
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
  ui.loading.textContent=`ORIGINAL RIG READY · ${animations.clips.length} VALIDATED MOTION CLIPS`;
  ui.button.disabled=false;
}

function lerpAngle(a,b,t){return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;}
function sampleTrack(track,frame,frameCount){
  let a=track.frames[0],b=a;
  for(let i=0;i<track.frames.length;i++)if(track.frames[i].time<=frame){a=track.frames[i];b=track.frames[(i+1)%track.frames.length]||a;}
  const span=((b.time-a.time+frameCount)%frameCount)||1,mix=((frame-a.time+frameCount)%frameCount)/span,br=b.rotation||a.rotation;
  return{rotation:a.rotation.map((value,index)=>lerpAngle(value,br[index],mix)),translation:a.translation?.map((value,index)=>THREE.MathUtils.lerp(value,(b.translation||a.translation)[index],mix))};
}
function sampleAnimation(clip,time){
  if(!clip)return;
  for(const [id,node] of nodes){const bind=bindTransforms.get(id);node.position.copy(bind.position);node.rotation.copy(bind.rotation);}
  const frame=(time*clip.fps)%clip.frameCount;
  const rootTrack=clip.objects.find(track=>track.id===1);
  if(rootTrack?.frames.length){
    const rootSample=sampleTrack(rootTrack,frame,clip.frameCount);
    applyExtractedPelvisMotion(THREE,nodes.get(1),bindTransforms.get(1),baseTransforms.get(1),rootSample);
  }
  for(const track of clip.objects){
    if(track.id===1)continue;
    const node=nodes.get(track.id),base=baseTransforms.get(track.id),bind=bindTransforms.get(track.id);if(!node||!track.frames.length)continue;
    const sample=sampleTrack(track,frame,clip.frameCount);
    node.rotation.set(sample.rotation[0]+bind.rotation.x-base.rotation.x,-sample.rotation[1]+bind.rotation.y-base.rotation.y,-sample.rotation[2]+bind.rotation.z-base.rotation.z,"XYZ");
    if(sample.translation)node.position.set(sample.translation[0]*TOD_TRANSLATION_SCALE+bind.position.x-base.position.x,-sample.translation[1]*TOD_TRANSLATION_SCALE+bind.position.y-base.position.y,-sample.translation[2]*TOD_TRANSLATION_SCALE+bind.position.z-base.position.z);
  }
}

const entities=[];
const boxMaterial=new THREE.MeshLambertMaterial({color:0xf0bf35});
const barrierMaterial=new THREE.MeshLambertMaterial({color:0xf2f0e9});
const redMaterial=new THREE.MeshLambertMaterial({color:0xe9293e});
function makeCan() {
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,.75,10),new THREE.MeshLambertMaterial({color:0x0877de}));
  const stripe=new THREE.Mesh(new THREE.TorusGeometry(.285,.06,5,12),redMaterial); stripe.rotation.x=Math.PI/2;
  g.add(body,stripe); g.userData.kind="can"; return g;
}
function makeObstacle(kind) {
  const g=new THREE.Group(); g.userData.kind=kind;
  if(kind==="barrier") {
    const beam=new THREE.Mesh(new THREE.BoxGeometry(1.45,.65,.42),barrierMaterial); beam.position.y=.65; g.add(beam);
    for(let x=-.5;x<=.5;x+=1){const leg=new THREE.Mesh(new THREE.BoxGeometry(.18,.8,.2),redMaterial);leg.position.set(x,.35,0);g.add(leg);}
  } else {
    const box=new THREE.Mesh(new THREE.BoxGeometry(1.5,1.5,1.5),boxMaterial);box.position.y=.75;g.add(box);
  }
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}}); return g;
}
function spawnRow(z=-85) {
  const safe=(Math.random()*3)|0;
  for(let lane=0;lane<3;lane++) {
    if(lane===safe||Math.random()<.28) {
      if(Math.random()<.68){const can=makeCan();can.position.set(lanes[lane],1,z-Math.random()*3);world.add(can);entities.push(can);}
    } else {
      const ob=makeObstacle(Math.random()<.58?"barrier":"crate");ob.position.set(lanes[lane],0,z);world.add(ob);entities.push(ob);
    }
  }
}
for(let i=0;i<9;i++) spawnRow(-18-i*10);

const state={running:false,lane:1,targetX:0,y:0,vy:0,slide:0,distance:0,cans:0,lives:3,speed:12,lastSpawn:-90,muted:false,invulnerable:0};
function move(direction){if(!state.running)return;state.lane=THREE.MathUtils.clamp(state.lane+direction,0,2);state.targetX=lanes[state.lane];}
function jump(){if(state.running&&state.y<.02&&state.slide<=0){state.vy=8.3;callout("JUMP!");}}
function slide(){if(state.running&&state.y<.1){state.slide=.65;callout("SLIDE!");}}
function callout(text){ui.callout.textContent=text;ui.callout.classList.add("show");setTimeout(()=>ui.callout.classList.remove("show"),380);}
function blip(frequency=650){if(state.muted)return;const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=frequency;gain.gain.setValueAtTime(.08,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.12);osc.connect(gain).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.13);}

function startGame(){if(!rig)return;for(const entity of entities)world.remove(entity);entities.length=0;for(let i=0;i<9;i++)spawnRow(-18-i*10);state.running=true;state.distance=0;state.cans=0;state.lives=3;state.speed=12;state.lane=1;state.targetX=0;state.y=0;state.vy=0;state.slide=0;state.invulnerable=0;ui.start.classList.add("hidden");ui.over.hidden=true;ui.hud.hidden=false;ui.music.currentTime=0;ui.music.volume=.5;ui.music.play().catch(()=>{});updateHud();}
function hit(){if(state.invulnerable>0)return;state.invulnerable=1.25;state.lives--;blip(110);callout("OUCH!");updateHud();if(state.lives<=0){state.running=false;ui.music.pause();ui.final.textContent=`${Math.floor(state.distance)} m`;ui.over.hidden=false;}}
function updateHud(){ui.distance.textContent=String(Math.floor(state.distance)).padStart(4,"0");ui.cans.textContent=String(state.cans).padStart(2,"0");ui.lives.forEach((life,i)=>life.classList.toggle("off",i>=state.lives));}

let previous=performance.now()/1000;
function tick(nowMs){requestAnimationFrame(tick);const now=nowMs/1000,dt=Math.min(.04,now-previous);previous=now;
  if(state.running){
    state.speed=Math.min(25,12+state.distance/500);state.distance+=state.speed*dt;state.invulnerable=Math.max(0,state.invulnerable-dt);
    state.vy-=20*dt;state.y=Math.max(0,state.y+state.vy*dt);if(state.y===0)state.vy=0;state.slide=Math.max(0,state.slide-dt);
    rig.position.x=THREE.MathUtils.damp(rig.position.x,state.targetX,12,dt);rig.position.y=.02+state.y;rig.scale.y=state.slide>0?.0048:.008;
    sampleAnimation(runClip,now*1.15);rig.visible=state.invulnerable<=0||Math.floor(state.invulnerable*14)%2===0;
    for(const mark of markings){mark.position.z+=state.speed*dt;if(mark.position.z>18)mark.position.z-=126;}
    for(let i=entities.length-1;i>=0;i--){const e=entities[i];e.position.z+=state.speed*dt;if(e.userData.kind==="can"){e.rotation.y+=dt*4;e.rotation.z=Math.sin(now*3)*.12;}
      const close=Math.abs(e.position.z-rig.position.z)<.85&&Math.abs(e.position.x-rig.position.x)<.8;
      if(close&&!e.userData.hit){e.userData.hit=true;if(e.userData.kind==="can"){state.cans++;blip();callout("PEPSI!");world.remove(e);entities.splice(i,1);updateHud();continue;}const clear=e.userData.kind==="barrier"?state.y>1.05:state.slide>0;if(!clear)hit();}
      if(e.position.z>13){world.remove(e);entities.splice(i,1);}
    }
    const farthest=entities.reduce((min,e)=>Math.min(min,e.position.z),0);if(farthest>-90)spawnRow(farthest-10-Math.random()*3);
    updateHud();
  } else if(rig){rig.visible=true;sampleAnimation(idleClip,now);}
  camera.position.x=THREE.MathUtils.damp(camera.position.x,(rig?.position.x||0)*.2,5,dt);renderer.render(scene,camera);
}
requestAnimationFrame(tick);

addEventListener("keydown",event=>{if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(event.key))event.preventDefault();if(event.key==="ArrowLeft"||event.key.toLowerCase()==="a")move(-1);if(event.key==="ArrowRight"||event.key.toLowerCase()==="d")move(1);if(event.key==="ArrowUp"||event.key===" ")jump();if(event.key==="ArrowDown"||event.key.toLowerCase()==="s")slide();if(event.key==="Enter"&&!state.running)startGame();});
document.querySelectorAll("[data-control]").forEach(button=>button.addEventListener("pointerdown",()=>({left:()=>move(-1),right:()=>move(1),jump,slide}[button.dataset.control]())));
ui.button.disabled=true;ui.button.addEventListener("click",startGame);ui.retry.addEventListener("click",startGame);
ui.sound.addEventListener("click",()=>{state.muted=!state.muted;ui.music.muted=state.muted;ui.sound.textContent=state.muted?"×":"♪";});
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
loadCharacter().catch(error=>{console.error(error);ui.loading.textContent="ASSET LOAD FAILED — USE A LOCAL WEB SERVER";});
