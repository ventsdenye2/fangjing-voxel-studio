import { Euler, Matrix4, Quaternion, Vector3, MathUtils } from 'three';
import type { Project, SceneNode, Vec3 } from './types';

export function isEffectivelyLocked(project: Project, id: string): boolean {
 const map=new Map(project.nodes.map(n=>[n.id,n])); const seen=new Set<string>(); let n=map.get(id);
 while(n){if(n.locked||seen.has(n.id))return true;seen.add(n.id);n=n.parentId?map.get(n.parentId):undefined;}return false;
}
function selectedRoots(project:Project, ids:readonly string[]):SceneNode[]{
 const selected=new Set(ids), map=new Map(project.nodes.map(n=>[n.id,n]));
 return project.nodes.filter(n=>{if(!selected.has(n.id)||isEffectivelyLocked(project,n.id))return false;let p=n.parentId;const seen=new Set<string>();while(p&&!seen.has(p)){if(selected.has(p))return false;seen.add(p);p=map.get(p)?.parentId;}return true;});
}
function subtree(project:Project, root:string):SceneNode[]{const result:SceneNode[]=[],queue=[root],seen=new Set<string>();while(queue.length){const id=queue.shift()!;if(seen.has(id))continue;seen.add(id);const n=project.nodes.find(x=>x.id===id);if(n){result.push(n);for(const child of project.nodes)if(child.parentId===id)queue.push(child.id);}}return result;}

/** Duplicate complete selected subtrees; assets stay shared. */
export function duplicateNodes(project:Project,ids:readonly string[]):string[]{
 const roots=selectedRoots(project,ids), created:string[]=[];
 for(const root of roots){const nodes=subtree(project,root.id);if(nodes.some(n=>n.locked))continue;const mapping=new Map(nodes.map(n=>[n.id,crypto.randomUUID()]));for(const n of nodes){const copy=structuredClone(n);copy.id=mapping.get(n.id)!;copy.name=n.id===root.id?`${n.name} 副本`:n.name;if(n.parentId&&mapping.has(n.parentId))copy.parentId=mapping.get(n.parentId);project.nodes.push(copy);}created.push(mapping.get(root.id)!);}
 return created;
}
/** A subtree containing a locked node is kept intact. */
export function removeNodes(project:Project,ids:readonly string[]):void{
 const remove=new Set<string>();for(const root of selectedRoots(project,ids)){const nodes=subtree(project,root.id);if(nodes.some(n=>n.locked))continue;for(const n of nodes)remove.add(n.id);}project.nodes=project.nodes.filter(n=>!remove.has(n.id));
}
/** Group unlocked root nodes under an identity transform, preserving world transforms. */
export function groupNodes(project:Project,ids:readonly string[]):string|undefined{
 const roots=selectedRoots(project,ids).filter(n=>!n.parentId);if(roots.length<2)return undefined;
 const group:SceneNode={id:crypto.randomUUID(),name:'组',kind:'group',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,locked:false,tags:[]};project.nodes.push(group);for(const n of roots)n.parentId=group.id;return group.id;
}
function matrix(n:SceneNode):Matrix4{const r=new Euler(...n.rotation.map(MathUtils.degToRad) as Vec3,'XYZ');return new Matrix4().compose(new Vector3(...n.position),new Quaternion().setFromEuler(r),new Vector3(...n.scale));}
/** Ungroup only when the composed transforms are representable without shear. */
export function ungroupNodes(project:Project,ids:readonly string[]):string[]{
 const moved:string[]=[];
 for(const group of selectedRoots(project,ids)){if(group.kind!=='group')continue;const children=project.nodes.filter(n=>n.parentId===group.id);if(children.some(n=>n.locked))continue;
  const transforms=children.map(n=>{const m=matrix(group).multiply(matrix(n)),pos=new Vector3(),q=new Quaternion(),scale=new Vector3();m.decompose(pos,q,scale);const recomposed=new Matrix4().compose(pos,q,scale);if(m.elements.some((v,i)=>Math.abs(v-recomposed.elements[i])>1e-5))return undefined;const e=new Euler().setFromQuaternion(q,'XYZ');return {n,position:pos.toArray() as Vec3,rotation:[e.x,e.y,e.z].map(MathUtils.radToDeg) as Vec3,scale:scale.toArray() as Vec3};});
  if(transforms.some(x=>!x))continue;for(const t of transforms){if(!t)continue;t.n.position=t.position;t.n.rotation=t.rotation;t.n.scale=t.scale;if(group.parentId)t.n.parentId=group.parentId;else delete t.n.parentId;moved.push(t.n.id);}project.nodes=project.nodes.filter(n=>n.id!==group.id);
 }return moved;
}
