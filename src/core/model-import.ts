import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {MTLLoader} from 'three/addons/loaders/MTLLoader.js';
import {MeshBVH} from 'three-mesh-bvh';
import type {ModelSource,VoxelAsset} from './types';
type Face={material:THREE.Material;uv?:THREE.Vector2[];colors?:THREE.Color[]};
function base64(bytes:Uint8Array){let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);}
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
  try {
    if (/\.glb$/i.test(main.name)) {
      object = (await new GLTFLoader(manager).parseAsync(await main.arrayBuffer(), directory(mainPath))).scene;
    } else {
      const text = await main.text();
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
    const positions: number[] = [];
    const faces: Face[] = [];
    const objLines: string[] = [];
    let vertex = 1;
    object.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const geometry = child.geometry as THREE.BufferGeometry;
      const position = geometry.getAttribute('position');
      if (!position) return;
      const colors = geometry.getAttribute('color');
      const index = geometry.getIndex();
      const count = index?.count ?? position.count;
      const mirrored = child.matrixWorld.determinant() < 0;
      for (let i = 0; i + 2 < count; i += 3) {
        const order = mirrored ? [0, 2, 1] : [0, 1, 2];
        const indices = order.map(j => index ? index.getX(i + j) : i + j);
        for (const idx of indices) {
          const point = child.getVertexPosition(idx, new THREE.Vector3()).applyMatrix4(child.matrixWorld);
          positions.push(point.x, point.y, point.z);
          objLines.push('v ' + point.x + ' ' + point.y + ' ' + point.z);
        }
        objLines.push('f ' + vertex + ' ' + (vertex + 1) + ' ' + (vertex + 2));
        vertex += 3;
        const group = geometry.groups.find(group => i >= group.start && i < group.start + group.count);
        const material = (Array.isArray(child.material) ? child.material[group?.materialIndex ?? 0] : child.material)
          ?? new THREE.MeshStandardMaterial({ color: 0xffffff });
        const channel = (material as THREE.MeshStandardMaterial).map?.channel ?? 0;
        const uv = geometry.getAttribute(channel === 0 ? 'uv' : 'uv' + channel);
        faces.push({
          material,
          uv: uv ? indices.map(idx => new THREE.Vector2(uv.getX(idx), uv.getY(idx))) : undefined,
          colors: colors ? indices.map(idx => new THREE.Color().setRGB(colors.getX(idx), colors.getY(idx), colors.getZ(idx))) : undefined,
        });
      }
    });
    if (!positions.length) throw new Error('Model has no triangles');
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const bvh = new MeshBVH(geometry, { indirect: true });
    const canvases = new Map<THREE.Texture, { data: Uint8ClampedArray; width: number; height: number }>();
    for (const face of faces) {
      const texture = (face.material as THREE.MeshStandardMaterial).map;
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
      const face = faces[hit.faceIndex];
      triangle.a.fromBufferAttribute(position, hit.faceIndex * 3);
      triangle.b.fromBufferAttribute(position, hit.faceIndex * 3 + 1);
      triangle.c.fromBufferAttribute(position, hit.faceIndex * 3 + 2);
      if (!triangle.getBarycoord(hit.point, barycentric)) barycentric.set(1, 0, 0);
      const material = face.material as THREE.MeshStandardMaterial;
      color.copy(material.color ?? new THREE.Color('white'));
      if (material.vertexColors && face.colors) {
        sampled.setRGB(
          face.colors[0].r * barycentric.x + face.colors[1].r * barycentric.y + face.colors[2].r * barycentric.z,
          face.colors[0].g * barycentric.x + face.colors[1].g * barycentric.y + face.colors[2].g * barycentric.z,
          face.colors[0].b * barycentric.x + face.colors[1].b * barycentric.y + face.colors[2].b * barycentric.z,
        );
        color.multiply(sampled);
      }
      const texture = material.map;
      const pixels = texture && canvases.get(texture);
      if (texture && pixels && face.uv) {
        uv.set(0, 0)
          .addScaledVector(face.uv[0], barycentric.x)
          .addScaledVector(face.uv[1], barycentric.y)
          .addScaledVector(face.uv[2], barycentric.z);
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
      files: await Promise.all(files.map(async file => ({
        name: file.webkitRelativePath || file.name,
        data: base64(new Uint8Array(await file.arrayBuffer())),
      }))),
    };
    return { source, object, obj: objLines.join('\n') + '\n', sampleColor, warnings };
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
