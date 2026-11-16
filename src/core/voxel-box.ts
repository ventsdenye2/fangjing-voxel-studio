import {Euler,Vector3,MathUtils} from 'three';
import type {Project,VoxelAsset,Vec3,SceneNode} from './types';
import {editVoxels} from './voxel-edit';
import {isEffectivelyLocked} from './scene-ops';
export interface VoxelBox {min:Vec3;max:Vec3}
export interface BoxSelection {nodeId:string;bounds:VoxelBox;tool:'translate'|'scale'}
export function validBox(box:VoxelBox):boolean{
 return [box.min,box.max].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isSafeInteger))&&box.min.every((v,i)=>v<box.max[i]);
}
export function inVoxelBox(cell:readonly number[],box:VoxelBox){return cell.every((v,i)=>v>=box.min[i]&&v<box.max[i]);}
export function countBoxCells(asset:VoxelAsset,box:VoxelBox){let count=0;for(const key of Object.keys(asset.cells))if(inVoxelBox(key.split(',').map(Number),box))count++;return count;}
export function initialVoxelBox(asset:VoxelAsset):VoxelBox{return {min:[0,Math.floor(asset.dimensions[1]/2),0],max:[...asset.dimensions]};}
/** Quantize a local-space box to voxel boundaries, including negative origins. */
export function boxFromTransform(asset:VoxelAsset,center:Vec3,size:Vec3):VoxelBox{
 const span=size.map(v=>Math.max(1,Math.min(512,Math.round(Math.abs(v)/asset.voxelSize)))) as Vec3;
 const min=center.map((v,i)=>Math.max(-512,Math.min(512,Math.round((v-asset.origin[i])/asset.voxelSize-span[i]/2)))) as Vec3;
 return {min,max:min.map((v,i)=>v+span[i]) as Vec3};
}
export function extractVoxelBox(project:Project,nodeId:string,box:VoxelBox,copy=false):{nodeId:string;count:number}{
 if(!validBox(box))throw Error('选框范围无效。');
 const node=project.nodes.find(n=>n.id===nodeId);
 if(!node||node.kind!=='mesh'||isEffectivelyLocked(project,nodeId))throw Error('请选择一个未锁定的模型物件。');
 const asset=project.assets.find(a=>a.id===node.assetId);
 if(!asset)throw Error('找不到当前物件的体素模型。');
 const chosen:Record<string,string>={},remaining:Record<string,string>={};
 const min:Vec3=[Infinity,Infinity,Infinity],max:Vec3=[-Infinity,-Infinity,-Infinity];
 for(const [key,color] of Object.entries(asset.cells)){
  const xyz=key.split(',').map(Number);
  if(inVoxelBox(xyz,box)){chosen[key]=color;xyz.forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v+1);});}
  else if(!copy)remaining[key]=color;
 }
 const count=Object.keys(chosen).length;if(!count)throw Error('框内没有体素，请调整选框。');
 const dimensions=max.map((v,i)=>v-min[i]) as Vec3;
 const offset:Vec3=[asset.origin[0]+(min[0]+dimensions[0]/2)*asset.voxelSize,asset.origin[1]+min[1]*asset.voxelSize,asset.origin[2]+(min[2]+dimensions[2]/2)*asset.voxelSize];
 const cells:Record<string,string>={};
 for(const [key,color] of Object.entries(chosen))cells[key.split(',').map((v,i)=>Number(v)-min[i]).join(',')]=color;
 const part:VoxelAsset={id:crypto.randomUUID(),name:node.name+(copy?' · 框选副本':' · 拆分部分'),dimensions,origin:[-dimensions[0]*asset.voxelSize/2,0,-dimensions[2]*asset.voxelSize/2],voxelSize:asset.voxelSize,cells};
 const displacement=new Vector3(...offset).multiply(new Vector3(...node.scale)).applyEuler(new Euler(...node.rotation.map(MathUtils.degToRad) as Vec3,'XYZ'));
 const created:SceneNode={id:crypto.randomUUID(),name:part.name,assetId:part.id,kind:'mesh',position:node.position.map((v,i)=>v+displacement.getComponent(i)) as Vec3,rotation:[...node.rotation],scale:[...node.scale],visible:node.visible,locked:false,tags:[...node.tags],...(node.parentId?{parentId:node.parentId}:{})};
 // Scene editing isolates the source instance, leaving its prefab and siblings intact.
 if(!copy)editVoxels(project,node.id,'scene',remaining);
 project.assets.push(part);project.nodes.push(created);
 return {nodeId:created.id,count};
}
