import {setResourceLimits} from './resource-limits';
import { parseBinvox } from './binvox';
import { buildVoxelGeometry } from './mesh';
import type { MeshWorkerRequest, MeshWorkerResponse, MeshBuffers } from './worker-mesh';

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<MeshWorkerRequest>) => void;
  postMessage: (message: MeshWorkerResponse, transfer?: Transferable[]) => void;
};
scope.onmessage = event => {
  const request = event.data;
  try {
    setResourceLimits(request.limits);
    if (request.type === 'parse') {
      scope.postMessage({ id: request.id, result: parseBinvox(request.bytes, request.name) });
      return;
    }
    const geometry = buildVoxelGeometry(request.asset);
    const result: MeshBuffers = {
      positions: geometry.getAttribute('position').array as Float32Array,
      normals: geometry.getAttribute('normal').array as Float32Array,
      colors: geometry.getAttribute('color').array as Float32Array,
    };
    scope.postMessage({ id: request.id, result }, [result.positions.buffer, result.normals.buffer, result.colors.buffer] as ArrayBuffer[]);
    geometry.dispose();
  } catch (error) {
    scope.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) });
  }
};
