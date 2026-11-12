import {memo,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import App from '../App';
import {createDemo,uid} from '../core/demo';
import {exportSceneGlb} from '../core/archive';
import type {TutorialAdapter} from './contract';
import './tutorial.css';

const Editor=memo(App);
const lessons=[
 {name:'导入模型',title:'从左侧资产库导入模型',description:'点击左侧“导入模型”。正式使用时，在这里选择 GLB，或同时选择 OBJ、MTL 和贴图。本教程会自动载入内置的树样例。',hint:'请点击高亮的“导入模型”按钮。',targets:['.asset-actions > button']},
 {name:'转换体素',title:'转换入口就在视口底部',description:'源模型出现后，在底部预览栏选择分辨率，再点“转换为体素”。网页不能运行本地 binvox，本步载入预制样例；改变档位不会改变这个教学样例。',hint:'试选一个分辨率，再点击“转换为体素”。',targets:['.import-preview']},
 {name:'修整体素',title:'在右侧选笔刷，在中央改模型',description:'先点击视口上方“模型”，进入预制体编辑；再点击右侧“涂色”，在树上改一格颜色。模型模块会修改预制体；关卡模块的笔刷只修改当前物件。',hint:'切换到“模型”，点击“涂色”，再在中央树模型上涂一格。',targets:['.viewport-toolbar .segmented:first-child','.brush-buttons','.color-picker','.swatches','.viewport']},
 {name:'摆放场景',title:'回到关卡，调整物件变换',description:'先点击视口上方“关卡”，再用移动工具拖动轴，或修改右侧“位置 X”。旋转、缩放也在原来的工具栏与属性面板里。缩放会同时改变方块大小。',hint:'切换到“关卡”，修改位置 X 或拖动移动轴。',targets:['.canvas-panel','.right-panel .inspector-section:first-of-type']},
 {name:'保存工程',title:'顶部“保存”下载可编辑工程',description:'点击右上角“保存”，下载当前练习的真实 .vxlproj 工程。它可以在方境桌面版重新打开。本教程不读写桌面版草稿，刷新网页会重新开始练习。',hint:'点击顶部“保存”，下载练习工程。',targets:['header nav button:nth-child(3)']},
 {name:'导出天工',title:'按真实交付菜单导出',description:'点击顶部“导出天工”，再选“天工 0.4.19 交付包”。工程包、GLB 和天工 Pack 是三个独立导出选项；交付时建议同时保存工程包与天工包。',hint:'打开导出菜单，再下载“天工 0.4.19 交付包”。',targets:['header nav button:nth-child(4)']}
] as const;
const actionStep={import:0,convert:1,paint:2,transform:3,save:4,export:5};
type Rect={x:number;y:number;width:number;height:number};
function rect(el:Element):Rect{const r=el.getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height};}
function path(r:Rect){return 'M'+r.x+','+r.y+'h'+r.width+'v'+r.height+'h-'+r.width+'Z';}

