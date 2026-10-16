import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: mode === 'overview' ? 'http://localhost:4020' : 'http://localhost:4004', changeOrigin: true },
      '/odata': {
        target: mode === 'overview' ? 'http://localhost:4020' : 'http://localhost:4004',
        changeOrigin: true,
      },
    },
  },
}));
