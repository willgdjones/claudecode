// tools/geo-blocks.mjs — the ground plan on a 1 m raster: private parcels (DataSF acdm-wktn, gaps between them are
// the public right of way), each street's right-of-way width measured across it, roadways stamped at their
// curb-to-curb width (right of way minus both sidewalks), and the curb lines around every island of non-road land.
//
// Classes: 0 water · 1 roadway · 2 open public ground (sidewalk, plaza, park, waterfront) · 3 parcel (private lot)
import fs from 'node:fs';
import { loadFeatures, log, rawPath, Raster, labelComponents, traceComponent, rdp, rdpRing } from './geo-util.mjs';
import { toWorld } from './geo-frame.mjs';
import { segments, along } from './geo-streets.mjs';
import { TERRAIN } from './geo-terrain.mjs';

export const PLAN = { x0: -9700, z0: -5700, x1: 4500, z1: 8900, res: 1 };
export const C_WATER = 0, C_ROAD = 1, C_OPEN = 2, C_PARCEL = 3;

// Right of way (property line to property line) when it can't be measured, by layer / class
function defaultRow(s) {
  if (s.layer.startsWith('PARKS')) return 0; // park drives: no sidewalks, roadway only
  return { 1: 30, 2: 30, 3: 25, 4: 24, 5: 20 }[s.cls] || 14;
}
const PARK_ROADWAY = 8;

function rasteriseParcels(R) {
  let nParcels = 0;
  for (const f of loadFeatures('parcels')) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
    for (const poly of polys) {
      R.fillRing(poly[0].map(([lon, lat]) => toWorld(lon, lat)), 1);
      for (let k = 1; k < poly.length; k++) R.fillRing(poly[k].map(([lon, lat]) => toWorld(lon, lat)), 0);
      nParcels++;
    }
  }
  R.close(0.8); // slivers between neighbouring lots
  log(`parcels: ${nParcels} polygons`);
}

