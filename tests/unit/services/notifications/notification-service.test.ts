import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { NotificationService } from '@services/notifications/src/services/notification-service';
import { getTestDb } from '../../../utils/database';
import { createTestUser } from '../../../utils/auth';

// Mock external dependencies
vi.mock('../../../utils/database');
vi.mock('@services/notifications/src/realtime/websocket-server');

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockDb: any;
  let mockWebSocketManager: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock database
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      eq: vi.fn(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    };

    (getTestDb as Mock).mockReturnValue(mockDb);

    // Mock WebSocket manager
    mockWebSocketManager = {
      sendNotification: vi.fn(),
      sendToUser: vi.fn(),
      sendToChannel: vi.fn(),
      sendToRole: vi.fn(),
    };

    notificationService = new NotificationService();
    (notificationService as any).wsManager = mockWebSocketManager;
  });

  describe('sendNotification', () => {
    it('should create and send a basic notification', async () => {
      // Arrange
      const user = createTestUser();
      const notificationData = {
        type: 'loan_approved',
        title: 'Loan Approved',
        message: 'Your loan application has been approved',
        channel: 'loans',
        userId: user.id,
        priority: 'high' as const,
      };

      const mockNotification = {
        id: 'notification-123',
        ...notificationData,
        status: 'unread',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock database insert
      mockDb.returning.mockResolvedValue([mockNotification]);

      // Act
      const result = await notificationService.sendNotification(notificationData);

      // Assert
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          type: notificationData.type,
          title: notificationData.title,
          message: notificationData.message,
          channel: notificationData.channel,
          userId: user.id,
          priority: notificationData.priority,
          status: 'unread',
        })
      );
      expect(mockWebSocketManager.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockNotification.id,
          type: notificationData.type,
          title: notificationData.title,
          message: notificationData.message,
        })
      );
      expect(result.success).toBe(true);
      expect(result.notification).toEqual(mockNotification);
    });

    it('should send notification to multiple channels', async () => {
      // Arrange
      const notificationData = {
        type: 'system_maintenance',
        title: 'System Maintenance',
        message: 'Scheduled maintenance window',
        channels: ['system', 'admin'],
        priority: 'medium' as const,
      };

      const mockNotifications = [
        { id: 'notification-1', channel: 'system', ...notificationData },
        { id: 'notification-2', channel: 'admin', ...notificationData },
      ];

      // Mock database insert to return multiple notifications
      mockDb.returning.mockResolvedValue(mockNotifications);

      // Act
      const result = await notificationService.sendNotification(notificationData);

      // Assert
      expect(mockWebSocketManager.sendNotification).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.notifications).toHaveLength(2);
    });

    it('should send notification to role-based users', async () => {
      // Arrange
      const notificationData = {
        type: 'admin_alert',
        title: 'Admin Alert',
        message: 'Action required',
        channel: 'admin',
        roles: ['admin', 'manager'],
        priority: 'critical' as const,
      };

      const mockNotification = {
        id: 'notification-123',
        ...notificationData,
        status: 'unread',
        createdAt: new Date(),
      };

      mockDb.returning.mockResolvedValue([mockNotification]);

      // Act
      const result = await notificationService.sendNotification(notificationData);

      // Assert
      expect(mockWebSocketManager.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          roles: ['admin', 'manager'],
        })
      );
    });

    it('should include notification data payload', async () => {
      // Arrange
      const notificationData = {
        type: 'payment_processed',
        title: 'Payment Processed',
        message: 'Your payment has been processed successfully',
        channel: 'payments',
        userId: 'user-123',
        priority: 'low' as const,
        data: {
          paymentId: 'payment-456',
          amount: 1156.25,
          loanId: 'loan-789',
        },
      };

      const mockNotification = {
        id: 'notification-123',
        ...notificationData,
        status: 'unread',
        createdAt: new Date(),
      };

      mockDb.returning.mockResolvedValue([mockNotification]);

      // Act
      const result = await notificationService.sendNotification(notificationData);

      // Assert
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          data: JSON.stringify(notificationData.data),
        })
      );
      expect(mockWebSocketManager.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          data: notificationData.data,
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      const notificationData = {
        type: 'test_notification',
        title: 'Test',
        message: 'Test message',
        channel: 'system',
        priority: 'low' as const,
      };

      // Mock database error
      mockDb.returning.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await notificationService.sendNotification(notificationData);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create notification');
      expect(mockWebSocketManager.sendNotification).not.toHaveBeenCalled();
    });
  });

  describe('getUserNotifications', () => {
    it('should retrieve user notifications with pagination', async () => {
      // Arrange
      const userId = 'user-123';
      const options = {
        page: 1,
        limit: 10,
        status: 'unread',
      };

      const mockNotifications = [
        {
          id: 'notification-1',
          type: 'loan_approved',
          title: 'Loan Approved',
          message: 'Your loan has been approved',
          userId,
          status: 'unread',
          priority: 'high',
          createdAt: new Date(),
        },
        {
          id: 'notification-2',
          type: 'payment_due',
          title: 'Payment Due',
          message: 'Payment is due soon',
          userId,
          status: 'unread',
          priority: 'medium',
          createdAt: new Date(),
        },
      ];

      // Mock database queries
      mockDb.where.mockResolvedValueOnce(mockNotifications); // Main query
      mockDb.where.mockResolvedValueOnce([{ count: 15 }]); // Count query

      // Act
      const result = await notificationService.getUserNotifications(userId, options);

      // Assert
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalledWith(expect.any(Function)); // User ID filter
      expect(mockDb.orderBy).toHaveBeenCalled(); // Order by created date
      expect(mockDb.limit).toHaveBeenCalledWith(10);
      expect(result.notifications).toEqual(mockNotifications);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 15,
        pages: 2,
      });
    });

    it('should filter notifications by channel', async () => {
      // Arrange
      const userId = 'user-123';
      const options = {
        channel: 'loans',
        limit: 20,
      };

      const mockNotifications = [
        {
          id: 'notification-1',
          type: 'loan_approved',
          channel: 'loans',
          userId,
        },
      ];

      mockDb.where.mockResolvedValueOnce(mockNotifications);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]);

      // Act
      const result = await notificationService.getUserNotifications(userId, options);

      // Assert
      expect(result.notifications).toEqual(mockNotifications);
    });

    it('should filter notifications by priority', async () => {
      // Arrange
      const userId = 'user-123';
      const options = {
        priority: 'high',
      };

      const mockNotifications = [
        {
          id: 'notification-1',
          priority: 'high',
          userId,
        },
      ];

      mockDb.where.mockResolvedValueOnce(mockNotifications);
      mockDb.where.mockResolvedValueOnce([{ count: 1 }]);

      // Act
      const result = await notificationService.getUserNotifications(userId, options);

      // Assert
      expect(result.notifications).toEqual(mockNotifications);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      // Arrange
      const notificationId = 'notification-123';
      const userId = 'user-123';

      const mockNotification = {
        id: notificationId,
        userId,
        status: 'unread',
        title: 'Test Notification',
      };

      const updatedNotification = {
        ...mockNotification,
        status: 'read',
        readAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock database queries
      mockDb.where.mockResolvedValueOnce([mockNotification]); // Find notification
      mockDb.returning.mockResolvedValue([updatedNotification]); // Update result

      // Act
      const result = await notificationService.markAsRead(notificationId, userId);

      // Assert
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'read',
          readAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      );
      expect(result.success).toBe(true);
      expect(result.notification.status).toBe('read');
    });

    it('should reject marking non-existent notification', async () => {
      // Arrange
      const notificationId = 'non-existent';
      const userId = 'user-123';

      // Mock database query to return no notification
      mockDb.where.mockResolvedValue([]);

      // Act
      const result = await notificationService.markAsRead(notificationId, userId);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Notification not found');
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('should reject marking notification from different user', async () => {
      // Arrange
      const notificationId = 'notification-123';
      const userId = 'user-123';

      const mockNotification = {
        id: notificationId,
        userId: 'different-user', // Different user
        status: 'unread',
      };

      mockDb.where.mockResolvedValue([mockNotification]);

      // Act
      const result = await notificationService.markAsRead(notificationId, userId);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Notification not found');
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all user notifications as read', async () => {
      // Arrange
      const userId = 'user-123';

      // Mock update result
      mockDb.returning.mockResolvedValue([
        { id: 'notification-1' },
        { id: 'notification-2' },
        { id: 'notification-3' },
      ]);

      // Act
      const result = await notificationService.markAllAsRead(userId);

      // Assert
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'read',
          readAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      );
      expect(result.success).toBe(true);
      expect(result.updated).toBe(3);
    });

    it('should handle no unread notifications', async () => {
      // Arrange
      const userId = 'user-123';

      // Mock update result with no affected rows
      mockDb.returning.mockResolvedValue([]);

      // Act
      const result = await notificationService.markAllAsRead(userId);

      // Assert
      expect(result.success).toBe(true);
      expect(result.updated).toBe(0);
    });
  });

  describe('deleteNotification', () => {
    it('should delete user notification', async () => {
      // Arrange
      const notificationId = 'notification-123';
      const userId = 'user-123';

      const mockNotification = {
        id: notificationId,
        userId,
        title: 'Test Notification',
      };

      // Mock database queries
      mockDb.where.mockResolvedValueOnce([mockNotification]); // Find notification
      mockDb.where.mockResolvedValueOnce([mockNotification]); // Delete confirmation

      // Act
      const result = await notificationService.deleteNotification(notificationId, userId);

      // Assert
      expect(mockDb.delete).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Notification deleted successfully');
    });

    it('should reject deleting non-existent notification', async () => {
      // Arrange
      const notificationId = 'non-existent';
      const userId = 'user-123';

      mockDb.where.mockResolvedValue([]);

      // Act
      const result = await notificationService.deleteNotification(notificationId, userId);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Notification not found');
    });
  });

  describe('getNotificationSummary', () => {
    it('should return notification summary for user', async () => {
      // Arrange
      const userId = 'user-123';

      const mockSummaryData = [
        { status: 'unread', count: 5 },
        { status: 'read', count: 20 },
      ];

      const mockChannelData = [
        { channel: 'loans', count: 10 },
        { channel: 'payments', count: 8 },
        { channel: 'system', count: 7 },
      ];

      const mockPriorityData = [
        { priority: 'critical', count: 1 },
        { priority: 'high', count: 3 },
        { priority: 'medium', count: 12 },
        { priority: 'low', count: 9 },
      ];

      // Mock database queries
      mockDb.where
        .mockResolvedValueOnce(mockSummaryData) // Status summary
        .mockResolvedValueOnce(mockChannelData) // Channel summary
        .mockResolvedValueOnce(mockPriorityData); // Priority summary

      // Act
      const result = await notificationService.getNotificationSummary(userId);

      // Assert
      expect(result.total).toBe(25);
      expect(result.unread).toBe(5);
      expect(result.byChannel).toEqual({
        loans: 10,
        payments: 8,
        system: 7,
      });
      expect(result.byPriority).toEqual({
        critical: 1,
        high: 3,
        medium: 12,
        low: 9,
      });
    });
  });

  describe('scheduleNotification', () => {
    it('should schedule notification for future delivery', async () => {
      // Arrange
      const notificationData = {
        type: 'payment_reminder',
        title: 'Payment Reminder',
        message: 'Your payment is due tomorrow',
        channel: 'payments',
        userId: 'user-123',
        priority: 'medium' as const,
        scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      };

      const mockScheduledNotification = {
        id: 'scheduled-notification-123',
        ...notificationData,
        status: 'scheduled',
        createdAt: new Date(),
      };

      mockDb.returning.mockResolvedValue([mockScheduledNotification]);

      // Act
      const result = await notificationService.scheduleNotification(notificationData);

      // Assert
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'scheduled',
          scheduledFor: notificationData.scheduledFor,
        })
      );
      expect(result.success).toBe(true);
      expect(result.notification.status).toBe('scheduled');
    });

    it('should reject scheduling in the past', async () => {
      // Arrange
      const notificationData = {
        type: 'test_notification',
        title: 'Test',
        message: 'Test message',
        channel: 'system',
        priority: 'low' as const,
        scheduledFor: new Date(Date.now() - 60000), // 1 minute ago
      };

      // Act
      const result = await notificationService.scheduleNotification(notificationData);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot schedule notification in the past');
    });
  });

  describe('processScheduledNotifications', () => {
    it('should process due scheduled notifications', async () => {
      // Arrange
      const dueNotifications = [
        {
          id: 'scheduled-1',
          type: 'payment_reminder',
          title: 'Payment Due',
          message: 'Your payment is due today',
          userId: 'user-123',
          channel: 'payments',
          priority: 'high',
          scheduledFor: new Date(Date.now() - 60000), // Due
          status: 'scheduled',
        },
        {
          id: 'scheduled-2',
          type: 'loan_update',
          title: 'Loan Update',
          message: 'Your loan status has changed',
          userId: 'user-456',
          channel: 'loans',
          priority: 'medium',
          scheduledFor: new Date(Date.now() - 30000), // Due
          status: 'scheduled',
        },
      ];

      // Mock database query for due notifications
      mockDb.where.mockResolvedValue(dueNotifications);

      // Mock update operations
      mockDb.returning.mockResolvedValue([{ affected: 2 }]);

      // Act
      const result = await notificationService.processScheduledNotifications();

      // Assert
      expect(result.processed).toBe(2);
      expect(mockWebSocketManager.sendNotification).toHaveBeenCalledTimes(2);
      expect(mockDb.update).toHaveBeenCalled(); // Update status to sent
    });

    it('should handle processing errors gracefully', async () => {
      // Arrange
      const dueNotifications = [
        {
          id: 'scheduled-1',
          type: 'test_notification',
          scheduledFor: new Date(Date.now() - 60000),
          status: 'scheduled',
        },
      ];

      mockDb.where.mockResolvedValue(dueNotifications);
      
      // Mock WebSocket error
      mockWebSocketManager.sendNotification.mockRejectedValue(new Error('WebSocket error'));

      // Act
      const result = await notificationService.processScheduledNotifications();

      // Assert
      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
    });
  });
});