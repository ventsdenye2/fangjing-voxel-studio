import {zipSync, unzipSync, strToU8, strFromU8} from 'fflate';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {buildProjectScene} from './mesh';
import {assertBudget, getResourceLimits, type ResourceLimits} from './resource-limits';
import type {Project, SceneNode, SourceFile} from './types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sourceByteLength(data: string): number {
  assert(data.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(data), 'Invalid source base64 data');
  return data.length / 4 * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
}

export function validateProject(value: unknown, limits: ResourceLimits = getResourceLimits()): asserts value is Project {
  assert(value && typeof value === 'object', 'Invalid project');
  const p = value as Project;
  assert(p.schemaVersion === 1 && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.updatedAt === 'string', 'Invalid project header');
  assert(Array.isArray(p.assets) && Array.isArray(p.nodes) && Array.isArray(p.sources), 'Invalid project collections');
  const vector = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n));
  const ids = new Set<string>();
  for (const a of p.assets) {
    let cellCount = 0;
    assert(a && typeof a.id === 'string' && !ids.has(a.id), 'Duplicate asset');
    ids.add(a.id);
    assert(typeof a.name === 'string' && vector(a.dimensions) && a.dimensions.every(n => Number.isSafeInteger(n) && n > 0 && n <= 512) && vector(a.origin) && Number.isFinite(a.voxelSize) && a.voxelSize > 0, 'Invalid asset');
    assert(a.cells && typeof a.cells === 'object' && !Array.isArray(a.cells), 'Invalid cells');
    for (const key in a.cells) {
      if (!Object.hasOwn(a.cells, key)) continue;
      assertBudget(++cellCount, limits.occupiedVoxels, 'Occupied voxels');
      const parts = key.split(',');
      assert(parts.length === 3 && parts.every((n, i) => /^(0|[1-9]\d*)$/.test(n) && Number(n) < a.dimensions[i]) && typeof a.cells[key] === 'string' && /^#[0-9a-f]{6}$/i.test(a.cells[key]), 'Invalid cell');
    }
  }
  const nodes = new Map<string, SceneNode>();
  for (const n of p.nodes) {
    assert(n && typeof n.id === 'string' && !nodes.has(n.id) && typeof n.name === 'string' && ['mesh', 'group', 'spawn', 'trigger'].includes(n.kind) && vector(n.position) && vector(n.rotation) && vector(n.scale) && typeof n.visible === 'boolean' && typeof n.locked === 'boolean' && Array.isArray(n.tags) && n.tags.every(t => typeof t === 'string'), 'Invalid or duplicate node');
    assert(n.assetId === undefined || typeof n.assetId === 'string' && ids.has(n.assetId), 'Missing asset');
    assert(n.parentId === undefined || typeof n.parentId === 'string', 'Invalid parent');
    nodes.set(n.id, n);
  }
  // Completed ancestor chains make validation linear even for deep artist scenes.
  const completed = new Set<string>();
  for (const n of p.nodes) {
    const visited = new Set<string>();
    let current: SceneNode | undefined = n;
    while (current && !completed.has(current.id)) {
      assert(!visited.has(current.id), 'Cyclic hierarchy');
      visited.add(current.id);
      assert(current.parentId === undefined || nodes.has(current.parentId), 'Missing parent');
      current = current.parentId === undefined ? undefined : nodes.get(current.parentId);
    }
    for (const id of visited) completed.add(id);
  }
  const sourceIds = new Set<string>();
  for (const s of p.sources) {
    assert(s && typeof s.id === 'string' && !sourceIds.has(s.id) && typeof s.name === 'string' && Array.isArray(s.files), 'Invalid source');
    sourceIds.add(s.id);
    for (const f of s.files) {
      assert(f && typeof f.name === 'string' && typeof f.data === 'string' && (f.encoding === undefined || f.encoding === 'gzip-base64'), 'Invalid source file');
      sourceByteLength(f.data);
    }
  }
}

