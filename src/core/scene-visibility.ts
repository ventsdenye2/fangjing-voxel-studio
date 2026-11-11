import type {Project,SceneNode} from './types';
/** Memoized ancestor visibility, without a per-node scan of the whole scene. */
export function sceneVisibility(project:Pick<Project,'nodes'>):Map<string,boolean>{
  const nodes=new Map(project.nodes.map(n=>[n.id,n])),result=new Map<string,boolean>();
  for(const node of project.nodes){
    const chain:SceneNode[]=[],visiting=new Set<string>();let current:SceneNode|undefined=node;
    while(current&&!result.has(current.id)){
      if(visiting.has(current.id))throw Error('场景层级存在循环');
      visiting.add(current.id);chain.push(current);
      current=current.parentId?nodes.get(current.parentId):undefined;
    }
    let visible=current?result.get(current.id)!:true;
    for(let i=chain.length-1;i>=0;i--){visible=visible&&chain[i].visible;result.set(chain[i].id,visible);}
  }
  return result;
}
export function visibleAssetIds(project:Project):Set<string>{
  const visible=sceneVisibility(project);
  return new Set(project.nodes.filter(n=>n.kind==='mesh'&&n.assetId&&visible.get(n.id)).map(n=>n.assetId!));
}
