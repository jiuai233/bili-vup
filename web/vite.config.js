import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react()
    // 已移除 viteCompression，因为有底层 Bug 会在 Windows 产出带有绝对路径前缀的异常带壳文件。
    // 在宝塔面板中，Nginx 会默认全自动为您提供实时的动态 gzip 压缩，且效率完全一样！
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3009",
        changeOrigin: true,
      },
    },
  },
  build: {
    // 拉高警告红线，压榨体积
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // 回退至工业级安全对象配置，避免过度撕裂导致的按需加载时序报错
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'antd-icons': ['@ant-design/icons'],
          'antd-core': ['antd'],
          'axios-core': ['axios']
        }
      }
    }
  }
});
