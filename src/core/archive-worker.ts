/// <reference lib="webworker" />
import {decodeProject} from './archive';
import {setResourceLimits,type ResourceLimits} from './resource-limits';
self.onmessage=(event:MessageEvent<{bytes:Uint8Array;limits:ResourceLimits}>)=>{
  try {
    setResourceLimits(event.data.limits);
    self.postMessage({project:decodeProject(event.data.bytes)});
  } catch(error) {
    self.postMessage({error:error instanceof Error?error.message:String(error)});
  }
};
