import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` rende il build indipendente dal percorso di pubblicazione
// (es. https://<utente>.github.io/<repository>/): con il routing basato su hash
// non servono riscritture lato server.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
  },
});
