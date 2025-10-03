import type { Config } from 'tailwindcss';
import uiKitConfig from '@caas/ui-kit/tailwind';

const config: Config = {
  ...uiKitConfig,
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui-kit/src/**/*.{js,ts,jsx,tsx}',
  ],
};

export default config;