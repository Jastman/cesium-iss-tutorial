# CesiumJS 101: Build an ISS Live Tracker

This tutorial walks you from zero setup to a working CesiumJS app that shows the International Space Station orbiting Earth in real time.

You will build:
1. A Cesium globe in the browser
2. A time-dynamic ISS orbit using TLE data + SGP4 propagation
3. A glowing orbit path
4. A 3D ISS model loaded from Cesium ion
5. A live info panel with latitude, longitude, altitude, and speed

Estimated time: **45-60 minutes**

---

## 1. Prerequisites (starting from zero)

You need:
1. **Node.js 18+** (LTS recommended): https://nodejs.org
2. **A code editor** (VS Code recommended): https://code.visualstudio.com
3. **A free Cesium ion account**: https://ion.cesium.com
4. **A free Sketchfab account** (for downloading the ISS model): https://sketchfab.com
5. **Basic web dev familiarity** (HTML, JS, terminal commands)

**Which terminal to use:**
- **Windows:** Use **Windows Terminal** with **PowerShell** (not Command Prompt). Windows Terminal is available from the Microsoft Store — install it if you don't have it.
- **macOS:** Use the built-in **Terminal** app, or iTerm2.

Optional but useful:
1. Git

---

## 2. Create the project

Open a terminal and run:

**Windows (PowerShell):**
```powershell
mkdir iss-tracker
cd iss-tracker
npm init -y
npm install cesium@1.122.0
npm install --save-dev vite@5.4.10 vite-plugin-cesium@1.2.23
```

**macOS / Linux:**
```bash
mkdir iss-tracker
cd iss-tracker
npm init -y
npm install cesium@1.122.0
npm install -D vite@5.4.10 vite-plugin-cesium@1.2.23
```

> We pin these package versions intentionally so everyone gets the same known-good result as this tutorial.
> After replacing `package.json`, run `npm install` again so the `overrides` section is applied.

Replace the **entire contents** of `package.json` with:

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
    "cesium": "1.122.0"
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

> Important: replace the full file (do not merge fields). In particular, make sure there is only one `"type"` key, and it is `"type": "module"`.
>
> The `overrides` entry is required to avoid a Vite/Cesium zip.js compatibility issue (`Missing "./lib/zip-no-worker.js" specifier`).
> Do **not** add `optimizeDeps.exclude` entries for Cesium packages in this tutorial; that can cause browser module errors like `mersenne-twister ... does not provide an export named 'default'`.

Create `vite.config.js`:

```js
import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

const NASA_OEM_SOURCE_PATH = '/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt';

export default defineConfig({
  plugins: [cesium()],
  // NASA's OEM file does not send browser CORS headers.
  // Proxying through Vite keeps Step 5/6 working in local dev and preview.
  server: {
    proxy: {
      '/api/nasa-iss-oem': {
        target: 'https://nasa-public-data.s3.amazonaws.com',
        changeOrigin: true,
        rewrite: () => NASA_OEM_SOURCE_PATH,
      },
    },
  },
  preview: {
    proxy: {
      '/api/nasa-iss-oem': {
        target: 'https://nasa-public-data.s3.amazonaws.com',
        changeOrigin: true,
        rewrite: () => NASA_OEM_SOURCE_PATH,
      },
    },
  },
  build: { target: 'esnext' }, // allows top-level await
});
```

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

Create a `src` folder, then create `src/style.css`:

**Windows (PowerShell):**
```powershell
mkdir src
```

**macOS / Linux:**
```bash
mkdir src
```

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

---

## 3. Configure your Cesium ion token

1. In Cesium ion, go to **Access Tokens**: https://ion.cesium.com/tokens
2. Copy your default token
3. Create `.env` in the project root:

```env
VITE_CESIUM_ION_TOKEN=your_token_here
```

4. Add `.env` to `.gitignore`. Open (or create) `.gitignore` in your editor and add a new line:

```
.env
```

5. Create `.env.example` in your editor:

```env
VITE_CESIUM_ION_TOKEN=your_token_here
```

Why `VITE_`? Vite only exposes env vars prefixed with `VITE_` to browser code.

---

## 4. Render the Cesium globe

Create `src/main.js`:

```js
import { Ion, Viewer } from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './style.css';

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
  sceneModePicker: false,
  navigationHelpButton: false,
  homeButton: false,
});
```

Run the app:

**Windows (PowerShell):**
```powershell
npm run dev
```

**macOS / Linux:**
```bash
npm run dev
```

