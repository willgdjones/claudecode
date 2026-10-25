// The drivable San Francisco road graph (js/road-network.js) built from the real street centreline data.
import './helpers/sf-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { buildRoadNetwork } = await import('../js/road-network.js');
const { isWater } = await import('../js/terrain.js');

const info = console.info;
console.info = () => {};
const network = buildRoadNetwork();
console.info = info;
const { nodes, edges } = network;

test('the network covers the whole city with signals at major intersections', () => {
  assert.ok(nodes.length > 10000, `${nodes.length} nodes`);
  assert.ok(edges.length > nodes.length, `${edges.length} edges`);
  const signals = nodes.filter((n) => n.signal);
  assert.ok(signals.length > 100, `${signals.length} signalized intersections`);
  assert.ok(signals.length < nodes.length / 4, 'most intersections are unsignalized');
  // Downtown has signals (Market St corridor), and so do the outer neighbourhoods' arterials.
  assert.ok(signals.some((n) => Math.hypot(n.x, n.z) < 400), 'signals near Market & Powell');
  assert.ok(signals.some((n) => n.x < -5000), 'signals out west (Sunset / Richmond arterials)');
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minZ = Math.min(minZ, n.z); maxZ = Math.max(maxZ, n.z);
  }
  assert.ok(maxX - minX > 9000 && maxZ - minZ > 9000, 'spans the city east to west and north to south');
});

test('every edge is finite, straight, unit-directed and joins two nodes of the network', () => {
  const nodeSet = new Set(nodes);
  for (const e of edges) {
    for (const key of ['sx', 'sz', 'dx', 'dz', 'rx', 'rz', 'len', 'clx', 'clz']) {
      assert.ok(Number.isFinite(e[key]), `edge ${e.id} ${key} = ${e[key]}`);
    }
    assert.ok(e.len > 0, `edge ${e.id} has length`);
    assert.ok(Math.abs(Math.hypot(e.dx, e.dz) - 1) < 1e-9, `edge ${e.id} direction is a unit vector`);
    assert.ok(Math.abs(e.rx + e.dz) < 1e-9 && Math.abs(e.rz - e.dx) < 1e-9, `edge ${e.id} right normal is (-dz, dx)`);
    assert.ok(e.lanes.length > 0 && e.lanes.every(Number.isFinite), `edge ${e.id} has lanes`);
    for (let i = 1; i < e.lanes.length; i++) assert.ok(e.lanes[i] > e.lanes[i - 1], `edge ${e.id} lanes are sorted left to right`);
    assert.ok(nodeSet.has(e.from) && nodeSet.has(e.to), `edge ${e.id} joins network nodes`);
    assert.ok(e.from.out.includes(e) && e.to.in.includes(e), `edge ${e.id} is listed at both of its nodes`);
  }
  for (const n of nodes) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.z), `node ${n.id} is finite`);
  edges.forEach((e, i) => assert.equal(e.id, i));
  nodes.forEach((n, i) => assert.equal(n.id, i));
});

test('roads stay out of the water', () => {
  let wet = 0;
  for (const e of edges) if (isWater(e.sx + e.dx * e.len / 2, e.sz + e.dz * e.len / 2)) wet++;
  assert.ok(wet <= edges.length * 0.001, `${wet} edge midpoints in the water`);
});

test('every lane leads somewhere: moves continue onto edges leaving the node it reaches', () => {
  let deadEnds = 0;
  for (const e of edges) {
    if (!e.moves.length) { deadEnds++; continue; }
    for (const m of e.moves) {
      assert.equal(m.to.from, e.to, `edge ${e.id} move continues from the node it reaches`);
      assert.equal(m.out.length, e.lanes.length, `edge ${e.id} move maps each lane`);
      for (const j of m.out) assert.ok(j < m.to.lanes.length, `edge ${e.id} move targets an existing lane`);
    }
    for (let i = 0; i < e.lanes.length; i++) {
      assert.ok(e.moves.some((m) => m.out[i] >= 0), `edge ${e.id} lane ${i} has a way on`);
    }
  }
  assert.ok(deadEnds < edges.length * 0.01, `${deadEnds} edges with no way on`);
});

test('lane connectors between edges are finite curves', () => {
  let checked = 0;
  for (const e of edges) {
    if (checked >= 2000) break;
    const m = e.moves.find((q) => q.out[0] >= 0);
    if (!m) continue;
    const c = network.connector(e, 0, m.to, m.out[0]);
    assert.ok(Number.isFinite(c.len) && c.len >= 0, `connector from edge ${e.id} has a finite length`);
    checked++;
  }
  assert.ok(checked > 1000);
});
