const path = require('node:path');
const fs = require('node:fs/promises');
function projectArguments(argv, cwd, development = false) {
  return argv.slice(development ? 2 : 1)
    .filter(value => typeof value === 'string' && !value.startsWith('-') && path.extname(value).toLowerCase() === '.vxlproj')
    .map(value => path.resolve(cwd, value));
}
async function readProjectFile(selected, projectBytes) {
  const stat = await fs.stat(selected);
  if (!stat.isFile()) throw new Error('请选择方境工程文件，而不是文件夹。');
  if (projectBytes && stat.size > projectBytes) throw new Error('Project exceeds the configured byte budget');
  const data = await fs.readFile(selected);
  if (projectBytes && data.byteLength > projectBytes) throw new Error('Project exceeds the configured byte budget');
  if (data[0] !== 0x50 || data[1] !== 0x4b) throw new Error('这不是方境工程文件。请打开“保存”或“可编辑工程包”生成的文件。');
  return { name: path.basename(selected), data };
}
module.exports = { projectArguments, readProjectFile };
