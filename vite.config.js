import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Use relative base path for GitHub Pages subdirectory and Capacitor file:// support
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