> These npm commands are identical on all platforms — from here on, `npm run ...` commands work the same everywhere. Only file-system commands differ between platforms.

You should now see Earth rendered in Cesium.

---

## 5. Load real ISS trajectory data from NASA

The earlier globe was just Cesium itself. Now we will feed it **real ISS orbit data** from NASA.

NASA publishes the ISS trajectory as an Orbit Ephemeris Message (OEM) on the Spot the Station page:

- Spot the Station: https://www.nasa.gov/spot-the-station/#TRAJECTORY
- Current OEM text file: https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt

Create `src/iss.js`:

```js
import {
  Cartesian3,
  JulianDate,
  LagrangePolynomialApproximation,
  Matrix3,
  SampledPositionProperty,
  Transforms,
} from 'cesium';

export const NASA_OEM_URL =
  'https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt';
export const NASA_OEM_PROXY_PATH = '/api/nasa-iss-oem';

export const OPEN_NOTIFY_URL = 'http://api.open-notify.org/iss-now.json';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export async function loadIssTrajectory() {
  let response;
  try {
    response = await fetch(NASA_OEM_PROXY_PATH);
  } catch {
    response = undefined;
  }

  if (!response || !response.ok) {
    // Fallback for environments without the Vite proxy (e.g., server-side tooling).
    response = await fetch(NASA_OEM_URL);
  }

  if (!response.ok) {
    throw new Error(
      `Failed to load NASA trajectory data (${response.status} ${response.statusText}).`
    );
  }

  return parseIssOem(await response.text());
}

export function parseIssOem(text) {
  // Use default (FIXED/ECEF) reference frame — we convert ECI→ECEF ourselves below.
  const positions = new SampledPositionProperty();
  positions.setInterpolationOptions({
    interpolationAlgorithm: LagrangePolynomialApproximation,
    interpolationDegree: 5,
  });

  let creationDate;
  let startTime;
  let stopTime;
  let sampleCount = 0;
  let skippedCount = 0;

  const eciVec = new Cartesian3();
  const ecefVec = new Cartesian3();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('CREATION_DATE')) {
      creationDate = line.split('=').at(1)?.trim();
      continue;
    }

    if (!/^\d{4}-\d{2}-\d{2}T/.test(line)) continue;

    const [timestamp, xKm, yKm, zKm] = line.split(/\s+/);
    const time = JulianDate.fromIso8601(timestamp);

    // NASA OEM is in EME2000 (J2000-like) inertial frame.
    // Convert to Earth-fixed (ECEF) so Cesium draws the path over the rotating Earth.
    Cartesian3.fromElements(
      Number(xKm) * 1000.0,
      Number(yKm) * 1000.0,
      Number(zKm) * 1000.0,
      eciVec
    );

    const toFixed = Transforms.computeIcrfToFixedMatrix(time);
    if (!toFixed) {
      // ICRF→fixed matrix unavailable for this epoch — skip sample.
      skippedCount += 1;
      continue;
    }

    Matrix3.multiplyByVector(toFixed, eciVec, ecefVec);
    positions.addSample(time, ecefVec.clone());

    if (!startTime) {
      startTime = time.clone();
    }
    stopTime = time.clone();
    sampleCount += 1;
  }

  if (!startTime || !stopTime || sampleCount === 0) {
    throw new Error('NASA OEM file did not contain any usable trajectory samples.');
  }

  if (skippedCount > 0) {
    console.warn(`parseIssOem: skipped ${skippedCount} samples (ICRF matrix unavailable).`);
  }

  return {
    creationDate,
    positions,
    sampleCount,
    startTime,
    stopTime,
  };
}

export async function fetchIssNowSnapshot() {
  const isLocalHttp =
    typeof window !== 'undefined' &&
    window.location.protocol === 'http:' &&
    LOCAL_HOSTS.has(window.location.hostname);

  if (!isLocalHttp) {
    return {
      available: false,
      reason:
        'Open Notify is HTTP-only, so it is disabled on HTTPS deployments. The app still uses NASA trajectory data.',
      source: 'Open Notify',
    };
  }

  const response = await fetch(OPEN_NOTIFY_URL);
  if (!response.ok) {
    throw new Error(
      `Open Notify request failed (${response.status} ${response.statusText}).`
    );
  }

  const data = await response.json();
  if (data.message !== 'success') {
    throw new Error('Open Notify did not return a success payload.');
  }

  return {
    available: true,
    latitude: Number(data.iss_position.latitude),
    longitude: Number(data.iss_position.longitude),
    source: 'Open Notify',
    timestamp: Number(data.timestamp),
  };
}

export function clampJulianDate(time, startTime, stopTime) {
  if (JulianDate.lessThan(time, startTime)) {
    return startTime.clone();
  }

  if (JulianDate.greaterThan(time, stopTime)) {
    return stopTime.clone();
  }

  return time.clone();
}
```

