import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import type {Project} from '../src/core/types';
const project:Project={schemaVersion:1,id:'draft',name:'Scene',updatedAt:'',assets:[{id:'a',name:'A',dimensions:[1,1,1],origin:[0,0,0],voxelSize:1,cells:{'0,0,0':'#ffffff'}}],sources:[{id:'s',name:'source',files:[{name:'source.obj',data:btoa('model')}]}],nodes:[{id:'n',name:'N',kind:'mesh',assetId:'a',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,locked:false,tags:[]}]};
beforeEach(()=>{vi.resetModules();vi.stubGlobal('indexedDB',new IDBFactory());});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('incremental drafts',()=>{
 it('saves transforms without cloning unchanged source files and geometry again',async()=>{
  const {saveDraft,loadDraft}=await import('../src/core/autosave');
  await saveDraft(project);
  const writes:string[]=[];const original=IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(value,key){writes.push(this.name);return original.call(this,value,key);});
  const next={...project,nodes:project.nodes.map(n=>({...n,position:[4,0,0] as [number,number,number]}))};
  await saveDraft(next);
  expect(writes).toEqual(['draft']);
  expect(await loadDraft()).toEqual(next);
 });
 it('updates edited assets and removes stale records when changing projects',async()=>{
  const {saveDraft,loadDraft}=await import('../src/core/autosave');
  await saveDraft(project);
  const next={...project,id:'another',sources:[],assets:[{...project.assets[0],cells:{'0,0,0':'#ff0000'}}]};
  await saveDraft(next);
  expect(await loadDraft()).toEqual(next);
 });
 it('rolls back metadata and assets if any source cannot be persisted',async()=>{
  const {saveDraft,loadDraft}=await import('../src/core/autosave');
  await saveDraft(project);
  const bad={...project,name:'must not commit',assets:[{...project.assets[0],name:'changed'}],sources:[{...project.sources[0],files:[{name:'bad',data:()=>{}}]}]} as unknown as Project;
  await expect(saveDraft(bad)).rejects.toThrow();
  expect(await loadDraft()).toEqual(project);
 });
 it('migrates a legacy one-record draft without losing resources',async()=>{
  await new Promise<void>((resolve,reject)=>{
   const req=indexedDB.open('fangjing-studio',1);
   req.onupgradeneeded=()=>req.result.createObjectStore('draft');req.onerror=()=>reject(req.error);
   req.onsuccess=()=>{const db=req.result;const tx=db.transaction('draft','readwrite');tx.objectStore('draft').put(project,'current');tx.oncomplete=()=>{db.close();resolve();};};
  });
  const {saveDraft,loadDraft}=await import('../src/core/autosave');
  const old=await loadDraft();expect(old).toEqual(project);
  await saveDraft(old!);expect(await loadDraft()).toEqual(project);
 });
 it('keeps the latest rapid edit after an in-flight save',async()=>{
  const {saveDraft,loadDraft}=await import('../src/core/autosave');
  const a=saveDraft(project);const b=saveDraft({...project,name:'second'});const c=saveDraft({...project,name:'latest'});
  await Promise.all([a,b,c]);expect((await loadDraft())?.name).toBe('latest');
 });
});
