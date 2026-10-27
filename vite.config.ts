import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 前端代码放在 client 目录，构建产物输出到根目录 dist
// base 使用相对路径，方便部署到 GitHub Pages 的子路径下
export default defineConfig({
  root: 'client',
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // antd 整体打包（含 Table / Dropdown 等账号管理组件）约 1.2MB，属预期体积
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
        },
      },
    },
  },
});
