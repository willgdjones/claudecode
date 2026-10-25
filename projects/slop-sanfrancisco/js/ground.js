import * as THREE from 'three/webgpu';
import { TERRAIN, BAY, GEO } from './sf-data.js';
import { SEA_LEVEL, GROUND, heightAt, groundAt, bayHeight } from './terrain.js';
import { createTerrainMaterial, createWaterMaterial } from './tsl-materials.js';

// js/ground.js
// Meshes for the ground: the city heightfield in 512 m chunks with five levels of detail (4 m cells up close to 64 m
// far away; skirts hide the cracks between neighbouring levels), the Bay and the lakes, and the Bay ring of hills
// around it (Marin Headlands, Angel Island, Alcatraz, the East Bay hills, San Bruno Mountain) from the 1/3" DEM.

const { res: RES, x0: X0, z0: Z0, w: W, h: H, hgt: HGT, ground: CLS } = TERRAIN;
const CHUNK = 128; // cells per chunk side (512 m)
const LOD_STEPS = [1, 2, 4, 8, 16];
const LOD_DIST = [420, 1000, 2200, 4800]; // switch to the next coarser level beyond these (m from the chunk's box)

// --- One chunk at one level ------------------------------------------------------------------------------------------
function buildChunkGeometry(ci0, cj0, step) {
  const n = CHUNK / step; // quads per side
  const nv = n + 1;
  const skirt = 1.5 + step * 1.2;
  const total = nv * nv + 4 * nv;
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const gnd = new Uint8Array(total * 4);
  const cellAt = (a) => Math.min(W - 1, a);
  const cellAtZ = (b) => Math.min(H - 1, b);
  let v = 0;
  const weights = [0, 0, 0, 0, 0, 0];
  const put = (i, j, drop) => {
    const k = j * W + i;
    pos[v * 3] = X0 + (i + 0.5) * RES;
    pos[v * 3 + 1] = HGT[k] - drop;
    pos[v * 3 + 2] = Z0 + (j + 0.5) * RES;
    const il = Math.max(0, i - step), ir = Math.min(W - 1, i + step);
    const jl = Math.max(0, j - step), jr = Math.min(H - 1, j + step);
    const dx = (HGT[j * W + ir] - HGT[j * W + il]) / ((ir - il) * RES || 1);
    const dz = (HGT[jr * W + i] - HGT[jl * W + i]) / ((jr - jl) * RES || 1);
    const l = Math.hypot(dx, 1, dz);
    nrm[v * 3] = -dx / l;
    nrm[v * 3 + 1] = 1 / l;
    nrm[v * 3 + 2] = -dz / l;
    // surface weights over the cells this vertex stands for
    weights.fill(0);
    const r = step > 1 ? step >> 1 : 0;
    let cnt = 0;
    for (let jj = Math.max(0, j - r); jj <= Math.min(H - 1, j + r); jj += Math.max(1, r)) {
      for (let ii = Math.max(0, i - r); ii <= Math.min(W - 1, i + r); ii += Math.max(1, r)) {
        weights[CLS[jj * W + ii]]++;
        cnt++;
      }
    }
    gnd[v * 4] = (weights[GROUND.ROAD] / cnt) * 255;
    gnd[v * 4 + 1] = (weights[GROUND.PARK] / cnt) * 255;
    gnd[v * 4 + 2] = (weights[GROUND.SAND] / cnt) * 255;
    gnd[v * 4 + 3] = (weights[GROUND.LOT] / cnt) * 255;
    v++;
  };
  for (let b = 0; b < nv; b++) for (let a = 0; a < nv; a++) put(cellAt(ci0 + a * step), cellAtZ(cj0 + b * step), 0);
  // skirts: north (b = 0), south (b = n), west (a = 0), east (a = n) edges, dropped below the ground
  const skirtStart = v;
  for (let a = 0; a < nv; a++) put(cellAt(ci0 + a * step), cellAtZ(cj0), skirt);
  for (let a = 0; a < nv; a++) put(cellAt(ci0 + a * step), cellAtZ(cj0 + n * step), skirt);
  for (let b = 0; b < nv; b++) put(cellAt(ci0), cellAtZ(cj0 + b * step), skirt);
  for (let b = 0; b < nv; b++) put(cellAt(ci0 + n * step), cellAtZ(cj0 + b * step), skirt);

  const idx = [];
  const at = (a, b) => b * nv + a;
  for (let b = 0; b < n; b++) {
    for (let a = 0; a < n; a++) {
      const p00 = at(a, b), p10 = at(a + 1, b), p01 = at(a, b + 1), p11 = at(a + 1, b + 1);
      // y up, x east, z south: counter-clockwise seen from above is (p00, p01, p10)
      if ((a + b) & 1) idx.push(p00, p01, p10, p10, p01, p11);
      else idx.push(p00, p01, p11, p00, p11, p10);
    }
  }
  const sk = (e, k) => skirtStart + e * nv + k;
  for (let k = 0; k < n; k++) {
    // north edge: outward is -z
    idx.push(at(k, 0), at(k + 1, 0), sk(0, k), sk(0, k), at(k + 1, 0), sk(0, k + 1));
    // south edge: outward +z
    idx.push(at(k + 1, n), at(k, n), sk(1, k + 1), sk(1, k + 1), at(k, n), sk(1, k));
    // west edge: outward -x
    idx.push(at(0, k + 1), at(0, k), sk(2, k + 1), sk(2, k + 1), at(0, k), sk(2, k));
    // east edge: outward +x
    idx.push(at(n, k), at(n, k + 1), sk(3, k), sk(3, k), at(n, k + 1), sk(3, k + 1));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('ground', new THREE.BufferAttribute(gnd, 4, true));
  geo.setIndex(total > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function buildCityTerrain(scene) {
  const group = new THREE.Group();
  group.name = 'Terrain';
  scene.add(group);
  const material = createTerrainMaterial();
  const chunks = [];
  for (let cj0 = 0; cj0 < H - 1; cj0 += CHUNK) {
    for (let ci0 = 0; ci0 < W - 1; ci0 += CHUNK) {
      // skip chunks that are all water (the Bay plane covers them)
      let land = false, lo = Infinity, hi = -Infinity;
      for (let j = cj0; j <= Math.min(H - 1, cj0 + CHUNK) && !land; j += 2) {
        for (let i = ci0; i <= Math.min(W - 1, ci0 + CHUNK); i += 2) {
          if (CLS[j * W + i] !== GROUND.WATER) { land = true; break; }
        }
      }
      if (!land) continue;
      for (let j = cj0; j <= Math.min(H - 1, cj0 + CHUNK); j++) {
        for (let i = ci0; i <= Math.min(W - 1, ci0 + CHUNK); i++) {
          const h = HGT[j * W + i];
          if (h < lo) lo = h;
          if (h > hi) hi = h;
        }
      }
      const box = new THREE.Box3(
        new THREE.Vector3(X0 + ci0 * RES, lo - 4, Z0 + cj0 * RES),
        new THREE.Vector3(X0 + (ci0 + CHUNK + 1) * RES, hi + 1, Z0 + (cj0 + CHUNK + 1) * RES)
      );
      const mesh = new THREE.Mesh(buildChunkGeometry(ci0, cj0, LOD_STEPS[4]), material);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.name = `terrain_${ci0 / CHUNK}_${cj0 / CHUNK}`;
      group.add(mesh);
      chunks.push({ ci0, cj0, box, mesh, lod: 4, geos: [null, null, null, null, mesh.geometry] });
    }
  }

  const _p = new THREE.Vector3();
  // Swap each chunk to the level its distance asks for, building missing levels nearest-first within a time budget
  function update(cameraPos, budgetMs = 6) {
    const t0 = performance.now();
    const wants = [];
    for (const c of chunks) {
      const d = c.box.distanceToPoint(_p.copy(cameraPos));
      let lod = 0;
      while (lod < 4 && d > LOD_DIST[lod]) lod++;
      c.dist = d;
      if (lod !== c.lod) wants.push([c, lod]);
    }
    wants.sort((a, b) => a[0].dist - b[0].dist);
    for (const [c, lod] of wants) {
      if (!c.geos[lod]) {
        // the ground right around the camera can't wait (teleports, scenic cameras): the coarse levels would put the
        // camera inside a hill
        if (performance.now() - t0 > budgetMs && c.dist > 300) continue;
        c.geos[lod] = buildChunkGeometry(c.ci0, c.cj0, LOD_STEPS[lod]);
      }
      c.mesh.geometry = c.geos[lod];
      c.lod = lod;
      // free fine levels nobody is near any more
      for (let l = 0; l < 2; l++) {
        if (l < lod - 1 && c.geos[l] && c.dist > LOD_DIST[l + 1] * 1.5) {
          c.geos[l].dispose();
          c.geos[l] = null;
        }
      }
    }
  }
  /** Build every chunk around a point at its final level right away (boot, teleports) */
  function prime(cameraPos) {
    for (let i = 0; i < 4; i++) update(cameraPos, 1e9);
  }
  return { group, chunks, update, prime };
}

// --- Water: the Bay & the ocean (one plane), each lake at its own level ---------------------------------------------
function buildWater(scene) {
  const group = new THREE.Group();
  group.name = 'Water';
  scene.add(group);
  const material = createWaterMaterial();
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(90000, 90000, 1, 1).rotateX(-Math.PI / 2), material);
  sea.position.set(-2500, SEA_LEVEL, 2000);
  sea.receiveShadow = true;
  sea.name = 'Bay';
  group.add(sea);

  // Lakes: quads over their cells (grown by a cell so the visible shore is where the terrain rises through the water)
  for (const [level, x0, z0, x1, z1] of GEO.lakes) {
    if (level < SEA_LEVEL + 0.5) continue;
    const i0 = Math.max(0, Math.floor((x0 - X0) / RES) - 2), i1 = Math.min(W - 1, Math.ceil((x1 - X0) / RES) + 2);
    const j0 = Math.max(0, Math.floor((z0 - Z0) / RES) - 2), j1 = Math.min(H - 1, Math.ceil((z1 - Z0) / RES) + 2);
    const pos = [];
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        let wet = false;
        for (let dj = -1; dj <= 1 && !wet; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di, jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
            if (CLS[jj * W + ii] === GROUND.WATER && HGT[jj * W + ii] < level) { wet = true; break; }
          }
        }
        if (!wet) continue;
        const xa = X0 + i * RES, xb = xa + RES, za = Z0 + j * RES, zb = za + RES;
        pos.push(xa, level, za, xa, level, zb, xb, level, za, xb, level, za, xa, level, zb, xb, level, zb);
      }
    }
    if (!pos.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const n = new Float32Array(pos.length);
    for (let k = 1; k < n.length; k += 3) n[k] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    const lake = new THREE.Mesh(geo, material);
    lake.receiveShadow = true;
    lake.name = 'Lake';
    group.add(lake);
  }
  return group;
}

