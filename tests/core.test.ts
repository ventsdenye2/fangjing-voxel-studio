import {MeshWorkerClient} from '../src/core/worker-mesh';
import {generateMergedFaces} from '../src/core/voxel-surface';
import * as THREE from 'three';
import {describe,it,expect,vi} from 'vitest';
import {applySourceColors,importModel} from '../src/core/model-import';
import {zipSync,strToU8} from 'fflate';
import {parseBinvox,MAX_OCCUPIED_VOXELS} from '../src/core/binvox';
import {buildVoxelGeometry,buildProjectScene} from '../src/core/mesh';
import {encodeProject,decodeProject} from '../src/core/archive';
import type {Project,VoxelAsset} from '../src/core/types';
const fixture=(rle:number[],dimensions='2 3 4')=>{const head=new TextEncoder().encode('#binvox 1\ndim '+dimensions+'\ntranslate 1 2 3\nscale 8\ndata\n');return new Uint8Array([...head,...rle]);};
const asset:VoxelAsset={id:'a',name:'Blocks',dimensions:[2,1,1],origin:[0,0,0],voxelSize:1,cells:{'0,0,0':'#808080','1,0,0':'#ffffff'}};
const project:Project={schemaVersion:1,id:'p',name:'Scene',assets:[asset],nodes:[],sources:[],updatedAt:'2026-11-11'};
describe('binvox',()=>{it('uses y fastest then z then x, preserving scale and translation',()=>{const result=parseBinvox(fixture([0,4,1,1,0,7,1,1,0,11]));expect(Object.keys(result.cells)).toEqual(['0,1,1','1,0,0']);expect(result.dimensions).toEqual([2,3,4]);expect(result.origin).toEqual([1,2,3]);expect(result.voxelSize).toBe(2);});it('rejects truncated, overflowing and invalid RLE',()=>{for(const rle of [[1],[1,0],[2,24],[1,25],[1,23]])expect(()=>parseBinvox(fixture(rle))).toThrow();});});
describe('voxel mesh',()=>{it('omits shared faces and stores linear vertex color',()=>{const geometry=buildVoxelGeometry(asset);expect(geometry.getAttribute('position').count).toBe(60);expect(geometry.getAttribute('color').getX(0)).toBeCloseTo(0.21586,4);});it('preserves hierarchy transforms and hidden state',()=>{const node={id:'g',name:'Group',kind:'group' as const,position:[1,2,3] as [number,number,number],rotation:[0,90,0] as [number,number,number],scale:[1,1,1] as [number,number,number],visible:false,locked:false,tags:[]};const result=buildProjectScene({...project,nodes:[node,{...node,id:'m',kind:'mesh',assetId:'a',parentId:'g'}]});expect(result.children[0].visible).toBe(false);expect(result.children[0].rotation.y).toBeCloseTo(Math.PI/2);expect(result.children[0].children[0].userData.nodeId).toBe('m');});});
describe('project archive',()=>{it('round trips',()=>expect(decodeProject(encodeProject(project))).toEqual(project));it('rejects invalid cells and cycles',()=>{expect(()=>encodeProject({...project,assets:[{...asset,cells:{'2,0,0':'#ffffff'}}]})).toThrow();const n={id:'g',name:'g',kind:'group' as const,parentId:'g',position:[0,0,0] as [number,number,number],rotation:[0,0,0] as [number,number,number],scale:[1,1,1] as [number,number,number],visible:true,locked:false,tags:[]};expect(()=>encodeProject({...project,nodes:[n]})).toThrow();});it('rejects path entries and unsupported schema',()=>{expect(()=>decodeProject(zipSync({'../project.json':strToU8('{}')}))).toThrow();expect(()=>decodeProject(zipSync({'project.json':strToU8(JSON.stringify({...project,schemaVersion:2}))}))).toThrow();});});

