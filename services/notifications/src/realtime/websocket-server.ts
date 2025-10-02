import { FastifyInstance } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

// WebSocket message schemas
const WebSocketMessageSchema = z.object({
  type: z.enum(['subscribe', 'unsubscribe', 'notification', 'heartbeat']),
  payload: z.record(z.any()).optional(),
  timestamp: z.number().optional(),
});

const SubscriptionSchema = z.object({
  userId: z.string(),
  channels: z.array(z.enum(['loans', 'payments', 'admin', 'system'])),
  roles: z.array(z.string()).optional(),
});

export interface WebSocketConnection {
  id: string;
  socket: SocketStream;
  userId?: string;
  channels: Set<string>;
  roles: Set<string>;
  lastActivity: Date;
  isAlive: boolean;
}

export interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  message: string;
  channel: string;
  userId?: string;
  roles?: string[];
  data?: Record<string, any>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
}

export class WebSocketManager extends EventEmitter {
  private connections: Map<string, WebSocketConnection> = new Map();
  private userConnections: Map<string, Set<string>> = new Map();
  private channelSubscriptions: Map<string, Set<string>> = new Map();

  constructor(private fastify: FastifyInstance) {
    super();
    this.setupHeartbeat();
  }

  async initialize() {
    await this.fastify.register(require('@fastify/websocket'));
    
    this.fastify.register(async (fastify) => {
      fastify.get('/ws', { websocket: true }, this.handleConnection.bind(this));
    });
  }

  private async handleConnection(socket: SocketStream, request: any) {
    const connectionId = uuidv4();
    const connection: WebSocketConnection = {
      id: connectionId,
      socket,
      channels: new Set(),
      roles: new Set(),
      lastActivity: new Date(),
      isAlive: true,
    };

    this.connections.set(connectionId, connection);
    
    this.fastify.log.info(`WebSocket connection established: ${connectionId}`);

    // Handle incoming messages
    socket.on('message', (data: Buffer) => {
      this.handleMessage(connectionId, data);
    });

    // Handle connection close
    socket.on('close', () => {
      this.handleDisconnection(connectionId);
    });

    // Handle errors
    socket.on('error', (error) => {
      this.fastify.log.error(`WebSocket error for ${connectionId}:`, error);
      this.handleDisconnection(connectionId);
    });

    // Send welcome message
    this.sendToConnection(connectionId, {
      type: 'system',
      message: 'Connected to CAAS notification service',
      timestamp: Date.now(),
    });
  }

  private handleMessage(connectionId: string, data: Buffer) {
    try {
      const message = JSON.parse(data.toString());
      const validatedMessage = WebSocketMessageSchema.parse(message);
      
      const connection = this.connections.get(connectionId);
      if (!connection) return;

      connection.lastActivity = new Date();

      switch (validatedMessage.type) {
        case 'subscribe':
          this.handleSubscription(connectionId, validatedMessage.payload);
          break;
        case 'unsubscribe':
          this.handleUnsubscription(connectionId, validatedMessage.payload);
          break;
        case 'heartbeat':
          this.handleHeartbeat(connectionId);
          break;
        default:
          this.fastify.log.warn(`Unknown message type: ${validatedMessage.type}`);
      }
    } catch (error) {
      this.fastify.log.error(`Error processing WebSocket message:`, error);
      this.sendToConnection(connectionId, {
        type: 'error',
        message: 'Invalid message format',
        timestamp: Date.now(),
      });
    }
  }

  private handleSubscription(connectionId: string, payload: any) {
    try {
      const subscription = SubscriptionSchema.parse(payload);
      const connection = this.connections.get(connectionId);
      
      if (!connection) return;

      // Update connection metadata
      connection.userId = subscription.userId;
      if (subscription.roles) {
        subscription.roles.forEach(role => connection.roles.add(role));
      }

      // Subscribe to channels
      subscription.channels.forEach(channel => {
        connection.channels.add(channel);
        
        if (!this.channelSubscriptions.has(channel)) {
          this.channelSubscriptions.set(channel, new Set());
        }
        this.channelSubscriptions.get(channel)!.add(connectionId);
      });

      // Track user connections
      if (subscription.userId) {
        if (!this.userConnections.has(subscription.userId)) {
          this.userConnections.set(subscription.userId, new Set());
        }
        this.userConnections.get(subscription.userId)!.add(connectionId);
      }

      this.sendToConnection(connectionId, {
        type: 'subscription_success',
        message: `Subscribed to channels: ${subscription.channels.join(', ')}`,
        channels: subscription.channels,
        timestamp: Date.now(),
      });

      this.fastify.log.info(`Connection ${connectionId} subscribed to channels: ${subscription.channels.join(', ')}`);
    } catch (error) {
      this.fastify.log.error(`Subscription error:`, error);
      this.sendToConnection(connectionId, {
        type: 'error',
        message: 'Invalid subscription format',
        timestamp: Date.now(),
      });
    }
  }

