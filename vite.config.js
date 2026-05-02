import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api':       { target: 'http://192.168.0.170:61208', changeOrigin: true },
      '/qbt':       { target: 'http://192.168.0.170:8080',  changeOrigin: true, cookieDomainRewrite: 'localhost', rewrite: (p) => p.replace(/^\/qbt/, '') },
      '/jellyfin':  { target: 'https://2ez.dinosaur-banana.ts.net', changeOrigin: true },
      '/navidrome': { target: 'https://2ez.dinosaur-banana.ts.net', changeOrigin: true },
      '/unmanic':   { target: 'http://192.168.0.170:8888',  changeOrigin: true },
      '/speedtest': { target: 'http://192.168.0.170:8083',  changeOrigin: true },
    }
  }
})
