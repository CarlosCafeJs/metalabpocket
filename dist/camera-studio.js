import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const $ = (id) => document.getElementById(id);
const stageCanvas = $('stage');
const previewCanvas = $('preview');
const state = { angle: 0, height: 1.5, distance: 3.8, product: 'Caneca de cerâmica' };
const presets = {
  front: { angle: 0, height: 1.5, distance: 3.8 },
  threequarter: { angle: 42, height: 1.75, distance: 4.1 },
  side: { angle: 90, height: 1.5, distance: 4.2 },
  back: { angle: 180, height: 1.5, distance: 4.1 },
  top: { angle: 35, height: 2.9, distance: 3.9 }
};

let stageRenderer, previewRenderer, scene, productGroup, defaultMug, importedModel, phone, ring, stageCamera, phoneCamera;
let renderPending = false;
const captures = [];

function makeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#c17b4e'); grad.addColorStop(.4, '#b97246'); grad.addColorStop(1, '#9a5c3e');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 1024, 512);
  let seed = 29;
  function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  for (let i = 0; i < 8500; i++) {
    const x = random() * 1024, y = random() * 512;
    const r = .2 + random() * 2.3;
    ctx.fillStyle = random() > .55 ? `rgba(255,236,202,${.04 + random() * .15})` : `rgba(69,35,28,${.025 + random() * .11})`;
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.5, r, 0, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 42; i++) {
    const y = random() * 512;
    ctx.strokeStyle = `rgba(255,224,181,${.02 + random() * .06})`;
    ctx.lineWidth = .5 + random() * 2;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(300, y + 4, 700, y - 4, 1024, y + 2); ctx.stroke();
  }
  // A painted band and asymmetrical leaf make the rotation easy to read.
  ctx.fillStyle = '#243b53'; ctx.fillRect(0, 75, 1024, 18); ctx.fillRect(0, 385, 1024, 11);
  ctx.save(); ctx.translate(520, 245);
  ctx.fillStyle = '#f8ead0'; ctx.beginPath(); ctx.ellipse(0, 0, 155, 106, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#233e55'; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = '#243b53'; ctx.textAlign = 'center';
  ctx.font = '700 31px Georgia,serif'; ctx.fillText('ATELIÊ', 0, -13);
  ctx.font = '700 42px Georgia,serif'; ctx.fillText('AURORA', 0, 38);
  ctx.restore();
  for (const [x,y,a] of [[245,225,-.3],[785,270,.55]]) {
    ctx.save(); ctx.translate(x,y); ctx.rotate(a); ctx.fillStyle='#324d52';
    ctx.beginPath(); ctx.ellipse(-20,-13,48,18,-.45,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(24,18,44,17,.48,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#30464d';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-50,-45);ctx.lineTo(50,48);ctx.stroke();ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function makeFrontMark() {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=360;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#f4e3bd';ctx.beginPath();ctx.roundRect(24,24,464,312,62);ctx.fill();
  ctx.strokeStyle='#264557';ctx.lineWidth=12;ctx.stroke();
  ctx.fillStyle='#254254';ctx.textAlign='center';
  ctx.font='bold 48px Georgia,serif';ctx.fillText('ATELIÊ',256,151);
  ctx.font='bold 66px Georgia,serif';ctx.fillText('AURORA',256,232);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

function makeMug() {
  const mug = new THREE.Group();
  const ceramic = new THREE.MeshPhysicalMaterial({ map: makeTexture(), color: 0xffffff, roughness: .39, metalness: 0, clearcoat: .26, clearcoatRoughness: .42, side: THREE.DoubleSide });
  const rimMat = new THREE.MeshPhysicalMaterial({ color: '#5a7280', roughness: .32, metalness: .12, clearcoat: .35 });
  const innerMat = new THREE.MeshStandardMaterial({ color: '#e3b58a', roughness: .61, side: THREE.DoubleSide });
  const points = [
    [0,.1],[.63,.1],[.75,.12],[.84,.2],[.94,1.43],[.96,1.55],
    [.83,1.57],[.79,1.46],[.7,.26],[.57,.19],[0,.19]
  ].map(([x,y]) => new THREE.Vector2(x,y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(points, 96), ceramic);
  body.castShadow = true; body.receiveShadow = true; mug.add(body);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(.75,.62,1.2,96,1,true), innerMat);
  inner.position.y=.86; inner.castShadow=false; mug.add(inner);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(.62,96), innerMat);
  bottom.rotation.x=-Math.PI/2; bottom.position.y=.24; mug.add(bottom);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.875,.052,12,96), rimMat);
  rim.rotation.x=Math.PI/2; rim.position.y=1.55; mug.add(rim);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.54,.135,20,64), ceramic);
  handle.position.set(1.17,.87,0); handle.rotation.y=.12; handle.castShadow=true; mug.add(handle);
  const mark=new THREE.Mesh(new THREE.CylinderGeometry(.934,.875,.66,40,1,true,-.52,1.04),new THREE.MeshBasicMaterial({map:makeFrontMark(),transparent:true,side:THREE.DoubleSide,depthWrite:false}));
  mark.position.y=.82;mark.renderOrder=2;mug.add(mark);
  // A little ridge gives a side-lit highlight without relying on an image file.
  const foot = new THREE.Mesh(new THREE.TorusGeometry(.74,.045,10,90), rimMat);
  foot.rotation.x=Math.PI/2; foot.position.y=.12; mug.add(foot);
  return mug;
}