  private handleUnsubscription(connectionId: string, payload: any) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const { channels } = payload || {};
    
    if (channels && Array.isArray(channels)) {
      channels.forEach((channel: string) => {
        connection.channels.delete(channel);
        this.channelSubscriptions.get(channel)?.delete(connectionId);
      });
    } else {
      // Unsubscribe from all channels
      connection.channels.forEach(channel => {
        this.channelSubscriptions.get(channel)?.delete(connectionId);
      });
      connection.channels.clear();
    }

    this.sendToConnection(connectionId, {
      type: 'unsubscription_success',
      message: 'Unsubscribed successfully',
      timestamp: Date.now(),
    });
  }

  private handleHeartbeat(connectionId: string) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.isAlive = true;
    this.sendToConnection(connectionId, {
      type: 'heartbeat_ack',
      timestamp: Date.now(),
    });
  }

  private handleDisconnection(connectionId: string) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Remove from channel subscriptions
    connection.channels.forEach(channel => {
      this.channelSubscriptions.get(channel)?.delete(connectionId);
    });

    // Remove from user connections
    if (connection.userId) {
      this.userConnections.get(connection.userId)?.delete(connectionId);
      if (this.userConnections.get(connection.userId)?.size === 0) {
        this.userConnections.delete(connection.userId);
      }
    }

    this.connections.delete(connectionId);
    this.fastify.log.info(`WebSocket connection closed: ${connectionId}`);
  }

  // Public methods for sending notifications
  public sendNotification(notification: NotificationPayload) {
    const targets = this.getNotificationTargets(notification);
    
    targets.forEach(connectionId => {
      this.sendToConnection(connectionId, {
        type: 'notification',
        ...notification,
        timestamp: Date.now(),
      });
    });

    this.fastify.log.info(`Notification sent to ${targets.size} connections`, {
      notificationId: notification.id,
      type: notification.type,
      channel: notification.channel,
    });
  }

  public sendToUser(userId: string, message: any) {
    const userConnectionIds = this.userConnections.get(userId);
    if (!userConnectionIds) return;

    userConnectionIds.forEach(connectionId => {
      this.sendToConnection(connectionId, message);
    });
  }

  public sendToChannel(channel: string, message: any) {
    const channelConnectionIds = this.channelSubscriptions.get(channel);
    if (!channelConnectionIds) return;

    channelConnectionIds.forEach(connectionId => {
      this.sendToConnection(connectionId, message);
    });
  }

  public sendToRole(role: string, message: any) {
    this.connections.forEach((connection, connectionId) => {
      if (connection.roles.has(role)) {
        this.sendToConnection(connectionId, message);
      }
    });
  }

  private getNotificationTargets(notification: NotificationPayload): Set<string> {
    const targets = new Set<string>();

    // Target specific user
    if (notification.userId) {
      const userConnections = this.userConnections.get(notification.userId);
      userConnections?.forEach(connectionId => targets.add(connectionId));
    }

    // Target by roles
    if (notification.roles && notification.roles.length > 0) {
      this.connections.forEach((connection, connectionId) => {
        const hasRole = notification.roles!.some(role => connection.roles.has(role));
        if (hasRole) targets.add(connectionId);
      });
    }

    // Target by channel
    const channelConnections = this.channelSubscriptions.get(notification.channel);
    channelConnections?.forEach(connectionId => targets.add(connectionId));

    return targets;
  }

  private sendToConnection(connectionId: string, message: any) {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.isAlive) return;

    try {
      connection.socket.send(JSON.stringify(message));
    } catch (error) {
      this.fastify.log.error(`Error sending message to ${connectionId}:`, error);
      this.handleDisconnection(connectionId);
    }
  }

  private setupHeartbeat() {
    setInterval(() => {
      this.connections.forEach((connection, connectionId) => {
        if (!connection.isAlive) {
          this.handleDisconnection(connectionId);
          return;
        }

        connection.isAlive = false;
        this.sendToConnection(connectionId, {
          type: 'ping',
          timestamp: Date.now(),
        });
      });
    }, 30000); // 30 seconds
  }

  // Statistics and monitoring
  public getStats() {
    return {
      totalConnections: this.connections.size,
      activeChannels: this.channelSubscriptions.size,
      connectedUsers: this.userConnections.size,
      channels: Array.from(this.channelSubscriptions.keys()).map(channel => ({
        name: channel,
        subscribers: this.channelSubscriptions.get(channel)?.size || 0,
      })),
    };
  }
}