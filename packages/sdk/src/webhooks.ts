import crypto from 'crypto';

export interface WebhookVerificationOptions {
  toleranceSeconds?: number;
  timestamp?: string | number;
}

export function computeWebhookSignature(payload: string | Buffer, secret: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
}

export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  options: WebhookVerificationOptions = {}
): boolean {
  if (!signature || !secret) return false;

  if (options.timestamp && options.toleranceSeconds) {
    const timestampMs = typeof options.timestamp === 'number'
      ? options.timestamp
      : Date.parse(options.timestamp);
    const ageSeconds = Math.abs(Date.now() - timestampMs) / 1000;
    if (!Number.isFinite(ageSeconds) || ageSeconds > options.toleranceSeconds) {
      return false;
    }
  }

  const expected = computeWebhookSignature(payload, secret);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  return expectedBuffer.length === signatureBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}
