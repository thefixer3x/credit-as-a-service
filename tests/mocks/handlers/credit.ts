import { http, HttpResponse } from 'msw';
import { testConfig } from '../../setup/test-env';

const mockApplications = [
  {
    id: 'app-123',
    userId: 'user-123',
    amount: 10000,
    purpose: 'Business expansion',
    status: 'pending',
    riskScore: 750,
    submittedAt: '2024-01-15T10:00:00Z',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'app-456',
    userId: 'user-123',
    amount: 25000,
    purpose: 'Equipment purchase',
    status: 'approved',
    riskScore: 820,
    submittedAt: '2024-01-10T14:30:00Z',
    processedAt: '2024-01-12T09:15:00Z',
    createdAt: '2024-01-10T14:30:00Z',
    updatedAt: '2024-01-12T09:15:00Z',
  },
];

const mockOffers = [
  {
    id: 'offer-123',
    applicationId: 'app-456',
    amount: 25000,
    interestRate: 0.0850,
    termMonths: 24,
    monthlyPayment: 1156.25,
    status: 'accepted',
    expiresAt: '2024-01-20T23:59:59Z',
    createdAt: '2024-01-12T09:15:00Z',
    updatedAt: '2024-01-12T11:30:00Z',
  },
];

export const creditHandlers = [
  // Get credit applications
  http.get(`${testConfig.api.baseUrl}/credit/applications`, ({ request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return HttpResponse.json({
      success: true,
      applications: mockApplications,
      pagination: {
        page: 1,
        limit: 10,
        total: mockApplications.length,
        pages: 1,
      },
    });
  }),

  // Get specific credit application
  http.get(`${testConfig.api.baseUrl}/credit/applications/:id`, ({ params, request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const application = mockApplications.find(app => app.id === params.id);
    
    if (!application) {
      return HttpResponse.json(
        { success: false, error: 'Application not found' },
        { status: 404 }
      );
    }

    return HttpResponse.json({
      success: true,
      application,
    });
  }),

  // Submit credit application
  http.post(`${testConfig.api.baseUrl}/credit/applications`, async ({ request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json() as any;
    const { amount, purpose, term } = body;

    // Validate required fields
    if (!amount || !purpose) {
      return HttpResponse.json(
        {
          success: false,
          error: 'Missing required fields',
          details: {
            amount: !amount ? 'Amount is required' : undefined,
            purpose: !purpose ? 'Purpose is required' : undefined,
          },
        },
        { status: 400 }
      );
    }

    // Mock business rules
    if (amount > 100000) {
      return HttpResponse.json(
        {
          success: false,
          error: 'Amount exceeds maximum limit',
          errorCode: 'AMOUNT_TOO_HIGH',
        },
        { status: 400 }
      );
    }

    const newApplication = {
      id: `app-${Date.now()}`,
      userId: 'user-123',
      amount,
      purpose,
      term: term || 12,
      status: 'pending',
      riskScore: Math.floor(Math.random() * 300) + 600, // 600-900
      submittedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return HttpResponse.json(
      {
        success: true,
        application: newApplication,
        message: 'Application submitted successfully',
      },
      { status: 201 }
    );
  }),

  // Get credit offers for application
  http.get(`${testConfig.api.baseUrl}/credit/applications/:id/offers`, ({ params, request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const applicationOffers = mockOffers.filter(offer => offer.applicationId === params.id);

    return HttpResponse.json({
      success: true,
      offers: applicationOffers,
    });
  }),

  // Create credit offer (admin/lender only)
  http.post(`${testConfig.api.baseUrl}/credit/applications/:id/offers`, async ({ params, request }) => {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.split(' ')[1];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Mock role check
    if (token !== 'mock-admin-token' && token !== 'mock-lender-token') {
      return HttpResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json() as any;
    const { amount, interestRate, termMonths } = body;

    if (!amount || !interestRate || !termMonths) {
      return HttpResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const monthlyPayment = calculateMonthlyPayment(amount, interestRate, termMonths);
    
    const newOffer = {
      id: `offer-${Date.now()}`,
      applicationId: params.id as string,
      amount,
      interestRate,
      termMonths,
      monthlyPayment,
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return HttpResponse.json(
      {
        success: true,
        offer: newOffer,
        message: 'Offer created successfully',
      },
      { status: 201 }
    );
  }),

  // Accept credit offer
  http.post(`${testConfig.api.baseUrl}/credit/offers/:id/accept`, ({ params, request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const offer = mockOffers.find(o => o.id === params.id);
    
    if (!offer) {
      return HttpResponse.json(
        { success: false, error: 'Offer not found' },
        { status: 404 }
      );
    }

    if (offer.status !== 'pending') {
      return HttpResponse.json(
        { success: false, error: 'Offer is no longer available' },
        { status: 400 }
      );
    }

    // Check if offer is expired
    if (new Date(offer.expiresAt) < new Date()) {
      return HttpResponse.json(
        { success: false, error: 'Offer has expired' },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      success: true,
      message: 'Offer accepted successfully',
      loan: {
        id: `loan-${Date.now()}`,
        offerId: offer.id,
        amount: offer.amount,
        interestRate: offer.interestRate,
        termMonths: offer.termMonths,
        monthlyPayment: offer.monthlyPayment,
        status: 'active',
        disbursedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  }),

  // Reject credit offer
  http.post(`${testConfig.api.baseUrl}/credit/offers/:id/reject`, ({ params, request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    return HttpResponse.json({
      success: true,
      message: 'Offer rejected successfully',
    });
  }),

  // Get loans
  http.get(`${testConfig.api.baseUrl}/loans`, ({ request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const mockLoans = [
      {
        id: 'loan-123',
        userId: 'user-123',
        amount: 25000,
        interestRate: 0.0850,
        termMonths: 24,
        monthlyPayment: 1156.25,
        remainingBalance: 20000,
        status: 'active',
        nextPaymentDate: '2024-02-15T00:00:00Z',
        disbursedAt: '2024-01-12T11:30:00Z',
        createdAt: '2024-01-12T11:30:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
      },
    ];

    return HttpResponse.json({
      success: true,
      loans: mockLoans,
    });
  }),
];

// Helper function to calculate monthly payment
function calculateMonthlyPayment(principal: number, annualRate: number, termMonths: number): number {
  const monthlyRate = annualRate / 12;
  const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / 
                  (Math.pow(1 + monthlyRate, termMonths) - 1);
  return Math.round(payment * 100) / 100; // Round to 2 decimal places
}