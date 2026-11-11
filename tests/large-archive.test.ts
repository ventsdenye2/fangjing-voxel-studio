import {describe, expect, it} from 'vitest';
import {gzipSync, strFromU8, strToU8, unzipSync, zipSync} from 'fflate';
import {decodeProject, encodeProject, validateProject} from '../src/core/archive';
import {getResourceLimits} from '../src/core/resource-limits';
import type {Project, SceneNode, VoxelAsset} from '../src/core/types';

const asset: VoxelAsset = {id: 'asset', name: '方块', dimensions: [2, 2, 2], voxelSize: 1, origin: [0, 0, 0], cells: {'0,0,0': '#123456'}};
const project: Project = {schemaVersion: 1, id: 'p', name: '场景', updatedAt: '2026-11-11', assets: [asset], nodes: [], sources: []};

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe('split project archive', () => {
  it('round trips more than 256 assets and sources as separate binary entries', () => {
    const large: Project = {
      ...project,
      assets: Array.from({length: 257}, (_, index) => ({...asset, id: `a${index}`})),
      sources: Array.from({length: 257}, (_, index) => ({id: `s${index}`, name: '模型', files: [{name: 'nested/mesh.obj', data: btoa('mesh')}]})),
    };
    const encoded = encodeProject(large);
    const entries = unzipSync(encoded);
    expect(entries['project.json']).toBeUndefined();
    expect(strFromU8(entries['sources/256/0.bin'])).toBe('mesh');
    const manifest = strFromU8(entries['manifest.json']);
    expect(manifest).not.toContain('bWVzaA==');
    expect(decodeProject(encoded)).toEqual(large);
  });

  it('keeps gzip source encoding and bytes, including base64 block boundaries', () => {
    const data = new Uint8Array(100_003);
    for (let index = 0; index < data.length; index++) data[index] = index % 251;
    const compressed = gzipSync(data);
    const value: Project = {...project, sources: [{id: 'source', name: 'test', files: [
      {name: 'raw.bin', data: base64(data)},
      {name: 'gzip.bin', data: base64(compressed), encoding: 'gzip-base64'},
    ]}]};
    const bytes = encodeProject(value);
    expect(unzipSync(bytes)['sources/0/1.bin']).toEqual(compressed);
    expect(decodeProject(bytes)).toEqual(value);
  });

  it('reads legacy single-project JSON archives', () => {
    const bytes = zipSync({'project.json': strToU8(JSON.stringify(project))});
    expect(decodeProject(bytes)).toEqual(project);
  });

  it('rejects standard ZIP entry-count overflow before creating archive contents', () => {
    const value: Project = {...project, sources: [{id: 's', name: 'source', files: Array.from({length: 65535}, () => ({name: 'empty', data: ''}))}]};
    expect(() => encodeProject(value, {...getResourceLimits(), projectBytes: 0})).toThrow(/ZIP format/);
  });

  it('uses configurable project and voxel budgets with zero disabling the application cap', () => {
    const limits = getResourceLimits();
    expect(() => encodeProject(project, {...limits, projectBytes: 1})).toThrow();
    const encoded = encodeProject(project, {...limits, projectBytes: 0});
    expect(() => decodeProject(encoded, {...limits, projectBytes: 1})).toThrow();
    expect(decodeProject(encoded, {...limits, projectBytes: 0})).toEqual(project);
    const twoCells: Project = {...project, assets: [{...asset, cells: {...asset.cells, '1,0,0': '#ffffff'}}]};
    expect(() => validateProject(twoCells, {...limits, occupiedVoxels: 1})).toThrow();
    expect(() => validateProject(twoCells, {...limits, occupiedVoxels: 0})).not.toThrow();
    const separateAssets = {...project, assets: [asset, {...asset, id: 'second'}]};
    expect(() => validateProject(separateAssets, {...limits, occupiedVoxels: 1})).not.toThrow();
    const legacy = zipSync({'project.json': strToU8(JSON.stringify(project))});
    expect(() => decodeProject(legacy, {...limits, projectBytes: 1})).toThrow();
  });

  it('checks compressed archive bytes as well as expanded contents', () => {
    const empty: Project = {...project, assets: []};
    const unlimited = {...getResourceLimits(), projectBytes: 0};
    const encoded = encodeProject(empty, unlimited);
    const expanded = Object.values(unzipSync(encoded)).reduce((sum, bytes) => sum + bytes.length, 0);
    expect(encoded.length).toBeGreaterThan(expanded);
    const limits = {...unlimited, projectBytes: expanded};
    expect(() => encodeProject(empty, limits)).toThrow(/Compressed project bytes/);
    expect(() => decodeProject(encoded, limits)).toThrow(/Compressed project bytes/);
  });

  it('validates more than 10000 nodes and detects deep hierarchy cycles', () => {
    const nodes: SceneNode[] = Array.from({length: 10_001}, (_, index) => ({
      id: `node${index}`, parentId: index === 10_000 ? undefined : `node${index + 1}`,
      name: 'group', kind: 'group', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true, locked: false, tags: [],
    }));
    expect(() => validateProject({...project, nodes})).not.toThrow();
    nodes[10_000].parentId = 'node0';
    expect(() => validateProject({...project, nodes})).toThrow(/Cyclic/);
  });

  it('rejects missing, unreferenced and path-traversal entries', () => {
    const entries = unzipSync(encodeProject(project));
    const missing = {...entries};
    delete missing['assets/0.json'];
    expect(() => decodeProject(zipSync(missing))).toThrow(/Missing/);
    expect(() => decodeProject(zipSync({...entries, 'assets/1.json': entries['assets/0.json']}))).toThrow(/Unreferenced/);
    expect(() => decodeProject(zipSync({...entries, '../project.json': strToU8('{}')}))).toThrow(/Unexpected/);
    const manifest = JSON.parse(strFromU8(entries['manifest.json']));
    manifest.assets[0] = '../assets/0.json';
    expect(() => decodeProject(zipSync({...entries, 'manifest.json': strToU8(JSON.stringify(manifest))}))).toThrow(/invalid archive entry/);
  });

  it('rejects duplicate directory names before inflating entries', () => {
    const entries = unzipSync(encodeProject(project));
    const encoded = zipSync({...entries, 'assets/1.json': entries['assets/0.json']}, {level: 0});
    const needle = strToU8('assets/1.json');
    for (let offset = 0; offset <= encoded.length - needle.length; offset++) {
      if (needle.every((byte, index) => encoded[offset + index] === byte)) encoded[offset + 7] = 48;
    }
    expect(() => decodeProject(encoded)).toThrow(/Duplicate/);
  });

  it('checks entry checksums and declared uncompressed sizes', () => {
    const encoded = encodeProject(project);
    const corruptCrc = encoded.slice();
    const corruptSize = encoded.slice();
    const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    for (let offset = 0; offset <= encoded.length - 46; offset++) {
      if (view.getUint32(offset, true) === 0x02014b50) {
        corruptCrc[offset + 16] ^= 1;
        new DataView(corruptSize.buffer).setUint32(offset + 24, 1, true);
        break;
      }
    }
    expect(() => decodeProject(corruptCrc)).toThrow(/checksum/);
    expect(() => decodeProject(corruptSize)).toThrow();
  });
});
