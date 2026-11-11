const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const MAX_OBJ_BYTES = 64 * 1024 * 1024;
const MAX_LOG_BYTES = 64 * 1024;
function validateRequest(request) {
  if (!request || ![32, 64, 128, 256, 512].includes(request.resolution) || typeof request.obj !== 'string') throw new Error('Invalid conversion request');
  if (!request.obj.trim() || Buffer.byteLength(request.obj) > MAX_OBJ_BYTES || request.obj.includes('\0')) throw new Error('OBJ must contain 1–64 MiB of valid text');
  // Only geometry is needed. Forbid directives that load external files.
  if (/^\s*(?:mtllib|call|csh)\s/im.test(request.obj)) throw new Error('External OBJ file directives are unsupported');
}
function createConverter(options = {}) {
  let active = null;
  const spawnProcess = options.spawn || spawn;
  async function convert(executable, request) {
    validateRequest(request);
    if (active) throw new Error('A conversion is already running');
    if (typeof executable !== 'string' || !path.isAbsolute(executable)) throw new Error('Choose the binvox executable first');
    const job = { child: null, cancelled: false, timedOut: false };
    active = job;
    let directory;
    try {
      directory = await fs.mkdtemp(path.join(options.tempRoot || os.tmpdir(), 'voxel-studio-'));
      if (job.cancelled) throw new Error('Conversion cancelled');
      const input = path.join(directory, 'input.obj');
      await fs.writeFile(input, request.obj, { flag: 'wx' });
      let log = '';
      const append = chunk => { log = (log + chunk.toString()).slice(-MAX_LOG_BYTES); };
      await new Promise((resolve, reject) => {
        if (job.cancelled) return reject(new Error('Conversion cancelled'));
        const child = spawnProcess(executable, ['-e', '-d', String(request.resolution), input], { cwd: directory, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        job.child = child;
        child.stdout.on('data', append);
        child.stderr.on('data', append);
        const timer = setTimeout(() => { job.timedOut = true; child.kill('SIGKILL'); }, options.timeoutMs || 120000);
        child.once('error', error => { clearTimeout(timer); reject(new Error('Cannot launch binvox: ' + error.message)); });
        child.once('close', code => {
          clearTimeout(timer);
          if (job.cancelled) reject(new Error('Conversion cancelled'));
          else if (job.timedOut) reject(new Error('binvox timed out'));
          else if (code !== 0) reject(new Error('binvox exited with code ' + code + '\n' + log));
          else resolve();
        });
      });
      if (job.cancelled) throw new Error('Conversion cancelled');
      const output = path.join(directory, 'input.binvox');
      const stat = await fs.lstat(output);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024 * 1024 + 64 * 1024) throw new Error('Invalid binvox output');
      const data = await fs.readFile(output);
      if (!data.subarray(0, 9).equals(Buffer.from('#binvox 1')) && !data.subarray(0, 9).equals(Buffer.from('#binvox 2'))) throw new Error('Invalid binvox header');
      return { data: Array.from(data), log };
    } finally {
      try { if (directory) await fs.rm(directory, { recursive: true, force: true }); }
      finally { active = null; }
    }
  }
  function cancel() { if (active) { active.cancelled = true; active.child?.kill('SIGKILL'); } }
  return { convert, cancel };
}
module.exports = { createConverter, validateRequest };
