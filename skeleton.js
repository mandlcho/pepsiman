import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

const ASSET_ROOT="./assets/ripped/pepsiman/";
const FBX_PATH="./exports/pepsiman/Pepsiman_Rig.fbx";
const STORAGE_KEY="pepsiman-skeleton-overrides-v2";
const JOINT_NAMES={1001:"root",1:"pelvis",2:"torso",3:"right shoulder",4:"right elbow",5:"right hand",6:"left shoulder",7:"left elbow",8:"left hand",9:"neck",10:"head",11:"right hip",12:"right knee",13:"right foot",14:"left hip",15:"left knee",16:"left foot"};
const FBX_JOINT_IDS={root:1001,pelvis:1,spine:2,shoulderR:3,elbowR:4,handR:5,shoulderL:6,elbowL:7,handL:8,neck:9,head:10,hipR:11,kneeR:12,footR:13,hipL:14,kneeL:15,footL:16};
const $=selector=>document.querySelector(selector);

const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;$("#viewport").append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x080c14);
const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.01,100);
scene.add(new THREE.HemisphereLight(0xc8e7ff,0x152033,2.5));
const key=new THREE.DirectionalLight(0xffffff,3.2);key.position.set(-4,7,5);scene.add(key);
const rim=new THREE.DirectionalLight(0x277dd8,2.2);rim.position.set(5,3,-5);scene.add(rim);
scene.add(new THREE.GridHelper(10,40,0x32465f,0x172232));
const axes=new THREE.AxesHelper(2);axes.visible=false;scene.add(axes);
const rig=new THREE.Group();rig.scale.setScalar(.008);rig.rotation.y=Math.PI;scene.add(rig);
const debug=new THREE.Group();scene.add(debug);
const transformControls=new TransformControls(camera,renderer.domElement);transformControls.setSpace("local");transformControls.setSize(.7);scene.add(transformControls.getHelper());

const nodes=new Map(),markers=new Map(),labels=new Map(),setupById=new Map(),baseTransforms=new Map(),bindTransforms=new Map(),meshes=[];
let boneLines,selectedId=1001,animationsData,fbxClips=[],mixer=null,activeAction=null,activeClip=null,isPlaying=false,animationFrame=0,playbackSpeed=1,gizmoDragging=false,savedSnapshot="",dragStartSnapshot="";
const editHistory=[];

const target=new THREE.Vector3(0,.95,0);let radius=4,theta=0,phi=1.48;
function placeCamera(){camera.position.set(target.x+radius*Math.sin(phi)*Math.sin(theta),target.y+radius*Math.cos(phi),target.z+radius*Math.sin(phi)*Math.cos(theta));camera.lookAt(target);}
function setView(nextTheta,nextPhi=1.48,nextRadius=4){theta=nextTheta;phi=nextPhi;radius=nextRadius;placeCamera();}
placeCamera();$("#front").onclick=()=>setView(0);$("#side").onclick=()=>setView(Math.PI/2);$("#reset-view").onclick=()=>setView(0,1.48,4);

let dragging=false,moved=false,lastX=0,lastY=0;
renderer.domElement.addEventListener("pointerdown",event=>{if(gizmoDragging)return;dragging=true;moved=false;lastX=event.clientX;lastY=event.clientY;renderer.domElement.setPointerCapture(event.pointerId);});
renderer.domElement.addEventListener("pointermove",event=>{if(!dragging||gizmoDragging)return;const dx=event.clientX-lastX,dy=event.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;theta-=dx*.008;phi=THREE.MathUtils.clamp(phi-dy*.008,.15,Math.PI-.15);lastX=event.clientX;lastY=event.clientY;placeCamera();});
renderer.domElement.addEventListener("pointerup",()=>dragging=false);
renderer.domElement.addEventListener("wheel",event=>{radius=THREE.MathUtils.clamp(radius*Math.exp(event.deltaY*.001),2.5,12);placeCamera();event.preventDefault();},{passive:false});

