import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    rollupOptions: {
      output: {
        // Separa libs grandes em chunks próprios para melhor cache entre deploys.
        // rolldown (Vite 8) exige manualChunks como função.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@fullcalendar')) return 'fullcalendar';
            if (id.includes('/firebase/') || id.includes('@firebase')) return 'firebase';
          }
        },
      },
    },
  },
})