describe('high resolution grids', () => {
  function runs(value: number, count: number): number[] {
    const encoded: number[] = [];
    while (count > 0) {
      const length = Math.min(count, 255);
      encoded.push(value, length);
      count -= length;
    }
    return encoded;
  }
  it.each([256, 512])('reads a sparse %i grid without allocating its empty volume', resolution => {
    const total = resolution ** 3;
    const result = parseBinvox(fixture([...runs(0, total - 1), 1, 1], [resolution, resolution, resolution].join(' ')));
    expect(result.dimensions).toEqual([resolution, resolution, resolution]);
    expect(Object.keys(result.cells)).toEqual([[resolution - 1, resolution - 1, resolution - 1].join(',')]);
  });
  it('rejects excessive occupancy before materializing cells', () => {
    expect(() => parseBinvox(fixture(runs(1, MAX_OCCUPIED_VOXELS + 1), '512 512 512'))).toThrow(/预算/);
  });
});

describe('color transfer', () => {
  it('samples cell centers and preserves its input', async () => {
    const result = await applySourceColors(asset, point => point.x < 1 ? '#ff0000' : '#00ff00');
    expect(result.cells).toEqual({'0,0,0':'#ff0000','1,0,0':'#00ff00'});
    expect(asset.cells['0,0,0']).toBe('#808080');
  });
  it('supports cancellation before allocation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(applySourceColors(asset, () => '#ffffff', controller.signal)).rejects.toThrow();
  });
});

describe('uploaded model references', () => {
  const triangle = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';
  it('imports a local triangle and preserves coordinates', async () => {
    const result = await importModel([new File([triangle], 'models/part.obj')]);
    expect(result.obj).toContain('v 1 0 0');
    expect(result.sampleColor(new (await import('three')).Vector3(0.2, 0.2, 0))).toMatch(/^#[a-f0-9]{6}$/);
  });
  it('warns and falls back when a material library is missing', async () => {
    const result = await importModel([new File(['mtllib missing.mtl\n' + triangle], 'part.obj')]);
    expect(result.warnings[0]).toContain('Missing material library');
  });
  it('rejects ambiguous material basenames', async () => {
    await expect(importModel([
      new File(['mtllib paint.mtl\n' + triangle], 'part.obj'),
      new File(['newmtl paint'], 'a/paint.mtl'),
      new File(['newmtl paint'], 'b/paint.mtl'),
    ])).rejects.toThrow(/Ambiguous dependency/);
  });
  it('resolves identical material basenames using their relative directory', async () => {
    const result = await importModel([
      new File(['mtllib paint.mtl\nusemtl paint\n' + triangle], 'a/part.obj'),
      new File(['newmtl paint\nKd 1 0 0'], 'a/paint.mtl'),
      new File(['newmtl paint\nKd 0 1 0'], 'b/paint.mtl'),
    ]);
    expect(result.sampleColor(new (await import('three')).Vector3())).toBe('#ff0000');
  });
});

describe('scene mesh instances', () => {
  it('shares asset geometry and material across 200 independently transformed nodes', () => {
    const nodes = Array.from({ length: 200 }, (_, index) => ({
      id: 'node-' + index, name: 'Block ' + index, kind: 'mesh' as const, assetId: asset.id,
      position: [index, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number], visible: true, locked: false, tags: [],
    }));
    const scene = buildProjectScene({ ...project, nodes });
    const first = scene.children[0] as THREE.Mesh;
    const last = scene.children[199] as THREE.Mesh;
    expect(scene.children).toHaveLength(200);
    expect(first.geometry).toBe(last.geometry);
    expect(first.material).toBe(last.material);
    expect(first.position.x).toBe(0);
    expect(last.position.x).toBe(199);
  });
  it('emits outward-facing triangle winding consistent with its normals', () => {
    const geometry = buildVoxelGeometry(asset);
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const normal = new THREE.Vector3(), edge = new THREE.Vector3();
    for (let index = 0; index < positions.count; index += 3) {
      a.fromBufferAttribute(positions, index);
      b.fromBufferAttribute(positions, index + 1).sub(a);
      c.fromBufferAttribute(positions, index + 2).sub(a);
      edge.crossVectors(b, c).normalize();
      normal.fromBufferAttribute(normals, index);
      expect(edge.dot(normal)).toBeCloseTo(1);
    }
  });
});

describe('greedy surfaces', () => {
  const area = (a: number[], b: number[]) => Math.hypot(...a) * Math.hypot(...b);
  it('merges adjacent matching colors and preserves color boundaries', () => {
    const solid = { ...asset, cells: {'0,0,0':'#ffffff','1,0,0':'#ffffff'} };
    expect(generateMergedFaces(solid)).toHaveLength(6);
    expect(generateMergedFaces(asset)).toHaveLength(10);
    expect(generateMergedFaces(solid).reduce((sum, q) => sum + area(q.u, q.v), 0)).toBe(10);
  });
  it('preserves concave surface area without filling gaps', () => {
    const shape = {...asset, dimensions:[2,2,1] as [number,number,number],cells:{'0,0,0':'#ffffff','1,0,0':'#ffffff','0,1,0':'#ffffff'}};
    expect(generateMergedFaces(shape).reduce((sum, q) => sum + area(q.u, q.v), 0)).toBe(14);
  });
  it('reduces a real-sized 512 shell to twelve outer and inner quads', () => {
    const resolution = 512;
    const cells: Record<string,string> = {};
    for (let axis = 0; axis < 3; axis++) {
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      for (const plane of [0, resolution - 1]) {
        const point = [0,0,0];
        point[axis] = plane;
        for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
          point[u] = x;
          point[v] = y;
          cells[point.join(',')] = '#ffffff';
        }
      }
    }
    const shell = {...asset, dimensions:[512,512,512] as [number,number,number],cells};
    const quads = generateMergedFaces(shell);
    expect(Object.keys(cells)).toHaveLength(512 ** 3 - 510 ** 3);
    expect(quads).toHaveLength(12);
    expect(quads.reduce((sum, q) => sum + area(q.u, q.v), 0)).toBe(6 * (512 ** 2 + 510 ** 2));
  }, 60000);
});

