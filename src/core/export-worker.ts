/// <reference lib="webworker" />
import {encodeProject,exportSceneGlb} from './archive';
import {exportForgeax} from './forgeax-export';
import type {Project} from './types';
import {setResourceLimits,type ResourceLimits} from './resource-limits';
self.onmessage=async(event:MessageEvent<{kind:'forgeax'|'glb'|'project';project:Project;limits:ResourceLimits}>)=>{
  try {
    const {kind,project}=event.data;
    setResourceLimits(event.data.limits);
    const bytes=kind==='forgeax'?await exportForgeax(project):kind==='glb'?new Uint8Array(await exportSceneGlb(project)):encodeProject(project);
    self.postMessage({bytes}, {transfer:[bytes.buffer]});
  }catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