// --- The Bay ring: hills around the Bay from the 32 m grid, sampled every 64 m --------------------------------------
function buildBayRing(scene) {
  const STEP = 2;
  const nx = Math.floor((BAY.w - 1) / STEP) + 1, nz = Math.floor((BAY.h - 1) / STEP) + 1;
  const pos = new Float32Array(nx * nz * 3);
  const gnd = new Uint8Array(nx * nz * 4);
  const cityX1 = X0 + W * RES, cityZ1 = Z0 + H * RES;
  const keep = new Uint8Array(nx * nz);
  for (let b = 0; b < nz; b++) {
    for (let a = 0; a < nx; a++) {
      const x = BAY.x0 + (a * STEP + 0.5) * BAY.res, z = BAY.z0 + (b * STEP + 0.5) * BAY.res;
      let y = bayHeight(x, z);
      let land = y > SEA_LEVEL + 0.6;
      // inside the city grid the 4 m city terrain (and its water) takes over: keep only land far from the city's own
      if (land && x > X0 && x < cityX1 && z > Z0 && z < cityZ1) {
        for (const [dx, dz] of [[0, 0], [70, 0], [-70, 0], [0, 70], [0, -70]]) if (groundAt(x + dx, z + dz) !== GROUND.WATER) land = false;
      }
      if (!land) y = Math.min(y, SEA_LEVEL - 12);
      const v = b * nx + a;
      keep[v] = land ? 1 : 0;
      pos[v * 3] = x;
      pos[v * 3 + 1] = y;
      pos[v * 3 + 2] = z;
      gnd[v * 4 + 1] = 200; // park-ish scrub & grass
    }
  }
  const idx = [];
  for (let b = 0; b < nz - 1; b++) {
    for (let a = 0; a < nx - 1; a++) {
      const p00 = b * nx + a, p10 = p00 + 1, p01 = p00 + nx, p11 = p01 + 1;
      if (!(keep[p00] || keep[p10] || keep[p01] || keep[p11])) continue;
      idx.push(p00, p01, p11, p00, p11, p10);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('ground', new THREE.BufferAttribute(gnd, 4, true));
  geo.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, createTerrainMaterial());
  mesh.name = 'BayRing';
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function buildGround(scene) {
  const terrain = buildCityTerrain(scene);
  const water = buildWater(scene);
  const bayRing = buildBayRing(scene);
  return { terrain, water, bayRing, update: (cam) => terrain.update(cam), prime: (cam) => terrain.prime(cam) };
}

export { buildGround, heightAt };
