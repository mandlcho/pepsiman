import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

const ASSET_ROOT = "./assets/ripped/pepsiman/";
const viewport = document.querySelector("#viewport");
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:"high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace; viewport.append(renderer.domElement);

const scene=new THREE.Scene(); scene.background=new THREE.Color(0x080c14);
const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.01,100);
scene.add(new THREE.HemisphereLight(0xc8e7ff,0x152033,2.5));
const key=new THREE.DirectionalLight(0xffffff,3.2); key.position.set(-4,7,5); scene.add(key);
const rim=new THREE.DirectionalLight(0x277dd8,2.2); rim.position.set(5,3,-5); scene.add(rim);
const floor=new THREE.GridHelper(10,40,0x32465f,0x172232); scene.add(floor);
const axes=new THREE.AxesHelper(2); axes.visible=false; scene.add(axes);
const rig=new THREE.Group(); rig.scale.setScalar(.0175); rig.rotation.y=Math.PI; scene.add(rig);
const debug=new THREE.Group(); scene.add(debug);
const nodes=new Map(),markers=new Map(),labels=new Map(),setupById=new Map(),meshes=[];
let boneLines,selectedId=null;

const target=new THREE.Vector3(0,1.35,0);
let radius=5.7,theta=0,phi=1.48;
function placeCamera(){
  camera.position.set(target.x+radius*Math.sin(phi)*Math.sin(theta),target.y+radius*Math.cos(phi),target.z+radius*Math.sin(phi)*Math.cos(theta));
  camera.lookAt(target);
}
function setView(nextTheta,nextPhi=1.48,nextRadius=5.7){theta=nextTheta;phi=nextPhi;radius=nextRadius;placeCamera();}
placeCamera();
document.querySelector("#front").onclick=()=>setView(0);
document.querySelector("#side").onclick=()=>setView(Math.PI/2);
document.querySelector("#reset").onclick=()=>setView(0,1.48,5.7);

let dragging=false,moved=false,lastX=0,lastY=0;
renderer.domElement.addEventListener("pointerdown",event=>{dragging=true;moved=false;lastX=event.clientX;lastY=event.clientY;renderer.domElement.setPointerCapture(event.pointerId);});
renderer.domElement.addEventListener("pointermove",event=>{
  if(!dragging)return;
  const dx=event.clientX-lastX,dy=event.clientY-lastY; if(Math.abs(dx)+Math.abs(dy)>2)moved=true;
  theta-=dx*.008; phi=THREE.MathUtils.clamp(phi-dy*.008,.15,Math.PI-.15); lastX=event.clientX;lastY=event.clientY;placeCamera();
});
renderer.domElement.addEventListener("pointerup",()=>dragging=false);
renderer.domElement.addEventListener("wheel",event=>{radius=THREE.MathUtils.clamp(radius*Math.exp(event.deltaY*.001),2.5,12);placeCamera();event.preventDefault();},{passive:false});

