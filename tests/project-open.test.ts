import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {encodeProject,decodeProject} from '../src/core/archive';
import {createDemo} from '../src/core/demo';
const {projectArguments,readProjectFile}=createRequire(import.meta.url)('../desktop/project-open.cjs');
describe('OS project opening',()=>{
 it('handles Chinese/spaced paths and ignores executable/options',()=>{
  const cwd=path.resolve('fixture');
  expect(projectArguments(['studio.exe','--flag','庭院 11.19.VXLPROJ'],cwd)).toEqual([path.join(cwd,'庭院 11.19.VXLPROJ')]);
  expect(projectArguments(['electron.exe','app.cjs','a.vxlproj'],cwd,true)).toEqual([path.join(cwd,'a.vxlproj')]);
  expect(projectArguments(['studio.exe','--bad.vxlproj','a.exe'],cwd)).toEqual([]);
 });
 it('reads project contents and rejects invalid inputs',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'fangjing-open-'));
  try{
   const p=createDemo();p.name='保存的定制工程';p.nodes[0].position=[7,8,9];
   const file=path.join(dir,'工程11.19');await writeFile(file,encodeProject(p));
   expect(decodeProject((await readProjectFile(file,0)).data)).toEqual(p);
   await expect(readProjectFile(file,1)).rejects.toThrow('budget');
   await expect(readProjectFile(dir,0)).rejects.toThrow('文件夹');
   await writeFile(file,'not a project');await expect(readProjectFile(file,0)).rejects.toThrow('不是方境工程');
  }finally{await rm(dir,{recursive:true,force:true});}
 });
});