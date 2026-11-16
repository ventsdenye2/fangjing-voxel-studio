import type {UpdateState} from '../core/types';
export default function UpdatePanel({state,busy,onCheck,onDownload,onInstall,onDownloads}:{state:UpdateState;busy:boolean;onCheck:()=>void;onDownload:()=>void;onInstall:()=>void;onDownloads:()=>void}){
 const pending=busy||state.status==='checking'||state.status==='downloading';
 return <section aria-label="软件更新" className="inspector-section">
  <h3>软件更新 · {state.currentVersion}</h3>
  <p role="status">{state.message}</p>
  {state.status==='downloading'&&<progress aria-label="更新下载进度" max={100} value={state.progress}/>}
  <div className="button-row">
   <button disabled={pending||state.mode==='development'} onClick={onCheck}>检查最新版本</button>
   {state.status==='available'&&(state.mode==='automatic'?<button disabled={pending} onClick={onDownload}>下载更新 {state.version}</button>:<button disabled={pending} onClick={onDownloads}>前往下载新版</button>)}
   {state.status==='downloaded'&&<button className="primary" disabled={busy} onClick={onInstall}>保存工程并重启更新</button>}
  </div>
  <p className="muted">{state.mode==='automatic'?'直接更新到最新正式版，无需逐版安装。下载和安装前会重新检查最新版本，已下载旧包也可重新检查。关闭软件不会自动安装。':'当前平台支持检查更新，安装需要手动完成。'}</p>
 </section>;
}
