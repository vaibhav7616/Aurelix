import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const devTarget = process.env.VITE_DEV_PROXY || (process.env.API_PORT ? `http://localhost:${process.env.API_PORT}` : 'http://localhost:3000');

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': { target: devTarget, changeOrigin: true },
      '/socket.io': { target: devTarget, changeOrigin: true, ws: true },
    },
  },
  preview: { host: '0.0.0.0', port: 5173 },
  build: { sourcemap: false, chunkSizeWarningLimit: 1200 },
});
