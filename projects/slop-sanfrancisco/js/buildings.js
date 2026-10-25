import * as THREE from 'three/webgpu';
import { GEO, BUILDINGS } from './sf-data.js';
import { GROUND, groundAt } from './terrain.js';
import { createPreWarBuildingMaterial, createCurtainWallMaterial, WALL_KINDS } from './tsl-materials.js';

// js/buildings.js
// Every building in San Francisco, on its real footprint and at its real height (DataSF footprints with 2010 LiDAR
// roofs, see tools/geo-buildings.mjs), standing on the hills from its lowest corner.
//
// Two levels of detail share the facade shaders of tsl-materials.js:
// - far: per 1 km chunk one InstancedMesh of oriented boxes (each footprint's minimum-area rectangle), storeys counted
//   from each box's own bottom ('boxbase')
// - near (~1.1 km around the camera): per 500 m tile, the footprints themselves extruded, every wall carrying its own
//   frame ('wall' mode: metres along it, height above the base) so window bays fit each wall and storeys line up on
//   any slope. Street fronts get storefronts or front doors, walls against a neighbour are party walls.
// Painted Victorians & Edwardians, Sunset stucco, brick & stone mid-rises and the downtown towers are one pre-war
// material with per-vertex paint, bay width & storey height; glass towers use the curtain wall.

const STYLE = Object.fromEntries(GEO.buildings.styles.map((s, i) => [s, i])); // house rowhouse midrise tower industrial civic shed
const TILE = GEO.buildings.tile; // 500 m
const CHUNK = 1000;
const NEAR_DIST = 1100;
const FAR_DIST = 1350; // hysteresis

function hash(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
const linear = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
// Facade palettes (sRGB) per style
const PALETTES = {
  rowhouse: [0xe8d9b5, 0xc9d6c0, 0xa9c4d6, 0xd8c6dc, 0xf1df9c, 0xe7b8a6, 0xf2efe6, 0x9fb7a4, 0xd4a77d, 0x8fa8c0, 0xf0c9a8, 0xb9c9a0],
  house: [0xf3ead7, 0xe9dcc0, 0xd9e4e0, 0xf0d9cf, 0xe5e1d2, 0xd2d8c8, 0xf4e6c2, 0xe8e8e8, 0xdfd0e2],
  midrise: [0xd8cdb8, 0xa45a45, 0xe6dfcf, 0xb9aa92, 0x8c8a85, 0xc4b59a, 0xefe9da, 0x9b5a48],
  tower: [0xd8d2c4, 0xbfb6a6, 0x9a948a, 0xe0d8c8, 0x7f7a73],
  industrial: [0x9c9890, 0xb5ab98, 0x8a7f72, 0xc2bcb0, 0xa59f93],
  civic: [0xe8e2d4, 0xd9d2c2, 0xcfc6b2],
  shed: [0xb0aca2, 0xc8c2b4, 0x8f8a80]
};
const PAINT = Object.fromEntries(Object.entries(PALETTES).map(([k, v]) => [k, v.map(linear)]));
// [window bay width, storey height] per style
const LAYOUT = {
  rowhouse: [1.7, 3.35], house: [2.3, 3.0], midrise: [2.4, 3.3], tower: [2.7, 3.8],
  industrial: [3.6, 4.6], civic: [2.9, 4.6], shed: [3.0, 3.0]
};
const STYLE_NAMES = Object.keys(STYLE);
const BRICK_SHARE = { midrise: 0.3, industrial: 0.45, civic: 0.25, tower: 0.15 };

function facadeOf(b) {
  const name = STYLE_NAMES[b.style] || 'midrise';
  const r = hash(b.seed + b.cx * 0.013);
  const pal = PAINT[name];
  const paint = pal[Math.floor(r * pal.length) % pal.length];
  const [ww, fh] = LAYOUT[name];
  const glass = name === 'tower' && hash(b.seed * 1.7 + 3.1) < 0.55 ? (hash(b.seed + 9.2) < 0.5 ? 1 : 2) : 0;
  // Wall finish: San Francisco's houses are painted wood & stucco; some of the older midrise, warehouse & civic
  // buildings are brick. A negative storey height in the paint attribute marks brick (tsl-materials.js perVertex).
  const brick = hash(b.seed * 2.3 + 0.7) < (BRICK_SHARE[name] || 0);
  return { name, paint, ww: ww * (0.9 + 0.2 * hash(b.seed + 1.3)), fh: brick ? -fh : fh, glass };
}

// --- Footprint helpers -----------------------------------------------------------------------------------------------
/** Minimum-area rectangle of a footprint: { cx, cz, w (along ux), d, ux, uz } */
function minAreaRect(ring) {
  const n = ring.length / 2;
  let best = null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    let ux = ring[j * 2] - ring[i * 2], uz = ring[j * 2 + 1] - ring[i * 2 + 1];
    const l = Math.hypot(ux, uz);
    if (l < 0.5) continue;
    ux /= l;
    uz /= l;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const x = ring[k * 2], z = ring[k * 2 + 1];
      const a = x * ux + z * uz, bb = -x * uz + z * ux;
      if (a < a0) a0 = a;
      if (a > a1) a1 = a;
      if (bb < b0) b0 = bb;
      if (bb > b1) b1 = bb;
    }
    const area = (a1 - a0) * (b1 - b0);
    if (!best || area < best.area) {
      const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
      best = { area, cx: ca * ux - cb * uz, cz: ca * uz + cb * ux, w: a1 - a0, d: b1 - b0, ux, uz };
    }
  }
  return best;
}

