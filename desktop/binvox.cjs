const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { normalizeResourceLimits } = require('./resource-limits.cjs');
const MAX_LOG_BYTES = 64 * 1024;
function validateRequest(request, resourceLimits) {
  const limits = normalizeResourceLimits(resourceLimits);
  if (!request || ![32, 64, 128, 256, 512].includes(request.resolution) || typeof request.obj !== 'string') throw new Error('Invalid conversion request');
  if (!request.obj.trim() || request.obj.includes('\0')) throw new Error('转换模型为空或包含无效文本');
  const bytes=Buffer.byteLength(request.obj);
  if (limits.conversionBytes && bytes > limits.conversionBytes) throw new Error('转换几何数据超过设置中的转换输入预算 (' + limits.conversionBytes + ' bytes)');
  // Only geometry is needed. Forbid directives that load external files.
  if (/^\s*(?:mtllib|call|csh)\s/im.test(request.obj)) throw new Error('External OBJ file directives are unsupported');
}
function createConverter(options = {}) {
  let active = null;
  const spawnProcess = options.spawn || spawn;
  async function convert(executable, request, resourceLimits) {
    const limits = normalizeResourceLimits(resourceLimits);
    validateRequest(request, limits);
    const timeoutMs = options.timeoutMs ?? limits.conversionTimeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 2147483647) throw new Error('Invalid conversion timeout');
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
        try { if(child.pid) os.setPriority(child.pid,os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}
        child.stdout.on('data', append);
        child.stderr.on('data', append);
        const timer = timeoutMs > 0 ? setTimeout(() => { job.timedOut = true; child.kill('SIGKILL'); }, timeoutMs) : undefined;
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
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid binvox output');
      if (limits.projectBytes && stat.size > limits.projectBytes) throw new Error('binvox output exceeds the project byte budget');
      const data = await fs.readFile(output);
      if (!data.subarray(0, 9).equals(Buffer.from('#binvox 1')) && !data.subarray(0, 9).equals(Buffer.from('#binvox 2'))) throw new Error('Invalid binvox header');
      return { data, log };
    } finally {
      try { if (directory) await fs.rm(directory, { recursive: true, force: true }); }
      finally { active = null; }
    }
  }
  function cancel() { if (active) { active.cancelled = true; active.child?.kill('SIGKILL'); } }
  return { convert, cancel };
}
module.exports = { createConverter, validateRequest };
