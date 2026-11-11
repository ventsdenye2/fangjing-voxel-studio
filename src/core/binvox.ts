import type { VoxelAsset } from './types';
import {DEFAULT_RESOURCE_LIMITS,getResourceLimits,assertBudget} from './resource-limits';

// Sparse records remain practical for surface grids at 512³. Dense grids need a
// different storage representation, so reject them before allocating cell keys.
export const MAX_OCCUPIED_VOXELS = DEFAULT_RESOURCE_LIMITS.occupiedVoxels;

export function parseBinvox(input: ArrayBuffer | Uint8Array, name = 'Voxel model'): VoxelAsset {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const limit = getResourceLimits().occupiedVoxels;
  let offset = 0;
  function line(): string {
    const start = offset;
    while (offset < bytes.length && bytes[offset] !== 10) offset++;
    if (offset === bytes.length) throw new Error('Truncated binvox header');
    return new TextDecoder().decode(bytes.subarray(start, offset++)).trim();
  }
  if (!/^#binvox [12]$/.test(line())) throw new Error('Invalid binvox signature');
  let dimensions: number[] | undefined;
  let origin = [0, 0, 0];
  let scale = 1;
  let foundData = false;
  for (let count = 0; count < 100; count++) {
    const text = line();
    if (text === 'data') {
      foundData = true;
      break;
    }
    const [key, ...parts] = text.split(/\s+/);
    const values = parts.map(Number);
    if (key === 'dim') {
      if (values.length !== 3 || values.some(n => !Number.isSafeInteger(n) || n < 1 || n > 512)) throw new Error('Invalid dimensions');
      dimensions = values;
    } else if (key === 'translate') {
      if (values.length !== 3 || values.some(n => !Number.isFinite(n))) throw new Error('Invalid translation');
      origin = values;
    } else if (key === 'scale') {
      if (values.length !== 1 || !Number.isFinite(values[0]) || values[0] <= 0) throw new Error('Invalid scale');
      scale = values[0];
    }
  }
  if (!foundData || !dimensions) throw new Error('Missing binvox dimensions/data');
  const total = dimensions[0] * dimensions[1] * dimensions[2];
  const dataOffset = offset;
  let index = 0;
  let occupied = 0;
  // Validate the complete stream and its memory budget before materializing it.
  while (offset < bytes.length) {
    if (offset + 1 >= bytes.length) throw new Error('Truncated RLE');
    const value = bytes[offset++];
    const count = bytes[offset++];
    if (value > 1 || count === 0 || index + count > total) throw new Error('Invalid RLE');
    occupied += value * count;
    assertBudget(occupied, limit, '单个资产占用体素数');
    index += count;
  }
  if (index !== total) throw new Error('Incomplete RLE');
  const cells: Record<string, string> = {};
  index = 0;
  for (offset = dataOffset; offset < bytes.length; offset += 2) {
    const count = bytes[offset + 1];
    if (bytes[offset]) {
      for (let j = 0; j < count; j++) {
        const i = index + j;
        const y = i % dimensions[1];
        const z = Math.floor(i / dimensions[1]) % dimensions[2];
        const x = Math.floor(i / (dimensions[1] * dimensions[2]));
        cells[x + ',' + y + ',' + z] = '#b7c9e2';
      }
    }
    index += count;
  }
  return { id: crypto.randomUUID(), name, dimensions: dimensions as [number, number, number], origin: origin as [number, number, number], voxelSize: scale / Math.max(...dimensions), cells };
}
