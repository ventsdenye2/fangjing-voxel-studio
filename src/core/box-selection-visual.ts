import * as T from 'three';
import {TransformControls} from 'three/examples/jsm/controls/TransformControls.js';
import {boxFromTransform,type BoxSelection,type VoxelBox} from './voxel-box';
import type {VoxelAsset,Vec3} from './types';
/** A local-space selection volume; does not modify the model or its transform. */
export class BoxSelectionVisual {
 readonly gizmo:TransformControls;
 private handle=new T.Object3D();
 private wire:T.LineSegments;
 private highlight:T.Mesh;
 private material:T.ShaderMaterial;
 private value:BoxSelection;
 constructor(private target:T.Mesh,private asset:VoxelAsset,private scene:T.Scene,camera:T.Camera,element:HTMLElement,private orbit:{enabled:boolean},value:BoxSelection,private changed:(bounds:VoxelBox)=>void,private dirty:()=>void){
  this.value=value;
  this.material=new T.ShaderMaterial({
   transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
   uniforms:{boxMin:{value:new T.Vector3()},boxMax:{value:new T.Vector3()},origin:{value:new T.Vector3(...asset.origin)},cellSize:{value:asset.voxelSize}},
   vertexShader:`varying vec3 localPosition;varying vec3 localNormal;
    void main(){localPosition=position;localNormal=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
   fragmentShader:`uniform vec3 boxMin;uniform vec3 boxMax;uniform vec3 origin;uniform float cellSize;
    varying vec3 localPosition;varying vec3 localNormal;
    void main(){vec3 cell=floor((localPosition-localNormal*cellSize*0.0001-origin)/cellSize);
     if(any(lessThan(cell,boxMin))||any(greaterThanEqual(cell,boxMax)))discard;
     gl_FragColor=vec4(1.0,0.62,0.12,0.65);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  this.highlight=new T.Mesh(target.geometry,this.material);this.highlight.renderOrder=5;this.highlight.raycast=()=>{};
  const cube=new T.BoxGeometry(1,1,1);const edges=new T.EdgesGeometry(cube);cube.dispose();
  this.wire=new T.LineSegments(edges,new T.LineBasicMaterial({color:0xffc565,depthTest:false,transparent:true,opacity:.95}));
  this.wire.renderOrder=6;this.wire.raycast=()=>{};
  this.handle.add(this.wire);target.add(this.handle,this.highlight);
  this.gizmo=new TransformControls(camera,element);this.gizmo.setSpace('local');this.gizmo.setSize(.75);this.scene.add(this.gizmo.getHelper());
  this.update(value);this.gizmo.attach(this.handle);
  this.gizmo.addEventListener('objectChange',()=>{this.preview();this.dirty();});
  this.gizmo.addEventListener('dragging-changed',e=>{
   this.orbit.enabled=!e.value;
   if(!e.value){const bounds=this.bounds();this.update({...this.value,bounds});this.changed(bounds);}
  });
  this.gizmo.addEventListener('change',()=>this.dirty());
 }
 private bounds(){return boxFromTransform(this.asset,this.handle.position.toArray() as Vec3,this.handle.scale.toArray() as Vec3);}
 private preview(){const bounds=this.bounds();this.material.uniforms.boxMin.value.fromArray(bounds.min);this.material.uniforms.boxMax.value.fromArray(bounds.max);}
 update(value:BoxSelection){
  this.value=value;if(this.gizmo.dragging)return;
  this.gizmo.setMode(value.tool);
  this.handle.position.fromArray(value.bounds.min.map((v,i)=>this.asset.origin[i]+(v+value.bounds.max[i])*this.asset.voxelSize/2) as Vec3);
  this.handle.scale.fromArray(value.bounds.max.map((v,i)=>(v-value.bounds.min[i])*this.asset.voxelSize) as Vec3);
  this.handle.updateMatrixWorld(true);this.preview();this.dirty();
 }
 dispose(){
  this.orbit.enabled=true;this.gizmo.detach();this.scene.remove(this.gizmo.getHelper());this.gizmo.dispose();
  this.target.remove(this.handle,this.highlight);this.wire.geometry.dispose();(this.wire.material as T.Material).dispose();this.material.dispose();
 }
}
