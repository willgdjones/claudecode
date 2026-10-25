// js/world-systems.js
// The living street layer on top of the ground & buildings: street furniture, traffic & pedestrians, the city's sound
// and the street atlas. Each comes from its own module; this file wires them up for main.js.
// (Bring-up: systems still being ported to San Francisco are no-op stand-ins with the same interface.)

const noop = () => {};

function createWorldSystems(/* scene, { ground, cityBlocks } */) {
  const streetDetails = { footprints: [], signalClock: null, update: null };
  const trafficSystem = { update: noop, network: null };
  const highwayTraffic = { update: noop };
  return {
    streetDetails,
    trafficSystem,
    highwayTraffic,
    createAudio(deps, { onStateChange } = {}) {
      const audio = { supported: false, enabled: false, ready: false, setEnabled: noop, honk: noop, update: noop, dispose: noop };
      if (onStateChange) queueMicrotask(onStateChange);
      return audio;
    },
    createMap() {
      return { waypoint: null, isFullMapOpen: false, toggleFullMap: noop, resizeFullCanvas: noop, renderFullMap: noop, update: noop };
    }
  };
}

export { createWorldSystems };
