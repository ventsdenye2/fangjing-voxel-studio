import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {MTLLoader} from 'three/addons/loaders/MTLLoader.js';
import {MeshBVH} from 'three-mesh-bvh';
import type {ModelSource,VoxelAsset} from './types';
import {geometryOnlyObj,trianglesToObj} from './obj-geometry';
import {encodeSourceFiles} from './source-codec';
import {assertBudget, getResourceLimits} from './resource-limits';
function normalizedPath(path: string): string {
  const result: string[] = [];
  for (const part of decodeURIComponent(path).replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') result.pop();
    else result.push(part);
  }
  return result.join('/').toLowerCase();
}

export async function importModel(files: File[]): Promise<{
  source: ModelSource;
  object: THREE.Object3D;
  obj: string;
  sampleColor: (point: THREE.Vector3) => string;
  warnings: string[];
}> {
  const limits=getResourceLimits();
  assertBudget(files.reduce((total,file)=>total+file.size,0),limits.sourceBytes,'源模型与贴图大小（字节）');
  const main = files.find(file => /\.glb$/i.test(file.name)) ?? files.find(file => /\.obj$/i.test(file.name));
  if (!main) throw new Error('Select a GLB or OBJ model');
  const localFiles = new Map<string, File>();
  for (const file of files) {
    const path = normalizedPath(file.webkitRelativePath || file.name);
    if (localFiles.has(path)) throw new Error('Ambiguous uploaded file path: ' + path);
    localFiles.set(path, file);
  }
  const mainPath = normalizedPath(main.webkitRelativePath || main.name);
  const directory = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  function findFile(path: string): File | undefined {
    const normalized = normalizedPath(path);
    const exact = localFiles.get(normalized);
    if (exact) return exact;
    const basename = normalized.split('/').pop();
    const matches = [...localFiles.entries()].filter(([name]) => name.split('/').pop() === basename);
    if (matches.length > 1) throw new Error('Ambiguous dependency "' + path + '". Include its relative directory in the model material reference.');
    return matches[0]?.[1];
  }
  const urls = new Map<File, string>();
  const warnings: string[] = [];
  const warn = (message: string) => { if (!warnings.includes(message)) warnings.push(message); };
  // Embedded white PNG preserves the material's base color when a map is absent.
  const fallbackImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (/^(data:|blob:)/i.test(url)) return url;
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) {
      warn('External dependency was skipped: ' + url);
      return fallbackImage;
    }
    const file = findFile(url);
    if (!file) {
      warn('Missing texture or dependency: ' + url + '. Using material color.');
      return fallbackImage;
    }
    let result = urls.get(file);
    if (!result) {
      result = URL.createObjectURL(file);
      urls.set(file, result);
    }
    return result;
  });
  let loadingStarted = false;
  let finishLoading: () => void = () => {};
  const loaded = new Promise<void>(resolve => { finishLoading = resolve; });
  manager.onStart = () => { loadingStarted = true; };
  manager.onLoad = () => finishLoading();
  manager.onError = url => warn('Unable to decode texture: ' + url + '. Using material color.');
  let object: THREE.Object3D;
  let sourceObj: string|undefined;
  try {
    if (/\.glb$/i.test(main.name)) {
      object = (await new GLTFLoader(manager).parseAsync(await main.arrayBuffer(), directory(mainPath))).scene;
    } else {
      const text = await main.text();
      sourceObj = geometryOnlyObj(text);
      const reference = /^mtllib\s+(.+)$/mi.exec(text)?.[1].trim();
      const mtl = reference ? findFile(directory(mainPath) + reference) : files.find(file => /\.mtl$/i.test(file.name));
      const loader = new OBJLoader(manager);
      if (mtl) {
        const materialPath = normalizedPath(mtl.webkitRelativePath || mtl.name);
        const materials = new MTLLoader(manager).parse(await mtl.text(), directory(materialPath));
        materials.preload();
        loader.setMaterials(materials);
      } else if (reference) {
        warn('Missing material library: ' + reference + '. Using default material color.');
      }
      object = loader.parse(text);
    }
    if (loadingStarted) await loaded;
    object.userData.importWarnings = warnings;
    object.updateMatrixWorld(true);
    const meshes:THREE.Mesh[]=[];let triangleCount=0,hasUV=false,hasColor=false;
    object.traverse(child=>{if(child instanceof THREE.Mesh&&child.geometry.getAttribute('position')){meshes.push(child);triangleCount+=Math.floor((child.geometry.index?.count??child.geometry.getAttribute('position').count)/3);hasUV ||= Object.keys(child.geometry.attributes).some(k=>k.startsWith('uv'));hasColor ||= !!child.geometry.getAttribute('color');}});
    if(!triangleCount)throw Error('Model has no triangles');
    assertBudget(triangleCount,limits.modelTriangles,'源模型三角面数');
    const positions=new Float32Array(triangleCount*9);
    const uvValues=hasUV?new Float32Array(triangleCount*6):null;
    const colorValues=hasColor?new Float32Array(triangleCount*9).fill(1):null;
    const faceMaterials=new Uint32Array(triangleCount);
    const faceHasUV=hasUV?new Uint8Array(triangleCount):null;
    const materials:THREE.Material[]=[];const materialIds=new Map<THREE.Material,number>();
    const defaultMaterial=new THREE.MeshStandardMaterial({color:0xffffff});
    const point=new THREE.Vector3();let faceIndex=0;
    for(const child of meshes){
      const geo=child.geometry;const pos=geo.getAttribute('position'),colors=geo.getAttribute('color'),index=geo.getIndex();
      const count=index?.count??pos.count;const mirrored=child.matrixWorld.determinant()<0;
      for(let i=0;i+2<count;i+=3){
        const group=geo.groups.find(g=>i>=g.start&&i<g.start+g.count);
        const material=(Array.isArray(child.material)?child.material[group?.materialIndex??0]:child.material)??defaultMaterial;
        let matId=materialIds.get(material);if(matId===undefined){matId=materials.length;materials.push(material);materialIds.set(material,matId);}faceMaterials[faceIndex]=matId;
        const channel=(material as THREE.MeshStandardMaterial).map?.channel??0;
        const uv=geo.getAttribute(channel===0?'uv':'uv'+channel);
        if(faceHasUV&&uv)faceHasUV[faceIndex]=1;
        for(let j=0;j<3;j++){
          const order=mirrored&&j>0?3-j:j;const idx=index?index.getX(i+order):i+order;
          child.getVertexPosition(idx,point).applyMatrix4(child.matrixWorld);
          const offset=faceIndex*9+j*3;positions[offset]=point.x;positions[offset+1]=point.y;positions[offset+2]=point.z;
          if(uv&&uvValues){uvValues[faceIndex*6+j*2]=uv.getX(idx);uvValues[faceIndex*6+j*2+1]=uv.getY(idx);}
          if(colors&&colorValues){colorValues[offset]=colors.getX(idx);colorValues[offset+1]=colors.getY(idx);colorValues[offset+2]=colors.getZ(idx);}
        }
        faceIndex++;
        if(faceIndex%8192===0)await new Promise(r=>setTimeout(r,0));
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const bvh = new MeshBVH(geometry, { indirect: true });
    const canvases = new Map<THREE.Texture, { data: Uint8ClampedArray; width: number; height: number }>();
    for (const material of materials) {
      const texture = (material as THREE.MeshStandardMaterial).map;
      if (!texture || canvases.has(texture)) continue;
      const image = texture.image;
      if (!image || !image.width || !image.height) continue;
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) continue;
      try {
        context.drawImage(image, 0, 0);
        canvases.set(texture, {
          data: context.getImageData(0, 0, canvas.width, canvas.height).data,
          width: canvas.width,
          height: canvas.height,
        });
      } catch {
        warn('Unable to sample texture. Using material color.');
      }
    }
    // Reuse sampling scratch values across large color-transfer batches.
    const triangle = new THREE.Triangle();
    const barycentric = new THREE.Vector3();
    const color = new THREE.Color();
    const sampled = new THREE.Color();
    const uv = new THREE.Vector2();
    const position = geometry.getAttribute('position');
    const sampleColor = (point: THREE.Vector3): string => {
      const hit = bvh.closestPointToPoint(point);
      if (!hit) return '#b7c9e2';
      const colorOffset=hit.faceIndex*9,uvOffset=hit.faceIndex*6;
      triangle.a.fromBufferAttribute(position, hit.faceIndex * 3);
      triangle.b.fromBufferAttribute(position, hit.faceIndex * 3 + 1);
      triangle.c.fromBufferAttribute(position, hit.faceIndex * 3 + 2);
      if (!triangle.getBarycoord(hit.point, barycentric)) barycentric.set(1, 0, 0);
      const material = materials[faceMaterials[hit.faceIndex]] as THREE.MeshStandardMaterial;
      color.copy(material.color ?? new THREE.Color('white'));
      if (material.vertexColors && colorValues) {
        sampled.setRGB(
          colorValues[colorOffset+0] * barycentric.x + colorValues[colorOffset+3] * barycentric.y + colorValues[colorOffset+6] * barycentric.z,
          colorValues[colorOffset+1] * barycentric.x + colorValues[colorOffset+4] * barycentric.y + colorValues[colorOffset+7] * barycentric.z,
          colorValues[colorOffset+2] * barycentric.x + colorValues[colorOffset+5] * barycentric.y + colorValues[colorOffset+8] * barycentric.z,
        );
        color.multiply(sampled);
      }
      const texture = material.map;
      const pixels = texture && canvases.get(texture);
      if (texture && pixels && uvValues && faceHasUV?.[hit.faceIndex]) {
        uv.set(uvValues[uvOffset]*barycentric.x+uvValues[uvOffset+2]*barycentric.y+uvValues[uvOffset+4]*barycentric.z,uvValues[uvOffset+1]*barycentric.x+uvValues[uvOffset+3]*barycentric.y+uvValues[uvOffset+5]*barycentric.z);
        texture.updateMatrix();
        texture.transformUv(uv);
        const x = Math.min(pixels.width - 1, Math.max(0, Math.floor(uv.x * pixels.width)));
        const y = Math.min(pixels.height - 1, Math.max(0, Math.floor(uv.y * pixels.height)));
        const index = (y * pixels.width + x) * 4;
        sampled.setRGB(
          pixels.data[index] / 255,
          pixels.data[index + 1] / 255,
          pixels.data[index + 2] / 255,
          texture.colorSpace === THREE.SRGBColorSpace ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace,
        );
        color.multiply(sampled);
      }
      return '#' + color.getHexString();
    };
    const source: ModelSource = {
      id: crypto.randomUUID(),
      name: main.name,
      files: await encodeSourceFiles(files),
    };
    return { source, object, obj: sourceObj ?? await trianglesToObj(positions), sampleColor, warnings };
  } finally {
    for (const url of urls.values()) URL.revokeObjectURL(url);
  }
}

export async function applySourceColors(
  asset: VoxelAsset,
  sampler: (point: THREE.Vector3) => string,
  signal?: AbortSignal,
): Promise<VoxelAsset> {
  const cells: Record<string, string> = {};
  const point = new THREE.Vector3();
  let count = 0;
  let lastYield = performance.now();
  signal?.throwIfAborted();
  for (const key in asset.cells) {
    const coordinates = key.split(',').map(Number);
    point.set(
      asset.origin[0] + (coordinates[0] + 0.5) * asset.voxelSize,
      asset.origin[1] + (coordinates[1] + 0.5) * asset.voxelSize,
      asset.origin[2] + (coordinates[2] + 0.5) * asset.voxelSize,
    );
    cells[key] = sampler(point);
    if (++count % 256 === 0 && performance.now() - lastYield >= 12) {
      await new Promise(resolve => setTimeout(resolve, 0));
      signal?.throwIfAborted();
      lastYield = performance.now();
    }
  }
  signal?.throwIfAborted();
  return { ...asset, cells };
}
