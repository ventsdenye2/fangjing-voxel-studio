const path = require('node:path');
const { fileURLToPath } = require('node:url');

// Compare decoded filesystem paths: Chromium and Node can spell an equivalent
// file URL differently (notably ~ versus %7E in Windows portable temp paths).
function isLocalResourceURL(requestURL, directory, platform = process.platform) {
  try {
    const url = new URL(requestURL);
    if (url.protocol !== 'file:') return false;
    const windows = platform === 'win32';
    const paths = windows ? path.win32 : path.posix;
    const target = fileURLToPath(url, { windows });
    const relative = paths.relative(paths.resolve(directory), paths.resolve(target));
    return relative !== '' && relative !== '..' && !relative.startsWith('..' + paths.sep) && !paths.isAbsolute(relative);
  } catch {
    return false;
  }
}
module.exports = { isLocalResourceURL };