function cloneTransform(node){return{position:node.position.clone(),rotation:node.rotation.clone()};}
function copyTransform(targetTransform,source){targetTransform.position.copy(source.position);targetTransform.rotation.copy(source.rotation);}
function savedOverrides(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}").joints||{};}catch{return{};}}
function serializeRig(){
  const joints={};
  for(const [id,transform] of bindTransforms)joints[id]={parentId:setupById.get(id).parentId,position:transform.position.toArray(),rotation:[transform.rotation.x,transform.rotation.y,transform.rotation.z]};
  return{version:1,space:"three-local",source:"Pepsiman TOD bind setup",joints};
}
function currentSnapshot(){return JSON.stringify(serializeRig());}
function updateSaveState(message){
  const dirty=currentSnapshot()!==savedSnapshot;$("#save-state").classList.toggle("dirty",dirty);$("#save-state").textContent=message||(dirty?"UNSAVED CHANGES · PRESS SAVE TO APPLY TO THE GAME":"SAVED · GAME WILL USE THIS RIG AFTER RELOAD");$("#undo-edit").disabled=editHistory.length===0;
}
function pushHistory(snapshot=currentSnapshot()){
  if(editHistory.at(-1)===snapshot)return;editHistory.push(snapshot);if(editHistory.length>20)editHistory.shift();$("#undo-edit").disabled=false;
}
function restoreSnapshot(snapshot){
  const data=JSON.parse(snapshot);for(const [idString,value] of Object.entries(data.joints)){const id=Number(idString);bindTransforms.get(id).position.fromArray(value.position);bindTransforms.get(id).rotation.set(...value.rotation,"XYZ");}enterBindMode();selectJoint(selectedId);updateSaveState("UNDO APPLIED · PRESS SAVE TO KEEP IT");
}
function saveRig(){
  const data=serializeRig();localStorage.setItem(STORAGE_KEY,JSON.stringify(data));savedSnapshot=JSON.stringify(data);updateSaveState("SAVED · RELOAD THE GAME TO USE THIS RIG");
}

function applyBindPose(){for(const [id,node] of nodes)copyTransform(node,bindTransforms.get(id));}
function enterBindMode(){
  activeAction?.stop();activeAction=null;activeClip=null;isPlaying=false;animationFrame=0;markAnimationItem("bind");$("#play-animation").textContent="PLAY";$("#animation-frame").value=0;$("#animation-frame").max=1;$("#frame-readout").textContent="FRAME 0 / 0";
  applyBindPose();if(nodes.has(selectedId))transformControls.attach(nodes.get(selectedId));$("#status").textContent="EDITING BIND RIG";
}
function setEditorValues(){
  const transform=bindTransforms.get(selectedId);if(!transform)return;
  for(const [axis,index] of [["x",0],["y",1],["z",2]]){$(`#position-${axis}`).value=transform.position.getComponent(index).toFixed(3);$(`#rotation-${axis}`).value=THREE.MathUtils.radToDeg(transform.rotation[axis]).toFixed(2);}
}
function selectJoint(id){
  selectedId=Number(id);$("#joint-select").value=String(selectedId);for(const [jointId,label] of labels)label.classList.toggle("selected",jointId===selectedId);
  setEditorValues();if(!activeClip)transformControls.attach(nodes.get(selectedId));
}
function setMode(mode){
  enterBindMode();transformControls.setMode(mode);$("#translate-mode").classList.toggle("active",mode==="translate");$("#rotate-mode").classList.toggle("active",mode==="rotate");
}

function applyAnimationFrame(){
  if(!activeClip)return;applyBindPose();
  mixer.setTime(animationFrame/activeClip.fps);
  $("#animation-frame").value=animationFrame;$("#frame-readout").textContent=`FRAME ${animationFrame.toFixed(2)} / ${activeClip.frameCount-1}`;
}
function markAnimationItem(value){for(const item of document.querySelectorAll(".animation-item"))item.classList.toggle("active",item.dataset.clip===String(value));}
function chooseClip(value){
  if(value==="bind"){enterBindMode();return;}
  activeClip=animationsData.clips.find(clip=>clip.id===Number(value));const fbxClip=fbxClips.find(clip=>clip.name===activeClip.name);if(!fbxClip)throw new Error(`FBX animation ${activeClip.name} is missing`);activeAction?.stop();activeAction=mixer.clipAction(fbxClip);activeAction.reset().play();isPlaying=true;animationFrame=0;transformControls.detach();markAnimationItem(value);
  $("#animation-frame").max=Math.max(0,activeClip.frameCount-1);$("#animation-frame").value=0;$("#play-animation").textContent="PAUSE";$("#status").textContent=`PLAYING FBX · ${activeClip.label.toUpperCase()}`;applyAnimationFrame();
}

