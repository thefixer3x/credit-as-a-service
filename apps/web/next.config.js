/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  experimental: {
    externalDir: true,
  },
  webpack: (config, { isServer }) => {
    // Add workspace packages to module resolution
    config.resolve.alias = {
      ...config.resolve.alias,
      '@caas/ui-kit': path.resolve(__dirname, '../../packages/ui-kit/src'),
      '@caas/ui-kit/styles': path.resolve(__dirname, '../../packages/ui-kit/dist/styles.css'),
      '@caas/common': path.resolve(__dirname, '../../packages/common/src'),
      '@caas/sdk': path.resolve(__dirname, '../../packages/sdk/src'),
      '@caas/config': path.resolve(__dirname, '../../packages/config/src'),
      '@caas/types': path.resolve(__dirname, '../../packages/types/src'),
    }

    return config
  },
}

module.exports = nextConfig
