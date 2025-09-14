import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Vite config with web root under src/web and build output into dist/client
export default defineConfig({
  root: path.resolve(__dirname, 'src/web'),
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/client'),
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@web': path.resolve(__dirname, 'src/web'),
    }
  }
})