function pointInRing(ring, x, z) {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2], zi = ring[i * 2 + 1], xj = ring[j * 2], zj = ring[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// --- Spatial index of buildings (64 m cells) ---------------------------------------------------------------------------
const CELL = 64;
const cells = new Map();
const cellKey = (i, j) => (i + 512) * 2048 + (j + 512);
BUILDINGS.forEach((b, id) => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let k = 0; k < b.ring.length; k += 2) {
    x0 = Math.min(x0, b.ring[k]); x1 = Math.max(x1, b.ring[k]);
    z0 = Math.min(z0, b.ring[k + 1]); z1 = Math.max(z1, b.ring[k + 1]);
  }
  b.minX = x0; b.maxX = x1; b.minZ = z0; b.maxZ = z1;
  b.id = id;
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
    for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const k = cellKey(i, j);
      let list = cells.get(k);
      if (!list) cells.set(k, (list = []));
      list.push(b);
    }
  }
});
/** The building whose footprint contains (x, z), if any (skip one) */
function buildingAt(x, z, skip = null) {
  const list = cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!list) return null;
  for (const b of list) {
    if (b === skip || x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (pointInRing(b.ring, x, z)) return b;
  }
  return null;
}

// What a wall looks onto: the street (shop or front door), a neighbour's wall (party wall), or a yard
function wallKind(b, f, x0, z0, x1, z1) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  if (L < 2.2 || f.name === 'shed') return WALL_KINDS.blankStone;
  const nx = (z1 - z0) / L, nz = -(x1 - x0) / L; // outward (ring is counter-clockwise in x/z)
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  if (buildingAt(mx + nx * 0.9, mz + nz * 0.9, b)) return WALL_KINDS.lotLine;
  for (const d of [3, 7]) {
    const g = groundAt(mx + nx * d, mz + nz * d);
    if (g === GROUND.ROAD || g === GROUND.OPEN || g === GROUND.PARK) {
      return f.name === 'rowhouse' || f.name === 'house' ? WALL_KINDS.entry : WALL_KINDS.shop;
    }
  }
  return WALL_KINDS.rear;
}

