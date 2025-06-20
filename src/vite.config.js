import { defineConfig } from 'vite';

export default defineConfig({
  base: '/AI-expense-tracker-pwa/',
  server: {
    // Allow cross-origin requests during development
    cors: true,
    // Add headers to allow Google scripts with broader scope
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' https://*.google.com https://*.googleapis.com https://apis.google.com https://accounts.google.com 'unsafe-inline' 'unsafe-eval' blob:; connect-src 'self' https://*.googleapis.com https://*.google.com https://www.googleapis.com https://apis.google.com https://accounts.google.com https://content.googleapis.com https://generativelanguage.googleapis.com; style-src 'self' 'unsafe-inline'; frame-src https://accounts.google.com https://content.googleapis.com https://*.google.com https://*.gstatic.com; img-src 'self' https://lh3.googleusercontent.com https://*.google.com https://*.gstatic.com data:;",
    },
  },
  build: {
    // Ensure our external scripts are handled properly
    rollupOptions: {
      external: [
        '/src/googleDrive.js',
      ],
      output: {
        // Ensure proper handling of dynamic imports
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
          if (id.includes('googleDrive.js')) {
            return 'google-api';
          }
        }
      }
    }
  },
  optimizeDeps: {
    // Exclude Google API scripts from optimization
    exclude: ['gapi', 'google-accounts'],
  }
});
