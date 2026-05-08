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
    chunkSizeWarningLimit: 700,
    // 生产构建 target，支持现代浏览器即可（esnext 可压出更小体积）
    target: 'es2020',
    rollupOptions: {
      output: {
        /**
         * 函数式分包策略（修复对象式 manualChunks 导致的空 chunk 问题）
         *
         * 核心思路：
         * ┌─ react-vendor ──── React + ReactDOM（几乎不变，长期缓存）
         * ├─ react-router ──── 路由（更新频率不同，单独缓存）
         * ├─ antd-core ─────── antd 组件 + 主题 + 工具函数
         * ├─ antd-rc ────────── rc-* / @rc-component（antd 底层 UI 原子，并行加载）
         * ├─ antd-icons ────── @ant-design/icons（按需加载时不会拖慢首屏）
         * ├─ axios ─────────── HTTP 客户端
         * └─ qrcode ─────────── 二维码（仅登录页用到）
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          // ── React 生态 ──
          if (id.includes('/react-dom/') || id.match(/\/react\//))
            return 'react-vendor';
          if (id.includes('/react-router'))
            return 'react-router';

          // ── Ant Design 全家桶（antd + rc-* + icons + dayjs 合为一体，避免循环依赖）──
          if (
            id.includes('/antd/') ||
            id.includes('/@ant-design/') ||
            id.includes('/rc-') ||
            id.includes('/@rc-component/') ||
            id.includes('/dayjs/')
          )
            return 'antd-core';

          // ── 独立工具库 ──
          if (id.includes('/axios/'))
            return 'axios';
          if (id.includes('/qrcode'))
            return 'qrcode';
        }
      }
    }
  }
});
