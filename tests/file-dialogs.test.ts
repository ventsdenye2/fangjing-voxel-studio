import {describe,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
const {projectOpenOptions,chooseOutputPath}=createRequire(import.meta.url)('../desktop/file-dialogs.cjs');
describe('recovering saved project files',()=>{
 it('allows selecting extensionless files while keeping a project filter',()=>{
  expect(projectOpenOptions.filters.flatMap((f:any)=>f.extensions)).toEqual(['vxlproj','zip','*']);
 });
 it('confirms the actual suffixed destination with the native dialog',async()=>{
  const showSaveDialog=vi.fn().mockResolvedValueOnce({filePath:'/tmp/庭院',canceled:false}).mockResolvedValueOnce({filePath:'/tmp/庭院.vxlproj',canceled:false});
  expect(await chooseOutputPath({showSaveDialog},{},'工程.vxlproj')).toBe('/tmp/庭院.vxlproj');
  expect(showSaveDialog.mock.calls[1][1].defaultPath).toBe('/tmp/庭院.vxlproj');
 });
 it('does not change an existing case-insensitive extension',async()=>{
  const showSaveDialog=vi.fn().mockResolvedValue({filePath:'/tmp/场景.VXLPROJ',canceled:false});
  expect(await chooseOutputPath({showSaveDialog},{},'工程.vxlproj')).toBe('/tmp/场景.VXLPROJ');
  expect(showSaveDialog).toHaveBeenCalledTimes(1);
 });
 it('allows cancelling the corrected save without writing anything',async()=>{
  const showSaveDialog=vi.fn().mockResolvedValueOnce({filePath:'/tmp/场景',canceled:false}).mockResolvedValueOnce({canceled:true});
  expect(await chooseOutputPath({showSaveDialog},{},'工程.vxlproj')).toBeNull();
 });
});