function makePhone() {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(.6,1.12,.075), new THREE.MeshStandardMaterial({color:'#1c304c',metalness:.3,roughness:.25}));
  shell.castShadow=true; group.add(shell);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(.55,1.02,.009), new THREE.MeshBasicMaterial({color:'#8bb1ae'}));
  screen.position.z=-.044; group.add(screen);
  const screenGlow = new THREE.Mesh(new THREE.PlaneGeometry(.45,.72), new THREE.MeshBasicMaterial({color:'#d6e9e5'}));
  screenGlow.position.set(0,.02,-.051); screenGlow.rotation.y=Math.PI; group.add(screenGlow);
  const lensBlock = new THREE.Mesh(new THREE.BoxGeometry(.24,.27,.018), new THREE.MeshStandardMaterial({color:'#0b1830',metalness:.4,roughness:.24}));
  lensBlock.position.set(-.13,.36,.046); group.add(lensBlock);
  for(const offset of [-.055,.055]){
    const lens=new THREE.Mesh(new THREE.CylinderGeometry(.043,.043,.015,20),new THREE.MeshStandardMaterial({color:'#07111e',metalness:.45,roughness:.1}));
    lens.rotation.x=Math.PI/2; lens.position.set(-.13,.36+offset,.061);group.add(lens);
  }
  group.scale.setScalar(.85);
  return group;
}

function addLights() {
  scene.add(new THREE.HemisphereLight('#eaf6ff','#7d6352',2.2));
  const key = new THREE.DirectionalLight('#fff1d8',3.1);
  key.position.set(-3,7,5); key.castShadow=true; key.shadow.mapSize.set(2048,2048);
  key.shadow.camera.left=-7;key.shadow.camera.right=7;key.shadow.camera.top=7;key.shadow.camera.bottom=-7;
  key.shadow.bias=-.0003; scene.add(key);
  const fill=new THREE.DirectionalLight('#d6e6ff',1.2);fill.position.set(4,3,-3);scene.add(fill);
}

function makeScene() {
  scene = new THREE.Scene(); scene.background = new THREE.Color('#d8d8d0');
  scene.fog=new THREE.Fog('#d8d8d0',12,26);
  addLights();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:'#d8d1c4',roughness:1}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.06;floor.receiveShadow=true;scene.add(floor);
  const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.3,.13,80),new THREE.MeshStandardMaterial({color:'#e7dfd1',roughness:.85}));
  pedestal.position.y=.03;pedestal.receiveShadow=true;scene.add(pedestal);
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(13,7),new THREE.MeshStandardMaterial({color:'#dbe3df',roughness:1}));
  wall.position.set(0,3,-5.5);wall.receiveShadow=true;scene.add(wall);
  productGroup=new THREE.Group();productGroup.position.y=.12;scene.add(productGroup);
  defaultMug=makeMug(); productGroup.add(defaultMug);
  const ringMat=new THREE.MeshBasicMaterial({color:'#ad7b27',transparent:true,opacity:.55,depthWrite:false});
  ring=new THREE.Mesh(new THREE.RingGeometry(3.75,3.78,128),ringMat);
  ring.rotation.x=-Math.PI/2;ring.position.y=.025;scene.add(ring);
  phone=makePhone();scene.add(phone);
  const standLight=new THREE.Mesh(new THREE.PlaneGeometry(1.6,2.6),new THREE.MeshBasicMaterial({color:'#fff1ce',side:THREE.DoubleSide}));
  standLight.position.set(-4,2.6,-.1);standLight.rotation.y=Math.PI/2.8;scene.add(standLight);
}

