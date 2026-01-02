import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    return {
      // ✅ Dev server config (unchanged)
      server: {
        port: 3000,
        host: '0.0.0.0',
      },

      // ✅ Plugins
      plugins: [react()],

      // ✅ Environment variables
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      },

      // ✅ Module resolution aliases
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
      },

      // ✅ Fix blank page on GitHub Pages
      base: '/noble-care-academy-sms/', // <-- ADD THIS LINE
    };
});
