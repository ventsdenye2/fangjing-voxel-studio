import {useMemo} from 'react';
import {countBoxCells,initialVoxelBox,type BoxSelection} from '../core/voxel-box';
import type {VoxelAsset,Vec3} from '../core/types';
export default function BoxSelectionPanel({asset,value,onChange,onExtract,onClose}:{asset:VoxelAsset;value:BoxSelection;onChange:(value:BoxSelection)=>void;onExtract:(copy:boolean)=>void;onClose:()=>void}){
 const count=useMemo(()=>countBoxCells(asset,value.bounds),[asset,value.bounds]);
 const change=(kind:'min'|'size',axis:number,n:number)=>{
  if(!Number.isFinite(n))return;n=Math.round(n);
  const min=[...value.bounds.min] as Vec3,size=value.bounds.max.map((v,i)=>v-min[i]) as Vec3;
  if(kind==='min')min[axis]=Math.max(-512,Math.min(512,n));else size[axis]=Math.max(1,Math.min(512,n));
  onChange({...value,bounds:{min,max:min.map((v,i)=>v+size[i]) as Vec3}});
 };
 return <section className="inspector-section box-selection-panel" aria-label="3D 框选拆分">
  <h3>3D 框选拆分</h3><p className="muted">按住左键拖动彩色控制轴，松开即停止；左键不会移动镜头。右键旋转视角，滚轮缩放。也可在下方输入选框范围，只处理当前物件。</p>
  <div className="button-row"><button className={value.tool==='translate'?'active':''} onClick={()=>onChange({...value,tool:'translate'})}>移动选框</button><button className={value.tool==='scale'?'active':''} onClick={()=>onChange({...value,tool:'scale'})}>缩放选框</button></div>
  {(['min','size'] as const).map(kind=><div key={kind} className="transform-field"><span>{kind==='min'?'起点（格）':'尺寸（格）'}</span><div>{['X','Y','Z'].map((axis,i)=><label key={axis}><small>{axis}</small><input type="number" step={1} aria-label={'选框'+(kind==='min'?'起点':'尺寸')+' '+axis} value={kind==='min'?value.bounds.min[i]:value.bounds.max[i]-value.bounds.min[i]} onChange={e=>change(kind,i,Number(e.target.value))}/></label>)}</div></div>)}
  <div className="button-row"><button onClick={()=>onChange({...value,bounds:{min:[0,0,0],max:[...asset.dimensions]}})}>框选整个模型</button><button onClick={()=>onChange({...value,bounds:initialVoxelBox(asset)})}>重置为上半部</button></div>
  <p role="status" aria-label="框选体素数量">已框选 {count.toLocaleString()} 个体素</p>
  <button className="wide primary" disabled={!count} onClick={()=>onExtract(false)}>拆分为独立模型</button>
  <button className="wide" disabled={!count} onClick={()=>onExtract(true)}>复制为独立模型</button>
  <button className="wide" onClick={onClose}>退出框选</button>
  <p className="muted">拆分会从当前物件移走框内体素；复制会保留原物件。新模型加入资产库并保持原位置，支持撤销。选中全部时，原物件会变空。</p>
 </section>;
}
