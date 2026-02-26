import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: '/maplibre-gl-geophoto/',
  build: {
    outDir: 'dist-examples',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        basic: resolve(__dirname, 'examples/basic/index.html'),
        react: resolve(__dirname, 'examples/react/index.html'),
        streetview: resolve(__dirname, 'examples/streetview/index.html'),
        'streetview-react': resolve(__dirname, 'examples/streetview-react/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
