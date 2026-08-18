import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // 開發模式:允許同一區網內的手機直連本機 dev server 測試(手機版預覽用)。
  // 只影響 dev 模式的熱重載連線,不影響正式 build。
  allowedDevOrigins: ['192.168.0.78'],
};

export default nextConfig;
