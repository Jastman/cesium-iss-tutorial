import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

// Vite automatically exposes variables prefixed with VITE_ on import.meta.env.
// Copy .env.example to .env and add your Cesium ion token.
export default defineConfig({
  plugins: [cesium()],
});
