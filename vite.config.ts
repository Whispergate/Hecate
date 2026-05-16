import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 3000,
    proxy: {
      // Proxy REST calls to Mythic backend (adjust host/port as needed)
      '/api': {
        target: 'https://localhost:7443',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
