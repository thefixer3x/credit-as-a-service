# @caas/sdk

The official TypeScript SDK for the Credit-as-a-Service Platform. Build robust credit and lending applications with enterprise-grade APIs.

## Features

- 🚀 **Full TypeScript Support** - Complete type safety and IntelliSense
- 🔒 **Built-in Security** - Authentication, rate limiting, and request signing
- 🎯 **Error Handling** - Comprehensive error types with retry logic
- 📊 **Event System** - Real-time monitoring of API requests and responses
- 🔄 **Auto Retry** - Exponential backoff for failed requests
- 📱 **Cross Platform** - Works in Node.js, React, React Native, and browsers
- 🌐 **Multi Environment** - Development, staging, and production support

## Installation

```bash
npm install @caas/sdk
# or
yarn add @caas/sdk
# or
pnpm add @caas/sdk
```

## Quick Start

### Basic Usage

```typescript
import { CaasSDK } from '@caas/sdk';

// Initialize the SDK
const caas = new CaasSDK({
  apiKey: 'your-api-key',
  environment: 'production' // or 'development' | 'staging'
});

// Create a new user
const user = await caas.users.createUser({
  email: 'john@example.com',
  firstName: 'John',
  lastName: 'Doe',
  phone: '+1234567890'
});

console.log('User created:', user.id);
```

### Simplified Setup

```typescript
import CaasSDK from '@caas/sdk';

// Quick setup for production
const caas = CaasSDK.create('your-api-key', 'production');
```

## Authentication

