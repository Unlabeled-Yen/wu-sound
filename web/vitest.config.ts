import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      // `server-only` 是 Next 自己注入的守衛套件,node 下沒有實體可解析。
      // 指到一個空模組讓單元測試能 import 這些 server-side lib;
      // 正式 build 走 Next 的解析,守衛照舊生效。
      'server-only': path.resolve(__dirname, './lib/__tests__/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
  },
});
