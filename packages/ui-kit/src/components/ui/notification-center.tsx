import React, { useState } from 'react';
import { useNotifications } from '../../hooks/useNotifications';
import { Badge } from './badge';
import { Button } from './button';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import { cn } from '../../lib/utils';

export interface NotificationCenterProps {
  userId?: string;
  channels?: string[];
  roles?: string[];
  className?: string;
  showConnectionStatus?: boolean;
  maxNotifications?: number;
}

export function NotificationCenter({
  userId,
  channels = ['loans', 'payments', 'system'],
  roles = [],
  className,
  showConnectionStatus = true,
  maxNotifications = 10,
}: NotificationCenterProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const {
    isConnected,
    isConnecting,
    notifications,
    connectionError,
    connect,
    disconnect,
    clearNotifications,
    markAsRead,
    stats,
  } = useNotifications({
    userId,
    channels,
    roles,
    autoConnect: true,
    showToasts: true,
  });

  const displayNotifications = notifications.slice(0, maxNotifications);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'loan_approved':
        return '✅';
      case 'loan_rejected':
        return '❌';
      case 'payment_successful':
        return '💳';
      case 'payment_failed':
        return '⚠️';
      case 'admin_alert':
        return '🚨';
      default:
        return '🔔';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'warning';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <Card className={cn('w-96', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            🔔 Notifications
            {stats.unreadCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {stats.unreadCount}
              </Badge>
            )}
          </CardTitle>
          
          <div className="flex items-center gap-2">
            {showConnectionStatus && (
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-2 h-2 rounded-full',
                    isConnected ? 'bg-green-500' : isConnecting ? 'bg-yellow-500' : 'bg-red-500'
                  )}
                />
                <span className="text-xs text-muted-foreground">
                  {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
                </span>
              </div>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? '−' : '+'}
            </Button>
          </div>
        </div>

        {connectionError && (
          <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
            {connectionError}
            <Button
              variant="ghost"
              size="sm"
              onClick={connect}
              className="ml-2 text-xs"
            >
              Retry
            </Button>
          </div>
        )}

        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Total: {stats.totalNotifications}</span>
          <span>Unread: {stats.unreadCount}</span>
          <span>High Priority: {stats.highPriorityCount}</span>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-medium">Recent Notifications</h4>
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearNotifications}
                className="text-xs"
              >
                Clear All
              </Button>
            )}
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {displayNotifications.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-8">
                No notifications yet
              </div>
            ) : (
              displayNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className="border rounded-lg p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg">
                      {getNotificationIcon(notification.type)}
                    </span>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h5 className="font-medium text-sm truncate">
                          {notification.title}
                        </h5>
                        <Badge 
                          variant={getPriorityColor(notification.priority) as any}
                          className="text-xs"
                        >
                          {notification.priority}
                        </Badge>
                      </div>
                      
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                        {notification.message}
                      </p>
                      
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">
                          {notification.channel}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(notification.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {notifications.length > maxNotifications && (
            <div className="text-center mt-3">
              <span className="text-xs text-muted-foreground">
                Showing {maxNotifications} of {notifications.length} notifications
              </span>
            </div>
          )}

          <div className="mt-4 pt-3 border-t">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={isConnected ? disconnect : connect}
                className="flex-1"
              >
                {isConnected ? 'Disconnect' : 'Connect'}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`ws://localhost:3010/ws`, '_blank')}
                className="flex-1"
              >
                WebSocket Info
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}