describe('background mesh lifecycle', () => {
  class FakeWorker {
    static instances: FakeWorker[] = [];
    onmessage?: (event: {data: unknown}) => void;
    onerror?: (event: unknown) => void;
    onmessageerror?: () => void;
    requests: Array<{id: number; type: string}> = [];
    terminated = false;
    constructor() { FakeWorker.instances.push(this); }
    postMessage(request: {id:number;type:string}) { this.requests.push(request); }
    terminate() { this.terminated = true; }
    succeed(index = 0) {
      this.onmessage?.({data:{id:this.requests[index].id,result:{
        positions:new Float32Array([0,0,0,1,0,0,0,1,0]),
        normals:new Float32Array([0,0,1,0,0,1,0,0,1]),
        colors:new Float32Array([1,0,0,1,0,0,1,0,0]),
      }}});
    }
  }
  it('caches geometry until explicitly released and never disposes it on reuse', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const client = new MeshWorkerClient();
    try {
      const promise = client.get(asset);
      expect(client.get(asset)).toBe(promise);
      const worker = FakeWorker.instances.at(-1)!;
      expect(worker.requests).toHaveLength(1);
      worker.succeed();
      const geometry = await promise;
      const dispose = vi.spyOn(geometry, 'dispose');
      expect(await client.get(asset)).toBe(geometry);
      expect(dispose).not.toHaveBeenCalled();
      client.release(asset);
      expect(dispose).toHaveBeenCalledOnce();
      const replacement = client.get(asset);
      expect(replacement).not.toBe(promise);
      worker.succeed(1);
      await replacement;
    } finally { client.dispose(); vi.unstubAllGlobals(); }
  });
  it('rejects cancelled work and lazily restarts without stale failed cache entries', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const client = new MeshWorkerClient();
    try {
      const first = client.get(asset);
      const rejection = expect(first).rejects.toThrow(/cancelled/);
      const oldWorker = FakeWorker.instances.at(-1)!;
      client.cancelAll();
      const second = client.get(asset);
      const worker = FakeWorker.instances.at(-1)!;
      expect(worker).not.toBe(oldWorker);
      expect(oldWorker.terminated).toBe(true);
      await rejection;
      worker.succeed();
      expect((await second).getAttribute('position').count).toBe(3);
    } finally { client.dispose(); vi.unstubAllGlobals(); }
  });
  it('uses a provided geometry resolver and shares it between mesh nodes', () => {
    const geometry = new THREE.BufferGeometry();
    const resolver = vi.fn(() => geometry);
    const node = {id:'one',name:'One',kind:'mesh' as const,assetId:asset.id,position:[0,0,0] as [number,number,number],rotation:[0,0,0] as [number,number,number],scale:[1,1,1] as [number,number,number],visible:true,locked:false,tags:[]};
    const scene = buildProjectScene({...project,nodes:[node,{...node,id:'two'}]},resolver);
    expect(resolver).toHaveBeenCalledOnce();
    expect((scene.children[0] as THREE.Mesh).geometry).toBe(geometry);
    expect((scene.children[1] as THREE.Mesh).geometry).toBe(geometry);
  });
  it('runs at most two small assets concurrently and queues the third', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('navigator', {hardwareConcurrency:4});
    FakeWorker.instances = [];
    const client = new MeshWorkerClient();
    try {
      const promises = [0,1,2].map(i => client.get({...asset,id:'parallel-' + i}));
      expect(FakeWorker.instances).toHaveLength(2);
      const [first, second] = FakeWorker.instances;
      expect(first.requests).toHaveLength(1);
      expect(second.requests).toHaveLength(1);
      first.succeed();
      expect(first.requests).toHaveLength(2);
      second.succeed();
      first.succeed(1);
      await Promise.all(promises);
    } finally { client.dispose(); vi.unstubAllGlobals(); }
  });
  it('waits for active small jobs before running a heavy asset exclusively', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('navigator', {hardwareConcurrency:8});
    FakeWorker.instances = [];
    const client = new MeshWorkerClient();
    try {
      const first = client.get({...asset,id:'small-a'});
      const second = client.get({...asset,id:'small-b'});
      const heavy = client.get({...asset,id:'heavy',dimensions:[256,256,256]});
      const last = client.get({...asset,id:'small-c'});
      const [workerA,workerB] = FakeWorker.instances;
      workerA.succeed();
      expect(workerA.requests).toHaveLength(1);
      workerB.succeed();
      expect(workerA.requests).toHaveLength(2);
      expect(workerB.requests).toHaveLength(1);
      workerA.succeed(1);
      expect(workerA.requests).toHaveLength(3);
      workerA.succeed(2);
      await Promise.all([first,second,heavy,last]);
    } finally { client.dispose(); vi.unstubAllGlobals(); }
  });
  it('terminates idle workers after two seconds while retaining cached geometry', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', FakeWorker);
    FakeWorker.instances = [];
    const client = new MeshWorkerClient();
    try {
      const promise = client.get(asset);
      const worker = FakeWorker.instances[0];
      worker.succeed();
      const geometry = await promise;
      vi.advanceTimersByTime(2001);
      expect(worker.terminated).toBe(true);
      expect(await client.get(asset)).toBe(geometry);
      const next = client.get({...asset,id:'new'});
      expect(FakeWorker.instances).toHaveLength(2);
      FakeWorker.instances[1].succeed();
      await next;
    } finally { client.dispose(); vi.unstubAllGlobals(); vi.useRealTimers(); }
  });
  it('uses one worker when hardware concurrency leaves fewer than two spare cores', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('navigator', {hardwareConcurrency:2});
    FakeWorker.instances = [];
    const client = new MeshWorkerClient();
    try {
      const first = client.get({...asset,id:'low-a'});
      const second = client.get({...asset,id:'low-b'});
      expect(FakeWorker.instances).toHaveLength(1);
      const worker = FakeWorker.instances[0];
      worker.succeed();
      expect(worker.requests).toHaveLength(2);
      worker.succeed(1);
      await Promise.all([first,second]);
    } finally { client.dispose(); vi.unstubAllGlobals(); }
  });
  it('runs binvox payloads above one MiB exclusively', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('navigator', {hardwareConcurrency:8});
    FakeWorker.instances = [];
    const client = new MeshWorkerClient();
    try {
      const first = client.get({...asset,id:'parse-a'});
      const parsed = client.parseBinvox(new Uint8Array(1024 * 1024 + 1));
      const last = client.get({...asset,id:'parse-b'});
      const worker = FakeWorker.instances[0];
      expect(FakeWorker.instances).toHaveLength(1);
      worker.succeed();
      expect(worker.requests[1].type).toBe('parse');
      expect(FakeWorker.instances).toHaveLength(1);
      worker.onmessage?.({data:{id:worker.requests[1].id,result:asset}});
      expect(worker.requests[2].type).toBe('mesh');
      worker.succeed(2);
      expect(await parsed).toEqual(asset);
      await Promise.all([first,last]);
    } finally { client.dispose(); vi.unstubAllGlobals(); }
  });
});
