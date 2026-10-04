import { beastDevtools } from '@beastjs/devtools/rsbuild'
import { defineConfig } from '@rsbuild/core'
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'
import { beastOctane } from 'beast-tsrx/rsbuild'
import { fileURLToPath } from 'node:url'
import { marketMiddleware } from './server/middleware'

export default defineConfig(({ env }) => ({
  source: { entry: { index: './src/main.ts' } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // MetaMask SDK has an optional native-only import; this target is the browser.
      '@react-native-async-storage/async-storage': false
    }
  },
  html: { template: './index.html' },
  server: { setup: ({ server }) => { server.middlewares.use(marketMiddleware()) } },
  plugins: [
    pluginTailwindcss(),
    ...beastOctane({ octane: { profile: env === 'development' } }),
    beastDevtools()
  ]
}))