// The angled bay window of a Victorian / Edwardian street front: three faces (two splayed at 45°, one parallel to the
// wall 0.8 m out) from the top of the ground floor to just under the cornice, with a cap above and a soffit below.
// Off-centre (the front door beside it) on most lots; each face is its own little wall with one window per storey.
const BAY_DEPTH = 0.8;
function addBayWindow(o, b, f, x0, z0, x1, z1, L, nx, nz, H, seedTone, wallIndex) {
  const fh = Math.abs(f.fh);
  if (L < 4.2 || H < fh * 1.9 || hash(b.seed * 3.1 + wallIndex) > 0.8) return;
  const w = Math.min(3.6, L * 0.5);
  const side = hash(b.seed + wallIndex * 1.7);
  const sc = L < 6.5 ? L / 2 : L * (side < 0.5 ? 0.34 : 0.66);
  const dx = (x1 - x0) / L, dz = (z1 - z0) / L;
  const at = (s, out) => [x0 + dx * s + nx * out, z0 + dz * s + nz * out];
  // plan outline, along the wall: back corner, front corner, front corner, back corner
  const P = [at(sc - w / 2, 0), at(sc - w / 2 + BAY_DEPTH, BAY_DEPTH), at(sc + w / 2 - BAY_DEPTH, BAY_DEPTH), at(sc + w / 2, 0)];
  const y0 = b.base + fh, y1 = b.top - Math.min(0.7, fh * 0.2);
  for (let k = 0; k < 3; k++) {
    const [ax, az] = P[k], [cx, cz] = P[k + 1];
    const fl = Math.hypot(cx - ax, cz - az);
    const fnx = (cz - az) / fl, fnz = -(cx - ax) / fl;
    const v = o.pos.length / 3;
    o.pos.push(ax, y0, az, cx, y0, cz, cx, y1, cz, ax, y1, az);
    for (let q = 0; q < 4; q++) o.nrm.push(fnx, 0, fnz);
    const v0 = y0 - b.base, v1 = y1 - b.base;
    o.wall.push(0, v0, fl, H, fl, v0, fl, H, fl, v1, fl, H, 0, v1, fl, H);
    for (let q = 0; q < 4; q++) o.info.push(WALL_KINDS.entry, seedTone, wallIndex * 3 + 7 + k, fl);
    for (let q = 0; q < 4; q++) o.paint.push(f.paint[0], f.paint[1], f.paint[2], f.fh);
    o.idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
  }
  // cap (facing up) & soffit (facing down): the quad P0..P3 at y1 and y0, in the trim's blank stone
  for (const [y, ny] of [[y1, 1], [y0, -1]]) {
    const v = o.pos.length / 3;
    for (const [px, pz] of P) {
      o.pos.push(px, y, pz);
      o.nrm.push(0, ny, 0);
      o.wall.push(0, H, 1, H);
      o.info.push(WALL_KINDS.blankStone, seedTone, 0, f.ww);
      o.paint.push(f.paint[0], f.paint[1], f.paint[2], f.fh);
    }
    // P runs along the wall with the bay on its outward side; wind so the cap faces up (as the roof triangles)
    const cross = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
    const up = (cross < 0) === (ny > 0);
    if (up) o.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    else o.idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
  }
}

// --- Near geometry: extruded footprints with per-vertex wall frames ------------------------------------------------------
function buildNearGeometry(list) {
  const geos = [null, null, null]; // pre-war, glass A, glass B
  const out = [0, 1, 2].map(() => ({ pos: [], nrm: [], wall: [], info: [], paint: [], idx: [] }));
  for (const b of list) {
    const f = facadeOf(b);
    const o = out[f.glass];
    const H = b.top - b.base;
    const tone = 0.1 + 0.8 * hash(b.seed + 4.4);
    const seedTone = (b.seed % 61) + tone;
    const n = b.ring.length / 2;
    const vbase = () => o.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x0 = b.ring[i * 2], z0 = b.ring[i * 2 + 1], x1 = b.ring[j * 2], z1 = b.ring[j * 2 + 1];
      const L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 0.05) continue;
      const nx = (z1 - z0) / L, nz = -(x1 - x0) / L;
      const kind = wallKind(b, f, x0, z0, x1, z1);
      const v = vbase();
      // A (start, bottom), B (end, bottom), C (end, top), D (start, top); outward faces: (A, C, B), (A, D, C)
      o.pos.push(x0, b.base, z0, x1, b.base, z1, x1, b.top, z1, x0, b.top, z0);
      for (let k = 0; k < 4; k++) o.nrm.push(nx, 0, nz);
      o.wall.push(0, 0, L, H, L, 0, L, H, L, H, L, H, 0, H, L, H);
      for (let k = 0; k < 4; k++) o.info.push(kind, seedTone, i * 3, f.ww);
      for (let k = 0; k < 4; k++) o.paint.push(f.paint[0], f.paint[1], f.paint[2], f.fh);
      o.idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
      if (kind === WALL_KINDS.entry) addBayWindow(o, b, f, x0, z0, x1, z1, L, nx, nz, H, seedTone, i);
    }
    // flat roof
    const contour = [];
    for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(b.ring[i * 2], b.ring[i * 2 + 1]));
    let tris;
    try {
      tris = THREE.ShapeUtils.triangulateShape(contour, []);
    } catch {
      tris = [];
    }
    const v = vbase();
    for (let i = 0; i < n; i++) {
      o.pos.push(b.ring[i * 2], b.top, b.ring[i * 2 + 1]);
      o.nrm.push(0, 1, 0);
      o.wall.push(0, H, 1, H);
      o.info.push(WALL_KINDS.blankStone, seedTone, 0, f.ww);
      o.paint.push(f.paint[0], f.paint[1], f.paint[2], f.fh);
    }
    // Wind every roof triangle to face up (+y): with x east & z south that's a negative signed area in x/z
    for (const [a, c, d] of tris) {
      const ax = b.ring[a * 2], az = b.ring[a * 2 + 1];
      const cross = (b.ring[c * 2] - ax) * (b.ring[d * 2 + 1] - az) - (b.ring[d * 2] - ax) * (b.ring[c * 2 + 1] - az);
      if (cross < 0) o.idx.push(v + a, v + c, v + d);
      else o.idx.push(v + a, v + d, v + c);
    }
  }
  out.forEach((o, m) => {
    if (!o.idx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nrm, 3));
    g.setAttribute('wall', new THREE.Float32BufferAttribute(o.wall, 4));
    g.setAttribute('wallInfo', new THREE.Float32BufferAttribute(o.info, 4));
    g.setAttribute('paint', new THREE.Float32BufferAttribute(o.paint, 4));
    g.setIndex(o.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(o.idx, 1) : new THREE.Uint16BufferAttribute(o.idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    geos[m] = g;
  });
  return geos;
}

