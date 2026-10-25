// tools/geo-frame.mjs — the world frame: 1 unit = 1 m, x = east, z = south (north = -z), y = up (NAVD88 metres).
// It is UTM zone 10N shifted to an origin at Market St & Powell St, so x/z are grid east/south (grid north is 0.34°
// east of true north here — far below anything the eye can see).
import { utm } from './geo-util.mjs';

const LON0 = -122.40755, LAT0 = 37.78485; // Market & Powell (cable car turntable)
const [E0, N0] = utm(LON0, LAT0).map(Math.round);
export const FRAME = { lon0: LON0, lat0: LAT0, e0: E0, n0: N0, crs: 'EPSG:26910 (UTM 10N) shifted' };
export function toWorld(lon, lat) {
  const [e, n] = utm(lon, lat);
  return [e - E0, N0 - n];
}