async function loadRig(){
  const [character,animations]=await Promise.all([new FBXLoader().loadAsync(FBX_PATH),fetch(`${ASSET_ROOT}animations.json`).then(response=>response.json())]);animationsData=animations;fbxClips=character.animations;for(const clip of fbxClips)clip.name=clip.name.split("|").at(-1);mixer=new THREE.AnimationMixer(character);
  for(const setup of animations.setup.objects)setupById.set(setup.id,setup);
  character.name="Pepsiman_FBX_Character";character.traverse(object=>{
    if(object.isBone&&FBX_JOINT_IDS[object.name])nodes.set(FBX_JOINT_IDS[object.name],object);
    if(object.isSkinnedMesh){object.frustumCulled=false;object.castShadow=true;object.receiveShadow=true;meshes.push(object);const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials){material.side=THREE.DoubleSide;material.transparent=true;material.alphaTest=.05;if(material.map){material.map.colorSpace=THREE.SRGBColorSpace;material.map.magFilter=THREE.NearestFilter;material.map.minFilter=THREE.NearestFilter;}}}
  });
  if(nodes.size!==17)throw new Error(`FBX skeleton has ${nodes.size} mapped bones; expected 17`);if(fbxClips.length!==50)throw new Error(`FBX has ${fbxClips.length} clips; expected 50`);
  rig.add(character);
  const overrides=savedOverrides();
  for(const [id,node] of nodes){baseTransforms.set(id,cloneTransform(node));const override=overrides[id];if(override?.position)node.position.fromArray(override.position);if(override?.rotation)node.rotation.set(...override.rotation,"XYZ");bindTransforms.set(id,cloneTransform(node));}
  const jointSelect=$("#joint-select");
  for(const id of nodes.keys()){jointSelect.add(new Option(`${id} · ${JOINT_NAMES[id].toUpperCase()}`,id));const marker=new THREE.Mesh(new THREE.SphereGeometry(id===1001 ? .05 : .035,12,8),new THREE.MeshBasicMaterial({color:id===1001?0x62c990:id===1?0xf02a42:0x38a2ff,depthTest:false}));marker.renderOrder=4;marker.userData.jointId=id;debug.add(marker);markers.set(id,marker);const label=document.createElement("span");label.className="joint-label";label.textContent=id===1001?"R":id;$("#labels").append(label);labels.set(id,label);}
  for(const clip of animations.clips){const item=document.createElement("button");item.className="animation-item";item.dataset.clip=clip.id;item.textContent=`≈ ${clip.label||`MOTION ${clip.id}`} · ${clip.frameCount}F`;item.title=`Inferred label for retail motion ${clip.id} · ${clip.frameCount} frames at ${clip.fps} FPS`;$("#animation-list").append(item);}
  const linePositions=[];for(const [id] of nodes)if(nodes.has(setupById.get(id).parentId))linePositions.push(0,0,0,0,0,0);
  const lineGeometry=new THREE.BufferGeometry();lineGeometry.setAttribute("position",new THREE.Float32BufferAttribute(linePositions,3));boneLines=new THREE.LineSegments(lineGeometry,new THREE.LineBasicMaterial({color:0xffd86a,depthTest:false,transparent:true,opacity:.9}));boneLines.renderOrder=3;debug.add(boneLines);
  savedSnapshot=currentSnapshot();selectJoint(1001);updateDebugGeometry();updateSaveState();$("#status").textContent="FBX SKIN + 50 FBX CLIPS READY";
}

function updateDebugGeometry(){
  if(!boneLines)return;rig.updateMatrixWorld(true);const position=boneLines.geometry.attributes.position,a=new THREE.Vector3(),b=new THREE.Vector3();let offset=0;
  for(const [id,node] of nodes){node.getWorldPosition(a);markers.get(id).position.copy(a);const parent=nodes.get(setupById.get(id).parentId);if(parent){parent.getWorldPosition(b);position.setXYZ(offset++,a.x,a.y,a.z);position.setXYZ(offset++,b.x,b.y,b.z);}}position.needsUpdate=true;
}

