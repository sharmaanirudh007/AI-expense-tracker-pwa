import { defineConfig } from 'vite';

export default defineConfig({
  base: '/AI-expense-tracker-pwa/',
  server: {
    headers: {
      'Service-Worker-Allowed': '/'
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html'
      }
    }
  }
});
