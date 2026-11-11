const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { createConverter } = require('./binvox.cjs');
const { isLocalResourceURL } = require('./resource-policy.cjs');
const { execFile } = require('node:child_process');
const { normalizeResourceLimits } = require('./resource-limits.cjs');
const converter = createConverter();
let window;
const hasInstanceLock=app.requestSingleInstanceLock();
if(!hasInstanceLock)app.quit();
else app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
let settings = { binvoxPath: '', resourceLimits: normalizeResourceLimits() };
function effectiveBinvox() {
  if (settings.binvoxPath) return { binvoxPath: settings.binvoxPath, source: 'custom', architecture: 'custom' };
  const architecture = process.platform === 'darwin' ? 'x64' : process.arch;
  const platformFolder = process.platform + '-' + architecture;
  const resourceRoot = app.isPackaged ? process.resourcesPath : path.join(__dirname, '../resources');
  return { binvoxPath: path.join(resourceRoot, 'binvox', platformFolder, process.platform === 'win32' ? 'binvox.exe' : 'binvox'), source: 'bundled', architecture };
}
async function checkBinvox() {
  const selected = effectiveBinvox();
  try {
    if (!(await fs.stat(selected.binvoxPath)).isFile()) throw new Error('Executable is missing');
    await new Promise((resolve, reject) => {
      execFile(selected.binvoxPath, ['-license'], { timeout: 10000, maxBuffer: 32768, windowsHide: true, shell: false }, (error, stdout) => {
        if (error) reject(error);
        else if (!stdout.includes('binvox')) reject(new Error('The executable did not identify itself as binvox'));
        else resolve();
      });
    });
    const message = process.platform === 'darwin' && process.arch === 'arm64' && selected.source === 'bundled' ? 'Bundled binvox is ready through Rosetta 2.' : 'binvox is ready.';
    return { ...selected, available: true, message };
  } catch (error) {
    const rosetta = process.platform === 'darwin' && process.arch === 'arm64' && selected.source === 'bundled' ? ' The bundled executable requires Rosetta 2 on Apple Silicon.' : '';
    return { ...selected, available: false, source: selected.source === 'bundled' ? 'missing' : selected.source, message: 'binvox could not start. Choose a compatible executable in Settings.' + rosetta + ' ' + error.message };
  }
}
function developmentURL() {
  if (!process.env.VOXEL_DEV_URL || app.isPackaged) return null;
  const url = new URL(process.env.VOXEL_DEV_URL);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) throw new Error('VOXEL_DEV_URL must use loopback HTTP');
  return url.href;
}
function register(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted IPC sender');
    return handler(...args);
  });
}
app.whenReady().then(async () => {
  if(!hasInstanceLock)return;
  const settingsFile = path.join(app.getPath('userData'), 'settings.json');
  try {
    const saved = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
    if (typeof saved.binvoxPath === 'string' && path.isAbsolute(saved.binvoxPath)) settings.binvoxPath = saved.binvoxPath;
    if (saved.resourceLimits) settings.resourceLimits = normalizeResourceLimits(saved.resourceLimits);
  } catch {}
  let settingsWrite = Promise.resolve();
  function updateSettings(update) {
    const operation = settingsWrite.then(async () => {
      const next = { ...settings, ...update };
      const temporary = settingsFile + '.' + randomUUID() + '.tmp';
      await fs.mkdir(path.dirname(settingsFile), { recursive: true });
      try {
        await fs.writeFile(temporary, JSON.stringify(next), { encoding: 'utf8', flag: 'wx' });
        await fs.rename(temporary, settingsFile);
        settings = next;
      } finally {
        await fs.rm(temporary, { force: true });
      }
    });
    settingsWrite = operation.catch(() => {});
    return operation;
  }
  const devURL = developmentURL();
  const index = path.join(__dirname, '../dist/index.html');
  const entryURL = devURL || pathToFileURL(index).href;
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window = new BrowserWindow({ width: 1440, height: 900, minWidth: 1000, minHeight: 650, title: 'Voxel Studio', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false;
    try {
      const url = new URL(details.url);
      allowed = url.protocol === 'blob:' || url.protocol === 'data:';
      if (devURL) allowed ||= url.origin === new URL(devURL).origin || (url.protocol === 'ws:' && url.host === new URL(devURL).host);
      else if (url.protocol === 'file:') {
        allowed ||= isLocalResourceURL(url.href, path.join(__dirname, '../dist')); 
      }
    } catch {}
    callback({ cancel: !allowed });
  });
  register('desktop:settings', () => ({ binvoxPath: effectiveBinvox().binvoxPath, resourceLimits: { ...settings.resourceLimits } }));
  register('desktop:set-resource-limits', async limits => {
    const resourceLimits = normalizeResourceLimits(limits);
    await updateSettings({ resourceLimits });
    return resourceLimits;
  });
  register('desktop:check-binvox', () => checkBinvox());
  register('desktop:choose-binvox', async () => {
    const result = await dialog.showOpenDialog(window, { title: 'Choose binvox executable', properties: ['openFile'], filters: process.platform === 'win32' ? [{ name: 'Executable', extensions: ['exe'] }] : [] });
    if (result.canceled) return null;
    const selected = result.filePaths[0];
    if (!(await fs.stat(selected)).isFile()) throw new Error('Choose an executable file');
    await updateSettings({ binvoxPath: selected });
    return selected;
  });
  register('desktop:convert', request => converter.convert(effectiveBinvox().binvoxPath, request, settings.resourceLimits));
  register('desktop:cancel', () => converter.cancel());
  register('desktop:open', async () => {
    const result = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'Voxel Studio project', extensions: ['vxlproj'] }] });
    if (result.canceled) return null;
    const selected = result.filePaths[0];
    if (path.extname(selected).toLowerCase() !== '.vxlproj') throw new Error('Choose a .vxlproj project');
    const projectBytes = settings.resourceLimits.projectBytes;
    if (projectBytes && (await fs.stat(selected)).size > projectBytes) throw new Error('Project exceeds the configured byte budget');
    const data = await fs.readFile(selected);
    if (projectBytes && data.byteLength > projectBytes) throw new Error('Project exceeds the configured byte budget');
    if (data[0] !== 0x50 || data[1] !== 0x4b) throw new Error('Project must be a ZIP archive');
    return { name: path.basename(selected), data };
  });
  register('desktop:save', async (name, data) => {
    if (typeof name !== 'string' || !name || name.length > 200 || /[\\/\x00-\x1f]/.test(name)) throw new Error('Invalid output filename');
    if (!(data instanceof Uint8Array)) throw new Error('Invalid output data');
    if (settings.resourceLimits.projectBytes && data.byteLength > settings.resourceLimits.projectBytes) throw new Error('Output exceeds the configured project byte budget');
    const result = await dialog.showSaveDialog(window, { defaultPath: name });
    if (result.canceled || !result.filePath) return false;
    const temporary = path.join(path.dirname(result.filePath), '.voxel-studio-' + randomUUID() + '.tmp');
    try {
      await fs.writeFile(temporary, data, { flag: 'wx' });
      await fs.rename(temporary, result.filePath);
    } finally {
      await fs.rm(temporary, { force: true });
    }
    return true;
  });
  window.on('closed', () => { converter.cancel(); window = null; });
  if (devURL) await window.loadURL(entryURL); else await window.loadFile(index);
}).catch(error => { dialog.showErrorBox('Voxel Studio could not start', error.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => converter.cancel());
