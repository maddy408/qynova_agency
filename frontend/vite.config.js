import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      devOptions: {
        enabled: true, // generate + register the SW under `npm run dev` too, not just build
        type: 'module',
      },
      manifest: {
        name: 'AJ Agency',
        short_name: 'AJ Agency',
        description: 'Multi-branch, role-based POS + distributor billing system',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#F6F2E8',
        theme_color: '#171E2B',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App-shell + static-asset caching only. POS billing is NOT cached
        // offline-first — invoice numbering, stock, and payments all need a
        // live server round-trip, so every /api/* call bypasses the SW
        // (NetworkOnly) rather than risking a stale/queued write. True
        // offline billing is a deliberate non-goal for now — see README.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/api\/.*/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
});
