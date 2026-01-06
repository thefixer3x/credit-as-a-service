/**
 * ESLint configuration for Fastify backend services
 * Extends base config with service-specific rules
 */

import baseConfig from './base.mjs';

export default [
  ...baseConfig,
  {
    rules: {
      // Allow console in services for logging
      'no-console': 'off',

      // Stricter type checking for services
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // Require explicit return types on public APIs
      '@typescript-eslint/explicit-function-return-type': ['warn', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
      }],
    },
  },
];
