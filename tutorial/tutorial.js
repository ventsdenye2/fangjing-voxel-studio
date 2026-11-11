'use strict';
const $ = s => document.querySelector(s);
const storageKey = 'fangjing-tutorial-v1';
const labels = ['导入模型','转换体素','修整体素','摆放场景','保存工程','导出天工'];
const steps = [
 {target:'#import',title:'导入你的第一个模型',copy:'桌面版可导入 GLB，或 OBJ + MTL + 贴图。这里用自带的小屋练习，点击高亮按钮即可。',hint:'↥ 点击“导入示例模型”',success:'✓ 小屋已载入。下一步把它变成体素。'},
 {target:'#conversion',title:'先选分辨率，再转换',copy:'试着切换 64 / 128 档，看每格边长如何变化。4 米模型在 64 档约为 6.25 厘米一格；这是尺寸计算示例，预览不运行真实 binvox。',hint:'选择分辨率，然后点击“转换为体素”',success:'✓ 已生成体素示意。整体尺寸不因分辨率改变。'},
 {target:'#edit-area',title:'给小屋换一块颜色',copy:'选择“涂色”，再点小屋上的一个方块。也能试试增加、删除和撤销。桌面版里，共享资产的实例会一起改变；要单独修改，先创建独立副本。',hint:'选择涂色工具，点击任意一个方块',success:'✓ 已修改一格颜色。你可以继续试，或进入下一步。'},
 {target:'#transform',title:'把资产摆进关卡',copy:'拖动位置 X 滑块移动小屋，再试试等比缩放。模型放大时，方块也会一起变大；导入天工后保留这个尺寸。',hint:'移动位置滑块，或改变等比缩放',success:'✓ 场景变换已更新。接下来保存工程。'},
 {target:'#save',title:'保存可继续编辑的工程',copy:'桌面版“保存”得到 .vxlproj，保留源模型、体素颜色和场景节点。本页按钮只保存练习记录，不会生成真实工程。',hint:'点击高亮的“保存”按钮',success:'✓ 练习记录已保存。正式制作时请保存 .vxlproj。'},
 {target:'#export',title:'交给天工继续制作',copy:'桌面版“导出天工”生成 ZIP，包含通用 GLB、天工 Pack 和编辑工程。点击按钮查看真实交付步骤；网页不会伪造可导入的模型包。',hint:'点击“导出天工”，查看交付清单',success:'✓ 交付步骤已打开。可以下载清单带到桌面版。'}
];
let stored = {};
try { stored = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch {}
const done = new Set(Array.isArray(stored.done) ? stored.done.filter(n => Number.isInteger(n) && n >= 0 && n < 6) : []);
let index = Number.isInteger(stored.index) ? Math.max(0,Math.min(5,stored.index)) : 0;
let guided = true, imported = false, voxelized = false, tool = 'paint', cells = [], undoStack = [], position = 0, scale = 1, raf = 0;
let storageAvailable = true;
function persist() {
 try { localStorage.setItem(storageKey,JSON.stringify({index,done:[...done]})); return true; }
 catch { storageAvailable = false; return false; }
}
function status(text) { $('#status').textContent = text; }
function updateNav() {
 $('#lesson-nav').innerHTML = labels.map((name,i) => '<button class="lesson '+(i===index?'active ':'')+(done.has(i)?'done':'')+'" data-step="'+i+'" '+(i===index?'aria-current="step"':'')+'><span class="number">'+(done.has(i)?'✓':i+1)+'</span><span>'+name+'</span><span class="arrow">›</span></button>').join('');
 $('#progress-track').innerHTML = labels.map((_,i)=>'<span class="'+(done.has(i)?'done':'')+'"></span>').join('');
 $('#progress-label').textContent = done.size+' / 6';
 $('#saved-progress').textContent = done.size ? '已完成 '+done.size+' 个步骤，可随时重练。' : '约 3 分钟，边做边学。';
}
function updateGuide() {
 const s = steps[index];
 $('#step-number').textContent = String(index+1).padStart(2,'0');
 $('#step-category').textContent = labels[index];
 $('#guide-title').textContent = s.title;
 $('#guide-copy').textContent = s.copy;
 $('#task-hint').textContent = done.has(index) ? s.success : s.hint;
 $('#task-hint').classList.toggle('complete',done.has(index));
 if(index===2 && !done.has(index)) {
  const b=document.createElement('button');b.textContent='键盘练习：涂一格';b.className='keyboard-paint';
  b.addEventListener('click',()=>editCell(cells.find(c=>c.y===3&&c.z===1) || cells[0],'paint'));
  $('#task-hint').append(document.createElement('br'),b);
 }
 $('#previous').disabled = index === 0;
 $('#next').disabled = !done.has(index);
 $('#next').textContent = index === 5 ? '查看交付清单 ↗' : '下一步 →';
 $('#guide').hidden = !guided;
 document.body.classList.toggle('guide-active',guided);
 document.body.classList.toggle('guide-off',!guided);
 $('#toggle-guide').textContent = guided ? '暂停引导' : '继续引导';
 $('#toggle-guide').setAttribute('aria-pressed',String(guided));
 applyControlStates();
 scheduleLayout();
}
function applyControlStates() {
 const target=$(steps[index].target);
 document.querySelectorAll('.editor button,.editor input,.editor select').forEach(el=>{
  let canUse=true;
  if(el.id!=='import' && !imported) canUse=false;
  if((el.closest('#edit-area') || el.closest('#transform') || el.id==='save' || el.id==='export')&&!voxelized)canUse=false;
  if(guided && el!==target && !target.contains(el))canUse=false;
  el.disabled=!canUse;
 });
}
function complete(n,message) {
 done.add(n);persist();updateNav();updateGuide();status(message);
}
function setGuided(value) {guided=value;updateGuide();if(value)revealTarget();}
function go(n) {
 index=Math.max(0,Math.min(5,n));
 if(index>0 && !imported)loadModel();
 if(index>1 && !voxelized) {voxelized=true;renderModel();}
 guided=true;updateNav();updateGuide();persist();revealTarget();
}
function revealTarget() {
 requestAnimationFrame(()=>{
  const target=$(steps[index].target);
  const rect=target.getBoundingClientRect();
  const bottom=innerWidth<=800 ? innerHeight-$('#guide').offsetHeight-30 : innerHeight-28;
  if(rect.top<76 || rect.bottom>bottom) {
   const top=scrollY+rect.top-100;
   scrollTo({top:Math.max(0,top),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
  }
  scheduleLayout();
 });
}
function scheduleLayout(){cancelAnimationFrame(raf);raf=requestAnimationFrame(layoutGuide);}
function box(el,x,y,w,h){Object.assign(el.style,{left:x+'px',top:y+'px',width:Math.max(0,w)+'px',height:Math.max(0,h)+'px',display:'block'});}
function layoutGuide(){
 if(!guided)return;
 const e=$('#editor').getBoundingClientRect(), t=$(steps[index].target).getBoundingClientRect();
 const l=Math.max(e.left,t.left-5),r=Math.min(e.right,t.right+5),top=Math.max(e.top,t.top-5),bottom=Math.min(e.bottom,t.bottom+5);
 box($('#shade-top'),e.left,e.top,e.width,top-e.top);
 box($('#shade-bottom'),e.left,bottom,e.width,e.bottom-bottom);
 box($('#shade-left'),e.left,top,l-e.left,bottom-top);
 box($('#shade-right'),r,top,e.right-r,bottom-top);
 box($('#spotlight'),l,top,r-l,bottom-top);
 if(innerWidth<=800)return;
 const g=$('#guide'),w=g.offsetWidth,h=g.offsetHeight;
 let x,y;
 if(index===2) {x=Math.max(12,l-w-16);y=top+70;}
 else if(index===1 || index===3) {x=l-w-20;y=top+10;}
 else {x=Math.min(innerWidth-w-20,l+30);y=bottom+20;}
 x=Math.max(16,Math.min(innerWidth-w-16,x));
 y=Math.max(86,Math.min(innerHeight-h-16,y));
 g.style.left=x+'px';g.style.top=y+'px';
}
function cube(x,y,z,color){return {x,y,z,color};}
function makeHouse(){
 const result=[];
 for(let x=0;x<9;x++)for(let z=0;z<8;z++)result.push(cube(x,0,z,(x+z)%3===0?'#85a86b':'#91b579'));
 for(let y=1;y<=4;y++)for(let x=2;x<=6;x++)for(let z=2;z<=5;z++){
  if(x!==2&&x!==6&&z!==2&&z!==5)continue;
  if(z===2&&x===4&&y<3)continue;
  let color='#d9cbb1';
  if(y===3&&((z===2&&(x===3||x===5))||(x===6&&z===3)))color='#8bb6bb';
  result.push(cube(x,y,z,color));
 }
 for(let x=1;x<=7;x++)for(let z=1;z<=6;z++){
  const y=5+Math.min(x-1,7-x);
  result.push(cube(x,y,z,(x+z)%2?'#c3816d':'#d8947b'));
 }
 result.push(cube(5,7,4,'#c5b5a2'),cube(5,8,4,'#ddcfb8'));
 for(let z=0;z<2;z++)result.push(cube(4,1,z,'#b4b8ad'));
 for(const [x,z] of [[0,2],[1,6],[7,6],[8,3]])for(let y=1;y<=2;y++)result.push(cube(x,y,z,'#679468'));
 return result;
}
function shade(hex,f){
 const n=parseInt(hex.slice(1),16);return '#'+[n>>16,(n>>8)&255,n&255].map(c=>Math.min(255,Math.round(c*f)).toString(16).padStart(2,'0')).join('');
}
function renderModel(){
 const svg=$('#model');svg.classList.toggle('source',!voxelized);
 if(!imported){svg.innerHTML='';return;}
 const unit=27,baseX=340+position*24,baseY=356;
 let grid='';
 for(let i=-4;i<=14;i++){
  const a=projectPoint(i,0,-4),b=projectPoint(i,0,14),c=projectPoint(-4,0,i),d=projectPoint(14,0,i);
  grid+='<path d="M'+a+' L'+b+' M'+c+' L'+d+'" stroke="#648075" stroke-opacity=".2" fill="none"/>';
 }
 function projectPoint(x,y,z){return [baseX+(x-z)*unit,baseY+(x+z-8)*unit*.5-y*unit];}
 function poly(points,color){return '<polygon points="'+points.map(p=>p.join(',')).join(' ')+'" fill="'+color+'" stroke="#11251d" stroke-opacity="'+(voxelized?'.15':'.4')+'" stroke-width=".6"/>';}
 const sorted=[...cells].sort((a,b)=>(a.x+a.z-b.x-b.z)||a.y-b.y);
 let body='';
 for(const c of sorted){
  const {x,y,z,color}=c;
  const a=projectPoint(x,y,z),b=projectPoint(x+1,y,z),cc=projectPoint(x+1,y,z+1),d=projectPoint(x,y,z+1);
  const A=projectPoint(x,y+1,z),B=projectPoint(x+1,y+1,z),C=projectPoint(x+1,y+1,z+1),D=projectPoint(x,y+1,z+1);
  body+='<g class="voxel" data-cell="'+[x,y,z].join(',')+'">'+poly([d,cc,C,D],shade(color,.82))+poly([b,cc,C,B],shade(color,.67))+poly([A,B,C,D],color)+'</g>';
 }
 const factor=Math.min(1.55,scale);
 svg.innerHTML='<g>'+grid+'</g><g transform="translate('+baseX+' '+baseY+') scale('+factor+') translate('+(-baseX)+' '+(-baseY)+')">'+body+'</g>';
 $('#view-caption').textContent=voxelized ? '可点击方块 · 密度为示意，非真实转换' : '源模型预览示意 · 尚未转换';
 $('#asset-type').textContent=voxelized?'体素小屋 · 示意':'示例源模型';
}
function loadModel(){
 imported=true;cells=makeHouse();undoStack=[];voxelized=false;
 $('#empty-view').hidden=true;$('#empty-view').style.display='none';$('#empty-asset').hidden=true;
 $('#asset-card').style.display='block';$('#scene-node').style.display='block';$('#asset-count').textContent='1';
 renderModel();applyControlStates();
}
function updateDimensions(){
 const n=Number($('#resolution').value),length=Number($('#model-length').value);
 const cm=length/n*100;
 $('#cell-size').textContent=cm.toFixed(2);
 $('#world-cell').textContent=(cm*scale).toFixed(2)+' cm';
}
function editCell(cell,action=tool){
 if(!voxelized || !cell || (guided&&index!==2))return;
 undoStack.push(cells.map(c=>({...c})));
 if(action==='paint'){cell.color=$('#brush-color').value;complete(2,'已涂色一格 · 练习示意');}
 else if(action==='remove'){cells=cells.filter(c=>c!==cell);status('已删除一格 · 可撤销');}
 else {let y=cell.y+1;while(cells.some(c=>c.x===cell.x&&c.z===cell.z&&c.y===y))y++;cells.push(cube(cell.x,y,cell.z,$('#brush-color').value));status('已增加一格 · 可撤销');}
 renderModel();
}
$('#import').addEventListener('click',()=>{loadModel();complete(0,'示例小屋已导入 · 没有上传任何文件');});
$('#convert').addEventListener('click',()=>{voxelized=true;renderModel();complete(1,'体素示意已生成 · '+$('#resolution').value+' 档尺寸计算');});
$('#resolution').addEventListener('change',updateDimensions);$('#model-length').addEventListener('change',updateDimensions);
$('#model').addEventListener('click',e=>{const el=e.target.closest('[data-cell]');if(!el)return;editCell(cells.find(c=>[c.x,c.y,c.z].join(',')===el.dataset.cell));});
$('#brushes').addEventListener('click',e=>{if(!e.target.dataset.tool)return;tool=e.target.dataset.tool;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('selected',b.dataset.tool===tool));status('当前工具：'+e.target.textContent+' · 点击小屋上的方块');});
$('#undo').addEventListener('click',()=>{if(!undoStack.length){status('还没有可撤销的体素修改');return;}cells=undoStack.pop();renderModel();status('已撤销上一次体素修改');});
$('#position').addEventListener('input',()=>{position=Number($('#position').value);$('#x-value').textContent=position+' m';renderModel();complete(3,'小屋位置 X：'+position+' 米');});
$('#scale').addEventListener('change',()=>{scale=Number($('#scale').value);updateDimensions();renderModel();complete(3,'等比缩放 '+scale+' 倍 · 每格边长也随之改变');});
$('#scene-view').addEventListener('click',()=>{position=0;scale=1;$('#position').value='0';$('#scale').value='1';$('#x-value').textContent='0 m';updateDimensions();renderModel();status('视图已复位');});
$('#save').addEventListener('click',()=>{
 $('#project-name').textContent='小屋练习';
 complete(4,'练习记录已保存到当前浏览器 · 不是 .vxlproj');
 if(!storageAvailable)status('浏览器禁止持久化；本次练习可继续，关闭网页后进度不会保留');
});
function showResult(){
 const all=done.size===6;
 $('#result .result-label').textContent=all?'六步练习完成':'天工交付说明';
 $('#result>p:nth-of-type(2)').textContent=all?'你已走过导入、转换、编辑、摆放、保存和导出的流程。网页不会生成可导入天工的真实模型包。':'按照下方清单，在桌面版中完成真实模型的交付。网页不会生成可导入天工的真实模型包。';
 $('#result').showModal();
}
$('#export').addEventListener('click',()=>{complete(5,'已打开天工交付清单 · 此处不生成真实模型包');showResult();});
$('#lesson-nav').addEventListener('click',e=>{const b=e.target.closest('[data-step]');if(b)go(Number(b.dataset.step));});
$('#previous').addEventListener('click',()=>go(index-1));
$('#next').addEventListener('click',()=>{if(!done.has(index))return;if(index===5)showResult();else go(index+1);});
$('#toggle-guide').addEventListener('click',()=>setGuided(!guided));$('#close-guide').addEventListener('click',()=>setGuided(false));
$('#restart').addEventListener('click',()=>{done.clear();index=0;imported=false;voxelized=false;position=0;scale=1;cells=[];undoStack=[];$('#position').value=0;$('#scale').value='1';$('#resolution').value='64';$('#model-length').value='4';$('#x-value').textContent='0 m';$('#empty-view').hidden=false;$('#empty-view').style.display='flex';$('#empty-asset').hidden=false;$('#asset-card').style.display='none';$('#scene-node').style.display='none';$('#asset-count').textContent='0';$('#project-name').textContent='未命名工程';tool='paint';document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('selected',b.dataset.tool===tool));renderModel();updateDimensions();go(0);status('练习已重置 · 等待导入示例');});
$('#close-result').addEventListener('click',()=>$('#result').close());
const checklist='方境 → 天工交付清单\n1. 在方境桌面版保存 .vxlproj。\n2. 点击“导出天工”并解压交付 ZIP。\n3. 将 Pack 放入天工 0.4.19 工程的 assets 目录。\n4. 构建并检查资产，通过 catalog 加载 scene/main。\n尺寸与缩放会保留；逐格体素编辑仍在方境完成，暂不支持反向同步。\n完整步骤：https://github.com/ventsdenye2/fangjing-voxel-studio/blob/main/docs/TIANGONG.md';
$('#copy-checklist').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(checklist);$('#copy-status').textContent='交付清单已复制。';}
 catch{$('#copy-status').textContent='浏览器不允许复制，请使用“下载练习笔记”。';}
});
$('#download-notes').addEventListener('click',()=>{
 const text='方境交互教程 · 练习笔记（不是模型工程）\n已练习：'+[...done].sort().map(n=>labels[n]).join('、')+'\n\n'+checklist+'\n\n尺寸示例：'+$('#model-length').value+' 米 ÷ '+$('#resolution').value+' × '+scale+' = '+$('#world-cell').textContent+' / 格。\n';
 const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='方境-练习笔记.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 $('#copy-status').textContent='练习笔记已生成；它是文字清单，不是天工模型包。';
});
addEventListener('resize',scheduleLayout);addEventListener('scroll',scheduleLayout,{passive:true});
addEventListener('keydown',e=>{
 if(e.key==='Escape'&&!$('#result').open){setGuided(false);$('#toggle-guide').focus();}
 if(e.target.matches('input,select,textarea')||$('#result').open)return;
 if(guided&&e.key==='ArrowRight'&&done.has(index)&&index<5){e.preventDefault();go(index+1);}
 if(guided&&e.key==='ArrowLeft'&&index>0){e.preventDefault();go(index-1);}
});
updateDimensions();go(index);
