/**
 * Minimal JSON-stat 2.0 reader, enough for Eurostat's dissemination API.
 *
 * Eurostat returns one flat `value` map keyed by the row-major offset across
 * every dimension, so reading it means rebuilding the strides rather than
 * indexing naively. `value` may arrive as a dense array or a sparse object,
 * and missing observations are simply absent in both cases.
 */
export function readJsonStat(payload) {
  const dimIds = payload.id ?? Object.keys(payload.dimension ?? {});
  const sizes = payload.size ?? dimIds.map((d) => Object.keys(payload.dimension[d].category.index).length);

  // Row-major strides: the last dimension varies fastest.
  const strides = new Array(dimIds.length).fill(1);
  for (let i = dimIds.length - 2; i >= 0; i--) strides[i] = strides[i + 1] * sizes[i + 1];

  const axes = dimIds.map((id) => {
    const cat = payload.dimension[id].category;
    const index = cat.index ?? {};
    // `index` is either {code: position} or an ordered array of codes.
    const codes = Array.isArray(index)
      ? index
      : Object.keys(index).sort((a, b) => index[a] - index[b]);
    return { id, codes, labels: cat.label ?? {} };
  });

  const raw = payload.value ?? {};
  const valueAt = (offset) => {
    const v = Array.isArray(raw) ? raw[offset] : raw[String(offset)];
    return typeof v === 'number' ? v : null;
  };

  return {
    axes,
    labelFor: (dimId, code) => axes.find((a) => a.id === dimId)?.labels[code] ?? code,
    /** coords: { dimId: code }. Returns null when the observation is absent. */
    get(coords) {
      let offset = 0;
      for (let i = 0; i < axes.length; i++) {
        const pos = axes[i].codes.indexOf(coords[axes[i].id]);
        if (pos < 0) return null;
        offset += pos * strides[i];
      }
      return valueAt(offset);
    },
  };
}
