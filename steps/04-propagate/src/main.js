import { Ion, JulianDate, Viewer } from 'cesium';
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
// Sample one full orbit (~93 min) at 10-second cadence.
const start = JulianDate.now();
const stop = JulianDate.addSeconds(start, 93 * 60, new JulianDate());
const positions = sampleIssOrbit(ISS_TLE, start, 93 * 60, 10);

// Nothing to render yet — next part we attach these positions to an entity.
console.log('ISS positions sampled:', positions);
console.log('Start:', start.toString(), 'Stop:', stop.toString());
