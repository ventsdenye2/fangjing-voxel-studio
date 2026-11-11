import { gzip } from 'fflate';
import type { SourceFile } from './types';

export const MAX_SOURCE_BYTES = 512 * 1024 * 1024;
export interface SourceCodecOptions {
  /** A smaller per-operation decoded-size budget can be supplied by callers. */
  maxTotalBytes?: number;
}

function budget(options: SourceCodecOptions): number {
  const limit = options.maxTotalBytes ?? MAX_SOURCE_BYTES;
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_SOURCE_BYTES) {
    throw new Error('Source size budget must be between 0 and 512 MiB');
  }
  return limit;
}

function base64Length(data: string): number {
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw new Error('Invalid source base64 data');
  }
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return data.length / 4 * 3 - padding;
}

function decodeBlock(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let result = '';
  // A multiple of three avoids intermediate padding between blocks.
  for (let offset = 0; offset < bytes.length; offset += 49152) {
    const end = Math.min(bytes.length, offset + 49152);
    let binary = '';
    for (let index = offset; index < end; index++) binary += String.fromCharCode(bytes[index]);
    result += btoa(binary);
  }
  return result;
}

export async function encodeSourceFiles(files: File[], options: SourceCodecOptions = {}): Promise<SourceFile[]> {
  const limit = budget(options);
  let total = 0;
  for (const file of files) {
    total += file.size;
    if (total > limit) throw new Error('Source files exceed the decoded size budget');
  }
  const result: SourceFile[] = [];
  // Sequential compression limits the operation to one compression worker.
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const compressed = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
      gzip(bytes, { level: 6, consume: true }, (error, data) => {
        if (error) reject(error);
        else resolve(data);
      });
    });
    result.push({ name: file.webkitRelativePath || file.name, data: encodeBase64(compressed), encoding: 'gzip-base64' });
  }
  return result;
}

async function decodeGzip(source: SourceFile, reserve: (length: number) => void): Promise<File> {
  let offset = 0;
  // Backpressure and small compressed chunks bound transient expansion even
  // when a hostile stream expands far beyond its declared original size.
  const input = new ReadableStream<Uint8Array<ArrayBuffer>>({
    pull(controller) {
      if (offset === source.data.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + 4096, source.data.length);
      controller.enqueue(decodeBlock(source.data.slice(offset, end)));
      offset = end;
    },
  });
  const reader = input.pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks: Blob[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      reserve(value.byteLength);
      chunks.push(new Blob([value as Uint8Array<ArrayBuffer>]));
    }
    return new File(chunks, source.name);
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function decodeSourceFiles(files: SourceFile[], options: SourceCodecOptions = {}): Promise<File[]> {
  const limit = budget(options);
  let encodedBytes = 0;
  const encodedLimit = MAX_SOURCE_BYTES + Math.ceil(MAX_SOURCE_BYTES * 0.01) + files.length * 64;
  for (const source of files) {
    if (typeof source.name !== 'string' || typeof source.data !== 'string') throw new Error('Invalid source file');
    if (source.encoding !== undefined && source.encoding !== 'gzip-base64') throw new Error('Unsupported source file encoding');
    encodedBytes += base64Length(source.data);
    if (encodedBytes > encodedLimit) throw new Error('Encoded source files exceed the input size budget');
  }
  let decodedBytes = 0;
  const reserve = (length: number) => {
    decodedBytes += length;
    if (decodedBytes > limit) throw new Error('Source files exceed the decoded size budget');
  };
  const result: File[] = [];
  for (const source of files) {
    if (source.encoding === 'gzip-base64') {
      result.push(await decodeGzip(source, reserve));
    } else {
      reserve(base64Length(source.data));
      const chunks: Blob[] = [];
      for (let offset = 0; offset < source.data.length; offset += 65536) {
        chunks.push(new Blob([decodeBlock(source.data.slice(offset, offset + 65536))]));
      }
      result.push(new File(chunks, source.name));
    }
  }
  return result;
}
