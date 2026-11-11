import type {Project,VoxelAsset,ModelSource} from './types';
type Manifest={draftFormat:2;project:Omit<Project,'assets'|'sources'>;assetIds:string[];sourceIds:string[]};
let lastSaved:Project|undefined;
let pending:Project|undefined;
let active:Promise<void>|undefined;
function db():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 const req=indexedDB.open('fangjing-studio',2);
 req.onupgradeneeded=()=>{for(const name of ['draft','assets','sources'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name);};
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 req.onblocked=()=>reject(new Error('草稿数据库被另一窗口占用，请关闭重复程序'));
});}
const request=<T>(req:IDBRequest<T>):Promise<T>=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
/** Commit metadata and changed immutable assets/sources atomically. */
async function writeDraft(project:Project):Promise<void>{
 const database=await db();
 try{await new Promise<void>((resolve,reject)=>{
  const tx=database.transaction(['draft','assets','sources'],'readwrite');
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('草稿写入已中止'));
  try {
  const {assets,sources,...metadata}=project;
  const manifest:Manifest={draftFormat:2,project:metadata,assetIds:assets.map(a=>a.id),sourceIds:sources.map(s=>s.id)};
  tx.objectStore('draft').put(manifest,'current');
  const writeCollection=(name:'assets'|'sources',items:(VoxelAsset|ModelSource)[])=>{
   const store=tx.objectStore(name),ids=new Set(items.map(item=>item.id));
   const previous=new Map((lastSaved?.[name]??[]).map(item=>[item.id,item]));
   const keys=store.getAllKeys();keys.onsuccess=()=>{for(const key of keys.result)if(!ids.has(String(key)))store.delete(key);};
   for(const item of items)if(previous.get(item.id)!==item)store.put(item,item.id);
  };
  writeCollection('assets',assets);writeCollection('sources',sources);
  } catch(error) {tx.abort();reject(error);}
 });lastSaved=project;}finally{database.close();}
}
export function saveDraft(project:Project):Promise<void>{
 // Coalesce fast transformations to the newest pending snapshot.
 pending=project;
 active??=(async()=>{while(pending){const next=pending;pending=undefined;await writeDraft(next);}})().finally(()=>{active=undefined;});
 return active;
}
export async function loadDraft():Promise<Project|undefined>{
 const database=await db();
 try{
  const tx=database.transaction(['draft','assets','sources'],'readonly');
  // Queue all requests before awaiting so the transaction stays live.
  const current=request(tx.objectStore('draft').get('current')) as Promise<Manifest|Project|undefined>;
  const assets=request(tx.objectStore('assets').getAll()) as Promise<VoxelAsset[]>;
  const sources=request(tx.objectStore('sources').getAll()) as Promise<ModelSource[]>;
  const [saved,assetList,sourceList]=await Promise.all([current,assets,sources]);
  if(!saved)return;
  if(!('draftFormat' in saved))return saved;
  if(saved.draftFormat!==2)throw Error('草稿格式版本不受支持');
  const assetMap=new Map(assetList.map(a=>[a.id,a])),sourceMap=new Map(sourceList.map(s=>[s.id,s]));
  const project:Project={...saved.project,assets:saved.assetIds.map(id=>{const a=assetMap.get(id);if(!a)throw Error('草稿资产缺失');return a;}),sources:saved.sourceIds.map(id=>{const s=sourceMap.get(id);if(!s)throw Error('草稿源文件缺失');return s;})};
  lastSaved=project;return project;
 }finally{database.close();}
}
