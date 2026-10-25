// tools/geo-grade.mjs — grades the 4 m heightfield under the streets: every road gets a smooth longitudinal profile
// (the bare-earth DEM sampled along its centreline, averaged over ~16 m), its ends meet the other roads of an
// intersection at one shared height, and the ground across it is level (no cross slope) out to the curbs, easing back
// into the natural terrain across the sidewalk. SF's grades survive intact: Filbert St still climbs at 31%.
import { log } from './geo-util.mjs';
import { sampleGrid } from './geo-terrain.mjs';

const STEP = 2;
const HALF_WIN = 4; // samples either side (±8 m)

export function gradeRoads(T, segments) {
  const roads = segments.filter((s) => s.kind === 'road');
  // 1. Smoothed profiles
  for (const s of roads) {
    const n = Math.max(2, Math.ceil(s.len / STEP) + 1);
    const xs = new Float32Array(n), zs = new Float32Array(n), hs = new Float32Array(n);
    let seg = 1, acc = 0;
    for (let k = 0; k < n; k++) {
      const target = (k / (n - 1)) * s.len;
      while (seg < s.pts.length - 1) {
        const l = Math.hypot(s.pts[seg][0] - s.pts[seg - 1][0], s.pts[seg][1] - s.pts[seg - 1][1]);
        if (acc + l >= target) break;
        acc += l;
        seg++;
      }
      const [x0, z0] = s.pts[seg - 1], [x1, z1] = s.pts[seg];
      const l = Math.hypot(x1 - x0, z1 - z0) || 1;
      const t = Math.min(1, Math.max(0, (target - acc) / l));
      xs[k] = x0 + (x1 - x0) * t;
      zs[k] = z0 + (z1 - z0) * t;
      hs[k] = sampleGrid(T, xs[k], zs[k]);
    }
    const sm = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      let sum = 0, w = 0;
      for (let q = Math.max(0, k - HALF_WIN); q <= Math.min(n - 1, k + HALF_WIN); q++) { sum += hs[q]; w++; }
      sm[k] = sum / w;
    }
    s.prof = { xs, zs, hs: sm };
  }
  // 2. One height per intersection node
  const nodeSum = new Map();
  const add = (id, h) => { const v = nodeSum.get(id) || [0, 0]; v[0] += h; v[1]++; nodeSum.set(id, v); };
  for (const s of roads) { add(s.a, s.prof.hs[0]); add(s.b, s.prof.hs[s.prof.hs.length - 1]); }
  const nodeH = new Map([...nodeSum].map(([id, [sum, n]]) => [id, sum / n]));
  for (const s of roads) {
    const hs = s.prof.hs, n = hs.length;
    const d0 = nodeH.get(s.a) - hs[0], d1 = nodeH.get(s.b) - hs[n - 1];
    for (let k = 0; k < n; k++) hs[k] += d0 + (d1 - d0) * (k / (n - 1));
  }
  // 3. Nearest-road height for every terrain cell within reach, then blend
  const { w, h, res, x0, z0 } = T;
  const bestD = new Float32Array(w * h).fill(Infinity);
  const bestH = new Float32Array(w * h);
  const core = new Float32Array(w * h), outer = new Float32Array(w * h);
  for (const s of roads) {
    const { xs, zs, hs } = s.prof;
    const c = s.rw / 2 + 0.5, o = s.rw / 2 + Math.max(2, s.sw) + 3;
    for (let k = 1; k < xs.length; k++) {
      const ax = xs[k - 1], az = zs[k - 1], bx = xs[k], bz = zs[k];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - o - x0) / res)), i1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + o - x0) / res));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - o - z0) / res)), j1 = Math.min(h - 1, Math.ceil((Math.max(az, bz) + o - z0) / res));
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
      for (let j = j0; j <= j1; j++) {
        const pz = z0 + (j + 0.5) * res;
        for (let i = i0; i <= i1; i++) {
          const px = x0 + (i + 0.5) * res;
          let t = ((px - ax) * dx + (pz - az) * dz) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const d = Math.hypot(ax + t * dx - px, az + t * dz - pz);
          const q = j * w + i;
          if (d >= o || d >= bestD[q]) continue;
          bestD[q] = d;
          bestH[q] = hs[k - 1] + (hs[k] - hs[k - 1]) * t;
          core[q] = c;
          outer[q] = o;
        }
      }
    }
  }
  let changed = 0, maxDelta = 0;
  for (let q = 0; q < w * h; q++) {
    if (bestD[q] === Infinity || T.water[q]) continue;
    const d = bestD[q];
    const t = Math.min(1, Math.max(0, (outer[q] - d) / (outer[q] - core[q])));
    const wgt = t * t * (3 - 2 * t);
    const nh = T.hgt[q] + (bestH[q] - T.hgt[q]) * wgt;
    maxDelta = Math.max(maxDelta, Math.abs(nh - T.hgt[q]));
    T.hgt[q] = nh;
    changed++;
  }
  log(`graded ${roads.length} roads: ${(changed / 1e6).toFixed(2)} M cells, largest change ${maxDelta.toFixed(1)} m`);
  return nodeH;
}
