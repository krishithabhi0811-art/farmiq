import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The frontend NEVER holds secrets. It only knows one thing:
// where the backend lives (VITE_API_BASE_URL), which is a public URL.
export default defineConfig({
  plugins: [react()],
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
