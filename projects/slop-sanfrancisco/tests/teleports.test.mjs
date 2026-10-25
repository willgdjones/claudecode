// Teleport presets and arrivals on the real San Francisco data: the terrain, the 175,000 building footprints and the
// production controller's clearance search (without constructing the 3D models).
import './helpers/sf-env.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const { TELEPORT_LOCATIONS, ISLAND_BOUNDS, LANDMARK, getLocationLabel, lonLatToWorld } = await import('../js/city-config.js');
const { heightAt, isWater, gradeAlong } = await import('../js/terrain.js');
const { buildCityBlocks, buildingAt } = await import('../js/buildings.js');
const { ThirdPersonControllerManager } = await import('../js/controllers.js');

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const { colliders } = buildCityBlocks({ add() {} });
const MODES = ['person', 'car', 'cyclist', 'helicopter'];

// The production controller with stand-ins for the parts of each entity that teleporting touches.
function controllerFor(mode) {
  const controller = Object.create(ThirdPersonControllerManager.prototype);
  controller.keys = Object.fromEntries(['forward', 'backward', 'left', 'right', 'up', 'down', 'boost'].map((a) => [a, false]));
  controller._pressedCodes = new Set();
  controller.colliders = colliders;
  controller._colliderCells = null;
  const position = (x = 0, y = 0, z = 0) => ({ x, y, z, copy(p) { this.x = p.x; this.y = p.y; this.z = p.z; } });
  const pivot = () => ({ position: position(), rotation: { x: 0, y: 0, z: 0 } });
  const chase = { person: [4.3, 1.95], car: [6.9, 2.12], cyclist: [4.8, 2.05], helicopter: [11.4, 3.3] };
  // Park the entity off in the far corner so it never blocks its own arrival.
  const ent = {
    type: mode, chaseDistance: chase[mode][0], chaseHeight: chase[mode][1],
    position: position(ISLAND_BOUNDS.minX, 0, ISLAND_BOUNDS.minZ), heading: 0, speed: 0, mesh: pivot(),
    chassisPivot: pivot(), wheels: [], leanPivot: pivot(), tiltPivot: pivot(),
    rig: { reset() {} }, crowd: { begin() {}, add() {}, end() {} }
  };
  controller.activeMode = mode;
  controller.entities = { [mode]: ent };
  return { controller, ent };
}

