import {
  Cartesian3,
  Color,
  Ion,
  IonResource,
  JulianDate,
  PolylineGlowMaterialProperty,
  VelocityOrientationProperty,
  Viewer,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './style.css';
import { ISS_TLE, sampleIssOrbit } from './iss.js';

// --- Cesium ion token -------------------------------------------------------
const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
if (!token || token === 'your_token_here') {
  throw new Error(
    'Missing VITE_CESIUM_ION_TOKEN. Copy .env.example to .env and add your Cesium ion token from https://ion.cesium.com/tokens.'
  );
}
Ion.defaultAccessToken = token;

// --- Viewer -----------------------------------------------------------------
const viewer = new Viewer('cesiumContainer', {
  baseLayerPicker: false,
  geocoder: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  homeButton: false,
});

// --- ISS orbit --------------------------------------------------------------
const start = JulianDate.now();
const stop = JulianDate.addSeconds(start, 93 * 60, new JulianDate());
const positions = sampleIssOrbit(ISS_TLE, start, 93 * 60, 10);

// --- Entity: orbit path + 3D model ------------------------------------------
// Upload your own ISS glTF to Cesium ion and paste the asset ID here.
// See TUTORIAL.md, Part 6.
const ISS_ION_ASSET_ID = 1234567;

const iss = viewer.entities.add({
  id: 'iss',
  name: ISS_TLE.name,
  position: positions,
  // Auto-orient the model so its +X axis points along the direction of travel.
  orientation: new VelocityOrientationProperty(positions),
  model: {
    uri: await IonResource.fromAssetId(ISS_ION_ASSET_ID),
    // Keep the satellite visible even when the camera is far away.
    minimumPixelSize: 64,
    maximumScale: 20_000,
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

// Park the camera near the ISS's starting position.
const issStart = iss.position.getValue(start);
viewer.camera.flyTo({
  destination: Cartesian3.multiplyByScalar(issStart, 1.5, new Cartesian3()),
  duration: 0,
});
