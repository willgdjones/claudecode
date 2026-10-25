// tools/geo-terrain.mjs — the city heightfield: USGS 3DEP 1 m bare-earth DEM (CA_SanFrancisco_B23, UTM 10N, NAVD88)
// box-filtered onto a 4 m grid in the world frame, and the Bay ring from the 1/3 arc-second DEM on a 32 m grid.
// Water: the 1 m DEM leaves water NoData. NoData reached from the grid edge is the Bay / the ocean; enclosed NoData
// pockets are lakes (Lake Merced, Stow Lake...) and get their shore's lowest level.
import fs from 'node:fs';
import { fromFile } from 'geotiff';
import { rawPath, log, labelComponents, Raster } from './geo-util.mjs';
import { FRAME, toWorld } from './geo-frame.mjs';

export const SEA_LEVEL = -0.8; // NAVD88 metres: the survey flattened the Bay at -1.07 m; a little above keeps beaches wet
const CACHE = rawPath('cache');
fs.mkdirSync(CACHE, { recursive: true });

// --- City grid ------------------------------------------------------------------------------------------------------
export const TERRAIN = { res: 4, x0: -10000, z0: -6000, w: 3750, h: 3800 }; // x -10..5 km, z -6..9.2 km
const DEM_TILES = ['x54y418', 'x54y419', 'x55y418', 'x55y419'];
const NODATA = -1e4;

async function buildCityGrid() {
  const { res, x0, z0, w, h } = TERRAIN;
  const sum = new Float64Array(w * h);
  const cnt = new Uint16Array(w * h);
  for (const t of DEM_TILES) {
    const img = await (await fromFile(rawPath(`dem1m_${t}.tif`))).getImage();
    const [bx0, , , by1] = img.getBoundingBox();
    const nd = img.getGDALNoData();
    const W = img.getWidth(), H = img.getHeight();
    const [data] = await img.readRasters({ interleave: false });
    // Each 1 m pixel centre -> world -> the 4 m cell holding it (the frame is UTM shifted, so this is a pure offset)
    let used = 0;
    for (let j = 0; j < H; j++) {
      const n = by1 - (j + 0.5);
      const z = FRAME.n0 - n;
      const cj = Math.floor((z - z0) / res);
      if (cj < 0 || cj >= h) continue;
      for (let i = 0; i < W; i++) {
        const v = data[j * W + i];
        if (v === nd || v < -100) continue;
        const x = bx0 + i + 0.5 - FRAME.e0;
        const ci = Math.floor((x - x0) / res);
        if (ci < 0 || ci >= w) continue;
        const k = cj * w + ci;
        sum[k] += v;
        cnt[k]++;
        used++;
      }
    }
    log(`DEM ${t}: ${W}x${H}, ${(used / 1e6).toFixed(1)} M samples in the grid`);
  }
  const hgt = new Float32Array(w * h);
  const full = res * res;
  for (let k = 0; k < w * h; k++) hgt[k] = cnt[k] >= full * 0.5 ? sum[k] / cnt[k] : NODATA;
  return hgt;
}

