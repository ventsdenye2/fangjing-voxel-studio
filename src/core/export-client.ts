import {getResourceLimits} from './resource-limits';
import type {Project} from './types';
export function exportInBackground(project:Project,kind:'forgeax'|'glb'|'project',signal?:AbortSignal):Promise<Uint8Array>{
  return new Promise((resolve,reject)=>{
    signal?.throwIfAborted();
    const worker=new Worker(new URL('./export-worker.ts',import.meta.url),{type:'module'});
    const clean=()=>{worker.terminate();signal?.removeEventListener('abort',abort);};
    const abort=()=>{clean();reject(new Error('导出已取消'));};
    worker.onmessage=e=>{clean();e.data.error?reject(new Error(e.data.error)):resolve(e.data.bytes);};
    worker.onerror=e=>{clean();reject(new Error(e.message||'后台导出失败'));};
    signal?.addEventListener('abort',abort,{once:true});
    const payload=kind==='project'?project:{...project,sources:project.sources.map(({id,name})=>({id,name,files:[]}))};
    try{worker.postMessage({project:payload,kind,limits:getResourceLimits()});}catch(e){clean();reject(e);}
  });
}
