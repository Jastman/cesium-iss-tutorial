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
