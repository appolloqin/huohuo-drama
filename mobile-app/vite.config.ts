import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

export default defineConfig({
  plugins: [uni()],
  server: {
    port: 48555,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:18555',
        changeOrigin: true,
      },
    },
  },
})
