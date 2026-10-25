import { GEO, TERRAIN, BAY, BUILDINGS } from './sf-data.js';
import { SEA_LEVEL, LAKES, CITY_BOUNDS, GROUND, heightAt } from './terrain.js';
import {
  ROADS,
  NHOODS,
  PARKS,
  SF_LANDMARKS,
  lonLatToWorld,
  getLocationLabel,
  isTypingInField
} from './city-config.js';

// js/sf-map.js
// GTA 6-Style Live Radar Minimap + Full-Screen Interactive San Francisco Cartographic Atlas.
// Synchronized 1:1 with the 3D world (1 unit = 1 m; x = east, z = south, origin at Market & Powell), so both maps are
// drawn true north up. They draw the very geography the city is built from (sf-data.js, from DataSF, USGS &
// OpenStreetMap): the shoreline and the Bay's ring of land from the ground grids, the city's neighbourhoods, every curb
// island (block) with the building footprints standing on it, the parks, beaches & lakes, the freeways, and the real
// street centrelines (chained into whole streets and labelled along their course).

const FONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const MIN_ZOOM = 0.015; // full map, pixels per metre: the whole Bay, Marin to the East Bay
const MAX_ZOOM = 3.0; // single lots
const RADAR_SCALE = 0.32; // radar pixels per metre on the ground (zooms out with altitude)
const FOOTPRINT_ZOOM = 0.25; // building footprints from this zoom up (175k of them: built tile by tile when first seen)

// Map palette, shared by the radar & the atlas (in step with css/style.css): graphite ground with the streets a shade
// lighter than the blocks they run between, muted parks & water; a cable-car-gold GPS route, white landmarks & player,
// cyan search hits and amber freeways
const MAP = {
  water: '#0a1118',
  land: '#151a20', // land beyond the city line (Marin, the East Bay, Daly City) and the piers
  streets: '#363f4b', // the city inside its neighbourhoods: the roadway left between the blocks
  park: '#19301f',
  parkEdge: '#24432f',
  sand: '#2a2a22',
  block: '#1c2128',
  blockEdge: '#272e37',
  pond: '#0f2535',
  buildings: ['#242a32', '#2b323c', '#343c48'],
  buildingEdge: '#171b21',
  mainRoads: '#3a434f',
  highway: '#b27a35',
  route: '#ffc21a',
  search: '#5fd0ff',
  halo: 'rgba(8, 11, 15, 0.9)'
};

// Waterway (1) & beyond-the-city (0) names at their real places; neighbourhood names (2) are added at the centroids of
// their DataSF polygons below
const AREA_LABELS = [
  ['SAN FRANCISCO', -2600, 1600, 0],
  ['MARIN', ...lonLat(-122.505, 37.845), 0], ['OAKLAND', ...lonLat(-122.272, 37.805), 0],
  ['DALY CITY', ...lonLat(-122.462, 37.690), 0], ['ALAMEDA', ...lonLat(-122.255, 37.765), 0],
  ['PACIFIC OCEAN', ...lonLat(-122.545, 37.760), 1], ['SAN FRANCISCO BAY', ...lonLat(-122.385, 37.832), 1],
  ['SAN FRANCISCO BAY', ...lonLat(-122.345, 37.745), 1], ['GOLDEN GATE', ...lonLat(-122.492, 37.813), 1],
  ['RICHARDSON BAY', ...lonLat(-122.490, 37.868), 1]
];
function lonLat(lon, lat) {
  const p = lonLatToWorld(lon, lat);
  return [Math.round(p.x), Math.round(p.z)];
}

// Neighbourhoods (several are split into a few polygons: one label, on the largest)
{
  const best = new Map();
  for (const n of NHOODS) {
    const c = centroid(n.poly);
    const prev = best.get(n.name);
    if (!prev || c.area > prev.area) best.set(n.name, c);
  }
  for (const [name, c] of best) AREA_LABELS.push([name.toUpperCase().replace('/', ' · '), c.x, c.z, 2]);
}

// The city's extent (its neighbourhoods: the city & county line and the shore) for 'view all' and teleports
const CITY_EXTENT = NHOODS.reduce((b, n) => ({
  minX: Math.min(b.minX, n.minX), maxX: Math.max(b.maxX, n.maxX), minZ: Math.min(b.minZ, n.minZ), maxZ: Math.max(b.maxZ, n.maxZ)
}), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

// Shorter map names for the freeways: one name for both carriageways
const freewayLabel = (name) => name.replace(/ (North|South|East|West)bound$/, '');

// ---------------------------------------------------------------------------------------------------------------------
// World-space vector layers: built once into Path2D objects (world metres) and drawn through a canvas transform
// ---------------------------------------------------------------------------------------------------------------------

// Point accessors for rings / polylines given as [{x, z}, ...] or flat [x0, z0, x1, z1, ...] (arrays or Float32Array)
function accessor(pts) {
  const flat = typeof pts[0] === 'number';
  return {
    n: flat ? pts.length >> 1 : pts.length,
    X: flat ? (i) => pts[2 * i] : (i) => pts[i].x,
    Z: flat ? (i) => pts[2 * i + 1] : (i) => pts[i].z
  };
}

function boundsOf(pts) {
  const { n, X, Z } = accessor(pts);
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let i = 0; i < n; i++) {
    const x = X(i);
    const z = Z(i);
    if (x < b.minX) b.minX = x;
    if (x > b.maxX) b.maxX = x;
    if (z < b.minZ) b.minZ = z;
    if (z > b.maxZ) b.maxZ = z;
  }
  return b;
}

// Area-weighted centroid (and area) of a ring
function centroid(pts) {
  const { n, X, Z } = accessor(pts);
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const k = X(j) * Z(i) - X(i) * Z(j);
    a += k;
    cx += (X(j) + X(i)) * k;
    cz += (Z(j) + Z(i)) * k;
  }
  if (Math.abs(a) < 1e-6) return { x: X(0), z: Z(0), area: 0 };
  return { x: cx / (3 * a), z: cz / (3 * a), area: Math.abs(a) / 2 };
}

// Decimetre flat arrays (GEO) -> metres
function dmToM(flat) {
  const out = new Float32Array(flat.length);
  for (let i = 0; i < flat.length; i++) out[i] = flat[i] / 10;
  return out;
}

// Appends a closed ring, always wound the same way as Path2D.rect (so overlapping rings of one path union under the
// nonzero fill rule instead of cancelling out)
function addRing(path, pts) {
  if (!pts || pts.length < 3) return;
  const { n, X, Z } = accessor(pts);
  if (n < 3) return;
  let a = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) a += X(j) * Z(i) - X(i) * Z(j);
  if (a >= 0) {
    path.moveTo(X(0), Z(0));
    for (let i = 1; i < n; i++) path.lineTo(X(i), Z(i));
  } else {
    path.moveTo(X(n - 1), Z(n - 1));
    for (let i = n - 2; i >= 0; i--) path.lineTo(X(i), Z(i));
  }
  path.closePath();
}

