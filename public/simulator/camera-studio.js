import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

if (window.top === window.self || new URL(window.top.location.href).pathname !== '/camera') {
  window.top.location.replace('/celular');
  throw new Error('A Câmera só abre dentro do sistema MetaLab Pocket.');
}

const $ = (id) => document.getElementById(id);
const stageCanvas = $('stage');
const previewCanvas = $('preview');
const state = { angle: 0, height: 1.5, distance: 3.8, product: 'Caneca de cerâmica', productId: 'mug' };
const lighting = { key: .65, fill: .9, rim: .25, ambient: 1.3, intensityPercent: 65, spotIntensity: 422.5, spotEnabled: true, spotX: -3.3, spotHeight: 4.8, beam: 45, direction: 'left', temperature: 'neutral', shadows: .3, exposure: 1.12, preset: 'natural' };
const lowPower = window.innerWidth < 700 || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4);
const maxPixelRatio = lowPower ? 1.25 : 1.75;
const presets = {
  front: { angle: 0, height: 1.5, distance: 3.8 },
  threequarter: { angle: 42, height: 1.75, distance: 4.1 },
  side: { angle: 90, height: 1.5, distance: 4.2 },
  back: { angle: 180, height: 1.5, distance: 4.1 },
  top: { angle: 35, height: 2.9, distance: 3.9 }
};

let stageRenderer, previewRenderer, scene, productGroup, phone, phoneScreenTexture, ring, stageCamera, phoneCamera, lightSources, roomWalls;
let renderPending = false;
let maxTextureAnisotropy = 1;
const captures = [];
let lastSavedPhoto;
let totalCaptureCount = 0;
const MAX_CAPTURES = 10;
let requestedProduct = 'mug';
let logoTexturePromise;
const productModels = new Map();
const productLoads = new Map();
const productInfo = {
  mug: { name: 'Caneca de cerâmica', file: 'assets/caneca.glb', loading: 'Carregando a caneca 3D…', ready: 'Caneca 3D selecionada · observe a forma, a alça e o acabamento.', hint: 'Use “3/4” para mostrar a alça, o formato e a marca discreta. Inclua uma foto de cima para mostrar o interior.', lesson: 'Depois da foto principal, registre o lado, o verso e um detalhe. Mostre também a alça, a borda e o interior.' },
  shoe: { name: 'Tênis de treino', file: 'assets/shoes_test.glb', loading: 'Carregando o tênis 3D com suas texturas…', ready: 'Tênis 3D selecionado · couro, costura e solado visíveis.', hint: 'Use “3/4” para revelar o formato, depois fotografe a lateral, os cadarços e o solado. Procure uma luz que mostre a textura.', lesson: 'Depois da foto principal, registre perfil lateral, traseira, solado e um detalhe dos cadarços ou da costura.' },
  shirt: { name: 'Camisas dobradas', file: 'assets/camisas-dobradas.glb', loading: 'Carregando as camisas 3D e suas texturas…', ready: 'Camisas dobradas selecionadas · observe tecido, cores e dobras.', hint: 'Comece com a vista de cima para mostrar a composição simétrica das cores. Faça outra foto lateral para revelar a altura da pilha e as dobras.', lesson: 'Fotografe de cima, em 3/4 e de lado. Mostre a textura do tecido, a organização das peças e o acabamento sem esconder as camisas de baixo.' }
};

function getLogoTexture(){
  if(!logoTexturePromise)logoTexturePromise=new THREE.TextureLoader().loadAsync('assets/metalab-logo.png').then(texture=>{texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=maxTextureAnisotropy;return texture});
  return logoTexturePromise;
}

async function loadProduct(id){
  if(productModels.has(id))return productModels.get(id);
  if(!productLoads.has(id))productLoads.set(id,(async()=>{
    const gltf=await new GLTFLoader().loadAsync(productInfo[id].file);
    const model=gltf.scene;
    if(id==='mug')model.rotation.y=Math.PI/2;
    model.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    if(!Number.isFinite(size.length())||size.length()<.001)throw new Error('Modelo 3D vazio');
    const scale=id==='mug'?1.55/size.y:id==='shirt'?2.4/Math.max(size.x,size.z):2.65/Math.max(size.x,size.y,size.z);
    model.scale.setScalar(scale);
    model.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);
    model.traverse(obj=>{if(obj.isMesh){obj.castShadow=true;obj.receiveShadow=true;for(const material of (Array.isArray(obj.material)?obj.material:[obj.material]))if(material)for(const value of Object.values(material))if(value?.isTexture){value.anisotropy=maxTextureAnisotropy;value.needsUpdate=true}}});
    const item=new THREE.Group();item.add(model);
    if(id==='mug'){
      try{
        const logo=await getLogoTexture();
        const material=new THREE.MeshBasicMaterial({map:logo,transparent:true,alphaTest:.08,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
        const radius=size.z*scale*.51;
        const mark=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,.53,48,1,true,-.56,1.12),material);
        mark.position.set(-center.x*scale,.82,-center.z*scale);mark.renderOrder=2;item.add(mark);
      }catch(error){console.warn('Logo MetaLab indisponível para a peça.',error)}
    }
    item.visible=false;productGroup.add(item);productModels.set(id,item);return item;
  })());
  try{return await productLoads.get(id)}catch(error){productLoads.delete(id);throw error}
}

