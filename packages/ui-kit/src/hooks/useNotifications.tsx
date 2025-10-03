import { useEffect, useRef, useState, useCallback } from 'react';
import { useToast } from '../components/ui/toaster';

export interface NotificationMessage {
  id: string;
  type: string;
  title: string;
  message: string;
  channel: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  data?: Record<string, any>;
  timestamp: number;
}

export interface UseNotificationsOptions {
  wsUrl?: string;
  userId?: string;
  channels?: string[];
  roles?: string[];
  autoConnect?: boolean;
  showToasts?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface NotificationHookReturn {
  isConnected: boolean;
  isConnecting: boolean;
  notifications: NotificationMessage[];
  connectionError: string | null;
  connect: () => void;
  disconnect: () => void;
  subscribe: (channels: string[], roles?: string[]) => void;
  unsubscribe: (channels?: string[]) => void;
  clearNotifications: () => void;
  markAsRead: (notificationId: string) => void;
  stats: {
    totalNotifications: number;
    unreadCount: number;
    highPriorityCount: number;
  };
}

export function useNotifications(options: UseNotificationsOptions = {}): NotificationHookReturn {
  const {
    wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3010/ws',
    userId,
    channels = [],
    roles = [],
    autoConnect = true,
    showToasts = true,
    reconnectInterval = 5000,
    maxReconnectAttempts = 5,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [readNotifications, setReadNotifications] = useState<Set<string>>(new Set());

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const { addToast } = useToast();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('🔗 WebSocket connected to notifications service');
        setIsConnected(true);
        setIsConnecting(false);
        setConnectionError(null);
        reconnectAttempts.current = 0;

        // Subscribe to channels if provided
        if ((channels.length > 0 || roles.length > 0) && userId) {
          subscribe(channels, roles);
        }

        // Setup heartbeat
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'heartbeat',
              timestamp: Date.now(),
            }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('🔌 WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);
        
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }

        // Attempt to reconnect if not manually closed
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(reconnectInterval * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          setConnectionError('Maximum reconnection attempts reached');
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setConnectionError('WebSocket connection error');
        setIsConnecting(false);
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionError('Failed to create WebSocket connection');
      setIsConnecting(false);
    }
  }, [wsUrl, channels, roles, userId, maxReconnectAttempts, reconnectInterval]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    setConnectionError(null);
    reconnectAttempts.current = 0;
  }, []);

  const subscribe = useCallback((newChannels: string[], newRoles?: string[]) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !userId) {
      return;
    }

    const message = {
      type: 'subscribe',
      payload: {
        userId,
        channels: newChannels,
        roles: newRoles || roles,
      },
    };

    wsRef.current.send(JSON.stringify(message));
    console.log('📡 Subscribed to channels:', newChannels);
  }, [userId, roles]);

  const unsubscribe = useCallback((channelsToUnsubscribe?: string[]) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = {
      type: 'unsubscribe',
      payload: {
        channels: channelsToUnsubscribe,
      },
    };

    wsRef.current.send(JSON.stringify(message));
    console.log('📡 Unsubscribed from channels:', channelsToUnsubscribe || 'all');
  }, []);

  const handleMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'notification':
        const notification: NotificationMessage = {
          id: message.id,
          type: message.type,
          title: message.title,
          message: message.message,
          channel: message.channel,
          priority: message.priority,
          data: message.data,
          timestamp: message.timestamp || Date.now(),
        };

        setNotifications(prev => [notification, ...prev.slice(0, 99)]); // Keep last 100

        // Show toast if enabled
        if (showToasts) {
          const variant = getToastVariant(notification.priority);
          addToast({
            title: notification.title,
            description: notification.message,
            variant,
          });
        }

        console.log('🔔 New notification:', notification);
        break;

      case 'system':
      case 'subscription_success':
      case 'unsubscription_success':
        console.log('ℹ️ System message:', message.message);
        break;

      case 'heartbeat_ack':
      case 'ping':
        // Respond to ping
        if (message.type === 'ping') {
          wsRef.current?.send(JSON.stringify({
            type: 'heartbeat',
            timestamp: Date.now(),
          }));
        }
        break;

      case 'error':
        console.error('❌ Server error:', message.message);
        setConnectionError(message.message);
        break;

      default:
        console.log('📨 Unknown message type:', message.type, message);
    }
  }, [showToasts, addToast]);

  const getToastVariant = (priority: string): 'default' | 'destructive' | 'success' | 'warning' => {
    switch (priority) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'warning';
      case 'medium':
        return 'default';
      case 'low':
        return 'success';
      default:
        return 'default';
    }
  };

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const markAsRead = useCallback((notificationId: string) => {
    setReadNotifications(prev => {
      const newSet = new Set(prev);
      newSet.add(notificationId);
      return newSet;
    });
  }, []);

  // Auto-connect effect
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // Calculate stats
  const stats = {
    totalNotifications: notifications.length,
    unreadCount: notifications.filter(n => !readNotifications.has(n.id)).length,
    highPriorityCount: notifications.filter(n => ['high', 'critical'].includes(n.priority)).length,
  };

  return {
    isConnected,
    isConnecting,
    notifications,
    connectionError,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    clearNotifications,
    markAsRead,
    stats,
  };
}