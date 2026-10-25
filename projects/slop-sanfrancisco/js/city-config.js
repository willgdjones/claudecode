import { GEO } from './sf-data.js';
import { CITY_BOUNDS, SEA_LEVEL, isWater } from './terrain.js';

// js/city-config.js
// San Francisco's street database & places at true 1:1 scale, from js/sf-data.js (built by tools/build-geodata.mjs
// from DataSF & USGS data).
//
// World frame: 1 unit = 1 m, x = east, z = south (north = -z), y = height above NAVD88; UTM 10N shifted to an origin
// at Market St & Powell St (the cable car turntable). The city runs from Ocean Beach (x ≈ -9300) to Hunters Point
// (x ≈ 4100) and from Fort Point (z ≈ -4600) to the county line (z ≈ 8600); Treasure Island sits out at x 4000, z -5000.

const toPts = (flat) => {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i] / 10, z: flat[i + 1] / 10 });
  return out;
};

// ---------------------------------------------------------------------------------------------------------------------
// Projection (lon/lat -> world), the same UTM 10N Krüger series as tools/geo-util.mjs
// ---------------------------------------------------------------------------------------------------------------------
const UTM = (() => {
  const A = 6378137, F = 1 / 298.257222101, K0 = 0.9996, LON0 = (-123 * Math.PI) / 180;
  const N = F / (2 - F), AA = (A / (1 + N)) * (1 + (N * N) / 4 + N ** 4 / 64);
  const AL = [N / 2 - (2 / 3) * N ** 2 + (5 / 16) * N ** 3, (13 / 48) * N ** 2 - (3 / 5) * N ** 3, (61 / 240) * N ** 3];
  const E2 = (2 * Math.sqrt(N)) / (1 + N);
  return (lon, lat) => {
    const phi = (lat * Math.PI) / 180, lam = (lon * Math.PI) / 180 - LON0;
    const t = Math.sinh(Math.atanh(Math.sin(phi)) - E2 * Math.atanh(E2 * Math.sin(phi)));
    const xi = Math.atan2(t, Math.cos(lam)), eta = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
    let e = eta, n = xi;
    for (let j = 1; j <= 3; j++) {
      e += AL[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
      n += AL[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    }
    return [500000 + K0 * AA * e, K0 * AA * n];
  };
})();
function lonLatToWorld(lon, lat) {
  const [e, n] = UTM(lon, lat);
  return { x: e - GEO.frame.e0, z: GEO.frame.n0 - n };
}

// ---------------------------------------------------------------------------------------------------------------------
// Roads: every at-grade street segment (DataSF centreline, roadway & sidewalk widths measured from the parcels)
// ---------------------------------------------------------------------------------------------------------------------
// GEO.roads: [name, class, oneway, roadway dm, sidewalk dm, nodeA, nodeB, [x,z dm...], park drive]
const ROADS = GEO.roads.map(([name, cls, oneway, rw, sw, a, b, flat, park], id) => ({
  id, name, cls, oneway, w: rw / 10, sw: sw / 10, a, b, park: !!park, pts: toPts(flat)
}));
const NODES = new Map(Object.entries(GEO.nodes).map(([id, [x, z, h]]) => [+id, { id: +id, x: x / 10, z: z / 10, h: h / 10, roads: [] }]));
for (const r of ROADS) {
  NODES.get(r.a)?.roads.push(r);
  NODES.get(r.b)?.roads.push(r);
}

const ROAD_CELL = 64;
const ROAD_GRID = new Map();
const rkey = (i, j) => (i + 512) * 2048 + (j + 512);
for (const r of ROADS) {
  for (let k = 1; k < r.pts.length; k++) {
    const p = r.pts[k - 1], q = r.pts[k];
    for (let i = Math.floor((Math.min(p.x, q.x) - 2) / ROAD_CELL); i <= Math.floor((Math.max(p.x, q.x) + 2) / ROAD_CELL); i++) {
      for (let j = Math.floor((Math.min(p.z, q.z) - 2) / ROAD_CELL); j <= Math.floor((Math.max(p.z, q.z) + 2) / ROAD_CELL); j++) {
        const kk = rkey(i, j);
        let list = ROAD_GRID.get(kk);
        if (!list) ROAD_GRID.set(kk, (list = []));
        list.push([r, k - 1]);
      }
    }
  }
}
/** Roads within `radius` of (x, z), nearest first: [{ road, d, x, z (closest point), dx, dz (unit direction) }] */
function nearestRoads(x, z, radius = 60) {
  const best = new Map();
  for (let i = Math.floor((x - radius) / ROAD_CELL); i <= Math.floor((x + radius) / ROAD_CELL); i++) {
    for (let j = Math.floor((z - radius) / ROAD_CELL); j <= Math.floor((z + radius) / ROAD_CELL); j++) {
      for (const [r, k] of ROAD_GRID.get(rkey(i, j)) || []) {
        const p = r.pts[k], q = r.pts[k + 1];
        const ex = q.x - p.x, ez = q.z - p.z, L2 = ex * ex + ez * ez || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - p.x) * ex + (z - p.z) * ez) / L2));
        const cx = p.x + ex * t, cz = p.z + ez * t;
        const d = Math.hypot(x - cx, z - cz);
        if (d > radius) continue;
        const prev = best.get(r);
        if (!prev || d < prev.d) {
          const L = Math.sqrt(L2);
          best.set(r, { road: r, d, x: cx, z: cz, dx: ex / L, dz: ez / L });
        }
      }
    }
  }
  return [...best.values()].sort((a, b) => a.d - b.d);
}