What this file does:
1. Downloads NASA's current ISS trajectory file via the Vite proxy (to avoid CORS)
2. Parses the trajectory samples from EME2000 inertial coordinates into Earth-fixed (ECEF) using `Transforms.computeIcrfToFixedMatrix()` + `Matrix3.multiplyByVector()` — this is critical: without the conversion, the ISS orbit appears as a fixed ring around the globe because inertial positions don't track Earth's rotation
3. Uses `LagrangePolynomialApproximation` so the four-minute NASA samples animate smoothly
4. Optionally fetches Open Notify's current ISS snapshot on localhost to align the initial clock time

If you see a browser CORS error after Step 6, your `vite.config.js` proxy block is missing or outdated. Re-copy the exact `vite.config.js` from Step 2 and restart `npm run dev`.

---

## 6. Draw the live ISS orbit

Replace `src/main.js` with:

```js
import {
  ClockRange,
  Color,
  Ion,
  JulianDate,
  PolylineGlowMaterialProperty,
  Viewer,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './style.css';
import {
  clampJulianDate,
  fetchIssNowSnapshot,
  loadIssTrajectory,
} from './iss.js';

const ORBIT_PERIOD_SECONDS = 93 * 60;
const TIMELINE_WINDOW_SECONDS = 3 * 60 * 60;

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
  sceneModePicker: false,
  navigationHelpButton: false,
  homeButton: false,
});

const trajectory = await loadIssTrajectory();

let liveSnapshot;
try {
  liveSnapshot = await fetchIssNowSnapshot();
} catch (error) {
  liveSnapshot = {
    available: false,
    reason: `Open Notify request failed: ${error.message}`,
    source: 'Open Notify',
  };
}

const preferredTime = liveSnapshot?.available
  ? JulianDate.fromDate(new Date(liveSnapshot.timestamp * 1000))
  : JulianDate.now();

const currentTime = clampJulianDate(
  preferredTime,
  trajectory.startTime,
  trajectory.stopTime
);

viewer.clock.startTime = trajectory.startTime.clone();
viewer.clock.stopTime = trajectory.stopTime.clone();
viewer.clock.currentTime = currentTime.clone();
viewer.clock.clockRange = ClockRange.CLAMPED;
viewer.clock.multiplier = 1.0;
viewer.clock.shouldAnimate = true;

const timelineStart = clampJulianDate(
  JulianDate.addSeconds(currentTime, -TIMELINE_WINDOW_SECONDS / 2, new JulianDate()),
  trajectory.startTime,
  trajectory.stopTime
);
const timelineStop = clampJulianDate(
  JulianDate.addSeconds(currentTime, TIMELINE_WINDOW_SECONDS / 2, new JulianDate()),
  trajectory.startTime,
  trajectory.stopTime
);
viewer.timeline.zoomTo(timelineStart, timelineStop);

viewer.entities.add({
  id: 'iss',
  name: 'ISS (ZARYA)',
  position: trajectory.positions,
  path: {
    resolution: 120,
    material: new PolylineGlowMaterialProperty({
      glowPower: 0.2,
      color: Color.CYAN,
    }),
    width: 8,
    trailTime: ORBIT_PERIOD_SECONDS / 2,
    leadTime: ORBIT_PERIOD_SECONDS / 2,
  },
});
```

Now you should see a live ISS path based on NASA trajectory data, not a hardcoded TLE.

---

## 7. Attach a 3D ISS model from Cesium ion

### Step 7a — Download the ISS model from Sketchfab

