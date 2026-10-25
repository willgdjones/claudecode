// The San Francisco ground (js/terrain.js on the real data/ heightfield): heights, continuity and water.
import './helpers/sf-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { heightAt, isWater, surfaceAt, waterLevelAt, gradeAlong, CITY_BOUNDS, SEA_LEVEL } = await import('../js/terrain.js');
const { lonLatToWorld, NHOODS, ROADS } = await import('../js/city-config.js');

// The city proper: Ocean Beach to Hunters Point, the Marina to the San Mateo county line (with a margin of the Bay).
const CITY = { minX: -9500, maxX: 3500, minZ: -4200, maxZ: 8500 };

test('heightAt is finite everywhere, including far outside the city grid', () => {
  for (let z = CITY_BOUNDS.minZ - 20000; z <= CITY_BOUNDS.maxZ + 20000; z += 397) {
    for (let x = CITY_BOUNDS.minX - 20000; x <= CITY_BOUNDS.maxX + 20000; x += 397) {
      const h = heightAt(x, z);
      assert.ok(Number.isFinite(h), `heightAt(${x}, ${z}) = ${h}`);
      assert.ok(h > -100 && h < 1000, `heightAt(${x}, ${z}) = ${h} is a plausible elevation`);
      assert.ok(Number.isFinite(surfaceAt(x, z)));
    }
  }
});

test('heightAt is continuous across the city (no steps between neighbouring samples)', () => {
  // 0.5 m steps along east-west and north-south lines every ~100 m. The bilinear 4 m grid has no seams: even the
  // sheerest bluffs (Lands End, ~3 m per half metre) stay under 5 m, where a seam in the grid jumps tens of metres.
  const d = 0.5;
  let worst = { step: 0 };
  for (let z = CITY.minZ; z <= CITY.maxZ; z += 101) {
    for (let x = CITY.minX; x < CITY.maxX; x += d) {
      const step = Math.abs(heightAt(x + d, z) - heightAt(x, z));
      if (step > worst.step) worst = { step, x, z };
    }
  }
  for (let x = CITY.minX; x <= CITY.maxX; x += 101) {
    for (let z = CITY.minZ; z < CITY.maxZ; z += d) {
      const step = Math.abs(heightAt(x, z + d) - heightAt(x, z));
      if (step > worst.step) worst = { step, x, z };
    }
  }
  assert.ok(worst.step < 5, `a ${worst.step.toFixed(2)} m step at (${worst.x}, ${worst.z})`);
});

test('the ground meets the Bay ring without a cliff at the edge of the city grid', () => {
  // the visible surface: under water, the city grid keeps the seabed (-8 m) and the Bay ring 0 m
  let worst = { step: 0 };
  for (let z = CITY_BOUNDS.minZ; z < CITY_BOUNDS.maxZ; z += 20) {
    for (const x of [CITY_BOUNDS.minX, CITY_BOUNDS.maxX]) {
      const step = Math.abs(surfaceAt(x - 2, z) - surfaceAt(x + 2, z));
      if (step > worst.step) worst = { step, x, z };
    }
  }
  for (let x = CITY_BOUNDS.minX; x < CITY_BOUNDS.maxX; x += 20) {
    for (const z of [CITY_BOUNDS.minZ, CITY_BOUNDS.maxZ]) {
      const step = Math.abs(surfaceAt(x, z - 2) - surfaceAt(x, z + 2));
      if (step > worst.step) worst = { step, x, z };
    }
  }
  assert.ok(worst.step < 5, `a ${worst.step.toFixed(1)} m cliff at (${worst.x}, ${worst.z})`);
});

test('Twin Peaks summit stands about 280 m above the Bay', () => {
  const peak = lonLatToWorld(-122.4475, 37.7544);
  const h = heightAt(peak.x, peak.z);
  assert.ok(h > 250 && h < 290, `Twin Peaks at ${h.toFixed(1)} m`);
  // The highest ground within a few hundred metres is the summit area, not some far-off artefact.
  let highest = -Infinity;
  for (let z = CITY.minZ; z <= CITY.maxZ; z += 50) for (let x = CITY.minX; x <= CITY.maxX; x += 50) highest = Math.max(highest, heightAt(x, z));
  assert.ok(highest < 300, `nothing in the city rises above Twin Peaks / Mount Davidson (${highest.toFixed(1)} m)`);
});

