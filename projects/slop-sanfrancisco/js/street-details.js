import * as THREE from 'three/webgpu';
import { Fn, float, color, positionGeometry, uniform, mod, fract, step, smoothstep, mix } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SIGNAL_TIMING, onRoadway } from './city-config.js';
import { TERRAIN, TREES } from './sf-data.js';
import { heightAt, groundAt, GROUND } from './terrain.js';
import { buildingAt } from './buildings.js';
import { CURB_RUNS } from './streetscape.js';
import { cityUniforms } from './tsl-materials.js';
import { createTreeField } from './trees.js';

// js/street-details.js
// San Francisco's street furniture, instanced city-wide (scene-culling.js cuts the instanced meshes into cells):
// - traffic signals at every signalized intersection of the road graph: a pole at the right-hand corner of each
//   approach with a mast arm over its lanes, the head facing the oncoming traffic on its road's phase, and a WALK
//   signal facing across the crosswalk
// - cobra-head streetlights along every curb (light pools near the camera after dusk)
// - white SF fire hydrants with coloured bonnets
// - the 139,000 trees of the DataSF street tree inventory where they really stand, and woods scattered over the parks
//   (Golden Gate Park, the Presidio, McLaren Park...)

const CURB_H = 0.15;

// 3-aspect signal lens: red / amber / green picked by the lens's own height in the head (+0.36 / 0 / -0.36 m), so it
// works at any altitude; driven by the shared signal clock and SIGNAL_TIMING, which traffic.js obeys. "Avenue" heads
// show the main road's phase (right-of-way group 0), the others the cross streets'.
function createTrafficSignalLensMaterial(isAvenueHead, clock) {
  const { cycle, avenueAmber, avenueRed, streetAmber } = SIGNAL_TIMING;
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = Fn(() => {
    const t = mod(clock, cycle);
    const ly = positionGeometry.y;
    const isTopRed = step(0.18, ly);
    const isBottomGreen = float(1.0).sub(step(-0.18, ly));
    const isMidAmber = float(1.0).sub(isTopRed).mul(float(1.0).sub(isBottomGreen));
    const greenActive = isAvenueHead ? float(1.0).sub(step(avenueAmber, t)) : step(avenueRed, t).mul(float(1.0).sub(step(streetAmber, t)));
    const amberActive = isAvenueHead ? step(avenueAmber, t).mul(float(1.0).sub(step(avenueRed, t))) : step(streetAmber, t);
    const redActive = isAvenueHead ? step(avenueRed, t) : float(1.0).sub(step(avenueRed, t));
    const activeMask = isTopRed.mul(redActive).add(isMidAmber.mul(amberActive)).add(isBottomGreen.mul(greenActive));
    const lensHue = mix(mix(color(0x18ff68), color(0xffaa10), isMidAmber), color(0xff2424), isTopRed);
    return mix(color(0x14181e), lensHue.mul(1.35), activeMask);
  })();
  return mat;
}

// Pedestrian signal: WALK, then a flashing hand until the parallel traffic's amber, then a steady hand. `offset`: the
// start of the parallel traffic's green in the cycle
function createWalkSignalMaterial(clock, offset) {
  const { cycle, avenueAmber, avenueRed, streetAmber, walk } = SIGNAL_TIMING;
  const amberAt = offset === 0 ? avenueAmber : streetAmber - avenueRed;
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = Fn(() => {
    const t = mod(clock.sub(offset), cycle);
    const isWalk = float(1.0).sub(step(walk, t));
    const isFlashing = step(walk, t).mul(float(1.0).sub(step(amberAt, t)));
    const handLit = float(1.0).sub(isFlashing.mul(step(0.5, fract(t))));
    const hand = mix(color(0x14181e), color(0xff5518), handLit);
    return mix(hand, color(0xf4f9ff), isWalk);
  })();
  return mat;
}

const TILE = 500;
const NEAR = 550; // street furniture drawn within this distance of the camera's tile

