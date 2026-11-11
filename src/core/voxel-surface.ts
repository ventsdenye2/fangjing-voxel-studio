import type { Vec3, VoxelAsset } from './types';

/** A grid-space quad. Its u × v direction equals its outward normal. */
export interface SurfaceQuad {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  normal: Vec3;
  color: string;
}

export const MAX_MERGED_QUADS = 500_000;

/** Greedy same-color surface meshing with one bounded 2D mask at a time. */
export function generateMergedFaces(asset: VoxelAsset): SurfaceQuad[] {
  const quads: SurfaceQuad[] = [];
  for (let axis = 0; axis < 3; axis++) {
    const uAxis = (axis + 1) % 3;
    const vAxis = (axis + 2) % 3;
    const columns = asset.dimensions[uAxis];
    const rows = asset.dimensions[vAxis];
    // A sparse list of exposed cells for each plane/direction. Process axes
    // separately so a high-resolution shell never needs a dense 3D mask.
    const slices = new Map<number, number[]>();
    for (const key in asset.cells) {
      const point = key.split(',').map(Number);
      for (const sign of [-1, 1]) {
        const neighbor = [...point];
        neighbor[axis] += sign;
        if (asset.cells[neighbor.join(',')]) continue;
        const plane = point[axis] + (sign > 0 ? 1 : 0);
        const sliceKey = plane * 2 + (sign > 0 ? 1 : 0);
        let slice = slices.get(sliceKey);
        if (!slice) {
          slice = [];
          slices.set(sliceKey, slice);
        }
        slice.push(point[uAxis] + columns * point[vAxis]);
      }
    }
    const mask = new Uint32Array(columns * rows);
    for (const [sliceKey, cells] of slices) {
      const sign = sliceKey % 2 === 1 ? 1 : -1;
      const plane = Math.floor(sliceKey / 2);
      const palette = [''];
      const colorIds = new Map<string, number>();
      const point: Vec3 = [0, 0, 0];
      point[axis] = plane - (sign > 0 ? 1 : 0);
      for (const index of cells) {
        point[uAxis] = index % columns;
        point[vAxis] = Math.floor(index / columns);
        const color = asset.cells[point.join(',')].toLowerCase();
        let colorId = colorIds.get(color);
        if (!colorId) {
          colorId = palette.length;
          palette.push(color);
          colorIds.set(color, colorId);
        }
        mask[index] = colorId;
      }
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
          const colorId = mask[x + y * columns];
          if (!colorId) continue;
          let width = 1;
          while (x + width < columns && mask[x + width + y * columns] === colorId) width++;
          let height = 1;
          let matches = true;
          while (y + height < rows && matches) {
            for (let dx = 0; dx < width; dx++) {
              if (mask[x + dx + (y + height) * columns] !== colorId) {
                matches = false;
                break;
              }
            }
            if (matches) height++;
          }
          const origin: Vec3 = [0, 0, 0];
          const u: Vec3 = [0, 0, 0];
          const v: Vec3 = [0, 0, 0];
          const normal: Vec3 = [0, 0, 0];
          origin[axis] = plane;
          origin[uAxis] = x;
          origin[vAxis] = y;
          u[uAxis] = width;
          v[vAxis] = height;
          normal[axis] = sign;
          quads.push({ origin, u: sign > 0 ? u : v, v: sign > 0 ? v : u, normal, color: palette[colorId] });
          if (quads.length > MAX_MERGED_QUADS) throw new Error('Model exceeds the 500,000 merged-face rendering budget. Use a lower resolution.');
          for (let dy = 0; dy < height; dy++) mask.fill(0, x + (y + dy) * columns, x + width + (y + dy) * columns);
          x += width - 1;
        }
      }
    }
  }
  return quads;
}