async function loadPhoneModel(){
  try{
    const gltf=await new GLTFLoader().loadAsync('assets/celular.glb');
    const model=gltf.scene,box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    if(size.y<=0)throw new Error('Modelo do celular sem altura');
    model.position.sub(center);
    const holder=new THREE.Group();holder.add(model);holder.scale.setScalar(1.1/size.y);
    // Object3D.lookAt aims +Z at the product. Turn the supplied phone so its
    // rear cameras (-Z in the model) face the product and its screen faces us.
    holder.rotation.y=Math.PI;
    const screen=new THREE.Mesh(
      new THREE.PlaneGeometry(size.x*.75,size.y*.84),
      new THREE.MeshBasicMaterial({map:phoneScreenTexture,side:THREE.FrontSide,toneMapped:false})
    );
    const screenAspect=(size.x*.75)/(size.y*.84);
    const viewAspect=previewCanvas.clientWidth/previewCanvas.clientHeight||.75;
    const viewWidth=Math.min(1,screenAspect/viewAspect);
    phoneScreenTexture.repeat.set(viewWidth,1);
    phoneScreenTexture.offset.set((1-viewWidth)/2,0);
    screen.position.set(0,-size.y*.005,size.z*.5+.0008);
    screen.renderOrder=1;
    holder.add(screen);
    phone.clear();phone.add(holder);scheduleRender();
  }catch(error){$('stageError').hidden=false;$('stageError').textContent='O modelo 3D do celular não carregou. Reabra o estúdio e tente novamente.';console.warn('Modelo do celular não carregou no estúdio.',error)}
}

async function selectProduct(id){
  if(!productInfo[id])return;
  requestedProduct=id;
  $('capture').disabled=true;
  $('productStatus').textContent=productInfo[id].loading;
  try{await loadProduct(id)}catch(error){
    if(requestedProduct===id){$('productStatus').textContent=`Não foi possível abrir ${productInfo[id].name.toLowerCase()}. Escolha outra peça.`;$('capture').disabled=!productModels.has(state.productId)}
    console.warn('Produto 3D indisponível.',error);return;
  }
  if(requestedProduct!==id)return;
  state.productId=id;state.product=productInfo[id].name;
  for(const [key,model] of productModels)model.visible=key===id;
  document.querySelectorAll('[data-product]').forEach(button=>{const selected=button.dataset.product===id;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))});
  $('productStatus').textContent=productInfo[id].ready;
  $('productHelper').innerHTML=`<b>Dica para começar:</b> ${productInfo[id].hint}`;
  $('angleLesson').textContent=productInfo[id].lesson;
  $('capture').disabled=totalCaptureCount>=MAX_CAPTURES;
  updateFeedback();scheduleRender();
}

