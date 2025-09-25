import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      crypto: 'crypto-browserify',
    },
  },
  define: {
    'global.crypto': {
      getRandomValues: (arr) => {
        const { randomBytes } = require('crypto');
        const bytes = randomBytes(arr.length);
        for (let i = 0; i < arr.length; i++) {
          arr[i] = bytes[i];
        }
        return arr;
      },
    },
  },
});