// --- Far geometry: instanced oriented boxes --------------------------------------------------------------------------------
function buildFarBoxes(list, material) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const n = list.length;
  const box = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  const faces = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  const paint = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  const info = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  geometry.setAttribute('box', box);
  geometry.setAttribute('faces', faces);
  geometry.setAttribute('paint', paint);
  geometry.setAttribute('wallInfo', info);
  const mesh = new THREE.InstancedMesh(geometry, material, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const matrices = new Float32Array(n * 16);
  list.forEach((b, i) => {
    const r = b.rect || (b.rect = minAreaRect(b.ring)) || { cx: b.cx, cz: b.cz, w: 4, d: 4, ux: 1, uz: 0 };
    const f = facadeOf(b);
    const H = b.top - b.base;
    // box x along the rectangle's long axis u: rotation about +y taking +x to (ux, uz) is atan2(-uz, ux)
    m.compose(p.set(r.cx, b.base + H / 2, r.cz), q.setFromAxisAngle(up, Math.atan2(-r.uz, r.ux)), s.set(Math.max(1, r.w), H, Math.max(1, r.d)));
    mesh.setMatrixAt(i, m);
    m.toArray(matrices, i * 16);
    box.setXYZW(i, Math.max(1, r.w), H, Math.max(1, r.d), (b.seed % 61) + 0.1 + 0.8 * hash(b.seed + 4.4));
    const front = f.name === 'rowhouse' || f.name === 'house' ? WALL_KINDS.entry : WALL_KINDS.shop;
    faces.setXYZW(i, WALL_KINDS.lotLine, WALL_KINDS.lotLine, front, front);
    paint.setXYZW(i, f.paint[0], f.paint[1], f.paint[2], f.fh);
    info.setXYZW(i, 0, 0, 0, f.ww);
  });
  mesh.userData.matrices = matrices;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  geometry.computeBoundingBox();
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  return mesh;
}

// --- Materials ----------------------------------------------------------------------------------------------------------
function makeMaterials(mode) {
  return [
    createPreWarBuildingMaterial({ trimColor: 0xf2ede2, windowGlassColor: 0x1a2632, litProbability: 0.5, warmth: 0.82, seed: 21.7, boxLocal: mode, cornerPier: 0.7, perVertex: true, acUnits: false, cladding: 'siding' }),
    createCurtainWallMaterial({ glassTint: 0x1a3a52, frameTint: 0x3b4c5b, windowWidth: 2.7, floorHeight: 3.9, litProbability: 0.6, warmth: 0.52, reflectivity: 0.92, seed: 63.5, boxLocal: mode }),
    createCurtainWallMaterial({ glassTint: 0x2a3036, frameTint: 0xb0bcc8, windowWidth: 2.9, floorHeight: 4.0, litProbability: 0.58, warmth: 0.5, reflectivity: 0.95, seed: 94.3, boxLocal: mode })
  ];
}

