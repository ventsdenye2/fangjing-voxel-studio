import {describe,it,expect} from 'vitest';
import {geometryOnlyObj,trianglesToObj} from '../src/core/obj-geometry';
import {importModel} from '../src/core/model-import';
import {Vector3} from 'three';
describe('compact conversion geometry',()=>{
 it('keeps shared indices and drops colors, normals and external directives',()=>{
 const input='mtllib x.mtl\nv 0 0 0 1 0 0\nv 1 0 0 0 1 0\nv 0 1 0 0 0 1\nvn 0 0 1\nf 1//1 2//1 3//1 # triangle\nf -3 -2 -1\n';
 expect(geometryOnlyObj(input)).toBe('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nf -3 -2 -1\n');
 });
 it('deduplicates generated triangle positions without changing face order',async()=>{
 const out=await trianglesToObj(new Float32Array([0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,-1,0,0]));
 expect(out.match(/^v /gm)).toHaveLength(4);expect(out.match(/^f .*$/gm)).toEqual(['f 1 2 3','f 1 3 4']);
 });
 it('rejects non-finite positions and malformed indices',()=>{
 expect(()=>geometryOnlyObj('v Infinity 0 0')).toThrow();expect(()=>geometryOnlyObj('f 0 1 2')).toThrow();
 });
 it('retains vertex colors through packed sampling buffers',async()=>{
 const model=await importModel([new File(['v 0 0 0 1 0 0\nv 1 0 0 0 1 0\nv 0 1 0 0 0 1\nf 1 2 3\n'],'colored.obj')]);
 expect(model.sampleColor(new Vector3(0,0,0))).toBe('#ff0000');
 expect(model.sampleColor(new Vector3(1,0,0))).toBe('#00ff00');
 expect(model.sampleColor(new Vector3(0,1,0))).toBe('#0000ff');
 expect(model.source.files[0].encoding).toBe('gzip-base64');
 });
});