1. Go to the ISS model page: https://sketchfab.com/3d-models/3december-2021-international-space-station-a91871ba086749a492c12976cdcf321b
2. Click **Download 3D Model** (you need a free Sketchfab account — sign up if you haven't)
3. Choose **glTF** as the download format
4. Unzip the downloaded file — you'll have a folder containing a `.gltf` file and supporting textures

> **Can't find the Download button?** You must be logged in to Sketchfab. The button appears on the right side of the model page once signed in.
>
> **Automation note:** Sketchfab can show anti-bot/CAPTCHA checks in automated environments. If that happens, complete this download manually in your normal browser session.

### Step 7b — Upload to Cesium ion

1. Go to **My Assets** in Cesium ion: https://ion.cesium.com/myassets
2. Click **Add data** → **Upload files**
3. Drag the entire unzipped model folder (or select all files inside it) and upload
4. Wait for processing to complete (usually a minute or two)
5. Copy the **Asset ID** shown on the asset detail page (a number like `1234567`)

> **If Sketchfab download is temporarily blocked:** You can still validate all downstream Cesium ion upload + app wiring steps with any local glTF model folder (a `.gltf` plus its textures/buffers). Then swap to the ISS model once Sketchfab access works.

### Step 7c — Wire the ion model into the live tracker

Before you run this step: **you must paste your own uploaded model's ion Asset ID into `src/main.js`**.

Put it in this exact line (replace `0` with your numeric ID from ion, for example `1234567`):

```js
const ISS_ION_ASSET_ID = 1234567;
```

This line appears just before the model validation and `IonResource.fromAssetId(...)` call in the full snippet below.

Then replace `src/main.js` with this full version:

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
  clampJulianDate,
  fetchIssNowSnapshot,
  loadIssTrajectory,
  NASA_OEM_URL,
} from './iss.js';

const ORBIT_PERIOD_SECONDS = 93 * 60;
const TIMELINE_WINDOW_SECONDS = 3 * 60 * 60;

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
  sceneModePicker: false,
  navigationHelpButton: false,
  homeButton: false,
});

const trajectory = await loadIssTrajectory();

let liveSnapshot;
try {
  liveSnapshot = await fetchIssNowSnapshot();
} catch (error) {
  liveSnapshot = {
    available: false,
    reason: `Open Notify request failed: ${error.message}`,
    source: 'Open Notify',
  };
}

const preferredTime = liveSnapshot?.available
  ? JulianDate.fromDate(new Date(liveSnapshot.timestamp * 1000))
  : JulianDate.now();

const currentTime = clampJulianDate(
  preferredTime,
  trajectory.startTime,
  trajectory.stopTime
);

const clock = viewer.clock;
clock.startTime = trajectory.startTime.clone();
clock.stopTime = trajectory.stopTime.clone();
clock.currentTime = currentTime.clone();
clock.clockRange = ClockRange.CLAMPED;
clock.multiplier = 1.0;
clock.shouldAnimate = true;

const timelineStart = clampJulianDate(
  JulianDate.addSeconds(currentTime, -TIMELINE_WINDOW_SECONDS / 2, new JulianDate()),
  trajectory.startTime,
  trajectory.stopTime
);
const timelineStop = clampJulianDate(
  JulianDate.addSeconds(currentTime, TIMELINE_WINDOW_SECONDS / 2, new JulianDate()),
  trajectory.startTime,
  trajectory.stopTime
);
viewer.timeline.zoomTo(timelineStart, timelineStop);

const ISS_ION_ASSET_ID = 0; // PASTE YOUR ION ASSET ID HERE (replace 0)
if (!Number.isInteger(ISS_ION_ASSET_ID) || ISS_ION_ASSET_ID <= 0) {
  throw new Error(
    'Set ISS_ION_ASSET_ID to your uploaded model asset ID from ion before running.'
  );
}

await assertIonModelAsset(ISS_ION_ASSET_ID, token);
const issModelUri = await IonResource.fromAssetId(ISS_ION_ASSET_ID);

const iss = viewer.entities.add({
  id: 'iss',
  name: 'ISS (ZARYA)',
  position: trajectory.positions,
  orientation: new VelocityOrientationProperty(trajectory.positions),
  model: {
    uri: issModelUri,
    minimumPixelSize: 96,
    maximumScale: 50_000.0,
  },
  path: {
    resolution: 120,
    material: new PolylineGlowMaterialProperty({
      glowPower: 0.2,
      color: Color.CYAN,
    }),
    width: 8,
    trailTime: ORBIT_PERIOD_SECONDS / 2,
    leadTime: ORBIT_PERIOD_SECONDS / 2,
  },
});

// Camera safety fix:
// We intentionally avoid viewer.trackedEntity here because some model assets
// can trigger a camera normalization error on initial track/fly.
// Instead, we manually place the camera using the sampled ISS position.
const issCurrent = trajectory.positions.getValue(currentTime);
if (issCurrent) {
  viewer.camera.flyTo({
    destination: Cartesian3.multiplyByScalar(
      issCurrent,
      1.5,
      new Cartesian3()
    ),
    duration: 0.0,
  });
}

const scratchCurrent = new Cartesian3();
const scratchNext = new Cartesian3();
const scratchCarto = new Cartographic();
const scratchJulianDate = new JulianDate();