function decodeBase64(data: string): Uint8Array {
  const bytes = new Uint8Array(sourceByteLength(data));
  for (let offset = 0; offset < data.length; offset += 65536) {
    const binary = atob(data.slice(offset, offset + 65536));
    const start = offset / 4 * 3;
    for (let index = 0; index < binary.length; index++) bytes[start + index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  const blocks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 49152) {
    let binary = '';
    const end = Math.min(offset + 49152, bytes.length);
    for (let index = offset; index < end; index++) binary += String.fromCharCode(bytes[index]);
    blocks.push(btoa(binary));
  }
  return blocks.join('');
}

interface ArchiveManifest {
  archiveVersion: 2;
  project: Omit<Project, 'assets' | 'sources'>;
  assets: string[];
  sources: {id: string; name: string; files: {name: string; entry: string; encoding?: SourceFile['encoding']}[]}[];
}

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  crcTable[index] = value;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
  return (crc ^ 0xffffffff) >>> 0;
}

function archiveChecksums(data: Uint8Array, count: number): number[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = data.length - 22;
  while (end >= 0 && (view.getUint32(end, true) !== 0x06054b50 || end + 22 + view.getUint16(end + 20, true) !== data.length)) end--;
  assert(end >= 0, 'Invalid archive directory');
  let offset = view.getUint32(end + 16, true);
  if (offset === 0xffffffff) {
    assert(end >= 20 && view.getUint32(end - 20, true) === 0x07064b50, 'Invalid ZIP64 directory');
    const zip64 = Number(view.getBigUint64(end - 12, true));
    assert(Number.isSafeInteger(zip64) && zip64 >= 0 && zip64 + 56 <= data.length && view.getUint32(zip64, true) === 0x06064b50, 'Invalid ZIP64 directory');
    offset = Number(view.getBigUint64(zip64 + 48, true));
  }
  const checksums: number[] = [];
  for (let index = 0; index < count; index++) {
    assert(Number.isSafeInteger(offset) && offset >= 0 && offset + 46 <= end && view.getUint32(offset, true) === 0x02014b50, 'Invalid archive entry directory');
    assert((view.getUint16(offset + 8, true) & 1) === 0, 'Encrypted archive entries are unsupported');
    checksums.push(view.getUint32(offset + 16, true));
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  assert(offset <= end, 'Invalid archive directory size');
  return checksums;
}

export function encodeProject(project: Project, limits: ResourceLimits = getResourceLimits()): Uint8Array {
  validateProject(project, limits);
  let entryCount = project.assets.length + 1;
  for (const source of project.sources) entryCount += source.files.length;
  assert(Number.isSafeInteger(entryCount) && entryCount <= 65535, 'ZIP format supports at most 65535 archive entries. Split this project into multiple archives.');
  const files: Record<string, Uint8Array> = Object.create(null);
  let expanded = 0;
  let zipUpperBound = 22;
  const add = (name: string, bytes: Uint8Array) => {
    assert(bytes.length <= 0xffffffff, 'ZIP format supports at most 4 GiB per archive entry. Split this project into multiple archives.');
    // fflate reserves this DEFLATE worst-case bound. Include both ZIP headers
    // so standard-ZIP offsets remain representable before compression starts.
    const deflateUpperBound = bytes.length + 5 * (1 + Math.ceil(bytes.length / 7000));
    zipUpperBound += 76 + 2 * strToU8(name).length + deflateUpperBound;
    assert(zipUpperBound <= 0xffffffff, 'ZIP format requires archive offsets below 4 GiB. This archive exceeds the safe compression bound. Split this project into multiple archives.');
    expanded += bytes.length;
    assertBudget(expanded, limits.projectBytes, 'Expanded project bytes');
    files[name] = bytes;
  };
  const {assets, sources, ...header} = project;
  const manifest: ArchiveManifest = {archiveVersion: 2, project: header, assets: [], sources: []};
  assets.forEach((asset, index) => {
    const entry = `assets/${index}.json`;
    manifest.assets.push(entry);
    add(entry, strToU8(JSON.stringify(asset)));
  });
  sources.forEach((source, sourceIndex) => {
    const stored = {id: source.id, name: source.name, files: [] as ArchiveManifest['sources'][number]['files']};
    source.files.forEach((file, fileIndex) => {
      const entry = `sources/${sourceIndex}/${fileIndex}.bin`;
      stored.files.push({name: file.name, entry, ...(file.encoding ? {encoding: file.encoding} : {})});
      assertBudget(expanded + sourceByteLength(file.data), limits.projectBytes, 'Expanded project bytes');
      add(entry, decodeBase64(file.data));
    });
    manifest.sources.push(stored);
  });
  add('manifest.json', strToU8(JSON.stringify(manifest)));
  const encoded = zipSync(files, {level: 6});
  assert(encoded.length <= 0xffffffff, 'ZIP format supports archive offsets below 4 GiB. Split this project into multiple archives.');
  assertBudget(encoded.length, limits.projectBytes, 'Compressed project bytes');
  return encoded;
}

export function decodeProject(bytes: Uint8Array | ArrayBuffer, limits: ResourceLimits = getResourceLimits()): Project {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  assertBudget(data.length, limits.projectBytes, 'Compressed project bytes');
  const names = new Set<string>();
  const sizes: number[] = [];
  let expanded = 0;
  // Scan all central-directory sizes before any entry is inflated.
  unzipSync(data, {filter: file => {
    assert(file.name === 'project.json' || file.name === 'manifest.json' || /^assets\/(0|[1-9]\d*)\.json$/.test(file.name) || /^sources\/(0|[1-9]\d*)\/(0|[1-9]\d*)\.bin$/.test(file.name), 'Unexpected archive entry');
    assert(!names.has(file.name), 'Duplicate archive entry');
    names.add(file.name);
    assert(Number.isSafeInteger(file.originalSize) && file.originalSize >= 0, 'Invalid archive size');
    expanded += file.originalSize;
    assert(Number.isSafeInteger(expanded), 'Invalid expanded archive size');
    assertBudget(expanded, limits.projectBytes, 'Expanded project bytes');
    sizes.push(file.originalSize);
    return false;
  }});
  const checksums = archiveChecksums(data, names.size);
  const files = unzipSync(data);
  let index = 0;
  for (const name of names) {
    assert(files[name].length === sizes[index] && crc32(files[name]) === checksums[index], 'Archive entry size or checksum mismatch');
    index++;
  }
  if (names.has('project.json')) {
    assert(names.size === 1, 'Unexpected legacy archive entry');
    const value: unknown = JSON.parse(strFromU8(files['project.json']));
    validateProject(value, limits);
    return value;
  }
  assert(files['manifest.json'], 'Missing manifest.json');
  const manifest = JSON.parse(strFromU8(files['manifest.json'])) as ArchiveManifest;
  assert(manifest && manifest.archiveVersion === 2 && manifest.project && typeof manifest.project === 'object' && Array.isArray(manifest.assets) && Array.isArray(manifest.sources), 'Invalid archive manifest');
  const used = new Set(['manifest.json']);
  const take = (entry: unknown, expected: string): Uint8Array => {
    assert(entry === expected && files[expected] && !used.has(expected), 'Missing or invalid archive entry');
    used.add(expected);
    return files[expected];
  };
  const assets = manifest.assets.map((entry, index) => JSON.parse(strFromU8(take(entry, `assets/${index}.json`))));
  const sources = manifest.sources.map((source, sourceIndex) => {
    assert(source && typeof source.id === 'string' && typeof source.name === 'string' && Array.isArray(source.files), 'Invalid source manifest');
    const sourceFiles = source.files.map((file, fileIndex) => {
      assert(file && typeof file.name === 'string' && (file.encoding === undefined || file.encoding === 'gzip-base64'), 'Invalid source file manifest');
      const binary = take(file.entry, `sources/${sourceIndex}/${fileIndex}.bin`);
      return {name: file.name, data: encodeBase64(binary), ...(file.encoding ? {encoding: file.encoding} : {})};
    });
    return {id: source.id, name: source.name, files: sourceFiles};
  });
  assert(used.size === names.size, 'Unreferenced archive entry');
  const project: unknown = {...manifest.project, assets, sources};
  validateProject(project, limits);
  return project;
}

export async function exportSceneGlb(project: Project): Promise<ArrayBuffer> {
  validateProject(project);
  return await new GLTFExporter().parseAsync(buildProjectScene(project), {binary: true, onlyVisible: true}) as ArrayBuffer;
}
