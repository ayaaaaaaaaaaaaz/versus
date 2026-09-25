import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Vite does not read PORT on its own. Honouring it lets a supervisor assign
    // a free port when 5173 is already taken - for instance when a dev server
    // is already running in a terminal - instead of failing to start.
    port: Number(process.env.PORT) || 5173,
    // Forwards EVDS calls to the Pages Function during local dev so the browser
    // never sees the API key. Run `npm run api` alongside `npm run dev`.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Function form rather than the object map: it is understood by both
        // the Rollup and Rolldown backends Vite can use.
        manualChunks(id: string) {
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) {
            return 'charts';
          }
          if (id.includes('framer-motion') || id.includes('/motion-')) return 'motion';
          return undefined;
        },
      },
    },
  },
});
