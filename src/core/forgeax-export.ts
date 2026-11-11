import type { Project } from './types';
import { generateMergedFaces } from './voxel-surface';

function zip(files: Record<string, string>): Uint8Array {
 const enc = new TextEncoder(), local: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0;
 const put = (a: Uint8Array, o: number, v: number, n: number) => { for (let i=0;i<n;i++) a[o+i]=(v >>> (i*8))&255; };
 const crc = (a: Uint8Array) => { let c=0xffffffff; for(const b of a){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0; };
 for(const [name,body] of Object.entries(files)){const n=enc.encode(name),d=enc.encode(body),c=crc(d),h=new Uint8Array(30+n.length),z=new Uint8Array(46+n.length);put(h,0,0x04034b50,4);put(h,4,20,2);put(h,6,0x800,2);put(h,14,c,4);put(h,18,d.length,4);put(h,22,d.length,4);put(h,26,n.length,2);h.set(n,30);put(z,0,0x02014b50,4);put(z,4,20,2);put(z,6,20,2);put(z,8,0x800,2);put(z,16,c,4);put(z,20,d.length,4);put(z,24,d.length,4);put(z,28,n.length,2);put(z,42,offset,4);z.set(n,46);local.push(h,d);central.push(z);offset+=h.length+d.length;}
 const len=central.reduce((a,b)=>a+b.length,0),end=new Uint8Array(22);put(end,0,0x06054b50,4);put(end,8,central.length,2);put(end,10,central.length,2);put(end,12,len,4);put(end,16,offset,4);const all=[...local,...central,end],out=new Uint8Array(all.reduce((a,b)=>a+b.length,0));let i=0;for(const b of all){out.set(b,i);i+=b.length;}return out;
}
const key=(id:string)=>Array.from(new TextEncoder().encode(id),x=>x.toString(16).padStart(2,'0')).join('');
async function packageId(id:string):Promise<string>{const b=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('voxel-studio/forgeax/v1/'+id)));b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;const h=Array.from(b.slice(0,16),x=>x.toString(16).padStart(2,'0')).join('');return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');}

export async function exportForgeax(project: Project): Promise<Uint8Array> {
 if(!project.id)throw new Error('Project ID is required');
 const nodes=new Set<string>(),assets=new Set<string>();
 for(const a of project.assets){if(!a.id||assets.has(a.id))throw new Error('Duplicate or empty asset ID');assets.add(a.id);}
 for(const n of project.nodes){if(!n.id||nodes.has(n.id))throw new Error('Duplicate or empty node ID');nodes.add(n.id);if(n.kind==='mesh'&&(!n.assetId||!assets.has(n.assetId)))throw new Error('Mesh node has no matching asset');}
 for(const n of project.nodes){let p=n.parentId;const seen=new Set([n.id]);while(p){if(!nodes.has(p)||seen.has(p))throw new Error('Invalid scene hierarchy');seen.add(p);p=project.nodes.find(x=>x.id===p)?.parentId;}}
 const id=await packageId(project.id);
 // Store merged exterior faces, not the potentially millions of source cells.
 // Shared assets are meshed once even if many scene nodes reference them.
 const meshes=project.assets.map(asset=>({id:asset.id,origin:asset.origin,voxelSize:asset.voxelSize,faces:generateMergedFaces(asset)}));
 const data=JSON.stringify({assets:meshes,nodes:project.nodes});
 const source=`import { createMeshBuilder } from '@forgeax/engine/geometry';
import { quat } from '@forgeax/engine/math';
import { AssetGuid } from '@forgeax/engine/pack/guid';
import { definePack, definePackageId } from '@forgeax/engine/pack/source';
import { Materials, MeshFilter, MeshRenderer } from '@forgeax/engine/render';
import { ChildOf, Name, Transform } from '@forgeax/engine/scene';
import { ok } from '@forgeax/engine/types';
const packageId = definePackageId(${JSON.stringify(id)});
const data = ${data} as { assets: { id:string; origin:number[]; voxelSize:number; faces:{origin:number[];u:number[];v:number[];normal:number[];color:string}[] }[]; nodes:any[] };
const key = (id:string) => Array.from(new TextEncoder().encode(id), x => x.toString(16).padStart(2,'0')).join('');
const guid = (s:string) => AssetGuid.format(AssetGuid.derive(packageId, s));
export default definePack({ schemaVersion:'2.0.0', packageId, name:${JSON.stringify(project.name)}, sceneComponents:[ChildOf,Name,Transform,MeshFilter,MeshRenderer], build() {
 const output:Record<string,any> = {};
 for(const asset of data.assets){
  const positions:number[]=[], normals:number[]=[], colors:number[]=[], indices:number[]=[];
  for(const face of asset.faces){
   const m=/^#([0-9a-f]{6})$/i.exec(face.color); if(!m) throw new Error('Expected #rrggbb voxel color');
   const rgb=[0,2,4].map(i=>parseInt(m[1]!.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
   const base=positions.length/3;for(const [a,b] of [[0,0],[1,0],[1,1],[0,1]]){for(let i=0;i<3;i++)positions.push(asset.origin[i]!+(face.origin[i]!+a!*face.u[i]!+b!*face.v[i]!)*asset.voxelSize);normals.push(...face.normal);colors.push(...rgb,1);}indices.push(base,base+1,base+2,base,base+2,base+3);
  }
  if(!positions.length) continue;
  const mesh=createMeshBuilder({attributes:{position:new Float32Array(positions),normal:new Float32Array(normals),color:new Float32Array(colors)},indices:new Uint32Array(indices)}).build(); if(!mesh.ok)return mesh; output['mesh/'+key(asset.id)]=mesh.value;
 }
 output['material/voxel']=Materials.standard({baseColor:[1,1,1,1],roughness:.85,metallic:0});
 const entities:Record<string,any>={};const nodes:readonly any[]=data.nodes;
 for(const n of nodes){const q=quat.fromEuler(quat.create(),...n.rotation.map((v:number)=>v*Math.PI/180) as [number,number,number],'XYZ');let visible=n.visible;let parent=n.parentId;while(parent){const p=nodes.find(x=>x.id===parent)!;visible=visible&&p.visible;parent=p.parentId;}
  const components:Record<string,any>={Name:{value:n.name},Transform:{pos:n.position,quat:Array.from(q),scale:n.scale}};if(n.parentId)components.ChildOf={parent:'n'+key(n.parentId)};
  if(n.kind==='mesh'&&visible&&(data.assets as readonly any[]).find(a=>a.id===n.assetId).faces.length){components.MeshFilter={assetHandle:guid('mesh/'+key(n.assetId))};components.MeshRenderer={materials:[guid('material/voxel')]};}
  entities['n'+key(n.id)]={components};
 }
 output['scene/main']={kind:'scene',entities};return ok(output);
}});
`;
 const metadata=JSON.stringify({format:'voxel-studio-forgeax',version:1,engine:'0.4.19',projectId:project.id,packageId:id,sceneSourceKey:'scene/main',nodes:project.nodes,assets:project.assets.map(({id,name,sourceId,resolution})=>({id,name,sourceId,resolution,sourceKey:'mesh/'+key(id)}))},null,2);
 return zip({'assets/voxel-studio.pack.ts':source,'voxel-studio.metadata.json':metadata,'README.txt':'Copy assets/voxel-studio.pack.ts into a ForgeAX 0.4.19 project assets directory. Run forgeax asset verify and inspect; load the scene/main GUID via the engine asset catalog. See metadata for node IDs, spawn/trigger tags, and original asset IDs. Spawn and trigger behavior must be implemented by the host game.\n'});
}
