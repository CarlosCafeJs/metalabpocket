import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const $ = (id) => document.getElementById(id);
const stageCanvas = $('stage');
const previewCanvas = $('preview');
const state = { angle: 0, height: 1.5, distance: 3.8, product: 'Caneca de cerâmica', productId: 'mug' };
const lowPower = window.innerWidth < 700 || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4);
const maxPixelRatio = lowPower ? 1.25 : 1.75;
const presets = {
  front: { angle: 0, height: 1.5, distance: 3.8 },
  threequarter: { angle: 42, height: 1.75, distance: 4.1 },
  side: { angle: 90, height: 1.5, distance: 4.2 },
  back: { angle: 180, height: 1.5, distance: 4.1 },
  top: { angle: 35, height: 2.9, distance: 3.9 }
};

let stageRenderer, previewRenderer, scene, productGroup, phone, phoneScreenTexture, ring, stageCamera, phoneCamera;
let renderPending = false;
const captures = [];
let lastSavedPhoto;
let requestedProduct = 'mug';
let logoTexturePromise;
const productModels = new Map();
const productLoads = new Map();
const productInfo = {
  mug: { name: 'Caneca de cerâmica', file: 'assets/caneca.glb', loading: 'Carregando a caneca 3D…', ready: 'Caneca 3D selecionada · observe a forma, a alça e o acabamento.', hint: 'Use “3/4” para mostrar a alça, o formato e a marca discreta. Inclua uma foto de cima para mostrar o interior.', lesson: 'Depois da foto principal, registre o lado, o verso e um detalhe. Mostre também a alça, a borda e o interior.' },
  shoe: { name: 'Tênis de treino', file: 'assets/shoes_test.glb', loading: 'Carregando o tênis 3D com suas texturas…', ready: 'Tênis 3D selecionado · couro, costura e solado visíveis.', hint: 'Use “3/4” para revelar o formato, depois fotografe a lateral, os cadarços e o solado. Procure uma luz que mostre a textura.', lesson: 'Depois da foto principal, registre perfil lateral, traseira, solado e um detalhe dos cadarços ou da costura.' },
  shirt: { name: 'Camisas dobradas', file: 'assets/camisas-dobradas.glb', loading: 'Carregando as camisas 3D e suas texturas…', ready: 'Camisas dobradas selecionadas · observe tecido, cores e dobras.', hint: 'Comece com a vista de cima para mostrar a composição simétrica das cores. Faça outra foto lateral para revelar a altura da pilha e as dobras.', lesson: 'Fotografe de cima, em 3/4 e de lado. Mostre a textura do tecido, a organização das peças e o acabamento sem esconder as camisas de baixo.' }
};

function showPreviewPhone(model,size){
  const canvas=$('previewPhoneModel');
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,maxPixelRatio));
  renderer.setClearColor(0,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.3;
  const displayScene=new THREE.Scene();
  displayScene.add(new THREE.HemisphereLight('#ffffff','#8ca0b3',2.7));
  const key=new THREE.DirectionalLight('#ffffff',2.4);key.position.set(-3,5,6);displayScene.add(key);
  const fill=new THREE.DirectionalLight('#d7eaff',1.2);fill.position.set(3,1,-5);displayScene.add(fill);
  const root=new THREE.Group();root.add(model);root.scale.setScalar(4/size.y);displayScene.add(root);
  const camera=new THREE.OrthographicCamera(-1,1,2.17,-2.17,.1,40);
  camera.position.set(0,0,8);camera.lookAt(0,0,0);
  function draw(){
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if(!width||!height)return;
    renderer.setSize(width,height,false);
    const halfH=2.17;
    camera.left=-halfH*width/height;camera.right=halfH*width/height;
    camera.top=halfH;camera.bottom=-halfH;camera.updateProjectionMatrix();
    renderer.render(displayScene,camera);
  }
  $('previewDevice').classList.add('model-ready');
  new ResizeObserver(draw).observe(canvas);
  draw();
}

function getLogoTexture(){
  if(!logoTexturePromise)logoTexturePromise=new THREE.TextureLoader().loadAsync('assets/metalab-logo.png').then(texture=>{texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture});
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
    model.traverse(obj=>{if(obj.isMesh){obj.castShadow=true;obj.receiveShadow=true}});
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
    const displayModel=model.clone(true);
    const holder=new THREE.Group();holder.add(model);holder.scale.setScalar(1.1/size.y);
    // Object3D.lookAt aims +Z at the product. Turn the supplied phone so its
    // rear cameras (-Z in the model) face the product and its screen faces us.
    holder.rotation.y=Math.PI;
    const screen=new THREE.Mesh(
      new THREE.PlaneGeometry(size.x*.75,size.y*.84),
      new THREE.MeshBasicMaterial({map:phoneScreenTexture,side:THREE.FrontSide,toneMapped:false})
    );
    const screenAspect=(size.x*.75)/(size.y*.84);
    showPreviewPhone(displayModel,size);
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
  $('capture').disabled=false;
  updateFeedback();scheduleRender();
}