export function buildPlan(terrain) {
  const t0 = Date.now();
  const R = new Raster(PLAN.x0, PLAN.z0, PLAN.x1, PLAN.z1, PLAN.res);
  const { w: W, h: H } = R;
  log(`plan raster ${W} x ${H}`);
  const cache = rawPath('cache/plan.bin');
  const cached = fs.existsSync(cache) ? fs.readFileSync(cache) : null;

  // --- 1. Parcels ---------------------------------------------------------------------------------------------------
  if (cached) R.d.set(cached.subarray(0, W * H));
  else rasteriseParcels(R);
  const P = R.d.slice(); // 1 = parcel
  if (!cached) fs.writeFileSync(cache, P);
  log(`parcels rasterised (${((Date.now() - t0) / 1000).toFixed(0)} s)`);


  const inP = (x, z) => {
    const i = Math.floor((x - R.x0) / R.res), j = Math.floor((z - R.z0) / R.res);
    return i >= 0 && j >= 0 && i < W && j < H && P[j * W + i] === 1;
  };

  // --- 2. Right of way across every road -----------------------------------------------------------------------------
  const median = (a) => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
  for (const s of segments) {
    if (s.kind !== 'road') continue;
    const both = [], one = [];
    let inside = 0, n = 0;
    const nst = Math.max(1, Math.floor(s.len / 8));
    for (let k = 0; k < nst; k++) {
      const p = along(s.pts, ((k + 0.5) / nst) * s.len);
      n++;
      if (inP(p.x, p.z)) { inside++; continue; }
      const nx = -p.dz, nz = p.dx;
      let dl = -1, dr = -1;
      for (let t = 0.5; t <= 40; t += 0.5) {
        if (dl < 0 && inP(p.x + nx * t, p.z + nz * t)) dl = t;
        if (dr < 0 && inP(p.x - nx * t, p.z - nz * t)) dr = t;
        if (dl >= 0 && dr >= 0) break;
      }
      if (dl >= 0 && dr >= 0) both.push(dl + dr);
      else if (dl >= 0 || dr >= 0) one.push(2 * Math.max(dl, dr));
    }
    let row;
    s.inParcel = inside > n / 2; // park drives, port & campus roads: they cut through the (park) parcel itself
    if (s.layer.startsWith('PARKS') || s.inParcel) row = 0;
    else if (both.length >= Math.max(1, n / 3)) row = median(both);
    else if (one.length) row = Math.min(median(one), defaultRow(s) * 1.5);
    else row = defaultRow(s);
    if (row) row = Math.max(7, Math.min(60, row));
    s.row = row;
    if (row) {
      s.sw = Math.max(1.8, Math.min(7.5, row * 0.19));
      s.rw = Math.max(5, row - 2 * s.sw);
    } else {
      s.sw = 0;
      s.rw = PARK_ROADWAY;
    }
  }
  log(`right of way measured (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

  // --- 3. Classes: water from the terrain, roadways stamped as capsules outside the parcels ----------------------
  const C = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    const z = R.z0 + (j + 0.5) * R.res;
    const tj = Math.floor((z - TERRAIN.z0) / TERRAIN.res);
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const x = R.x0 + (i + 0.5) * R.res;
      const ti = Math.floor((x - TERRAIN.x0) / TERRAIN.res);
      const wet = tj < 0 || ti < 0 || tj >= TERRAIN.h || ti >= TERRAIN.w || terrain.water[tj * TERRAIN.w + ti] !== 0;
      C[k] = P[k] ? C_PARCEL : wet ? C_WATER : C_OPEN;
    }
  }
  for (const s of segments) {
    if (s.kind !== 'road') continue;
    const r = s.rw / 2, r2 = r * r;
    const over = s.inParcel || s.layer.startsWith('PARKS');
    for (let q = 1; q < s.pts.length; q++) {
      const [x0, z0] = s.pts[q - 1], [x1, z1] = s.pts[q];
      const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - r - R.x0) / R.res)), i1 = Math.min(W - 1, Math.ceil((Math.max(x0, x1) + r - R.x0) / R.res));
      const j0 = Math.max(0, Math.floor((Math.min(z0, z1) - r - R.z0) / R.res)), j1 = Math.min(H - 1, Math.ceil((Math.max(z0, z1) + r - R.z0) / R.res));
      const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1e-9;
      for (let j = j0; j <= j1; j++) {
        const pz = R.z0 + (j + 0.5) * R.res;
        for (let i = i0; i <= i1; i++) {
          const k = j * W + i;
          if (C[k] === C_PARCEL && !over) continue;
          const px = R.x0 + (i + 0.5) * R.res;
          let t = ((px - x0) * dx + (pz - z0) * dz) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = x0 + t * dx - px, ez = z0 + t * dz - pz;
          if (ex * ex + ez * ez <= r2) C[k] = C_ROAD;
        }
      }
    }
  }
  log(`classes stamped (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

  // --- 4. Curbs: the outline of every island of non-road land, split into the runs that face a roadway ------------
  R.d = C;
  const { lab, comps } = labelComponents(R, (v) => v >= C_OPEN);
  // distance from every cell to the nearest parcel (sidewalk width at a curb)
  R.d = P;
  const toParcel = R.edt((v) => v === 1);
  R.d = C;
  const curbs = [];
  let nIslands = 0;
  for (const c of comps) {
    if (c.n < 12) continue;
    nIslands++;
    const ring = traceComponent(R, lab, c);
    if (ring.length < 3) continue;
    // the cell just outside each edge (left of the walk) tells what the island faces there
    const faces = ring.map((p, i) => {
      const q = ring[(i + 1) % ring.length];
      const ex = q[0] - p[0], ez = q[1] - p[1], l = Math.hypot(ex, ez) || 1;
      const mx = (p[0] + q[0]) / 2 + (ez / l) * 0.9, mz = (p[1] + q[1]) / 2 - (ex / l) * 0.9;
      const ii = Math.floor((mx - R.x0) / R.res), jj = Math.floor((mz - R.z0) / R.res);
      return ii >= 0 && jj >= 0 && ii < W && jj < H ? C[jj * W + ii] : C_WATER;
    });
    // runs of road-facing edges -> open or closed polylines (with the sidewalk width at each vertex)
    const n = ring.length;
    const allRoad = faces.every((f) => f === C_ROAD);
    let start = allRoad ? 0 : faces.findIndex((f, i) => f === C_ROAD && faces[(i + n - 1) % n] !== C_ROAD);
    if (start < 0) continue;
    const visited = new Uint8Array(n);
    for (let s0 = start; s0 < n + start; s0++) {
      const i = s0 % n;
      if (visited[i] || faces[i] !== C_ROAD || (!allRoad && faces[(i + n - 1) % n] === C_ROAD)) continue;
      const run = [];
      let k = i;
      while (faces[k] === C_ROAD && !visited[k]) {
        visited[k] = 1;
        run.push(ring[k]);
        k = (k + 1) % n;
      }
      run.push(ring[k]);
      const closed = allRoad;
      const pts = closed ? rdpRing(run.slice(0, -1), 0.35) : rdp(run, 0.35);
      if (pts.length < (closed ? 3 : 2)) continue;
      const sw = pts.map(([x, z]) => {
        const ii = Math.min(W - 1, Math.max(0, Math.round((x - R.x0) / R.res))), jj = Math.min(H - 1, Math.max(0, Math.round((z - R.z0) / R.res)));
        return Math.min(12, Math.sqrt(toParcel[jj * W + ii]) * R.res);
      });
      curbs.push({ pts, sw, closed, island: c.id });
    }
  }
  log(`curbs: ${curbs.length} runs around ${nIslands} islands (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  return { R, C, P, lab, comps, curbs };
}

/** Majority class of each terrain cell (4 m) from the 1 m plan, for ground shading */
export function classGrid(plan) {
  const { R, C } = plan;
  const T = TERRAIN;
  const out = new Uint8Array(T.w * T.h);
  const cnt = new Uint16Array(4);
  for (let tj = 0; tj < T.h; tj++) {
    for (let ti = 0; ti < T.w; ti++) {
      cnt.fill(0);
      const x0 = T.x0 + ti * T.res, z0 = T.z0 + tj * T.res;
      for (let dj = 0; dj < T.res; dj++) {
        const j = Math.floor((z0 + dj + 0.5 - R.z0) / R.res);
        if (j < 0 || j >= R.h) continue;
        for (let di = 0; di < T.res; di++) {
          const i = Math.floor((x0 + di + 0.5 - R.x0) / R.res);
          if (i < 0 || i >= R.w) continue;
          cnt[C[j * R.w + i]]++;
        }
      }
      let best = 0;
      for (let c = 1; c < 4; c++) if (cnt[c] > cnt[best] || (c === C_ROAD && cnt[c] >= 6)) best = c;
      if (cnt[C_ROAD] >= 6) best = C_ROAD;
      out[tj * T.w + ti] = cnt[0] + cnt[1] + cnt[2] + cnt[3] ? best : C_WATER;
    }
  }
  return out;
}