function addLine(path, pts) {
  if (!pts || pts.length < 2) return;
  const { n, X, Z } = accessor(pts);
  path.moveTo(X(0), Z(0));
  for (let i = 1; i < n; i++) path.lineTo(X(i), Z(i));
}

/**
 * Cells of a raster as horizontal runs of rects: every maximal run of cells on a row passing `test(k)` (k = cell index)
 * over columns i0..i1-1 and rows j0..j1-1. grid: { res, x0, z0, w }
 */
function addRuns(path, grid, test, i0, i1, j0, j1) {
  const { res, x0, z0, w } = grid;
  for (let j = j0; j < j1; j++) {
    let start = -1;
    const row = j * w;
    for (let i = i0; i <= i1; i++) {
      const on = i < i1 && test(row + i, i, j);
      if (on && start < 0) start = i;
      else if (!on && start >= 0) {
        path.rect(x0 + start * res, z0 + j * res, (i - start) * res, res);
        start = -1;
      }
    }
  }
}

/**
 * A vector layer split into square tiles of Path2D, so a view only rasterizes the tiles it overlaps. Every item goes
 * to the tile holding its centre; a tile's bounds grow to cover its items.
 */
class TiledLayer {
  constructor(size = 500) {
    this.size = size;
    this.tiles = new Map();
  }

