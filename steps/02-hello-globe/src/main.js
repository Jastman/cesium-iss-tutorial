import { Ion, Viewer } from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './style.css';

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
// Default Cesium Viewer with its default tilted home view. For a space-themed
// tracker we don't need terrain, buildings, or photorealistic tiles — the ISS
// orbits ~400 km up, so ground detail isn't the focus.
new Viewer('cesiumContainer', {
  timeline: false,
  animation: false,
  baseLayerPicker: false,
  geocoder: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  homeButton: false,
});
