import { onRoadway } from './city-config.js';
import { isWater } from './terrain.js';
import { buildingAt } from './buildings.js';

// js/pedestrian-routes.js
// Small, lazily connected sidewalk tracks along San Francisco's streets (road-network.js edges): two walking lines on
// each side of every edge, kept off the roadway, out of buildings and out of the Bay. Junctions connect the ends of
// tracks around an intersection by a straight path or one corner, never across a roadway; crossing it is a separate,
// signal-controlled track (a crosswalk across each arm of a signalized intersection) owned by traffic.js.
// Same interface as the New York original: along(edge), across(node), next(track, dir, goalX, goalZ).

const CROSSWALK = 2.5; // see road-network.js

function createPedestrianRoutes() {
  const sidewalks = new Map(), crossings = new Map(), connections = new WeakMap();
  const point = (track, end) => ({ x: track.ax + track.ux * track.len * end, z: track.az + track.uz * track.len * end });
  const segment = (a, b, extra = {}) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    return { ax: a.x, az: a.z, ux: (b.x - a.x) / (len || 1), uz: (b.z - a.z) / (len || 1), len, node: null, side: 0, line: 0, ...extra };
  };

  // Somewhere to stand: not on a roadway, in a building or in the water
  const walkable = (x, z) => !onRoadway(x, z) && !isWater(x, z) && !buildingAt(x, z);
  function clear(a, b, step = 1) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let i = 0; i <= n; i++) if (!walkable(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n)) return false;
    return true;
  }

  function along(e) {
    if (sidewalks.has(e)) return sidewalks.get(e);
    const result = [];
    sidewalks.set(e, result);
    // Two walking lines on each side leave room for people to pass or stop together
    for (const sign of [-1, 1]) {
      for (const inset of [1.0, 2.0]) {
        const off = sign * (e.half + inset);
        const a = { x: e.sx + e.rx * off, z: e.sz + e.rz * off };
        const b = { x: a.x + e.dx * e.len, z: a.z + e.dz * e.len };
        if (e.len < 4 || !clear(a, b, 2)) continue;
        result.push(segment(a, b, { edge: e, from: e.from, to: e.to, block: e.id * 2 + (sign > 0 ? 1 : 0) }));
      }
    }
    return result;
  }

  // Crosswalks across every arm of a signalized intersection, between the stop lines and the intersection box, along
  // the road's lateral axis (traffic.js measures people on it the way it measures the lanes they cross)
  function across(n) {
    if (crossings.has(n)) return crossings.get(n);
    const result = [];
    crossings.set(n, result);
    if (!n.signal) return result;
    for (let side = 0; side < n.sideCount; side++) {
      const road = n.road[side];
      if (!road) continue;
      const arriving = road.to === n;
      const s = arriving ? road.len + CROSSWALK / 2 : -CROSSWALK / 2;
      const cx = road.sx + road.dx * s, cz = road.sz + road.dz * s;
      const reach = road.half + 2;
      for (const line of [-0.75, 0.75]) {
        const lx = cx + road.dx * line, lz = cz + road.dz * line;
        const a = { x: lx - road.clx * reach, z: lz - road.clz * reach };
        const b = { x: lx + road.clx * reach, z: lz + road.clz * reach };
        if (!walkable(a.x, a.z) || !walkable(b.x, b.z)) continue;
        result.push(segment(a, b, { node: n, side, line, from: n, to: n, block: -1 }));
      }
    }
    return result;
  }

  // Track ends meeting around an intersection: the sidewalks of every road there and its crosswalks
  const ports = new Map();
  function portsOf(n) {
    if (ports.has(n)) return ports.get(n);
    const result = [], seen = new Set();
    ports.set(n, result);
    for (const e of [...(n.in || []), ...(n.out || [])]) {
      if (seen.has(e)) continue;
      seen.add(e);
      for (const track of along(e)) result.push({ track, end: e.from === n ? 0 : 1 });
    }
    for (const track of across(n)) result.push({ track, end: 0 }, { track, end: 1 });
    return result;
  }

  function links(track, dir) {
    let ends = connections.get(track);
    if (!ends) connections.set(track, (ends = []));
    const end = dir > 0 ? 1 : 0;
    if (ends[end]) return ends[end];
    const result = (ends[end] = []);
    const n = end ? track.to : track.from;
    if (!n) return result;
    const a = point(track, end);
    for (const port of portsOf(n)) {
      const next = port.track, nextDir = port.end ? -1 : 1;
      if (next === track) continue;
      const b = point(next, port.end), distance = Math.hypot(b.x - a.x, b.z - a.z);
      if (distance > 32) continue;
      const path = [];
      if (distance > 0.01) {
        if (clear(a, b)) {
          path.push({ track: segment(a, b), dir: 1 });
        } else {
          // round the corner: meet the two walking lines where they cross, if that stays on the sidewalk
          const ax = track.ux * dir, az = track.uz * dir, bx = next.ux * nextDir, bz = next.uz * nextDir;
          const cross = ax * bz - az * bx;
          if (Math.abs(cross) < 0.2) continue;
          const t = ((b.x - a.x) * bz - (b.z - a.z) * bx) / cross;
          const c = { x: a.x + ax * t, z: a.z + az * t };
          if (t < 0 || t > 20 || (b.x - c.x) * bx + (b.z - c.z) * bz < 0 || Math.hypot(b.x - c.x, b.z - c.z) > 20) continue;
          if (!clear(a, c) || !clear(c, b)) continue;
          if (t > 0.01) path.push({ track: segment(a, c), dir: 1 });
          if (Math.hypot(b.x - c.x, b.z - c.z) > 0.01) path.push({ track: segment(c, b), dir: 1 });
        }
      }
      path.push({ track: next, dir: nextDir });
      result.push(path);
    }
    return result;
  }

  function next(track, dir, goalX, goalZ) {
    let best = null, bestScore = -Infinity;
    const a = point(track, dir > 0 ? 1 : 0);
    const gx = goalX - a.x, gz = goalZ - a.z, distance = Math.hypot(gx, gz) || 1;
    for (const path of links(track, dir)) {
      const last = path[path.length - 1], target = last.track;
      const ux = target.ux * last.dir, uz = target.uz * last.dir;
      const back = ux * track.ux * dir + uz * track.uz * dir < -0.8;
      const score = (ux * gx + uz * gz) / distance + Math.random() * 0.7 - (back ? 2 : 0);
      if (score > bestScore) { best = path; bestScore = score; }
    }
    return best;
  }

  return { along, across, next, walkable };
}

export { createPedestrianRoutes };
