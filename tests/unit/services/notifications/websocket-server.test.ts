import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { WebSocketManager } from '@services/notifications/src/realtime/websocket-server';
import { TestWebSocketClient, mockWebSocketServer } from '../../../utils/websocket';
import { createTestUser } from '../../../utils/auth';

// Mock Fastify and WebSocket dependencies
vi.mock('fastify');
vi.mock('@fastify/websocket');
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-connection-id'),
}));

describe('WebSocketManager', () => {
  let wsManager: WebSocketManager;
  let mockFastify: any;
  let mockSocket: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Fastify instance
    mockFastify = {
      register: vi.fn(),
      log: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      },
    };

    // Mock WebSocket
    mockSocket = {
      send: vi.fn(),
      on: vi.fn(),
      readyState: 1, // WebSocket.OPEN
    };

    wsManager = new WebSocketManager(mockFastify);
  });

  describe('initialize', () => {
    it('should register WebSocket plugin and routes', async () => {
      // Act
      await wsManager.initialize();

      // Assert
      expect(mockFastify.register).toHaveBeenCalledTimes(2);
      expect(mockFastify.register).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('handleConnection', () => {
    it('should establish new WebSocket connection', async () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization: 'Bearer mock-token',
        },
      };

      // Act
      await wsManager.handleConnection(mockSocket, mockRequest);

      // Assert
      expect(mockSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('Connected to CAAS notification service')
      );
    });

    it('should assign unique connection ID', async () => {
      // Arrange
      const mockRequest = {};

      // Act
      await wsManager.handleConnection(mockSocket, mockRequest);

      // Assert
      expect(mockFastify.log.info).toHaveBeenCalledWith(
        'WebSocket connection established: mock-connection-id'
      );
    });
  });

  describe('handleMessage', () => {
    beforeEach(() => {
      // Setup a connection first
      wsManager.handleConnection(mockSocket, {});
    });

    it('should handle subscription message', () => {
      // Arrange
      const subscriptionMessage = {
        type: 'subscribe',
        payload: {
          userId: 'user-123',
          channels: ['loans', 'payments'],
          roles: ['user'],
        },
      };

      const messageBuffer = Buffer.from(JSON.stringify(subscriptionMessage));

      // Act
      wsManager.handleMessage('mock-connection-id', messageBuffer);

      // Assert
      expect(mockSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('subscription_success')
      );
    });

    it('should handle unsubscription message', () => {
      // Arrange
      // First subscribe
      const subscriptionMessage = {
        type: 'subscribe',
        payload: {
          userId: 'user-123',
          channels: ['loans', 'payments'],
        },
      };
      wsManager.handleMessage('mock-connection-id', Buffer.from(JSON.stringify(subscriptionMessage)));

      // Then unsubscribe
      const unsubscriptionMessage = {
        type: 'unsubscribe',
        payload: {
          channels: ['loans'],
        },
      };

      // Act
      wsManager.handleMessage('mock-connection-id', Buffer.from(JSON.stringify(unsubscriptionMessage)));

      // Assert
      expect(mockSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('unsubscription_success')
      );
    });

    it('should handle heartbeat message', () => {
      // Arrange
      const heartbeatMessage = {
        type: 'heartbeat',
      };

      // Act
      wsManager.handleMessage('mock-connection-id', Buffer.from(JSON.stringify(heartbeatMessage)));

      // Assert
      expect(mockSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('heartbeat_ack')
      );
    });

    it('should handle invalid JSON gracefully', () => {
      // Arrange
      const invalidMessage = Buffer.from('invalid json');

      // Act
      wsManager.handleMessage('mock-connection-id', invalidMessage);

      // Assert
      expect(mockSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('Invalid message format')
      );
    });

    it('should handle unknown message type', () => {
      // Arrange
      const unknownMessage = {
        type: 'unknown_type',
        payload: {},
      };

      // Act
      wsManager.handleMessage('mock-connection-id', Buffer.from(JSON.stringify(unknownMessage)));

      // Assert
      expect(mockFastify.log.warn).toHaveBeenCalledWith(
        'Unknown message type: unknown_type'
      );
    });
  });

  describe('handleSubscription', () => {
    it('should subscribe connection to channels', () => {
      // Arrange
      const payload = {
        userId: 'user-123',
        channels: ['loans', 'payments'],
        roles: ['user', 'borrower'],
      };

      // Setup connection
      wsManager.handleConnection(mockSocket, {});

      // Act
      wsManager.handleSubscription('mock-connection-id', payload);

      // Assert
      const stats = wsManager.getStats();
      expect(stats.connectedUsers).toBe(1);
      expect(stats.channels).toHaveLength(2);
      expect(stats.channels.find(c => c.name === 'loans')?.subscribers).toBe(1);
      expect(stats.channels.find(c => c.name === 'payments')?.subscribers).toBe(1);
    });

    it('should handle invalid subscription payload', () => {
      // Arrange
      const invalidPayload = {
        invalidField: 'invalid',
      };

      // Setup connection
      wsManager.handleConnection(mockSocket, {});

      // Act
      wsManager.handleSubscription('mock-connection-id', invalidPayload);

      // Assert
      expect(mockSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('Invalid subscription format')
      );
    });
  });

  describe('sendNotification', () => {
    it('should send notification to subscribed users', () => {
      // Arrange
      const user = createTestUser();
      const notification = {
        id: 'notification-123',
        type: 'loan_approved',
        title: 'Loan Approved',
        message: 'Your loan application has been approved',
        channel: 'loans',
        userId: user.id,
        priority: 'high' as const,
        timestamp: new Date(),
      };

      // Setup connection and subscription
      wsManager.handleConnection(mockSocket, {});
      wsManager.handleSubscription('mock-connection-id', {
        userId: user.id,
        channels: ['loans'],
      });

      // Act
      wsManager.sendNotification(notification);

      // Assert
      expect(mockSocket.send).toHaveBeenCalledWith(
        expect.stringContaining(notification.type)
      );
      expect(mockFastify.log.info).toHaveBeenCalledWith(
        expect.stringContaining('Notification sent to 1 connections'),
        expect.objectContaining({
          notificationId: notification.id,
          type: notification.type,
          channel: notification.channel,
        })
      );
    });

    it('should send notification to users with matching roles', () => {
      // Arrange
      const notification = {
        id: 'notification-456',
        type: 'system_maintenance',
        title: 'System Maintenance',
        message: 'Scheduled maintenance window',
        channel: 'system',
        roles: ['admin'],
        priority: 'medium' as const,
        timestamp: new Date(),
      };

      // Setup admin connection
      wsManager.handleConnection(mockSocket, {});
      wsManager.handleSubscription('mock-connection-id', {
        userId: 'admin-123',
        channels: ['system'],
        roles: ['admin'],
      });

      // Act
      wsManager.sendNotification(notification);

      // Assert
      expect(mockSocket.send).toHaveBeenCalledWith(
        expect.stringContaining(notification.type)
      );
    });

    it('should not send notification to unsubscribed channels', () => {
      // Arrange
      const notification = {
        id: 'notification-789',
        type: 'payment_due',
        title: 'Payment Due',
        message: 'Your payment is due soon',
        channel: 'payments',
        priority: 'medium' as const,
        timestamp: new Date(),
      };

      // Setup connection subscribed to different channel
      wsManager.handleConnection(mockSocket, {});
      wsManager.handleSubscription('mock-connection-id', {
        userId: 'user-123',
        channels: ['loans'], // Different channel
      });

      // Act
      wsManager.sendNotification(notification);

      // Assert
      expect(mockSocket.send).not.toHaveBeenCalledWith(
        expect.stringContaining(notification.type)
      );
    });
  });

  describe('sendToUser', () => {
    it('should send message to specific user', () => {
      // Arrange
      const userId = 'user-123';
      const message = { type: 'direct_message', content: 'Hello user!' };

      // Setup user connection
      wsManager.handleConnection(mockSocket, {});
      wsManager.handleSubscription('mock-connection-id', {
        userId,
        channels: ['loans'],
      });

      // Act
      wsManager.sendToUser(userId, message);

      // Assert
      expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should handle non-existent user gracefully', () => {
      // Arrange
      const message = { type: 'direct_message', content: 'Hello!' };

      // Act (no connections)
      wsManager.sendToUser('non-existent-user', message);

      // Assert
      expect(mockSocket.send).not.toHaveBeenCalled();
    });
  });

  describe('sendToChannel', () => {
    it('should send message to all channel subscribers', () => {
      // Arrange
      const message = { type: 'channel_broadcast', content: 'Channel message!' };

      // Setup multiple connections to same channel
      const mockSocket2 = { ...mockSocket, send: vi.fn() };
      
      wsManager.handleConnection(mockSocket, {});
      wsManager.handleConnection(mockSocket2, {});
      
      // Mock different connection IDs
      vi.mocked(require('uuid').v4)
        .mockReturnValueOnce('connection-1')
        .mockReturnValueOnce('connection-2');

      wsManager.handleSubscription('connection-1', {
        userId: 'user-1',
        channels: ['loans'],
      });
      wsManager.handleSubscription('connection-2', {
        userId: 'user-2',
        channels: ['loans'],
      });

      // Act
      wsManager.sendToChannel('loans', message);

      // Assert
      expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(mockSocket2.send).toHaveBeenCalledWith(JSON.stringify(message));
    });
  });

  describe('sendToRole', () => {
    it('should send message to all users with specific role', () => {
      // Arrange
      const message = { type: 'role_broadcast', content: 'Admin message!' };

      // Setup admin connection
      wsManager.handleConnection(mockSocket, {});
      wsManager.handleSubscription('mock-connection-id', {
        userId: 'admin-123',
        channels: ['system'],
        roles: ['admin'],
      });

      // Act
      wsManager.sendToRole('admin', message);

      // Assert
      expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify(message));
    });
  });

  describe('handleDisconnection', () => {
    it('should clean up connection data on disconnect', () => {
      // Arrange
      wsManager.handleConnection(mockSocket, {});
      wsManager.handleSubscription('mock-connection-id', {
        userId: 'user-123',
        channels: ['loans', 'payments'],
      });

      // Verify connection exists
      let stats = wsManager.getStats();
      expect(stats.totalConnections).toBe(1);
      expect(stats.connectedUsers).toBe(1);

      // Act
      wsManager.handleDisconnection('mock-connection-id');

      // Assert
      stats = wsManager.getStats();
      expect(stats.totalConnections).toBe(0);
      expect(stats.connectedUsers).toBe(0);
      expect(mockFastify.log.info).toHaveBeenCalledWith(
        'WebSocket connection closed: mock-connection-id'
      );
    });
  });

  describe('setupHeartbeat', () => {
    it('should clean up inactive connections', async () => {
      // Arrange
      wsManager.handleConnection(mockSocket, {});
      
      // Simulate inactive connection
      const connection = (wsManager as any).connections.get('mock-connection-id');
      connection.isAlive = false;

      // Act
      await new Promise(resolve => setTimeout(resolve, 35000)); // Wait for heartbeat interval

      // Assert
      expect(mockSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('ping')
      );
    });
  });

  describe('getStats', () => {
    it('should return accurate connection statistics', () => {
      // Arrange
      wsManager.handleConnection(mockSocket, {});
      wsManager.handleSubscription('mock-connection-id', {
        userId: 'user-123',
        channels: ['loans', 'payments'],
        roles: ['user'],
      });

      // Act
      const stats = wsManager.getStats();

      // Assert
      expect(stats).toEqual({
        totalConnections: 1,
        activeChannels: 2,
        connectedUsers: 1,
        channels: [
          { name: 'loans', subscribers: 1 },
          { name: 'payments', subscribers: 1 },
        ],
      });
    });

    it('should return empty stats for no connections', () => {
      // Act
      const stats = wsManager.getStats();

      // Assert
      expect(stats).toEqual({
        totalConnections: 0,
        activeChannels: 0,
        connectedUsers: 0,
        channels: [],
      });
    });
  });

  describe('error handling', () => {
    it('should handle socket send errors gracefully', () => {
      // Arrange
      mockSocket.send.mockImplementation(() => {
        throw new Error('Socket closed');
      });

      wsManager.handleConnection(mockSocket, {});

      // Act
      (wsManager as any).sendToConnection('mock-connection-id', { test: 'message' });

      // Assert
      expect(mockFastify.log.error).toHaveBeenCalledWith(
        expect.stringContaining('Error sending message to mock-connection-id'),
        expect.any(Error)
      );
    });

    it('should handle malformed subscription data', () => {
      // Arrange
      wsManager.handleConnection(mockSocket, {});

      // Act
      wsManager.handleSubscription('mock-connection-id', null);

      // Assert
      expect(mockSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('Invalid subscription format')
      );
    });
  });
});