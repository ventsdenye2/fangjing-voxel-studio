import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {faceCell,applyVoxelBrush} from '../src/core/voxel-brush';
import {buildVoxelGeometry} from '../src/core/mesh';
import {editVoxels} from '../src/core/voxel-edit';
import {encodeProject,decodeProject} from '../src/core/archive';
import {createEmpty} from '../src/core/demo';
import type {VoxelAsset,Vec3} from '../src/core/types';
const cube=():VoxelAsset=>({id:'a',name:'cube',dimensions:[1,1,1],origin:[-.5,0,-.5],voxelSize:1,cells:{'0,0,0':'#112233'}});
describe('face-adjacent voxel placement',()=>{
 it.each([0,1,2].flatMap(axis=>[-1,1].map(sign=>[axis,sign])))('places exactly one neighbour on axis %s side %s',(axis,sign)=>{
  const a=cube(),normal:Vec3=[0,0,0];normal[axis]=sign;
  const point=a.origin.map((v,i)=>v+(i===axis?(sign>0?1:0):.5)) as Vec3;
  const hit=faceCell(a,point,normal)!;expect(hit.cell).toEqual([0,0,0]);expect(hit.step).toEqual(normal);
  const patch=applyVoxelBrush(a,hit.cell,hit.step,'add','#ff0000',5)!;expect(Object.keys(patch.cells)).toHaveLength(2);
  const oldKey=Object.keys(patch.cells).find(k=>patch.cells[k]==='#112233')!.split(',').map(Number);
  expect(oldKey.map((n,i)=>patch.origin[i]+n*a.voxelSize)).toEqual(a.origin);
  const newKey=Object.keys(patch.cells).find(k=>patch.cells[k]==='#ff0000')!.split(',').map(Number);
  expect(newKey.map((n,i)=>n-oldKey[i])).toEqual(normal);
 });
 it('never recolors or overlaps an occupied neighbour',()=>{const a=cube();a.dimensions=[2,1,1];a.cells['1,0,0']='#abcdef';expect(applyVoxelBrush(a,[0,0,0],[1,0,0],'add','#ff0000',1)).toBeNull();expect(a.cells['1,0,0']).toBe('#abcdef');});
 it('resolves the clicked small voxel on a merged face, including boundary ties',()=>{const a=cube();a.dimensions=[3,1,1];a.cells={'0,0,0':'#112233','1,0,0':'#112233','2,0,0':'#112233'};expect(faceCell(a,[1.8,1,0],[0,1,0])?.cell).toEqual([2,0,0]);expect(faceCell(a,[2.5,1,.5],[0,1,0])?.cell).toEqual([2,0,0]);expect(faceCell(a,[8,1,0],[0,1,0])).toBeNull();});
 it('uses mesh local faces after hierarchy rotation and scaling',()=>{const a=cube(),mesh=new T.Mesh(buildVoxelGeometry(a),new T.MeshBasicMaterial()),group=new T.Group();group.add(mesh);group.position.set(4,2,-3);group.rotation.set(.3,.8,-.2);group.scale.set(2,3,1.5);mesh.rotation.y=.4;group.updateMatrixWorld(true);
  for(const normal of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]] as Vec3[]){const local=new T.Vector3(0,.5,0).addScaledVector(new T.Vector3(...normal),.5);const surface=mesh.localToWorld(local.clone());const direction=new T.Vector3(...normal).applyMatrix3(new T.Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize();const hit=new T.Raycaster(surface.clone().addScaledVector(direction,3),direction.clone().negate()).intersectObject(mesh)[0];expect(hit).toBeDefined();const cell=faceCell(a,mesh.worldToLocal(hit.point.clone()).toArray() as Vec3,hit.face!.normal.toArray() as Vec3)!;expect(cell.step).toEqual(normal);expect(cell.cell).toEqual([0,0,0]);}
  mesh.geometry.dispose();mesh.material.dispose();
 });
 it('preserves expanded local bounds and instance isolation through save/open',()=>{const p=createEmpty(),a=cube();p.assets=[a];p.nodes=[{id:'n',name:'cube',assetId:'a',kind:'mesh',position:[3,0,0],rotation:[0,90,0],scale:[2,2,2],visible:true,locked:false,tags:[]}];const patch=applyVoxelBrush(a,[0,0,0],[-1,0,0],'add','#ff0000',1)!;editVoxels(p,'n','scene',patch.cells,patch);const saved=decodeProject(encodeProject(p));expect(saved.assets[0]).toEqual(a);expect(saved.assets[1].origin).toEqual([-1.5,0,-.5]);expect(saved.assets[1].dimensions).toEqual([2,1,1]);expect(saved.nodes[0].position).toEqual([3,0,0]);expect(saved.nodes[0].prefabAssetId).toBe('a');});
 it('reports the grid limit without mutating the asset',()=>{const a=cube();a.dimensions=[512,1,1];a.cells={'511,0,0':'#112233'};expect(()=>applyVoxelBrush(a,[511,0,0],[1,0,0],'add','#ff0000',1)).toThrow('512');expect(a.cells).toEqual({'511,0,0':'#112233'});});
});
