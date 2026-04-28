import { Ion, Viewer } from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './style.css';

// --- Cesium ion token -------------------------------------------------------
const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
if (!token || token === 'your_token_here') {
  throw new Error(
    'Missing VITE_CESIUM_ION_TOKEN. Copy .env.example to .env and add your Cesium ion token from https://ion.cesium.com/tokens.'
  );
}
Ion.defaultAccessToken = token;

// --- Viewer -----------------------------------------------------------------
new Viewer('cesiumContainer', {
  baseLayerPicker: false,
  geocoder: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  homeButton: false,
});
