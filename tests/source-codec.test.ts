import { describe, expect, it } from 'vitest';
import { gzipSync } from 'fflate';
import { decodeSourceFiles, encodeSourceFiles, MAX_SOURCE_BYTES } from '../src/core/source-codec';

function encoded(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

describe('source file codec', () => {
  it('round trips text, binary bytes, relative names and empty files', async () => {
    const original = [
      new File(['v 0 0 0\n# 模型\n'], 'models/scene.obj'),
      new File([new Uint8Array([0, 1, 127, 128, 255])], 'textures/pixels.bin'),
      new File([], 'empty.txt'),
    ];
    const saved = await encodeSourceFiles(original);
    expect(saved.every(file => file.encoding === 'gzip-base64')).toBe(true);
    const restored = await decodeSourceFiles(saved);
    expect(restored.map(file => file.name)).toEqual(original.map(file => file.name));
    for (let index = 0; index < original.length; index++) {
      expect(new Uint8Array(await restored[index].arrayBuffer())).toEqual(new Uint8Array(await original[index].arrayBuffer()));
    }
  });

  it('decodes legacy base64 files with no encoding field', async () => {
    const [file] = await decodeSourceFiles([{name:'old.obj',data:btoa('v 1 2 3\n')}]);
    expect(file.name).toBe('old.obj');
    expect(await file.text()).toBe('v 1 2 3\n');
  });

  it('rejects malformed base64, unknown encodings and invalid gzip', async () => {
    await expect(decodeSourceFiles([{name:'bad',data:'***='}])).rejects.toThrow(/base64/);
    await expect(decodeSourceFiles([{name:'bad',data:'YQ'}])).rejects.toThrow(/base64/);
    await expect(decodeSourceFiles([{name:'bad',data:btoa('bad gzip'),encoding:'gzip-base64'}])).rejects.toThrow();
    await expect(decodeSourceFiles([{name:'bad',data:'',encoding:'other'} as never])).rejects.toThrow(/encoding/);
  });

  it('rejects truncated and checksum-corrupted compressed data', async () => {
    const compressed = gzipSync(new TextEncoder().encode('valid text'));
    await expect(decodeSourceFiles([{name:'short',data:encoded(compressed.subarray(0, compressed.length - 3)),encoding:'gzip-base64'}])).rejects.toThrow();
    compressed[compressed.length - 8] ^= 1;
    await expect(decodeSourceFiles([{name:'checksum',data:encoded(compressed),encoding:'gzip-base64'}])).rejects.toThrow();
  });

  it('enforces total input size before starting compression', async () => {
    await expect(encodeSourceFiles([new File(['123'], 'a'),new File(['456'], 'b')], {maxTotalBytes:5})).rejects.toThrow(/budget/);
  });

  it('enforces the aggregate decoded size across mixed old and new files', async () => {
    const compressed = await encodeSourceFiles([new File(['abcd'], 'compressed')]);
    await expect(decodeSourceFiles([{name:'legacy',data:btoa('abc')},...compressed], {maxTotalBytes:6})).rejects.toThrow(/budget/);
    const restored = await decodeSourceFiles(compressed, {maxTotalBytes:4});
    expect(await restored[0].text()).toBe('abcd');
  });

  it('stops a highly compressible expansion at the decoded budget', async () => {
    const data = encoded(gzipSync(new Uint8Array(32768)));
    await expect(decodeSourceFiles([{name:'expansion',data,encoding:'gzip-base64'}], {maxTotalBytes:32})).rejects.toThrow(/budget/);
  });

  it('validates configurable budgets and accepts zero-byte legacy files', async () => {
    await expect(decodeSourceFiles([], {maxTotalBytes:MAX_SOURCE_BYTES + 1})).rejects.toThrow(/budget/);
    await expect(encodeSourceFiles([], {maxTotalBytes:-1})).rejects.toThrow(/budget/);
    expect((await decodeSourceFiles([{name:'empty',data:''}], {maxTotalBytes:0}))[0].size).toBe(0);
  });
});
