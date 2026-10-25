// tools/build-geodata.mjs — builds data/ (the city the browser loads) from the raw downloads in tools/raw/.
// usage: bash tools/fetch-data.sh && (cd tools && npm install) && node --max-old-space-size=14000 tools/build-geodata.mjs
//
// Outputs (world frame: see geo-frame.mjs; dm = decimetres; every .bin.gz is gzip, decoded with DecompressionStream):
//   data/sf-geo.json      roads (+ intersection nodes), curbs, parks, neighbourhoods, lakes, landmarks, file index
//   data/terrain.bin.gz   4 m heightfield, Uint16 (h + 20) * 25 (4 cm steps), each row delta-coded (wrapping Uint16 differences)
//   data/ground.bin.gz    4 m ground classes, Uint8 (0 water 1 road 2 open 3 lot 4 park 5 sand)
//   data/bay.bin.gz       32 m Bay ring heightfield, Uint16 (h + 20) * 2, rows delta-coded
//   data/buildings.bin.gz buildings sorted by 500 m tile (record layout in writeBuildings)
//   data/trees.bin.gz     street trees: Int16 x*2, Int16 z*2, Uint8 kind, Uint8 trunk size class
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { log, loadFeatures, Raster, rdpRing, ringArea } from './geo-util.mjs';
import { FRAME, toWorld } from './geo-frame.mjs';
import { loadTerrain, loadBay, sampleGrid, SEA_LEVEL, TERRAIN } from './geo-terrain.mjs';
import { segments } from './geo-streets.mjs';
import { buildPlan, classGrid, C_ROAD, C_OPEN, C_PARCEL, C_WATER } from './geo-blocks.mjs';
import { gradeRoads } from './geo-grade.mjs';
import { loadBuildings, classify, STYLE } from './geo-buildings.mjs';

