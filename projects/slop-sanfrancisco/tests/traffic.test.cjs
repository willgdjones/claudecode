const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../js/traffic.js'), 'utf8');
function trafficFunction(name, context) {
  const match = source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`));
  assert.ok(match, `${name} is present`);
  return vm.runInNewContext(`(${match[0].trim()})`, context);
}

// The player as traffic sees it: active on the ground (on any hill), ignored in the air or in the helicopter.
const playerActive = source.match(/    player\.active = [^\n]*;/)?.[0];
assert.ok(playerActive, 'traffic player activity test is present');
function playerHarness(heightAt = () => 0) {
  const player = { active: false, entity: null, x: 0, z: 0, vx: 0, vz: 0, halfW: 0.86, halfL: 2.18, push: 0.5 };
  const context = { player, heightAt, LOOKAHEAD: 70 };
  const activate = vm.runInNewContext(`(function (playerEntity, activeMode) {\n${playerActive}\n})`, context);
  return {
    player,
    activate,
    relateToPlayer: trafficFunction('relateToPlayer', context),
    playerGap: trafficFunction('playerGap', context)
  };
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);
}

test('street traffic sees a player on the street at any elevation, including the curb and steep hills', () => {
  const hill = (x, z) => 40 + z * 0.3; // a 30% grade
  const { player, activate } = playerHarness(hill);
  for (const [z, lift] of [[0, 0], [50, 0.22], [-80, 1.1]]) {
    activate({ position: { x: 10, y: hill(10, z) + lift, z } }, 'car');
    assert.equal(player.active, true, `on the hillside at z=${z}`);
  }
  activate({ position: { x: 10, y: hill(10, 0) + 7.6, z: 0 } }, 'person');
  assert.equal(player.active, false, 'a player on a roof or bridge deck above the street is not in the lane');
  activate({ position: { x: 10, y: hill(10, 0), z: 0 } }, 'helicopter');
  assert.equal(player.active, false, 'helicopters are ignored even when landed');
  activate(null, 'car');
  assert.equal(player.active, false);
});

test('vehicles measure the player ahead in their own lane and how fast it moves their way', () => {
  const { player, relateToPlayer, playerGap } = playerHarness();
  Object.assign(player, { active: true, x: 0, z: 30, vx: 0, vz: 10, halfW: 0.86, halfL: 2.18 });
  const car = { x: 0, z: 0, yaw: 0, half: 2.25, halfWidth: 0.9 };
  relateToPlayer(car);
  close(car.pAhead, 30);
  close(car.pRight, 0);
  close(car.pSpeed, 10);
  close(playerGap(car, 0), 30 - 2.25 - 2.18);
  assert.equal(playerGap(car, 3.2), Infinity, 'a player in the next lane does not block this one');

  car.yaw = Math.PI; // facing away: the player is behind
  relateToPlayer(car);
  close(car.pAhead, -30);
  assert.equal(car.pSpeed, 0, 'only motion along the vehicle counts');
  assert.equal(playerGap(car, 0), Infinity);

  player.active = false;
  relateToPlayer(car);
  assert.equal(car.pAhead, Infinity);
  player.active = true;
  player.z = 500;
  relateToPlayer(car);
  assert.equal(car.pAhead, Infinity, 'distant players are not considered');
});

function intersectionHarness() {
  const n = { signal: true, in: [] };
  const exit = { lanes: [0], outSide: 1 };
  const edge = { to: n, axisIndex: 0, occ: [[]], opposite: null, inSide: 0, len: 100 };
  const car = { edge, move: { to: exit, out: [0], turn: 'S' }, lane: 0, s: 80, speed: 4,
    driver: { b: 3 }, half: 2.25, wait: 0, commit: null, isPolice: false };
  const state = { phase: 'red', occupied: false, pedestrians: false, space: true, conflict: false };
  const context = {
    LOOKAHEAD: 70,
    phaseOf: () => state.phase,
    canStopBefore: () => true,
    stopAt: () => -3,
    boxBusy: () => state.occupied,
    ahead: () => null,
    connector: () => ({ len: 20 }),
    yieldToCrossTraffic: () => state.conflict,
    pedestrianOn: () => state.pedestrians,
    laneCoord: () => 0,
    timeTo: () => 1,
    room: () => state.space,
    alongside: () => false,
    mergingAhead: () => null
  };
  return { car, state, mayEnter: trafficFunction('mayEnter', context), signalAhead: trafficFunction('signalAhead', context) };
}

test('police pass red and amber signals while ordinary cars stop', () => {
  const { car, state, mayEnter, signalAhead } = intersectionHarness();
  for (const phase of ['red', 'amber']) {
    state.phase = phase;
    car.isPolice = false;
    assert.equal(mayEnter(car, 18), false);
    assert.equal(signalAhead(car, car.edge, 18), -3);
    car.isPolice = true;
    assert.equal(mayEnter(car, 18), true);
    assert.equal(signalAhead(car, car.edge, 18), 0);
  }
});

test('police still wait for crossing traffic, pedestrians and a blocked exit', () => {
  const { car, state, mayEnter } = intersectionHarness();
  car.isPolice = true;
  for (const [key, blocked] of [['occupied', true], ['pedestrians', true], ['space', false], ['conflict', true]]) {
    const initial = state[key];
    state[key] = blocked;
    assert.equal(mayEnter(car, 18), false, key);
    state[key] = initial;
  }
  assert.equal(mayEnter(car, 18), true);
});

test('police running a red yield to fast cross traffic regardless of how long they waited', () => {
  const car = { edge: { axisIndex: 0 }, wait: 20 };
  const lead = { s: 85, v: { speed: 10 } };
  const side = { axisIndex: 1, occ: [[lead]], len: 100 };
  const node = { signal: true, in: [{ axisIndex: 0, occ: [[lead]] }, side] };
  const context = {
    leadOf: (list) => list.at(-1),
    canStopBefore: () => true
  };
  lead.v.half = 2.25;
  context.canStop = trafficFunction('canStop', context);
  const yieldToCrossTraffic = trafficFunction('yieldToCrossTraffic', context);
  assert.equal(yieldToCrossTraffic(car, node), true);
  lead.v.speed = 0;
  assert.equal(yieldToCrossTraffic(car, node), false);
  lead.v.speed = 10;
  lead.s = 10;
  assert.equal(yieldToCrossTraffic(car, node), false);
});

test('left turns account for oncoming police even when their signal is red', () => {
  const edge = { to: { signal: true }, through: 0, len: 100, occ: [] };
  const car = { edge, move: { turn: 'S', out: [0] }, lane: 0, speed: 10, half: 2.25, isPolice: false };
  edge.occ.push([{ v: car, s: 85 }]);
  const context = { phaseOf: () => 'red', leadOf: (list) => list.at(-1) };
  context.canStop = trafficFunction('canStop', context);
  const yieldOncoming = trafficFunction('yieldOncoming', context);
  assert.equal(yieldOncoming(edge, false), false);
  car.isPolice = true;
  assert.equal(yieldOncoming(edge, false), true);
  car.speed = 0;
  assert.equal(yieldOncoming(edge, false), false);
});

function populationContext() {
  const context = {
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)),
    hasView: true, camX: 0, camY: 10, camZ: 0, visible: () => true,
    focusX: 0, focusZ: 0, player: { active: false },
    clock: 0,
    VEHICLE_SPAWN_DISTANCE: 250, PED_SPAWN_DISTANCE: 150, NEAR_RADIUS: 350,
    nearEdges: [], nearSignals: [], track: {}, KERB: 1.6, QUEUE_GAP: 0.62,
    atCurb: () => {}, laneClear: () => true,
    place: (v, e, lane, s) => Object.assign(v, { edge: e, lane, s })
  };
  context.nearView = trafficFunction('nearView', context);
  return context;
}

function straightEdge(z, len = 20) {
  return { sx: 0, sz: z, dx: 0, dz: 1, rx: -1, rz: 0, len, lanes: [0], occ: [[]] };
}

test('cars replenish the road ahead while nearby visible spawning stays blocked', () => {
  const context = populationContext();
  const edge = straightEdge(140);
  context.nearEdges.push(edge);
  const spawnVehicle = trafficFunction('spawnVehicle', context);
  const car = { half: 2.25 };
  assert.equal(spawnVehicle(car, 100, 350, true), false);
  edge.sz = 290;
  assert.equal(spawnVehicle(car, 100, 350, true), true);
  assert.equal(edge.sz + car.s, 300);
  edge.sz = 140;
  context.visible = () => false;
  assert.equal(spawnVehicle(car, 100, 350, true), true);
});

test('pedestrians replenish visible sidewalks ahead without appearing nearby', () => {
  const context = populationContext();
  context.nearEdges.push(straightEdge(0));
  let z = 100;
  context.sidewalkTrack = () => {
    Object.assign(context.track, { ax: 0, az: z - 10, ux: 0, uz: 1, len: 20, node: null });
    return true;
  };
  const spawnPed = trafficFunction('spawnPed', context);
  const ped = { crossesStreets: false, speed: 1.4, rig: {} };
  assert.equal(spawnPed(ped, 60, 280, true), false);
  z = 220;
  assert.equal(spawnPed(ped, 60, 280, true), true);
  assert.equal(ped.z, 220);
  assert.equal(ped.v, ped.speed);
});

test('long roads are available near their ends and spawn only in the local section', () => {
  const context = populationContext();
  const edge = straightEdge(100, 2000);
  Object.assign(context, { edges: [edge, straightEdge(2000)], nodes: [], nearX: Infinity, nearZ: Infinity });
  trafficFunction('refreshNear', context)();
  assert.deepEqual(context.nearEdges, [edge]);
  const car = { half: 2.25 };
  assert.equal(trafficFunction('spawnVehicle', context)(car, 0, 350, false), true);
  assert.ok(edge.sz + car.s <= 350);
  assert.ok(car.s >= car.half + 5);
});

test('crossing pedestrians fall back to a sidewalk when nearby crosswalks are unusable', () => {
  const context = populationContext();
  context.nearSignals.push({});
  context.nearEdges.push(straightEdge(200));
  let crossings = 0;
  context.crosswalkTrack = () => { crossings++; return false; };
  context.sidewalkTrack = () => {
    Object.assign(context.track, { ax: 0, az: 200, ux: 0, uz: 1, len: 20, node: null });
    return true;
  };
  const ped = { crossesStreets: true, speed: 1.4, rig: {} };
  assert.equal(trafficFunction('spawnPed', context)(ped, 60, 280, true), true);
  assert.equal(crossings, 5);
  assert.equal(ped.node, null);
  assert.equal(ped.z, 210);
});
