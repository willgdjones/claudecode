// js/sf-data.js
// Loads the city built by tools/build-geodata.mjs (data/): the vector layers (sf-geo.json) and the binary grids —
// the 4 m graded heightfield, ground classes, the Bay ring, every building footprint and the street trees.
// A top-level await, so every module can import the data synchronously (like the generated nyc-geodata.js of the
// New York original). World frame: 1 unit = 1 m, x = east, z = south (north = -z), y = height above NAVD88.

const BASE = new URL('../data/', import.meta.url);
const status = typeof document !== 'undefined' ? document.getElementById('loading-status') : null;
const fill = typeof document !== 'undefined' ? document.getElementById('loading-progress') : null;
const track = fill ? fill.closest('.loader-track') : null;

const sizes = new Map();
const loaded = new Map();
function progress() {
  let total = 0;
  let done = 0;
  for (const [k, s] of sizes) {
    total += s;
    done += Math.min(s, loaded.get(k) || 0);
  }
  if (status) status.textContent = `Loading San Francisco... ${(done / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`;
  if (fill && total) {
    if (track) track.classList.remove('is-indeterminate');
    fill.style.transform = `scaleX(${Math.min(1, done / total)})`;
  }
}

async function fetchBytes(name) {
  const res = await fetch(new URL(name, BASE));
  if (!res.ok) throw new Error(`failed to load data/${name}: ${res.status}`);
  const len = +res.headers.get('content-length') || 0;
  sizes.set(name, len);
  if (!res.body || !len) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    loaded.set(name, got);
    progress();
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// The .bin.gz files are plain gzip (servers deliver them as is, without Content-Encoding)
async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const fetchGz = async (name) => gunzip(await fetchBytes(name));

// Rows are delta-coded Uint16 (wrapping differences): undo, then scale to metres
function decodeGrid(bytes, w, h, scale, offset) {
  const q = new Uint16Array(bytes.buffer, bytes.byteOffset, w * h);
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    let v = 0;
    for (let i = 0; i < w; i++) {
      v = (v + q[j * w + i]) & 0xffff;
      out[j * w + i] = v / scale - offset;
    }
  }
  return out;
}

const geoBytes = await fetchBytes('sf-geo.json');
const GEO = JSON.parse(new TextDecoder().decode(geoBytes));
const [terrainBytes, groundBytes, bayBytes, buildingBytes, treeBytes] = await Promise.all([
  fetchGz(GEO.terrain.file),
  fetchGz(GEO.ground.file),
  fetchGz(GEO.bay.file),
  fetchGz(GEO.buildings.file),
  fetchGz(GEO.trees.file)
]);

const T = GEO.terrain;
const TERRAIN = { ...T, hgt: decodeGrid(terrainBytes, T.w, T.h, T.scale, T.offset), ground: groundBytes };
const B = GEO.bay;
const BAY = { ...B, hgt: decodeGrid(bayBytes, B.w, B.h, B.scale, B.offset) };

// Buildings: { cx, cz, base, top, style, seed, ring: Float32Array [x, z, ...] (world, counter-clockwise seen from above
// in x/z, i.e. positive shoelace area) } in 500 m tile order (GEO.buildings.tiles: key -> [byte offset, count])
function decodeBuildings(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  let o = 0;
  while (o + 16 <= bytes.byteLength) {
    const cx = dv.getInt32(o, true) / 10;
    const cz = dv.getInt32(o + 4, true) / 10;
    const base = dv.getUint16(o + 8, true) / 10 - 20;
    const top = dv.getUint16(o + 10, true) / 10 - 20;
    const style = dv.getUint8(o + 12);
    const n = dv.getUint8(o + 13);
    const seed = dv.getUint16(o + 14, true);
    o += 16;
    const ring = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      ring[i * 2] = cx + dv.getInt16(o, true) / 10;
      ring[i * 2 + 1] = cz + dv.getInt16(o + 2, true) / 10;
      o += 4;
    }
    out.push({ cx, cz, base, top, style, seed, ring });
  }
  return out;
}
const BUILDINGS = decodeBuildings(buildingBytes);

// Street trees: { x, z, kind (0 plane, 1 locust, 2 elm), size (trunk diameter class 0..9) }
const TREES = (() => {
  const dv = new DataView(treeBytes.buffer, treeBytes.byteOffset, treeBytes.byteLength);
  const n = Math.floor(treeBytes.byteLength / 6);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = { x: dv.getInt16(i * 6, true) / 2, z: dv.getInt16(i * 6 + 2, true) / 2, kind: dv.getUint8(i * 6 + 4), size: dv.getUint8(i * 6 + 5) };
  }
  return out;
})();

export { GEO, TERRAIN, BAY, BUILDINGS, TREES };
