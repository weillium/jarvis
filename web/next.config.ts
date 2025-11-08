import type { NextConfig } from "next";
const workspaceRoot = process.cwd();

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  turbopack: {
    root: workspaceRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
    unoptimized: false,
  },
};

export default nextConfig;
