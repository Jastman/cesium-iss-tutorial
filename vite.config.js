import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

// Vite automatically exposes variables prefixed with VITE_ on import.meta.env.
// Copy .env.example to .env and add your Cesium ion token.
export default defineConfig({
  plugins: [cesium()],
  // Use the repo name as the base path when building for GitHub Pages so
  // asset URLs are correct. Locally (no GITHUB_ACTIONS env var) keep '/'
  // so the dev server works without any path prefix.
  base: process.env.GITHUB_ACTIONS ? '/cesium-iss-tutorial/' : '/',
  // Allow top-level await. Modern evergreen browsers all support it.
  build: { target: 'esnext' },
});
