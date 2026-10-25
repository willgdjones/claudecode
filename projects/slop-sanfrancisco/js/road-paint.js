import * as THREE from 'three/webgpu';
import { CROSSWALK } from './road-network.js';
import { createRoadPaintMaterial } from './tsl-materials.js';
import { heightAt } from './terrain.js';

// js/road-paint.js
// Road markings generated from the drivable road network (js/road-network.js), so the paint matches where traffic
// actually drives and stops: dashed lane lines, double yellow centre lines on two-way roads, stop bars at the stop
// lines, continental crosswalks across every intersection approach and green bike lanes along wide one-way roads.
// San Francisco has some 2,300 km of lanes' worth of markings over its hills: they are worked out once as strips,
// then draped over the ground (every few metres) only in the 500 m tiles around the camera.

const WHITE = new THREE.Color(0xe6e2d6);
const YELLOW = new THREE.Color(0xe8ad22);
const GREEN = new THREE.Color(0x2a8a4e);
const HEIGHT = 0.03; // above the asphalt (the ground mesh's facets stay within a few cm of heightAt)
const TILE = 500;
const NEAR = 650; // tiles whose nearest point is this close get their paint
const STEP = 3; // m between the points where a strip follows the ground

function buildRoadPaint(scene, network) {
  const strips = new Map(); // tile key -> [ax, az, bx, bz, w, col, period, duty, phase, flow]
  const lines = [];
  const bends = new Map();

  // Strip w wide from a to b, with a dash pattern (period, duty cycle) running along it (built later, see tileMesh)
  function strip(ax, az, bx, bz, w, col, period = 1, duty = 1, phase = 0, flow = 1) {
    if (Math.hypot(bx - ax, bz - az) < 0.05) return;
    const key = `${Math.floor((ax + bx) / 2 / TILE)},${Math.floor((az + bz) / 2 / TILE)}`;
    let list = strips.get(key);
    if (!list) strips.set(key, (list = []));
    list.push([ax, az, bx, bz, w, col, period, duty, phase, flow]);
  }

  // Edges run between stop lines; s is measured from the start one and o to the right of the centre line
  const at = (e, s, o) => [e.sx + e.dx * s + e.rx * o, e.sz + e.dz * s + e.rz * o];
  const along = (e, o, w, col, period = 1, duty = 1) => {
    const start = (e.sx - e.x0) * e.dx + (e.sz - e.z0) * e.dz;
    const ends = [at(e, e.from.shape ? -start : 0.9, o), at(e, e.to.shape ? e.span - start : e.len - 0.9, o)];
    lines.push({ e, o, w, col, period, duty, ends, joins: [] });
  };
  const across = (e, s, o0, o1, w, col, period, duty) => strip(...at(e, s, o0), ...at(e, s, o1), w, col, period, duty);
  const clearCentre = (e, o) => {
    if (!network.isRoadClear) return false;
    const steps = Math.max(1, Math.ceil((e.len - 1.8) / 2.5));
    for (let i = 0; i <= steps; i++) {
      const s = 0.9 + (e.len - 1.8) * i / steps;
      for (const offset of [o - 0.12, o + 0.12]) if (!network.isRoadClear(...at(e, s, offset), 0.15)) return false;
    }
    return true;
  };

  // The one or two directed edges of each road between a pair of intersections
  const roads = new Map();
  for (const e of network.paintEdges || network.edges) {
    const key = Math.min(e.from.id, e.to.id) * 65536 + Math.max(e.from.id, e.to.id);
    if (roads.has(key)) roads.get(key).push(e);
    else roads.set(key, [e]);
  }

  for (const [e, back] of roads.values()) {
    const firstLine = lines.length;
    // Lanes of both directions, measured to the right of e, left to right
    const lanes = e.lanes.map((o) => ({ o, dir: 1 }));
    if (back) for (const o of back.lanes) lanes.push({ o: -o, dir: -1 });
    lanes.sort((p, q) => p.o - q.o);

    // Dashed white between lanes going the same way, double yellow between opposing ones
    // (nothing across a median or a lane closed off by an obstacle)
    for (let k = 0; k + 1 < lanes.length; k++) {
      const p = lanes[k];
      const q = lanes[k + 1];
      const mid = (p.o + q.o) / 2;
      if (q.o - p.o > 4.5 && (p.dir === q.dir || !clearCentre(e, mid))) continue;
      if (p.dir === q.dir) {
        along(e, mid, 0.13, WHITE, 12, 0.25);
      } else {
        along(e, mid - 0.12, 0.11, YELLOW);
        along(e, mid + 0.12, 0.11, YELLOW);
      }
    }

    // Wide one-way avenues: edge line, then a buffer and a green bike lane along the curb on the side left free
    if (!back && e.axis === 'ave' && lanes.length >= 4) {
      for (const [edge, sign] of [[lanes[lanes.length - 1].o + 1.8, 1], [lanes[0].o - 1.8, -1]]) {
        const curb = sign * e.half;
        if ((curb - edge) * sign < 3.5) continue;
        along(e, edge + sign * 0.2, 0.13, WHITE);
        along(e, curb - sign * 2.4, 0.13, WHITE);
        along(e, curb - sign * 1.3, 2.0, GREEN);
      }
    }

    // Stop bars across the lanes arriving at each stop line, from the centre line (or median) to the curb (none where a
    // street merely bends: a shape node of the centreline streets)
    for (const f of back ? [e, back] : [e]) {
      if (f.to.shape) continue;
      const left = back ? Math.max(0, f.lanes[0] - 1.8) : -f.half;
      across(f, f.len - 0.35, left + 0.1, f.half - 0.1, 0.45, WHITE);
    }

    // Continental crosswalks curb to curb, between the stop lines and the intersections at both ends
    if (!e.from.shape) across(e, -CROSSWALK / 2, -e.half, e.half, CROSSWALK - 0.3, WHITE, 1.2, 0.5);
    if (!e.to.shape) across(e, e.len + CROSSWALK / 2, -e.half, e.half, CROSSWALK - 0.3, WHITE, 1.2, 0.5);

    for (const [end, node] of [[0, e.from], [1, e.to]]) {
      if (!node.shape) continue;
      if (!bends.has(node.id)) bends.set(node.id, []);
      bends.get(node.id).push({ e, end, lines: lines.slice(firstLine) });
    }
  }

  // At a simple bend, corresponding offset lines meet at a bounded miter, without an intersection-sized gap.
  for (const roadsAtBend of bends.values()) {
    if (roadsAtBend.length !== 2) continue;
    const [a, b] = roadsAtBend;
    const sign = a.end === b.end ? -1 : 1;
    if ((a.e.dx * b.e.dx + a.e.dz * b.e.dz) * sign < 0.5) continue;
    for (const p of a.lines) {
      let q = null;
      let distance = 0.5;
      for (const line of b.lines) {
        const d = Math.abs(p.o - line.o * sign);
        if (!line.joins[b.end] && line.col === p.col && line.w === p.w && line.period === p.period &&
          line.duty === p.duty && d < distance) {
          q = line;
          distance = d;
        }
      }
      if (!q) continue;
      const A = p.ends[a.end];
      const B = q.ends[b.end];
      const dx = B[0] - A[0];
      const dz = B[1] - A[1];
      const cross = a.e.dx * b.e.dz - a.e.dz * b.e.dx;
      let join;
      if (Math.abs(cross) < 0.001) {
        if (Math.hypot(dx, dz) > 0.5) continue;
        join = [(A[0] + B[0]) * 0.5, (A[1] + B[1]) * 0.5];
      } else {
        const t = (dx * b.e.dz - dz * b.e.dx) / cross;
        const u = (dx * a.e.dz - dz * a.e.dx) / cross;
        const limit = Math.min(6, a.e.span * 0.25, b.e.span * 0.25);
        if (Math.abs(t) > limit || Math.abs(u) > limit) continue;
        join = [A[0] + a.e.dx * t, A[1] + a.e.dz * t];
      }
      p.ends[a.end] = q.ends[b.end] = join;
      p.joins[a.end] = [q, b.end];
      q.joins[b.end] = [p, a.end];
    }
  }

  // Continue the same dash phase around bends, even when adjacent road edges point in opposite directions.
  for (const line of lines) {
    // An unmatched marking keeps its original gap instead of extending towards a curb at a sharp bend.
    for (const end of [0, 1]) {
      if (!line.joins[end]) line.ends[end] = at(line.e, end ? line.e.len - 0.9 : 0.9, line.o);
    }
    line.len = Math.hypot(line.ends[1][0] - line.ends[0][0], line.ends[1][1] - line.ends[0][1]);
  }
  for (const root of lines) {
    if (root.phase !== undefined) continue;
    root.phase = 0;
    root.flow = 1;
    const stack = [root];
    while (stack.length) {
      const line = stack.pop();
      for (let end = 0; end < 2; end++) {
        if (!line.joins[end]) continue;
        const [next, nextEnd] = line.joins[end];
        if (next.phase !== undefined) continue;
        next.flow = line.flow * (end === nextEnd ? -1 : 1);
        next.phase = line.phase + end * line.len * line.flow - nextEnd * next.len * next.flow;
        next.phase = ((next.phase % next.period) + next.period) % next.period;
        stack.push(next);
      }
      strip(...line.ends[0], ...line.ends[1], line.w, line.col, line.period, line.duty, line.phase, line.flow);
    }
  }

  // Geometry of one tile's strips, each draped over the ground every STEP metres
  const material = createRoadPaintMaterial();
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;
  function tileMesh(list) {
    const position = [], side = [], paint = [], colors = [], index = [];
    for (const [ax, az, bx, bz, w, col, period, duty, phase, flow] of list) {
      const len = Math.hypot(bx - ax, bz - az);
      const sx = ((az - bz) / len) * w * 0.5;
      const sz = ((bx - ax) / len) * w * 0.5;
      const n = Math.max(1, Math.ceil(len / STEP));
      const i0 = position.length / 3;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const u = phase + len * flow * t;
        for (const s of [-1, 1]) {
          const px = x + sx * s, pz = z + sz * s;
          position.push(px, heightAt(px, pz) + HEIGHT, pz);
          side.push(sx * s, sz * s);
          paint.push(u, period, duty);
          colors.push(col.r, col.g, col.b);
        }
      }
      for (let k = 0; k < n; k++) {
        const q = i0 + k * 2; // q: -1 side, q + 1: +1 side, q + 2 / q + 3: the next pair
        index.push(q, q + 1, q + 3, q, q + 3, q + 2);
      }
    }
    const normal = new Float32Array(position.length);
    for (let i = 1; i < normal.length; i += 3) normal[i] = 1;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('side', new THREE.Float32BufferAttribute(side, 2));
    geometry.setAttribute('paint', new THREE.Float32BufferAttribute(paint, 3));
    geometry.setIndex(position.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'RoadMarkings';
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = -1; // under the other see-through ground effects (contact shadows, headlight beams)
    return mesh;
  }

  const group = new THREE.Group();
  group.name = 'RoadMarkingsTiles';
  scene.add(group);
  const live = new Map(); // tile key -> mesh
  function update(x, z, budget = 2) {
    for (const [key, mesh] of live) {
      const [tx, tz] = key.split(',').map(Number);
      const dx = Math.max(tx * TILE - x, 0, x - (tx + 1) * TILE), dz = Math.max(tz * TILE - z, 0, z - (tz + 1) * TILE);
      if (Math.hypot(dx, dz) > NEAR + 200) {
        group.remove(mesh);
        mesh.geometry.dispose();
        live.delete(key);
      }
    }
    const want = [];
    for (const key of strips.keys()) {
      if (live.has(key)) continue;
      const [tx, tz] = key.split(',').map(Number);
      const dx = Math.max(tx * TILE - x, 0, x - (tx + 1) * TILE), dz = Math.max(tz * TILE - z, 0, z - (tz + 1) * TILE);
      const d = Math.hypot(dx, dz);
      if (d < NEAR) want.push([d, key]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, key] of want.slice(0, budget)) {
      const mesh = tileMesh(strips.get(key));
      group.add(mesh);
      live.set(key, mesh);
    }
  }
  return { group, update, material };
}

export { buildRoadPaint };