function addLights() {
  const ambient=new THREE.HemisphereLight('#eaf6ff','#7d6352',1.35);scene.add(ambient);
  const key=new THREE.DirectionalLight('#fff1d8',.8);
  key.position.set(-3,5,4);scene.add(key);
  const fill=new THREE.DirectionalLight('#d6e6ff',.8);fill.position.set(4,3,-3);scene.add(fill);
  const rim=new THREE.DirectionalLight('#e6efff',.45);rim.position.set(0,4,-5);scene.add(rim);
  const spot=new THREE.SpotLight('#fff1d8',260,18,THREE.MathUtils.degToRad(36),.42,2);
  spot.position.set(-3,4,3);spot.target.position.set(0,.8,0);spot.castShadow=true;
  spot.shadow.mapSize.set(lowPower?512:1024,lowPower?512:1024);
  spot.shadow.camera.near=.5;spot.shadow.camera.far=18;spot.shadow.bias=-.00025;spot.shadow.normalBias=.025;spot.shadow.radius=4;
  scene.add(spot,spot.target);
  for(const light of [ambient,key,fill,rim,spot])light.layers.enable(2);
  const helper=new THREE.SpotLightHelper(spot,'#f0b43c');
  // SpotLightHelper draws its yellow cone through a child LineSegments object.
  // Layers are per-object in Three.js, so moving only the parent leaves the
  // line child on layer 0, which the photographic camera also renders.
  helper.traverse(object=>object.layers.set(1));
  scene.add(helper);
  const fixture=new THREE.Group();fixture.name='Fixture de estúdio (visível apenas no cenário de treino)';fixture.layers.set(1);
  const metal=new THREE.MeshStandardMaterial({color:'#263b53',metalness:.72,roughness:.32});
  const rimMaterial=new THREE.MeshStandardMaterial({color:'#d6a43a',metalness:.65,roughness:.28});
  const emitter=new THREE.MeshStandardMaterial({color:'#fff1c8',emissive:'#ffd27b',emissiveIntensity:2.2,roughness:.25});
  const shade=new THREE.Mesh(new THREE.CylinderGeometry(.48,.22,.52,28,1,true),metal);shade.rotation.x=Math.PI/2;shade.position.z=.25;fixture.add(shade);
  const bezel=new THREE.Mesh(new THREE.TorusGeometry(.37,.035,8,32),rimMaterial);bezel.position.z=.52;fixture.add(bezel);
  const lens=new THREE.Mesh(new THREE.CircleGeometry(.31,32),emitter);lens.position.z=.515;fixture.add(lens);
  const yoke=new THREE.Mesh(new THREE.TorusGeometry(.54,.035,8,32,Math.PI),rimMaterial);yoke.position.z=.2;fixture.add(yoke);
  const stand=new THREE.Group();stand.layers.set(1);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.035,.055,1,10),metal);pole.position.y=.5;stand.add(pole);
  const foot=new THREE.Mesh(new THREE.CylinderGeometry(.36,.4,.07,16),metal);foot.position.y=.035;stand.add(foot);
  const mount=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.5),rimMaterial);mount.position.y=1;stand.add(mount);
  scene.add(fixture,stand);
  for(const visual of [fixture,stand])visual.traverse(object=>object.layers.set(1));
  lightSources={ambient,key,fill,rim,spot,helper,fixture,stand,emitter};
}

const lightingPresets={
  natural:{key:.65,fill:.9,rim:.25,ambient:1.3,intensityPercent:65,spotEnabled:true,spotX:-3.3,spotHeight:4.8,beam:45,direction:'left',temperature:'neutral',shadows:.3,exposure:1.12,tip:'A luz natural simulada vem de lado e mantém sombras leves para revelar a textura.'},
  professional:{key:.8,fill:.8,rim:.45,ambient:1.35,intensityPercent:70,spotEnabled:true,spotX:0,spotHeight:4.2,beam:36,direction:'front',temperature:'neutral',shadows:.5,exposure:1.2,tip:'O estúdio equilibra a luz principal e o preenchimento para mostrar forma e acabamento.'},
  warm:{key:.7,fill:.75,rim:.35,ambient:1.2,intensityPercent:65,spotEnabled:true,spotX:-3.2,spotHeight:4,beam:40,direction:'left',temperature:'warm',shadows:.4,exposure:1.15,tip:'A luz quente dá um tom acolhedor. Confira se as cores do produto continuam fiéis.'},
  dramatic:{key:.25,fill:.28,rim:.6,ambient:.55,intensityPercent:82,spotEnabled:true,spotX:-3.5,spotHeight:4.4,beam:27,direction:'left',temperature:'neutral',shadows:.9,exposure:1.12,tip:'A luz lateral mais concentrada destaca relevo e cria sombras mais profundas.'}
};

