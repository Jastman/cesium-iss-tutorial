# Build a Live ISS Tracker with CesiumJS

In this beginner CesiumJS tutorial, you will build a 3D globe that:

- places a Cesium ion-hosted 3D ISS model at its verified live location;
- draws a smooth ISS orbit around Earth;
- animates the station at real speed; and
- displays its latitude, longitude, altitude, speed, and data sources.

The finished app uses:

- **CesiumJS** for the globe, clock, camera, entity, model, and path;
- **Cesium ion** to host and stream the ISS glTF/GLB model;
- **Open Notify** as the live latitude/longitude anchor;
- **CelesTrak** for the current ISS two-line element set (TLE); and
- **satellite.js** to propagate the orbit with the SGP4 model.

The app calibrates the propagated orbit to the live position before creating
Cesium samples. It never inserts a live point into an existing interpolated
path, which would create large spikes and impossible speeds.

## What you need

Install these before starting:

1. [Node.js](https://nodejs.org/) 20 LTS or newer. Node includes npm.
2. A code editor such as [Visual Studio Code](https://code.visualstudio.com/).
3. A modern browser such as Chrome, Edge, or Firefox.
4. A free [Cesium ion account](https://ion.cesium.com/).
5. An ISS model in glTF or GLB format. The
   [ISS model on Sketchfab](https://sketchfab.com/3d-models/international-space-station-iss-3d-model-e9c8c0f42e144b6c897c8be85d245f3b)
   is one possible source; follow its license and attribution requirements.

You should already be comfortable creating files, running terminal commands,
and reading basic JavaScript.

## 1. Create the project

Open a terminal and run:

**Windows PowerShell**

```powershell
mkdir iss-tracker
cd iss-tracker
npm init -y
mkdir src
```

**macOS or Linux**

```bash
mkdir iss-tracker
cd iss-tracker
npm init -y
mkdir src
```

Replace the entire generated `package.json` with:

```json
{
  "name": "iss-tracker",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "cesium": "1.122.0",
    "satellite.js": "5.0.0"
  },
  "devDependencies": {
    "vite": "5.4.10",
    "vite-plugin-cesium": "1.2.23"
  },
  "overrides": {
    "@zip.js/zip.js": "2.7.57"
  }
}
```

Install the dependencies:

```bash
npm install
```

The `@zip.js/zip.js` override is required by this pinned Cesium version. Do not
replace it with a Vite `optimizeDeps.exclude` workaround; that can cause a
`mersenne-twister` module error in the browser.

## 2. Configure Vite and the data proxies

Create `vite.config.js` in the project root:

```js
import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [cesium()],
  server: {
    proxy: {
      '/api/iss-tle': {
        target: 'https://celestrak.org',
        changeOrigin: true,
        rewrite: () => '/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE',
      },
      '/api/iss-now': {
        target: 'http://api.open-notify.org',
        changeOrigin: true,
        rewrite: () => '/iss-now.json',
      },
    },
  },
  preview: {
    proxy: {
      '/api/iss-tle': {
        target: 'https://celestrak.org',
        changeOrigin: true,
        rewrite: () => '/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE',
      },
      '/api/iss-now': {
        target: 'http://api.open-notify.org',
        changeOrigin: true,
        rewrite: () => '/iss-now.json',
      },
    },
  },
  build: { target: 'esnext' },
});
```

Why use proxies?

- Open Notify is HTTP-only, while browser apps are commonly served over HTTPS.
- Public data services may not include browser CORS headers.
- The app can consistently fetch `/api/iss-now` and `/api/iss-tle` from its own
  origin during local development.

For a production deployment, configure equivalent routes on your hosting
platform or backend.

## 3. Create the page and styles

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ISS Live Tracker</title>
  </head>
  <body>
    <div id="cesiumContainer"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

Create `src/style.css`:

```css
html,
body,
#cesiumContainer {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}
```

## 4. Add your Cesium ion token safely

Open [Cesium ion Access Tokens](https://ion.cesium.com/tokens) and copy a token
that can access your imagery and ISS model.

Create `.env.example`:

```dotenv
VITE_CESIUM_ION_TOKEN=your_token_here
```

Do **not** put your real token in `.env.example`. That file is safe to share and
commit because it contains only a placeholder.

Create your local `.env` file:

**Windows PowerShell**

```powershell
Copy-Item .env.example .env
```

**macOS or Linux**

```bash
cp .env.example .env
```

Replace `your_token_here` in `.env` with your real token:

```dotenv
VITE_CESIUM_ION_TOKEN=your_actual_token
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
.env
.env.local
.env.*.local
.DS_Store
*.log
```

Vite reads environment variables only when it starts. Restart `npm run dev`
after changing `.env`.

## 5. Load and calibrate the ISS orbit

Create `src/iss.js`:

```js
import {
  Cartesian3,
  Cartographic,
  JulianDate,
  Math as CesiumMath,
  Matrix3,
  Quaternion,
  SampledPositionProperty,
} from 'cesium';
import {
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
} from 'satellite.js';

export const CELESTRAK_TLE_URL =
  'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE';
export const OPEN_NOTIFY_URL = 'http://api.open-notify.org/iss-now.json';

const TLE_PROXY_PATH = '/api/iss-tle';
const LIVE_POSITION_PROXY_PATH = '/api/iss-now';
const ISS_ORBIT_SECONDS = 93 * 60;
const SAMPLE_STEP_SECONDS = 15;
const PHASE_SEARCH_STEP_SECONDS = 10;

export async function loadIssData() {
  const [tleText, livePosition] = await Promise.all([
    fetchText(TLE_PROXY_PATH, 'CelesTrak ISS TLE'),
    fetchJson(LIVE_POSITION_PROXY_PATH, 'Open Notify live ISS position'),
  ]);

  return createCalibratedTrajectory(tleText, livePosition);
}

async function fetchText(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} request failed (${response.status} ${response.statusText}).`);
  }
  return response.text();
}

async function fetchJson(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} request failed (${response.status} ${response.statusText}).`);
  }
  return response.json();
}

export function createCalibratedTrajectory(tleText, livePayload) {
  const { name, satrec } = parseTle(tleText);
  const live = parseLivePosition(livePayload);
  const liveDate = new Date(live.timestamp * 1000);

  const phaseOffsetSeconds = findBestPhaseOffset(satrec, liveDate, live);
  const predictedNow = propagateToFixed(
    satrec,
    new Date(liveDate.getTime() + phaseOffsetSeconds * 1000)
  );
  const liveNow = Cartesian3.fromDegrees(
    live.longitude,
    live.latitude,
    cartographicHeight(predictedNow)
  );
  const calibration = rotationBetween(predictedNow, liveNow);

  const positions = new SampledPositionProperty();
  const startTime = JulianDate.addSeconds(
    JulianDate.fromDate(liveDate),
    -ISS_ORBIT_SECONDS / 2,
    new JulianDate()
  );
  const stopTime = JulianDate.addSeconds(
    JulianDate.fromDate(liveDate),
    ISS_ORBIT_SECONDS / 2,
    new JulianDate()
  );

  let sampleCount = 0;
  for (
    let seconds = -ISS_ORBIT_SECONDS / 2;
    seconds <= ISS_ORBIT_SECONDS / 2;
    seconds += SAMPLE_STEP_SECONDS
  ) {
    const displayDate = new Date(liveDate.getTime() + seconds * 1000);
    const sourceDate = new Date(
      displayDate.getTime() + phaseOffsetSeconds * 1000
    );
    const predicted = propagateToFixed(satrec, sourceDate);
    const calibrated = Matrix3.multiplyByVector(
      calibration,
      predicted,
      new Cartesian3()
    );

    positions.addSample(JulianDate.fromDate(displayDate), calibrated);
    sampleCount += 1;
  }

  return {
    live,
    name,
    phaseOffsetSeconds,
    positions,
    sampleCount,
    startTime,
    stopTime,
  };
}

function parseTle(tleText) {
  const lines = tleText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 3 || !lines[1].startsWith('1 ') || !lines[2].startsWith('2 ')) {
    throw new Error('CelesTrak did not return a valid three-line ISS TLE.');
  }

  const satrec = twoline2satrec(lines[1], lines[2]);
  if (satrec.error !== 0) {
    throw new Error(`Could not parse the ISS TLE (satellite.js error ${satrec.error}).`);
  }

  return { name: lines[0], satrec };
}

function parseLivePosition(payload) {
  const latitude = Number(payload?.iss_position?.latitude);
  const longitude = Number(payload?.iss_position?.longitude);
  const timestamp = Number(payload?.timestamp);

  if (
    payload?.message !== 'success' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(timestamp)
  ) {
    throw new Error('Open Notify returned an invalid live ISS position.');
  }

  return { latitude, longitude, timestamp };
}

function findBestPhaseOffset(satrec, liveDate, live) {
  const target = Cartesian3.normalize(
    Cartesian3.fromDegrees(live.longitude, live.latitude),
    new Cartesian3()
  );
  let bestOffset = 0;
  let bestAngle = Number.POSITIVE_INFINITY;

  for (
    let offset = -ISS_ORBIT_SECONDS / 2;
    offset <= ISS_ORBIT_SECONDS / 2;
    offset += PHASE_SEARCH_STEP_SECONDS
  ) {
    const candidate = propagateToFixed(
      satrec,
      new Date(liveDate.getTime() + offset * 1000)
    );
    const angle = angularDistance(candidate, target);
    if (angle < bestAngle) {
      bestAngle = angle;
      bestOffset = offset;
    }
  }

  for (let offset = bestOffset - 10; offset <= bestOffset + 10; offset += 0.25) {
    const candidate = propagateToFixed(
      satrec,
      new Date(liveDate.getTime() + offset * 1000)
    );
    const angle = angularDistance(candidate, target);
    if (angle < bestAngle) {
      bestAngle = angle;
      bestOffset = offset;
    }
  }

  return bestOffset;
}

function propagateToFixed(satrec, date) {
  const state = propagate(satrec, date);
  if (!state.position || typeof state.position === 'boolean') {
    throw new Error(`SGP4 could not propagate the ISS position at ${date.toISOString()}.`);
  }

  const geodetic = eciToGeodetic(state.position, gstime(date));
  return Cartesian3.fromRadians(
    geodetic.longitude,
    geodetic.latitude,
    geodetic.height * 1000
  );
}

function angularDistance(left, right) {
  const leftUnit = Cartesian3.normalize(left, new Cartesian3());
  const rightUnit = Cartesian3.normalize(right, new Cartesian3());
  return Math.acos(
    CesiumMath.clamp(Cartesian3.dot(leftUnit, rightUnit), -1, 1)
  );
}

function rotationBetween(from, to) {
  const fromUnit = Cartesian3.normalize(from, new Cartesian3());
  const toUnit = Cartesian3.normalize(to, new Cartesian3());
  const axis = Cartesian3.cross(fromUnit, toUnit, new Cartesian3());
  const axisLength = Cartesian3.magnitude(axis);

  if (axisLength < CesiumMath.EPSILON12) {
    return Matrix3.clone(Matrix3.IDENTITY);
  }

  Cartesian3.divideByScalar(axis, axisLength, axis);
  const angle = angularDistance(fromUnit, toUnit);
  const quaternion = Quaternion.fromAxisAngle(axis, angle);
  return Matrix3.fromQuaternion(quaternion);
}

function cartographicHeight(position) {
  return Cartographic.fromCartesian(position).height;
}
```

### How the calibration works

1. `satellite.js` propagates the latest CelesTrak TLE with SGP4.
2. The code searches one ISS orbit for the phase that is closest to the verified
   live Open Notify point.
3. A single rotation aligns the propagated orbit with that live point.
4. The code then creates a new, evenly spaced `SampledPositionProperty`.

The live point is **not** added to a previously interpolated property. Doing
that would create a large outlier and cause the path to cross the globe,
altitudes near 900 km, and speeds above 100 km/s.

## 6. Upload the ISS model to Cesium ion

1. Sign in to [Cesium ion](https://ion.cesium.com/).
2. Open **Assets** and select **Add data**.
3. Upload the ISS `.gltf` or `.glb` file.
4. Choose the model option, not 3D Tiles.
5. Finish the upload and wait for processing.
6. Open the asset and copy the numeric **Asset ID** from its details or URL.

An ion **asset ID** is not your access token:

- The token stays in `.env`.
- The numeric ISS asset ID goes in `src/main.js`.

## 7. Create the Cesium viewer and ISS entity

Create `src/main.js`:

```js
import {
  CallbackProperty,
  Cartesian3,
  Cartographic,
  ClockRange,
  Color,
  Ion,
  IonResource,
  JulianDate,
  Math as CesiumMath,
  PolylineGlowMaterialProperty,
  VelocityOrientationProperty,
  Viewer,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './style.css';
import {
  CELESTRAK_TLE_URL,
  loadIssData,
  OPEN_NOTIFY_URL,
} from './iss.js';

// Replace this number with the Asset ID shown on your ISS model's ion page.
// Do not paste your ion access token here.
const ISS_ION_ASSET_ID = 5085257;
const ORBIT_PERIOD_SECONDS = 93 * 60;

const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
if (!token || token === 'your_token_here') {
  throw new Error(
    'Missing VITE_CESIUM_ION_TOKEN. Copy .env.example to .env and add your token.'
  );
}
Ion.defaultAccessToken = token;

const viewer = new Viewer('cesiumContainer', {
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  navigationHelpButton: false,
  sceneModePicker: false,
});

const trajectory = await loadIssData();
const currentTime = JulianDate.fromDate(
  new Date(trajectory.live.timestamp * 1000)
);

configureClock(viewer, trajectory, currentTime);

await assertIonModelAsset(ISS_ION_ASSET_ID, token);
const modelUri = await IonResource.fromAssetId(ISS_ION_ASSET_ID);

const iss = viewer.entities.add({
  id: 'iss',
  name: trajectory.name,
  position: trajectory.positions,
  orientation: new VelocityOrientationProperty(trajectory.positions),
  model: {
    uri: modelUri,
    minimumPixelSize: 96,
    maximumScale: 50_000,
  },
  path: {
    resolution: 15,
    material: new PolylineGlowMaterialProperty({
      color: Color.CYAN,
      glowPower: 0.2,
    }),
    width: 6,
    leadTime: ORBIT_PERIOD_SECONDS / 2,
    trailTime: ORBIT_PERIOD_SECONDS / 2,
  },
});

addDescription(iss, trajectory);
viewer.selectedEntity = iss;

const currentPosition = trajectory.positions.getValue(currentTime);
if (currentPosition) {
  viewer.camera.flyTo({
    destination: Cartesian3.multiplyByScalar(
      currentPosition,
      1.5,
      new Cartesian3()
    ),
    duration: 0,
  });
}

function configureClock(cesiumViewer, data, now) {
  cesiumViewer.clock.startTime = data.startTime.clone();
  cesiumViewer.clock.stopTime = data.stopTime.clone();
  cesiumViewer.clock.currentTime = now.clone();
  cesiumViewer.clock.clockRange = ClockRange.CLAMPED;
  cesiumViewer.clock.multiplier = 1;
  cesiumViewer.clock.shouldAnimate = true;

  const timelineStart = JulianDate.addSeconds(
    now,
    -ORBIT_PERIOD_SECONDS / 2,
    new JulianDate()
  );
  const timelineStop = JulianDate.addSeconds(
    now,
    ORBIT_PERIOD_SECONDS / 2,
    new JulianDate()
  );
  cesiumViewer.timeline.zoomTo(timelineStart, timelineStop);
}

function addDescription(entity, data) {
  const currentScratch = new Cartesian3();
  const nextScratch = new Cartesian3();
  const cartographicScratch = new Cartographic();
  const nextTimeScratch = new JulianDate();

  entity.description = new CallbackProperty((time) => {
    const current = data.positions.getValue(time, currentScratch);
    if (!current) return '';

    Cartographic.fromCartesian(current, undefined, cartographicScratch);
    const latitude = CesiumMath.toDegrees(
      cartographicScratch.latitude
    ).toFixed(3);
    const longitude = CesiumMath.toDegrees(
      cartographicScratch.longitude
    ).toFixed(3);
    const altitudeKm = (cartographicScratch.height / 1000).toFixed(1);

    const nextTime = JulianDate.addSeconds(time, 1, nextTimeScratch);
    const next = data.positions.getValue(nextTime, nextScratch);
    const speedKmS = next
      ? (Cartesian3.distance(current, next) / 1000).toFixed(2)
      : '—';

    return `
      <table class="cesium-infoBox-defaultTable">
        <tr><th>Latitude</th><td>${latitude}°</td></tr>
        <tr><th>Longitude</th><td>${longitude}°</td></tr>
        <tr><th>Altitude</th><td>${altitudeKm} km</td></tr>
        <tr><th>Speed</th><td>${speedKmS} km/s</td></tr>
        <tr><th>Live anchor</th><td><a href="${OPEN_NOTIFY_URL}" target="_blank" rel="noreferrer">Open Notify</a></td></tr>
        <tr><th>Orbit model</th><td><a href="${CELESTRAK_TLE_URL}" target="_blank" rel="noreferrer">CelesTrak TLE + SGP4</a></td></tr>
        <tr><th>Orbit samples</th><td>${data.sampleCount}</td></tr>
      </table>
    `;
  }, false);
}

async function assertIonModelAsset(assetId, accessToken) {
  if (!Number.isInteger(assetId) || assetId <= 0) {
    throw new Error('ISS_ION_ASSET_ID must be a positive integer.');
  }

  const endpointUrl =
    `https://api.cesium.com/v1/assets/${assetId}/endpoint?access_token=` +
    encodeURIComponent(accessToken);
  const response = await fetch(endpointUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to inspect ion asset ${assetId} (${response.status} ${response.statusText}).`
    );
  }

  const endpoint = await response.json();
  if (endpoint.type === '3DTILES') {
    throw new Error(
      `ion asset ${assetId} is 3D Tiles. Upload the ISS as a glTF/GLB model instead.`
    );
  }
}
```

At the beginning of this file, find:

```js
const ISS_ION_ASSET_ID = 5085257;
```

Replace only `5085257` with your own ISS model asset ID when following the
tutorial with a different ion asset. Leave the semicolon in place.

## 8. Run the app

Start Vite:

```bash
npm run dev
```

Open the local URL printed in the terminal, normally:

<http://localhost:5173/>

You should see:

- a Cesium globe;
- the ISS model near its verified live position;
- one smooth cyan orbit with no sharp jumps or lines through Earth;
- an altitude near 400–450 km;
- a speed near 7–8 km/s; and
- an info box identifying Open Notify and CelesTrak/SGP4.

To create a production build:

```bash
npm run build
```

## Troubleshooting

### The page is blank

Open the browser developer console. The first red error usually identifies the
missing token, bad asset ID, proxy failure, or dependency mismatch.

### Missing `VITE_CESIUM_ION_TOKEN`

Confirm:

1. The file is named exactly `.env`.
2. It is in the project root beside `package.json`.
3. It contains `VITE_CESIUM_ION_TOKEN=...`.
4. You restarted Vite after editing it.

Never put the real token in `.env.example`.

### The ISS appears as a yellow point

The model did not load. Confirm the asset:

- is a glTF or GLB model, not 3D Tiles;
- finished processing in Cesium ion;
- uses the asset ID from the ion asset page; and
- is accessible to the token in `.env`.

### The path has spikes or impossible speeds

Do not add a live `Cartesian3` sample to an already-created higher-degree
interpolated trajectory. Use the complete `src/iss.js` from Step 5. A healthy
ISS speed is approximately 7.7 km/s, not 100+ km/s.

### `zip-no-worker.js` or `mersenne-twister` errors

Use the exact dependency versions and `overrides` block from Step 1, then clean
and reinstall:

**Windows PowerShell**

```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
```

**macOS or Linux**

```bash
rm -rf node_modules package-lock.json
npm install
```

### Data requests return 404 or CORS errors

Copy the complete `vite.config.js` from Step 2 and restart Vite. Both
`/api/iss-tle` and `/api/iss-now` must be configured.

## What you learned

You used:

- `Viewer` to create a Cesium application;
- `SampledPositionProperty` for time-dynamic positions;
- `VelocityOrientationProperty` to orient a moving model;
- Cesium's clock and timeline for animation;
- `IonResource.fromAssetId` to load a private ion-hosted model;
- satellite.js and SGP4 for orbit propagation; and
- a live observation to calibrate a smooth trajectory without corrupting it.