// Lakes & the sea. The DEM is hydro-flattened: the Bay & the ocean are NoData far out and exactly -1.07 m within the
// survey's buffer, lakes and ponds are exactly flat at their own level (Lake Merced 5.56 m, Stow Lake 87.01 m). Water
// = NoData plus every sizeable component of perfectly flat cells; the sea is what touches the grid edge or NoData.
function classifyWater(hgt) {
  const { w, h } = TERRAIN;
  const R = new Raster(0, 0, w - 1, h - 1, 1);
  const TOL = 0.012;
  for (let j = 1; j < h - 1; j++) {
    for (let i = 1; i < w - 1; i++) {
      const k = j * w + i, v = hgt[k];
      if (v === NODATA) { R.d[k] = 2; continue; }
      let flat = true;
      for (const q of [k - 1, k + 1, k - w, k + w]) if (hgt[q] !== NODATA && Math.abs(hgt[q] - v) > TOL) flat = false;
      R.d[k] = flat ? 1 : 0;
    }
  }
  // the grid's border: NoData (the sea) where the survey has none, land where it does (or the 1/3" DEM filled it)
  for (const k of [...Array(w).keys()].flatMap((i) => [i, (h - 1) * w + i]).concat([...Array(h).keys()].flatMap((j) => [j * w, j * w + w - 1]))) {
    R.d[k] = hgt[k] === NODATA ? 2 : 0;
  }
  const { lab, comps } = labelComponents(R);
  const water = new Uint8Array(w * h); // 0 land, 1 sea, 2 lake
  const lakes = [];
  for (const c of comps) {
    let nodata = 0, sum = 0, n = 0;
    const cells = [];
    for (let j = c.j0; j <= c.j1; j++) {
      for (let i = c.i0; i <= c.i1; i++) {
        const k = j * w + i;
        if (lab[k] !== c.id) continue;
        cells.push(k);
        if (R.d[k] === 2) nodata++;
        else { sum += hgt[k]; n++; }
      }
    }
    if (nodata) {
      for (const k of cells) { water[k] = 1; hgt[k] = -8; }
      continue;
    }
    if (c.n < 120) continue; // flat specks (< 0.2 ha) stay land
    const level = sum / n;
    for (const k of cells) { water[k] = 2; hgt[k] = level - 1.5; }
    lakes.push({ level: Math.round(level * 100) / 100, n: c.n, x0: TERRAIN.x0 + c.i0 * 4, z0: TERRAIN.z0 + c.j0 * 4, x1: TERRAIN.x0 + (c.i1 + 1) * 4, z1: TERRAIN.z0 + (c.j1 + 1) * 4 });
  }
  lakes.sort((a, b) => b.n - a.n);
  log(`water: ${lakes.length} lakes/ponds, largest ${lakes.slice(0, 4).map((l) => `${(l.n * 16 / 1e4).toFixed(1)} ha @ ${l.level} m`).join(', ')}`);
  return { water, lakes };
}

// --- Bay ring (1/3 arc-second, ~10 m, resampled to 32 m) ----------------------------------------------------------
export const BAY = { res: 32, x0: -30000, z0: -24000, w: 1876, h: 1563 }; // x -30..30 km, z -24..26 km (the DEM tile ends at 38°N)

async function buildBayGrid() {
  const { res, x0, z0, w, h } = BAY;
  const img = await (await fromFile(rawPath('dem13_n38w123.tif'))).getImage();
  const [lon0, lat0, lon1, lat1] = img.getBoundingBox();
  const W = img.getWidth(), H = img.getHeight();
  const nd = img.getGDALNoData();
  // window covering the ring in degrees
  const pad = 0.05;
  const a = toLonLat(x0, z0 + h * res), b = toLonLat(x0 + w * res, z0);
  const i0 = Math.max(0, Math.floor(((a[0] - pad) - lon0) / (lon1 - lon0) * W));
  const i1 = Math.min(W, Math.ceil(((b[0] + pad) - lon0) / (lon1 - lon0) * W));
  const j0 = Math.max(0, Math.floor((lat1 - (b[1] + pad)) / (lat1 - lat0) * H));
  const j1 = Math.min(H, Math.ceil((lat1 - (a[1] - pad)) / (lat1 - lat0) * H));
  const [data] = await img.readRasters({ window: [i0, j0, i1, j1], interleave: false });
  const ww = i1 - i0;
  const sum = new Float64Array(w * h), cnt = new Uint16Array(w * h);
  for (let j = j0; j < j1; j++) {
    const lat = lat1 - ((j + 0.5) / H) * (lat1 - lat0);
    for (let i = i0; i < i1; i++) {
      const v = data[(j - j0) * ww + (i - i0)];
      if (v === nd || v < -100) continue;
      const lon = lon0 + ((i + 0.5) / W) * (lon1 - lon0);
      const [x, z] = toWorld(lon, lat);
      const ci = Math.floor((x - x0) / res), cj = Math.floor((z - z0) / res);
      if (ci < 0 || cj < 0 || ci >= w || cj >= h) continue;
      sum[cj * w + ci] += v;
      cnt[cj * w + ci]++;
    }
  }
  const out = new Float32Array(w * h);
  // The 1/3" DEM keeps the Bay as elevations near 0 (not NoData): treat anything under 0.5 m as water
  for (let k = 0; k < w * h; k++) out[k] = cnt[k] ? sum[k] / cnt[k] : -8;
  log(`Bay ring: ${w}x${h} @ ${res} m`);
  return out;
}

