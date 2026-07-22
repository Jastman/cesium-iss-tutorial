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
npm install cesium@1.122.0 satellite.js@5.0.0
npm install --save-dev vite@5.4.10 vite-plugin-cesium@1.2.23
```

**macOS / Linux:**
```bash
mkdir iss-tracker
cd iss-tracker
npm init -y
npm install cesium@1.122.0 satellite.js@5.0.0
npm install -D vite@5.4.10 vite-plugin-cesium@1.2.23
```

> We pin these package versions intentionally so everyone gets the same known-good result as this tutorial.

Update `package.json`:

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
  }
}
```

Create `vite.config.js`:

```js
import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [cesium()],
  // Avoid Cesium pre-bundle issues some users hit in Vite dev mode.
  optimizeDeps: {
    exclude: ['cesium', '@cesium/engine', '@zip.js/zip.js'],
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

## 5. Add ISS TLE data + orbit propagation

Create `src/iss.js`:

```js
import { Cartesian3, JulianDate, SampledPositionProperty } from 'cesium';
import * as satellite from 'satellite.js';

export const ISS_TLE = {
  name: 'ISS (ZARYA)',
  line1: '1 25544U 98067A   26113.61927546  .00009382  00000+0  17870-3 0  9990',
  line2: '2 25544  51.6319 210.1816 0006828 342.1779  17.8969 15.48913482563293',
};

export function sampleIssOrbit(tle, startTime, durationSeconds, stepSeconds) {
  const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
  const positions = new SampledPositionProperty();

  for (let dt = 0; dt <= durationSeconds; dt += stepSeconds) {
    const time = JulianDate.addSeconds(startTime, dt, new JulianDate());
    const jsDate = JulianDate.toDate(time);
    const eci = satellite.propagate(satrec, jsDate);
    if (!eci.position) continue;

    const gmst = satellite.gstime(jsDate);
    const geo = satellite.eciToGeodetic(eci.position, gmst);

    positions.addSample(
      time,
      Cartesian3.fromRadians(geo.longitude, geo.latitude, geo.height * 1000.0)
    );
  }

  return positions;
}
```

What is happening:
1. TLE stores orbital elements
2. `satellite.js` runs SGP4 to get ISS position at each time sample
3. Cesium `SampledPositionProperty` interpolates smoothly between samples

---

## 6. Draw the ISS orbit path

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
import { ISS_TLE, sampleIssOrbit } from './iss.js';

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

const start = JulianDate.now();
const stop = JulianDate.addSeconds(start, 93 * 60, new JulianDate()); // ~1 ISS orbit
const positions = sampleIssOrbit(ISS_TLE, start, 93 * 60, 10);

viewer.clock.startTime = start.clone();
viewer.clock.stopTime = stop.clone();
viewer.clock.currentTime = start.clone();
viewer.clock.clockRange = ClockRange.LOOP_STOP;
viewer.clock.multiplier = 1.0;
viewer.clock.shouldAnimate = true;
viewer.timeline.zoomTo(start, stop);

viewer.entities.add({
  id: 'iss',
  name: ISS_TLE.name,
  position: positions,
  path: {
    resolution: 120,
    material: new PolylineGlowMaterialProperty({
      glowPower: 0.2,
      color: Color.CYAN,
    }),
    width: 8,
    leadTime: 93 * 60,
    trailTime: 93 * 60,
  },
});
```

Now you should see a glowing orbit ring around Earth.

---

## 7. Attach a 3D ISS model from Cesium ion

### Step 7a — Download the ISS model from Sketchfab