function applyLighting(){
  if(!lightSources)return;
  const {ambient,key,fill,rim,spot,fixture,stand}=lightSources;
  const positions={left:[-3.3,4.8,2.8],right:[3.3,4.8,2.8],front:[0,4.2,3.6]};
  const colors={warm:['#ffd0a1','#fff0dc','#ffe1bd'],neutral:['#fff1d8','#eaf6ff','#d6e6ff']};
  const temperature=colors[lighting.temperature]||colors.neutral;
  ambient.intensity=lighting.ambient;ambient.color.set(temperature[1]);
  key.intensity=lighting.key;key.color.set(temperature[0]);key.position.set(-3,5,4);
  fill.intensity=lighting.fill;fill.color.set(temperature[2]);fill.position.set(-positions[lighting.direction][0]*.8,3,-positions[lighting.direction][2]*.7);
  rim.intensity=lighting.rim;rim.color.set(temperature[1]);rim.position.set(0,4,-5);
  const position=positions[lighting.direction]||positions.front;
  lighting.spotX=position[0];lighting.spotHeight=position[1];
  spot.color.set(temperature[0]);spot.intensity=lighting.spotEnabled?lighting.intensityPercent*6.5:0;lighting.spotIntensity=lighting.intensityPercent*6.5;lightSources.emitter.emissiveIntensity=lighting.spotEnabled?2.2*lighting.intensityPercent/100:.04;spot.angle=THREE.MathUtils.degToRad(lighting.beam);spot.penumbra=.42;spot.position.set(...position);spot.updateMatrixWorld();
  spot.target.position.set(0,.85,0);spot.target.updateMatrixWorld();
  spot.shadow.intensity=lighting.shadows;spot.castShadow=lighting.spotEnabled&&lighting.shadows>0;spot.shadow.camera.fov=Math.min(170,lighting.beam*2);spot.shadow.camera.updateProjectionMatrix();
  fixture.position.copy(spot.position);const aim=spot.target.position.clone();fixture.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),aim.sub(spot.position).normalize());
  stand.position.set(spot.position.x,0,spot.position.z);const pole=stand.children[0];pole.scale.y=Math.max(.3,spot.position.y-1);pole.position.y=pole.scale.y/2;stand.children[2].position.y=Math.max(.3,spot.position.y-.15);
  lightSources.helper.visible=lighting.spotEnabled&&lighting.intensityPercent>0;lightSources.helper.update();
  for(const renderer of [stageRenderer,previewRenderer])if(renderer){renderer.toneMappingExposure=lighting.exposure;if(renderer.shadowMap)renderer.shadowMap.needsUpdate=true}
  $('spotLightValue').textContent=`${Math.round(lighting.intensityPercent)}%`;
  $('spotLightEnabled').checked=lighting.spotEnabled;
  $('lightingTip').textContent=lighting.tip||lightingPresets.professional.tip;
  document.querySelectorAll('[data-light-preset]').forEach(button=>{const selected=button.dataset.lightPreset===lighting.preset;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected))});
  document.querySelectorAll('[data-light-direction]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.lightDirection===lighting.direction)));
  scheduleRender();
}

function selectLightingPreset(name){
  const preset=lightingPresets[name];if(!preset)return;
  Object.assign(lighting,preset,{preset:name});
  $('spotLightIntensity').value=lighting.intensityPercent;$('spotLightEnabled').checked=lighting.spotEnabled;
  applyLighting();
}

function makePlasterTextures(){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const context=canvas.getContext('2d');context.fillStyle='#eee7dc';context.fillRect(0,0,512,512);
  let seed=42;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  for(let i=0;i<22000;i++){
    const value=random()>.5?'255,255,255':'139,126,108';
    context.fillStyle=`rgba(${value},${random()*.045})`;
    const size=random()*1.4+.2;context.fillRect(random()*512,random()*512,size,size);
  }
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
  const bump=new THREE.CanvasTexture(canvas);bump.colorSpace=THREE.NoColorSpace;bump.anisotropy=4;
  return {map,bump};
}

function makeWoodTextures(){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;
  const context=canvas.getContext('2d');context.fillStyle='#c7ac88';context.fillRect(0,0,1024,1024);
  let seed=1847;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  const colors=['#c8ae8e','#d1b998','#bea27f','#d5bea0','#c4a985','#cfb28d'];
  const plankHeight=16;
  for(let row=0;row<1024/plankHeight;row++){
    let x=row%2?-100:0;
    while(x<1024){
      const width=100+Math.floor(random()*150);const left=Math.max(0,x);
      context.fillStyle=colors[Math.floor(random()*colors.length)];context.fillRect(left,row*plankHeight,Math.min(width,1024-left),plankHeight-1);
      context.strokeStyle='rgba(111,82,53,.18)';context.lineWidth=1;context.beginPath();context.moveTo(left,row*plankHeight+plankHeight-1);context.lineTo(Math.min(left+width,1024),row*plankHeight+plankHeight-1);context.stroke();
      for(let grain=0;grain<3;grain++){
        const gy=row*plankHeight+2+random()*(plankHeight-4);context.strokeStyle=`rgba(115,83,54,${.035+random()*.055})`;context.lineWidth=.6;context.beginPath();context.moveTo(left,gy);context.bezierCurveTo(left+width*.3,gy-1,left+width*.7,gy+1,Math.min(left+width,1024),gy);context.stroke();
      }
      const seamX=Math.min(x+width,1023);context.fillStyle='rgba(94,69,48,.25)';context.fillRect(seamX,row*plankHeight,1,plankHeight);x+=width;
    }
  }
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
  const bump=new THREE.CanvasTexture(canvas);bump.colorSpace=THREE.NoColorSpace;bump.anisotropy=4;
  return {map,bump};
}

