import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';

const phone=document.getElementById('phone');
const canvas=document.getElementById('phoneModelCanvas');
if(phone&&canvas){
  try{
    const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.3;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    renderer.setClearColor(0,0);
    const scene=new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff','#8ca0b3',2.7));
    const key=new THREE.DirectionalLight('#ffffff',2.4);key.position.set(-3,5,6);scene.add(key);
    const fill=new THREE.DirectionalLight('#d7eaff',1.2);fill.position.set(3,1,-5);scene.add(fill);
    const camera=new THREE.OrthographicCamera(-1,1,2.17,-2.17,.1,40);
    camera.position.set(0,0,8);camera.lookAt(0,0,0);
    const modelRoot=new THREE.Group();scene.add(modelRoot);
    let currentRotation=0,targetRotation=0,running=false,lastBack=false;
    function resize(){const w=canvas.clientWidth||294,h=canvas.clientHeight||590;renderer.setSize(w,h,false);const halfH=2.17;camera.left=-halfH*w/h;camera.right=halfH*w/h;camera.top=halfH;camera.bottom=-halfH;camera.updateProjectionMatrix()}
    function draw(){resize();renderer.render(scene,camera)}
    function animate(){
      currentRotation+=(targetRotation-currentRotation)*.17;
      if(Math.abs(targetRotation-currentRotation)<.006){currentRotation=targetRotation;phone.classList.remove('model-turning');running=false}
      modelRoot.rotation.y=currentRotation;draw();if(running)requestAnimationFrame(animate);
    }
    function turn(){
      const back=phone.classList.contains('show-back');
      if(back===lastBack)return;
      lastBack=back;targetRotation=back?Math.PI:0;
      if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){currentRotation=targetRotation;modelRoot.rotation.y=currentRotation;phone.classList.remove('model-turning');draw();return}
      phone.classList.add('model-turning');if(!running){running=true;requestAnimationFrame(animate)}
    }
    const gltf=await new GLTFLoader().loadAsync('assets/celular.glb');
    const box=new THREE.Box3().setFromObject(gltf.scene),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    gltf.scene.position.sub(center);modelRoot.add(gltf.scene);modelRoot.scale.setScalar(4/size.y);
    phone.classList.add('model-ready');
    if(phone.classList.contains('show-back')){lastBack=true;targetRotation=currentRotation=Math.PI;modelRoot.rotation.y=Math.PI}
    draw();new MutationObserver(turn).observe(phone,{attributes:true,attributeFilter:['class']});
    window.addEventListener('resize',draw);
  }catch(error){console.warn('Modelo do celular indisponível; estrutura de reserva mantida.',error)}
}
