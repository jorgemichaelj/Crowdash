import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

export default defineConfig({
  plugins: [react(), {
    name: 'extension-manifest',
    generateBundle() {
      const manifest = fs.readFileSync(path.resolve(__dirname, 'manifest.json'), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: manifest });
    },
  }],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'popup.html'),
        background: path.resolve(__dirname, 'src/background/index.ts'),
      },
      output: { entryFileNames: chunk => chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js' },
    },
  },
});