function makeScene() {
  scene = new THREE.Scene(); scene.background = new THREE.Color('#d8d8d0');
  scene.fog=new THREE.Fog('#d8d8d0',12,26);
  addLights();
  const wood=makeWoodTextures();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16,16),new THREE.MeshStandardMaterial({color:'#fffdf9',map:wood.map,bumpMap:wood.bump,bumpScale:.018,roughness:.82,metalness:0}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.06;floor.receiveShadow=true;scene.add(floor);
  roomWalls=new THREE.Group();roomWalls.name='Paredes foscas do estúdio';
  const plaster=makePlasterTextures();
  const wallMaterial=new THREE.MeshStandardMaterial({color:'#fffdf9',map:plaster.map,bumpMap:plaster.bump,bumpScale:.012,roughness:.98,metalness:0,side:THREE.DoubleSide});
  const wallSpecs=[
    {x:0,z:-8,rotation:Math.PI},
    {x:-8,z:0,rotation:-Math.PI/2},
    {x:8,z:0,rotation:Math.PI/2},
    {x:0,z:8,rotation:0}
  ];
  for(const spec of wallSpecs){const wall=new THREE.Mesh(new THREE.PlaneGeometry(16,8),wallMaterial);wall.position.set(spec.x,4,spec.z);wall.rotation.y=spec.rotation;wall.receiveShadow=true;wall.castShadow=true;wall.layers.set(2);roomWalls.add(wall)}
  const trimMaterial=new THREE.MeshStandardMaterial({color:'#dfd2bf',roughness:.86,metalness:0});
  for(const z of [-7.94,7.94]){const trim=new THREE.Mesh(new THREE.BoxGeometry(16,.16,.09),trimMaterial);trim.position.set(0,.02,z);trim.receiveShadow=true;trim.layers.set(2);roomWalls.add(trim)}
  for(const x of [-7.94,7.94]){const trim=new THREE.Mesh(new THREE.BoxGeometry(.09,.16,16),trimMaterial);trim.position.set(x,.02,0);trim.receiveShadow=true;trim.layers.set(2);roomWalls.add(trim)}
  scene.add(roomWalls);
  const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.3,.13,80),new THREE.MeshStandardMaterial({color:'#e7dfd1',roughness:.85}));
  pedestal.position.y=.03;pedestal.receiveShadow=true;scene.add(pedestal);
  productGroup=new THREE.Group();productGroup.position.y=.12;scene.add(productGroup);
  const ringMat=new THREE.MeshBasicMaterial({color:'#ad7b27',transparent:true,opacity:.55,depthWrite:false});
  ring=new THREE.Mesh(new THREE.RingGeometry(3.75,3.78,128),ringMat);
  ring.rotation.x=-Math.PI/2;ring.position.y=.025;ring.layers.set(1);scene.add(ring);
  phone=new THREE.Group();scene.add(phone);
}

function setupRenderers() {
  stageRenderer=new THREE.WebGLRenderer({canvas:stageCanvas,antialias:true,powerPreference:'high-performance'});
  previewRenderer=new THREE.WebGLRenderer({canvas:previewCanvas,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  phoneScreenTexture=new THREE.CanvasTexture(previewCanvas);
  phoneScreenTexture.colorSpace=THREE.SRGBColorSpace;
  for(const renderer of [stageRenderer,previewRenderer]){
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.25;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,maxPixelRatio));
  }
  maxTextureAnisotropy=Math.max(1,Math.min(8,stageRenderer.capabilities.getMaxAnisotropy()));
  scene.traverse(object=>{
    if(!object.material)return;
    for(const material of (Array.isArray(object.material)?object.material:[object.material])){
      for(const value of Object.values(material))if(value?.isTexture){value.anisotropy=maxTextureAnisotropy;value.needsUpdate=true}
    }
  });
  stageCamera=new THREE.PerspectiveCamera(39,1,.1,100);
  stageCamera.position.set(4.5,4.9,6.7);stageCamera.lookAt(0,.85,0);
  stageCamera.layers.enable(1);stageCamera.layers.enable(2);
  phoneCamera=new THREE.PerspectiveCamera(78,1,.1,50);
  phoneCamera.layers.enable(2);
}

