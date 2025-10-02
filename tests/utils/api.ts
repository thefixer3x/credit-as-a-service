import supertest from 'supertest';
import { FastifyInstance } from 'fastify';
import { testConfig } from '../setup/test-env';
import { TestUser, createTestAuthHeaders } from './auth';

export class TestApiClient {
  private request: supertest.SuperTest<supertest.Test>;

  constructor(app: FastifyInstance | string) {
    if (typeof app === 'string') {
      this.request = supertest(app);
    } else {
      this.request = supertest(app.server);
    }
  }

  // Authentication endpoints
  async login(credentials: { email: string; password: string }) {
    return this.request
      .post('/auth/login')
      .send(credentials)
      .expect('Content-Type', /json/);
  }

  async register(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) {
    return this.request
      .post('/auth/register')
      .send(userData)
      .expect('Content-Type', /json/);
  }

  async logout(authHeaders: Record<string, string>) {
    return this.request
      .post('/auth/logout')
      .set(authHeaders);
  }

  async refreshToken(refreshToken: string) {
    return this.request
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect('Content-Type', /json/);
  }

  async getCurrentUser(authHeaders: Record<string, string>) {
    return this.request
      .get('/auth/me')
      .set(authHeaders)
      .expect('Content-Type', /json/);
  }

  // Credit/Loan endpoints
  async submitCreditApplication(
    applicationData: {
      amount: number;
      purpose: string;
      term?: number;
    },
    authHeaders: Record<string, string>
  ) {
    return this.request
      .post('/credit/applications')
      .set(authHeaders)
      .send(applicationData)
      .expect('Content-Type', /json/);
  }

  async getCreditApplications(authHeaders: Record<string, string>) {
    return this.request
      .get('/credit/applications')
      .set(authHeaders)
      .expect('Content-Type', /json/);
  }

  async getCreditApplication(id: string, authHeaders: Record<string, string>) {
    return this.request
      .get(`/credit/applications/${id}`)
      .set(authHeaders)
      .expect('Content-Type', /json/);
  }

  async createCreditOffer(
    applicationId: string,
    offerData: {
      amount: number;
      interestRate: number;
      termMonths: number;
    },
    authHeaders: Record<string, string>
  ) {
    return this.request
      .post(`/credit/applications/${applicationId}/offers`)
      .set(authHeaders)
      .send(offerData)
      .expect('Content-Type', /json/);
  }

  async acceptCreditOffer(offerId: string, authHeaders: Record<string, string>) {
    return this.request
      .post(`/credit/offers/${offerId}/accept`)
      .set(authHeaders)
      .expect('Content-Type', /json/);
  }

  // Payment endpoints
  async makePayment(
    paymentData: {
      loanId: string;
      amount: number;
      paymentMethod: string;
    },
    authHeaders: Record<string, string>
  ) {
    return this.request
      .post('/payments')
      .set(authHeaders)
      .send(paymentData)
      .expect('Content-Type', /json/);
  }

  async getPayments(loanId?: string, authHeaders?: Record<string, string>) {
    let url = '/payments';
    if (loanId) url += `?loanId=${loanId}`;
    
    const req = this.request.get(url).expect('Content-Type', /json/);
    
    if (authHeaders) {
      req.set(authHeaders);
    }
    
    return req;
  }

  async getPaymentSchedule(loanId: string, authHeaders: Record<string, string>) {
    return this.request
      .get(`/payments/schedule/${loanId}`)
      .set(authHeaders)
      .expect('Content-Type', /json/);
  }

  // Notification endpoints
  async getNotifications(authHeaders: Record<string, string>) {
    return this.request
      .get('/notifications')
      .set(authHeaders)
      .expect('Content-Type', /json/);
  }

  async markNotificationRead(id: string, authHeaders: Record<string, string>) {
    return this.request
      .put(`/notifications/${id}/read`)
      .set(authHeaders);
  }

  // Health checks
  async healthCheck() {
    return this.request
      .get('/health')
      .expect('Content-Type', /json/);
  }

  // Generic request methods
  async get(path: string, authHeaders?: Record<string, string>) {
    const req = this.request.get(path);
    if (authHeaders) req.set(authHeaders);
    return req;
  }

  async post(path: string, data?: any, authHeaders?: Record<string, string>) {
    const req = this.request.post(path);
    if (authHeaders) req.set(authHeaders);
    if (data) req.send(data);
    return req;
  }

  async put(path: string, data?: any, authHeaders?: Record<string, string>) {
    const req = this.request.put(path);
    if (authHeaders) req.set(authHeaders);
    if (data) req.send(data);
    return req;
  }

  async delete(path: string, authHeaders?: Record<string, string>) {
    const req = this.request.delete(path);
    if (authHeaders) req.set(authHeaders);
    return req;
  }
}

export function createTestApiClient(app: FastifyInstance | string): TestApiClient {
  return new TestApiClient(app);
}

// Helper to create authenticated requests
export function createAuthenticatedRequest(user: TestUser) {
  const headers = createTestAuthHeaders(user);
  return { headers, user };
}

// Test response helpers
export function expectSuccessResponse(response: supertest.Response) {
  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);
  expect(response.body).toHaveProperty('success', true);
}

export function expectErrorResponse(response: supertest.Response, expectedStatus: number) {
  expect(response.status).toBe(expectedStatus);
  expect(response.body).toHaveProperty('success', false);
  expect(response.body).toHaveProperty('error');
}

export function expectValidationError(response: supertest.Response) {
  expectErrorResponse(response, 400);
}

export function expectUnauthorizedError(response: supertest.Response) {
  expectErrorResponse(response, 401);
}

export function expectForbiddenError(response: supertest.Response) {
  expectErrorResponse(response, 403);
}

export function expectNotFoundError(response: supertest.Response) {
  expectErrorResponse(response, 404);
}