const hash = (a, b) => {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

function buildStreetDetails(scene, network) {
  const group = new THREE.Group();
  group.name = 'SFStreetDetails';
  const dummy = new THREE.Object3D();
  const footprints = [];
  const signalClock = uniform(0);

  // --- Materials & geometry ------------------------------------------------------------------------------------------
  const poleMetalMat = new THREE.MeshStandardNodeMaterial({ color: 0x5a6066, roughness: 0.5, metalness: 0.7 });
  const signalHousingMat = new THREE.MeshStandardNodeMaterial({ color: 0x1d2024, roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide });
  const lensMats = [createTrafficSignalLensMaterial(true, signalClock), createTrafficSignalLensMaterial(false, signalClock)];
  const walkMats = [createWalkSignalMaterial(signalClock, SIGNAL_TIMING.avenueRed), createWalkSignalMaterial(signalClock, 0)];
  const lampBulbGlow = new THREE.MeshBasicNodeMaterial();
  lampBulbGlow.colorNode = mix(color(0x8f918c), color(0xfff1d6).mul(2.1), smoothstep(0.4, 1.1, cityUniforms.uInteriorGlow));
  const hydrantMat = new THREE.MeshStandardNodeMaterial({ color: 0xe8e6df, roughness: 0.55, metalness: 0.2 });
  const bonnetMats = [0x2a5bd7, 0xd1302f, 0x1a1a1a].map((c) => new THREE.MeshStandardNodeMaterial({ color: c, roughness: 0.5, metalness: 0.2 }));

  const HEAD_W = 0.4, HEAD_H = 1.12, HEAD_D = 0.28, LENS_R = 0.145, LENS_Y = [0.36, 0, -0.36];
  const signalHousingGeo = mergeGeometries([
    new THREE.BoxGeometry(HEAD_W, HEAD_H, HEAD_D),
    new THREE.BoxGeometry(0.07, 0.2, 0.07).translate(0, HEAD_H / 2 + 0.1, 0),
    ...LENS_Y.map((ly) => new THREE.CylinderGeometry(LENS_R + 0.03, LENS_R + 0.03, 0.24, 14, 1, true, Math.PI / 2, Math.PI)
      .rotateX(Math.PI / 2).translate(0, ly, HEAD_D / 2 + 0.12))
  ].map((g) => g.toNonIndexed()));
  const signalLensGeo = mergeGeometries(LENS_Y.map((ly) => new THREE.CircleGeometry(LENS_R, 18).translate(0, ly, HEAD_D / 2 + 0.004)));
  const walkHousingGeo = new THREE.BoxGeometry(0.34, 0.4, 0.24);
  const walkPanelGeo = new THREE.PlaneGeometry(0.27, 0.31).translate(0, 0, 0.125);
  const lampHousingGeo = new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.7, 0.2, 0.3);
  const lampLensGeo = new THREE.CircleGeometry(1, 8).rotateX(Math.PI / 2).scale(0.6, 1, 0.24).translate(0, -0.005, 0);
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const hydrantGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.13, 0.15, 0.62, 8).translate(0, 0.31, 0),
    new THREE.CylinderGeometry(0.06, 0.06, 0.42, 6).rotateZ(Math.PI / 2).translate(0, 0.42, 0),
    new THREE.CylinderGeometry(0.19, 0.19, 0.06, 8).translate(0, 0.03, 0)
  ].map((g) => g.toNonIndexed()));
  const bonnetGeo = new THREE.SphereGeometry(0.15, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.62, 0);

  // Instances by 500 m tile & part: a whole city of street furniture is far too much to draw at once, so only the tiles
  // near the camera are shown (update)
  const lists = new Map(); // tile -> Map(name -> { geo, mat, matrices[] })
  const add = (name, geo, mat, matrix) => {
    const e = matrix.elements;
    const key = `${Math.floor(e[12] / TILE)},${Math.floor(e[14] / TILE)}`;
    let tile = lists.get(key);
    if (!tile) lists.set(key, (tile = new Map()));
    let l = tile.get(name);
    if (!l) tile.set(name, (l = { geo, mat, matrices: [] }));
    l.matrices.push(matrix.clone());
  };
  const place = (x, y, z, ry, sx = 1, sy = 1, sz = 1) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    return dummy.matrix;
  };
  const standable = (x, z) => !onRoadway(x, z) && !buildingAt(x, z) && groundAt(x, z) !== GROUND.WATER;

  // --- 1. Traffic signals ---------------------------------------------------------------------------------------------
  const audioSignals = [];
  const lampSites = [];
  // Poles placed so far, in an 8 m hash grid (spacing checks reach at most 8 m)
  const PCELL = 8;
  const poleGrid = new Map();
  const poles = {
    push(p) {
      const k = Math.floor(p.x / PCELL) * 65536 + Math.floor(p.z / PCELL);
      let l = poleGrid.get(k);
      if (!l) poleGrid.set(k, (l = []));
      l.push(p);
    }
  };
  const clearOfPoles = (x, z, d) => {
    const ix = Math.floor(x / PCELL), iz = Math.floor(z / PCELL);
    for (let i = ix - 1; i <= ix + 1; i++) {
      for (let j = iz - 1; j <= iz + 1; j++) {
        for (const p of poleGrid.get(i * 65536 + j) || []) if ((p.x - x) ** 2 + (p.z - z) ** 2 < d * d) return false;
      }
    }
    return true;
  };
  let nSignals = 0;
  for (const n of network.nodes) {
    if (!n.signal) continue;
    for (const e of n.in) {
      // the stop line, its right-hand curb corner, the arm reaching back over the lanes
      const sx = e.sx + e.dx * e.len, sz = e.sz + e.dz * e.len;
      let px = sx + e.rx * (e.half + 0.7), pz = sz + e.rz * (e.half + 0.7);
      if (!standable(px, pz)) {
        px += e.rx * 0.9;
        pz += e.rz * 0.9;
        if (!standable(px, pz)) continue;
      }
      if (!clearOfPoles(px, pz, 2.5)) continue;
      poles.push({ x: px, z: pz });
      footprints.push({ minX: px - 0.25, maxX: px + 0.25, minZ: pz - 0.25, maxZ: pz + 0.25 });
      const y0 = heightAt(px, pz) + CURB_H;
      const reach = Math.min(Math.max(2.5, e.half + 0.7 - (e.lanes[0] ?? 0) + 1.2), 7.5);
      const faceTraffic = Math.atan2(-e.dx, -e.dz); // a head's lenses (+z) look back down the approach
      const along = Math.atan2(-e.rz, e.rx); // the arm's local +x pointing from the pole over the lanes (-r)
      add('pole', unitCyl, poleMetalMat, place(px, y0 + 3.3, pz, 0, 0.12, 6.6, 0.12));
      dummy.position.set(px - e.rx * reach * 0.5, y0 + 6.2, pz - e.rz * reach * 0.5);
      dummy.rotation.set(0, along + Math.PI, 0);
      dummy.scale.set(reach, 0.1, 0.1);
      dummy.updateMatrix();
      add('arm', unitBox, poleMetalMat, dummy.matrix);
      const group0 = e.axisIndex === 0 ? 0 : 1;
      const hx = px - e.rx * reach, hz = pz - e.rz * reach;
      add('head', signalHousingGeo, signalHousingMat, place(hx, y0 + 5.5, hz, faceTraffic));
      add(`lens${group0}`, signalLensGeo, lensMats[group0], place(hx, y0 + 5.5, hz, faceTraffic));
      // a second, pole-mounted head at eye level for the nearest lanes
      add('head', signalHousingGeo, signalHousingMat, place(px, y0 + 3.4, pz, faceTraffic));
      add(`lens${group0}`, signalLensGeo, lensMats[group0], place(px, y0 + 3.4, pz, faceTraffic));
      // WALK signal for the crosswalk across this approach: people walk with the traffic running along it
      const walkGroup = e.axisIndex === 0 ? 1 : 0;
      const faceAcross = Math.atan2(e.rx, e.rz);
      add('walkbox', walkHousingGeo, signalHousingMat, place(px, y0 + 2.9, pz, faceAcross));
      add(`walk${walkGroup}`, walkPanelGeo, walkMats[walkGroup], place(px, y0 + 2.9, pz, faceAcross));
      audioSignals.push({ x: px, y: y0 + 2.9, z: pz, isAvenue: walkGroup === 1 });
      // a cobra-head on top of the mast lighting the intersection
      const lx = px - e.rx * reach * 0.35, lz = pz - e.rz * reach * 0.35;
      add('lamphead', lampHousingGeo, poleMetalMat, place(lx, y0 + 6.5, lz, along));
      add('lamplens', lampLensGeo, lampBulbGlow, place(lx, y0 + 6.5, lz, along));
      lampSites.push({ x: lx, y: y0 + 6.45, z: lz, tx: lx - e.rx * 2, ty: y0 - 0.15, tz: lz - e.rz * 2 });
      nSignals++;
    }
  }

  // --- 2. Streetlights & hydrants along the curbs ----------------------------------------------------------------------
  let nLamps = 0, nHydrants = 0;
  for (const run of CURB_RUNS) {
    const pts = run.pts;
    const segs = run.closed ? pts.length : pts.length - 1;
    let carry = 18 * hash(pts[0].x, pts[0].z); // stagger the first pole
    let hydrantCarry = 60 * hash(pts[0].z, pts[0].x);
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 0.5) continue;
      const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
      const nx = -dz, nz = dx; // into the island
      const sw = run.sw[i] >= 10 ? 2.5 : run.sw[i];
      for (let s = carry; s < L; s += 34) {
        if (sw < 1.6) continue;
        const px = a.x + dx * s + nx * 0.55, pz = a.z + dz * s + nz * 0.55;
        if (!standable(px, pz) || !clearOfPoles(px, pz, 8)) continue;
        poles.push({ x: px, z: pz });
        const y0 = heightAt(px, pz) + CURB_H;
        const out = Math.atan2(-nz, nx); // arm's +x over the road (-n)
        add('lpole', unitCyl, poleMetalMat, place(px, y0 + 4.3, pz, 0, 0.09, 8.6, 0.09));
        dummy.position.set(px - nx * 0.9, y0 + 8.5, pz - nz * 0.9);
        dummy.rotation.set(0, out, 0);
        dummy.scale.set(1.8, 0.08, 0.08);
        dummy.updateMatrix();
        add('larm', unitBox, poleMetalMat, dummy.matrix);
        const hx = px - nx * 1.8, hz = pz - nz * 1.8;
        add('lamphead', lampHousingGeo, poleMetalMat, place(hx, y0 + 8.55, hz, out));
        add('lamplens', lampLensGeo, lampBulbGlow, place(hx, y0 + 8.55, hz, out));
        lampSites.push({ x: hx, y: y0 + 8.5, z: hz, tx: hx - nx * 3, ty: y0 - 0.15, tz: hz - nz * 3 });
        nLamps++;
      }
      carry = ((carry - L) % 34 + 34) % 34;
      for (let s = hydrantCarry; s < L; s += 110) {
        if (sw < 1.4) continue;
        const px = a.x + dx * s + nx * 0.6, pz = a.z + dz * s + nz * 0.6;
        if (!standable(px, pz)) continue;
        const y0 = heightAt(px, pz) + CURB_H;
        const m = place(px, y0, pz, Math.atan2(dx, dz));
        add('hydrant', hydrantGeo, hydrantMat, m);
        const k = Math.floor(hash(px, pz) * 3);
        add(`bonnet${k}`, bonnetGeo, bonnetMats[k], m);
        footprints.push({ minX: px - 0.2, maxX: px + 0.2, minZ: pz - 0.2, maxZ: pz + 0.2 });
        nHydrants++;
      }
      hydrantCarry = ((hydrantCarry - L) % 110 + 110) % 110;
    }
  }

  // Instanced meshes from the lists, a group per tile
  const tiles = [];
  for (const [key, parts] of lists) {
    const [tx, tz] = key.split(',').map(Number);
    const tileGroup = new THREE.Group();
    tileGroup.name = `SFStreetDetails_${key}`;
    tileGroup.visible = false;
    for (const [name, l] of parts) {
      const mesh = new THREE.InstancedMesh(l.geo, l.mat, l.matrices.length);
      l.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.name = `SF_${name}`;
      mesh.castShadow = !/lens|walk[01]/.test(name);
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      tileGroup.add(mesh);
    }
    group.add(tileGroup);
    tiles.push({ group: tileGroup, x0: tx * TILE, z0: tz * TILE });
  }
  lists.clear();
  function showTiles(x, z) {
    for (const t of tiles) {
      const dx = Math.max(t.x0 - x, 0, x - t.x0 - TILE), dz = Math.max(t.z0 - z, 0, z - t.z0 - TILE);
      t.group.visible = dx * dx + dz * dz < NEAR * NEAR;
    }
  }

  // --- 3. Trees: the street tree inventory, and woods in the parks ---------------------------------------------------
  const sites = [];
  for (const t of TREES) {
    if (buildingAt(t.x, t.z)) continue;
    sites.push({ x: t.x, y: heightAt(t.x, t.z) + CURB_H, z: t.z, scale: Math.min(1.15, 0.5 + t.size * 0.08), species: t.kind, tier: 2 });
  }
  const nStreetTrees = sites.length;
  {
    const { res, x0, z0, w, h } = TERRAIN;
    const STEP = 15;
    for (let z = z0 + STEP / 2; z < z0 + h * res; z += STEP) {
      for (let x = x0 + STEP / 2; x < x0 + w * res; x += STEP) {
        if (groundAt(x, z) !== GROUND.PARK) continue;
        const r = hash(x, z);
        if (r > 0.55) continue;
        const jx = x + (hash(z, x) - 0.5) * STEP * 0.9, jz = z + (hash(x + 1, z) - 0.5) * STEP * 0.9;
        if (groundAt(jx, jz) !== GROUND.PARK || onRoadway(jx, jz) || buildingAt(jx, jz)) continue;
        sites.push({ x: jx, y: heightAt(jx, jz), z: jz, scale: 0.85 + r * 0.6, species: r < 0.3 ? 2 : r < 0.45 ? 0 : 1, tier: r < 0.2 ? 0 : 1 });
      }
    }
  }
  const trees = createTreeField(scene, sites);
  console.info(`[streetDetails] ${nSignals} signal approaches, ${nLamps} streetlights, ${nHydrants} hydrants, ${nStreetTrees} street trees + ${sites.length - nStreetTrees} park trees`);

  // --- 4. Light pools after dusk: the lamps nearest the camera (64 m grid of lamp sites) -----------------------------
  const LCELL = 64;
  const lampGrid = new Map();
  for (const s of lampSites) {
    const k = `${Math.floor(s.x / LCELL)},${Math.floor(s.z / LCELL)}`;
    let l = lampGrid.get(k);
    if (!l) lampGrid.set(k, (l = []));
    l.push(s);
  }
  const SPOT_POOL = 36;
  const LIGHT_DIST = 115;
  const lightsGroup = new THREE.Group();
  lightsGroup.name = 'StreetClusteredLights';
  scene.add(lightsGroup);
  const spots = [];
  for (let i = 0; i < SPOT_POOL; i++) {
    const spot = new THREE.SpotLight(0xffe8c2, 0, 25, 0.96, 0.82, 1.25);
    spot.position.set(0, -1000, 0);
    spot.target.position.set(0, -1001, 0);
    lightsGroup.add(spot, spot.target);
    spots.push(spot);
  }
  const active = [];
  const smoothFade = (d, a, b) => {
    const t = Math.min(1, Math.max(0, (b - d) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  function update(camera) {
    if (!camera) return;
    showTiles(camera.position.x, camera.position.z);
    const glow = cityUniforms.uInteriorGlow.value;
    const lampScale = Math.min(1.25, Math.max(0.0, (glow - 0.36) * 1.15));
    let used = 0;
    if (lampScale > 0.001) {
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      const me = camera.matrixWorld.elements;
      const fwdX = -me[8], fwdZ = -me[10];
      active.length = 0;
      const r = Math.ceil(LIGHT_DIST / LCELL);
      const ix = Math.floor(cx / LCELL), iz = Math.floor(cz / LCELL);
      for (let i = ix - r; i <= ix + r; i++) {
        for (let j = iz - r; j <= iz + r; j++) {
          for (const s of lampGrid.get(`${i},${j}`) || []) {
            const dx = s.x - cx, dz = s.z - cz, dy = s.y - cy;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d > LIGHT_DIST) continue;
            s._eff = d + Math.max(0, 6.0 - (dx * fwdX + dz * fwdZ)) * 2.8;
            if (s._eff < LIGHT_DIST) active.push(s);
          }
        }
      }
      active.sort((a, b) => a._eff - b._eff);
      const cutoff = active.length > SPOT_POOL ? Math.min(LIGHT_DIST, active[SPOT_POOL]._eff) : LIGHT_DIST;
      used = Math.min(active.length, SPOT_POOL);
      for (let i = 0; i < used; i++) {
        const s = active[i];
        const spot = spots[i];
        spot.position.set(s.x, s.y, s.z);
        spot.target.position.set(s.tx, s.ty, s.tz);
        spot.target.updateMatrixWorld();
        spot.intensity = 88.0 * lampScale * smoothFade(s._eff, cutoff * 0.62, cutoff);
      }
    }
    for (let i = used; i < SPOT_POOL; i++) {
      spots[i].intensity = 0;
      spots[i].position.set(0, -1000, 0);
    }
  }

  scene.add(group);
  return { group, footprints, signalClock, audioSignals, update, trees };
}

export { buildStreetDetails };
