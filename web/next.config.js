const nextConfig = {
  experimental: {
    externalDir: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  transpilePackages: ["@jarvis/ui-core", "tamagui", "@tamagui/web"],
};

export default nextConfig;
