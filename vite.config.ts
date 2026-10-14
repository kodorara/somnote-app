/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/somnote-app/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'SomNote後継',
        short_name: 'SomNote',
        lang: 'ja',
        start_url: '.',
        display: 'standalone',
        theme_color: '#161826',
        background_color: '#161826',
        // GitHub Pagesの/somnote-app/サブパス配下にホストされているため、先頭'/'の
        // 絶対パスだとドメインルート(存在しない)を指してしまい404になる。相対パスに
        // することでmanifest.webmanifest自身の場所(/somnote-app/)基準で解決させる。
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
  },
})