  pathFor(b) {
    const ix = Math.floor((b.minX + b.maxX) * 0.5 / this.size);
    const iz = Math.floor((b.minZ + b.maxZ) * 0.5 / this.size);
    const key = `${ix},${iz}`;
    let t = this.tiles.get(key);
    if (!t) {
      t = { path: new Path2D(), minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
      this.tiles.set(key, t);
    } else {
      t.minX = Math.min(t.minX, b.minX);
      t.maxX = Math.max(t.maxX, b.maxX);
      t.minZ = Math.min(t.minZ, b.minZ);
      t.maxZ = Math.max(t.maxZ, b.maxZ);
    }
    return t.path;
  }

  ring(pts) {
    if (pts && pts.length > 2) addRing(this.pathFor(boundsOf(pts)), pts);
  }

  line(pts) {
    if (pts && pts.length > 1) addLine(this.pathFor(boundsOf(pts)), pts);
  }

  /** Calls fn(path) for every tile overlapping the view */
  each(v, fn) {
    for (const t of this.tiles.values()) {
      if (t.maxX < v.minX || t.minX > v.maxX || t.maxZ < v.minZ || t.minZ > v.maxZ) continue;
      fn(t.path);
    }
  }
}

let LAYERS = null;
function mapLayers() {
  if (LAYERS) return LAYERS;
  const L = {};

  // The Bay's ring of land beyond the city grid (32 m cells): Marin, the East Bay, the Peninsula. The ring stores open
  // water as exactly 0 m (heights in 0.5 m steps), so land is anything from 0.5 m up
  L.ring = new Path2D();
  const ringLand = 0.25;
  const cb = CITY_BOUNDS;
  addRuns(L.ring, BAY, (k, i, j) => {
    if (!(BAY.hgt[k] > ringLand)) return false;
    const x = BAY.x0 + (i + 0.5) * BAY.res;
    const z = BAY.z0 + (j + 0.5) * BAY.res;
    return x < cb.minX || x > cb.maxX || z < cb.minZ || z > cb.maxZ;
  }, 0, BAY.w, 0, BAY.h);

  // Land on the city grid (4 m ground classes: everything but water, piers & Treasure Island included) and the beaches;
  // the land path also clips the city's layers to the shore
  const G = TERRAIN.ground;
  L.land = new Path2D();
  addRuns(L.land, TERRAIN, (k) => G[k] !== GROUND.WATER, 0, TERRAIN.w, 0, TERRAIN.h);
  L.sand = new TiledLayer(1000);
  {
    // runs of sand, each into the tile of its row's start (rect runs, so drawn straight into the tile paths)
    const { res, x0, z0, w, h } = TERRAIN;
    for (let j = 0; j < h; j++) {
      let start = -1;
      for (let i = 0; i <= w; i++) {
        const on = i < w && G[j * w + i] === GROUND.SAND;
        if (on && start < 0) start = i;
        else if (!on && start >= 0) {
          const ax = x0 + start * res;
          const az = z0 + j * res;
          const bx = x0 + i * res;
          L.sand.pathFor({ minX: ax, maxX: bx, minZ: az, maxZ: az + res }).rect(ax, az, bx - ax, res);
          start = -1;
        }
      }
    }
  }

  // Lakes & ponds above the Bay's level (Lake Merced, Stow Lake, Mountain Lake...): their water cells
  L.lakes = new Path2D();
  const { res, x0, z0, w, h } = TERRAIN;
  for (const [level, lx0, lz0, lx1, lz1] of LAKES) {
    if (!(level > SEA_LEVEL + 0.5)) continue;
    const i0 = Math.max(0, Math.floor((lx0 - x0) / res));
    const i1 = Math.min(w, Math.ceil((lx1 - x0) / res));
    const j0 = Math.max(0, Math.floor((lz0 - z0) / res));
    const j1 = Math.min(h, Math.ceil((lz1 - z0) / res));
    addRuns(L.lakes, TERRAIN, (k) => G[k] === GROUND.WATER, i0, i1, j0, j1);
  }

  // The city itself: its neighbourhoods (the county line and the shore) in roadway colour, the curb islands (blocks:
  // raised sidewalks & lots) and the parks
  L.city = new Path2D();
  for (const n of NHOODS) addRing(L.city, n.poly);
  L.blocks = new TiledLayer();
  for (const [closed, flat] of GEO.curbs) if (closed) L.blocks.ring(dmToM(flat));
  L.parks = new TiledLayer();
  for (const p of PARKS) L.parks.ring(p.poly);

  // Street network at low zoom (highways & arterials, once the gaps between blocks are under a pixel) and the freeways
  // with their ramps
  L.mainRoads = new TiledLayer(1000);
  for (const r of ROADS) if (r.cls === 2 || r.cls === 3) L.mainRoads.line(r.pts);
  L.highways = new Path2D();
  for (const [, , flat] of GEO.freeways) addLine(L.highways, dmToM(flat));

  LAYERS = L;
  return L;
}

/**
 * Building footprints (sf-data.js BUILDINGS), by height above their base: up to 18 m, 60 m, taller. 175k rings, so they
 * are indexed into 500 m tiles up front and each tile's Path2D is built the first time a view overlaps it.
 */
let FOOTPRINTS = null;
function footprintTiles() {
  if (FOOTPRINTS) return FOOTPRINTS;
  const size = 500;
  const pad = 120; // a footprint may reach past its tile (its centre's): grow the tile's bounds for the view test
  const tiles = new Map();
  for (let k = 0; k < BUILDINGS.length; k++) {
    const b = BUILDINGS[k];
    const ix = Math.floor(b.cx / size);
    const iz = Math.floor(b.cz / size);
    const key = `${ix},${iz}`;
    let t = tiles.get(key);
    if (!t) {
      t = { idx: [], tones: null, minX: ix * size - pad, maxX: (ix + 1) * size + pad, minZ: iz * size - pad, maxZ: (iz + 1) * size + pad };
      tiles.set(key, t);
    }
    t.idx.push(k);
  }
  FOOTPRINTS = { tiles, version: 1 };
  return FOOTPRINTS;
}

/** Calls fn(tones) ([Path2D x3], lowest first) for every footprint tile overlapping the view, building it if needed */
function eachFootprintTile(v, fn) {
  for (const t of footprintTiles().tiles.values()) {
    if (t.maxX < v.minX || t.minX > v.maxX || t.maxZ < v.minZ || t.minZ > v.maxZ) continue;
    if (!t.tones) {
      t.tones = [new Path2D(), new Path2D(), new Path2D()];
      for (const k of t.idx) {
        const b = BUILDINGS[k];
        const hgt = b.top - b.base;
        addRing(t.tones[hgt > 60 ? 2 : hgt > 18 ? 1 : 0], b.ring);
      }
    }
    fn(t.tones);
  }
}

// Street name labels. DataSF's centrelines are one segment per block, so the segments of each name are first chained
// end to end through their shared intersections into whole streets (straightest continuation first); then anchors go
// every ~260 m along each straight run of a street (fixed in the world, so labels never slide while the map pans), with
// the direction of the street there (never upside down: vertical names read upwards)
function chainStreets(segs) {
  const byNode = new Map();
  for (const r of segs) {
    for (const n of [r.a, r.b]) {
      let list = byNode.get(n);
      if (!list) byNode.set(n, (list = []));
      list.push(r);
    }
  }
  const used = new Set();
  const chains = [];
  // from `end` (node id) whose last two points are p -> q, the unused segment meeting there that turns least
  const next = (end, p, q) => {
    let best = null;
    let bestTurn = Infinity;
    const dir = Math.atan2(q.z - p.z, q.x - p.x);
    for (const r of byNode.get(end) || []) {
      if (used.has(r)) continue;
      const fwd = r.a === end;
      const pts = r.pts;
      const s0 = fwd ? pts[0] : pts[pts.length - 1];
      const s1 = fwd ? pts[1] : pts[pts.length - 2];
      let turn = Math.abs(Math.atan2(s1.z - s0.z, s1.x - s0.x) - dir);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      if (turn < bestTurn) {
        bestTurn = turn;
        best = { r, fwd };
      }
    }
    return bestTurn < Math.PI * 0.6 ? best : null;
  };
  for (const seed of segs) {
    if (used.has(seed)) continue;
    used.add(seed);
    const pts = seed.pts.slice();
    // forwards from the seed's b end
    for (let end = seed.b, step; (step = next(end, pts[pts.length - 2], pts[pts.length - 1]));) {
      used.add(step.r);
      const add = step.fwd ? step.r.pts : step.r.pts.slice().reverse();
      for (let i = 1; i < add.length; i++) pts.push(add[i]);
      end = step.fwd ? step.r.b : step.r.a;
    }
    // backwards from its a end
    const back = [];
    for (let end = seed.a, p = pts[1], q = pts[0], step; (step = next(end, p, q));) {
      used.add(step.r);
      const add = step.fwd ? step.r.pts : step.r.pts.slice().reverse();
      for (let i = 1; i < add.length; i++) back.push(add[i]);
      p = add[add.length - 2];
      q = add[add.length - 1];
      end = step.fwd ? step.r.b : step.r.a;
    }
    chains.push(back.reverse().concat(pts));
  }
  return chains;
}

function labelAnchors(pts) {
  const anchors = [];
  for (let i = 0; i + 1 < pts.length;) {
    // the straight run from pts[i]: consecutive segments within ~5° of its first one
    const a = pts[i];
    const dir = Math.atan2(pts[i + 1].z - a.z, pts[i + 1].x - a.x);
    let j = i + 1;
    while (j + 1 < pts.length) {
      const d = Math.atan2(pts[j + 1].z - pts[j].z, pts[j + 1].x - pts[j].x);
      let turn = Math.abs(d - dir);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      if (turn > 0.09) break;
      j++;
    }
    const c = pts[j];
    i = j;
    const len = Math.hypot(c.x - a.x, c.z - a.z);
    if (len < 20) continue;
    let ang = Math.atan2(c.z - a.z, c.x - a.x);
    if (ang >= Math.PI * 0.5 - 0.01) ang -= Math.PI;
    else if (ang < -Math.PI * 0.5 - 0.01) ang += Math.PI;
    const k = Math.max(1, Math.round(len / 260));
    for (let m = 0; m < k; m++) {
      const t = (m + 0.5) / k;
      anchors.push({ x: a.x + (c.x - a.x) * t, z: a.z + (c.z - a.z) * t, ang, len: len / k });
    }
  }
  return anchors;
}

const ROAD_LABELS = [];
{
  const byName = new Map();
  for (const r of ROADS) {
    if (!r.name || /^Unnamed/.test(r.name)) continue;
    let list = byName.get(r.name);
    if (!list) byName.set(r.name, (list = []));
    list.push(r);
  }
  for (const [name, segs] of byName) {
    const major = segs.some((r) => r.cls === 2 || r.cls === 3);
    for (const pts of chainStreets(segs)) {
      const anchors = labelAnchors(pts);
      if (!anchors.length) continue;
      ROAD_LABELS.push({ text: name, lower: name.toLowerCase(), raw: name.toLowerCase(), pts, major, highway: false, anchors, ...boundsOf(pts) });
    }
  }
  // Freeways (no ramps): 'I-280', 'Hwy 101', one label name for both carriageways
  for (const [name, , flat] of GEO.freeways) {
    if (/Ramp/.test(name)) continue;
    const m = dmToM(flat);
    const pts = [];
    for (let i = 0; i < m.length; i += 2) pts.push({ x: m[i], z: m[i + 1] });
    const anchors = labelAnchors(pts);
    if (!anchors.length) continue;
    const text = freewayLabel(name);
    ROAD_LABELS.push({ text, lower: text.toLowerCase(), raw: name.toLowerCase(), pts, major: true, highway: true, anchors, ...boundsOf(pts) });
  }
}
const ROAD_NAME_COUNT = new Set(ROAD_LABELS.filter((l) => !l.highway).map((l) => l.text)).size;

/** A map viewport: centre (cx, cz) in world metres, s pixels per metre, w x h CSS pixels on a canvas of pixel ratio dpr */
class MapView {
  constructor(cx, cz, s, w, h, dpr = 1) {
    this.cx = cx;
    this.cz = cz;
    this.s = s;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.minX = cx - w / (2 * s);
    this.maxX = cx + w / (2 * s);
    this.minZ = cz - h / (2 * s);
    this.maxZ = cz + h / (2 * s);
  }