/** On a roadway (between the curbs) rather than a sidewalk, plaza, park or lot */
function onRoadway(x, z) {
  for (const n of nearestRoads(x, z, 40)) if (n.d < n.road.w / 2) return true;
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------
// Neighbourhoods & parks (polygons for labels & maps)
// ---------------------------------------------------------------------------------------------------------------------
const NHOODS = GEO.nhoods.map(([name, flat]) => ({ name, poly: toPts(flat) }));
const PARKS = GEO.parks.map(([name, flat]) => ({ name, poly: toPts(flat) }));
for (const a of [...NHOODS, ...PARKS]) {
  a.minX = Math.min(...a.poly.map((p) => p.x)); a.maxX = Math.max(...a.poly.map((p) => p.x));
  a.minZ = Math.min(...a.poly.map((p) => p.z)); a.maxZ = Math.max(...a.poly.map((p) => p.z));
}
function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
const areaAt = (list, x, z) => list.find((a) => x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ && pointInPoly(a.poly, x, z)) || null;
const neighborhoodAt = (x, z) => areaAt(NHOODS, x, z)?.name || null;
const parkAt = (x, z) => areaAt(PARKS, x, z)?.name || null;

// ---------------------------------------------------------------------------------------------------------------------
// Landmarks & teleports (M1: places on the real map; bespoke landmark models come in a later milestone)
// ---------------------------------------------------------------------------------------------------------------------
const SF_LANDMARKS = [
  ['unionsq', 'Union Square', 'Union Square', -122.4075, 37.7880, 'Union Square'],
  ['ferry', 'Ferry Building', 'Ferry Building', -122.3937, 37.7955, 'Embarcadero'],
  ['transamerica', 'Transamerica Pyramid', 'Transamerica', -122.4028, 37.7952, 'Financial District'],
  ['salesforce', 'Salesforce Tower', 'Salesforce Tower', -122.3969, 37.7898, 'SoMa'],
  ['coit', 'Coit Tower & Telegraph Hill', 'Coit Tower', -122.4058, 37.8024, 'Telegraph Hill'],
  ['lombard', 'Lombard Street (Crooked Block)', 'Lombard St', -122.4187, 37.8021, 'Russian Hill'],
  ['wharf', "Fisherman's Wharf", "Fisherman's Wharf", -122.4157, 37.8080, 'North Beach'],
  ['pier39', 'Pier 39', 'Pier 39', -122.4098, 37.8087, 'Embarcadero'],
  ['chinatown', 'Chinatown Dragon Gate', 'Chinatown', -122.4056, 37.7906, 'Chinatown'],
  ['cityhall', 'City Hall', 'City Hall', -122.4193, 37.7793, 'Civic Center'],
  ['paintedladies', 'Painted Ladies & Alamo Square', 'Painted Ladies', -122.4330, 37.7762, 'Alamo Square'],
  ['haight', 'Haight & Ashbury', 'Haight-Ashbury', -122.4469, 37.7699, 'Haight-Ashbury'],
  ['castro', 'The Castro', 'Castro', -122.4350, 37.7626, 'Castro'],
  ['dolores', 'Mission Dolores Park', 'Dolores Park', -122.4269, 37.7596, 'Mission'],
  ['twinpeaks', 'Twin Peaks', 'Twin Peaks', -122.4477, 37.7544, 'Twin Peaks'],
  ['sutro', 'Sutro Tower', 'Sutro Tower', -122.4528, 37.7552, 'Twin Peaks'],
  ['ggpark', 'Golden Gate Park', 'GG Park', -122.4602, 37.7716, 'Golden Gate Park'],
  ['oceanbeach', 'Ocean Beach', 'Ocean Beach', -122.5097, 37.7608, 'Outer Sunset'],
  ['palace', 'Palace of Fine Arts', 'Palace of Fine Arts', -122.4484, 37.8020, 'Marina'],
  ['crissy', 'Crissy Field', 'Crissy Field', -122.4640, 37.8040, 'Presidio'],
  ['ggbridge', 'Golden Gate Bridge', 'Golden Gate Bridge', -122.4783, 37.8199, 'Golden Gate'],
  ['baybridge', 'Bay Bridge', 'Bay Bridge', -122.3800, 37.7980, 'San Francisco Bay'],
  ['filbert', 'Filbert Street (31.5% grade)', 'Filbert St', -122.4180, 37.8005, 'Russian Hill'],
  ['alcatraz', 'Alcatraz Island', 'Alcatraz', -122.4230, 37.8267, 'San Francisco Bay']
].map(([id, name, short, lon, lat, district]) => ({ id, name, short, district, ...lonLatToWorld(lon, lat) }));
const LANDMARK = Object.fromEntries(SF_LANDMARKS.map((l) => [l.id, l]));

// Street-level arrivals shared by every travel mode: [lon, lat] of the spot, facing [lon, lat] (heading 0 faces south,
// +z; PI north). The teleport finds the nearest clear spot around it.
const arrive = (lon, lat, lookLon, lookLat) => {
  const p = lonLatToWorld(lon, lat);
  const q = lonLatToWorld(lookLon, lookLat);
  return { x: p.x, z: p.z, heading: Math.atan2(q.x - p.x, q.z - p.z) };
};
const TELEPORT_LOCATIONS = {
  unionsq: arrive(-122.40755, 37.78575, -122.4075, 37.7880), // Powell St at Market, facing up Powell to Union Square
  ferry: arrive(-122.3955, 37.7942, -122.3937, 37.7955), // Embarcadero plaza, facing the clock tower
  coit: arrive(-122.4072, 37.8016, -122.4058, 37.8024), // Telegraph Hill Blvd, below the tower
  lombard: arrive(-122.4196, 37.8022, -122.4179, 37.8020), // Hyde St at the top of the crooked block
  filbert: arrive(-122.4193, 37.8003, -122.4168, 37.8006), // Filbert St at Hyde, looking down the 31.5% grade
  paintedladies: arrive(-122.4342, 37.7768, -122.4330, 37.7763), // Alamo Square, facing Steiner St & downtown
  twinpeaks: arrive(-122.4470, 37.7530, -122.4400, 37.7600), // Christmas Tree Point, facing downtown
  dolores: arrive(-122.4276, 37.7595, -122.4220, 37.7620), // Dolores Park, facing the skyline
  oceanbeach: arrive(-122.5096, 37.7619, -122.5200, 37.7619), // Great Highway, facing the Pacific
  ggpark: arrive(-122.4602, 37.7712, -122.4570, 37.7712), // JFK Drive by the Conservatory of Flowers
  crissy: arrive(-122.4600, 37.8035, -122.4783, 37.8150), // Crissy Field, facing the Golden Gate Bridge
  haight: arrive(-122.44662, 37.77008, -122.4480, 37.7700) // Haight St at Ashbury
};

// ---------------------------------------------------------------------------------------------------------------------
// Where you are: 'Place · Street & Cross St', 'Street & Cross St', a park or neighbourhood, or the water
// ---------------------------------------------------------------------------------------------------------------------
function crossStreet(n) {
  const r = n.road;
  // the end of this segment nearest the point, and a road with another name meeting there
  const end = NODES.get(Math.hypot(n.x - (NODES.get(r.a)?.x ?? 1e9), n.z - (NODES.get(r.a)?.z ?? 1e9)) < Math.hypot(n.x - (NODES.get(r.b)?.x ?? 1e9), n.z - (NODES.get(r.b)?.z ?? 1e9)) ? r.a : r.b);
  if (!end) return null;
  const other = end.roads.find((q) => q.name !== r.name && q.name);
  return other ? other.name : null;
}
function getLocationLabel(x, z) {
  const near = nearestRoads(x, z, 70);
  const corner = near.length ? `${near[0].road.name}${crossStreet(near[0]) ? ` & ${crossStreet(near[0])}` : ''}` : '';
  for (const lm of SF_LANDMARKS) {
    if (Math.hypot(x - lm.x, z - lm.z) < 110) return corner ? `${lm.name} · ${corner}` : lm.name;
  }
  if (corner && near[0].d < 30) return corner;
  const park = parkAt(x, z);
  if (park) return corner ? `${park} · near ${near[0].road.name}` : park;
  if (isWater(x, z)) return x < -8400 || z > 3000 && x < -6000 ? 'Pacific Ocean' : 'San Francisco Bay';
  if (corner) return `near ${corner}`;
  return neighborhoodAt(x, z) || 'San Francisco';
}

// Keyboard shortcuts are ignored while typing into a form field (e.g. the map's street search box)
function isTypingInField(e) {
  return e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT');
}

// Traffic signal cycle shared by the signal heads (street-details.js) and the traffic (traffic.js), in seconds: the
// main road green until mainAmber, amber until mainRed; the cross street green from mainRed until crossAmber, amber
// until the end of the cycle. Pedestrians cross with the traffic that runs parallel to them on the first `walk` seconds
// of its green. (`avenue*` names kept from the New York original: "avenue" = the main road of an intersection.)
const SIGNAL_TIMING = { cycle: 60, avenueAmber: 26, avenueRed: 30, streetAmber: 56, walk: 7 };
function signalPhase(time, isAvenue) {
  const { cycle, avenueAmber, avenueRed, streetAmber } = SIGNAL_TIMING;
  const t = ((time % cycle) + cycle) % cycle;
  if (isAvenue) return t < avenueAmber ? 'green' : t < avenueRed ? 'amber' : 'red';
  return t < avenueRed ? 'red' : t < streetAmber ? 'green' : 'amber';
}
function walkSignal(time, isAvenue) {
  const { cycle, avenueRed, walk } = SIGNAL_TIMING;
  const t = (((time - (isAvenue ? 0 : avenueRed)) % cycle) + cycle) % cycle;
  return t < walk;
}

// The whole simulated area (the city grid), the curb height and the Bay's level
const ISLAND_BOUNDS = { ...CITY_BOUNDS, sidewalkHeight: 0.15, waterLevel: SEA_LEVEL };
// Spawn: Powell St at Market (the cable car turntable), facing north up Powell
const SPAWN = TELEPORT_LOCATIONS.unionsq;

export {
  ROADS,
  NODES,
  NHOODS,
  PARKS,
  SF_LANDMARKS,
  LANDMARK,
  TELEPORT_LOCATIONS,
  ISLAND_BOUNDS,
  SPAWN,
  SIGNAL_TIMING,
  lonLatToWorld,
  nearestRoads,
  onRoadway,
  neighborhoodAt,
  parkAt,
  pointInPoly,
  getLocationLabel,
  isTypingInField,
  signalPhase,
  walkSignal
};
