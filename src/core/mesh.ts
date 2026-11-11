import * as THREE from 'three';
import type {Project,VoxelAsset} from './types';
import { generateMergedFaces } from './voxel-surface';

export function buildVoxelGeometry(asset: VoxelAsset): THREE.BufferGeometry {
  const faces = generateMergedFaces(asset);
  const positions = new Float32Array(faces.length * 18);
  const normals = new Float32Array(faces.length * 18);
  const colors = new Float32Array(faces.length * 18);
  const color = new THREE.Color();
  const corners = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
  let offset = 0;
  for (const face of faces) {
    color.set(face.color);
    for (const [u, v] of corners) {
      for (let axis = 0; axis < 3; axis++) {
        const coordinate = face.origin[axis] + u * face.u[axis] + v * face.v[axis];
        positions[offset + axis] = asset.origin[axis] + coordinate * asset.voxelSize;
        normals[offset + axis] = face.normal[axis];
      }
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
      offset += 3;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
export function buildProjectScene(project: Project, geometryResolver: (asset: VoxelAsset) => THREE.BufferGeometry = buildVoxelGeometry): THREE.Group {
  const root = new THREE.Group();
  root.name = project.name;
  const assets = new Map(project.assets.map(asset => [asset.id, asset]));
  const objects = new Map<string, THREE.Object3D>();
  const meshes = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial }>();
  for (const node of project.nodes) {
    const asset = node.assetId ? assets.get(node.assetId) : undefined;
    let object: THREE.Object3D;
    if (node.kind === 'mesh' && asset) {
      let resources = meshes.get(asset.id);
      if (!resources) {
        resources = {
          geometry: geometryResolver(asset),
          material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
        };
        meshes.set(asset.id, resources);
      }
      object = new THREE.Mesh(resources.geometry, resources.material);
    } else {
      object = new THREE.Group();
    }
    object.name = node.name;
    object.position.fromArray(node.position);
    object.rotation.set(...node.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]);
    object.scale.fromArray(node.scale);
    object.visible = node.visible;
    object.userData = { nodeId: node.id, assetId: node.assetId, kind: node.kind, tags: node.tags, locked: node.locked };
    objects.set(node.id, object);
  }
  for (const node of project.nodes) {
    const object = objects.get(node.id)!;
    const parent = node.parentId ? objects.get(node.parentId) ?? root : root;
    parent.add(object);
  }
  return root;
}
