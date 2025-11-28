const path = require('path');

const nextConfig = {
  experimental: {
    externalDir: true,
    optimizePackageImports: ['@jarvis/ui-core', 'tamagui', 'dayjs', '@uiw/react-md-editor'],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  transpilePackages: ["@jarvis/ui-core", "tamagui", "@tamagui/web"],
  // Optimize webpack for faster compilation and better code splitting
  webpack: (config, { isServer }) => {
    // Resolve modules from root node_modules (for hoisted dependencies)
    const workspaceRoot = path.resolve(__dirname, '..');
    config.resolve.modules = [
      ...(config.resolve.modules || []),
      path.resolve(workspaceRoot, 'node_modules'),
    ];

    if (!isServer) {
      // Optimize chunk splitting for client-side bundles
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            // Separate vendor chunks for better caching
            tamagui: {
              name: 'tamagui',
              test: /[\\/]node_modules[\\/](@tamagui|tamagui)[\\/]/,
              priority: 30,
              reuseExistingChunk: true,
            },
            dayjs: {
              name: 'dayjs',
              test: /[\\/]node_modules[\\/]dayjs[\\/]/,
              priority: 20,
              reuseExistingChunk: true,
            },
            supabase: {
              name: 'supabase',
              test: /[\\/]node_modules[\\/]@supabase[\\/]/,
              priority: 20,
              reuseExistingChunk: true,
            },
            react: {
              name: 'react',
              test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
              priority: 40,
              reuseExistingChunk: true,
            },
            vendor: {
              name: 'vendor',
              test: /[\\/]node_modules[\\/]/,
              priority: 10,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }
    return config;
  },
};

export default nextConfig;
