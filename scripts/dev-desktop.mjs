import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const electron = require('electron');
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'inherit', windowsHide: true });
let desktop;
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  desktop?.kill();
  vite.kill();
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
vite.on('error', error => { console.error(error); stop(1); });
vite.on('exit', code => stop(code || 0));
try {
  const deadline = Date.now() + 30000;
  while (true) {
    if (stopping) throw new Error('Development server stopped');
    try { const response = await fetch('http://127.0.0.1:5173'); if (response.ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Development server startup timed out');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const env = { ...process.env, VOXEL_DEV_URL: 'http://127.0.0.1:5173' };
  delete env.ELECTRON_RUN_AS_NODE;
  desktop = spawn(electron, ['.'], { stdio: 'inherit', env, windowsHide: true });
  desktop.on('error', error => { console.error(error); stop(1); });
  desktop.on('exit', code => stop(code || 0));
} catch (error) { console.error(error); stop(1); }
