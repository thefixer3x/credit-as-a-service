/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@caas/ui-kit', '@caas/common'],
  experimental: {
    externalDir: true,
  },
}

module.exports = nextConfig
