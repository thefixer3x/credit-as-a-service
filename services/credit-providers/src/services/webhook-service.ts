import crypto from 'crypto';
import { Logger } from '@caas/common';

export interface WebhookDeliveryResult {
  success: boolean;
  status: number;
  responseTime: number;
  error?: string;
}

export interface WebhookServiceConfig {
  timeoutMs?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
}

export class WebhookService {
  private timeoutMs: number;
  private maxRetries: number;
  private retryBackoffMs: number;

  constructor(
    private logger: Logger,
    config: WebhookServiceConfig = {}
  ) {
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryBackoffMs = config.retryBackoffMs ?? 500;
  }

  async sendWebhook(
    providerId: string,
    url: string,
    data: unknown,
    secret?: string
  ): Promise<WebhookDeliveryResult> {
    const payload = JSON.stringify({
      ...this.normalizePayload(data),
      providerId,
    });
    const signature = secret ? this.signPayload(payload, secret) : undefined;

    let lastError: string | undefined;
    let lastStatus = 0;
    let lastResponseTime = 0;

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'caas-credit-providers/1.0',
            'X-CAAS-Provider-Id': providerId,
            'X-CAAS-Timestamp': new Date().toISOString(),
            ...(signature ? { 'X-CAAS-Signature': signature } : {}),
          },
          body: payload,
          signal: controller.signal,
        });

        lastStatus = response.status;
        lastResponseTime = Date.now() - startedAt;

        if (response.ok) {
          this.logger.info('Provider webhook delivered', {
            providerId,
            url,
            status: response.status,
            responseTime: lastResponseTime,
            attempt,
          });

          return {
            success: true,
            status: response.status,
            responseTime: lastResponseTime,
          };
        }

        lastError = `Webhook responded with HTTP ${response.status}`;
      } catch (error) {
        lastResponseTime = Date.now() - startedAt;
        lastError = error instanceof Error ? error.message : 'Unknown webhook error';
      } finally {
        clearTimeout(timeout);
      }

      if (attempt < this.maxRetries) {
        await this.sleep(this.retryBackoffMs * attempt);
      }
    }

    this.logger.warn('Provider webhook delivery failed', {
      providerId,
      url,
      status: lastStatus,
      error: lastError,
    });

    return {
      success: false,
      status: lastStatus,
      responseTime: lastResponseTime,
      error: lastError,
    };
  }

  async testWebhook(
    providerId: string,
    url: string,
    data: unknown,
    secret?: string
  ): Promise<WebhookDeliveryResult & { message: string }> {
    const result = await this.sendWebhook(providerId, url, data, secret);

    return {
      ...result,
      message: result.success
        ? 'Webhook endpoint accepted the test payload'
        : result.error ?? 'Webhook endpoint did not accept the test payload',
    };
  }

  private normalizePayload(data: unknown): Record<string, unknown> {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }

    return { data };
  }

  private signPayload(payload: string, secret: string): string {
    return `sha256=${crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
