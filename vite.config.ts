import path from 'node:path'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: process.cwd(),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/frontend/routes',
      generatedRouteTree: './src/frontend/routeTree.gen.ts',
      routeFileIgnorePrefix: '-',
      // Routes are flat top-level files; these subfolders hold colocated
      // components/helpers, not routes. Pattern is matched against each
      // dirent name (not full path), anchored so it ignores the folders
      // without touching the sibling route files (pm.tsx, qc.tsx, ...).
      routeFileIgnorePattern: '^(pm|qc|home|settings|admin_report)$',
      quoteStyle: 'single',
    }),
    react(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
})