  /** Canvas transform for world metres */
  world(ctx) {
    const { s, dpr } = this;
    ctx.setTransform(s * dpr, 0, 0, s * dpr, dpr * (this.w * 0.5 - this.cx * s), dpr * (this.h * 0.5 - this.cz * s));
  }

  /** Canvas transform for CSS pixels from the canvas centre (what toX / toY return) */
  screen(ctx) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, this.dpr * this.w * 0.5, this.dpr * this.h * 0.5);
  }

  toX(x) {
    return (x - this.cx) * this.s;
  }

  toY(z) {
    return (z - this.cz) * this.s;
  }

  sees(b) {
    return b && b.maxX >= this.minX && b.minX <= this.maxX && b.maxZ >= this.minZ && b.minZ <= this.maxZ;
  }
}

// Player heading arrow at the (already rotated) origin: white, on a dark halo
function drawPlayerArrow(ctx, tipY, halfWidth, tailY) {
  ctx.beginPath();
  ctx.moveTo(0, tipY);
  ctx.lineTo(halfWidth, tailY);
  ctx.lineTo(0, tailY * 0.45);
  ctx.lineTo(-halfWidth, tailY);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = MAP.halo;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

// GPS route from the player to the waypoint, east-west first, then north-south: gold on a dark casing
function drawRoute(ctx, x0, y0, x1, y1, width) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = MAP.halo;
  ctx.lineWidth = width + 3;
  ctx.stroke();
  ctx.strokeStyle = MAP.route;
  ctx.lineWidth = width;
  ctx.stroke();
}

// Waypoint: a gold target
function drawWaypoint(ctx, x, y, r) {
  ctx.fillStyle = MAP.halo;
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = MAP.route;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = MAP.halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
}

const overlaps = (boxes, b) => boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);

class SFMapSystem {
  constructor({ controllerManager, cameraSystem, trafficSystem, cityBlocks = null, onTeleport, onToggle }) {
    this.controllerManager = controllerManager;
    this.cameraSystem = cameraSystem;
    this.trafficSystem = trafficSystem;
    this.cityBlocks = cityBlocks; // the footprints come straight from sf-data.js; kept for the interface
    this.onTeleport = onTeleport;
    this.onToggle = onToggle;

    this.miniCanvas = document.getElementById('minimap-canvas');
    this.miniCtx = this.miniCanvas ? this.miniCanvas.getContext('2d') : null;
    this.elMiniStreet = document.getElementById('minimap-street-label');
    this.miniStreetText = '';
    this.miniScale = RADAR_SCALE;
    this.miniCache = null; // { canvas, cx, cz, s, version }: the radar's ground layers, twice the radar's size
    const elCounts = document.getElementById('fullmap-counts');
    if (elCounts) elCounts.textContent = `${ROAD_NAME_COUNT.toLocaleString('en-US')} streets · ${BUILDINGS.length.toLocaleString('en-US')} buildings`;

    // The map is drawn true north up: the compass needle points straight up
    const needle = document.getElementById('map-compass-needle');
    if (needle) needle.setAttribute('transform', 'rotate(0 22 22)');

    this.modal = document.getElementById('fullmap-modal');
    this.fullCanvas = document.getElementById('fullmap-canvas');
    this.fullCanvasWrap = document.getElementById('fullmap-canvas-wrap');
    this.fullCtx = this.fullCanvas ? this.fullCanvas.getContext('2d') : null;
    this.fullDpr = 1;
    this.fullStatic = null; // the full map's ground layers & labels for the current view
    this.fullStaticKey = '';
    this.elHoverInfo = document.getElementById('fullmap-hover-info');
    this.elPlayerInfo = document.getElementById('fullmap-player-info');
    this.elSearchInput = document.getElementById('fullmap-search');
    if (this.elSearchInput) this.elSearchInput.placeholder = `Search ${ROAD_NAME_COUNT.toLocaleString('en-US')} streets & landmarks…`;

    this.isFullMapOpen = false;
    // Full map viewport state (world metres; zoom in CSS pixels per metre)
    this.viewCenterX = 0;
    this.viewCenterZ = 0;
    this.viewZoom = 0.22;
    this.isPanning = false;
    this.panPointerId = null;
    this.panStart = { x: 0, y: 0, cx: 0, cz: 0 };
    this.dragMoved = false;

    this.hoverWorld = null;
    this.searchHighlight = '';
    this.searchPath = null;
    this.textWidths = new Map();
    // Default GTA 6-style active GPS waypoint (Union Square)
    const us = SF_LANDMARKS.find((l) => l.id === 'unionsq') || { x: 0, z: 0 };
    this.waypoint = { x: us.x, z: us.z, name: 'Union Square' };

    // Street names measured before the web font arrived would be spaced for the fallback font: measure & draw again
    if (document.fonts) {
      document.fonts.ready.then(() => {
        this.textWidths.clear();
        this.miniCache = null;
        this.fullStaticKey = '';
      });
    }

    this.initEvents();
  }

