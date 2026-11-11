import {mkdir, mkdtemp, writeFile, rm, rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {build} from 'esbuild';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, 'artifacts', 'performance');
const selection = process.argv.find(value => value.startsWith('--case='))?.slice(7) ?? 'all';
const fixturesOnly = process.argv.includes('--fixtures-only');
if (!['all', 'repeated', 'distinct'].includes(selection)) throw new Error('Use --case=all, --case=repeated or --case=distinct');

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function node(id, assetId, index, columns, scale = 1) {
  return {
    id,assetId,name:id,kind:'mesh',position:[index % columns * 4,0,Math.floor(index / columns) * 4],
    rotation:[0,index % 4 * 90,0],scale:[scale,scale,scale],visible:true,locked:false,tags:['synthetic-performance-fixture'],
  };
}
function project(id, name, assets, nodes) {
  return {schemaVersion:1,id,name,assets,nodes,sources:[],updatedAt:'2026-11-11T00:00:00.000Z'};
}
function repeatedFixture(createDemo) {
  const assets = createDemo().assets;
  const nodes = Array.from({length:200}, (_, i) => node('repeated-' + i, assets[i % 4].id, i, 20, 0.4));
  return project('benchmark-repeated-200','200 repeated demo instances',assets,nodes);
}
function distinctFixture() {
  const palette = ['#335c81','#d66853','#f0c987','#80a27c'];
  const assets = Array.from({length:50}, (_, assetIndex) => {
    const random = randomGenerator(73013 + assetIndex * 104729);
    const cells = {};
    const phase = assetIndex * 0.37;
    const stretch = 0.86 + random() * 0.28;
    for (let x = 0; x < 32; x++) for (let y = 0; y < 32; y++) for (let z = 0; z < 32; z++) {
      const dx = (x - 15.5) * stretch, dy = (y - 15.5) / stretch, dz = z - 15.5;
      const radius = 10.5 + 1.2 * Math.sin(x * 0.55 + phase) + 1.1 * Math.cos(y * 0.43 - phase) + 0.8 * Math.sin(z * 0.61);
      const jitter = (random() - 0.5) * 0.7;
      if (Math.abs(Math.hypot(dx,dy,dz) - radius - jitter) <= 0.7) cells[x + ',' + y + ',' + z] = palette[Math.floor(random() * palette.length)];
    }
    return {id:'noisy-' + assetIndex,name:'Noisy shell ' + assetIndex,dimensions:[32,32,32],origin:[-1.6,0,-1.6],voxelSize:0.1,resolution:32,cells};
  });
  return project('benchmark-distinct-50','50 distinct noisy four-color shells',assets,assets.map((asset,i) => node('distinct-' + i,asset.id,i,10)));
}
function countExposedFaces(asset) {
  let count = 0;
  for (const key in asset.cells) {
    const point = key.split(',').map(Number);
    for (let axis = 0; axis < 3; axis++) for (const sign of [-1,1]) {
      const neighbor = [...point];
      neighbor[axis] += sign;
      if (!asset.cells[neighbor.join(',')]) count++;
    }
  }
  return count;
}
function memory() {
  const value = process.memoryUsage();
  return {heapUsedBytes:value.heapUsed,externalBytes:value.external,arrayBuffersBytes:value.arrayBuffers,rssBytes:value.rss};
}
function benchmark(fixture, runtime) {
  globalThis.gc?.();
  const before = memory();
  const geometries = new Map();
  const assets = [];
  let maxObservedHeapBytes = before.heapUsedBytes;
  for (const asset of fixture.assets) {
    const rawStart = performance.now();
    const exposedFaces = countExposedFaces(asset);
    const exposedFaceCountMs = performance.now() - rawStart;
    const mergeStart = performance.now();
    const merged = runtime.generateMergedFaces(asset);
    const greedyMeshingMs = performance.now() - mergeStart;
    const geometryStart = performance.now();
    const geometry = runtime.buildVoxelGeometry(asset);
    const geometryBuildMs = performance.now() - geometryStart;
    geometries.set(asset.id,geometry);
    const bufferBytes = Object.values(geometry.attributes).reduce((sum,attribute) => sum + attribute.array.byteLength,0);
    assets.push({id:asset.id,occupiedCells:Object.keys(asset.cells).length,exposedFaces,mergedQuads:merged.length,triangles:geometry.getAttribute('position').count / 3,bufferBytes,exposedFaceCountMs,greedyMeshingMs,geometryBuildMs});
    maxObservedHeapBytes = Math.max(maxObservedHeapBytes,memory().heapUsedBytes);
  }
  const start = performance.now();
  const scene = runtime.buildProjectScene(fixture,asset => geometries.get(asset.id));
  const sceneAssemblyMs = performance.now() - start;
  const sceneTriangles = fixture.nodes.reduce((sum,node) => sum + (assets.find(asset => asset.id === node.assetId)?.triangles ?? 0),0);
  const result = {
    measured:true,assetCount:fixture.assets.length,nodeCount:fixture.nodes.length,
    occupiedCells:assets.reduce((sum,a) => sum + a.occupiedCells,0),
    uniqueGeometryTriangles:assets.reduce((sum,a) => sum + a.triangles,0),sceneTriangles,
    uniqueGeometryBufferBytes:assets.reduce((sum,a) => sum + a.bufferBytes,0),
    sceneAssemblyMs,memoryBefore:before,memoryAfter:memory(),maxObservedHeapBytes,assets,
  };
  const materials = new Set();
  scene.traverse(object => {if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);});
  for (const geometry of geometries.values()) geometry.dispose();
  for (const material of materials) material.dispose();
  return result;
}