Get your API key from the [CAAS Dashboard](https://dashboard.caas-platform.com):

```typescript
const caas = new CaasSDK({
  apiKey: 'caas_live_1234567890abcdef', // Production key
  // apiKey: 'caas_test_1234567890abcdef', // Test key
  environment: 'production'
});
```

## User Management

### Create User

```typescript
const user = await caas.users.createUser({
  email: 'jane@example.com',
  firstName: 'Jane',
  lastName: 'Smith',
  phone: '+1987654321'
});
```

### Get User

```typescript
// By ID
const user = await caas.users.getUserById('user_123');

// By email
const user = await caas.users.getUserByEmail('jane@example.com');
```

### Update User

```typescript
const updatedUser = await caas.users.updateUser('user_123', {
  firstName: 'Jane',
  phone: '+1555000123'
});
```

### List Users

```typescript
const result = await caas.users.listUsers(
  { page: 1, limit: 20 }, // pagination
  { status: 'active' }    // filters
);

console.log(`Found ${result.total} users`);
result.users.forEach(user => console.log(user.email));
```

## Credit Applications

### Create Application

```typescript
const application = await caas.credit.createApplication({
  userId: 'user_123',
  requestedAmount: 25000,
  purpose: 'Business expansion',
  termMonths: 36,
  employmentInfo: {
    status: 'employed',
    employer: 'Tech Corp',
    annualIncome: 75000,
    yearsEmployed: 3
  },
  financialInfo: {
    monthlyIncome: 6250,
    monthlyExpenses: 3000,
    assets: 50000,
    debts: 15000
  }
});
```

### Get Application

```typescript
const application = await caas.credit.getApplicationById('app_123');
console.log(`Status: ${application.status}`);
```

### Submit for Review

```typescript
const submittedApp = await caas.credit.submitApplication('app_123');
```

### Make Credit Decision

```typescript
// Approve application
const approvedApp = await caas.credit.makeCreditDecision({
  applicationId: 'app_123',
  decision: 'approve',
  approvedAmount: 20000,
  interestRate: 8.5,
  termMonths: 36,
  conditions: ['Provide additional documentation']
});

// Reject application
const rejectedApp = await caas.credit.makeCreditDecision({
  applicationId: 'app_124',
  decision: 'reject',
  reason: 'Insufficient credit history'
});
```

### Get Loan Quote

```typescript
const quote = await caas.credit.calculateLoanQuote({
  amount: 10000,
  termMonths: 24,
  creditScore: 720,
  userId: 'user_123' // optional for personalized rates
});

console.log(`Monthly payment: $${quote.monthlyPayment}`);
console.log(`Total interest: $${quote.totalInterest}`);
```

## Loan Management

### Get Loan

```typescript
const loan = await caas.credit.getLoanById('loan_123');
console.log(`Outstanding balance: $${loan.outstandingBalance}`);
```

### List Loans

```typescript
// All loans
const allLoans = await caas.credit.listLoans(
  { page: 1, limit: 10 },
  { status: 'active' }
);

// User's loans
const userLoans = await caas.credit.getLoansByUserId('user_123');
```

## Error Handling

The SDK provides comprehensive error handling with specific error types:

```typescript
import { 
  CaasError, 
  CaasAuthError, 
  CaasRateLimitError, 
  CaasValidationError 
} from '@caas/sdk';

try {
  const user = await caas.users.createUser(invalidData);
} catch (error) {
  if (error instanceof CaasAuthError) {
    console.error('Authentication failed:', error.message);
  } else if (error instanceof CaasValidationError) {
    console.error('Validation error:', error.details);
  } else if (error instanceof CaasRateLimitError) {
    console.error('Rate limit exceeded, retry after:', error.message);
  } else if (error instanceof CaasError) {
    console.error('API error:', error.code, error.message);
  }
}
```

## Event Monitoring

Monitor SDK activity with events:

```typescript
// Listen to all requests
caas.on('request:start', (data) => {
  console.log(`Starting ${data.method} ${data.url}`);
});

caas.on('request:success', (data) => {
  console.log(`✅ ${data.method} ${data.url} (${data.duration}ms)`);
});

caas.on('request:error', (data) => {
  console.error(`❌ ${data.method} ${data.url}: ${data.error.message}`);
});

// Handle authentication expiry
caas.on('auth:expired', () => {
  console.log('API key expired, please renew');
});

// Handle rate limiting
caas.on('rate:limit', (data) => {
  console.log(`Rate limited, resets at ${new Date(data.resetTime)}`);
});
```

## Configuration

### Full Configuration

```typescript
const caas = new CaasSDK({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.caas-platform.com/api', // optional
  environment: 'production',
  timeout: 30000,        // 30 seconds
  retryAttempts: 3,      // retry failed requests
  retryDelay: 1000,      // base delay between retries (ms)
  rateLimitPerHour: 1000 // requests per hour
});
```

### Update Configuration

```typescript
caas.updateConfig({
  timeout: 45000,
  retryAttempts: 5
});
```

### Health Check

```typescript
const health = await caas.healthCheck();
if (health.status === 'healthy') {
  console.log('✅ API is operational');
} else {
  console.log('❌ API is experiencing issues');
}
```

## TypeScript Support

The SDK is fully typed with comprehensive interfaces:

```typescript
import type { 
  User, 
  CreditApplication, 
  Loan, 
  Payment,
  Transaction,
  SdkConfig 
} from '@caas/sdk';

// All API responses are strongly typed
const user: User = await caas.users.getUserById('user_123');
const applications: CreditApplication[] = result.applications;
```

## React Integration

### Custom Hook

```typescript
import { useState, useEffect } from 'react';
import { CaasSDK, User } from '@caas/sdk';

const caas = new CaasSDK({ apiKey: process.env.REACT_APP_CAAS_API_KEY! });

function useUser(userId: string) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    caas.users.getUserById(userId)
      .then(setUser)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId]);

  return { user, loading, error };
}

// Usage
function UserProfile({ userId }: { userId: string }) {
  const { user, loading, error } = useUser(userId);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!user) return <div>User not found</div>;

  return (
    <div>
      <h1>{user.firstName} {user.lastName}</h1>
      <p>{user.email}</p>
    </div>
  );
}
```

## React Native Integration

```typescript
import { CaasSDK } from '@caas/sdk';
import AsyncStorage from '@react-native-async-storage/async-storage';

const caas = new CaasSDK({
  apiKey: 'your-mobile-api-key',
  environment: 'production'
});

// Example: Create loan application
async function applyForLoan(userId: string, amount: number) {
  try {
    const application = await caas.credit.createApplication({
      userId,
      requestedAmount: amount,
      purpose: 'Personal loan'
    });
    
    // Cache locally
    await AsyncStorage.setItem(
      `application_${application.id}`, 
      JSON.stringify(application)
    );
    
    return application;
  } catch (error) {
    console.error('Loan application failed:', error);
    throw error;
  }
}
```

## Environment Variables

Create a `.env` file:

```env
# Development
CAAS_API_KEY=caas_test_1234567890abcdef
CAAS_ENVIRONMENT=development

# Production  
CAAS_API_KEY=caas_live_1234567890abcdef
CAAS_ENVIRONMENT=production
```

```typescript
const caas = new CaasSDK({
  apiKey: process.env.CAAS_API_KEY!,
  environment: process.env.CAAS_ENVIRONMENT as 'development' | 'production'
});
```

## Rate Limiting

The SDK automatically handles rate limiting:

- Default: 1000 requests per hour
- Automatic retry with exponential backoff
- Events for rate limit monitoring

```typescript
caas.on('rate:limit', (data) => {
  const resetTime = new Date(data.resetTime);
  console.log(`Rate limited until ${resetTime.toLocaleTimeString()}`);
});
```

## Testing

### Mock SDK for Testing

```typescript
// tests/mocks/caas-sdk.ts
export const mockCaasSdk = {
  users: {
    createUser: jest.fn(),
    getUserById: jest.fn(),
    updateUser: jest.fn(),
  },
  credit: {
    createApplication: jest.fn(),
    getApplicationById: jest.fn(),
  }
};

// tests/user.test.ts
import { mockCaasSdk } from './mocks/caas-sdk';

test('should create user', async () => {
  const userData = { email: 'test@example.com', firstName: 'Test', lastName: 'User' };
  const expectedUser = { id: 'user_123', ...userData };
  
  mockCaasSdk.users.createUser.mockResolvedValue(expectedUser);
  
  const user = await mockCaasSdk.users.createUser(userData);
  expect(user.id).toBe('user_123');
});
```

## API Reference

### SDK Methods

| Method | Description |
|--------|-------------|
| `new CaasSDK(config)` | Create SDK instance |
| `CaasSDK.create(apiKey, env)` | Quick setup |
| `updateConfig(config)` | Update configuration |
| `healthCheck()` | Check API health |

### User Service

| Method | Description |
|--------|-------------|
| `createUser(data)` | Create new user |
| `getUserById(id)` | Get user by ID |
| `getUserByEmail(email)` | Get user by email |
| `updateUser(id, data)` | Update user |
| `listUsers(pagination, filters)` | List users |
| `deleteUser(id)` | Delete user |
| `suspendUser(id, reason)` | Suspend user |
| `reactivateUser(id)` | Reactivate user |

### Credit Service

| Method | Description |
|--------|-------------|
| `createApplication(data)` | Create credit application |
| `getApplicationById(id)` | Get application |
| `updateApplication(id, data)` | Update application |
| `submitApplication(id)` | Submit for review |
| `makeCreditDecision(decision)` | Approve/reject |
| `calculateLoanQuote(params)` | Get loan quote |
| `getLoanById(id)` | Get loan details |
| `listLoans(pagination, filters)` | List loans |

## Support

- 📖 **Documentation**: [docs.caas-platform.com](https://docs.caas-platform.com)
- 🐛 **Issues**: [github.com/caas-platform/sdk/issues](https://github.com/caas-platform/sdk/issues)
- 💬 **Discord**: [discord.gg/caas-platform](https://discord.gg/caas-platform)
- 📧 **Email**: support@caas-platform.com

## License

MIT © Credit-as-a-Service Platform