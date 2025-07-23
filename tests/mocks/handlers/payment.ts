import { http, HttpResponse } from 'msw';
import { testConfig } from '../../setup/test-env';

const mockPayments = [
  {
    id: 'payment-123',
    loanId: 'loan-123',
    userId: 'user-123',
    amount: 1156.25,
    principalAmount: 1006.25,
    interestAmount: 150.00,
    status: 'completed',
    paymentMethod: 'bank_transfer',
    transactionId: 'txn-abc123',
    scheduledDate: '2024-01-15T00:00:00Z',
    processedDate: '2024-01-15T09:30:00Z',
    createdAt: '2024-01-15T09:00:00Z',
    updatedAt: '2024-01-15T09:30:00Z',
  },
  {
    id: 'payment-456',
    loanId: 'loan-123',
    userId: 'user-123',
    amount: 1156.25,
    principalAmount: 1013.50,
    interestAmount: 142.75,
    status: 'pending',
    paymentMethod: 'credit_card',
    scheduledDate: '2024-02-15T00:00:00Z',
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-01-20T10:00:00Z',
  },
];

const mockPaymentSchedule = [
  {
    id: 'schedule-1',
    loanId: 'loan-123',
    paymentNumber: 1,
    scheduledDate: '2024-01-15T00:00:00Z',
    amount: 1156.25,
    principalAmount: 1006.25,
    interestAmount: 150.00,
    remainingBalance: 23993.75,
    status: 'paid',
    paidDate: '2024-01-15T09:30:00Z',
  },
  {
    id: 'schedule-2',
    loanId: 'loan-123',
    paymentNumber: 2,
    scheduledDate: '2024-02-15T00:00:00Z',
    amount: 1156.25,
    principalAmount: 1013.50,
    interestAmount: 142.75,
    remainingBalance: 22980.25,
    status: 'scheduled',
  },
  {
    id: 'schedule-3',
    loanId: 'loan-123',
    paymentNumber: 3,
    scheduledDate: '2024-03-15T00:00:00Z',
    amount: 1156.25,
    principalAmount: 1020.82,
    interestAmount: 135.43,
    remainingBalance: 21959.43,
    status: 'scheduled',
  },
];

