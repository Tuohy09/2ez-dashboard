import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { sourcemap: true },
  server: {
    proxy: {
      '/qbt': { target: process.env.QBT_PROXY_TARGET || 'http://127.0.0.1:3080', changeOrigin: false },
      '/stack-api': { target: 'http://127.0.0.1:3080', changeOrigin: false },
      '/sys-api':   { target: 'http://192.168.0.170:3080',  changeOrigin: true },
      '/terminal':  { target: 'http://192.168.0.170:3080',  changeOrigin: true, ws: true },
      '/speedtest': { target: 'http://192.168.0.170:8083',  changeOrigin: true, rewrite: (p) => p.replace(/^\/speedtest/, '') },
    }
  }
})
