import { pgTable, uuid, timestamp, text, boolean, integer } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

// Base fields for all entities with multi-tenancy and audit trails
export const baseFields = {
  id: uuid('id').primaryKey().$defaultFn(() => nanoid()),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  version: integer('version').default(1).notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: uuid('deleted_by'),
};

// Tenants table for multi-tenancy
export const tenants = pgTable('tenants', {
  ...baseFields,
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  domain: text('domain'),
  status: text('status', { enum: ['active', 'inactive', 'suspended'] }).default('active').notNull(),
  settings: text('settings'), // JSON settings
  subscriptionTier: text('subscription_tier', {
    enum: ['free', 'starter', 'professional', 'enterprise']
  }).default('free').notNull(),
});

// Organizations table (businesses using the platform)
export const organizations = pgTable('organizations', {
  ...baseFields,
  legalName: text('legal_name').notNull(),
  tradingName: text('trading_name'),
  registrationNumber: text('registration_number').notNull(),
  taxId: text('tax_id'),
  industry: text('industry').notNull(),
  businessType: text('business_type', {
    enum: ['sole_proprietorship', 'partnership', 'llc', 'corporation', 'cooperative']
  }).notNull(),
  incorporationDate: timestamp('incorporation_date'),
  numberOfEmployees: integer('number_of_employees'),
  annualRevenue: integer('annual_revenue'), // In cents
  website: text('website'),
  description: text('description'),
  contactEmail: text('contact_email').notNull(),
  contactPhone: text('contact_phone'),
  kybStatus: text('kyb_status', {
    enum: ['unverified', 'pending', 'verified', 'rejected']
  }).default('unverified').notNull(),
  riskRating: text('risk_rating', { enum: ['low', 'medium', 'high'] }),
  creditRating: text('credit_rating'),
  // Address fields
  streetAddress: text('street_address'),
  city: text('city'),
  state: text('state'),
  postalCode: text('postal_code'),
  country: text('country'),
  latitude: text('latitude'),
  longitude: text('longitude'),
});

// Audit log table for compliance
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().$defaultFn(() => nanoid()),
  tenantId: uuid('tenant_id').notNull(),
  entityType: text('entity_type').notNull(), // table name
  entityId: uuid('entity_id').notNull(),
  operation: text('operation', { enum: ['create', 'update', 'delete', 'read'] }).notNull(),
  oldValues: text('old_values'), // JSON
  newValues: text('new_values'), // JSON
  actorId: uuid('actor_id'),
  actorType: text('actor_type', { enum: ['user', 'system', 'api'] }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  correlationId: uuid('correlation_id'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  metadata: text('metadata'), // JSON for additional context
});

// Event store for event sourcing financial transactions
export const eventStore = pgTable('event_store', {
  id: uuid('id').primaryKey().$defaultFn(() => nanoid()),
  tenantId: uuid('tenant_id').notNull(),
  aggregateType: text('aggregate_type').notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  eventType: text('event_type').notNull(),
  eventVersion: integer('event_version').notNull(),
  eventData: text('event_data').notNull(), // JSON
  metadata: text('metadata'), // JSON
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  sequenceNumber: integer('sequence_number').notNull(),
  causationId: uuid('causation_id'),
  correlationId: uuid('correlation_id'),
});