const path = require('node:path');
const projectOpenOptions = {
  title: '打开方境工程',
  properties: ['openFile'],
  filters: [
    { name: '方境工程', extensions: ['vxlproj', 'zip'] },
    { name: '所有文件（找回无后缀工程）', extensions: ['*'] }
  ]
};
async function chooseOutputPath(dialog, window, name) {
  const extension = path.extname(name).slice(1).toLowerCase();
  let defaultPath = name;
  for (;;) {
    const result = await dialog.showSaveDialog(window, {
      title: '保存文件',
      defaultPath,
      filters: extension ? [{ name: extension === 'vxlproj' ? '方境工程' : extension.toUpperCase(), extensions: [extension] }] : []
    });
    if (result.canceled || !result.filePath) return null;
    if (!extension || path.extname(result.filePath).toLowerCase() === '.' + extension) return result.filePath;
    // Reopen with the corrected name so the native dialog checks overwrites
    // against the actual destination, rather than a different extensionless file.
    defaultPath = result.filePath + '.' + extension;
  }
}
module.exports = { projectOpenOptions, chooseOutputPath };