function addLights() {
  scene.add(new THREE.HemisphereLight('#eaf6ff','#7d6352',2.2));
  const key = new THREE.DirectionalLight('#fff1d8',3.1);
  key.position.set(-3,7,5); key.castShadow=true; key.shadow.mapSize.set(lowPower?1024:1536,lowPower?1024:1536);
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
  const ringMat=new THREE.MeshBasicMaterial({color:'#ad7b27',transparent:true,opacity:.55,depthWrite:false});
  ring=new THREE.Mesh(new THREE.RingGeometry(3.75,3.78,128),ringMat);
  ring.rotation.x=-Math.PI/2;ring.position.y=.025;scene.add(ring);
  phone=new THREE.Group();scene.add(phone);
  const standLight=new THREE.Mesh(new THREE.PlaneGeometry(1.6,2.6),new THREE.MeshBasicMaterial({color:'#fff1ce',side:THREE.DoubleSide}));
  standLight.position.set(-4,2.6,-.1);standLight.rotation.y=Math.PI/2.8;scene.add(standLight);
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
  stageCamera=new THREE.PerspectiveCamera(39,1,.1,100);
  stageCamera.position.set(4.5,4.9,8.6);stageCamera.lookAt(0,.85,0);
  phoneCamera=new THREE.PerspectiveCamera(78,1,.1,50);
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
  const target=new THREE.Vector3(state.productId==='mug'?.12:0,state.productId==='shirt'?.54:state.productId==='shoe'?.72:.83,0);
  phone.position.set(x,state.height,z);
  phone.lookAt(target);
  phoneCamera.position.copy(phone.position);phoneCamera.lookAt(target);
  ring.scale.setScalar(state.distance/3.77);
  phone.visible=false;previewRenderer.render(scene,phoneCamera);
  phoneScreenTexture.needsUpdate=true;
  phone.visible=true;stageRenderer.render(scene,stageCamera);
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
  const button=$('capture');button.disabled=true;
  try{
    render();
    const blob=await new Promise((resolve,reject)=>previewCanvas.toBlob(value=>value?resolve(value):reject(new Error('Falha ao criar imagem')),'image/png'));
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const slug={mug:'caneca',shoe:'tenis',shirt:'camisas'}[state.productId];
    const record=await window.MetaLabGallery.save({blob,name:`metalab-${slug}-${stamp}.png`,product:state.product,angle:Math.round(state.angle),height:Math.round(state.height*10)});
    lastSavedPhoto=record;
    const src=URL.createObjectURL(blob);captures.unshift({src,angle:record.angle,height:record.height});
    if(captures.length>4){const old=captures.pop();URL.revokeObjectURL(old.src)}
    const holder=$('captures');holder.replaceChildren();
    captures.forEach((item,i)=>{const img=document.createElement('img');img.src=item.src;img.alt=`Foto ${captures.length-i}: giro ${item.angle} graus, altura ${item.height} centímetros`;img.title=img.alt;holder.append(img)});
    $('captureCount').textContent=`${captures.length}/4`;
    $('saveResult').textContent='';
    const picker=window.MetaLabGallery.hasSavePicker();
    $('saveComputer').textContent=picker?'Escolher local e salvar':'Baixar no computador';
    $('saveHint').textContent=picker?'Ao continuar, escolha a pasta e o nome do arquivo na janela do computador.':'Este navegador não oferece escolha de pasta pela página. Ao baixar, ele usará sua configuração de downloads.';
    $('saveDialog').showModal();
  }catch(error){
    $('angleFeedback').innerHTML='<b>Não foi possível salvar a foto.</b><br>Verifique se o navegador permite armazenamento local e tente novamente.';
    console.warn('Falha ao salvar foto:',error);
  }finally{button.disabled=false}
}

try{
  makeScene();setupRenderers();bindControls();syncControls();loadPhoneModel();selectProduct('mug');
}catch(error){
  console.error(error);
  $('stageError').hidden=false;
  $('stageError').textContent='Este navegador não conseguiu iniciar a cena 3D. Tente abrir a página em um navegador com WebGL 2 ativo.';
}
