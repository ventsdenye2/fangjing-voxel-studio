import type {Project,VoxelAsset,SceneNode} from './types';
export const uid=()=>crypto.randomUUID();
export function createDemo():Project {
 const asset=(id:string,name:string,dim:[number,number,number],size:number):VoxelAsset=>({id,name,dimensions:dim,voxelSize:size,origin:[-dim[0]*size/2,0,-dim[2]*size/2],cells:{}});
 const fill=(a:VoxelAsset,x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,c:string)=>{for(let x=x0;x<x1;x++)for(let y=y0;y<y1;y++)for(let z=z0;z<z1;z++)a.cells[[x,y,z].join(',')]=c;};
 const ground=asset('demo-ground','草地',[32,3,28],.25);fill(ground,0,0,0,32,2,28,'#86634a');fill(ground,0,2,0,32,3,28,'#849c55');fill(ground,13,2,0,19,3,18,'#a5a6a6');
 const stairs=asset('demo-stairs','石阶',[12,6,12],.25);for(let z=0;z<12;z++)fill(stairs,0,0,z,12,1+Math.floor(z/2),z+1,z%2?'#aaaeb5':'#979ca6');
 const tree=asset('demo-tree','树',[13,22,13],.25);fill(tree,5,0,5,8,14,8,'#886045');fill(tree,3,9,5,6,11,8,'#886045');fill(tree,7,12,5,11,14,8,'#886045');fill(tree,1,12,2,10,16,11,'#6b943f');fill(tree,4,16,3,12,20,10,'#82aa4b');fill(tree,5,20,4,9,22,8,'#91b459');fill(tree,0,10,4,5,13,9,'#729b46');
 const house=asset('demo-house','庭院小屋',[26,22,18],.25);fill(house,1,0,1,25,2,17,'#858a95');fill(house,2,2,3,24,17,16,'#c9bdb0');fill(house,4,2,0,6,17,3,'#995e43');fill(house,20,2,0,22,17,3,'#995e43');fill(house,2,15,0,24,17,3,'#995e43');for(let x=10;x<16;x++)for(let y=3;y<12;y++)for(let z=3;z<16;z++)delete house.cells[[x,y,z].join(',')]; for(let z=0;z<18;z++){const h=18+Math.floor(Math.min(z,17-z)/3);fill(house,0,h,z,26,h+1,z+1,z%2?'#5d5c73':'#6c6a80');}fill(house,7,3,0,19,4,2,'#a8754f');fill(house,5,12,1,7,14,3,'#f5cd78');fill(house,19,12,1,21,14,3,'#f5cd78');
 const node=(id:string,assetId:string,name:string,position:[number,number,number]):SceneNode=>({id,assetId,name,kind:'mesh',position,rotation:[0,0,0],scale:[1,1,1],visible:true,locked:false,tags:[]});
 return {schemaVersion:1,id:uid(),name:'庭院练习',assets:[ground,stairs,tree,house],nodes:[node('node-ground',ground.id,'草地',[0,-.75,0]),node('node-house',house.id,'庭院小屋',[.8,0,1.1]),node('node-stairs',stairs.id,'石阶',[.8,0,-1.7]),node('node-tree',tree.id,'树',[-2.5,0,-.7])],sources:[],updatedAt:new Date().toISOString()};
}
export function createEmpty():Project {return {schemaVersion:1,id:uid(),name:'未命名关卡',assets:[],nodes:[],sources:[],updatedAt:new Date().toISOString()};}