function setupRenderers() {
  stageRenderer=new THREE.WebGLRenderer({canvas:stageCanvas,antialias:true,powerPreference:'high-performance'});
  previewRenderer=new THREE.WebGLRenderer({canvas:previewCanvas,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  for(const renderer of [stageRenderer,previewRenderer]){
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.25;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  }
  stageCamera=new THREE.PerspectiveCamera(39,1,.1,100);
  stageCamera.position.set(6.3,4.9,8.6);stageCamera.lookAt(0,.85,0);
  phoneCamera=new THREE.PerspectiveCamera(49,1,.1,50);
}

function resizeRenderer(renderer,canvas,camera){
  const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
  if(renderer.domElement.width!==Math.round(w*renderer.getPixelRatio())||renderer.domElement.height!==Math.round(h*renderer.getPixelRatio())) renderer.setSize(w,h,false);
  camera.aspect=w/h;camera.updateProjectionMatrix();
}

function scheduleRender(){if(!renderPending){renderPending=true;requestAnimationFrame(render)}}
function render(){
  renderPending=false;
  resizeRenderer(stageRenderer,stageCanvas,stageCamera);
  resizeRenderer(previewRenderer,previewCanvas,phoneCamera);
  const angle=THREE.MathUtils.degToRad(state.angle);
  const x=Math.sin(angle)*state.distance,z=Math.cos(angle)*state.distance;
  const target=new THREE.Vector3(0,.94,0);
  phone.position.set(x,state.height,z);
  phone.lookAt(target);
  phoneCamera.position.copy(phone.position);phoneCamera.lookAt(target);
  ring.scale.setScalar(state.distance/3.77);
  phone.visible=true;stageRenderer.render(scene,stageCamera);
  phone.visible=false;previewRenderer.render(scene,phoneCamera);phone.visible=true;
}

function updateFeedback(){
  let title,text;
  const a=Math.abs(state.angle);
  if(state.height>2.5){title='Vista de cima';text='Boa para mostrar a abertura e o interior. Acrescente outra foto lateral para explicar a altura da peça.'}
  else if(state.distance<3.1){title='Muito perto';text='Um detalhe pode ficar interessante, mas a peça pode sair do quadro. Afaste um pouco para a foto principal.'}
  else if(state.distance>5.1){title='Mais longe';text='Há espaço em volta do produto. Aproxime se a peça ficou pequena e o detalhe perdeu força.'}
  else if(a<20){title='Vista frontal';text='Boa para ler a estampa. A alça pode ficar menos clara; uma foto em 3/4 completa a apresentação.'}
  else if(a<70){title='Ângulo em 3/4';text='Aqui se percebem a frente, o volume e parte da alça. É um bom candidato para a foto principal.'}
  else if(a<120){title='Vista lateral';text='Ajuda a entender a profundidade e a alça. Use junto com uma vista frontal para mostrar a estampa.'}
  else {title='Verso da peça';text='Mostra acabamento e partes que a foto principal esconde. É útil como imagem complementar.'}
  $('angleFeedback').innerHTML=`<b>${title}</b><br>${text}`;
}

function syncControls(){
  $('angle').value=state.angle;$('height').value=Math.round(state.height*10);$('distance').value=Math.round(state.distance*10);
  $('angleValue').textContent=`${Math.round(state.angle)}°`;
  $('heightValue').textContent=`${Math.round(state.height*10)} cm`;
  $('distanceValue').textContent=state.distance<3.3?'Perto':state.distance>4.7?'Longe':'Média';
  const matched=Object.entries(presets).find(([,p])=>Math.abs(p.angle-state.angle)<2&&Math.abs(p.height-state.height)<.15&&Math.abs(p.distance-state.distance)<.15)?.[0];
  document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b.dataset.preset===matched));
  updateFeedback();scheduleRender();
}

