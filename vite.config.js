import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

// Vite automatically exposes variables prefixed with VITE_ on import.meta.env.
// Copy .env.example to .env and add your Cesium ion token.
export default defineConfig({
  plugins: [cesium()],
  // Relative base so asset URLs work on any path prefix (local dev server
  // and GitHub Pages alike — no need to hard-code the repo name here).
  base: './',
  // Allow top-level await. Modern evergreen browsers all support it.
  build: { target: 'esnext' },
});
