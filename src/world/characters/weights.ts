/**
 * Skin weights for a polygonised character piece, from the same field that made the surface.
 *
 * Every vertex knows its K nearest primitives and their own distances (./surface-nets.ts). A primitive that is
 * almost as close as the nearest one shares the vertex: its weight falls off smoothly with the distance gap,
 * over a width tied to the primitive's blend radius, so where the field blends two bones (shoulder, hip, elbow,
 * knee, the llama's neck) the skin blends them too. The weights are then relaxed over the mesh (a few rounds
 * of neighbour averaging) so a bend spreads over a band of skin instead of folding on one edge loop, and
 * finally cut to the 4 strongest bones and normalised (what three's skinning reads).
 *
 * Pure (no DOM, no Three).
 */

export interface SkinOptions {
  /** Bone of each primitive. */
  primBone: ArrayLike<number>;
  /** Falloff width of each primitive (units): the distance gap over which it fades out of a vertex. */
  primWidth: ArrayLike<number>;
  /** Number of bones in the skeleton. */
  bones: number;
  /** Neighbour-averaging rounds (0 = none). */
  relax?: number;
}

export interface Skin {
  index: Uint16Array;
  weight: Float32Array;
}

/** Smooth compact falloff: 1 at gap 0 → 0 at gap ≥ width. */
export function falloff(gap: number, width: number) {
  if (width <= 0) return gap <= 0 ? 1 : 0;
  const x = Math.min(1, Math.max(0, 1 - gap / width));
  return x * x * (3 - 2 * x);
}

/** Dense per-vertex bone weights from the nearest-primitive lists (not yet normalised to 4). */
export function denseWeights(near: Int16Array, nearD: Float32Array, k: number, nv: number, o: SkinOptions) {
  const nb = o.bones;
  const w = new Float32Array(nv * nb);
  for (let v = 0; v < nv; v++) {
    const base = v * k;
    const p0 = near[base] as number;
    if (p0 < 0) continue;
    const d0 = nearD[base] as number;
    for (let j = 0; j < k; j++) {
      const p = near[base + j] as number;
      if (p < 0) break;
      const f = falloff((nearD[base + j] as number) - d0, o.primWidth[p] as number);
      if (f <= 0) continue;
      w[v * nb + (o.primBone[p] as number)] += f;
    }
  }
  return w;
}

/** Averages each vertex's weights with its mesh neighbours (`rounds` times, half own / half neighbours). */
export function relaxWeights(w: Float32Array, nv: number, nb: number, indices: ArrayLike<number>, rounds: number) {
  if (rounds <= 0) return w;
  // Adjacency in CSR form from the triangle list.
  const deg = new Uint32Array(nv);
  for (let i = 0; i < indices.length; i++) deg[indices[i] as number] = (deg[indices[i] as number] as number) + 2;
  const start = new Uint32Array(nv + 1);
  for (let v = 0; v < nv; v++) start[v + 1] = (start[v] as number) + (deg[v] as number);
  const adj = new Uint32Array(start[nv] as number);
  const fill = start.slice(0, nv);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] as number;
    const b = indices[t + 1] as number;
    const c = indices[t + 2] as number;
    const put = (x: number, y: number) => {
      adj[fill[x] as number] = y;
      fill[x] = (fill[x] as number) + 1;
    };
    put(a, b);
    put(a, c);
    put(b, a);
    put(b, c);
    put(c, a);
    put(c, b);
  }
  let src = normaliseDense(w, nv, nb);
  let dst = new Float32Array(w.length);
  for (let r = 0; r < rounds; r++) {
    for (let v = 0; v < nv; v++) {
      const s0 = start[v] as number;
      const s1 = start[v + 1] as number;
      const n = s1 - s0;
      for (let b = 0; b < nb; b++) {
        let acc = 0;
        for (let s = s0; s < s1; s++) acc += src[(adj[s] as number) * nb + b] as number;
        const own = src[v * nb + b] as number;
        dst[v * nb + b] = n ? own * 0.5 + (acc / n) * 0.5 : own;
      }
    }
    const t = src;
    src = dst;
    dst = t;
  }
  return src;
}

/** Each vertex's dense weights scaled to sum 1 (a vertex with none keeps zeros). */
export function normaliseDense(w: Float32Array, nv: number, nb: number) {
  const out = new Float32Array(w.length);
  for (let v = 0; v < nv; v++) {
    let s = 0;
    for (let b = 0; b < nb; b++) s += w[v * nb + b] as number;
    if (s <= 0) continue;
    for (let b = 0; b < nb; b++) out[v * nb + b] = (w[v * nb + b] as number) / s;
  }
  return out;
}

/** The 4 strongest bones of each vertex, renormalised to sum exactly 1 (bone 0 with weight 1 when empty). */
export function topFour(w: Float32Array, nv: number, nb: number, fallbackBone = 0): Skin {
  const index = new Uint16Array(nv * 4);
  const weight = new Float32Array(nv * 4);
  const bi = [0, 0, 0, 0];
  const bw = [0, 0, 0, 0];
  for (let v = 0; v < nv; v++) {
    bw.fill(0);
    bi.fill(fallbackBone);
    for (let b = 0; b < nb; b++) {
      const x = w[v * nb + b] as number;
      if (x <= (bw[3] as number)) continue;
      let s = 3;
      while (s > 0 && (bw[s - 1] as number) < x) {
        bw[s] = bw[s - 1] as number;
        bi[s] = bi[s - 1] as number;
        s--;
      }
      bw[s] = x;
      bi[s] = b;
    }
    const sum = (bw[0] as number) + (bw[1] as number) + (bw[2] as number) + (bw[3] as number);
    for (let s = 0; s < 4; s++) {
      index[v * 4 + s] = bi[s] as number;
      weight[v * 4 + s] = sum > 0 ? (bw[s] as number) / sum : s === 0 ? 1 : 0;
    }
  }
  return { index, weight };
}

/** Full pipeline: nearest-primitive lists → relaxed, top-4, normalised skin. */
export function skinFromField(
  near: Int16Array,
  nearD: Float32Array,
  k: number,
  nv: number,
  indices: ArrayLike<number>,
  o: SkinOptions,
): Skin {
  const dense = denseWeights(near, nearD, k, nv, o);
  const relaxed = relaxWeights(dense, nv, o.bones, indices, o.relax ?? 2);
  return topFour(relaxed, nv, o.bones);
}

/** Every vertex fully on one bone (rigid accessories: hat brims, pins, the backpack). */
export function rigidSkin(nv: number, bone: number): Skin {
  const index = new Uint16Array(nv * 4);
  const weight = new Float32Array(nv * 4);
  for (let v = 0; v < nv; v++) {
    index[v * 4] = bone;
    weight[v * 4] = 1;
  }
  return { index, weight };
}

/** Blend between two bones by a per-vertex factor t (0 → a, 1 → b): braids, cords, cloth hems. */
export function chainSkin(nv: number, pick: (v: number) => Array<[bone: number, w: number]>): Skin {
  const index = new Uint16Array(nv * 4);
  const weight = new Float32Array(nv * 4);
  for (let v = 0; v < nv; v++) {
    const list = pick(v)
      .filter((e) => e[1] > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const sum = list.reduce((s, e) => s + e[1], 0) || 1;
    list.forEach(([b, w], s) => {
      index[v * 4 + s] = b;
      weight[v * 4 + s] = w / sum;
    });
    if (!list.length) weight[v * 4] = 1;
  }
  return { index, weight };
}
