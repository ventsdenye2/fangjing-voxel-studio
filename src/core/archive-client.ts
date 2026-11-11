import type {Project} from './types';
import {getResourceLimits} from './resource-limits';
/** Transfers ownership of bytes to avoid another full archive copy on the UI thread. */
export function openProjectInBackground(bytes:Uint8Array,signal?:AbortSignal):Promise<Project> {
  return new Promise((resolve,reject)=>{
    signal?.throwIfAborted();
    const worker=new Worker(new URL('./archive-worker.ts',import.meta.url),{type:'module'});
    const clean=()=>{worker.terminate();signal?.removeEventListener('abort',abort);};
    const abort=()=>{clean();reject(new Error('打开工程已取消'));};
    worker.onmessage=e=>{clean();e.data.error?reject(new Error(e.data.error)):resolve(e.data.project);};
    worker.onerror=e=>{clean();reject(new Error(e.message||'后台读取工程失败'));};
    signal?.addEventListener('abort',abort,{once:true});
    try {worker.postMessage({bytes,limits:getResourceLimits()},[bytes.buffer]);} catch(e) {clean();reject(e);}
  });
}
