// tools/geo-streets.mjs — DataSF street centrelines (3psu-pn9h) in the world frame.
// Each active segment ("CNN") runs between two intersection nodes (f_node_cnn -> t_node_cnn) along a polyline.
// oneway: B both ways, F with the digitised direction (from -> to), T against it.
import { loadFeatures, log, rdp } from './geo-util.mjs';
import { toWorld } from './geo-frame.mjs';

// Layers that carry ordinary traffic at grade
const DRIVE_LAYERS = new Set(['STREETS', 'STREETS_TI', 'STREETS_YBI', 'STREETS_HUNTERSP', 'PARKS', 'PARKS_NPS_PRESIDIO', 'PARKS_NPS_FTMASON']);
const FREEWAY_LAYERS = new Set(['FREEWAYS']);
const PED_LAYERS = new Set(['STREETS_PEDESTRI']);

const SUFFIX = { ST: 'St', AVE: 'Ave', BLVD: 'Blvd', DR: 'Dr', WAY: 'Way', PL: 'Pl', TER: 'Ter', CT: 'Ct', LN: 'Ln', RD: 'Rd', AL: 'Alley', HWY: 'Hwy', CIR: 'Cir', PARK: 'Park', PLZ: 'Plaza', ROW: 'Row', SQ: 'Sq', STWY: 'Stairway', WALK: 'Walk', TUNL: 'Tunnel', LOOP: 'Loop', BR: 'Bridge', EXPY: 'Expy', HL: 'Hill', PATH: 'Path' };
const ORD = (n) => n + (['th', 'st', 'nd', 'rd'][((n % 100) - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
/** "03RD ST" -> "3rd St", "JOHN F KENNEDY DR" -> "John F Kennedy Dr", "O'FARRELL ST" -> "O'Farrell St" */
export function prettyStreet(street, type) {
  let s = (street || '').trim().replace(/\s+/g, ' ');
  s = s.replace(/^0*(\d+)(ST|ND|RD|TH)\b/, (_, d) => ORD(+d));
  s = s.toLowerCase().replace(/(^|[\s\-'/(])([a-z])/g, (_, p, c) => p + c.toUpperCase()).replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, d, t) => d + t.toLowerCase());
  s = s.replace(/\bMc([a-z])/g, (_, c) => 'Mc' + c.toUpperCase());
  const t = type ? SUFFIX[type] || type[0] + type.slice(1).toLowerCase() : '';
  return t ? `${s} ${t}` : s;
}

const RAW_STREETS = loadFeatures('streets');
export const segments = [];
let skipped = 0;
for (const f of RAW_STREETS) {
  const p = f.properties, g = f.geometry;
  const layer = p.layer;
  const kind = DRIVE_LAYERS.has(layer) ? 'road' : FREEWAY_LAYERS.has(layer) ? 'freeway' : PED_LAYERS.has(layer) ? 'ped' : null;
  if (!kind || !g || g.type !== 'LineString' || g.coordinates.length < 2) { skipped++; continue; }
  let pts = g.coordinates.map(([lon, lat]) => toWorld(lon, lat));
  pts = rdp(pts, 0.4);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (len < 0.5) { skipped++; continue; }
  segments.push({
    cnn: +p.cnn,
    name: prettyStreet(p.street, p.st_type),
    raw: p.streetname || '',
    cls: +p.classcode || 0,
    layer,
    kind,
    oneway: p.oneway === 'F' ? 1 : p.oneway === 'T' ? -1 : 0,
    a: Math.round(+p.f_node_cnn),
    b: Math.round(+p.t_node_cnn),
    nhood: p.nhood || '',
    pts,
    len
  });
}
log(`streets: ${segments.length} segments (${segments.filter((s) => s.kind === 'road').length} roads, ${segments.filter((s) => s.kind === 'freeway').length} freeway, ${segments.filter((s) => s.kind === 'ped').length} pedestrian), ${skipped} skipped`);

/** Point at arc length s along a polyline, and its unit direction */
export function along(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
    const l = Math.hypot(x1 - x0, z1 - z0);
    if (s <= l || i === pts.length - 1) {
      const t = l > 0 ? Math.min(1, Math.max(0, s / l)) : 0;
      return { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, dx: (x1 - x0) / (l || 1), dz: (z1 - z0) / (l || 1) };
    }
    s -= l;
  }
  const [x, z] = pts[pts.length - 1];
  return { x, z, dx: 1, dz: 0 };
}
