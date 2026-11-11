const DEFAULT_RESOURCE_LIMITS = Object.freeze({
  projectBytes: 2147483648,
  sourceBytes: 2147483648,
  conversionBytes: 536870912,
  modelTriangles: 0,
  occupiedVoxels: 5000000,
  mergedQuads: 1000000,
  conversionTimeoutMs: 0
});

function normalizeResourceLimits(limits = {}) {
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) throw new Error('Invalid resource limits');
  const normalized = { ...DEFAULT_RESOURCE_LIMITS };
  for (const [key, value] of Object.entries(limits)) {
    if (!Object.hasOwn(DEFAULT_RESOURCE_LIMITS, key)) throw new Error('Unknown resource limit: ' + key);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Resource limit must be a nonnegative safe integer: ' + key);
    if (key === 'conversionTimeoutMs' && value > 2147483647) throw new Error('Conversion timeout exceeds the supported timer range');
    normalized[key] = value;
  }
  return normalized;
}

module.exports = { DEFAULT_RESOURCE_LIMITS, normalizeResourceLimits };