export const paymentHandlers = [
  // Get payments
  http.get(`${testConfig.api.baseUrl}/payments`, ({ request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const loanId = url.searchParams.get('loanId');
    
    let payments = mockPayments;
    if (loanId) {
      payments = mockPayments.filter(payment => payment.loanId === loanId);
    }

    return HttpResponse.json({
      success: true,
      payments,
      pagination: {
        page: 1,
        limit: 10,
        total: payments.length,
        pages: 1,
      },
    });
  }),

  // Get specific payment
  http.get(`${testConfig.api.baseUrl}/payments/:id`, ({ params, request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const payment = mockPayments.find(p => p.id === params.id);
    
    if (!payment) {
      return HttpResponse.json(
        { success: false, error: 'Payment not found' },
        { status: 404 }
      );
    }

    return HttpResponse.json({
      success: true,
      payment,
    });
  }),

  // Make payment
  http.post(`${testConfig.api.baseUrl}/payments`, async ({ request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json() as any;
    const { loanId, amount, paymentMethod } = body;

    // Validate required fields
    if (!loanId || !amount || !paymentMethod) {
      return HttpResponse.json(
        {
          success: false,
          error: 'Missing required fields',
          details: {
            loanId: !loanId ? 'Loan ID is required' : undefined,
            amount: !amount ? 'Amount is required' : undefined,
            paymentMethod: !paymentMethod ? 'Payment method is required' : undefined,
          },
        },
        { status: 400 }
      );
    }

    // Validate amount
    if (amount <= 0) {
      return HttpResponse.json(
        { success: false, error: 'Payment amount must be greater than zero' },
        { status: 400 }
      );
    }

    // Mock payment method validation
    const validPaymentMethods = ['bank_transfer', 'credit_card', 'debit_card', 'digital_wallet'];
    if (!validPaymentMethods.includes(paymentMethod)) {
      return HttpResponse.json(
        {
          success: false,
          error: 'Invalid payment method',
          validMethods: validPaymentMethods,
        },
        { status: 400 }
      );
    }

    // Simulate payment processing
    const processingStatus = Math.random() > 0.1 ? 'completed' : 'failed'; // 90% success rate
    
    const newPayment = {
      id: `payment-${Date.now()}`,
      loanId,
      userId: 'user-123',
      amount,
      principalAmount: amount * 0.87, // Mock principal allocation
      interestAmount: amount * 0.13,  // Mock interest allocation
      status: processingStatus,
      paymentMethod,
      transactionId: processingStatus === 'completed' ? `txn-${Date.now()}` : undefined,
      scheduledDate: new Date().toISOString(),
      processedDate: processingStatus === 'completed' ? new Date().toISOString() : undefined,
      failureReason: processingStatus === 'failed' ? 'Insufficient funds' : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const statusCode = processingStatus === 'completed' ? 201 : 402;

    return HttpResponse.json(
      {
        success: processingStatus === 'completed',
        payment: newPayment,
        message: processingStatus === 'completed' 
          ? 'Payment processed successfully' 
          : 'Payment failed',
      },
      { status: statusCode }
    );
  }),

  // Get payment schedule
  http.get(`${testConfig.api.baseUrl}/payments/schedule/:loanId`, ({ params, request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const schedule = mockPaymentSchedule.filter(item => item.loanId === params.loanId);
    
    if (schedule.length === 0) {
      return HttpResponse.json(
        { success: false, error: 'Payment schedule not found' },
        { status: 404 }
      );
    }

    return HttpResponse.json({
      success: true,
      schedule,
      summary: {
        totalPayments: schedule.length,
        totalAmount: schedule.reduce((sum, item) => sum + item.amount, 0),
        remainingPayments: schedule.filter(item => item.status === 'scheduled').length,
        nextPaymentDate: schedule.find(item => item.status === 'scheduled')?.scheduledDate,
      },
    });
  }),

  // Retry failed payment
  http.post(`${testConfig.api.baseUrl}/payments/:id/retry`, ({ params, request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const payment = mockPayments.find(p => p.id === params.id);
    
    if (!payment) {
      return HttpResponse.json(
        { success: false, error: 'Payment not found' },
        { status: 404 }
      );
    }

    if (payment.status !== 'failed') {
      return HttpResponse.json(
        { success: false, error: 'Only failed payments can be retried' },
        { status: 400 }
      );
    }

    // Simulate retry processing
    const retryStatus = Math.random() > 0.3 ? 'completed' : 'failed'; // 70% success rate on retry
    
    return HttpResponse.json({
      success: retryStatus === 'completed',
      payment: {
        ...payment,
        status: retryStatus,
        processedDate: retryStatus === 'completed' ? new Date().toISOString() : undefined,
        transactionId: retryStatus === 'completed' ? `txn-retry-${Date.now()}` : undefined,
        failureReason: retryStatus === 'failed' ? 'Card declined' : undefined,
        updatedAt: new Date().toISOString(),
      },
      message: retryStatus === 'completed' 
        ? 'Payment retry successful' 
        : 'Payment retry failed',
    });
  }),

  // Get payment methods
  http.get(`${testConfig.api.baseUrl}/payments/methods`, ({ request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return HttpResponse.json({
      success: true,
      methods: [
        {
          id: 'bank-1',
          type: 'bank_transfer',
          name: 'Chase Checking ****1234',
          isDefault: true,
          status: 'active',
        },
        {
          id: 'card-1',
          type: 'credit_card',
          name: 'Visa ****5678',
          isDefault: false,
          status: 'active',
          expiryDate: '12/25',
        },
        {
          id: 'wallet-1',
          type: 'digital_wallet',
          name: 'PayPal',
          isDefault: false,
          status: 'active',
        },
      ],
    });
  }),

  // Refund payment (admin only)
  http.post(`${testConfig.api.baseUrl}/payments/:id/refund`, async ({ params, request }) => {
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
    const { amount, reason } = body;

    const payment = mockPayments.find(p => p.id === params.id);
    
    if (!payment) {
      return HttpResponse.json(
        { success: false, error: 'Payment not found' },
        { status: 404 }
      );
    }

    if (payment.status !== 'completed') {
      return HttpResponse.json(
        { success: false, error: 'Only completed payments can be refunded' },
        { status: 400 }
      );
    }

    const refundAmount = amount || payment.amount;
    
    if (refundAmount > payment.amount) {
      return HttpResponse.json(
        { success: false, error: 'Refund amount cannot exceed payment amount' },
        { status: 400 }
      );
    }

    return HttpResponse.json(
      {
        success: true,
        refund: {
          id: `refund-${Date.now()}`,
          paymentId: payment.id,
          amount: refundAmount,
          reason: reason || 'Administrative refund',
          status: 'processed',
          processedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        message: 'Refund processed successfully',
      },
      { status: 201 }
    );
  }),
];