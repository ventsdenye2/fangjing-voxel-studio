import { describe, expect, it } from 'vitest';
import { Euler, Matrix4, Quaternion, Vector3, MathUtils } from 'three';
import { duplicateNodes, groupNodes, isEffectivelyLocked, removeNodes, ungroupNodes } from '../src/core/scene-ops';
import type { Project, SceneNode } from '../src/core/types';

const node=(id:string,overrides:Partial<SceneNode>={}):SceneNode=>({id,name:id,kind:'group',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,locked:false,tags:[],...overrides});
const project=(nodes:SceneNode[]):Project=>({schemaVersion:1,id:'test',name:'test',assets:[],nodes,sources:[],updatedAt:''});
function mat(n:SceneNode){return new Matrix4().compose(new Vector3(...n.position),new Quaternion().setFromEuler(new Euler(...n.rotation.map(MathUtils.degToRad) as [number,number,number])),new Vector3(...n.scale));}
describe('scene operations',()=>{
 it('copies the entire subtree once, with remapped parents and shared assets',()=>{const p=project([node('a'),node('b',{kind:'mesh',parentId:'a',assetId:'shared'}),node('c',{parentId:'b'})]);const ids=duplicateNodes(p,['a','b']);expect(ids).toHaveLength(1);expect(p.nodes).toHaveLength(6);const b=p.nodes.find(n=>n.parentId===ids[0])!;expect(b.assetId).toBe('shared');expect(p.nodes.some(n=>n.parentId===b.id)).toBe(true);});
 it('protects locked ancestry and locked descendants from deletion',()=>{const p=project([node('a',{locked:true}),node('b',{parentId:'a'}),node('c'),node('d',{parentId:'c',locked:true}),node('e')]);expect(isEffectivelyLocked(p,'b')).toBe(true);removeNodes(p,['a','b','c','e']);expect(p.nodes.map(n=>n.id)).toEqual(['a','b','c','d']);});
 it('groups root nodes without changing their local transforms',()=>{const p=project([node('a',{position:[2,3,4]}),node('b',{position:[-1,0,0]})]);const group=groupNodes(p,['a','b'])!;expect(group).toBeTruthy();expect(p.nodes[0].position).toEqual([2,3,4]);expect(p.nodes[0].parentId).toBe(group);});
 it('ungroups through a rotated uniformly scaled parent without moving children',()=>{const g=node('g',{position:[2,3,4],rotation:[10,45,0],scale:[2,2,2]}),c=node('c',{parentId:'g',position:[1,2,3],rotation:[0,25,5],scale:[1,2,1]});const before=mat(g).multiply(mat(c));const p=project([g,c]);expect(ungroupNodes(p,['g'])).toEqual(['c']);const after=mat(c);for(let i=0;i<16;i++)expect(after.elements[i]).toBeCloseTo(before.elements[i],5);expect(c.parentId).toBeUndefined();});
 it('keeps a group if ungrouping would introduce unrepresentable shear',()=>{const g=node('g',{scale:[2,1,1]}),c=node('c',{parentId:'g',rotation:[0,45,0]});const p=project([g,c]);expect(ungroupNodes(p,['g'])).toEqual([]);expect(p.nodes).toHaveLength(2);expect(c.parentId).toBe('g');});
});
