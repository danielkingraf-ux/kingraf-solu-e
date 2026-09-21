import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Carimbo da versao: aparece no rodape do menu. E o que responde "o PC da
// maquina esta com o app novo?" sem ninguem precisar abrir o DevTools.
const VERSAO = new Date().toISOString().slice(0, 16).replace("T", " ");

export default defineConfig({
  define: {
    __VERSAO_APP__: JSON.stringify(VERSAO),
  },
  server: {
    port: 8080
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'KINGRAF - Plataforma de Producao',
        short_name: 'KINGRAF',
        description: 'Plataforma Unificada de Producao, Qualidade e Etiquetas',
        start_url: '/',
        display: 'standalone',
        background_color: '#1a1a1a',
        theme_color: '#f59e0b',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        // O PC do setor fica semanas com a mesma aba aberta. Sem estas tres
        // linhas o app novo so entra quando todas as abas fecham, e o operador
        // segue trabalhando com a versao velha sem saber.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true
      }
    })
  ]
})
