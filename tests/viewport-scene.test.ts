import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {buildProjectScene} from '../src/core/mesh';
import {buildViewportScene} from '../src/core/viewport-scene';
import type {Project, SceneNode, VoxelAsset} from '../src/core/types';

const asset: VoxelAsset = {id:'prop',name:'Prop',dimensions:[1,1,1],voxelSize:1,origin:[0,0,0],cells:{'0,0,0':'#ffffff'}};
const node = (id:string, overrides:Partial<SceneNode> = {}):SceneNode => ({id,name:id,kind:'mesh',assetId:asset.id,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,locked:false,tags:[],...overrides});
const project = (nodes:SceneNode[], assets = [asset]):Project => ({schemaVersion:1,id:'test',name:'Test',assets,nodes,sources:[],updatedAt:''});
const byId = (root:THREE.Object3D, id:string) => {
  let found:THREE.Object3D | undefined;
  root.traverse(object => {if (object.userData.nodeId === id) found = object;});
  return found!;
};
const batches = (root:THREE.Object3D) => {
  const result:THREE.InstancedMesh[] = [];
  root.traverse(object => {if (object instanceof THREE.InstancedMesh) result.push(object);});
  return result;
};
const expectMatrix = (actual:THREE.Matrix4, expected:THREE.Matrix4) => actual.elements.forEach((value,i) => expect(value).toBeCloseTo(expected.elements[i],8));

describe('viewport instance batches', () => {
  it('preserves nested world transforms and hierarchy when parent and child meshes are replaced', () => {
    const p = project([
      node('group',{kind:'group',assetId:undefined,position:[10,0,2],rotation:[0,30,0],scale:[2,1,3]}),
      node('parent',{parentId:'group',position:[1,2,3],rotation:[15,0,0]}),
      node('child',{parentId:'parent',position:[4,0,-2],rotation:[0,0,40]}),
      node('marker',{kind:'spawn',assetId:undefined,parentId:'child',position:[0,1,0]}),
    ]);
    const geometry = new THREE.BoxGeometry();
    const original = buildProjectScene(p,()=>geometry,true);
    original.updateMatrixWorld(true);
    const root = buildViewportScene(p,()=>geometry,[]);
    root.updateMatrixWorld(true);
    const batch = batches(root)[0];
    expect(batch.count).toBe(2);
    expect(batch.geometry).toBe(geometry);
    const matrix = new THREE.Matrix4();
    for (const [index,id] of ['parent','child'].entries()) {
      batch.getMatrixAt(index,matrix);
      // Instance storage uses float32 matrices.
      matrix.elements.forEach((value,i) => expect(value).toBeCloseTo(byId(original,id).matrixWorld.elements[i],5));
      expect(byId(root,id)).toBeInstanceOf(THREE.Group);
      expectMatrix(byId(root,id).matrixWorld,byId(original,id).matrixWorld);
    }
    expect(byId(root,'child').parent).toBe(byId(root,'parent'));
    expect(byId(root,'marker').parent).toBe(byId(root,'child'));
    expectMatrix(byId(root,'marker').matrixWorld,byId(original,'marker').matrixWorld);
    expect(batch.boundingBox!.isEmpty()).toBe(false);
    expect(batch.boundingSphere!.radius).toBeGreaterThan(0);
  });

  it('keeps the selected branch individual so a live gizmo moves its descendants', () => {
    const root = buildViewportScene(project([
      node('selected',{position:[2,0,0]}),node('child',{parentId:'selected',position:[3,0,0]}),
      node('a'),node('b',{position:[8,0,0]}),
    ]),()=>new THREE.BoxGeometry(),['selected']);
    const selected = byId(root,'selected'), child = byId(root,'child');
    expect(selected).toBeInstanceOf(THREE.Mesh);
    expect(child).toBeInstanceOf(THREE.Mesh);
    expect(batches(root)[0].userData.instanceNodeIds).toEqual(['a','b']);
    selected.position.x = 12;
    root.updateMatrixWorld(true);
    expect(child.getWorldPosition(new THREE.Vector3()).x).toBe(15);
  });

  it('skips hidden ancestor geometry and resolves only assets used visibly', () => {
    const hiddenAsset = {...asset,id:'hidden-asset'};
    const resolved:string[] = [];
    const root = buildViewportScene(project([
      node('hidden',{kind:'group',assetId:undefined,visible:false}),
      node('hidden-child',{parentId:'hidden',assetId:hiddenAsset.id}),
      node('hidden-self',{visible:false}),node('a'),node('b'),
    ],[asset,hiddenAsset]),a=>{resolved.push(a.id);return new THREE.BoxGeometry();},[]);
    expect(resolved).toEqual([asset.id]);
    expect(byId(root,'hidden-child')).toBeInstanceOf(THREE.Group);
    expect(byId(root,'hidden-self')).toBeInstanceOf(THREE.Group);
    expect(batches(root)[0].userData.instanceNodeIds).toEqual(['a','b']);
  });

  it('keeps mirrored world transforms individual, including mirrored ancestry', () => {
    const root = buildViewportScene(project([
      node('mirror',{scale:[-1,1,1]}),node('mirror-child',{parentId:'mirror'}),
      node('double-mirror',{parentId:'mirror',scale:[-1,1,1]}),node('plain'),
    ]),()=>new THREE.BoxGeometry(),[]);
    expect(byId(root,'mirror')).toBeInstanceOf(THREE.Mesh);
    expect(byId(root,'mirror-child')).toBeInstanceOf(THREE.Mesh);
    expect(batches(root)[0].userData.instanceNodeIds).toEqual(['double-mirror','plain']);
  });

  it('provides stable instance picking IDs and shares each asset geometry and material', () => {
    const geometry = new THREE.BoxGeometry();
    let calls = 0;
    const root = buildViewportScene(project([node('a'),node('selected'),node('b')]),()=>{calls++;return geometry;},['selected']);
    const batch = batches(root)[0];
    expect(calls).toBe(1);
    expect(batch.userData.nodeId).toBeUndefined();
    expect(batch.userData.instanceNodeIds).toEqual(['a','b']);
    expect(batch.geometry).toBe((byId(root,'selected') as THREE.Mesh).geometry);
    expect(batch.material).toBe((byId(root,'selected') as THREE.Mesh).material);
    const hit = new THREE.Raycaster(new THREE.Vector3(0,0,5),new THREE.Vector3(0,0,-1)).intersectObject(batch)[0];
    expect(batch.userData.instanceNodeIds[hit.instanceId!]).toBe('a');
  });

  it('leaves singleton meshes and empty geometry unbatched', () => {
    const single = buildViewportScene(project([node('one')]),()=>new THREE.BoxGeometry(),[]);
    expect(byId(single,'one')).toBeInstanceOf(THREE.Mesh);
    expect(batches(single)).toHaveLength(0);
    const empty = buildViewportScene(project([node('a'),node('b')]),()=>new THREE.BufferGeometry(),[]);
    expect(batches(empty)).toHaveLength(0);
  });
});