$("#show-mesh").onchange=event=>meshes.forEach(mesh=>mesh.visible=event.target.checked);$("#show-bones").onchange=event=>boneLines.visible=event.target.checked;$("#show-joints").onchange=event=>{for(const marker of markers.values())marker.visible=event.target.checked;$("#labels").hidden=!event.target.checked;};$("#show-axes").onchange=event=>axes.visible=event.target.checked;
$("#joint-select").onchange=event=>selectJoint(event.target.value);$("#translate-mode").onclick=()=>setMode("translate");$("#rotate-mode").onclick=()=>setMode("rotate");
for(const axis of ["x","y","z"]){
  $(`#position-${axis}`).onchange=event=>{enterBindMode();pushHistory();bindTransforms.get(selectedId).position[axis]=Number(event.target.value);applyBindPose();setEditorValues();updateSaveState();};
  $(`#rotation-${axis}`).onchange=event=>{enterBindMode();pushHistory();bindTransforms.get(selectedId).rotation[axis]=THREE.MathUtils.degToRad(Number(event.target.value));applyBindPose();setEditorValues();updateSaveState();};
}
$("#undo-edit").onclick=()=>{const snapshot=editHistory.pop();if(snapshot)restoreSnapshot(snapshot);};
$("#save-rig").onclick=saveRig;
$("#reset-joint").onclick=()=>{enterBindMode();pushHistory();bindTransforms.set(selectedId,{position:baseTransforms.get(selectedId).position.clone(),rotation:baseTransforms.get(selectedId).rotation.clone()});applyBindPose();selectJoint(selectedId);updateSaveState("JOINT RESET · UNSAVED");};
$("#reset-all").onclick=()=>{enterBindMode();pushHistory();for(const [id,base] of baseTransforms)bindTransforms.set(id,{position:base.position.clone(),rotation:base.rotation.clone()});applyBindPose();selectJoint(selectedId);updateSaveState("ORIGINAL BIND RIG RESTORED · UNSAVED");};
$("#export-rig").onclick=()=>{const blob=new Blob([JSON.stringify(serializeRig(),null,2)],{type:"application/json"}),link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download="pepsiman-skeleton-overrides.json";link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);};
$("#animation-list").onclick=event=>{const item=event.target.closest(".animation-item");if(item)chooseClip(item.dataset.clip);};$("#play-animation").onclick=()=>{if(!activeClip)return;isPlaying=!isPlaying;$("#play-animation").textContent=isPlaying?"PAUSE":"PLAY";};
$("#animation-frame").oninput=event=>{if(!activeClip)return;isPlaying=false;$("#play-animation").textContent="PLAY";animationFrame=Number(event.target.value);applyAnimationFrame();};$("#playback-speed").onchange=event=>playbackSpeed=Number(event.target.value);
transformControls.addEventListener("dragging-changed",event=>{gizmoDragging=event.value;if(event.value){dragStartSnapshot=currentSnapshot();}else if(selectedId){bindTransforms.set(selectedId,cloneTransform(nodes.get(selectedId)));if(dragStartSnapshot!==currentSnapshot())pushHistory(dragStartSnapshot);dragStartSnapshot="";setEditorValues();updateSaveState();}});transformControls.addEventListener("objectChange",()=>{if(selectedId){bindTransforms.set(selectedId,cloneTransform(nodes.get(selectedId)));setEditorValues();updateSaveState();}});

const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();renderer.domElement.addEventListener("click",event=>{if(moved||gizmoDragging)return;pointer.set(event.clientX/innerWidth*2-1,-event.clientY/innerHeight*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects([...markers.values()])[0];if(hit)selectJoint(hit.object.userData.jointId);});
addEventListener("keydown",event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="z"){event.preventDefault();const snapshot=editHistory.pop();if(snapshot)restoreSnapshot(snapshot);return;}if(event.target.matches("input,select"))return;if(event.key.toLowerCase()==="w")setMode("translate");if(event.key.toLowerCase()==="e")setMode("rotate");});

let previous=performance.now()/1000;
function render(nowMs){requestAnimationFrame(render);const now=nowMs/1000,dt=Math.min(.1,now-previous);previous=now;if(activeClip&&isPlaying){animationFrame=(animationFrame+dt*activeClip.fps*playbackSpeed)%activeClip.frameCount;applyAnimationFrame();}updateDebugGeometry();const projected=new THREE.Vector3();for(const [id,marker] of markers){marker.getWorldPosition(projected);projected.project(camera);const label=labels.get(id),visible=projected.z>-1&&projected.z<1;label.style.display=visible?"grid":"none";label.style.left=`${(projected.x*.5+.5)*innerWidth}px`;label.style.top=`${(-projected.y*.5+.5)*innerHeight}px`;}renderer.render(scene,camera);}
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});loadRig().catch(error=>{console.error(error);$("#status").textContent="RIG LOAD FAILED";});requestAnimationFrame(render);
