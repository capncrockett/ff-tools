import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

const root = import.meta.dirname

// Vite config with web root under src/web and build output into dist/client
export default defineConfig({
  root: path.resolve(root, 'src/web'),
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '^/api/': 'http://127.0.0.1:3000',
    },
  },
  build: {
    outDir: path.resolve(root, 'dist/client'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@web': path.resolve(root, 'src/web'),
    },
  },
})
