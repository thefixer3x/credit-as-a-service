export interface NotificationTemplate {
  id: string;
  name: string;
  description: string;
  type: 'email' | 'sms' | 'push' | 'whatsapp' | 'webhook';
  category: 'transactional' | 'marketing' | 'system' | 'alert';
  subject?: string; // For email/push
  bodyTemplate: string;
  variables: string[];
  isActive: boolean;
  language: string;
  version: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationMessage {
  id: string;
  userId?: string;
  templateId?: string;
  type: 'email' | 'sms' | 'push' | 'whatsapp' | 'webhook';
  category: 'transactional' | 'marketing' | 'system' | 'alert';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'processing' | 'sent' | 'delivered' | 'failed' | 'cancelled';
  recipient: NotificationRecipient;
  subject?: string;
  content: string;
  variables?: Record<string, any>;
  scheduledFor?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  provider?: string;
  providerMessageId?: string;
  providerResponse?: Record<string, any>;
  sourceSystem?: string;
  sourceReference?: string;
  tags: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationRecipient {
  id?: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  pushTokens?: string[];
  whatsappNumber?: string;
  webhookUrl?: string;
  preferences?: NotificationPreferences;
  timezone?: string;
  language?: string;
}

export interface NotificationPreferences {
  email: {
    enabled: boolean;
    categories?: string[];
    frequency?: 'immediate' | 'daily' | 'weekly';
    quietHours?: { start: string; end: string };
  };
  sms: {
    enabled: boolean;
    categories?: string[];
    frequency?: 'immediate' | 'daily';
    quietHours?: { start: string; end: string };
  };
  push: {
    enabled: boolean;
    categories?: string[];
    frequency?: 'immediate' | 'daily';
    quietHours?: { start: string; end: string };
  };
  whatsapp: {
    enabled: boolean;
    categories?: string[];
    frequency?: 'immediate' | 'daily';
    quietHours?: { start: string; end: string };
  };
  webhook: {
    enabled: boolean;
    url?: string;
    secret?: string;
    events?: string[];
  };
  unsubscribeAll: boolean;
  unsubscribedCategories: string[];
}

export interface NotificationCampaign {
  id: string;
  name: string;
  description: string;
  type: 'broadcast' | 'triggered' | 'scheduled';
  category: 'marketing' | 'system' | 'alert';
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'cancelled';
  templateId: string;
  audience: {
    targetType: 'all_users' | 'segment' | 'individual';
    segmentCriteria?: Record<string, any>;
    userIds?: string[];
    estimatedSize?: number;
  };
  schedule?: {
    startDate: Date;
    endDate?: Date;
    frequency?: 'once' | 'daily' | 'weekly' | 'monthly';
    timeZone?: string;
    sendTime?: string; // HH:MM format
  };
  trigger?: {
    event: string;
    conditions?: Record<string, any>;
    delay?: number; // minutes
  };
  analytics: {
    totalSent: number;
    totalDelivered: number;
    totalFailed: number;
    totalOpened?: number;
    totalClicked?: number;
    totalUnsubscribed?: number;
    deliveryRate: number;
    openRate?: number;
    clickRate?: number;
  };
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationProvider {
  id: string;
  name: string;
  type: 'email' | 'sms' | 'push' | 'whatsapp';
  provider: 'sendgrid' | 'mailgun' | 'ses' | 'twilio' | 'firebase' | 'apns' | 'custom';
  isActive: boolean;
  isPrimary: boolean;
  configuration: {
    apiKey?: string;
    apiSecret?: string;
    sender?: string;
    webhookSecret?: string;
    region?: string;
    endpoint?: string;
    customHeaders?: Record<string, string>;
  };
  limits: {
    dailyLimit?: number;
    monthlyLimit?: number;
    rateLimit?: number; // per minute
  };
  usage: {
    dailyCount: number;
    monthlyCount: number;
    lastReset: Date;
  };
  healthStatus: 'healthy' | 'degraded' | 'down';
  lastHealthCheck: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationRule {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  eventType: string;
  conditions: Array<{
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
    value: any;
  }>;
  actions: Array<{
    type: 'send_notification' | 'create_campaign' | 'update_preferences';
    templateId?: string;
    delay?: number; // minutes
    recipientField?: string;
    variables?: Record<string, string>;
  }>;
  throttling?: {
    enabled: boolean;
    maxPerUser?: number;
    timeWindow?: number; // minutes
    cooldownPeriod?: number; // minutes
  };
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationQueue {
  id: string;
  name: string;
  type: 'immediate' | 'scheduled' | 'batch';
  status: 'active' | 'paused' | 'draining';
  priority: number;
  processingRate: number; // messages per minute
  maxConcurrency: number;
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number; // seconds
    maxDelay: number; // seconds
  };
  deadLetterQueue?: string;
  metrics: {
    pendingCount: number;
    processingCount: number;
    completedCount: number;
    failedCount: number;
    averageProcessingTime: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationEvent {
  id: string;
  type: 'message_sent' | 'message_delivered' | 'message_failed' | 'campaign_started' | 
        'campaign_completed' | 'provider_error' | 'user_unsubscribed' | 'bounce' | 'complaint';
  messageId?: string;
  campaignId?: string;
  userId?: string;
  provider?: string;
  data: Record<string, any>;
  timestamp: Date;
  processedAt?: Date;
  webhookDelivered?: boolean;
  webhookDeliveredAt?: Date;
}

export interface NotificationAnalytics {
  period: string;
  totalMessages: number;
  messagesByType: Record<string, number>;
  messagesByStatus: Record<string, number>;
  messagesByProvider: Record<string, number>;
  deliveryRate: number;
  failureRate: number;
  averageDeliveryTime: number;
  bounceRate: number;
  unsubscribeRate: number;
  engagement: {
    openRate: number;
    clickRate: number;
    conversionRate: number;
  };
  providerPerformance: Array<{
    provider: string;
    totalSent: number;
    deliveryRate: number;
    averageDeliveryTime: number;
    errorRate: number;
  }>;
  trends: {
    volumeTrend: Array<{ date: string; count: number }>;
    deliveryTrend: Array<{ date: string; rate: number }>;
    engagementTrend: Array<{ date: string; rate: number }>;
  };
  topTemplates: Array<{
    templateId: string;
    templateName: string;
    totalSent: number;
    deliveryRate: number;
    engagementRate: number;
  }>;
}

export interface WebhookDelivery {
  id: string;
  url: string;
  event: string;
  payload: Record<string, any>;
  signature?: string;
  status: 'pending' | 'delivered' | 'failed' | 'retrying';
  httpStatus?: number;
  response?: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationSettings {
  providers: {
    email: {
      primary: string;
      fallback?: string;
      defaultSender: string;
      replyTo?: string;
    };
    sms: {
      primary: string;
      fallback?: string;
      defaultSender: string;
    };
    push: {
      primary: string;
      fallback?: string;
    };
    whatsapp: {
      primary: string;
      fallback?: string;
      defaultSender: string;
    };
  };
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
    maxDelay: number;
  };
  rateLimiting: {
    enabled: boolean;
    globalLimit: number; // per minute
    perUserLimit: number; // per minute
    perProviderLimit: Record<string, number>;
  };
  queueSettings: {
    defaultQueue: string;
    batchSize: number;
    processingInterval: number; // seconds
    visibilityTimeout: number; // seconds
  };
  webhookSettings: {
    enabled: boolean;
    signatureSecret: string;
    timeout: number; // seconds
    maxRetries: number;
  };
  complianceSettings: {
    gdprCompliant: boolean;
    optInRequired: boolean;
    unsubscribeRequired: boolean;
    dataRetentionDays: number;
    blacklistEnabled: boolean;
  };
  monitoringSettings: {
    healthCheckInterval: number; // minutes
    alertThresholds: {
      failureRate: number;
      deliveryTime: number; // seconds
      queueDepth: number;
    };
    alertRecipients: string[];
  };
}

export interface UnsubscribeRequest {
  id: string;
  userId?: string;
  email?: string;
  phoneNumber?: string;
  type: 'email' | 'sms' | 'push' | 'whatsapp' | 'all';
  categories?: string[];
  reason?: string;
  source: 'user_request' | 'bounce' | 'complaint' | 'admin' | 'api';
  token?: string;
  processedAt?: Date;
  createdAt: Date;
}

export interface NotificationBlacklist {
  id: string;
  type: 'email' | 'phone' | 'push_token';
  value: string;
  reason: 'user_request' | 'bounce' | 'complaint' | 'spam' | 'invalid' | 'admin';
  source?: string;
  addedBy?: string;
  expiresAt?: Date;
  createdAt: Date;
}

export interface DeliveryStatus {
  messageId: string;
  status: 'pending' | 'processing' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'complained';
  provider: string;
  providerMessageId?: string;
  deliveryAttempts: Array<{
    timestamp: Date;
    status: string;
    response?: string;
    errorCode?: string;
  }>;
  finalStatus?: string;
  finalStatusAt?: Date;
  metadata?: Record<string, any>;
}