import type {Project,SceneNode} from './types';
import {isEffectivelyLocked} from './scene-ops';
export function editingAssetId(node:SceneNode|undefined,mode:'scene'|'voxel'){return mode==='voxel'?(node?.prefabAssetId??node?.assetId):node?.assetId;}
/** Scene edits detach automatically, retaining a link to the original prefab. */
export function editVoxels(project:Project,nodeId:string,mode:'scene'|'voxel',cells:Record<string,string>):boolean{
 const node=project.nodes.find(n=>n.id===nodeId);if(!node||isEffectivelyLocked(project,nodeId))return false;
 const asset=project.assets.find(a=>a.id===editingAssetId(node,mode));if(!asset)return false;
 if(Object.keys(asset.cells).length===Object.keys(cells).length&&Object.keys(cells).every(k=>cells[k]===asset.cells[k]))return false;
 if(mode==='voxel'){asset.cells=cells;return true;}
 // Never edit the prefab in place, even if this is its only scene instance.
 if(!node.prefabAssetId||project.nodes.some(n=>n.id!==node.id&&n.assetId===asset.id)){
  const copy={...asset,id:crypto.randomUUID(),name:node.name+' · 场景独立模型',instanceOnly:true,cells};
  node.prefabAssetId??=asset.id;node.assetId=copy.id;project.assets.push(copy);
 }else asset.cells=cells;
 return true;
}
