import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build stamp — shown in the app (Profile page) so you can always check that
// the same URL is serving your newest code. Never contains secrets.
let buildSha = 'dev';
try { buildSha = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim(); } catch { /* not a git checkout */ }
const buildTime = new Date().toISOString().slice(0, 16).replace('T', ' ');

// The frontend NEVER holds secrets. It only knows one thing:
// where the backend lives (VITE_API_BASE_URL), which is a public URL.
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true, // allow the Arena live-preview host
    proxy: {
      // dev convenience: /api/* → local Express server (keeps browser same-origin)
      '/api': {
        target: process.env.VITE_DEV_API || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1200 },
});
