// Next.js 프레임워크 설정. 빌드 옵션, 리다이렉트, 이미지 도메인 허용 등을 여기서 관리한다.
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: { NEXT_TELEMETRY_DISABLED: "1" },
  output: 'standalone',
};

export default nextConfig;