  initEvents() {
    const closeBtn = document.getElementById('close-fullmap-btn');
    const miniCard = document.getElementById('minimap-card');
    const zoomInBtn = document.getElementById('map-zoom-in');
    const zoomOutBtn = document.getElementById('map-zoom-out');
    const centerPlayerBtn = document.getElementById('map-center-player');
    const viewAllBtn = document.getElementById('map-view-all');

    if (miniCard) {
      miniCard.addEventListener('click', () => this.toggleFullMap(true));
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.toggleFullMap(false));
    }

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        this.viewZoom = Math.min(MAX_ZOOM, this.viewZoom * 1.45);
        this.renderFullMap();
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        this.viewZoom = Math.max(MIN_ZOOM, this.viewZoom / 1.45);
        this.renderFullMap();
      });
    }
    if (centerPlayerBtn) {
      centerPlayerBtn.addEventListener('click', () => {
        const ent = this.controllerManager.getActiveEntity();
        this.viewCenterX = ent.position.x;
        this.viewCenterZ = ent.position.z;
        this.viewZoom = 0.9; // Street-by-street detail zoom
        this.renderFullMap();
      });
    }
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => {
        // Fits the whole city, Ocean Beach to Hunters Point, the Golden Gate to the county line
        const b = CITY_EXTENT;
        const { w, h } = this.fullSize();
        this.viewCenterX = (b.minX + b.maxX) * 0.5;
        this.viewCenterZ = (b.minZ + b.maxZ) * 0.5;
        this.viewZoom = Math.max(MIN_ZOOM, Math.min(w / ((b.maxX - b.minX) * 1.1), h / ((b.maxZ - b.minZ) * 1.08)));
        this.renderFullMap();
      });
    }

    if (this.elSearchInput) {
      this.elSearchInput.addEventListener('input', () => this.search(this.elSearchInput.value));
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isFullMapOpen) {
        this.toggleFullMap(false);
      } else if (e.code === 'KeyM' && !isTypingInField(e)) {
        this.toggleFullMap(!this.isFullMapOpen);
      }
    });

    if (this.fullCanvas) {
      this.fullCanvas.style.touchAction = 'none';
      this.fullCanvas.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || !this.isFullMapOpen || this.panPointerId !== null) return;
        e.preventDefault();
        this.panPointerId = e.pointerId;
        this.fullCanvas.setPointerCapture(e.pointerId);
        this.isPanning = true;
        this.dragMoved = false;
        this.panStart.x = e.clientX;
        this.panStart.y = e.clientY;
        this.panStart.cx = this.viewCenterX;
        this.panStart.cz = this.viewCenterZ;
        if (this.fullCanvasWrap) this.fullCanvasWrap.classList.add('is-panning');
      });

      this.fullCanvas.addEventListener('pointermove', (e) => {
        if (!this.isFullMapOpen || !this.fullCanvas) return;
        if (this.isPanning ? e.pointerId !== this.panPointerId : e.pointerType !== 'mouse') return;
        const rect = this.fullCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (this.isPanning) {
          e.preventDefault();
          const dx = e.clientX - this.panStart.x;
          const dy = e.clientY - this.panStart.y;
          if (Math.hypot(dx, dy) > 5) this.dragMoved = true;
          this.viewCenterX = this.panStart.cx - dx / this.viewZoom;
          this.viewCenterZ = this.panStart.cz - dy / this.viewZoom;
          this.renderFullMap();
          return;
        }

        if (mx >= 0 && mx <= rect.width && my >= 0 && my <= rect.height) {
          const wPos = this.screenToWorld(mx, my, rect.width, rect.height);
          this.hoverWorld = wPos;
          if (this.elHoverInfo) {
            this.elHoverInfo.textContent = `${getLocationLabel(wPos.x, wPos.z)} · Click to teleport here`;
          }
        }
      });

      this.fullCanvas.addEventListener('pointerup', (e) => {
        if (e.pointerId !== this.panPointerId) return;
        const clicked = !this.dragMoved && Math.hypot(e.clientX - this.panStart.x, e.clientY - this.panStart.y) <= 5;
        this.cancelPan();
        if (clicked && this.isFullMapOpen && this.fullCanvas) {
          const rect = this.fullCanvas.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          if (mx >= 0 && mx <= rect.width && my >= 0 && my <= rect.height) {
            const wPos = this.clampToCity(this.screenToWorld(mx, my, rect.width, rect.height));
            this.waypoint = {
              x: wPos.x,
              z: wPos.z,
              name: getLocationLabel(wPos.x, wPos.z)
            };
            if (this.onTeleport) {
              this.onTeleport(wPos.x, wPos.z);
            }
            this.renderFullMap();
          }
        }
      });
      for (const type of ['pointercancel', 'lostpointercapture']) {
        this.fullCanvas.addEventListener(type, (e) => {
          if (e.pointerId === this.panPointerId) this.cancelPan();
        });
      }
      window.addEventListener('blur', () => this.cancelPan());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.cancelPan();
      });

      // Wheel zoom about the cursor (the place under it stays put)
      this.fullCanvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = this.fullCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const before = this.screenToWorld(mx, my, rect.width, rect.height);
        const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
        this.viewZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.viewZoom * factor));
        this.viewCenterX = before.x - (mx - rect.width * 0.5) / this.viewZoom;
        this.viewCenterZ = before.z - (my - rect.height * 0.5) / this.viewZoom;
        this.renderFullMap();
      }, { passive: false });
    }
  }

  /**
   * Street / landmark search: highlights every stretch of the matching streets and frames them (or flies to the
   * matching landmark)
   */
  search(text) {
    const q = String(text || '').trim().toLowerCase();
    this.searchHighlight = q;
    this.searchPath = null;
    if (q.length > 0) {
      const lmMatch = SF_LANDMARKS.find((l) => l.name.toLowerCase().includes(q) || l.short.toLowerCase().includes(q));
      const roads = ROAD_LABELS.filter((l) => l.lower.includes(q) || l.raw.includes(q));
      if (roads.length) {
        this.searchPath = new Path2D();
        const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
        for (const l of roads) {
          addLine(this.searchPath, l.pts);
          b.minX = Math.min(b.minX, l.minX);
          b.maxX = Math.max(b.maxX, l.maxX);
          b.minZ = Math.min(b.minZ, l.minZ);
          b.maxZ = Math.max(b.maxZ, l.maxZ);
        }
        this.searchBounds = b;
      }
      if (lmMatch) {
        this.viewCenterX = lmMatch.x;
        this.viewCenterZ = lmMatch.z;
        this.viewZoom = Math.max(this.viewZoom, 0.9);
      } else if (roads.length) {
        const b = this.searchBounds;
        const { w, h } = this.fullSize();
        this.viewCenterX = (b.minX + b.maxX) * 0.5;
        this.viewCenterZ = (b.minZ + b.maxZ) * 0.5;
        const fit = Math.min(w / ((b.maxX - b.minX) * 1.3 + 1), h / ((b.maxZ - b.minZ) * 1.3 + 1));
        this.viewZoom = Math.max(0.05, Math.min(1.2, fit));
      }
    }
    this.renderFullMap();
  }

  cancelPan() {
    const id = this.panPointerId;
    this.panPointerId = null;
    this.isPanning = false;
    if (this.fullCanvasWrap) this.fullCanvasWrap.classList.remove('is-panning');
    if (id !== null && this.fullCanvas && this.fullCanvas.hasPointerCapture(id)) this.fullCanvas.releasePointerCapture(id);
  }

  toggleFullMap(open) {
    this.isFullMapOpen = Boolean(open);
    if (!this.isFullMapOpen) this.cancelPan();
    if (this.onToggle) this.onToggle(this.isFullMapOpen);
    if (!this.modal) return;
    this.modal.classList.toggle('hidden', !this.isFullMapOpen);
    if (this.isFullMapOpen) {
      // the HUD's popovers live in the top layer, above the map
      for (const pop of document.querySelectorAll('.popover[popover]')) {
        if (typeof pop.hidePopover === 'function' && pop.matches(':popover-open')) pop.hidePopover();
      }
      const ent = this.controllerManager.getActiveEntity();
      this.viewCenterX = ent.position.x;
      this.viewCenterZ = ent.position.z;
      this.resizeFullCanvas();
      this.renderFullMap();
    }
  }

  resizeFullCanvas() {
    if (!this.fullCanvas) return;
    // Layout size (the opening animation's transforms don't change it), at most ~6 megapixels however large the screen
    const w = this.fullCanvas.clientWidth || window.innerWidth;
    const h = this.fullCanvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(6e6 / Math.max(1, w * h)));
    this.fullDpr = dpr;
    this.fullCanvas.width = Math.max(1, Math.floor(w * dpr));
    this.fullCanvas.height = Math.max(1, Math.floor(h * dpr));
  }

  // Full map size in CSS pixels
  fullSize() {
    const dpr = this.fullDpr || 1;
    if (!this.fullCanvas) return { w: 1200, h: 800 };
    return { w: this.fullCanvas.width / dpr, h: this.fullCanvas.height / dpr };
  }

  screenToWorld(sx, sy, width, height) {
    return {
      x: this.viewCenterX + (sx - width * 0.5) / this.viewZoom,
      z: this.viewCenterZ + (sy - height * 0.5) / this.viewZoom
    };
  }

  // Teleports land in the city: inside its extent (the teleport itself finds the nearest clear spot, off the water)
  clampToCity(p) {
    const b = CITY_EXTENT;
    return {
      x: Math.max(b.minX + 25, Math.min(b.maxX - 25, p.x)),
      z: Math.max(b.minZ + 25, Math.min(b.maxZ - 25, p.z))
    };
  }

  textWidth(ctx, text) {
    const key = `${ctx.font}|${ctx.letterSpacing || ''}|${text}`;
    let w = this.textWidths.get(key);
    if (w === undefined) {
      w = ctx.measureText(text).width;
      this.textWidths.set(key, w);
    }
    return w;
  }

  /**
   * The ground: the Bay's land & the city's shore, the neighbourhoods, blocks, parks & beaches, building footprints,
   * lakes, the main streets at low zoom, freeways and the search highlight (world transform of view v)
   */
  drawWorld(ctx, v, isMinimap) {
    const L = mapLayers();
    const s = v.s;
    const px = (n) => n / s; // screen pixels -> metres (line widths)
    v.world(ctx);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // 1. Land around the Bay and on the city grid (piers, Treasure Island, Daly City)
    ctx.fillStyle = MAP.land;
    ctx.fill(L.ring);
    ctx.fill(L.land);

    // 2. The city, clipped to the shore: its neighbourhoods (roadway colour: the streets are the gaps between the
    // blocks), blocks (curb islands), parks and beaches
    ctx.save();
    ctx.clip(L.land);
    ctx.fillStyle = MAP.streets;
    ctx.fill(L.city);
    ctx.fillStyle = MAP.block;
    L.blocks.each(v, (p) => ctx.fill(p));
    if (s >= 0.22) {
      ctx.strokeStyle = MAP.blockEdge;
      ctx.lineWidth = px(Math.min(1.2, 0.5 + s));
      L.blocks.each(v, (p) => ctx.stroke(p));
    }
    ctx.fillStyle = MAP.park;
    L.parks.each(v, (p) => ctx.fill(p));
    if (s >= 0.1) {
      ctx.strokeStyle = MAP.parkEdge;
      ctx.lineWidth = px(1);
      L.parks.each(v, (p) => ctx.stroke(p));
    }
    ctx.fillStyle = MAP.sand;
    L.sand.each(v, (p) => ctx.fill(p));

    // 3. Building footprints, lowest first
    if (s >= FOOTPRINT_ZOOM) {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = MAP.buildings[i];
        eachFootprintTile(v, (tones) => ctx.fill(tones[i]));
      }
      if (s >= 0.6) {
        ctx.strokeStyle = MAP.buildingEdge;
        ctx.lineWidth = px(0.8);
        eachFootprintTile(v, (tones) => {
          for (let i = 0; i < 3; i++) ctx.stroke(tones[i]);
        });
      }
    }
    ctx.restore();

    // 4. Lakes & ponds
    ctx.fillStyle = MAP.pond;
    ctx.fill(L.lakes);

    // 5. Main streets as lines at low zoom
    if (s < 0.16) {
      ctx.strokeStyle = MAP.mainRoads;
      ctx.lineWidth = px(s < 0.05 ? 0.7 : 1.1);
      L.mainRoads.each(v, (p) => ctx.stroke(p));
    }

    // 6. Freeways & their ramps
    ctx.strokeStyle = MAP.highway;
    ctx.lineWidth = Math.max(px(isMinimap ? 2.4 : 1.6), 12);
    ctx.stroke(L.highways);

    // 7. Search highlight: every stretch of the matching streets
    if (this.searchPath && !isMinimap) {
      ctx.strokeStyle = MAP.search;
      ctx.lineWidth = Math.max(px(3), 9);
      ctx.stroke(this.searchPath);
    }
  }

  /**
   * Street names along the streets (screen transform of view v): the best anchor of each street that fits its name,
   * one label per street per `sameNameGap` pixels, none overlapping another (or the boxes already in `placed`)
   */
  drawRoadLabels(ctx, v, { fontPx = 10, maxLabels = 400, sameNameGap = 260, placed = [], majorOnly = false } = {}) {
    const s = v.s;
    const q = this.searchHighlight;
    ctx.font = `600 ${fontPx}px ${FONT}`;
    const inset = (fontPx * 2.5) / s;
    const minX = v.minX + inset;
    const maxX = v.maxX - inset;
    const minZ = v.minZ + inset;
    const maxZ = v.maxZ - inset;
    const cands = [];
    for (const l of ROAD_LABELS) {
      if (l.maxX < minX || l.minX > maxX || l.maxZ < minZ || l.minZ > maxZ) continue;
      const hit = q.length > 0 && (l.lower.includes(q) || l.raw.includes(q));
      if (majorOnly && !l.major && !hit) continue;
      const width = this.textWidth(ctx, l.text);
      const need = (width + 14) / s;
      for (const a of l.anchors) {
        if (a.len < need || a.x < minX || a.x > maxX || a.z < minZ || a.z > maxZ) continue;
        const d = Math.hypot(a.x - v.cx, a.z - v.cz) * s;
        cands.push({ l, a, width, hit, score: (hit ? 1e6 : 0) + (l.highway ? 3000 : 0) + (l.major ? 2000 : 0) + Math.min(a.len * s, 400) - d * 0.5 });
      }
    }
    cands.sort((a, b) => b.score - a.score);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = MAP.halo;
    const byName = new Map();
    let n = 0;
    for (const c of cands) {
      if (n >= maxLabels) break;
      const X = v.toX(c.a.x);
      const Y = v.toY(c.a.z);
      const same = byName.get(c.l.text);
      if (same && same.some(([x, y]) => Math.hypot(x - X, y - Y) < sameNameGap)) continue;
      const hw = c.width * 0.5 + 3;
      const hh = fontPx * 0.5 + 2;
      const ca = Math.abs(Math.cos(c.a.ang));
      const sa = Math.abs(Math.sin(c.a.ang));
      const bx = hw * ca + hh * sa;
      const by = hw * sa + hh * ca;
      const box = [X - bx, Y - by, X + bx, Y + by];
      if (overlaps(placed, box)) continue;
      placed.push(box);
      if (same) same.push([X, Y]);
      else byName.set(c.l.text, [[X, Y]]);
      ctx.save();
      ctx.translate(X, Y);
      ctx.rotate(c.a.ang);
      ctx.fillStyle = c.hit ? MAP.search : c.l.highway ? '#e3a857' : c.l.major ? '#e8ebf0' : '#9ba5b3';
      ctx.strokeText(c.l.text, 0, 0);
      ctx.fillText(c.l.text, 0, 0);
      ctx.restore();
      n++;
    }
    ctx.textBaseline = 'alphabetic';
  }

  update() {
    // The full map covers the whole screen, radar included
    if (this.isFullMapOpen) {
      this.renderFullMap();
    } else {
      this.renderMinimap();
    }
  }

  // =========================================================================
  // 1. GTA 6-STYLE LIVE RADAR MINIMAP (BOTTOM-LEFT HUD)
  // =========================================================================
  renderMinimap() {
    if (!this.miniCtx || !this.miniCanvas) return;
    // Nothing to draw while the radar is hidden (narrow screens, clean view)
    if (!this.miniCanvas.offsetParent || document.body.classList.contains('hud-minimized')) return;
    const ctx = this.miniCtx;
    // Radar size in CSS pixels, backed at the device pixel ratio (crisp street names on HiDPI screens)
    const w = this.miniCanvas.clientWidth;
    const h = this.miniCanvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (this.miniCanvas.width !== bw || this.miniCanvas.height !== bh) {
      this.miniCanvas.width = bw;
      this.miniCanvas.height = bh;
      this.miniCache = null;
    }

    const ent = this.controllerManager.getActiveEntity();
    const px = ent.position.x;
    const pz = ent.position.z;
    // Ground-level radar shows ~800 m of the city; it zooms out as the camera climbs (helicopter). Altitude is above
    // the ground here, not sea level: San Francisco's hills are 280 m high
    const agl = ent.position.y - Math.max(heightAt(px, pz), SEA_LEVEL);
    const target = Math.max(0.05, RADAR_SCALE / (1 + Math.max(0, agl - 25) / 180));
    this.miniScale += (target - this.miniScale) * 0.08;
    const scale = this.miniScale;

    if (this.elMiniStreet) {
      const label = getLocationLabel(px, pz);
      if (label !== this.miniStreetText) {
        this.miniStreetText = label;
        this.elMiniStreet.textContent = label;
      }
    }

    // Ground layers & street names come from a cached render twice the radar's size, redrawn when the player nears its
    // edge or the zoom drifts
    const version = footprintTiles().version;
    let c = this.miniCache;
    if (!c || c.version !== version || Math.abs(scale / c.s - 1) > 0.12 ||
      Math.abs(px - c.cx) > w / c.s - w / (2 * scale) - 8 / scale ||
      Math.abs(pz - c.cz) > h / c.s - h / (2 * scale) - 8 / scale) {
      if (!c) {
        c = this.miniCache = { canvas: document.createElement('canvas') };
        c.canvas.width = bw * 2;
        c.canvas.height = bh * 2;
        c.ctx = c.canvas.getContext('2d');
      }
      c.cx = px;
      c.cz = pz;
      c.s = scale;
      c.version = version;
      c.ctx.setTransform(1, 0, 0, 1, 0, 0);
      c.ctx.fillStyle = MAP.water;
      c.ctx.fillRect(0, 0, bw * 2, bh * 2);
      const cv = new MapView(px, pz, scale, w * 2, h * 2, dpr);
      this.drawWorld(c.ctx, cv, true);
      cv.screen(c.ctx);
      this.drawRoadLabels(c.ctx, cv, { fontPx: 9.5, maxLabels: 28, sameNameGap: 180 });
    }

    const v = new MapView(px, pz, scale, w, h, dpr);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = MAP.water;
    ctx.fillRect(0, 0, bw, bh);
    const k = scale / c.s;
    ctx.drawImage(c.canvas, dpr * ((c.cx - w / c.s - px) * scale + w * 0.5), dpr * ((c.cz - h / c.s - pz) * scale + h * 0.5),
      dpr * w * 2 * k, dpr * h * 2 * k);

    v.screen(ctx);
    const toX = (wx) => v.toX(wx);
    const toY = (wz) => v.toY(wz);

    // Live moving traffic blips on radar: every other car, and the Muni buses
    const traffic = this.trafficSystem;
    if (traffic && traffic.cars) {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.34)';
      for (let i = 0; i < traffic.cars.length; i += 2) {
        const car = traffic.cars[i];
        const cx = toX(car.x);
        const cy = toY(car.z);
        if (Math.abs(cx) < w * 0.5 && Math.abs(cy) < h * 0.5) {
          ctx.fillRect(cx - 1, cy - 1, 2, 2);
        }
      }
      ctx.fillStyle = 'rgba(226, 232, 240, 0.5)';
      for (const bus of traffic.buses || []) {
        const cx = toX(bus.x);
        const cy = toY(bus.z);
        if (Math.abs(cx) < w * 0.5 && Math.abs(cy) < h * 0.5) {
          ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
        }
      }
    }

    // GPS route to the active waypoint
    if (this.waypoint) {
      const wx = toX(this.waypoint.x);
      const wy = toY(this.waypoint.z);
      drawRoute(ctx, 0, 0, wx, wy, 3);
      drawWaypoint(ctx, wx, wy, 4.5);
    }

    // Landmark blips
    for (const lm of SF_LANDMARKS) {
      const lx = toX(lm.x);
      const ly = toY(lm.z);
      if (Math.abs(lx) < w * 0.48 && Math.abs(ly) < h * 0.48) {
        ctx.fillStyle = MAP.halo;
        ctx.beginPath();
        ctx.arc(lx, ly, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(lx, ly, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Camera FOV Cone & Player Arrow at center (0, 0)
    const camDir = this.cameraSystem.currentLookAt.clone().sub(this.cameraSystem.currentPos);
    const camAngle = Math.atan2(camDir.x, camDir.z);

    ctx.save();
    ctx.rotate(-camAngle + Math.PI);
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, 58);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 58, -Math.PI * 0.72, -Math.PI * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Player heading arrow
    ctx.save();
    ctx.rotate(-ent.heading + Math.PI);
    drawPlayerArrow(ctx, -9, 6.5, 7);
    ctx.restore();

    ctx.restore();
  }

  // =========================================================================
  // 2. FULL SAN FRANCISCO INTERACTIVE STREET MAP MODAL ([M])
  // =========================================================================
  renderFullMap() {
    if (!this.fullCtx || !this.fullCanvas || !this.isFullMapOpen) return;
    const ctx = this.fullCtx;
    const dpr = this.fullDpr || 1;
    const { w, h } = this.fullSize();
    const v = new MapView(this.viewCenterX, this.viewCenterZ, this.viewZoom, w, h, dpr);

    const ent = this.controllerManager.getActiveEntity();
    if (this.elPlayerInfo) {
      const text = `You are at ${getLocationLabel(ent.position.x, ent.position.z)}`;
      if (text !== this.playerInfoText) {
        this.playerInfoText = text;
        this.elPlayerInfo.textContent = text;
      }
    }

    // Ground layers, names & landmark pins: re-rendered only when the view or the search change
    const key = `${v.cx}|${v.cz}|${v.s}|${this.fullCanvas.width}|${this.fullCanvas.height}|${this.searchHighlight}|${footprintTiles().version}`;
    if (!this.fullStatic) this.fullStatic = document.createElement('canvas');
    if (key !== this.fullStaticKey) {
      this.fullStaticKey = key;
      const sc = this.fullStatic;
      if (sc.width !== this.fullCanvas.width || sc.height !== this.fullCanvas.height) {
        sc.width = this.fullCanvas.width;
        sc.height = this.fullCanvas.height;
      }
      this.renderFullMapStatic(sc.getContext('2d'), v);
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.fullStatic, 0, 0);
    v.screen(ctx);
    const toX = (wx) => v.toX(wx);
    const toY = (wz) => v.toY(wz);

    // GPS route on the full map
    if (this.waypoint) {
      const wx = toX(this.waypoint.x);
      const wy = toY(this.waypoint.z);
      drawRoute(ctx, toX(ent.position.x), toY(ent.position.z), wx, wy, 4);
      drawWaypoint(ctx, wx, wy, 7);
    }

    // Live Player Blip & Heading Arrow, with a slow pulse to find it at a glance
    const px = toX(ent.position.x);
    const py = toY(ent.position.z);

    ctx.save();
    ctx.translate(px, py);
    const pulse = (performance.now() % 1800) / 1800;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.24 * (1 - pulse)})`;
    ctx.beginPath();
    ctx.arc(0, 0, 10 + pulse * 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(-ent.heading + Math.PI);
    drawPlayerArrow(ctx, -11, 7.5, 8);
    ctx.restore();

    ctx.restore();
  }

  renderFullMapStatic(ctx, v) {
    const { w, h, s } = v;
    ctx.save();
    // 1. Bay & Ocean Water Base
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = MAP.water;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // 2. The ground: the Bay's land, the city's blocks, parks, footprints, lakes & freeways
    this.drawWorld(ctx, v, false);

    v.screen(ctx);
    const toX = (wx) => v.toX(wx);
    const toY = (wz) => v.toY(wz);

    // 3. Iconic Landmark Pins & Collision-Free Labels (placed first: their boxes keep the other names clear)
    ctx.font = `700 11px ${FONT}`;
    const placed = [];
    const pins = [];
    for (const lm of SF_LANDMARKS) {
      const lx = toX(lm.x);
      const ly = toY(lm.z);
      if (Math.abs(lx) > w * 0.48 || Math.abs(ly) > h * 0.48) continue;
      const labelW = this.textWidth(ctx, lm.short) + 6;
      const box = [lx + 6, ly - 8, lx + 8 + labelW, ly + 7];
      const showLabel = !overlaps(placed, box);
      placed.push([lx - 6, ly - 6, lx + 6, ly + 6]);
      if (showLabel) placed.push(box);
      pins.push({ lm, lx, ly, showLabel });
    }

    // 4. Region, waterway & neighbourhood watermark titles (wherever they fit), letter-spaced like a printed atlas
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tracking = 'letterSpacing' in ctx;
    for (const [label, x, z, kind] of AREA_LABELS) {
      if (kind === 0 && s > 0.07) continue;
      if (kind === 2 && (s < 0.035 || s > 1.2)) continue;
      const dx = toX(x);
      const dy = toY(z);
      if (Math.abs(dx) > w * 0.47 || Math.abs(dy) > h * 0.47) continue;
      if (kind === 0) {
        ctx.font = `700 15px ${FONT}`;
        ctx.fillStyle = 'rgba(168, 178, 192, 0.5)';
        if (tracking) ctx.letterSpacing = '3px';
      } else if (kind === 1) {
        ctx.font = `italic 500 12px ${FONT}`;
        ctx.fillStyle = 'rgba(112, 168, 214, 0.55)';
        if (tracking) ctx.letterSpacing = '1.5px';
      } else {
        ctx.font = `700 10.5px ${FONT}`;
        ctx.fillStyle = 'rgba(168, 178, 192, 0.46)';
        if (tracking) ctx.letterSpacing = '1.8px';
      }
      const half = this.textWidth(ctx, label) * 0.5 + 4;
      const box = [dx - half, dy - 8, dx + half, dy + 8];
      if (overlaps(placed, box)) continue;
      placed.push(box);
      ctx.fillText(label, dx, dy);
    }
    if (tracking) ctx.letterSpacing = '0px';
    ctx.textBaseline = 'alphabetic';

    // 5. Street & Avenue names along their real course (collision-free at all zoom levels)
    const fontPx = Math.max(9, Math.min(12, Math.round(9.5 * Math.sqrt(Math.max(s, 0.4)))));
    this.drawRoadLabels(ctx, v, { fontPx, maxLabels: 420, sameNameGap: 300, placed, majorOnly: s < 0.3 });

    ctx.font = `700 11px ${FONT}`;
    ctx.textAlign = 'left';
    for (const { lm, lx, ly, showLabel } of pins) {
      ctx.fillStyle = MAP.halo;
      ctx.beginPath();
      ctx.arc(lx, ly, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(lx, ly, 4.2, 0, Math.PI * 2);
      ctx.fill();
      if (showLabel) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = MAP.halo;
        ctx.strokeText(lm.short, lx + 9, ly + 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(lm.short, lx + 9, ly + 4);
      }
    }

    // 6. Scale bar (true metres); the compass sits with the map controls (index.html)
    this.drawScaleBar(ctx, v);
    ctx.restore();
  }

  drawScaleBar(ctx, v) {
    const target = 120 / v.s; // metres in ~120 px
    const pow = Math.pow(10, Math.floor(Math.log10(target)));
    const step = [1, 2, 5, 10].map((m) => m * pow).filter((m) => m <= target).pop() || pow;
    const len = step * v.s;
    const x0 = -v.w * 0.5 + 24;
    const y0 = v.h * 0.5 - 26;
    const label = step >= 1000 ? `${step / 1000} km` : `${step} m`;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0 - 6);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x0 + len, y0);
    ctx.lineTo(x0 + len, y0 - 6);
    ctx.strokeStyle = MAP.halo;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236, 239, 244, 0.92)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = `650 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.lineWidth = 3;
    ctx.strokeStyle = MAP.halo;
    ctx.strokeText(label, x0 + len + 8, y0 + 3);
    ctx.fillStyle = 'rgba(236, 239, 244, 0.95)';
    ctx.fillText(label, x0 + len + 8, y0 + 3);
  }
}

export { SFMapSystem };