const OUT = process.argv[2] || fileURLToPath(new URL('../data/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const dm = (v) => Math.round(v * 10);
const flatDm = (pts) => pts.flatMap(([x, z]) => [dm(x), dm(z)]);
const t0 = Date.now();
const lap = (what) => log(`${what} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
function writeGz(name, buf) {
  const gz = zlib.gzipSync(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength), { level: 9 });
  fs.writeFileSync(path.join(OUT, name), gz);
  log(`wrote ${name}: ${(buf.byteLength / 1e6).toFixed(2)} MB -> ${(gz.length / 1e6).toFixed(2)} MB`);
}
function deltaRows(vals, w, h) {
  const out = new Uint16Array(w * h);
  for (let j = 0; j < h; j++) {
    let prev = 0;
    for (let i = 0; i < w; i++) {
      const v = vals[j * w + i];
      out[j * w + i] = (v - prev) & 0xffff;
      prev = v;
    }
  }
  return out;
}

// --- 1. Terrain & plan ----------------------------------------------------------------------------------------------
const T = await loadTerrain();
lap('terrain loaded');
const plan = buildPlan(T);
lap('plan built');
const nodeH = gradeRoads(T, segments);
lap('roads graded');

// --- 2. Ground classes: plan majority + parks + beaches ---------------------------------------------------------------
const ground = classGrid(plan);
const C_PARK = 4, C_SAND = 5;
const parks = [];
{
  const R = new Raster(TERRAIN.x0, TERRAIN.z0, TERRAIN.x0 + TERRAIN.w * TERRAIN.res, TERRAIN.z0 + TERRAIN.h * TERRAIN.res, TERRAIN.res);
  const addPark = (name, ring) => {
    R.fillRing(ring, 1);
    const simple = rdpRing(ring, 2);
    if (simple.length >= 3 && Math.abs(ringArea(simple)) > 400) parks.push([name, flatDm(simple)]);
  };
  for (const f of loadFeatures('parks')) {
    const g = f.geometry;
    if (!g) continue;
    for (const poly of g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]) addPark(f.properties.map_park_n || 'Park', poly[0].map(([lon, lat]) => toWorld(lon, lat)));
  }
  // National parkland (Presidio, Lands End, Fort Funston...) is missing from RPD: take those neighbourhoods whole
  for (const f of loadFeatures('neighborhoods')) {
    if (!/^(Presidio|Lincoln Park|Golden Gate Park|McLaren Park)$/.test(f.properties.nhood)) continue;
    const g = f.geometry;
    for (const poly of g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]) R.fillRing(poly[0].map(([lon, lat]) => toWorld(lon, lat)), 1);
  }
  for (let k = 0; k < ground.length; k++) if (R.d[k] && (ground[k] === C_OPEN || ground[k] === C_PARCEL)) ground[k] = C_PARK;
  // Beaches: low open ground near the sea
  const W = TERRAIN.w;
  R.d.fill(0);
  for (let k = 0; k < ground.length; k++) R.d[k] = T.water[k] === 1 ? 1 : 0;
  const toSea = R.edt((v) => v === 1);
  for (let k = 0; k < ground.length; k++) {
    if ((ground[k] === C_OPEN || ground[k] === C_PARK) && T.hgt[k] < 5.5 && toSea[k] * TERRAIN.res * TERRAIN.res < 120 * 120) ground[k] = C_SAND;
  }
  void W;
}
lap(`ground classes (${parks.length} park outlines)`);

// --- 3. Curbs (from the plan) & drop the 1 m rasters ------------------------------------------------------------------
const curbs = plan.curbs.map((c) => [c.closed ? 1 : 0, flatDm(c.pts), c.sw.map((v) => Math.round(v * 10))]);
plan.R.d = null; plan.C = null; plan.P = null; plan.lab = null;

// --- 4. Buildings -------------------------------------------------------------------------------------------------------
const TILE = 500;
const buildings = loadBuildings();
const styleCount = new Array(7).fill(0);
for (const b of buildings) {
  let base = Infinity;
  for (const [x, z] of b.ring) base = Math.min(base, sampleGrid(T, x, z));
  base = Math.min(base, sampleGrid(T, b.cx, b.cz)) - 0.4;
  if (!Number.isFinite(base)) base = b.gnd;
  let top = b.roof;
  if (top - base < 2.8) top = base + 2.8;
  b.base = base;
  b.top = top;
  b.style = classify(b, top - Math.max(base, b.gnd));
  styleCount[b.style]++;
  b.tile = `${Math.floor(b.cx / TILE)},${Math.floor(b.cz / TILE)}`;
}
buildings.sort((p, q) => (p.tile < q.tile ? -1 : p.tile > q.tile ? 1 : 0));
log(`styles: ${Object.keys(STYLE).map((k, i) => `${k} ${styleCount[i]}`).join(', ')}`);
// Record: Int32 cx dm, Int32 cz dm, Uint16 base (h+20)*10, Uint16 top (h+20)*10, Uint8 style, Uint8 n, Uint16 seed,
//         n x (Int16 dx dm, Int16 dz dm) relative to (cx, cz)
const tiles = {};
{
  let size = 0;
  for (const b of buildings) {
    while (b.ring.length > 255) b.ring = b.ring.filter((_, i) => i % 2 === 0);
    size += 16 + b.ring.length * 4;
  }
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  let o = 0;
  for (const b of buildings) {
    if (!tiles[b.tile]) tiles[b.tile] = [o, 0];
    tiles[b.tile][1]++;
    const cx = dm(b.cx), cz = dm(b.cz);
    dv.setInt32(o, cx, true); dv.setInt32(o + 4, cz, true);
    dv.setUint16(o + 8, Math.max(0, Math.min(65535, Math.round((b.base + 20) * 10))), true);
    dv.setUint16(o + 10, Math.max(0, Math.min(65535, Math.round((b.top + 20) * 10))), true);
    dv.setUint8(o + 12, b.style);
    dv.setUint8(o + 13, b.ring.length);
    dv.setUint16(o + 14, b.id & 0xffff, true);
    o += 16;
    for (const [x, z] of b.ring) {
      dv.setInt16(o, Math.max(-32768, Math.min(32767, dm(x) - cx)), true);
      dv.setInt16(o + 2, Math.max(-32768, Math.min(32767, dm(z) - cz)), true);
      o += 4;
    }
  }
  writeGz('buildings.bin.gz', new Uint8Array(buf));
}
lap('buildings');

// --- 5. Street trees ----------------------------------------------------------------------------------------------------
// kinds map onto the tree models in js/trees.js: 0 plane (broad), 1 locust (small, open), 2 elm (vase / tall)
function treeKind(species) {
  const s = species.toLowerCase();
  if (/platanus|ficus|magnolia|quercus|ulmus americana|tilia|liquidambar|acer|lophostemon|eucalyptus/.test(s)) return 0;
  if (/prunus|pyrus|callistemon|arbutus|pittosporum|tristaniopsis|olea|ligustrum|eriobotrya|cordyline|maytenus|ginkgo|corymbia|metrosideros/.test(s)) return 1;
  return 2;
}
let trees;
{
  const list = [];
  for (const f of loadFeatures('trees')) {
    const p = f.properties;
    if (p.planttype && p.planttype !== 'Tree') continue;
    const lon = +p.longitude, lat = +p.latitude;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const [x, z] = toWorld(lon, lat);
    if (x < TERRAIN.x0 || z < TERRAIN.z0 || x > TERRAIN.x0 + TERRAIN.w * TERRAIN.res || z > TERRAIN.z0 + TERRAIN.h * TERRAIN.res) continue;
    list.push([x, z, treeKind(p.species || ''), Math.max(0, Math.min(9, +p.dbhrange || 2))]);
  }
  const buf = new ArrayBuffer(list.length * 6);
  const dv = new DataView(buf);
  list.forEach(([x, z, k, d], i) => {
    dv.setInt16(i * 6, Math.round(x * 2), true);
    dv.setInt16(i * 6 + 2, Math.round(z * 2), true);
    dv.setUint8(i * 6 + 4, k);
    dv.setUint8(i * 6 + 5, d);
  });
  writeGz('trees.bin.gz', new Uint8Array(buf));
  trees = list.length;
}
lap(`${trees} street trees`);

// --- 6. Heightfields ----------------------------------------------------------------------------------------------------
{
  const q = new Uint16Array(T.w * T.h);
  for (let k = 0; k < q.length; k++) q[k] = Math.max(0, Math.min(65535, Math.round((T.hgt[k] + 20) * 25)));
  writeGz('terrain.bin.gz', deltaRows(q, T.w, T.h));
  writeGz('ground.bin.gz', ground);
  const B = await loadBay();
  const qb = new Uint16Array(B.w * B.h);
  for (let k = 0; k < qb.length; k++) qb[k] = Math.max(0, Math.min(65535, Math.round((B.hgt[k] + 20) * 2)));
  writeGz('bay.bin.gz', deltaRows(qb, B.w, B.h));
}
lap('heightfields');

// --- 7. Vector layers -----------------------------------------------------------------------------------------------
const roads = segments.filter((s) => s.kind === 'road').map((s) => [s.name, s.cls, s.oneway, dm(s.rw), dm(s.sw), s.a, s.b, flatDm(s.pts), s.layer.startsWith('PARKS') ? 1 : 0]);
const freeways = segments.filter((s) => s.kind === 'freeway').map((s) => [s.name, s.oneway, flatDm(s.pts)]);
const nodes = {};
for (const s of segments) {
  if (s.kind !== 'road') continue;
  for (const [id, p] of [[s.a, s.pts[0]], [s.b, s.pts[s.pts.length - 1]]]) if (!nodes[id]) nodes[id] = [dm(p[0]), dm(p[1]), dm(nodeH.get(id) ?? sampleGrid(T, p[0], p[1]))];
}
const nhoods = [];
for (const f of loadFeatures('neighborhoods')) {
  const g = f.geometry;
  for (const poly of g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]) {
    const ring = rdpRing(poly[0].map(([lon, lat]) => toWorld(lon, lat)), 4);
    if (ring.length >= 3) nhoods.push([f.properties.nhood, flatDm(ring)]);
  }
}
const geo = {
  version: 1,
  generated: new Date().toISOString().slice(0, 10),
  frame: FRAME,
  seaLevel: SEA_LEVEL,
  terrain: { file: 'terrain.bin.gz', res: TERRAIN.res, x0: TERRAIN.x0, z0: TERRAIN.z0, w: TERRAIN.w, h: TERRAIN.h, scale: 25, offset: 20 },
  ground: { file: 'ground.bin.gz', classes: ['water', 'road', 'open', 'lot', 'park', 'sand'] },
  bay: { file: 'bay.bin.gz', res: 32, x0: -30000, z0: -24000, w: 1876, h: 1563, scale: 2, offset: 20 },
  buildings: { file: 'buildings.bin.gz', count: buildings.length, tile: TILE, tiles, styles: Object.keys(STYLE) },
  trees: { file: 'trees.bin.gz', count: trees, kinds: ['plane', 'locust', 'elm'] },
  lakes: T.lakes.filter((l) => l.n >= 120).map((l) => [l.level, l.x0, l.z0, l.x1, l.z1]),
  roads, // [name, class, oneway (1 with / -1 against digitised direction), roadway dm, sidewalk dm, nodeA, nodeB, [x,z dm...], park drive]
  nodes, // id: [x dm, z dm, graded height dm]
  freeways,
  curbs, // [closed, [x,z dm...], [sidewalk width dm per vertex]] — island on the right of travel
  parks, // [name, ring dm]
  nhoods // [name, ring dm]
};
fs.writeFileSync(path.join(OUT, 'sf-geo.json'), JSON.stringify(geo));
const sz = fs.statSync(path.join(OUT, 'sf-geo.json')).size;
log(`wrote sf-geo.json: ${(sz / 1e6).toFixed(2)} MB (gzip ${(zlib.gzipSync(fs.readFileSync(path.join(OUT, 'sf-geo.json'))).length / 1e6).toFixed(2)} MB)`);
lap('done');
void C_ROAD; void C_WATER;