1. Go to the ISS model page: https://sketchfab.com/3d-models/3december-2021-international-space-station-a91871ba086749a492c12976cdcf321b
2. Click **Download 3D Model** (you need a free Sketchfab account — sign up if you haven't)
3. Choose **glTF** as the download format
4. Unzip the downloaded file — you'll have a folder containing a `.gltf` file and supporting textures

> **Can't find the Download button?** You must be logged in to Sketchfab. The button appears on the right side of the model page once signed in.

### Step 7b — Upload to Cesium ion

1. Go to **My Assets** in Cesium ion: https://ion.cesium.com/myassets
2. Click **Add data** → **Upload files**
3. Drag the entire unzipped model folder (or select all files inside it) and upload
4. Wait for processing to complete (usually a minute or two)
5. Copy the **Asset ID** shown on the asset detail page (a number like `1234567`)

### Step 7c — Wire it into the app

Then update `src/main.js` (replace file with this version):

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
import { ISS_TLE, sampleIssOrbit } from './iss.js';

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

const start = JulianDate.now();
const stop = JulianDate.addSeconds(start, 93 * 60, new JulianDate());
const positions = sampleIssOrbit(ISS_TLE, start, 93 * 60, 10);

viewer.clock.startTime = start.clone();
viewer.clock.stopTime = stop.clone();
viewer.clock.currentTime = start.clone();
viewer.clock.clockRange = ClockRange.LOOP_STOP;
viewer.clock.multiplier = 1.0;
viewer.clock.shouldAnimate = true;
viewer.timeline.zoomTo(start, stop);

const ISS_ION_ASSET_ID = 0; // replace with your own numeric asset ID
if (!Number.isInteger(ISS_ION_ASSET_ID) || ISS_ION_ASSET_ID <= 0) {
  throw new Error(
    'Set ISS_ION_ASSET_ID to your uploaded model asset ID from ion before running.'
  );
}

const iss = viewer.entities.add({
  id: 'iss',
  name: ISS_TLE.name,
  position: positions,
  orientation: new VelocityOrientationProperty(positions),
  model: {
    uri: await IonResource.fromAssetId(ISS_ION_ASSET_ID),
    minimumPixelSize: 64,
    maximumScale: 20_000.0,
  },
  path: {
    resolution: 120,
    material: new PolylineGlowMaterialProperty({
      glowPower: 0.2,
      color: Color.CYAN,
    }),
    width: 8,
    leadTime: 93 * 60,
    trailTime: 93 * 60,
  },
});

const issStart = iss.position.getValue(start);
viewer.camera.flyTo({
  destination: Cartesian3.multiplyByScalar(issStart, 1.5, new Cartesian3()),
  duration: 0.0,
});

const scratchCurrent = new Cartesian3();
const scratchNext = new Cartesian3();
const scratchCarto = new Cartographic();
const scratchJulianDate = new JulianDate();

iss.description = new CallbackProperty((time) => {
  const current = iss.position.getValue(time, scratchCurrent);
  if (!current) return '';

  Cartographic.fromCartesian(current, undefined, scratchCarto);
  const lat = CesiumMath.toDegrees(scratchCarto.latitude).toFixed(3);
  const lon = CesiumMath.toDegrees(scratchCarto.longitude).toFixed(3);
  const altKm = (scratchCarto.height / 1000).toFixed(1);

  const oneSecondLater = JulianDate.addSeconds(time, 1.0, scratchJulianDate);
  const next = iss.position.getValue(oneSecondLater, scratchNext);
  const speedKmS = next
    ? (Cartesian3.distance(current, next) / 1000).toFixed(2)
    : '—';

  return `
    <table class="cesium-infoBox-defaultTable">
      <tr><th>Latitude</th><td>${lat}°</td></tr>
      <tr><th>Longitude</th><td>${lon}°</td></tr>
      <tr><th>Altitude</th><td>${altKm} km</td></tr>
      <tr><th>Speed</th><td>${speedKmS} km/s</td></tr>
    </table>
  `;
}, false);

viewer.selectedEntity = iss;
```

At this point, your app is complete.

---

## 8. How to test your result

You should be able to:
1. See Earth and a glowing orbit path
2. See the ISS model moving along the orbit
3. Use Cesium's timeline controls to play/scrub
4. Click the ISS and see live telemetry in the info box

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

---

## 10. Common beginner issues

1. **Blank/failed load**: Check `.env` token and restart dev server after editing env vars
2. **Model not appearing**: Confirm `ISS_ION_ASSET_ID` exists in your ion account and finished processing
3. **Orbit looks wrong**: Ensure TLE lines are unmodified and complete
4. **Path but no animation**: Confirm `viewer.clock.shouldAnimate = true`

---

## 11. Next extensions (optional)

1. Pull fresh ISS TLE automatically from a backend API
2. Add a second satellite for comparison
3. Add day/night lighting and atmosphere tuning
4. Add camera presets and a "track ISS" button