// Inverse of the frame (good to a few cm over the ring — fine for 32 m cells): Newton on toWorld
function toLonLat(x, z) {
  let lon = FRAME.lon0, lat = FRAME.lat0;
  for (let it = 0; it < 6; it++) {
    const [x1, z1] = toWorld(lon, lat);
    const [x2] = toWorld(lon + 1e-4, lat);
    const [, z3] = toWorld(lon, lat + 1e-4);
    lon += (x - x1) / ((x2 - x1) / 1e-4);
    lat += (z - z1) / ((z3 - z1) / 1e-4);
  }
  return [lon, lat];
}

// Land beyond the 1 m survey (the Marin Headlands, Daly City & Brisbane past the county line, parts of the islands) is
// NoData in the city grid like the water: take the 1/3" DEM's height there wherever it shows land, so the city grid
// meets the Bay ring without a cliff at its edge
function fillFromBay(hgt, bay) {
  const { res, x0, z0, w, h } = TERRAIN;
  let filled = 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (hgt[k] !== NODATA) continue;
      const v = sampleGrid(bay, x0 + (i + 0.5) * res, z0 + (j + 0.5) * res);
      if (v > 0.5) { hgt[k] = v; filled++; }
    }
  }
  log(`terrain: ${filled} NoData cells (${(filled * res * res / 1e6).toFixed(2)} km²) filled with land from the 1/3" DEM`);
}

// --- Cached entry points --------------------------------------------------------------------------------------------
export async function loadTerrain() {
  const f = `${CACHE}/terrain4.f32`, fw = `${CACHE}/water4.u8`;
  if (fs.existsSync(f) && fs.existsSync(fw)) {
    const hgt = new Float32Array(fs.readFileSync(f).buffer.slice(0));
    const water = new Uint8Array(fs.readFileSync(fw));
    const lakes = JSON.parse(fs.readFileSync(`${CACHE}/lakes.json`, 'utf8'));
    return { hgt, water, lakes, ...TERRAIN };
  }
  const fr = `${CACHE}/dem4.f32`;
  let hgt;
  if (fs.existsSync(fr)) hgt = new Float32Array(fs.readFileSync(fr).buffer.slice(0));
  else {
    hgt = await buildCityGrid();
    fs.writeFileSync(fr, Buffer.from(hgt.buffer));
  }
  fillFromBay(hgt, await loadBay());
  const { water, lakes } = classifyWater(hgt);
  fs.writeFileSync(f, Buffer.from(hgt.buffer));
  fs.writeFileSync(fw, water);
  fs.writeFileSync(`${CACHE}/lakes.json`, JSON.stringify(lakes));
  return { hgt, water, lakes, ...TERRAIN };
}

export async function loadBay() {
  const f = `${CACHE}/bay32.f32`;
  if (fs.existsSync(f)) return { hgt: new Float32Array(fs.readFileSync(f).buffer.slice(0)), ...BAY };
  const hgt = await buildBayGrid();
  fs.writeFileSync(f, Buffer.from(hgt.buffer));
  return { hgt, ...BAY };
}

/** Bilinear height of the city grid at world (x, z) (NaN-free: water cells hold the seabed) */
export function sampleGrid(G, x, z) {
  const fx = (x - G.x0) / G.res - 0.5, fz = (z - G.z0) / G.res - 0.5;
  const i = Math.max(0, Math.min(G.w - 2, Math.floor(fx))), j = Math.max(0, Math.min(G.h - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - i)), tz = Math.max(0, Math.min(1, fz - j));
  const k = j * G.w + i, H = G.hgt;
  return (H[k] * (1 - tx) + H[k + 1] * tx) * (1 - tz) + (H[k + G.w] * (1 - tx) + H[k + G.w + 1] * tx) * tz;
}