function resizeRenderer(renderer,canvas,camera){
  const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
  if(renderer.domElement.width!==Math.round(w*renderer.getPixelRatio())||renderer.domElement.height!==Math.round(h*renderer.getPixelRatio())) renderer.setSize(w,h,false);
  camera.aspect=w/h;camera.updateProjectionMatrix();
}

function scheduleRender(){if(!renderPending){renderPending=true;requestAnimationFrame(render)}}
function updatePhoneCamera(){
  const angle=THREE.MathUtils.degToRad(state.angle);
  const x=Math.sin(angle)*state.distance,z=Math.cos(angle)*state.distance;
  const target=new THREE.Vector3(state.productId==='mug'?.12:0,state.productId==='shirt'?.54:state.productId==='shoe'?.72:.83,0);
  phone.position.set(x,state.height,z);
  phone.lookAt(target);
  phoneCamera.position.copy(phone.position);phoneCamera.lookAt(target);
  ring.scale.setScalar(state.distance/3.77);
}
function render(){
  renderPending=false;
  resizeRenderer(stageRenderer,stageCanvas,stageCamera);
  resizeRenderer(previewRenderer,previewCanvas,phoneCamera);
  updatePhoneCamera();
  const wasVisible=phone.visible;
  try{phone.visible=false;previewRenderer.render(scene,phoneCamera);phoneScreenTexture.needsUpdate=true}
  finally{phone.visible=wasVisible}
  stageRenderer.render(scene,stageCamera);
}

async function capturePhotoBlob(){
  render();
  const width=Math.max(1,previewCanvas.clientWidth),height=Math.max(1,previewCanvas.clientHeight);
  const originalRatio=previewRenderer.getPixelRatio(),originalAspect=phoneCamera.aspect,wasPhoneVisible=phone.visible;
  const gl=previewRenderer.getContext();
  const maxViewport=gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  const maxDimension=Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),maxViewport[0],maxViewport[1],4096);
  const pixelBudget=8_000_000;
  const scale=Math.max(1,Math.min(4,maxDimension/width,maxDimension/height,Math.sqrt(pixelBudget/(width*height))));
  const outputWidth=Math.max(width,Math.floor(width*scale)),outputHeight=Math.max(height,Math.floor(height*scale));
  try{
    previewRenderer.setPixelRatio(1);
    previewRenderer.setSize(outputWidth,outputHeight,false);
    phoneCamera.aspect=outputWidth/outputHeight;phoneCamera.updateProjectionMatrix();
    phone.visible=false;
    previewRenderer.render(scene,phoneCamera);
    phoneScreenTexture.needsUpdate=true;
    return await new Promise((resolve,reject)=>previewCanvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Falha ao criar imagem')),'image/png'));
  }finally{
    phone.visible=wasPhoneVisible;
    previewRenderer.setPixelRatio(originalRatio);
    previewRenderer.setSize(width,height,false);
    phoneCamera.aspect=originalAspect;phoneCamera.updateProjectionMatrix();
    phoneScreenTexture.needsUpdate=true;
    render();
  }
}

