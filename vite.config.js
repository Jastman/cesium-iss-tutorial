import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [cesium()],
  server: {
    proxy: {
      '/api/iss-tle': {
        target: 'https://celestrak.org',
        changeOrigin: true,
        rewrite: () => '/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE',
      },
      '/api/iss-now': {
        target: 'http://api.open-notify.org',
        changeOrigin: true,
        rewrite: () => '/iss-now.json',
      },
    },
  },
  preview: {
    proxy: {
      '/api/iss-tle': {
        target: 'https://celestrak.org',
        changeOrigin: true,
        rewrite: () => '/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE',
      },
      '/api/iss-now': {
        target: 'http://api.open-notify.org',
        changeOrigin: true,
        rewrite: () => '/iss-now.json',
      },
    },
  },
  build: { target: 'esnext' },
});
