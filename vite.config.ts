import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Ziel des lokalen Node-Servers (siehe server/index.mjs), für Entwicklung und Vorschau. */
const API_TARGET = process.env.API_TARGET ?? 'http://127.0.0.1:8787';
const apiProxy = { '/api': { target: API_TARGET, changeOrigin: false } };

export default defineConfig({
  plugins: [react()],
  // api/… ist im Client relativ gehalten; beim Entwickeln und in der Vorschau läuft es
  // über diesen Proxy zum Node-Server, in Produktion über den Reverse-Proxy (Caddy).
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
