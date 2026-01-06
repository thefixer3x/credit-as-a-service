import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'eventemitter3';
import { NotificationService } from '@services/notifications/src/services/notification-service';

const createWsManager = () => {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    sendNotification: vi.fn(),
    sendToUser: vi.fn(),
    sendToChannel: vi.fn(),
    sendToRole: vi.fn(),
    getStats: vi.fn(() => ({
      totalConnections: 0,
      activeChannels: 0,
      connectedUsers: 0,
      channels: []
    }))
  });
};

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
};

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let wsManager: ReturnType<typeof createWsManager>;

  beforeEach(() => {
    wsManager = createWsManager();
    notificationService = new NotificationService(wsManager as any, logger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates and sends an immediate notification', async () => {
    const notificationId = await notificationService.createNotification({
      type: 'loan_approved',
      title: 'Loan Approved',
      message: 'Your loan has been approved',
      channel: 'loans',
      userId: 'user-123',
      priority: 'high'
    });

    expect(notificationId).toBeTypeOf('string');
    expect(wsManager.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: notificationId,
        type: 'loan_approved',
        channel: 'loans',
        userId: 'user-123'
      })
    );
  });

  it('schedules notifications for the future', async () => {
    vi.useFakeTimers();

    const scheduledFor = new Date(Date.now() + 1000);
    const notificationId = await notificationService.createNotification({
      type: 'system_maintenance',
      title: 'Maintenance',
      message: 'Scheduled maintenance window',
      channel: 'system',
      scheduledFor
    });

    expect(notificationService.getStats().scheduledNotifications).toBe(1);

    await vi.runAllTimersAsync();

    expect(wsManager.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: notificationId,
        type: 'system_maintenance',
        channel: 'system'
      })
    );
    expect(notificationService.getStats().scheduledNotifications).toBe(0);

    vi.useRealTimers();
  });

  it('builds notifications from event templates', async () => {
    await notificationService.handleEvent({
      type: 'loan_approved',
      userId: 'user-456',
      data: {
        amount: '5000',
        loanId: 'loan-001',
        interestRate: '12%'
      },
      timestamp: new Date()
    });

    expect(wsManager.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'loan_approved',
        channel: 'loans',
        userId: 'user-456',
        message: expect.stringContaining('5000')
      })
    );
  });

  it('proxies send helpers to WebSocket manager', async () => {
    await notificationService.sendToUser('user-1', { type: 'direct', message: 'hello' });
    await notificationService.sendToChannel('loans', { type: 'broadcast', message: 'update' });
    await notificationService.sendToRole('admin', { type: 'role', message: 'alert' });

    expect(wsManager.sendToUser).toHaveBeenCalledWith('user-1', { type: 'direct', message: 'hello' });
    expect(wsManager.sendToChannel).toHaveBeenCalledWith('loans', { type: 'broadcast', message: 'update' });
    expect(wsManager.sendToRole).toHaveBeenCalledWith('admin', { type: 'role', message: 'alert' });
  });
});
