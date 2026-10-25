import * as THREE from 'three/webgpu';
import { GEO } from './sf-data.js';
import { heightAt } from './terrain.js';
import { createSidewalkMaterial, createCurbMaterial } from './tsl-materials.js';

// js/streetscape.js
// Curbs & sidewalks along every street of San Francisco, from the curb lines traced around each island of non-road
// land (tools/geo-blocks.mjs: GEO.curbs, the island on the right of travel, with the sidewalk's width at each vertex as
// measured to the property line). For each run: a granite curb face up from the roadway, a concrete sidewalk a curb
// height above the graded ground inward to the property line, and an inner drop down to the lot beyond (so no gap
// shows where a lot lies lower than the sidewalk). Everything follows the hills every few metres. ~2,300 km of curb:
// built only in the 500 m tiles around the camera.

const CURB_H = 0.15; // matches city-config ISLAND_BOUNDS.sidewalkHeight
const STEP = 3; // m between ground samples along a run
const TILE = 500;
const NEAR = 600;
const MAX_WIDTH = 6.5; // widest sidewalk drawn; no parcel within ~10 m (parks, plazas): a 2.5 m path
const OPEN_WIDTH = 2.5;

// Curb runs: { pts: [{x, z}], sw: [m], closed }
const RUNS = GEO.curbs.map(([closed, flat, sw]) => {
  const pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push({ x: flat[i] / 10, z: flat[i + 1] / 10 });
  return { pts, sw: sw.map((v) => v / 10), closed: !!closed };
});

// Points every <= STEP m along a run, with the inward normal (miter at the original vertices) and sidewalk width
function sampleRun(run) {
  const { pts, sw, closed } = run;
  const n = pts.length;
  const segs = closed ? n : n - 1;
  const segNormal = (i) => {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return { x: -dz / l, z: dx / l }; // right of travel: the island
  };
  const width = (v) => (v >= 10 ? OPEN_WIDTH : Math.min(MAX_WIDTH, Math.max(1.2, v)));
  const out = [];
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.01) continue;
    const k = Math.max(1, Math.ceil(len / STEP));
    const nrm = segNormal(i);
    for (let j = 0; j < k; j++) {
      const t = j / k;
      let nx = nrm.x, nz = nrm.z, scale = 1;
      if (j === 0 && (closed || i > 0)) {
        // miter with the previous segment, limited so sharp corners don't spike
        const prev = segNormal((i - 1 + segs) % segs);
        const mx = prev.x + nrm.x, mz = prev.z + nrm.z, ml = Math.hypot(mx, mz);
        if (ml > 0.3) {
          nx = mx / ml;
          nz = mz / ml;
          scale = Math.min(2, 1 / Math.max(0.5, nx * nrm.x + nz * nrm.z));
        }
      }
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, nx, nz, scale, w: width(sw[i] + (sw[(i + 1) % n] - sw[i]) * t) });
    }
  }
  if (!closed) {
    const last = pts[n - 1];
    const nrm = segNormal(n - 2);
    out.push({ x: last.x, z: last.z, nx: nrm.x, nz: nrm.z, scale: 1, w: width(sw[n - 1]) });
  } else if (out.length) {
    out.push({ ...out[0] });
  }
  return out;
}