function bindControls(){
  document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{Object.assign(state,presets[button.dataset.preset]);syncControls()}));
  $('angle').addEventListener('input',e=>{state.angle=Number(e.target.value);syncControls()});
  $('height').addEventListener('input',e=>{state.height=Number(e.target.value)/10;syncControls()});
  $('distance').addEventListener('input',e=>{state.distance=Number(e.target.value)/10;syncControls()});
  let lastX=0,lastY=0,dragging=false;
  stageCanvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragging=true;lastX=e.clientX;lastY=e.clientY;stageCanvas.setPointerCapture(e.pointerId)});
  stageCanvas.addEventListener('pointermove',e=>{if(!dragging)return;if(e.buttons!==1){dragging=false;return}const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;state.angle=Math.max(-180,Math.min(180,state.angle+dx*.55));state.height=Math.max(.7,Math.min(2.9,state.height-dy*.012));syncControls()});
  stageCanvas.addEventListener('pointerup',()=>dragging=false);
  stageCanvas.addEventListener('pointercancel',()=>dragging=false);
  window.addEventListener('pointerup',()=>dragging=false);
  window.addEventListener('blur',()=>dragging=false);
  stageCanvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')state.angle=Math.max(-180,state.angle-5);if(e.key==='ArrowRight')state.angle=Math.min(180,state.angle+5);if(e.key==='ArrowUp')state.height=Math.min(2.9,state.height+.1);if(e.key==='ArrowDown')state.height=Math.max(.7,state.height-.1);syncControls()});
  window.addEventListener('resize',scheduleRender);
  $('capture').addEventListener('click',capture);
  $('modelFile').addEventListener('change',importGlb);
  $('resetModel').addEventListener('click',resetModel);
}

function capture(){
  render();
  captures.unshift({src:previewCanvas.toDataURL('image/png'),angle:Math.round(state.angle),height:Math.round(state.height*10)});
  if(captures.length>4)captures.pop();
  const holder=$('captures');holder.replaceChildren();
  captures.forEach((item,i)=>{const img=document.createElement('img');img.src=item.src;img.alt=`Captura de treino ${captures.length-i}: giro ${item.angle} graus, altura ${item.height} centímetros`;img.title=img.alt;holder.append(img)});
  $('captureCount').textContent=`${captures.length}/4`;
}

function clearImported(){
  if(importedModel){productGroup.remove(importedModel);importedModel.traverse(obj=>{if(obj.isMesh){obj.geometry?.dispose();const mats=Array.isArray(obj.material)?obj.material:[obj.material];mats.forEach(mat=>mat?.dispose())}});importedModel=null}
}
function resetModel(){clearImported();defaultMug.visible=true;state.product='Caneca de cerâmica';$('modelFile').value='';$('modelStatus').textContent='Modelo padrão carregado · nenhum arquivo enviado.';scheduleRender()}
async function importGlb(event){
  const file=event.target.files?.[0];if(!file)return;
  if(!file.name.toLowerCase().endsWith('.glb')){$('modelStatus').textContent='Escolha um arquivo .glb com texturas incorporadas.';return}
  if(file.size>25*1024*1024){$('modelStatus').textContent='Arquivo grande demais para a aula (limite: 25 MB).';return}
  $('modelStatus').textContent='Abrindo modelo local…';
  try{
    const buffer=await file.arrayBuffer();
    const model=await new Promise((resolve,reject)=>new GLTFLoader().parse(buffer,'',gltf=>resolve(gltf.scene),reject));
    const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());
    if(!Number.isFinite(size.length())||size.length()<.001)throw new Error('Modelo vazio');
    clearImported();
    const scale=2.2/Math.max(size.x,size.y,size.z);
    model.scale.setScalar(scale);
    model.position.set(-(box.min.x+box.max.x)/2*scale,-box.min.y*scale,-(box.min.z+box.max.z)/2*scale);
    model.traverse(obj=>{if(obj.isMesh){obj.castShadow=true;obj.receiveShadow=true}});
    importedModel=model;productGroup.add(model);defaultMug.visible=false;
    state.product=file.name;$('modelStatus').textContent=`${file.name} · aberto somente nesta aba.`;scheduleRender();
  }catch(error){$('modelStatus').textContent='Não foi possível abrir o .glb. Verifique se as texturas estão incorporadas.';console.warn('Falha ao abrir modelo local:',error)}
}

try{
  makeScene();setupRenderers();bindControls();syncControls();
}catch(error){
  console.error(error);
  $('stageError').hidden=false;
  $('stageError').textContent='Este navegador não conseguiu iniciar a cena 3D. Tente abrir a página em um navegador com WebGL 2 ativo.';
}
