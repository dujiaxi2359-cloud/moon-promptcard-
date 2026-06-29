import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Content script build: a single self-contained IIFE bundle (React inlined),
// written into the same dist/ folder without wiping the main build output.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content/content-script.tsx'),
      name: 'MoonPromptCardContent',
      formats: ['iife'],
      fileName: () => 'content-script.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: 'content-style.css',
        extend: true,
      },
    },
    target: 'esnext',
    minify: false,
    sourcemap: false,
  },
});
