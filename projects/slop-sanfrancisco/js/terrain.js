import * as THREE from 'three/webgpu';
import { texture, vec2, float } from 'three/tsl';
import { GEO, TERRAIN, BAY } from './sf-data.js';

// js/terrain.js
// The ground under San Francisco: the 4 m graded heightfield (tools/geo-grade.mjs levelled every street across its
// width and gave each intersection one height, the hills keep their real grades), its ground classes and the Bay
// ring beyond the city. Every system that used to stand things on y = 0 asks heightAt(x, z) instead.

const SEA_LEVEL = GEO.seaLevel;
const G = { WATER: 0, ROAD: 1, OPEN: 2, LOT: 3, PARK: 4, SAND: 5 };
const { res: RES, x0: X0, z0: Z0, w: W, h: H, hgt: HGT, ground: GROUND } = TERRAIN;
const X1 = X0 + W * RES;
const Z1 = Z0 + H * RES;

// Lakes & ponds: [level, x0, z0, x1, z1] (their cells are ground class WATER above sea level)
const LAKES = GEO.lakes;

function bayHeight(x, z) {
  const fx = (x - BAY.x0) / BAY.res - 0.5;
  const fz = (z - BAY.z0) / BAY.res - 0.5;
  if (fx < 0 || fz < 0 || fx >= BAY.w - 1 || fz >= BAY.h - 1) return -20;
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const k = j * BAY.w + i, B = BAY.hgt;
  return (B[k] * (1 - tx) + B[k + 1] * tx) * (1 - tz) + (B[k + BAY.w] * (1 - tx) + B[k + BAY.w + 1] * tx) * tz;
}

/** Ground height (m above NAVD88) at world (x, z): bilinear on the city grid, the Bay ring beyond it */
function heightAt(x, z) {
  const fx = (x - X0) / RES - 0.5;
  const fz = (z - Z0) / RES - 0.5;
  if (fx < 0 || fz < 0 || fx >= W - 1 || fz >= H - 1) return bayHeight(x, z);
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const k = j * W + i;
  return (HGT[k] * (1 - tx) + HGT[k + 1] * tx) * (1 - tz) + (HGT[k + W] * (1 - tx) + HGT[k + W + 1] * tx) * tz;
}

/** Ground class of the 4 m cell under (x, z) (G.*); outside the city grid: water or open ground from the Bay ring */
function groundAt(x, z) {
  const i = Math.floor((x - X0) / RES), j = Math.floor((z - Z0) / RES);
  // (the Bay ring stores open water as 0 m, its land rounded to 0.5 m steps)
  if (i < 0 || j < 0 || i >= W || j >= H) return bayHeight(x, z) > 0.4 ? G.OPEN : G.WATER;
  return GROUND[j * W + i];
}

const isWater = (x, z) => groundAt(x, z) === G.WATER;

/** Water surface level at (x, z): a lake's own level inside its bounds, the Bay elsewhere */
function waterLevelAt(x, z) {
  for (const [level, x0, z0, x1, z1] of LAKES) if (x >= x0 && x <= x1 && z >= z0 && z <= z1 && level > SEA_LEVEL + 0.5) return level;
  return SEA_LEVEL;
}

/** Top of whatever is underfoot: the ground, or the water surface above a lake bed / the Bay floor */
function surfaceAt(x, z) {
  const h = heightAt(x, z);
  return isWater(x, z) ? Math.max(h, waterLevelAt(x, z)) : h;
}

/** Unit ground normal at (x, z) (central differences one cell apart) */
function normalAt(x, z, out = new THREE.Vector3()) {
  const d = RES;
  const hx = heightAt(x + d, z) - heightAt(x - d, z);
  const hz = heightAt(x, z + d) - heightAt(x, z - d);
  return out.set(-hx / (2 * d), 1, -hz / (2 * d)).normalize();
}

/** Ground height ahead minus behind over `span` metres along heading (sin, cos): rise per metre of travel */
function gradeAlong(x, z, sin, cos, span = 2) {
  return (heightAt(x + sin * span, z + cos * span) - heightAt(x - sin * span, z - cos * span)) / (2 * span);
}

const CITY_BOUNDS = { minX: X0, maxX: X1, minZ: Z0, maxZ: Z1 };

// ---------------------------------------------------------------------------------------------------------------------
// A 16 m copy of the heightfield for shaders (canyon sky occlusion, fog, wetness measured from the local ground)
// ---------------------------------------------------------------------------------------------------------------------
const TEX_RES = 16;
const terrainTexture = (() => {
  const step = TEX_RES / RES;
  const tw = Math.floor(W / step), th = Math.floor(H / step);
  const data = new Float32Array(tw * th);
  for (let j = 0; j < th; j++) {
    for (let i = 0; i < tw; i++) {
      let s = 0;
      for (let dj = 0; dj < step; dj++) for (let di = 0; di < step; di++) s += HGT[(j * step + dj) * W + i * step + di];
      data[j * tw + i] = Math.max(SEA_LEVEL, s / (step * step));
    }
  }
  const tex = new THREE.DataTexture(data, tw, th, THREE.RedFormat, THREE.FloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  tex.extent = { x0: X0, z0: Z0, w: tw * TEX_RES, h: th * TEX_RES };
  return tex;
})();

/** TSL: ground height under a world xz position (16 m resolution, never below sea level) */
function groundHeightNode(xz) {
  const e = terrainTexture.extent;
  const uvNode = vec2(xz.x.sub(e.x0).div(e.w), xz.y.sub(e.z0).div(e.h));
  return texture(terrainTexture, uvNode).r.max(float(SEA_LEVEL));
}

export {
  SEA_LEVEL,
  G as GROUND,
  LAKES,
  CITY_BOUNDS,
  heightAt,
  bayHeight,
  groundAt,
  isWater,
  waterLevelAt,
  surfaceAt,
  normalAt,
  gradeAlong,
  terrainTexture,
  groundHeightNode
};
