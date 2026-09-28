import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Built into ../app-dist and served by server/platform.js at /app.
// Stable file names (no content hash) so a rebuild overwrites in place —
// the device shell cannot delete old hashed bundles. Freshness comes from the
// server's must-revalidate caching headers instead.
export default defineConfig({
  base: '/app/',
  plugins: [react()],
  build: {
    outDir: '../app-dist',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: {
    // `npm run dev` proxies API and legacy pages/CSS to the Express server.
    proxy: { '/api': 'http://localhost:3000', '/css': 'http://localhost:3000', '/js': 'http://localhost:3000',
             '/icons': 'http://localhost:3000', '/login': 'http://localhost:3000' },
  },
});
