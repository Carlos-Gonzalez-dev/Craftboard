import { fileURLToPath, URL } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read changelog.ts to get the latest version
const changelogPath = join(__dirname, 'src/utils/changelog.ts')
const changelogContent = readFileSync(changelogPath, 'utf-8')

// Extract the first date entry from changelog
const dateMatch = changelogContent.match(/date:\s*['"]([^'"]+)['"]/)
const appVersion = dateMatch ? dateMatch[1] : '2025-12-25'

// https://vite.dev/config/
export default defineConfig({
  base: '/', // Change this to '/subdirectory/' if serving from a subdirectory
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    // Plugin to generate version.txt during build
    {
      name: 'generate-version-file',
      closeBundle() {
        const versionFilePath = join(__dirname, 'dist/version.txt')
        writeFileSync(versionFilePath, appVersion, 'utf-8')
        console.log(`Generated version.txt with version: ${appVersion}`)
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Put all files in the root instead of an assets folder
    assetsDir: '',
    rollupOptions: {
      output: {
        assetFileNames: '[name].[ext]',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
    },
  },
})
