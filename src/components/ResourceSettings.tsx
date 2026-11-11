import {useState} from 'react';
import {DEFAULT_RESOURCE_LIMITS,normalizeResourceLimits,type ResourceLimits} from '../core/resource-limits';

const fields: {key:keyof ResourceLimits;label:string;unit:string;scale:number}[] = [
  {key:'projectBytes',label:'工程与导出文件预算',unit:'MiB',scale:1024**2},
  {key:'sourceBytes',label:'单次导入的模型与贴图预算',unit:'MiB',scale:1024**2},
  {key:'conversionBytes',label:'转换几何文本预算',unit:'MiB',scale:1024**2},
  {key:'occupiedVoxels',label:'单个资产的占用体素预算',unit:'万个',scale:10000},
  {key:'mergedQuads',label:'单个资产的合并表面预算',unit:'万个',scale:10000},
  {key:'modelTriangles',label:'单个源模型的三角面预算',unit:'万个',scale:10000},
  {key:'conversionTimeoutMs',label:'转换自动停止时限',unit:'分钟',scale:60000},
];
export default function ResourceSettings({value,onSave}:{value:ResourceLimits;onSave:(value:ResourceLimits)=>Promise<void>}) {
  const toForm=(v:ResourceLimits)=>Object.fromEntries(fields.map(f=>[f.key,String(v[f.key]/f.scale)])) as Record<keyof ResourceLimits,string>;
  const [form,setForm]=useState(()=>toForm(value)),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
  const save=async()=>{
    setSaving(true);setMessage('');
    try {
      const limits=normalizeResourceLimits(Object.fromEntries(fields.map(f=>{
        if(!form[f.key].trim())throw Error('请填写所有预算；填 0 表示不设应用上限。');
        return [f.key,Number(form[f.key])*f.scale];
      })));
      await onSave(limits);setMessage('已应用到本机；后续导入、转换和导出使用新预算。');
    } catch(e) {setMessage(e instanceof Error?e.message:String(e));}
    finally {setSaving(false);}
  };
  return <details className="resource-settings" open>
    <summary>容量与性能</summary>
    <p>资产和物件数量不设固定上限。以下预算可按机器调整，填 0 表示不设应用上限；仍受可用内存、显存和文件格式约束。工程预算同时检查文件大小和展开数据量。</p>
    <div className="resource-fields">{fields.map(f=><label key={f.key}><span>{f.label}</span><div><input aria-label={f.label} type="number" min="0" step="any" value={form[f.key]} onChange={e=>setForm({...form,[f.key]:e.target.value})}/><small>{f.unit}</small></div></label>)}</div>
    <p>调高体素和表面预算会增加内存、显存占用。默认不限制源模型面数，也不自动中断长时间转换，可手动取消。</p>
    <div className="button-row"><button disabled={saving} onClick={()=>{setForm(toForm(DEFAULT_RESOURCE_LIMITS));setMessage('默认值已填入，点击应用后生效。');}}>恢复默认值</button><button className="primary" disabled={saving} onClick={()=>void save()}>{saving?'正在应用…':'应用容量设置'}</button></div>
    {message&&<p role="status">{message}</p>}
  </details>;
}
