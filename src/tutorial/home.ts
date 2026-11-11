import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {createDemo} from '../core/demo';
import {buildProjectScene} from '../core/mesh';

const host=document.getElementById('world-canvas')!;
try{
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.4;
 const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(34,1,.1,100);
 camera.position.set(11,9,-15);
 scene.add(new THREE.HemisphereLight('#d9f4e7','#30463c',2));
 const sun=new THREE.DirectionalLight('#fff1d2',3);sun.position.set(-6,12,-8);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-10;sun.shadow.camera.right=10;sun.shadow.camera.top=10;sun.shadow.camera.bottom=-10;sun.shadow.normalBias=.04;scene.add(sun);
 const world=buildProjectScene(createDemo());world.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(world);
 const grid=new THREE.GridHelper(30,30,'#3a5447','#2b4036');grid.position.y=-.8;scene.add(grid);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.ShadowMaterial({opacity:.2}));floor.rotation.x=-Math.PI/2;floor.position.y=-.79;floor.receiveShadow=true;scene.add(floor);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,1.5,0);controls.enablePan=false;controls.enableZoom=false;controls.minPolarAngle=.4;controls.maxPolarAngle=Math.PI/2-.1;controls.update();
 const render=()=>renderer.render(scene,camera);
 controls.addEventListener('change',render);
 const resize=new ResizeObserver(()=>{const {width,height}=host.getBoundingClientRect();camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);render();});
 host.appendChild(renderer.domElement);resize.observe(host);document.getElementById('world-fallback')!.hidden=true;
 document.getElementById('world-help')!.textContent='拖动，看看另一面 ↔';
 addEventListener('pagehide',()=>{resize.disconnect();controls.dispose();renderer.dispose();},{once:true});
}catch{ /* Keep the static courtyard preview when WebGL is unavailable. */ }
