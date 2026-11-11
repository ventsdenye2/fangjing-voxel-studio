// Run from voxel-studio with a local tsx and the ForgeAX 0.4.19 project installed.
// Writes a dedicated fixture under the engine project's artifacts directory so
// Node resolves its installed dependencies without touching its assets or roots.
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { exportForgeax } from '../src/core/forgeax-export.ts';
const engineProject=resolve(process.env.FORGEAX_PROJECT || '../forgeax-game');
const fixture=resolve(engineProject,'artifacts/voxel-import-validation');
await mkdir(resolve(fixture,'assets'),{recursive:true});
process.env.FORGEAX_HISTORY_DIR=resolve(fixture,'.history');
await writeFile(resolve(fixture,'package.json'),JSON.stringify({name:'voxel-studio-fixture',private:true,type:'module',dependencies:{'@forgeax/engine':'0.4.19'}}));
await writeFile(resolve(fixture,'forge.json'),JSON.stringify({id:'voxel-fixture',name:'Voxel fixture',schemaVersion:'3.0.0',roots:{}}));
const project={schemaVersion:1,id:'fixture',name:'Fixture',updatedAt:'',sources:[],assets:[{id:'block',name:'Block',dimensions:[1,1,1],origin:[0,0,0],voxelSize:1,cells:{'0,0,0':'#ff0000'}}],nodes:[{id:'root',name:'Root',kind:'group',position:[1,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,locked:false,tags:[]},{id:'block',name:'Block',kind:'mesh',assetId:'block',parentId:'root',position:[0,0,0],rotation:[0,45,0],scale:[1,1,1],visible:true,locked:false,tags:[]}]};
const bytes=await exportForgeax(project),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),dec=new TextDecoder();let i=0;
while(view.getUint32(i,true)===0x04034b50){const size=view.getUint32(i+18,true),nl=view.getUint16(i+26,true),el=view.getUint16(i+28,true),name=dec.decode(bytes.slice(i+30,i+30+nl)),start=i+30+nl+el;if(name==='assets/voxel-studio.pack.ts')await writeFile(resolve(fixture,name),bytes.slice(start,start+size));i=start+size;}
const cli=resolve(engineProject,'node_modules/@forgeax/engine/dist/bin/forgeax.mjs');
for(const args of [['project','build'],['asset','inspect','assets/voxel-studio.pack.ts','--detail'],['asset','verify','--detail']]) console.log(execFileSync(process.execPath,[cli,...args,'--root',fixture,'--json'],{encoding:'utf8'}));
