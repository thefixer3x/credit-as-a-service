/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  transpilePackages: ['@caas/ui-kit', '@caas/sdk'],
  env: {
    CAAS_API_URL: process.env.CAAS_API_URL || 'http://localhost:8000',
    CAAS_API_KEY: process.env.CAAS_API_KEY,
  },
};

export default nextConfig;