/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativa: o build funciona em GitHub Pages (subpasta) e em qualquer servidor estático.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