iss.description = new CallbackProperty((time) => {
  const current = trajectory.positions.getValue(time, scratchCurrent);
  if (!current) return '';

  Cartographic.fromCartesian(current, undefined, scratchCarto);
  const lat = CesiumMath.toDegrees(scratchCarto.latitude).toFixed(3);
  const lon = CesiumMath.toDegrees(scratchCarto.longitude).toFixed(3);
  const altKm = (scratchCarto.height / 1000).toFixed(1);

  const oneSecondLater = JulianDate.addSeconds(time, 1.0, scratchJulianDate);
  const next = trajectory.positions.getValue(oneSecondLater, scratchNext);
  const speedKmS = next
    ? (Cartesian3.distance(current, next) / 1000).toFixed(2)
    : '—';

  const liveSnapshotRow = liveSnapshot?.available
    ? `${liveSnapshot.latitude.toFixed(3)}°, ${liveSnapshot.longitude.toFixed(3)}° @ ${new Date(
        liveSnapshot.timestamp * 1000
      ).toUTCString()}`
    : liveSnapshot?.reason ?? 'Unavailable';

  return `
    <table class="cesium-infoBox-defaultTable">
      <tr><th>Latitude</th><td>${lat}°</td></tr>
      <tr><th>Longitude</th><td>${lon}°</td></tr>
      <tr><th>Altitude</th><td>${altKm} km</td></tr>
      <tr><th>Speed</th><td>${speedKmS} km/s</td></tr>
      <tr><th>Trajectory source</th><td><a href="${NASA_OEM_URL}" target="_blank" rel="noreferrer">NASA OEM</a></td></tr>
      <tr><th>NASA sample count</th><td>${trajectory.sampleCount}</td></tr>
      <tr><th>Open Notify</th><td>${liveSnapshotRow}</td></tr>
    </table>
  `;
}, false);

viewer.selectedEntity = iss;

async function assertIonModelAsset(assetId, accessToken) {
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
      `ion asset ${assetId} is a 3D Tiles asset. For entity.model.uri, upload a glTF/GLB model asset and use that asset ID instead.`
    );
  }
}
```

At this point, your app is complete.

> Camera tracking note: if you previously used `viewer.trackedEntity = iss`
> and saw `DeveloperError: normalized result is not a number`, keep this
> manual `camera.flyTo` pattern instead.

---

## 8. How to test your result

You should be able to:
1. See Earth and a glowing ISS path
2. See the ISS model moving along that path after you provide a valid ion model asset ID
3. Use the Cesium timeline controls to scrub around the current orbit window
4. Click the ISS and see live telemetry plus the NASA/Open Notify source details in the info box

---

## 9. Build for production

**Windows (PowerShell):**
```powershell
npm run build
npm run preview
```

**macOS / Linux:**
```bash
npm run build
npm run preview
```

The `dist/` folder is static and can be hosted on GitHub Pages, Netlify, Cloudflare Pages, or S3.

> Important: Open Notify is HTTP-only, so that part of the demo works on `http://localhost` but not on HTTPS-hosted deployments. The deployed app still uses NASA's HTTPS trajectory data.

---

## 10. Common beginner issues

1. **Blank/failed load**: Check `.env` token and restart the dev server after editing env vars
2. **zip-no-worker.js error**: Re-run `npm install` after replacing `package.json` so the `overrides` entry takes effect
3. **Model not appearing**: Confirm `ISS_ION_ASSET_ID` is a model asset in your ion account and that processing finished
4. **Asset renders as a yellow point but not a model**: Your ion asset is probably a `3DTILES` asset; upload a glTF/GLB model asset instead
5. **Open Notify unavailable**: That is expected on HTTPS deployments because the API is HTTP-only; localhost still works
6. **Path not moving**: Confirm `viewer.clock.shouldAnimate = true`
7. **`normalized result is not a number` camera error**: Do not use `viewer.trackedEntity = iss` for startup; use the guarded manual `viewer.camera.flyTo(...)` block from Step 7c
8. **`Access to fetch ... has been blocked by CORS policy` (NASA OEM)**: Ensure your `vite.config.js` contains the `/api/nasa-iss-oem` proxy block from Step 2, then restart the dev server

---

## 11. Next extensions (optional)

1. Add a small UI badge showing whether Open Notify is active or skipped
2. Add a second entity for another spacecraft using the same NASA OEM parsing pattern
3. Add camera presets (far orbit view, close chase view, nadir view)
4. Add day/night lighting and atmosphere tuning