function updateFeedback(){
  let title,text;
  const a=Math.abs(state.angle);
  const shoe=state.productId==='shoe',shirt=state.productId==='shirt';
  if(state.height>2.5){title='Vista de cima';text=shirt?'Revela a organização simétrica, as cores e as dobras. Complete com uma foto em 3/4 para mostrar a altura da pilha.':shoe?'Mostra os cadarços e a abertura. Combine com uma foto lateral para explicar a forma e o solado.':'Boa para mostrar a abertura e o interior. Acrescente outra foto lateral para explicar a altura da peça.'}
  else if(state.distance<3.1){title='Muito perto';text='Um detalhe pode ficar interessante, mas o produto pode sair do quadro. Afaste um pouco para a foto principal.'}
  else if(state.distance>5.1){title='Mais longe';text='Há espaço em volta do produto. Aproxime se ele ficou pequeno e os detalhes perderam força.'}
  else if(a<20){title='Vista frontal';text=shirt?'Mostra a frente da pilha. Inclua uma vista de cima para deixar claras as cores e a textura do tecido.':shoe?'Observe se a frente e os cadarços estão claros. Uma foto lateral ajuda a mostrar o comprimento do tênis.':'Mostra a forma da caneca. Uma foto em 3/4 deixa a alça e a marca mais claras.'}
  else if(a<70){title='Ângulo em 3/4';text=shirt?'Ajuda a perceber a altura, as dobras e a superfície das camisas. Confira se todas cabem no quadro.':shoe?'A perspectiva ajuda a mostrar volume, material e detalhes. Confira se a ponta e o calcanhar cabem no quadro.':'Aqui se percebem a frente, o volume e a alça. É um bom candidato para a foto principal.'}
  else if(a<120){title='Vista lateral';text=shirt?'Mostra a espessura da pilha e o caimento das dobras. Combine com uma foto de cima.':shoe?'O perfil ajuda a explicar o desenho, o solado e a altura. Combine com um detalhe da costura.':'Ajuda a entender a profundidade e a alça. Combine com uma vista frontal para mostrar a marca.'}
  else {title='Verso do produto';text=shirt?'Use para mostrar as peças de trás e conferir se a composição continua clara.':shoe?'Mostre o calcanhar e o acabamento; uma foto do solado completa a informação.':'Mostra acabamento e partes que a foto principal esconde. É útil como imagem complementar.'}
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

function renderCaptures(){
  const holder=$('captures');
  holder.replaceChildren();
  if(!captures.length){
    const empty=document.createElement('p');
    empty.textContent='Toque no botão da câmera. A foto será salva na Galeria do celular e ficará disponível para o professor.';
    holder.append(empty);
  }
  captures.forEach((item,i)=>{
    const thumb=document.createElement('div');thumb.className='capture-thumb';
    const img=document.createElement('img');img.src=item.src;img.alt=`Foto ${captures.length-i}: giro ${item.angle} graus, altura ${item.height} centímetros`;img.title=img.alt;
    const remove=document.createElement('button');remove.type='button';remove.className='capture-delete';remove.textContent='×';remove.setAttribute('aria-label',`Apagar foto ${captures.length-i}`);remove.title='Apagar foto';
    const status=document.createElement('span');status.className=`capture-sync-status ${item.syncStatus==='synced'?'is-synced':'is-pending'}`;status.textContent=item.syncStatus==='synced'?'✓ Professor recebeu':'↑ Pendente';status.title=item.syncError||'';
    if(item.syncStatus!=='synced'){
      const retry=document.createElement('button');retry.type='button';retry.className='capture-retry';retry.textContent='Tentar envio';retry.title=item.syncError||'Enviar esta foto ao professor';
      retry.addEventListener('click',async()=>{retry.disabled=true;const result=await window.MetaLabGallery.syncPhoto(item.id).catch(()=>null);if(result?.syncStatus==='synced')$('saveResult').textContent='Foto enviada para a ficha do professor.';else $('saveResult').textContent=result?.syncError||'Não foi possível enviar a foto agora.';await loadCaptures()});
      thumb.append(img,remove,status,retry);
    }else thumb.append(img,remove,status);
    remove.addEventListener('click',async()=>{
      remove.disabled=true;
      try{
        await window.MetaLabGallery.remove(item.id);
        if(lastSavedPhoto?.id===item.id)lastSavedPhoto=null;
        await loadCaptures();$('saveResult').textContent='Foto apagada da Galeria e da visualização do professor.';
      }catch(error){remove.disabled=false;$('saveResult').textContent=error instanceof Error?error.message:'Não foi possível apagar a foto agora.'}
    });
    holder.append(thumb);
  });
  if(totalCaptureCount>=MAX_CAPTURES){const note=document.createElement('p');note.className='capture-limit-note';note.textContent='Limite de 10 fotos atingido. Apague uma miniatura com × para fotografar novamente.';holder.append(note)}
  $('captureCount').textContent=`${totalCaptureCount}/${MAX_CAPTURES}`;
  $('capture').disabled=totalCaptureCount>=MAX_CAPTURES||!productModels.has(state.productId);
}

async function loadCaptures(){
  try{
    const records=await window.MetaLabGallery.list();
    captures.forEach(item=>URL.revokeObjectURL(item.src));captures.length=0;totalCaptureCount=records.length;
    for(const record of records.slice(0,MAX_CAPTURES))captures.push({id:record.id,src:URL.createObjectURL(record.blob),angle:record.angle||0,height:record.height||0,syncStatus:record.syncStatus,syncError:record.syncError});
    renderCaptures();
  }catch(error){console.warn('Não foi possível carregar as miniaturas da galeria.',error)}
}

function bindControls(){
  document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{Object.assign(state,presets[button.dataset.preset]);syncControls()}));
  document.querySelectorAll('[data-light-preset]').forEach(button=>button.addEventListener('click',()=>selectLightingPreset(button.dataset.lightPreset)));
  const setCustomTip=()=>{lighting.preset='custom';lighting.tip='Ajuste a luz e observe como ela muda as cores e as sombras do produto.'};
  $('spotLightIntensity').addEventListener('input',()=>{lighting.intensityPercent=Number($('spotLightIntensity').value);setCustomTip();applyLighting()});
  $('spotLightEnabled').addEventListener('change',()=>{lighting.spotEnabled=$('spotLightEnabled').checked;setCustomTip();applyLighting()});
  document.querySelectorAll('[data-light-direction]').forEach(button=>button.addEventListener('click',()=>{lighting.direction=button.dataset.lightDirection;setCustomTip();applyLighting()}));
  $('lightingReset').addEventListener('click',()=>selectLightingPreset('natural'));
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
  document.querySelectorAll('[data-product]').forEach(button=>button.addEventListener('click',()=>selectProduct(button.dataset.product)));
  $('saveComputer').addEventListener('click',async()=>{
    if(!lastSavedPhoto)return;
    try{
      const result=await window.MetaLabGallery.saveToComputer(lastSavedPhoto.blob,lastSavedPhoto.name);
      $('saveResult').textContent=result==='saved'?'Cópia salva no local escolhido.':result==='cancelled'?'Tudo bem. A foto continua na Galeria.':'Download iniciado. O navegador define a pasta de destino.';
    }catch(error){$('saveResult').textContent='Não foi possível salvar a cópia. A foto continua na Galeria.';console.warn(error)}
  });
  $('saveLater').addEventListener('click',()=>$('saveDialog').close());
}

