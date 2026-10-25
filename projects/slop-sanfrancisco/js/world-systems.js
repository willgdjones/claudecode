import { buildStreetscape } from './streetscape.js';
import { buildRoadPaint } from './road-paint.js';
import { buildStreetDetails } from './street-details.js';
import { createTrafficSystem } from './traffic.js';
import { CityAudioSystem } from './audio-system.js';
import { SFMapSystem } from './sf-map.js';

// js/world-systems.js
// The living street layer on top of the ground & buildings: curbs & sidewalks, road paint, street furniture, traffic &
// pedestrians, the city's sound and the street atlas. Each comes from its own module; this file wires them up for
// main.js. The near-camera layers (curbs & sidewalks, road paint) are built in tiles around the camera by update().

const noop = () => {};

function createWorldSystems(scene) {
  const streetscape = buildStreetscape(scene);
  const trafficSystem = createTrafficSystem(scene);
  const roadPaint = buildRoadPaint(scene, trafficSystem.network);
  const streetDetails = buildStreetDetails(scene, trafficSystem.network);
  // San Francisco's freeways carry no simulated traffic yet: an empty stand-in for the audio sources
  const highwayTraffic = { cars: [], update: noop };
  return {
    streetscape,
    roadPaint,
    streetDetails,
    trafficSystem,
    highwayTraffic,
    // Tiles of curbs, sidewalks & road paint around (x, z); force builds every missing tile at once (boot, teleports)
    update(x, z, force = false) {
      streetscape.update(x, z, force ? Infinity : 2);
      roadPaint.update(x, z, force ? Infinity : 2);
    },
    createAudio(deps, options) {
      return new CityAudioSystem(deps, options);
    },
    createMap(deps) {
      // ?nomap: no radar or atlas (tests that time the 3D view alone)
      if (new URLSearchParams(location.search).has('nomap')) {
        return { waypoint: null, isFullMapOpen: false, toggleFullMap: noop, resizeFullCanvas: noop, renderFullMap: noop, update: noop };
      }
      return new SFMapSystem(deps);
    }
  };
}

export { createWorldSystems };
