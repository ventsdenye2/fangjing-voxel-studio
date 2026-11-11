import type {VoxelAsset} from './types';
const cache=new WeakMap<VoxelAsset['cells'],{count:number;firstColor:string}>();
export function assetStats(asset:VoxelAsset){let value=cache.get(asset.cells);if(!value){let count=0,firstColor='#a5e3bb';for(const key in asset.cells){if(count===0)firstColor=asset.cells[key];count++;}value={count,firstColor};cache.set(asset.cells,value);}return value;}
