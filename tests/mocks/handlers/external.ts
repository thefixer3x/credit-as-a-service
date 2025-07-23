import { http, HttpResponse } from 'msw';
import { testConfig } from '../../setup/test-env';

export const externalHandlers = [
  // Mock SME API integration
  http.get(`${testConfig.external.smeApiUrl}/businesses/:id`, ({ params }) => {
    return HttpResponse.json({
      success: true,
      business: {
        id: params.id,
        name: 'Test Business LLC',
        industry: 'Technology',
        revenue: 500000,
        employees: 15,
        yearEstablished: 2018,
        creditRating: 'A',
        riskScore: 780,
        verificationStatus: 'verified',
        documents: [
          {
            type: 'business_license',
            status: 'verified',
            uploadedAt: '2024-01-10T00:00:00Z',
          },
          {
            type: 'tax_returns',
            status: 'verified',
            uploadedAt: '2024-01-10T00:00:00Z',
          },
        ],
      },
    });
  }),

  http.post(`${testConfig.external.smeApiUrl}/businesses/:id/verify`, ({ params }) => {
    return HttpResponse.json({
      success: true,
      verification: {
        businessId: params.id,
        status: 'completed',
        verifiedAt: new Date().toISOString(),
        checks: {
          businessRegistration: 'passed',
          taxCompliance: 'passed',
          financialStanding: 'passed',
          ownershipVerification: 'passed',
        },
        riskAssessment: {
          score: 780,
          level: 'low',
          factors: [
            'Strong financial history',
            'Verified business registration',
            'Good tax compliance record',
          ],
        },
      },
    });
  }),

  // Mock Payment Gateway
  http.post(`${testConfig.external.paymentGatewayUrl}/payments/process`, async ({ request }) => {
    const body = await request.json() as any;
    const { amount, paymentMethod, merchantId } = body;

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Simulate random success/failure
    const isSuccess = Math.random() > 0.15; // 85% success rate

    if (isSuccess) {
      return HttpResponse.json({
        success: true,
        transaction: {
          id: `txn_${Date.now()}`,
          amount,
          currency: 'USD',
          status: 'completed',
          paymentMethod,
          merchantId,
          processedAt: new Date().toISOString(),
          fees: {
            processing: amount * 0.029, // 2.9%
            fixed: 0.30,
          },
        },
      });
    } else {
      return HttpResponse.json(
        {
          success: false,
          error: 'Payment processing failed',
          errorCode: 'INSUFFICIENT_FUNDS',
          transaction: {
            id: `txn_${Date.now()}`,
            amount,
            currency: 'USD',
            status: 'failed',
            paymentMethod,
            merchantId,
            failedAt: new Date().toISOString(),
            failureReason: 'Insufficient funds in account',
          },
        },
        { status: 402 }
      );
    }
  }),

  http.get(`${testConfig.external.paymentGatewayUrl}/payments/:transactionId`, ({ params }) => {
    return HttpResponse.json({
      success: true,
      transaction: {
        id: params.transactionId,
        amount: 1156.25,
        currency: 'USD',
        status: 'completed',
        paymentMethod: 'bank_transfer',
        processedAt: '2024-01-15T09:30:00Z',
        fees: {
          processing: 33.53,
          fixed: 0.30,
        },
      },
    });
  }),

  http.post(`${testConfig.external.paymentGatewayUrl}/payments/:transactionId/refund`, async ({ params, request }) => {
    const body = await request.json() as any;
    const { amount, reason } = body;

    return HttpResponse.json({
      success: true,
      refund: {
        id: `rfnd_${Date.now()}`,
        transactionId: params.transactionId,
        amount: amount || 1156.25,
        currency: 'USD',
        status: 'completed',
        reason: reason || 'Refund requested',
        processedAt: new Date().toISOString(),
      },
    });
  }),

  // Mock Blockchain RPC calls
  http.post(`${testConfig.external.blockchainRpcUrl}`, async ({ request }) => {
    const body = await request.json() as any;
    const { method, params } = body;

    switch (method) {
      case 'eth_getBalance':
        return HttpResponse.json({
          jsonrpc: '2.0',
          id: body.id,
          result: '0x1bc16d674ec80000', // 2 ETH in wei
        });

      case 'eth_sendTransaction':
        return HttpResponse.json({
          jsonrpc: '2.0',
          id: body.id,
          result: `0x${Date.now().toString(16)}`, // Mock transaction hash
        });

      case 'eth_getTransactionReceipt':
        return HttpResponse.json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            transactionHash: params[0],
            blockNumber: '0x1b4',
            gasUsed: '0x5208',
            status: '0x1', // Success
            logs: [],
          },
        });

      case 'eth_call':
        // Mock smart contract call
        return HttpResponse.json({
          jsonrpc: '2.0',
          id: body.id,
          result: '0x0000000000000000000000000000000000000000000000000de0b6b3a7640000', // Mock return value
        });

      default:
        return HttpResponse.json(
          {
            jsonrpc: '2.0',
            id: body.id,
            error: {
              code: -32601,
              message: 'Method not found',
            },
          },
          { status: 404 }
        );
    }
  }),

  // Mock Credit Bureau API
  http.get('https://api.creditbureau.com/reports/:ssn', ({ params }) => {
    return HttpResponse.json({
      success: true,
      report: {
        ssn: params.ssn,
        score: Math.floor(Math.random() * 350) + 500, // 500-850
        history: [
          {
            date: '2024-01-01',
            score: 720,
            factors: ['Payment history', 'Credit utilization'],
          },
          {
            date: '2023-10-01',
            score: 715,
            factors: ['Length of credit history'],
          },
        ],
        accounts: [
          {
            type: 'credit_card',
            balance: 2500,
            limit: 10000,
            status: 'current',
          },
          {
            type: 'auto_loan',
            balance: 15000,
            originalAmount: 25000,
            status: 'current',
          },
        ],
        inquiries: [
          {
            date: '2024-01-10',
            creditor: 'Test Bank',
            type: 'hard',
          },
        ],
      },
    });
  }),

  // Mock Identity Verification Service
  http.post('https://api.idverify.com/verify', async ({ request }) => {
    const body = await request.json() as any;
    const { firstName, lastName, ssn, address } = body;

    return HttpResponse.json({
      success: true,
      verification: {
        id: `verify_${Date.now()}`,
        status: 'verified',
        confidence: 0.95,
        checks: {
          nameMatch: true,
          ssnValid: true,
          addressMatch: true,
          phoneMatch: true,
        },
        warnings: [],
        verifiedAt: new Date().toISOString(),
      },
    });
  }),

  // Mock Email Service
  http.post('https://api.emailservice.com/send', async ({ request }) => {
    const body = await request.json() as any;
    const { to, subject, template, data } = body;

    return HttpResponse.json({
      success: true,
      messageId: `msg_${Date.now()}`,
      status: 'sent',
      recipient: to,
      subject,
      sentAt: new Date().toISOString(),
    });
  }),

  // Mock SMS Service
  http.post('https://api.smsservice.com/send', async ({ request }) => {
    const body = await request.json() as any;
    const { to, message } = body;

    return HttpResponse.json({
      success: true,
      messageId: `sms_${Date.now()}`,
      status: 'sent',
      recipient: to,
      sentAt: new Date().toISOString(),
      cost: 0.0075, // $0.0075 per SMS
    });
  }),

  // Mock Push Notification Service
  http.post('https://api.pushservice.com/send', async ({ request }) => {
    const body = await request.json() as any;
    const { deviceToken, title, message, data } = body;

    return HttpResponse.json({
      success: true,
      messageId: `push_${Date.now()}`,
      status: 'sent',
      deviceToken,
      sentAt: new Date().toISOString(),
    });
  }),

  // Mock Document Storage Service
  http.post('https://api.docstorage.com/upload', async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    return HttpResponse.json({
      success: true,
      document: {
        id: `doc_${Date.now()}`,
        filename: file?.name || 'document.pdf',
        size: file?.size || 1024,
        contentType: file?.type || 'application/pdf',
        url: `https://cdn.docstorage.com/docs/doc_${Date.now()}`,
        uploadedAt: new Date().toISOString(),
      },
    });
  }),

  http.get('https://api.docstorage.com/docs/:docId', ({ params }) => {
    return HttpResponse.json({
      success: true,
      document: {
        id: params.docId,
        filename: 'business_license.pdf',
        size: 2048,
        contentType: 'application/pdf',
        url: `https://cdn.docstorage.com/docs/${params.docId}`,
        uploadedAt: '2024-01-10T00:00:00Z',
      },
    });
  }),
];