async function loadRig(){
  const [model,animations,texture]=await Promise.all([
    fetch(`${ASSET_ROOT}model.json`).then(response=>response.json()),
    fetch(`${ASSET_ROOT}animations.json`).then(response=>response.json()),
    new THREE.TextureLoader().loadAsync(`${ASSET_ROOT}texture.png`)
  ]);
  texture.colorSpace=THREE.SRGBColorSpace; texture.magFilter=THREE.NearestFilter; texture.minFilter=THREE.NearestFilter;
  const material=new THREE.MeshPhongMaterial({map:texture,side:THREE.DoubleSide,transparent:true,alphaTest:.05,shininess:25});

  for(const setup of animations.setup.objects){
    setupById.set(setup.id,setup); if(setup.id===1001)continue;
    const frame=setup.frames[0]||{},t=frame.translation||[0,0,0],r=frame.rotation||[0,0,0],s=frame.scale||[1,1,1];
    const node=new THREE.Group(); node.name=`joint-${setup.id}`;
    node.position.set(t[0]/4,-t[1]/4,-t[2]/4); node.rotation.set(r[0],-r[1],-r[2],"XYZ"); node.scale.set(...s); nodes.set(setup.id,node);
  }
  for(const setup of animations.setup.objects){if(nodes.has(setup.id))(nodes.get(setup.parentId)||rig).add(nodes.get(setup.id));}
  for(const part of model.objects.slice(0,16)){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(part.positions,3)); geometry.setAttribute("uv",new THREE.Float32BufferAttribute(part.uvs,2)); geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material); mesh.userData.jointId=part.id; nodes.get(part.id).add(mesh); meshes.push(mesh);
  }
  rig.updateMatrixWorld(true);

  const linePositions=[];
  for(const [id] of nodes){
    const marker=new THREE.Mesh(new THREE.SphereGeometry(.035,12,8),new THREE.MeshBasicMaterial({color:id===1?0xf02a42:0x38a2ff,depthTest:false}));
    marker.renderOrder=4;marker.userData.jointId=id;debug.add(marker);markers.set(id,marker);
    const label=document.createElement("span");label.className="joint-label";label.textContent=id;document.querySelector("#labels").append(label);labels.set(id,label);
    if(nodes.has(setupById.get(id).parentId))linePositions.push(0,0,0,0,0,0);
  }
  const lineGeometry=new THREE.BufferGeometry();lineGeometry.setAttribute("position",new THREE.Float32BufferAttribute(linePositions,3));
  boneLines=new THREE.LineSegments(lineGeometry,new THREE.LineBasicMaterial({color:0xffd86a,depthTest:false,transparent:true,opacity:.9}));boneLines.renderOrder=3;debug.add(boneLines);
  updateDebugGeometry(); document.querySelector("#status").textContent="BIND RIG LOADED · ANIMATION OFF";
}

function updateDebugGeometry(){
  if(!boneLines)return;
  rig.updateMatrixWorld(true);
  const position=boneLines.geometry.attributes.position,a=new THREE.Vector3(),b=new THREE.Vector3();let offset=0;
  for(const [id,node] of nodes){
    node.getWorldPosition(a);markers.get(id).position.copy(a);
    const parent=nodes.get(setupById.get(id).parentId);
    if(parent){parent.getWorldPosition(b);position.setXYZ(offset++,a.x,a.y,a.z);position.setXYZ(offset++,b.x,b.y,b.z);}
  }
  position.needsUpdate=true;
}

document.querySelector("#show-mesh").onchange=event=>meshes.forEach(mesh=>mesh.visible=event.target.checked);
document.querySelector("#show-bones").onchange=event=>boneLines.visible=event.target.checked;
document.querySelector("#show-joints").onchange=event=>{for(const marker of markers.values())marker.visible=event.target.checked;document.querySelector("#labels").hidden=!event.target.checked;};
document.querySelector("#show-axes").onchange=event=>axes.visible=event.target.checked;

const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
renderer.domElement.addEventListener("click",event=>{
  if(moved)return;
  pointer.set(event.clientX/innerWidth*2-1,-event.clientY/innerHeight*2+1);raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObjects([...markers.values()])[0];if(!hit)return;
  selectedId=hit.object.userData.jointId;for(const [id,label] of labels)label.classList.toggle("selected",id===selectedId);
  const setup=setupById.get(selectedId),frame=setup.frames[0],t=frame.translation||[0,0,0],r=frame.rotation||[0,0,0];
  document.querySelector("#joint-name").textContent=`JOINT ${selectedId}`;
  document.querySelector("#joint-data").textContent=`parent  ${setup.parentId}\nT raw   ${t.join(", ")}\nT web   ${[t[0]/4,-t[1]/4,-t[2]/4].map(value=>value.toFixed(2)).join(", ")}\nR rad   ${r.map(value=>value.toFixed(4)).join(", ")}`;
  document.querySelector("#inspector").hidden=false;
});

function render(){
  requestAnimationFrame(render);const projected=new THREE.Vector3();
  for(const [id,marker] of markers){
    marker.getWorldPosition(projected);projected.project(camera);const label=labels.get(id),visible=projected.z>-1&&projected.z<1;
    label.style.display=visible?"grid":"none";label.style.left=`${(projected.x*.5+.5)*innerWidth}px`;label.style.top=`${(-projected.y*.5+.5)*innerHeight}px`;
  }
  renderer.render(scene,camera);
}
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
loadRig().catch(error=>{console.error(error);document.querySelector("#status").textContent="RIG LOAD FAILED";});render();
