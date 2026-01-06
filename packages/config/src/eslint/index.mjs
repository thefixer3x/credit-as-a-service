/**
 * @caas/config ESLint configurations
 *
 * Usage in eslint.config.mjs:
 *
 * import { base, service } from '@caas/config/eslint';
 * export default [...base]; // or [...service] for backend services
 */

export { default as base } from './base.mjs';
export { default as service } from './service.mjs';