// Bundle pure core exports without starting a dev server or a persistent job.
const temporaryDirectory = await mkdtemp(join(tmpdir(),'fangjing-benchmark-'));
const runtimePath = join(temporaryDirectory,'runtime.mjs');
try {
  await build({
    stdin:{contents:'export {createDemo} from "./src/core/demo.ts"; export {generateMergedFaces} from "./src/core/voxel-surface.ts"; export {buildVoxelGeometry,buildProjectScene} from "./src/core/mesh.ts"; export {encodeProject} from "./src/core/archive.ts";',resolveDir:projectRoot,loader:'ts'},
    outfile:runtimePath,bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'silent',
  });
  const runtime = await import(pathToFileURL(runtimePath).href);
  await mkdir(outputDirectory,{recursive:true});
  const cases = [
    {key:'repeated',file:'repeated-200',create:() => repeatedFixture(runtime.createDemo)},
    {key:'distinct',file:'distinct-noisy-50',create:distinctFixture},
  ].filter(item => selection === 'all' || item.key === selection);
  const results = [];
  for (const item of cases) {
    console.log('Generating ' + item.file);
    const fixture = item.create();
    const jsonPath = join(outputDirectory,item.file + '.json');
    const archivePath = join(outputDirectory,item.file + '.vxlproj');
    await writeFile(jsonPath,JSON.stringify(fixture));
    await writeFile(archivePath,runtime.encodeProject(fixture));
    const result = fixturesOnly ? {measured:false,assetCount:fixture.assets.length,nodeCount:fixture.nodes.length} : benchmark(fixture,runtime);
    const record = {case:item.key,fixtureJson:jsonPath,fixtureArchive:archivePath,...result};
    await writeFile(join(outputDirectory,item.file + '.results.json'),JSON.stringify(record,null,2));
    results.push(record);
    console.log(JSON.stringify({case:item.key,measured:result.measured,assets:result.assetCount,nodes:result.nodeCount,triangles:result.sceneTriangles}));
  }
  await writeFile(join(outputDirectory,'latest-run.json'),JSON.stringify({
    generatedAt:new Date().toISOString(),node:process.version,platform:process.platform,architecture:process.arch,gcExposed:typeof globalThis.gc === 'function',fixturesOnly,results,
    methodology:'Sequential CPU measurements. geometryBuildMs includes its own greedy pass. Independent greedyMeshingMs is a separate diagnostic. sceneTriangles counts all visible nodes before frustum culling and render passes. Browser FPS and renderer counters require a browser run.',
  },null,2));
} finally {
  await rm(runtimePath,{force:true});
  await rmdir(temporaryDirectory);
}
