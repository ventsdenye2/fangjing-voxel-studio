const semver = require('semver');
const RELEASES = 'https://github.com/ventsdenye2/fangjing-voxel-studio/releases';
const API = 'https://api.github.com/repos/ventsdenye2/fangjing-voxel-studio/releases?per_page=100';
function latestRelease(releases, current) {
  const allowPrerelease = !!semver.prerelease(current);
  return releases.filter(r => !r.draft && semver.valid(r.tag_name) &&
    (allowPrerelease || (!r.prerelease && !semver.prerelease(r.tag_name))) &&
    semver.gt(r.tag_name, current)).sort((a,b)=>semver.rcompare(a.tag_name,b.tag_name))[0];
}
function createUpdates({ app, updater, platform = process.platform, portable = !!process.env.PORTABLE_EXECUTABLE_FILE, fetch = globalThis.fetch, openExternal, notify = () => {} }) {
  const mode = !app.isPackaged ? 'development' : platform === 'win32' && !portable ? 'automatic' : 'manual';
  let state = { mode, status: 'idle', currentVersion: app.getVersion(), version: '', progress: 0,
    message: mode === 'development' ? '开发模式不检查更新' : mode === 'automatic' ? '启动后自动检查新版；下载后可保存工程并重启安装。' : '自动检查新版；当前 Mac 包未签名，需要下载后手动安装。' };
  let checking = false;
  const patch = value => { state = {...state,...value}; notify({...state}); };
  if (mode === 'automatic') {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = !!semver.prerelease(state.currentVersion);
    updater.allowDowngrade = false;
    updater.on('checking-for-update',()=>patch({status:'checking',message:'正在检查更新…'}));
    updater.on('update-available',info=>patch({status:'available',version:info.version,progress:0,message:'发现新版本 '+info.version}));
    updater.on('update-not-available',()=>patch({status:'current',message:'当前已是最新版本'}));
    updater.on('download-progress',info=>patch({status:'downloading',progress:Math.min(100,Math.max(0,info.percent)),message:'正在下载更新…'}));
    updater.on('update-downloaded',info=>patch({status:'downloaded',version:info.version,progress:100,message:'更新已下载。保存工程后可重启安装。'}));
    updater.on('error',error=>patch({status:'error',message:'更新失败，可稍后重试：'+error.message}));
  }
  return {
    getState:()=>({...state}),
    async check() {
      if(mode==='development'||checking||['downloading','downloaded'].includes(state.status))return {...state};
      checking=true;patch({status:'checking',message:'正在检查更新…'});
      try {
        if(mode==='automatic') await updater.checkForUpdates();
        else {
          const response=await fetch(API,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
          if(!response.ok)throw Error('HTTP '+response.status);
          const releases=await response.json();if(!Array.isArray(releases))throw Error('版本列表格式错误');
          const latest=latestRelease(releases,state.currentVersion);
          patch(latest ? {status:'available',version:semver.clean(latest.tag_name),message:'发现新版，请下载并安装。'} : {status:'current',message:'当前已是最新版本'});
        }
      } catch(error) { patch({status:'error',message:'更新检查失败，可稍后重试：'+error.message}); }
      finally { checking=false; }
      return {...state};
    },
    async download() {
      if(mode!=='automatic'||state.status!=='available')return {...state};
      patch({status:'downloading',progress:0,message:'正在下载更新…'});
      try { await updater.downloadUpdate(); }
      catch(error) { patch({status:'error',message:'下载失败，可重新检查并重试：'+error.message}); }
      return {...state};
    },
    install() {
      if(mode!=='automatic'||state.status!=='downloaded')throw Error('更新尚未下载完成');
      updater.quitAndInstall(false,true);
    },
    openDownloads:()=>openExternal(RELEASES)
  };
}
module.exports={createUpdates,latestRelease};