test('every teleport button has a destination with a heading, on land inside the city', () => {
  const buttons = [...read('index.html').matchAll(/data-teleport="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(Object.keys(TELEPORT_LOCATIONS).sort(), buttons.sort());
  for (const [name, point] of Object.entries(TELEPORT_LOCATIONS)) {
    assert.ok(Number.isFinite(point.heading), `${name} has a heading`);
    assert.ok(point.x > ISLAND_BOUNDS.minX && point.x < ISLAND_BOUNDS.maxX, `${name} x is inside the city`);
    assert.ok(point.z > ISLAND_BOUNDS.minZ && point.z < ISLAND_BOUNDS.maxZ, `${name} z is inside the city`);
    assert.equal(isWater(point.x, point.z), false, `${name} is on land`);
    assert.ok(Number.isFinite(heightAt(point.x, point.z)), `${name} has terrain`);
  }
});

// Presets whose own point lies inside a building footprint (see the report): the controller still relocates the
// arrival to the nearest clear spot (checked below), but the preset should name a clear street-level spot.
for (const [name, point] of Object.entries(TELEPORT_LOCATIONS)) {
  test(`the ${name} preset itself is clear of building footprints`, () => {
    assert.equal(buildingAt(point.x, point.z), null);
  });
}

for (const mode of MODES) {
  test(`${mode} teleports to every preset arrive above the ground, on land and outside every building`, () => {
    for (const [name, point] of Object.entries(TELEPORT_LOCATIONS)) {
      const { controller, ent } = controllerFor(mode);
      const arrival = controller.teleportActiveTo(point.x, point.z, point.heading);
      assert.ok(Math.hypot(arrival.x - point.x, arrival.z - point.z) < 60, `${name}: arrives near the preset`);
      assert.equal(ent.heading, point.heading, `${name}: keeps the preset heading`);
      const ground = heightAt(arrival.x, arrival.z);
      assert.ok(ent.position.y >= ground - 0.01, `${name}: y ${ent.position.y} is above the ground ${ground}`);
      if (mode === 'helicopter') {
        assert.ok(ent.position.y > ground + 50, `${name}: the helicopter arrives in the air`);
      } else {
        assert.ok(ent.position.y < ground + 0.5, `${name}: ground modes stand on the terrain`);
        assert.equal(isWater(arrival.x, arrival.z), false, `${name}: arrives on land`);
        assert.equal(buildingAt(arrival.x, arrival.z), null, `${name}: arrives outside every footprint`);
      }
      // Movement clearance agrees: the first collision pass leaves the arrival where it is.
      const before = [ent.position.x, ent.position.z];
      const radius = mode === 'helicopter' ? 4.5 : mode === 'person' ? 0.48 : mode === 'car' ? 1.35 : 0.65;
      controller.resolveHorizontalCollision(ent.position, radius, mode === 'car' ? ent : null);
      assert.deepEqual([ent.position.x, ent.position.z], before, `${name}: ${mode} is already collision-free`);
    }
  });
}

test('Twin Peaks arrives high above the city, facing downtown', () => {
  const point = TELEPORT_LOCATIONS.twinpeaks;
  assert.ok(heightAt(point.x, point.z) > 200, 'Christmas Tree Point is high on Twin Peaks');
  // Downtown (Market & Powell is the world origin) lies to the north-east.
  const toDowntown = Math.atan2(-point.x, -point.z);
  const diff = Math.abs(Math.atan2(Math.sin(toDowntown - point.heading), Math.cos(toDowntown - point.heading)));
  assert.ok(diff < Math.PI / 6, `heading is ${(diff * 180 / Math.PI).toFixed(0)} degrees off downtown`);
});

test('Coit Tower arrives below the tower on Telegraph Hill', () => {
  const point = TELEPORT_LOCATIONS.coit;
  const tower = lonLatToWorld(-122.4058, 37.8024);
  const distance = Math.hypot(tower.x - point.x, tower.z - point.z);
  assert.ok(distance > 50 && distance < 250, 'leave space for the tower view');
  assert.ok(heightAt(point.x, point.z) > 30, 'up on Telegraph Hill');
  assert.ok(gradeAlong(point.x, point.z, Math.sin(point.heading), Math.cos(point.heading), 20) > 0.05, 'looking up the hill to the tower');
});

test('Crissy Field arrives at the shore facing the Golden Gate Bridge', () => {
  const point = TELEPORT_LOCATIONS.crissy;
  const bridge = LANDMARK.ggbridge;
  const distance = Math.hypot(bridge.x - point.x, bridge.z - point.z);
  const alignment = ((bridge.x - point.x) * Math.sin(point.heading) + (bridge.z - point.z) * Math.cos(point.heading)) / distance;
  assert.ok(alignment > 0.98, 'face the bridge');
  assert.ok(heightAt(point.x, point.z) < 10, 'down at the waterfront');
});

test('preset and map teleports share arrival resets and mark the resolved landing point', () => {
  const main = read('js/main.js');
  const start = main.indexOf('  function teleportTo(');
  const end = main.indexOf('  const openMapBtn', start);
  assert.ok(start > 0 && end > start, 'the teleport flow is present in main.js');
  const handlers = new Map();
  const calls = [];
  const landed = { x: -305.7, z: 5210 };
  let map;
  const environment = {
    TELEPORT_LOCATIONS,
    ground: { prime: (p) => calls.push(['ground', p.x, p.z]) },
    cityBlocks: { update: (...args) => calls.push(['buildings', ...args]) },
    world: {
      update: (...args) => calls.push(['world', ...args]),
      createMap(options) { map = { onTeleport: options.onTeleport, waypoint: null }; return map; }
    },
    controllerManager: {
      teleportActiveTo: (...args) => { calls.push(['teleport', ...args]); return landed; },
      resetInput() {}
    },
    touchControls: { reset: () => calls.push(['touch']) },
    gamepadControls: { reset: () => calls.push(['gamepad']) },
    cameraSystem: { resetForTeleport: () => calls.push(['camera']) },
    selectCamera: (...args) => calls.push(['selectCamera', ...args]),
    getLocationLabel: (x, z) => `${x}, ${z}`,
    trafficSystem: {},
    teleportButtons: Object.keys(TELEPORT_LOCATIONS).map((key) => ({
      getAttribute: () => key,
      addEventListener: (_event, handler) => handlers.set(key, handler)
    })),
    closePopovers: () => {}
  };
  vm.runInNewContext(main.slice(start, end), environment);
  for (const [name, point] of Object.entries(TELEPORT_LOCATIONS)) {
    calls.length = 0;
    handlers.get(name)();
    assert.deepEqual(calls, [
      ['ground', point.x, point.z], ['buildings', point.x, point.z, true], ['world', point.x, point.z, true],
      ['teleport', point.x, point.z, point.heading], ['touch'], ['gamepad'], ['camera'], ['selectCamera', 'chase', true]
    ]);
    assert.equal(map.waypoint.x, landed.x);
    assert.equal(map.waypoint.z, landed.z);
  }
  map.waypoint = { x: 100, z: 200, name: 'inside a building' };
  map.onTeleport(100, 200);
  assert.equal(map.waypoint.x, landed.x, 'map marker follows the safe position returned by the controller');
  assert.equal(map.waypoint.z, landed.z);
  assert.equal(map.waypoint.name, `${landed.x}, ${landed.z}`);
});

test('arrival labels name a real place for every preset', () => {
  for (const [name, point] of Object.entries(TELEPORT_LOCATIONS)) {
    const label = getLocationLabel(point.x, point.z);
    assert.equal(typeof label, 'string');
    assert.ok(label.length > 2 && label !== 'San Francisco Bay' && label !== 'Pacific Ocean', `${name}: ${label}`);
  }
});
