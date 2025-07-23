import { http, HttpResponse } from 'msw';
import { testConfig } from '../../setup/test-env';

const mockNotifications = [
  {
    id: 'notification-123',
    userId: 'user-123',
    type: 'loan_approved',
    title: 'Loan Application Approved',
    message: 'Your loan application for $25,000 has been approved.',
    channel: 'loans',
    priority: 'high',
    status: 'unread',
    data: {
      applicationId: 'app-456',
      loanId: 'loan-123',
      amount: 25000,
    },
    createdAt: '2024-01-12T09:15:00Z',
    updatedAt: '2024-01-12T09:15:00Z',
  },
  {
    id: 'notification-456',
    userId: 'user-123',
    type: 'payment_due',
    title: 'Payment Due Reminder',
    message: 'Your payment of $1,156.25 is due on February 15, 2024.',
    channel: 'payments',
    priority: 'medium',
    status: 'read',
    data: {
      loanId: 'loan-123',
      amount: 1156.25,
      dueDate: '2024-02-15T00:00:00Z',
    },
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-01-21T14:30:00Z',
    readAt: '2024-01-21T14:30:00Z',
  },
  {
    id: 'notification-789',
    userId: 'user-123',
    type: 'payment_successful',
    title: 'Payment Processed',
    message: 'Your payment of $1,156.25 has been successfully processed.',
    channel: 'payments',
    priority: 'low',
    status: 'read',
    data: {
      paymentId: 'payment-123',
      loanId: 'loan-123',
      amount: 1156.25,
    },
    createdAt: '2024-01-15T09:30:00Z',
    updatedAt: '2024-01-15T11:00:00Z',
    readAt: '2024-01-15T11:00:00Z',
  },
];

export const notificationHandlers = [
  // Get notifications
  http.get(`${testConfig.api.baseUrl}/notifications`, ({ request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const channel = url.searchParams.get('channel');
    const priority = url.searchParams.get('priority');
    
    let notifications = mockNotifications;
    
    if (status) {
      notifications = notifications.filter(n => n.status === status);
    }
    
    if (channel) {
      notifications = notifications.filter(n => n.channel === channel);
    }
    
    if (priority) {
      notifications = notifications.filter(n => n.priority === priority);
    }

    return HttpResponse.json({
      success: true,
      notifications,
      summary: {
        total: mockNotifications.length,
        unread: mockNotifications.filter(n => n.status === 'unread').length,
        byChannel: {
          loans: mockNotifications.filter(n => n.channel === 'loans').length,
          payments: mockNotifications.filter(n => n.channel === 'payments').length,
          system: mockNotifications.filter(n => n.channel === 'system').length,
        },
        byPriority: {
          critical: mockNotifications.filter(n => n.priority === 'critical').length,
          high: mockNotifications.filter(n => n.priority === 'high').length,
          medium: mockNotifications.filter(n => n.priority === 'medium').length,
          low: mockNotifications.filter(n => n.priority === 'low').length,
        },
      },
    });
  }),

  // Get specific notification
  http.get(`${testConfig.api.baseUrl}/notifications/:id`, ({ params, request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const notification = mockNotifications.find(n => n.id === params.id);
    
    if (!notification) {
      return HttpResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }

    return HttpResponse.json({
      success: true,
      notification,
    });
  }),

  // Mark notification as read
  http.put(`${testConfig.api.baseUrl}/notifications/:id/read`, ({ params, request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const notification = mockNotifications.find(n => n.id === params.id);
    
    if (!notification) {
      return HttpResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }

    return HttpResponse.json({
      success: true,
      notification: {
        ...notification,
        status: 'read',
        readAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      message: 'Notification marked as read',
    });
  }),

  // Mark notification as unread
  http.put(`${testConfig.api.baseUrl}/notifications/:id/unread`, ({ params, request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const notification = mockNotifications.find(n => n.id === params.id);
    
    if (!notification) {
      return HttpResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }

    return HttpResponse.json({
      success: true,
      notification: {
        ...notification,
        status: 'unread',
        readAt: undefined,
        updatedAt: new Date().toISOString(),
      },
      message: 'Notification marked as unread',
    });
  }),

  // Mark all notifications as read
  http.put(`${testConfig.api.baseUrl}/notifications/mark-all-read`, ({ request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const unreadCount = mockNotifications.filter(n => n.status === 'unread').length;

    return HttpResponse.json({
      success: true,
      message: `${unreadCount} notifications marked as read`,
      updated: unreadCount,
    });
  }),

  // Delete notification
  http.delete(`${testConfig.api.baseUrl}/notifications/:id`, ({ params, request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const notification = mockNotifications.find(n => n.id === params.id);
    
    if (!notification) {
      return HttpResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }

    return HttpResponse.json({
      success: true,
      message: 'Notification deleted successfully',
    });
  }),

  // Get notification preferences
  http.get(`${testConfig.api.baseUrl}/notifications/preferences`, ({ request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return HttpResponse.json({
      success: true,
      preferences: {
        email: {
          loans: true,
          payments: true,
          system: false,
          marketing: false,
        },
        sms: {
          loans: false,
          payments: true,
          system: false,
          marketing: false,
        },
        push: {
          loans: true,
          payments: true,
          system: true,
          marketing: false,
        },
        inApp: {
          loans: true,
          payments: true,
          system: true,
          marketing: true,
        },
      },
    });
  }),

  // Update notification preferences
  http.put(`${testConfig.api.baseUrl}/notifications/preferences`, async ({ request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json() as any;

    return HttpResponse.json({
      success: true,
      preferences: body,
      message: 'Notification preferences updated successfully',
    });
  }),

  // Send test notification (admin only)
  http.post(`${testConfig.api.baseUrl}/notifications/test`, async ({ request }) => {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.split(' ')[1];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Mock admin role check
    if (token !== 'mock-admin-token') {
      return HttpResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json() as any;
    const { userId, type, title, message, channel, priority } = body;

    const testNotification = {
      id: `notification-test-${Date.now()}`,
      userId: userId || 'user-123',
      type: type || 'test',
      title: title || 'Test Notification',
      message: message || 'This is a test notification.',
      channel: channel || 'system',
      priority: priority || 'low',
      status: 'unread',
      data: { test: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return HttpResponse.json(
      {
        success: true,
        notification: testNotification,
        message: 'Test notification sent successfully',
      },
      { status: 201 }
    );
  }),
];