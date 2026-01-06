/**
 * Admin Provider Management Service
 *
 * This service handles administrative functions for managing credit providers including:
 * - Provider onboarding workflow
 * - Integration service management
 * - Margin configuration and calculation
 * - Customer service request handling
 * - Performance monitoring and analytics
 */

// Export main services
export { AdminProviderOnboardingService } from './services/admin-provider-onboarding-service';
export { IntegrationService } from './services/integration-service';
export { MarginCalculationService } from './services/margin-calculation-service';
export { NotificationService } from './services/notification-service';

// Export repository
export { AdminProviderRepository } from './repositories/admin-provider-repository';

// Export types
export {
  // Schemas
  AdminProviderOnboardingSchema,
  IntegrationServiceConfigSchema,
  MarginConfigurationSchema,
  ProviderPerformanceSchema,
  AdminActionLogSchema,
  CustomerServiceRequestSchema,
  RevenueDashboardSchema,

  // Types
  type AdminProviderOnboarding,
  type IntegrationServiceConfig,
  type MarginConfiguration,
  type ProviderPerformance,
  type AdminActionLog,
  type CustomerServiceRequest,
  type RevenueDashboard,

  // Errors
  AdminProviderManagementError,
  IntegrationServiceError,
  MarginConfigurationError
} from './types/admin-provider-management';

// Export notification types
export type {
  ProviderOnboardingNotification,
  ProviderApprovalNotification,
  ProviderRejectionNotification,
  ServiceRequestNotification,
  MarginUpdateNotification,
  IntegrationProjectNotification,
  CustomIntegrationNotification,
  APISetupNotification,
  DeploymentNotification,
  NotificationChannelConfig
} from './services/notification-service';

// Export repository types
export type {
  Engineer,
  ProviderOnboardingRecord,
  CustomIntegration,
  IntegrationDeployment,
  ProviderAPIConfig
} from './repositories/admin-provider-repository';

// Service name constant for service registry
export const SERVICE_NAME = 'admin-provider-management';
export const SERVICE_VERSION = '1.0.0';
