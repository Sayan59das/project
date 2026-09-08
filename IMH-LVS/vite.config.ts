import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    watch: {
      // backend/ is a separate Node/Express app with its own dev process and
      // no files Vite needs to react to — but it DOES need excluding, not
      // just ignoring: backend/uploads/artworks/ now receives real files at
      // request time (see backend/src/services/artworkFileStorage.service.ts),
      // and Vite's watcher (chokidar) crashed the whole dev server with an
      // EBUSY error the first time a file appeared there while it was mid-scan.
      ignored: ['**/backend/**']
    }
  }
});
