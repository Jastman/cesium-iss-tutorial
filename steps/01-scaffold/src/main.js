import { Ion, Viewer } from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './style.css';

// --- Cesium ion token -------------------------------------------------------
// Loaded from .env (see .env.example). Never commit your token to git.
const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
if (!token) {
  throw new Error(
    'Missing VITE_CESIUM_ION_TOKEN. Copy .env.example to .env and add your Cesium ion token.'
  );
}
Ion.defaultAccessToken = token;

// --- Viewer -----------------------------------------------------------------
// Part 1 goal: just render the default globe. We'll configure terrain and
// Photorealistic 3D Tiles in Part 2.
new Viewer('cesiumContainer');
