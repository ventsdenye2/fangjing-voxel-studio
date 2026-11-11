import { describe, expect, it } from 'vitest';
import { exportForgeax } from '../src/core/forgeax-export';
import type { Project } from '../src/core/types';

const project: Project = {schemaVersion:1,id:'fixture',name:'测试',updatedAt:'',sources:[],assets:[{id:'shared',name:'block',dimensions:[1,1,1],origin:[0,0,0],voxelSize:1,cells:{'0,0,0':'#ff0000'}}],nodes:[{id:'group',name:'Group',kind:'group',position:[1,2,3],rotation:[0,0,0],scale:[1,1,1],visible:true,locked:false,tags:[]},{id:'mesh',name:'Block',kind:'mesh',assetId:'shared',parentId:'group',position:[0,0,0],rotation:[0,90,0],scale:[1,1,1],visible:true,locked:false,tags:[]}]};
function entries(zip: Uint8Array): Record<string,string> { const view=new DataView(zip.buffer,zip.byteOffset,zip.byteLength),dec=new TextDecoder(),out:Record<string,string>={};let i=0;while(view.getUint32(i,true)===0x04034b50){const size=view.getUint32(i+18,true),nl=view.getUint16(i+26,true),el=view.getUint16(i+28,true),name=dec.decode(zip.slice(i+30,i+30+nl)),start=i+30+nl+el;out[name]=dec.decode(zip.slice(start,start+size));i=start+size;}return out; }
describe('ForgeAX export',()=>{
 it('is deterministic and keeps a native scene and stable metadata',async()=>{const a=await exportForgeax(project),b=await exportForgeax(project);expect(a).toEqual(b);const files=entries(a);expect(files['assets/voxel-studio.pack.ts']).toContain("'scene/main'");expect(JSON.parse(files['voxel-studio.metadata.json']).nodes[1].parentId).toBe('group');});
 it('rejects cyclic hierarchies',async()=>{const broken=structuredClone(project);broken.nodes[0].parentId='mesh';await expect(exportForgeax(broken)).rejects.toThrow('Invalid scene hierarchy');});
});
