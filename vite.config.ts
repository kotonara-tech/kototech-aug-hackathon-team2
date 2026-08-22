import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => ({
  root: 'src/web',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: mode === 'demo' ? 5180 : 5173,
    strictPort: mode === 'demo',
    // '^' 始まりのキーは正規表現として扱われる。前方一致の '/api' にすると
    // フロントの /api.ts まで転送されてモジュール読込が 404 になる。
    proxy: {
      '^/api/': process.env.VITE_API_TARGET ?? (mode === 'demo' ? 'http://localhost:8790' : 'http://localhost:8787'),
    },
  },
  build: { outDir: '../../dist/web', emptyOutDir: true },
}))
