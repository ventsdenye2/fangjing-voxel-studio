import * as THREE from 'three';
import {buildProjectScene} from './mesh';
import type {Project, VoxelAsset} from './types';

/** Render repeated props together while retaining the editable node hierarchy. */
export function buildViewportScene(
  project: Project,
  geometryResolver: (asset: VoxelAsset) => THREE.BufferGeometry,
  selection: string[],
): THREE.Group {
  const root = buildProjectScene(project, geometryResolver, true);
  root.updateMatrixWorld(true);
  const selected = new Set(selection);
  const editableBranches = new Set<THREE.Object3D>();
  const candidates = new Map<string, THREE.Mesh[]>();
  root.traverse(object => {
    // A gizmo moves the selected object in place, including all descendants.
    if (selected.has(object.userData.nodeId) || (object.parent && editableBranches.has(object.parent))) {
      editableBranches.add(object);
      return;
    }
    if (!(object instanceof THREE.Mesh) || object.matrixWorld.determinant() < 0) return;
    const assetId = object.userData.assetId as string | undefined;
    if (!assetId || !object.geometry.getAttribute('position')?.count) return;
    const meshes = candidates.get(assetId);
    if (meshes) meshes.push(object);
    else candidates.set(assetId, [object]);
  });
  for (const [assetId, meshes] of candidates) {
    if (meshes.length < 2) continue;
    const batch = new THREE.InstancedMesh(meshes[0].geometry, meshes[0].material, meshes.length);
    batch.name = `Instances: ${assetId}`;
    batch.userData = {assetId, instanceNodeIds: meshes.map(mesh => mesh.userData.nodeId as string)};
    meshes.forEach((mesh, index) => {
      batch.setMatrixAt(index, mesh.matrixWorld);
      // Keep node IDs, local transforms, children and sibling order available to
      // selection bounds and future scene edits, without another draw call.
      const placeholder = new THREE.Group().copy(mesh, false);
      placeholder.userData = mesh.userData;
      while (mesh.children.length) placeholder.add(mesh.children[0]);
      const parent = mesh.parent!;
      const childIndex = parent.children.indexOf(mesh);
      parent.remove(mesh);
      parent.add(placeholder);
      parent.children.pop();
      parent.children.splice(childIndex, 0, placeholder);
    });
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
    root.add(batch);
  }
  return root;
}
