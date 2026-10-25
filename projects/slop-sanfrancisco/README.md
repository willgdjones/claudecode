# Slop San Francisco

A San Francisco city simulation built with [three.js](https://threejs.org/), WebGPURenderer and TSL: the whole city on its
real hills, on foot, by cab, by bicycle or by helicopter, from the Golden Hour to the Marine Layer.

A fork of mrdoob's [Slop New York](https://mrdoob.github.io/slop-newyork/), rebuilt on San Francisco's own data:

- **Terrain**: the USGS 3DEP 1 m lidar DEM, resampled to a 4 m heightfield with every street graded level across its
  width (and one height per intersection). The hills keep their real grades: Filbert St really is 31%.
- **Buildings**: all ~175,000 DataSF building footprints with their lidar roof heights. Painted wood & stucco
  rowhouses with bay windows, brick warehouses, glass towers. Each style is set by the zoning map.
- **Streets**: the DataSF street centrelines become the traffic network: lanes, signals, crosswalks, curbs and
  sidewalks traced from the parcel map, plus 130,000 street trees from the Street Tree Inventory.
- **The Bay**: a low-poly ring of Marin, the islands and the East Bay hills from the USGS 1/3″ DEM.
- **Marine Layer**: a fifth time of day with low fog, where Twin Peaks and the towers rise above the clouds.

Keys: WASD / arrows to move, 1–4 to switch between walking, cab, bike and helicopter, V for the next camera, 8 / 9 / 0
for the Golden Gate / Twin Peaks / Lombard views, M for the map, N for sound.

## Running it

No build step: serve the folder (`python3 -m http.server`) and open `index.html`. WebGPU is preferred and WebGL2 is
the fallback (`?webgl` forces it). For automated runs, `?nopost` skips post-processing and `?nocrowd` hides the
GPU-skinned crowd, which software renderers draw as garbage. `?nomap` turns off the radar and atlas, and
`?hide=Name,…` hides top-level scene objects by name prefix (for profiling).

Tests: `npm install && npm test`.

## Rebuilding the data

The built data in `data/` (~17 MB) is committed. To rebuild it from the sources:

```sh
bash tools/fetch-data.sh            # downloads into tools/raw/ (gitignored): DataSF, USGS 3DEP, optional OSM
cd tools && npm install && cd ..
node --max-old-space-size=8192 tools/build-geodata.mjs
```

## License and data

The project code is available under the [MIT License](LICENSE), as is Slop New York, which it is forked from
(© Mr.doob).

Geographic data: [DataSF](https://datasf.org/) (City and County of San Francisco, PDDL), USGS 3D Elevation Program
(public domain), and © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL) where used.
Third-party data and dependencies retain their respective licenses.