async function capture(){
  const button=$('capture');
  if(totalCaptureCount>=MAX_CAPTURES){renderCaptures();return}
  button.disabled=true;
  try{
    const blob=await capturePhotoBlob();
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const slug={mug:'caneca',shoe:'tenis',shirt:'camisas'}[state.productId];
    const record=await window.MetaLabGallery.save({blob,name:`metalab-${slug}-${stamp}.png`,product:state.product,angle:Math.round(state.angle),height:Math.round(state.height*10),lighting:{preset:lighting.preset,keyIntensity:lighting.key,ambientIntensity:lighting.ambient,direction:lighting.direction,temperature:lighting.temperature,shadowStrength:lighting.shadows}});
    lastSavedPhoto=record;
    const src=URL.createObjectURL(blob);captures.unshift({id:record.id,src,angle:record.angle,height:record.height});
    totalCaptureCount++;
    renderCaptures();
    $('saveResult').textContent=record.syncStatus==='synced'?'Foto salva e enviada para a ficha do professor.':`Foto salva somente neste navegador. ${record.syncError||'O envio ao professor falhou.'} Use “Tentar envio” na miniatura.`;
    const picker=window.MetaLabGallery.hasSavePicker();
    $('saveComputer').textContent=picker?'Escolher local e salvar':'Baixar no computador';
    $('saveHint').textContent=picker?'Ao continuar, escolha a pasta e o nome do arquivo na janela do computador.':'Este navegador não oferece escolha de pasta pela página. Ao baixar, ele usará sua configuração de downloads.';
    $('saveDialog').showModal();
  }catch(error){
    $('angleFeedback').innerHTML=error instanceof Error&&error.message==='PHOTO_LIMIT_REACHED'?'<b>Limite de fotos atingido.</b><br>Apague uma miniatura com × para liberar espaço para outra foto.':'<b>Não foi possível salvar a foto.</b><br>Verifique se o navegador permite armazenamento local e tente novamente.';
    console.warn('Falha ao salvar foto:',error);
  }finally{button.disabled=totalCaptureCount>=MAX_CAPTURES||!productModels.has(state.productId)}
}

try{
  makeScene();setupRenderers();bindControls();selectLightingPreset('natural');syncControls();loadPhoneModel();
  window.addEventListener('metalab-gallery-updated',()=>{void loadCaptures()});
  void loadCaptures();
  void selectProduct('mug');
  void window.MetaLabGallery.syncPending().finally(()=>loadCaptures());
}catch(error){
  console.error(error);
  $('stageError').hidden=false;
  $('stageError').textContent='Este navegador não conseguiu iniciar a cena 3D. Tente abrir a página em um navegador com WebGL 2 ativo.';
}
