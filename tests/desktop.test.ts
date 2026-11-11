import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { createConverter, validateRequest } = require('../desktop/binvox.cjs');
const request = { obj: 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3', resolution: 32 };
function fakeChild() {
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill() { queueMicrotask(() => child.emit('close', null)); return true; } });
  return child;
}
describe('desktop binvox boundary', () => {
  it('accepts every supported resolution', () => {
    for (const resolution of [32, 64, 128, 256, 512]) expect(() => validateRequest({ ...request, resolution })).not.toThrow();
  });
  it('rejects invalid resolution, empty and external-file OBJ', () => {
    expect(() => validateRequest({ ...request, resolution: 96 })).toThrow();
    expect(() => validateRequest({ ...request, obj: '' })).toThrow();
    expect(() => validateRequest({ ...request, obj: 'mtllib ../../private.mtl' })).toThrow();
  });
  it('passes executable paths and arguments without shell quoting and removes its job folder on failure', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'desktop-test-'));
    let captured: any;
    const converter = createConverter({ tempRoot, spawn: (...args: any[]) => {
      captured = args;
      const child = fakeChild();
      queueMicrotask(() => { child.stderr.write('failed geometry'); child.emit('close', 7); });
      return child;
    } });
    try {
      const executable = path.join(tempRoot, 'binary with spaces & characters.exe');
      await expect(converter.convert(executable, request)).rejects.toThrow('code 7');
      expect(captured[0]).toBe(executable);
      expect(captured[1].slice(0, 3)).toEqual(['-e', '-d', '32']);
      expect(captured[2].shell).toBe(false);
      expect(await readdir(tempRoot)).toEqual([]);
    } finally { await rm(tempRoot, { recursive: true, force: true }); }
  });
  it('reports launch failures', async () => {
    const converter = createConverter({ spawn: () => { const child = fakeChild(); queueMicrotask(() => child.emit('error', new Error('ENOENT'))); return child; } });
    await expect(converter.convert(path.resolve('missing.exe'), request)).rejects.toThrow('Cannot launch binvox');
  });
  it('cancels an in-flight process and rejects concurrent conversion', async () => {
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const converter = createConverter({ spawn: () => { const child = fakeChild(); started(); return child; } });
    const pending = converter.convert(path.resolve('binvox.exe'), request);
    await ready;
    await expect(converter.convert(path.resolve('binvox.exe'), request)).rejects.toThrow('already running');
    converter.cancel();
    await expect(pending).rejects.toThrow('cancelled');
  });
  it('terminates timed-out conversion', async () => {
    const converter = createConverter({ timeoutMs: 10, spawn: fakeChild });
    await expect(converter.convert(path.resolve('binvox.exe'), request)).rejects.toThrow('timed out');
  });
});