test('Market & Powell (the world origin) sits low downtown', () => {
  const h = heightAt(0, 0);
  assert.ok(h > 5 && h < 25, `Market & Powell at ${h.toFixed(1)} m`);
  assert.equal(isWater(0, 0), false);
  const origin = lonLatToWorld(-122.4078, 37.7847);
  assert.ok(Math.hypot(origin.x, origin.z) < 50, 'lonLatToWorld puts Market & Powell at the origin');
});

test('Filbert St climbs Russian Hill at its real 31.5% grade, downtown stays flat', () => {
  // The block of Filbert St east of Hyde St (down to Leavenworth), from the street centreline data
  const hyde = lonLatToWorld(-122.4193, 37.8003);
  const block = ROADS.find((r) => r.name === 'Filbert St' && [r.pts[0], r.pts.at(-1)].some((p) => Math.hypot(p.x - hyde.x, p.z - hyde.z) < 30)
    && Math.abs(r.pts.at(-1).x - r.pts[0].x) > 100 && Math.max(r.pts[0].x, r.pts.at(-1).x) > hyde.x + 50);
  assert.ok(block, 'the Filbert St block east of Hyde is in the road data');
  const [p, q] = [block.pts[0], block.pts.at(-1)];
  const L = Math.hypot(q.x - p.x, q.z - p.z), ux = (q.x - p.x) / L, uz = (q.z - p.z) / L;
  let steepest = 0;
  for (let s = 5; s <= L - 5; s += 2.5) steepest = Math.max(steepest, Math.abs(gradeAlong(p.x + ux * s, p.z + uz * s, ux, uz, 5)));
  assert.ok(steepest > 0.28 && steepest < 0.36, `steepest grade ${(steepest * 100).toFixed(1)}%`);
  const rise = Math.abs(heightAt(q.x, q.z) - heightAt(p.x, p.z));
  assert.ok(rise > 15, `the block rises ${rise.toFixed(1)} m`);
  assert.ok(Math.abs(gradeAlong(0, 0, 1, 0, 10)) < 0.08, 'downtown is nearly flat');
});

test('isWater: the Pacific and the Bay are water, the city is not', () => {
  assert.equal(isWater(-12000, 2800), true, 'the Pacific off Ocean Beach');
  // Mid-Bay between the Ferry Building and Yerba Buena Island ((3500, -3500) is the Treasure Island causeway: land).
  assert.equal(isWater(2400, -1700), true, 'the Bay');
  assert.equal(isWater(3000, 0), true, 'the Bay off Mission Bay');
  assert.ok(heightAt(2400, -1700) < SEA_LEVEL && heightAt(-12000, 2800) <= 0.5, 'water lies at or below sea level');
  assert.equal(isWater(0, 0), false, 'downtown');
  const peak = lonLatToWorld(-122.4475, 37.7544);
  assert.equal(isWater(peak.x, peak.z), false, 'Twin Peaks');
  // Most of the area inside the neighbourhood outlines is dry land.
  let land = 0, total = 0;
  for (const n of NHOODS) {
    const c = n.poly.reduce((s, p) => ({ x: s.x + p.x / n.poly.length, z: s.z + p.z / n.poly.length }), { x: 0, z: 0 });
    total++;
    if (!isWater(c.x, c.z)) land++;
  }
  assert.ok(land / total > 0.9, `${land} of ${total} neighbourhood centres are dry`);
});

test('the water surface sits at sea level over the Bay and above the bed', () => {
  assert.equal(waterLevelAt(2400, -1700), SEA_LEVEL);
  assert.ok(surfaceAt(2400, -1700) >= heightAt(2400, -1700));
  assert.equal(surfaceAt(2400, -1700), SEA_LEVEL);
  assert.equal(surfaceAt(0, 0), heightAt(0, 0), 'on land the surface is the ground');
});
