import * as THREE from 'three';
import type { VoxelAsset } from './types';

export interface MeshBuffers {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
}
export type MeshWorkerRequest =
  | { id: number; type: 'mesh'; asset: VoxelAsset }
  | { id: number; type: 'parse'; bytes: ArrayBuffer; name: string };
export type MeshWorkerResponse =
  | { id: number; result: MeshBuffers | VoxelAsset }
  | { id: number; error: string };
type RequestPayload =
  | { type: 'mesh'; asset: VoxelAsset }
  | { type: 'parse'; bytes: ArrayBuffer; name: string };
interface GeometryEntry {
  promise: Promise<THREE.BufferGeometry>;
  geometry?: THREE.BufferGeometry;
  released: boolean;
}

interface WorkerJob {
  id: number;
  payload: RequestPayload;
  transfer: Transferable[];
  exclusive: boolean;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}
interface WorkerSlot {
  worker: Worker;
  job?: WorkerJob;
  idleTimer?: ReturnType<typeof setTimeout>;
}

/** Owns geometries and a bounded FIFO pool. Release assets after scene removal. */
export class MeshWorkerClient {
  private nextId = 1;
  private disposed = false;
  private readonly maximumWorkers = Math.min(2, Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 4) - 2));
  private workers = new Set<WorkerSlot>();
  private queue: WorkerJob[] = [];
  private pending = new Map<number, WorkerJob>();
  private heavyAssets = new WeakMap<VoxelAsset, boolean>();
  private cache = new WeakMap<VoxelAsset, GeometryEntry>();
  private geometries = new Set<THREE.BufferGeometry>();
  private inFlightAssets = new Map<VoxelAsset, GeometryEntry>();

  private isHeavy(payload: RequestPayload): boolean {
    if (payload.type === 'parse') return payload.bytes.byteLength > 1024 * 1024;
    const asset = payload.asset;
    const cached = this.heavyAssets.get(asset);
    if (cached !== undefined) return cached;
    let heavy = asset.dimensions.some(dimension => dimension >= 256);
    if (!heavy) {
      let occupied = 0;
      for (const key in asset.cells) {
        if (++occupied > 200_000) {
          heavy = true;
          break;
        }
      }
    }
    this.heavyAssets.set(asset, heavy);
    return heavy;
  }

  private removeWorker(slot: WorkerSlot): void {
    if (slot.idleTimer) clearTimeout(slot.idleTimer);
    slot.worker.terminate();
    this.workers.delete(slot);
  }

  private finish(slot: WorkerSlot, response: MeshWorkerResponse): void {
    const job = slot.job;
    if (!this.workers.has(slot) || !job || job.id !== response.id) return;
    slot.job = undefined;
    this.pending.delete(job.id);
    if ('error' in response) job.reject(new Error(response.error));
    else job.resolve(response.result);
    this.schedule();
    if (this.workers.has(slot) && !slot.job) {
      slot.idleTimer = setTimeout(() => {
        if (!slot.job) this.removeWorker(slot);
      }, 2000);
    }
  }

  private createWorker(): WorkerSlot {
    const worker = new Worker(new URL('./mesh-worker.ts', import.meta.url), { type: 'module' });
    const slot: WorkerSlot = { worker };
    worker.onmessage = (event: MessageEvent<MeshWorkerResponse>) => this.finish(slot, event.data);
    const fail = (error: Error) => {
      if (!this.workers.has(slot)) return;
      const job = slot.job;
      this.removeWorker(slot);
      if (job) {
        this.pending.delete(job.id);
        job.reject(error);
      }
      this.schedule();
    };
    worker.onerror = event => {
      event.preventDefault();
      fail(new Error(event.message || 'Background voxel processing failed'));
    };
    worker.onmessageerror = () => fail(new Error('Unable to receive background voxel data'));
    this.workers.add(slot);
    return slot;
  }

  private schedule(): void {
    if (this.disposed || [...this.workers].some(slot => slot.job?.exclusive)) return;
    while (this.queue.length) {
      const job = this.queue[0];
      if (job.exclusive && [...this.workers].some(slot => slot.job)) return;
      let slot = [...this.workers].find(slot => !slot.job);
      if (!slot && this.workers.size >= this.maximumWorkers) return;
      this.queue.shift();
      try {
        slot ??= this.createWorker();
        if (slot.idleTimer) clearTimeout(slot.idleTimer);
        slot.idleTimer = undefined;
        slot.job = job;
        slot.worker.postMessage({ ...job.payload, id: job.id } satisfies MeshWorkerRequest, job.transfer);
      } catch (error) {
        if (slot) this.removeWorker(slot);
        this.pending.delete(job.id);
        job.reject(error instanceof Error ? error : new Error(String(error)));
        continue;
      }
      if (job.exclusive) return;
    }
  }

  private request<T>(payload: RequestPayload, transfer: Transferable[] = []): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.disposed) {
        reject(new Error('Mesh worker client has been disposed'));
        return;
      }
      const job: WorkerJob = {
        id: this.nextId++, payload, transfer, exclusive: this.isHeavy(payload),
        resolve: value => resolve(value as T), reject,
      };
      this.pending.set(job.id, job);
      this.queue.push(job);
      this.schedule();
    });
  }

  get(asset: VoxelAsset): Promise<THREE.BufferGeometry> {
    const cached = this.cache.get(asset);
    if (cached) return cached.promise;
    const job = this.request<MeshBuffers>({ type: 'mesh', asset });
    const entry: GeometryEntry = { released: false, promise: job.then(buffers => {
      if (this.inFlightAssets.get(asset) === entry) this.inFlightAssets.delete(asset);
      if (entry.released) throw new DOMException('Asset geometry was released', 'AbortError');
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(buffers.normals, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 3));
      geometry.computeBoundingSphere();
      entry.geometry = geometry;
      this.geometries.add(geometry);
      return geometry;
    }).catch(error => {
      if (this.inFlightAssets.get(asset) === entry) this.inFlightAssets.delete(asset);
      if (this.cache.get(asset) === entry) this.cache.delete(asset);
      throw error;
    }) };
    this.cache.set(asset, entry);
    this.inFlightAssets.set(asset, entry);
    return entry.promise;
  }

  release(asset: VoxelAsset): void {
    const entry = this.cache.get(asset);
    if (!entry) return;
    entry.released = true;
    this.cache.delete(asset);
    if (this.inFlightAssets.get(asset) === entry) this.inFlightAssets.delete(asset);
    for (const job of this.pending.values()) {
      if (job.payload.type !== 'mesh' || job.payload.asset !== asset) continue;
      this.pending.delete(job.id);
      this.queue = this.queue.filter(queued => queued !== job);
      const slot = [...this.workers].find(slot => slot.job === job);
      if (slot) this.removeWorker(slot);
      job.reject(new DOMException('Asset geometry was released', 'AbortError'));
    }
    this.schedule();
    if (entry.geometry) {
      this.geometries.delete(entry.geometry);
      entry.geometry.dispose();
    }
  }

  async parseBinvox(input: ArrayBuffer | Uint8Array, name = 'Voxel model', signal?: AbortSignal): Promise<VoxelAsset> {
    signal?.throwIfAborted();
    // Keep the caller's bytes intact while transferring the worker's copy.
    const bytes = input instanceof Uint8Array ? new Uint8Array(input) : new Uint8Array(input.slice(0));
    const abort = () => this.cancelAll(new DOMException('Voxel processing cancelled', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    try {
      return await this.request<VoxelAsset>({ type: 'parse', bytes: bytes.buffer, name }, [bytes.buffer]);
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }

  /** Terminates queued and active jobs. Completed geometry cache remains usable. */
  cancelAll(reason: Error = new DOMException('Voxel processing cancelled', 'AbortError')): void {
    this.queue = [];
    for (const slot of this.workers) this.removeWorker(slot);
    for (const [asset, entry] of this.inFlightAssets) {
      entry.released = true;
      if (this.cache.get(asset) === entry) this.cache.delete(asset);
    }
    this.inFlightAssets.clear();
    for (const job of this.pending.values()) job.reject(reason);
    this.pending.clear();
  }

  /** Remove scenes using this client's geometries before calling dispose. */
  dispose(): void {
    this.disposed = true;
    this.cancelAll();
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.clear();
    this.cache = new WeakMap();
  }
}

const defaultClient = new MeshWorkerClient();
export const getVoxelGeometryAsync = (asset: VoxelAsset): Promise<THREE.BufferGeometry> => defaultClient.get(asset);
export const parseBinvoxAsync = (bytes: ArrayBuffer | Uint8Array, name?: string, signal?: AbortSignal): Promise<VoxelAsset> => defaultClient.parseBinvox(bytes, name, signal);
export const releaseVoxelGeometry = (asset: VoxelAsset): void => defaultClient.release(asset);
export const cancelVoxelProcessing = (): void => defaultClient.cancelAll();
