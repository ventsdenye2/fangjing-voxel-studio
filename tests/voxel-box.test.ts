import {describe,it,expect} from 'vitest';
import {produce} from 'immer';
import {Vector3} from 'three';
import {extractVoxelBox,countBoxCells,boxFromTransform} from '../src/core/voxel-box';
import {createEmpty} from '../src/core/demo';
import {buildProjectScene} from '../src/core/mesh';
import {encodeProject,decodeProject} from '../src/core/archive';
import {ProjectHistory} from '../src/core/history';
import type {Project,SceneNode,VoxelAsset} from '../src/core/types';
function fixture():Project{
 const p=createEmpty();
 const a:VoxelAsset={id:'a',name:'original',origin:[-2,1,3],dimensions:[4,4,4],voxelSize:.25,cells:{}};
 for(let x=0;x<4;x++)for(let y=0;y<4;y++)for(let z=0;z<4;z++)a.cells[[x,y,z].join(',')]=y<2?'#ff0000':'#00ff00';
 const n:SceneNode={id:'n',name:'object',kind:'mesh',assetId:'a',position:[3,4,5],rotation:[20,70,-30],scale:[2,3,.5],visible:true,locked:false,tags:['tag']};
 p.assets=[a];p.nodes=[n,{...structuredClone(n),id:'other'}];return p;
}
const upper={min:[0,2,0] as [number,number,number],max:[4,4,4] as [number,number,number]};
function points(p:Project,id:string){
 const node=p.nodes.find(n=>n.id===id)!,asset=p.assets.find(a=>a.id===node.assetId)!;
 const root=buildProjectScene(p);root.updateMatrixWorld(true);let object:any;root.traverse(o=>{if(o.userData.nodeId===id)object=o;});
 return Object.entries(asset.cells).map(([key,color])=>{const xyz=key.split(',').map(Number);return color+':'+new Vector3(...xyz.map((n,i)=>asset.origin[i]+(n+.5)*asset.voxelSize) as [number,number,number]).applyMatrix4(object.matrixWorld).toArray().map(v=>v.toFixed(6)).join(',');}).sort();
}
describe('3D box extraction',()=>{
 it('cuts only the current instance and makes a reusable cropped asset',()=>{
  const p=fixture(),original=structuredClone(p.assets[0]);const r=extractVoxelBox(p,'n',upper);
  expect(r.count).toBe(32);expect(p.assets.find(a=>a.id==='a')).toEqual(original);expect(p.nodes.find(n=>n.id==='other')!.assetId).toBe('a');
  expect(p.assets.find(a=>a.id===p.nodes[0].assetId)!.cells).toHaveProperty('0,0,0');expect(Object.keys(p.assets.find(a=>a.id===p.nodes[0].assetId)!.cells)).toHaveLength(32);
  const part=p.assets.find(a=>a.id===p.nodes.find(n=>n.id===r.nodeId)!.assetId)!;
  expect(part.dimensions).toEqual([4,2,4]);expect(part.instanceOnly).toBeUndefined();expect(part.sourceId).toBeUndefined();
  expect(countBoxCells(original,upper)).toBe(32);
 });
 it('preserves world-space voxel positions with rotation, nonuniform scaling and a parent',()=>{
  const p=fixture();p.nodes.push({id:'group',name:'group',kind:'group',position:[10,-4,7],rotation:[45,15,25],scale:[.5,2,1.5],visible:true,locked:false,tags:[]});p.nodes[0].parentId='group';
  const before=points(p,'n');const r=extractVoxelBox(p,'n',upper);
  expect([...points(p,'n'),...points(p,r.nodeId)].sort()).toEqual(before);
  expect(p.nodes.find(n=>n.id===r.nodeId)!.parentId).toBe('group');
 });
 it('copies without modifying the source or linking the new asset to its prefab',()=>{
  const p=fixture(),source=structuredClone(p.nodes[0]),asset=structuredClone(p.assets[0]);const r=extractVoxelBox(p,'n',upper,true);
  expect(p.nodes[0]).toEqual(source);expect(p.assets[0]).toEqual(asset);expect(p.assets).toHaveLength(2);
  expect(points(p,r.nodeId)).toEqual(points(p,'n').filter(x=>x.startsWith('#00ff00')));
 });
 it('undoes/redoes the entire split and round trips it through saved projects',()=>{
  const p=fixture(),history=new ProjectHistory();let id='';
  const next=produce(p,d=>{id=extractVoxelBox(d,'n',upper).nodeId;});history.push(p);
  const restored=decodeProject(encodeProject(next));expect(points(restored,id)).toEqual(points(next,id));
  expect(history.undo(next)).toEqual(p);expect(history.redo(p)).toEqual(next);
 });
 it('does not mutate on empty selection, invalid bounds, or inherited locks',()=>{
  for(const kind of ['empty','invalid','locked']){
   const p=fixture();if(kind==='locked'){p.nodes.push({id:'g',kind:'group',name:'locked',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,locked:true,tags:[]});p.nodes[0].parentId='g';}
   const before=structuredClone(p);const box=kind==='empty'?{min:[10,10,10],max:[11,11,11]}:kind==='invalid'?{min:[1,0,0],max:[0,1,1]}:upper;
   expect(()=>extractVoxelBox(p,'n',box as any)).toThrow();expect(p).toEqual(before);
  }
 });
 it('handles a full selection without losing geometry and keeps original children',()=>{
  const p=fixture();p.nodes.push({...structuredClone(p.nodes[1]),id:'child',parentId:'n'});const before=points(p,'n');
  const r=extractVoxelBox(p,'n',{min:[0,0,0],max:[4,4,4]});
  expect(points(p,r.nodeId)).toEqual(before);expect(points(p,'n')).toEqual([]);expect(p.nodes.find(n=>n.id==='child')!.parentId).toBe('n');
 });
 it('snaps local gizmo transforms to half-open voxel bounds with negative origins',()=>{
  const a=fixture().assets[0];expect(boxFromTransform(a,[-1.5,1.75,3.5],[1,.5,1])).toEqual(upper);
  expect(countBoxCells(a,{min:[0,1,0],max:[1,2,1]})).toBe(1);
 });
});
