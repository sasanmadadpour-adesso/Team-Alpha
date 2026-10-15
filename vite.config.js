import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Makes the production build work when dist/index.html is opened directly.
  base: './'
});
