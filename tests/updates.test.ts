import {describe,it,expect,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const {createUpdates,latestRelease}=createRequire(import.meta.url)('../desktop/updates.cjs');
function setup(version='1.0.0',platform='win32',isPackaged=true){
 const updater=Object.assign(new EventEmitter(),{checkForUpdates:vi.fn(),downloadUpdate:vi.fn(),quitAndInstall:vi.fn(),autoDownload:true,autoInstallOnAppQuit:true,allowPrerelease:true,allowDowngrade:true});
 const fetch=vi.fn(),openExternal=vi.fn(),notify=vi.fn();
 const service=createUpdates({app:{isPackaged,getVersion:()=>version},platform,portable:false,updater,fetch,openExternal,notify});
 return {service,updater,fetch,openExternal,notify};
}
describe('safe installer updates',()=>{
 it('replaces a cached intermediate installer with the newest release before installing',async()=>{
  const {service,updater}=setup('1.0.0');
  updater.emit('update-downloaded',{version:'1.0.1'});
  updater.checkForUpdates.mockImplementation(()=>updater.emit('update-available',{version:'1.0.5'}));
  updater.downloadUpdate.mockImplementation(()=>updater.emit('update-downloaded',{version:'1.0.5'}));
  await service.install();
  expect(service.getState().version).toBe('1.0.5');
  expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
  expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
 });
 it('refreshes a stale available release when download is clicked',async()=>{
  const {service,updater}=setup();
  updater.emit('update-available',{version:'1.0.1'});
  updater.checkForUpdates.mockImplementation(()=>updater.emit('update-available',{version:'1.0.5'}));
  updater.downloadUpdate.mockImplementation(()=>updater.emit('update-downloaded',{version:'1.0.5'}));
  await service.download();expect(service.getState().version).toBe('1.0.5');
 });
 it('keeps the latest cached installer without downloading it again',async()=>{
  const {service,updater}=setup();updater.emit('update-downloaded',{version:'1.0.5'});
  updater.checkForUpdates.mockImplementation(()=>updater.emit('update-available',{version:'1.0.5'}));
  expect((await service.check()).status).toBe('downloaded');
  await service.install();expect(updater.downloadUpdate).not.toHaveBeenCalled();
  expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
 });
 it('does not install an intermediate cached version when latest-version checking fails',async()=>{
  const {service,updater}=setup();updater.emit('update-downloaded',{version:'1.0.1'});
  updater.checkForUpdates.mockRejectedValue(Error('offline'));
  await expect(service.install()).rejects.toThrow('最新版本');
  expect(updater.quitAndInstall).not.toHaveBeenCalled();
 });
 it('keeps stable users off prereleases and refuses downgrades',()=>{
  const {updater}=setup();expect(updater.autoDownload).toBe(false);expect(updater.autoInstallOnAppQuit).toBe(false);expect(updater.allowPrerelease).toBe(false);expect(updater.allowDowngrade).toBe(false);
  const releases=[{tag_name:'v0.9.0'},{tag_name:'v1.1.0-alpha.1',prerelease:true},{tag_name:'v1.0.1'},{tag_name:'v9.0.0',draft:true}];
  expect(latestRelease(releases,'1.0.0').tag_name).toBe('v1.0.1');
  expect(latestRelease(releases,'1.0.0-alpha.9').tag_name).toBe('v1.1.0-alpha.1');
 });
 it('requires a completed download before installation and reports progress',async()=>{
  const {service,updater}=setup();await expect(service.install()).rejects.toThrow('尚未下载');
  await service.download();expect(updater.downloadUpdate).not.toHaveBeenCalled();
  updater.checkForUpdates.mockImplementation(()=>updater.emit('update-available',{version:'1.0.1'}));
  updater.emit('update-available',{version:'1.0.1'});await service.download();
  expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
  updater.emit('download-progress',{percent:42});expect(service.getState().progress).toBe(42);
  updater.emit('update-downloaded',{version:'1.0.1'});
  await service.check();expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  await service.install();expect(updater.quitAndInstall).toHaveBeenCalledWith(false,true);
 });
 it('handles offline failures and permits retry without interrupting editing',async()=>{
  const {service,updater}=setup();updater.checkForUpdates.mockRejectedValueOnce(Error('offline'));
  expect((await service.check()).status).toBe('error');
  updater.checkForUpdates.mockImplementationOnce(()=>updater.emit('update-not-available'));
  expect((await service.check()).status).toBe('current');
 });
 it('coalesces concurrent version checks',async()=>{
  const {service,updater}=setup();let done:any;updater.checkForUpdates.mockImplementation(()=>new Promise(r=>done=r));
  const pending=service.check();await service.check();expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);done();await pending;
 });
 it('checks Mac versions without attempting unsigned automatic installation',async()=>{
  const {service,updater,fetch,openExternal}=setup('1.0.0','darwin');
  fetch.mockResolvedValue({ok:true,json:async()=>[{tag_name:'v1.0.1'}]});
  expect((await service.check()).status).toBe('available');await service.download();expect(updater.downloadUpdate).not.toHaveBeenCalled();
  await expect(service.install()).rejects.toThrow();await service.openDownloads();expect(openExternal).toHaveBeenCalledWith('https://github.com/ventsdenye2/fangjing-voxel-studio/releases');
 });
 it('never contacts the update server from a development build',async()=>{
  const {service,updater,fetch}=setup('1.0.0','win32',false);await service.check();expect(updater.checkForUpdates).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
});