export default function Tutorial(){
 const [step,setStep]=useState(0),[done,setDone]=useState<number[]>([]),[paused,setPaused]=useState(false),[run,setRun]=useState(0);
 const [regions,setRegions]=useState<{outer:Rect;holes:Rect[]}|null>(null),[exportDialog,setExportDialog]=useState(false),[finished,setFinished]=useState(false);
 const root=useRef<HTMLDivElement>(null);
 const adapter=useMemo<TutorialAdapter>(()=>({
  async loadExample(){
   const p=createDemo();p.name='教程树样例';p.assets=p.assets.filter(a=>a.id==='demo-tree');p.nodes=p.nodes.filter(n=>n.assetId==='demo-tree').map(n=>({...n,position:[0,0,0]}));
   return [new File([await exportSceneGlb(p)],'树样例.glb',{type:'model/gltf-binary'})];
  },
  convertExample(){const a=createDemo().assets.find(a=>a.id==='demo-tree')!;return {...a,id:uid(),name:'树样例'};},
  onAction(action){setDone(previous=>previous.includes(actionStep[action])?previous:[...previous,actionStep[action]]);}
 }),[]);
 const advance=()=>{if(!done.includes(step))return;if(step===5)setFinished(true);else setStep(step+1);};
 const reset=()=>{setRun(v=>v+1);setStep(0);setDone([]);setPaused(false);setFinished(false);};
 const positionGuide=useCallback(()=>{
  const app=root.current?.querySelector('.app-shell');if(!app)return;
  const modal=app.querySelector('[aria-label="导出与交付"]');
  setExportDialog(!!modal);
  let selectors:readonly string[]=lessons[step].targets;
  if(step===5&&modal)selectors=['[aria-label="导出与交付"]'];
  if(step===1&&!app.querySelector('.import-preview'))selectors=['.asset-actions > button'];
  const outer=rect(app);
  const holes=selectors.flatMap(selector=>Array.from(app.querySelectorAll(selector))).map(el=>{
   const r=rect(el);let x=r.x-4,y=r.y-4,right=r.x+r.width+4,bottom=r.y+r.height+4;
   // Clip highlights to scrollable panels so off-screen properties do not expose unrelated UI.
   const panel=el.closest('.right-panel');
   if(panel){const p=rect(panel);x=Math.max(x,p.x);y=Math.max(y,p.y);right=Math.min(right,p.x+p.width);bottom=Math.min(bottom,p.y+p.height);}
   x=Math.max(x,outer.x);y=Math.max(y,outer.y);right=Math.min(right,outer.x+outer.width);bottom=Math.min(bottom,outer.y+outer.height);
   return {x,y,width:right-x,height:bottom-y};
  }).filter(r=>r.width>0&&r.height>0);
  setRegions(previous=>previous&&JSON.stringify(previous)===JSON.stringify({outer,holes})?previous:{outer,holes});
 },[step]);
 useEffect(()=>{
  const app=root.current?.querySelector('.app-shell');if(!app)return;
  let frame=0;
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(positionGuide);};
  const observer=new MutationObserver(schedule);observer.observe(app,{childList:true,subtree:true,attributes:true});
  const resize=new ResizeObserver(schedule);resize.observe(app);
  addEventListener('resize',schedule);addEventListener('scroll',schedule,true);schedule();
  return()=>{observer.disconnect();resize.disconnect();removeEventListener('resize',schedule);removeEventListener('scroll',schedule,true);cancelAnimationFrame(frame);};
 },[positionGuide,run]);
 useEffect(()=>{
  const panel=root.current?.querySelector('.right-panel');
  if(step===2)panel?.querySelector('.brush-buttons')?.scrollIntoView({block:'center'});
  else if(step===3)panel?.scrollTo({top:0});
  positionGuide();
 },[step,positionGuide]);
 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){setPaused(true);setFinished(false);}};
  addEventListener('keydown',onKey);return()=>removeEventListener('keydown',onKey);
 },[]);
 const canNavigate=(n:number)=>n===0||Array.from({length:n},(_,i)=>i).every(i=>done.includes(i));
 return <div className="tutorial-root" ref={root}>
  <div className="tutorial-strip"><strong>方境交互教程</strong><span>真实编辑界面 · 转换步骤使用预制样例</span><nav><a href="./">返回首页</a><button onClick={()=>setPaused(v=>!v)}>{paused?'继续引导':'暂停引导'}</button><button onClick={reset}>重新练习</button><a href="https://github.com/ventsdenye2/fangjing-voxel-studio/releases" target="_blank" rel="noreferrer">下载桌面版 ↗</a></nav></div>
  <Editor key={run} tutorial={adapter}/>
  {!paused&&!finished&&regions&&<svg className="tutorial-mask" aria-hidden="true"><path d={path(regions.outer)+regions.holes.map(path).join('')} fillRule="evenodd"/>{regions.holes.map((r,i)=><rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} rx={5}/>)}</svg>}
  <section className="tutorial-dock" aria-label="操作引导">
   <div className="tutorial-steps">{lessons.map((s,i)=><button key={s.name} disabled={!canNavigate(i)} className={step===i?'current':''} aria-current={step===i?'step':undefined} onClick={()=>{setStep(i);setPaused(false);setFinished(false);}}><span>{done.includes(i)?'✓':String(i+1).padStart(2,'0')}</span>{s.name}</button>)}<small>{done.length} / 6 已完成</small></div>
   <div className="tutorial-instruction" aria-live="polite"><div className="tutorial-number">{String(step+1).padStart(2,'0')}</div><div className="tutorial-copy"><h1>{finished?'已完成：带上工程和天工包继续制作':paused?'引导已暂停，可以自由试用当前界面':lessons[step].title}</h1><p>{finished?'将下载的 Pack 放入天工 0.4.19 工程的 assets 目录，构建并通过 catalog 加载 scene/main。逐格体素编辑仍在方境中完成。':paused?'所有功能保持方境原有布局。点击“继续引导”回到当前步骤；浏览器不能运行本地 binvox。':lessons[step].description}</p><span className="tutorial-hint">{done.includes(step)?'✓ 本步已完成，可继续或重复练习。':step===5&&exportDialog?'请点击弹窗中的“天工 0.4.19 交付包”。':lessons[step].hint}</span></div><div className="tutorial-navigation"><button disabled={step===0} onClick={()=>{setStep(v=>v-1);setFinished(false);}}>上一步</button><button className="primary" disabled={!done.includes(step)} onClick={advance}>{step===5?'完成教程':'下一步 →'}</button></div></div>
  </section>
 </div>;
}
