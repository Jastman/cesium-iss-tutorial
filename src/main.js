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

// --- Cesium ion token -------------------------------------------------------
// Loaded from .env (see .env.example). Never commit your token to git.
const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
if (!token || token === 'your_token_here') {
  throw new Error(
    'Missing VITE_CESIUM_ION_TOKEN. Copy .env.example to .env and add your Cesium ion token from https://ion.cesium.com/tokens.'
  );
}
Ion.defaultAccessToken = token;

// --- Viewer -----------------------------------------------------------------
// Default Cesium Viewer with its built-in Animation + Timeline widgets enabled
// (bottom-left clock and bottom timeline). These give the user play / pause and
// time-speed controls for free.
const viewer = new Viewer('cesiumContainer', {
  baseLayerPicker: false,
  geocoder: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  homeButton: false,
});

// --- ISS orbit --------------------------------------------------------------
// Propagate ISS positions for one full orbit (~93 min), starting now. We
// sample every 10 seconds — small enough to look smooth, large enough to be
// cheap. The result is a SampledPositionProperty that Cesium can interpolate
// between samples at any time we ask.
const start = JulianDate.now();
const stop = JulianDate.addSeconds(start, 93 * 60, new JulianDate());
const positions = sampleIssOrbit(ISS_TLE, start, 93 * 60, 10);

// Tell the viewer's clock which time range our samples cover. Without this,
// Cesium might ask the property for a time it doesn't have data for.
const clock = viewer.clock;
clock.startTime = start.clone();
clock.stopTime = stop.clone();
clock.currentTime = start.clone();
// Loop the orbit when we hit the end of our sample window, and run in real
// time (1 simulated second per wall-clock second — the ISS travels ~7.66 km/s).
clock.clockRange = ClockRange.LOOP_STOP;
clock.multiplier = 1.0;
clock.shouldAnimate = true;

// Align the timeline widget to our sample window so the user can scrub through
// the whole orbit.
viewer.timeline.zoomTo(start, stop);

// --- Orbit path entity ------------------------------------------------------
// We add a single entity with a `position` that varies over time. Giving the
// entity a `path` graphic tells Cesium to draw the full trajectory as a line,
// and a `model` graphic attaches a glTF model at the current position.
//
// `VelocityOrientationProperty` automatically orients the model so its +X axis
// points along the direction of travel — no manual quaternion math needed.
//
// The model itself lives in Cesium ion. Upload your own (File → Add data, or
// the Sketchfab integration) and paste its asset ID here. See TUTORIAL.md.
const ISS_ION_ASSET_ID = 4666139;

const iss = viewer.entities.add({
  id: 'iss',
  name: ISS_TLE.name,
  position: positions,
  orientation: new VelocityOrientationProperty(positions),
  model: {
    uri: await IonResource.fromAssetId(ISS_ION_ASSET_ID),
    // Ensure the satellite is always visible, even from far away.
    minimumPixelSize: 64,
    maximumScale: 20_000.0,
  },
  path: {
    resolution: 120, // seconds between sampled path vertices
    material: new PolylineGlowMaterialProperty({
      glowPower: 0.2,
      color: Color.CYAN,
    }),
    width: 8,
    // Show the full orbit as a closed loop (lead + trail covers one period).
    leadTime: 93 * 60,
    trailTime: 93 * 60,
  },
});

// Position the camera at a nice vantage point near the ISS's starting location.
// We read the entity's position at start time and place the camera looking
// toward Earth. This avoids relying on the model's bounding sphere, which can
// be unreliable for some glTF assets.
const issStart = iss.position.getValue(start);
viewer.camera.flyTo({
  destination: Cartesian3.multiplyByScalar(
    issStart,
    1.5, // pull the camera out along the Earth→ISS vector
    new Cartesian3()
  ),
  duration: 0.0,
});

// --- Live info box ----------------------------------------------------------
// Clicking the ISS opens Cesium's built-in info box (the panel in the top-right
// of the viewer). `entity.description` is what it renders. Wrapping it in a
// CallbackProperty makes Cesium re-evaluate it every frame — so the numbers
// update live while the info box is open.
//
// We compute lat/lon/alt from the current position, and velocity by sampling
// the position one second in the future and taking the difference.
const scratchCurrent = new Cartesian3();
const scratchNext = new Cartesian3();
const scratchCarto = new Cartographic();
// Reused every frame to avoid allocating a new JulianDate in the hot path.
const scratchJulianDate = new JulianDate();

iss.description = new CallbackProperty((time) => {
  const current = iss.position.getValue(time, scratchCurrent);
  if (!current) return '';

  Cartographic.fromCartesian(current, undefined, scratchCarto);
  const lat = CesiumMath.toDegrees(scratchCarto.latitude).toFixed(3);
  const lon = CesiumMath.toDegrees(scratchCarto.longitude).toFixed(3);
  const altKm = (scratchCarto.height / 1000).toFixed(1);

  // Speed ≈ |Δposition| over 1 s of simulated time.
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

// Select the ISS by default so the info box is already open on page load.
viewer.selectedEntity = iss;
