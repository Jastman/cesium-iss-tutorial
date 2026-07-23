# ISS Live Tracker

A beginner-friendly [CesiumJS](https://cesium.com/platform/cesiumjs/) app that
renders a Cesium ion-hosted 3D model of the International Space Station at its
live location and animates a smooth orbit around Earth.

![ISS orbit around Earth](tutorial-assets/part-8-overlay.png)

Built as the companion project for the
[Build a Live ISS Tracker with CesiumJS tutorial](./TUTORIAL.md). A shareable
Word version is also available in
[`CesiumJS_101_ISS_Tracker_Tutorial.docx`](./CesiumJS_101_ISS_Tracker_Tutorial.docx).

## How it works

- [Open Notify](http://open-notify.org/Open-Notify-API/ISS-Location-Now/)
  supplies the verified live latitude, longitude, and timestamp.
- [CelesTrak](https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE)
  supplies the current ISS two-line element set.
- [satellite.js](https://github.com/shashwatak/satellite.js) propagates the
  orbit with SGP4.
- The app calibrates the complete propagated orbit to the live position before
  creating Cesium samples. It does not inject an outlier into an interpolated
  path, so the trajectory stays smooth and physically plausible.
- Cesium ion streams the 3D ISS glTF/GLB model.

## Stack

- [Vite](https://vitejs.dev/) 5
- [CesiumJS](https://cesium.com/platform/cesiumjs/) 1.122
- [satellite.js](https://github.com/shashwatak/satellite.js) 5
- Plain JavaScript ES modules

## Quickstart

```bash
git clone <this-repo>
cd cesium-iss-tutorial
npm install
cp .env.example .env
# Add your Cesium ion token to .env.
npm run dev
```

Open the URL printed by Vite, normally <http://localhost:5173/>.

### Cesium ion token

Get a token from [ion.cesium.com/tokens](https://ion.cesium.com/tokens), then
add the real value only to your local `.env`:

```dotenv
VITE_CESIUM_ION_TOKEN=your_actual_token
```

Do not put a real token in `.env.example`. Local `.env` files are ignored by
Git.

### ISS model asset

The app currently uses Cesium ion asset ID `5085257`. To use a different model:

1. Upload an ISS `.gltf` or `.glb` file to
   [Cesium ion](https://ion.cesium.com/).
2. Process it as a model, not as 3D Tiles.
3. Copy its numeric asset ID.
4. Replace `5085257` in [`src/main.js`](src/main.js).

![Uploading an ISS model to Cesium ion](tutorial-assets/part-6-ion-add-data.gif)

![ISS model displayed on its orbit](tutorial-assets/part-6-model-on-orbit.png)

## Scripts

```bash
npm run dev       # Start the local Vite server.
npm run build     # Build the production bundle in dist/.
npm run preview   # Preview the production bundle with Vite.
```

## Project layout

```text
src/
  main.js       Cesium viewer, clock, entity, camera, and info box
  iss.js        Live-position loading, TLE parsing, SGP4, and calibration
  style.css     Full-window Cesium viewer styles
tutorial-assets/
  ...           Images used by this README and the tutorial
.env.example    Safe environment-variable template
TUTORIAL.md     Complete beginner tutorial
vite.config.js  Cesium plugin and local data proxies
```

## Data and deployment

During `npm run dev` and `npm run preview`, Vite proxies:

- `/api/iss-now` to Open Notify; and
- `/api/iss-tle` to CelesTrak.

This avoids mixed-content and CORS failures in the browser. A production host
must provide equivalent server-side or serverless proxy routes. A static host
such as GitHub Pages cannot provide these routes by itself.

## More screenshots

| Cesium globe | Orbit path |
| --- | --- |
| ![Initial Cesium globe](tutorial-assets/part-2-globe.png) | ![ISS orbit path](tutorial-assets/part-5-orbit-ring.png) |

| Cesium ion asset | Tracked ISS view |
| --- | --- |
| ![Cesium ion ISS asset](tutorial-assets/part-6-ion-asset-detail.png) | ![Tracked ISS](tutorial-assets/part-7-tracked.png) |

## License

MIT
