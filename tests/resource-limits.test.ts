import {afterEach,describe,it,expect} from 'vitest';
import {DEFAULT_RESOURCE_LIMITS,normalizeResourceLimits,setResourceLimits,assertBudget} from '../src/core/resource-limits';
import {parseBinvox} from '../src/core/binvox';
import {generateMergedFaces} from '../src/core/voxel-surface';
import {importModel} from '../src/core/model-import';
import {encodeSourceFiles,decodeSourceFiles} from '../src/core/source-codec';
afterEach(()=>setResourceLimits(DEFAULT_RESOURCE_LIMITS));
describe('resource budgets',()=>{
 it('accepts zero as unlimited and rejects non-finite or invalid settings',()=>{
  expect(normalizeResourceLimits({modelTriangles:0}).modelTriangles).toBe(0);
  expect(()=>assertBudget(3000001,0,'model')).not.toThrow();
  for(const value of [-1,1.5,NaN,Infinity])expect(()=>normalizeResourceLimits({sourceBytes:value})).toThrow();
  expect(()=>normalizeResourceLimits({unknown:3} as never)).toThrow();
 });
 it('applies adjustable voxel occupancy and meshing budgets before runaway materialization',()=>{
  const head=new TextEncoder().encode('#binvox 1\ndim 2 1 1\ntranslate 0 0 0\nscale 2\ndata\n');
  const bytes=new Uint8Array([...head,1,2]);
  setResourceLimits({occupiedVoxels:1});expect(()=>parseBinvox(bytes)).toThrow(/预算/);
  setResourceLimits({occupiedVoxels:0,mergedQuads:5});const asset=parseBinvox(bytes);
  expect(()=>generateMergedFaces(asset)).toThrow(/预算/);
  setResourceLimits({mergedQuads:0});expect(generateMergedFaces(asset)).toHaveLength(6);
 });
 it('uses a configurable triangle count rather than a fixed three-million cap',async()=>{
  const file=new File(['v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nf 1 3 2\n'],'triangle.obj');
  setResourceLimits({modelTriangles:1});await expect(importModel([file])).rejects.toThrow(/三角面数/);
  setResourceLimits({modelTriangles:0});expect((await importModel([file])).obj).toContain('f 1 3 2');
 });
 it('propagates source-file budgets to compression and bounded decompression',async()=>{
  const file=new File(['source data'],'model.obj');
  setResourceLimits({sourceBytes:3});await expect(encodeSourceFiles([file])).rejects.toThrow(/预算/);
  setResourceLimits({sourceBytes:0});const encoded=await encodeSourceFiles([file]);
  expect(await (await decodeSourceFiles(encoded))[0].text()).toBe('source data');
  setResourceLimits({sourceBytes:3});await expect(decodeSourceFiles(encoded)).rejects.toThrow(/预算/);
 });
});
