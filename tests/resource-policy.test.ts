import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { isLocalResourceURL } = require('../desktop/resource-policy.cjs');
const root = 'C:/Users/ARTIST~1/AppData/Local/Temp/portable/resources/app.asar/dist';
describe('packaged resource paths', () => {
  it('accepts Chromium literal tilde and Node percent-encoded tilde equally', () => {
    for (const user of ['ARTIST~1', 'ARTIST%7E1', 'ARTIST%7e1']) {
      expect(isLocalResourceURL('file:///C:/Users/' + user + '/AppData/Local/Temp/portable/resources/app.asar/dist/index.html', root, 'win32')).toBe(true);
    }
  });
  it('accepts Windows case variations and encoded spaces in bundled assets', () => {
    expect(isLocalResourceURL('file:///c:/users/artist~1/appdata/local/temp/portable/resources/app.asar/dist/assets/a%20b.js', root, 'win32')).toBe(true);
  });
  it('rejects adjacent folders, traversal, other drives and remote files', () => {
    for (const url of [
      'file:///C:/Users/ARTIST~1/AppData/Local/Temp/portable/resources/app.asar/dist-evil/index.html',
      'file:///C:/Users/ARTIST~1/AppData/Local/Temp/portable/resources/app.asar/dist/%2e%2e/desktop/main.cjs',
      'file:///D:/private.txt', 'file://server/share/index.html', 'https://example.com/index.html',
      'file:///C:/Users/ARTIST~1/AppData/Local/Temp/portable/resources/app.asar/dist/%2f..%2fprivate.txt'
    ]) expect(isLocalResourceURL(url, root, 'win32')).toBe(false);
  });
  it('handles macOS application paths without ignoring case', () => {
    const mac = '/Applications/方境 Voxel Studio.app/Contents/Resources/app.asar/dist';
    expect(isLocalResourceURL('file:///Applications/%E6%96%B9%E5%A2%83%20Voxel%20Studio.app/Contents/Resources/app.asar/dist/index.html', mac, 'darwin')).toBe(true);
    expect(isLocalResourceURL('file:///Applications/other.app/Contents/Resources/app.asar/dist/index.html', mac, 'darwin')).toBe(false);
  });
});