function buildTile(runs, sidewalkMat, curbMat) {
  const top = { pos: [], nrm: [], idx: [] };
  const face = { pos: [], nrm: [], idx: [] };
  for (const run of runs) {
    const s = sampleRun(run);
    if (s.length < 2) continue;
    const t0 = top.pos.length / 3, f0 = face.pos.length / 3;
    for (const p of s) {
      const w = p.w * p.scale;
      const ix = p.x + p.nx * w, iz = p.z + p.nz * w;
      const yc = heightAt(p.x, p.z), yi = heightAt(ix, iz);
      // sidewalk: curb edge, inner edge
      top.pos.push(p.x, yc + CURB_H, p.z, ix, yi + CURB_H, iz);
      top.nrm.push(0, 1, 0, 0, 1, 0);
      // curb face (facing the road: -normal), bottom & top; inner drop (facing the lot: +normal), top & bottom
      face.pos.push(p.x, yc - 0.06, p.z, p.x, yc + CURB_H, p.z, ix, yi + CURB_H, iz, ix, yi - 0.4, iz);
      face.nrm.push(-p.nx, 0, -p.nz, -p.nx, 0, -p.nz, p.nx, 0, p.nz, p.nx, 0, p.nz);
    }
    for (let k = 0; k + 1 < s.length; k++) {
      // the run goes forward with the island on its right; seen from above (+y), curb (c) & inner (i) points of k, k+1
      const c0 = t0 + k * 2, i0 = c0 + 1, c1 = c0 + 2, i1 = c0 + 3;
      top.idx.push(c0, i1, c1, c0, i0, i1); // facing up
      const b0 = f0 + k * 4, b1 = b0 + 4; // curb: bottom, top; drop: top, bottom
      face.idx.push(b0, b0 + 1, b1 + 1, b0, b1 + 1, b1); // curb face, seen from the road
      face.idx.push(b0 + 2, b0 + 3, b1 + 3, b0 + 2, b1 + 3, b1 + 2); // inner drop, seen from the lot
    }
  }
  const meshes = [];
  for (const [g, mat] of [[top, sidewalkMat], [face, curbMat]]) {
    if (!g.idx.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3));
    geo.setIndex(g.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(g.idx, 1) : new THREE.Uint16BufferAttribute(g.idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = mat === curbMat;
    mesh.matrixAutoUpdate = false;
    mesh.name = mat === curbMat ? 'Curbs' : 'Sidewalks';
    meshes.push(mesh);
  }
  return meshes;
}

function buildStreetscape(scene) {
  const group = new THREE.Group();
  group.name = 'SFStreetscapeTiles';
  scene.add(group);
  const sidewalkMat = createSidewalkMaterial();
  sidewalkMat.polygonOffset = true;
  sidewalkMat.polygonOffsetFactor = -1;
  sidewalkMat.polygonOffsetUnits = -1;
  // the curb & drop faces are seen from both sides where a run doubles back on itself
  const curbMat = createCurbMaterial();
  curbMat.side = THREE.DoubleSide;

  const tiles = new Map(); // key -> runs (by the centre of each run's bounds)
  for (const run of RUNS) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of run.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const key = `${Math.floor((x0 + x1) / 2 / TILE)},${Math.floor((z0 + z1) / 2 / TILE)}`;
    let list = tiles.get(key);
    if (!list) tiles.set(key, (list = []));
    list.push(run);
  }
  const live = new Map();
  const tileDist = (key, x, z) => {
    const [tx, tz] = key.split(',').map(Number);
    const dx = Math.max(tx * TILE - x, 0, x - (tx + 1) * TILE), dz = Math.max(tz * TILE - z, 0, z - (tz + 1) * TILE);
    return Math.hypot(dx, dz);
  };
  function update(x, z, budget = 2) {
    for (const [key, meshes] of live) {
      if (tileDist(key, x, z) <= NEAR + 200) continue;
      for (const m of meshes) {
        group.remove(m);
        m.geometry.dispose();
      }
      live.delete(key);
    }
    const want = [];
    for (const key of tiles.keys()) {
      if (live.has(key)) continue;
      const d = tileDist(key, x, z);
      if (d < NEAR) want.push([d, key]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, key] of want.slice(0, budget)) {
      const meshes = buildTile(tiles.get(key), sidewalkMat, curbMat);
      for (const m of meshes) group.add(m);
      live.set(key, meshes);
    }
  }
  return { group, update, runs: RUNS };
}

export { buildStreetscape, sampleRun, RUNS as CURB_RUNS };
