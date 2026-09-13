import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_DEV_PROXY ?? 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: process.env.VITE_DEV_PROXY ?? 'http://localhost:4000', changeOrigin: true, ws: true },
    },
  },
  preview: { host: '0.0.0.0', port: 5173 },
  build: { sourcemap: false, chunkSizeWarningLimit: 1200 },
});
