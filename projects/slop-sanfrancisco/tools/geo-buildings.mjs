// tools/geo-buildings.mjs — every building in the city from DataSF Building Footprints (ynuv-fyni): footprint
// polygons with 2010 LiDAR roof statistics. median_1st_m is the roof's absolute elevation (NAVD88, the DEM's datum),
// peak_1st_m its highest return (spires, towers). Styles come from the zoning district under the building and its
// massing (they pick facade generators at runtime: SF rowhouses with bay windows, stucco houses, towers...).
// NB the survey predates the 2010s towers (Salesforce Tower, 181 Fremont, Park Tower): those are landmarks.
import { loadFeatures, log, Raster, rdpRing, ringArea } from './geo-util.mjs';
import { toWorld } from './geo-frame.mjs';

export const STYLE = { house: 0, rowhouse: 1, midrise: 2, tower: 3, industrial: 4, civic: 5, shed: 6 };

// --- Zoning lookup (8 m raster of zoning category ids) --------------------------------------------------------------
const ZONE_KIND = (z, gen) => {
  if (/^RH-1/.test(z)) return 'rh1';
  if (/^(RH|RM|RTO|RED|TB|SB|PM-R|TI-R)/.test(z)) return 'res';
  if (/^(NC|NCT|NCD|RC|CRNC|RCD)/.test(z)) return 'nc';
  if (/^C-3/.test(z)) return 'downtown';
  if (/^(PDR|M-|SALI|SLI)/.test(z)) return 'industrial';
  if (/^(P$|PM-OS|TI-OS)/.test(z) || gen === 'Public') return 'public';
  return 'mixed';
};
const ZONE_IDS = ['none', 'rh1', 'res', 'nc', 'downtown', 'industrial', 'public', 'mixed'];
let zoneRaster = null;
function zoning() {
  if (zoneRaster) return zoneRaster;
  const R = new Raster(-9700, -5700, 4500, 8900, 8);
  for (const f of loadFeatures('zoning')) {
    const g = f.geometry;
    if (!g) continue;
    const id = ZONE_IDS.indexOf(ZONE_KIND(f.properties.zoning || f.properties.zoning_sim || '', f.properties.gen));
    const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
    for (const poly of polys) R.fillRing(poly[0].map(([lon, lat]) => toWorld(lon, lat)), id);
  }
  zoneRaster = R;
  return R;
}
export function zoneAt(x, z) {
  const R = zoning();
  const i = Math.floor((x - R.x0) / R.res), j = Math.floor((z - R.z0) / R.res);
  return i >= 0 && j >= 0 && i < R.w && j < R.h ? ZONE_IDS[R.d[j * R.w + i]] : 'none';
}

// --- Footprints ------------------------------------------------------------------------------------------------------
/** [{ ring: [[x,z]...] CCW-in-world (positive ringArea), cx, cz, area, gnd, roof, peak, id }] */
export function loadBuildings() {
  const out = [];
  let dropped = 0;
  for (const f of loadFeatures('footprints')) {
    const p = f.properties, g = f.geometry;
    const roof = +p.median_1st_m, gnd = +p.gnd_min_m, peak = +p.peak_1st_m;
    if (!g || !Number.isFinite(roof) || !Number.isFinite(gnd)) { dropped++; continue; }
    const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
    for (const poly of polys) {
      let ring = poly[0].map(([lon, lat]) => toWorld(lon, lat));
      if (ring.length > 3 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
      ring = rdpRing(ring, 0.3);
      if (ring.length < 3) { dropped++; continue; }
      let area = ringArea(ring);
      if (area < 0) { ring.reverse(); area = -area; }
      if (area < 6) { dropped++; continue; }
      let cx = 0, cz = 0;
      for (const [x, z] of ring) { cx += x; cz += z; }
      cx /= ring.length; cz /= ring.length;
      out.push({ ring, cx, cz, area, gnd, roof, peak: Number.isFinite(peak) ? peak : roof, id: Math.round(parseFloat(p.sf16_bldgid) * 1e4) % 2147483647 });
    }
  }
  log(`buildings: ${out.length} footprints (${dropped} dropped)`);
  return out;
}

/** Facade style from zoning & massing (height h above its base, footprint area, narrowest side) */
export function classify(b, h) {
  const zone = zoneAt(b.cx, b.cz);
  // shortest edge ≈ frontage of a rowhouse lot
  let minEdge = Infinity, maxEdge = 0;
  for (let i = 0; i < b.ring.length; i++) {
    const [x0, z0] = b.ring[i], [x1, z1] = b.ring[(i + 1) % b.ring.length];
    const l = Math.hypot(x1 - x0, z1 - z0);
    if (l > 2) minEdge = Math.min(minEdge, l);
    maxEdge = Math.max(maxEdge, l);
  }
  if (b.area < 22 || h < 3.2) return STYLE.shed;
  if (h > 42) return STYLE.tower;
  if (zone === 'industrial' && b.area > 500 && h < 22) return STYLE.industrial;
  if (zone === 'public' && b.area > 600) return STYLE.civic;
  if (zone === 'rh1' && h < 13) return STYLE.house;
  if ((zone === 'res' || zone === 'nc' || zone === 'rh1' || zone === 'mixed') && h < 16 && b.area < 450 && minEdge < 11) return STYLE.rowhouse;
  if (h < 11 && b.area < 300) return zone === 'rh1' ? STYLE.house : STYLE.rowhouse;
  return STYLE.midrise;
}
