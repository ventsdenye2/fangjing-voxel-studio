export interface ResourceLimits {
  projectBytes: number;
  sourceBytes: number;
  conversionBytes: number;
  modelTriangles: number;
  occupiedVoxels: number;
  mergedQuads: number;
  conversionTimeoutMs: number;
}

/** Zero disables an application budget, not the runtime's physical memory limits. */
export const DEFAULT_RESOURCE_LIMITS: Readonly<ResourceLimits> = Object.freeze({
  projectBytes: 2 * 1024 ** 3,
  sourceBytes: 2 * 1024 ** 3,
  conversionBytes: 512 * 1024 ** 2,
  modelTriangles: 0,
  occupiedVoxels: 5_000_000,
  mergedQuads: 1_000_000,
  conversionTimeoutMs: 0,
});
const storageKey = 'fangjing-resource-limits';
export function normalizeResourceLimits(value: Partial<ResourceLimits> = {}): ResourceLimits {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('容量预算格式无效');
  const result = {...DEFAULT_RESOURCE_LIMITS};
  for (const [key, number] of Object.entries(value)) {
    if (!Object.hasOwn(DEFAULT_RESOURCE_LIMITS,key) || !Number.isSafeInteger(number) || number! < 0 || (key === 'conversionTimeoutMs' && number! > 2147483647)) throw Error('容量预算必须是非负整数，转换时限不能超过 24 天');
    result[key as keyof ResourceLimits] = number!;
  }
  return result;
}
let current: ResourceLimits = {...DEFAULT_RESOURCE_LIMITS};
try {
  const stored = globalThis.localStorage?.getItem(storageKey);
  if (stored) current = normalizeResourceLimits(JSON.parse(stored));
} catch { /* Workers have no localStorage; they receive an explicit snapshot. */ }
export function getResourceLimits(): ResourceLimits { return {...current}; }
export function setResourceLimits(value: Partial<ResourceLimits>, persist = false): ResourceLimits {
  current = normalizeResourceLimits(value);
  if (persist) {
    try { globalThis.localStorage?.setItem(storageKey, JSON.stringify(current)); } catch { /* Desktop persists separately. */ }
  }
  return getResourceLimits();
}
export function assertBudget(value: number, limit: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(limit) || limit < 0) throw Error('无效的资源大小或容量预算');
  if (limit !== 0 && value > limit) throw Error(`${label}：${value.toLocaleString()}，超过当前预算 ${limit.toLocaleString()}。可在“设置 → 容量与性能”中调整，或拆分资源。`);
}
