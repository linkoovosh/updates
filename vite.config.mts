import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'node:path';
import { builtinModules } from 'module';

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // Ensure relative paths for Electron file:// protocol
  resolve: {
    alias: {
      '@common': path.resolve(__dirname, 'common'),
    },
  },
  plugins: [
    react(),
    electron([
      {
        // Main-process entry file of the Electron App.
        entry: 'electron/main.ts',
        vite: { // Add this block for main process
          build: {
            outDir: 'dist-electron',
            lib: {
              entry: 'electron/main.ts',
              formats: ['cjs'],
              fileName: () => 'main.js',
            },
            rollupOptions: {
                // externalize Electron and Node.js modules
                external: ['electron', ...builtinModules],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            lib: {
              entry: 'electron/preload.ts', // Correct path
              formats: ['cjs'],
              fileName: () => 'preload.js',
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