function buildCityBlocks(scene) {
  const group = new THREE.Group();
  group.name = 'CityBuildings';
  scene.add(group);
  const nearMats = makeMaterials('wall');
  const farMats = makeMaterials('boxbase');

  // Colliders: every footprint as a polygon (controllers.js), its bounds, base & roof
  const colliders = BUILDINGS.map((b) => ({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, minY: b.base, maxY: b.top, poly: b.ring }));

  // Tiles (500 m, as stored) and far chunks (1 km)
  const tiles = new Map();
  for (const b of BUILDINGS) {
    const key = `${Math.floor(b.cx / TILE)},${Math.floor(b.cz / TILE)}`;
    let t = tiles.get(key);
    if (!t) tiles.set(key, (t = { key, tx: Math.floor(b.cx / TILE), tz: Math.floor(b.cz / TILE), list: [], near: null, isNear: false }));
    t.list.push(b);
  }
  const chunks = new Map();
  for (const t of tiles.values()) {
    const key = `${Math.floor((t.tx * TILE) / CHUNK)},${Math.floor((t.tz * TILE) / CHUNK)}`;
    let c = chunks.get(key);
    if (!c) chunks.set(key, (c = { tiles: [] }));
    c.tiles.push(t);
  }
  // One instanced mesh per chunk & far material; each tile remembers its instance ranges to hide them when near
  for (const c of chunks.values()) {
    const byMat = [[], [], []];
    for (const t of c.tiles) {
      t.ranges = [];
      for (let m = 0; m < 3; m++) {
        const items = t.list.filter((b) => facadeOf(b).glass === m);
        t.ranges.push([m, byMat[m].length, items.length]);
        byMat[m].push(...items);
      }
    }
    c.meshes = byMat.map((items, m) => {
      if (!items.length) return null;
      const mesh = buildFarBoxes(items, farMats[m]);
      mesh.name = 'FarBuildings';
      group.add(mesh);
      return mesh;
    });
    for (const t of c.tiles) t.chunk = c;
  }
  console.info(`[buildings] ${BUILDINGS.length} buildings in ${tiles.size} tiles, ${chunks.size} far chunks`);

  const zero = new THREE.Matrix4().makeScale(0, 0, 0).elements;
  function setFarVisible(t, visible) {
    for (const [m, start, count] of t.ranges) {
      const mesh = t.chunk.meshes[m];
      if (!mesh || !count) continue;
      const arr = mesh.instanceMatrix.array;
      const src = mesh.userData.matrices;
      for (let i = start; i < start + count; i++) {
        if (visible) for (let k = 0; k < 16; k++) arr[i * 16 + k] = src[i * 16 + k];
        else for (let k = 0; k < 16; k++) arr[i * 16 + k] = zero[k];
      }
      mesh.instanceMatrix.needsUpdate = true; // (whole-buffer upload: partial update ranges corrupt it on WebGL)
    }
  }
  function makeNear(t) {
    const geos = buildNearGeometry(t.list);
    t.near = geos.map((g, m) => {
      if (!g) return null;
      const mesh = new THREE.Mesh(g, nearMats[m]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.name = 'NearBuildings';
      group.add(mesh);
      return mesh;
    }).filter(Boolean);
  }
  function dropNear(t) {
    for (const mesh of t.near || []) {
      group.remove(mesh);
      mesh.geometry.dispose();
    }
    t.near = null;
  }

  // Bring tiles near the camera to full detail (nearest first, within a time budget), let far ones go back to boxes
  function update(x, z, force = false) {
    const t0 = performance.now();
    const order = [];
    for (const t of tiles.values()) {
      const cx = (t.tx + 0.5) * TILE, cz = (t.tz + 0.5) * TILE;
      const d = Math.max(0, Math.hypot(cx - x, cz - z) - TILE * 0.7);
      t.dist = d;
      if (!t.isNear && d < NEAR_DIST) order.push(t);
      else if (t.isNear && d > FAR_DIST) {
        dropNear(t);
        setFarVisible(t, true);
        t.isNear = false;
      }
    }
    order.sort((a, b) => a.dist - b.dist);
    for (const t of order) {
      if (!force && performance.now() - t0 > 5) break;
      makeNear(t);
      setFarVisible(t, false);
      t.isNear = true;
    }
  }

  return { group, colliders, buildingAt, update, updateLights: null, tiles };
}

export { buildCityBlocks, buildingAt, minAreaRect };
