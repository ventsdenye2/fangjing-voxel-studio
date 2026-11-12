import type {Vec3,VoxelAsset} from './types';
export type VoxelPatch=Pick<VoxelAsset,'cells'|'origin'|'dimensions'>;
/** Resolve the occupied cell on the inside of an axis-aligned local mesh face. */
export function faceCell(asset:VoxelAsset,point:Vec3,normal:Vec3):{cell:Vec3;step:Vec3}|null{
 const axis=normal.reduce((best,v,i)=>Math.abs(v)>Math.abs(normal[best])?i:best,0);
 if(Math.abs(normal[axis])<.5)return null;
 const step:Vec3=[0,0,0];step[axis]=normal[axis]>0?1:-1;
 const grid=point.map((v,i)=>(v-asset.origin[i])/asset.voxelSize);
 const choices=grid.map((v,i)=>{if(i===axis)return [Math.floor(v-step[i]*1e-5)];const n=Math.floor(v);return Math.abs(v-Math.round(v))<1e-5?[Math.round(v),Math.round(v)-1]:[n];});
 for(const x of choices[0])for(const y of choices[1])for(const z of choices[2])if(Object.hasOwn(asset.cells,[x,y,z].join(',')))return {cell:[x,y,z],step};
 return null;
}
export function applyVoxelBrush(asset:VoxelAsset,cell:Vec3,step:Vec3,brush:'add'|'remove'|'paint',color:string,size:number):VoxelPatch|null{
 if(brush==='add'){
  const target=cell.map((v,i)=>v+step[i]) as Vec3;
  if(Object.hasOwn(asset.cells,target.join(',')))return null;
  const lower=target.map(v=>Math.min(0,v)) as Vec3;
  const dimensions=asset.dimensions.map((n,i)=>Math.max(n,target[i]+1)-lower[i]) as Vec3;
  if(dimensions.some(n=>n>512))throw Error('该方向的模型网格已达到 512 格，无法再添加。可以新建另一个物件继续搭建。');
  const origin=asset.origin.map((v,i)=>v+lower[i]*asset.voxelSize) as Vec3;
  const cells:Record<string,string>={};
  for(const [key,value] of Object.entries(asset.cells)){const xyz=key.split(',').map(Number);cells[xyz.map((v,i)=>v-lower[i]).join(',')]=value;}
  cells[target.map((v,i)=>v-lower[i]).join(',')]=color;
  return {cells,origin,dimensions};
 }
 const cells={...asset.cells},radius=Math.floor((size-1)/2);let changed=false;
 for(let x=cell[0]-radius;x<=cell[0]+radius;x++)for(let y=cell[1]-radius;y<=cell[1]+radius;y++)for(let z=cell[2]-radius;z<=cell[2]+radius;z++){
  const key=[x,y,z].join(',');if(!Object.hasOwn(cells,key))continue;
  if(brush==='remove'){delete cells[key];changed=true;}else if(cells[key]!==color){cells[key]=color;changed=true;}
 }
 return changed?{cells,origin:asset.origin,dimensions:asset.dimensions}:null;
}
