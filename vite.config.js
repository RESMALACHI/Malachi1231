import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// In dev, /sign/<token> gets the signing page's own entry, as vercel.json does
// in production — so what's tested here is what a client opens.
const signPageInDev = {
  name: 'sign-page-dev',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && /^\/sign\/[^.]*$/.test(req.url.split('?')[0])) req.url = '/sign.html'
      next()
    })
  },
}

export default defineConfig({
  plugins: [react(), signPageInDev],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    // Two pages: the meetings app, and the page clients sign on — built apart,
    // so a signing link carries none of the app (see src/signMain.jsx).
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        sign: resolve(__dirname, 'sign.html'),
      },
    },
  },
})
