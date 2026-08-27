import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { execSync } from 'child_process';

const gitSha = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'unknown'; }
})();

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    define: {
      __GIT_SHA__: JSON.stringify(gitSha),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
      strictPort: false,
      host: '127.0.0.1',
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
    test: {
      // Each nested application has its own toolchain and test environment.
      // In particular, email-worker tests require the Workers pool and must be
      // run from email-worker rather than imported by the root Vitest process.
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        'email-worker/**',
        'deploy/aliyun/mail-ingest/**',
        'gsyen-api/**',
        'gsyen-android/**',
        'gsyen-model/**',
        'halfsphere/**',
        'sgsyen-api/**',
        'sgsyen-web/**',
      ],
    },
  };
});
