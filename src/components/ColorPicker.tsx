import {useEffect,useRef,useState} from 'react';
import type {PointerEvent} from 'react';
import {hexToHsv,hsvToHex,normalizeHex} from '../core/color';
import type {HSV} from '../core/color';

export default function ColorPicker({value,onChange,onRemember}:{value:string;onChange:(color:string)=>void;onRemember:(color:string)=>void}){
 const [hsv,setHsv]=useState(()=>hexToHsv(value)),[hex,setHex]=useState(value),[invalid,setInvalid]=useState(false);
 const current=useRef(hsv),latest=useRef(value);latest.current=value;
 useEffect(()=>{setHex(value);setInvalid(false);if(hsvToHex(current.current)!==value){const next=hexToHsv(value);if(next.s===0)next.h=current.current.h;if(next.v===0)next.s=current.current.s;current.current=next;setHsv(next);}},[value]);
 const update=(next:HSV)=>{current.current=next;setHsv(next);const color=hsvToHex(next);latest.current=color;onChange(color);};
 const remember=()=>onRemember(latest.current);
 const point=(event:PointerEvent<HTMLDivElement>)=>{const r=event.currentTarget.getBoundingClientRect();update({...current.current,s:Math.max(0,Math.min(100,(event.clientX-r.left)/r.width*100)),v:Math.max(0,Math.min(100,100-(event.clientY-r.top)/r.height*100))});};
 const applyHex=()=>{const next=normalizeHex(hex.startsWith('#')?hex:'#'+hex);if(next){onChange(next);onRemember(next);setHex(next);setInvalid(false);}else setInvalid(true);};
 return <div className="color-picker">
  <div className="color-field"><label htmlFor="brush-hex">笔刷颜色</label><span className="color-preview" style={{background:value}} aria-hidden="true"/><input id="brush-hex" aria-label="笔刷颜色 HEX" value={hex} maxLength={7} spellCheck={false} aria-invalid={invalid} onChange={e=>{setHex(e.target.value);setInvalid(false);}} onBlur={applyHex} onKeyDown={e=>{if(e.key==='Enter'){applyHex();e.currentTarget.blur();}if(e.key==='Escape'){setHex(value);setInvalid(false);}}}/></div>
  {invalid&&<p className="color-error" role="alert">请输入六位 HEX 色值，例如 #a5e3bb。</p>}
  <div className="sv-palette" role="group" aria-label="饱和度与明暗度色盘" style={{backgroundColor:hsvToHex({h:hsv.h,s:100,v:100})}} onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);point(e);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))point(e);}} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){point(e);e.currentTarget.releasePointerCapture(e.pointerId);remember();}}} onPointerCancel={remember}><span className="sv-cursor" style={{left:hsv.s+'%',top:(100-hsv.v)+'%'}}/></div>
  <p className="picker-hint">左右调饱和度，上下调明暗度</p>
  {([{key:'h',label:'色相',max:360,unit:'°'},{key:'s',label:'饱和度',max:100,unit:'%'},{key:'v',label:'明暗度',max:100,unit:'%'}] as const).map(({key,label,max,unit})=><div className="color-channel" key={key}><label htmlFor={'color-'+key}>{label}</label><input type="range" aria-label={label+'滑块'} min={0} max={max} step={1} value={hsv[key]} className={'channel-'+key} style={key==='s'?{background:'linear-gradient(to right,'+hsvToHex({...hsv,s:0})+','+hsvToHex({...hsv,s:100})+')'}:key==='v'?{background:'linear-gradient(to right,#000,'+hsvToHex({...hsv,v:100})+')'}:undefined} onChange={e=>update({...current.current,[key]:Number(e.target.value)})} onPointerUp={remember} onKeyUp={e=>{if(e.key.startsWith('Arrow')||['Home','End','PageUp','PageDown'].includes(e.key))remember();}} onBlur={remember}/><input id={'color-'+key} aria-label={label} type="number" min={0} max={max} step={1} value={Math.round(hsv[key])} onChange={e=>{if(e.target.value==='')return;const n=Number(e.target.value);if(Number.isFinite(n))update({...current.current,[key]:Math.max(0,Math.min(max,n))});}} onBlur={remember} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><span>{unit}</span></div>)}
 </div>;
}
