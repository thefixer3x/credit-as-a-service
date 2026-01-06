# Credit-as-a-Service Platform: Vendor/Credit Provider Plugin API Integration Guide

Based on the project documentation analysis, this guide provides specific API locations and integration patterns for simulating vendor/credit provider plugins on the Credit-as-a-Service platform.

## Platform Overview

- **Repository**: https://github.com/thefixer3x/credit-as-a-service
- **Architecture**: Microservices with Event-driven Architecture
- **Status**: Phase 5 Completed - API Route Handlers & Credit Engine
- **Tech Stack**: Node.js, TypeScript, Fastify, PostgreSQL, Redis, Kafka

## Core API Endpoints for Vendor Integration

### 1. Provider Integration Service

**Base Path**: `/api/v1/providers`

#### Register New Credit Provider
```http
POST /api/v1/providers/register
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>
X-API-Key: <API_KEY>

{
  "provider_name": "Mock Lending Bank",
  "provider_type": "traditional", // traditional|defi|p2p
  "api_endpoint": "https://api.mocklender.com/v1",
  "webhook_url": "https://api.mocklender.com/webhooks",
  "supported_products": [
    "personal_loan",
    "business_loan", 
    "line_of_credit"
  ],
  "rate_structure": {
    "min_rate": 5.99,
    "max_rate": 24.99,
    "rate_type": "variable"
  },
  "compliance_certifications": ["SOC2", "PCI-DSS"],
  "max_loan_amount": 500000,
  "min_credit_score": 600
}
```

#### Check Provider Status
```http
GET /api/v1/providers/{provider_id}/status
Authorization: Bearer <JWT_TOKEN>
```

#### Request Rate Quotes
```http
POST /api/v1/providers/{provider_id}/quotes
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>

{
  "loan_amount": 25000,
  "loan_term": 60,
  "credit_score": 720,
  "collateral_value": 30000,
  "loan_purpose": "debt_consolidation",
  "employment_status": "employed",
  "annual_income": 75000
}
```

#### Submit Loan Application
```http
POST /api/v1/providers/{provider_id}/applications
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>

{
  "user_id": "uuid",
  "application_data": {
    "personal_info": {...},
    "financial_info": {...},
    "loan_details": {...}
  },
  "documents": [...],
  "consent_agreements": [...]
}
```

### 2. Credit Aggregation API

**Base Path**: `/api/v1/credit`

#### Aggregate Credit Offers
```http
POST /api/v1/credit/aggregate
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>

{
  "user_id": "uuid",
  "loan_request": {
    "amount": 25000,
    "purpose": "home_improvement",
    "term_months": 60
  },
  "filters": {
    "max_rate": 15.0,
    "provider_types": ["traditional", "defi"],
    "min_credit_score": 650
  }
}
```

#### Compare Offers
```http
GET /api/v1/credit/compare/{request_id}
Authorization: Bearer <JWT_TOKEN>
```

### 3. Webhook Integration

**Base Path**: `/api/v1/webhooks`

#### Provider Event Notifications
```http
POST /api/v1/webhooks/providers/{provider_id}
Content-Type: application/json
X-Webhook-Signature: <HMAC_SIGNATURE>

{
  "event_type": "application.approved",
  "application_id": "uuid",
  "timestamp": "2024-10-02T11:06:00Z",
  "data": {
    "loan_amount": 25000,
    "approved_rate": 8.99,
    "loan_term": 60,
    "conditions": [...]
  }
}
```

**Supported Events**:
- `application.approved`
- `application.rejected`
- `application.pending`
- `loan.funded`
- `payment.received`
- `payment.failed`
- `loan.defaulted`

### 4. Smart Contract Integration

**Base Path**: `/api/v1/contracts`

#### Create Credit Agreement
```http
POST /api/v1/contracts/credit-agreement
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>

{
  "loan_id": "uuid",
  "provider_id": "uuid",
  "contract_terms": {
    "principal": 25000,
    "interest_rate": 8.99,
    "term_months": 60,
    "payment_schedule": "monthly"
  },
  "collateral": {
    "type": "real_estate",
    "value": 300000,
    "address": "..."
  }
}
```

#### Manage Collateral
```http
POST /api/v1/contracts/collateral
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>

{
  "contract_id": "uuid",
  "action": "add|remove|update",
  "collateral_details": {...}
}
```

## Environment Configuration

### Development Environment
- **Base URL**: `http://localhost:3000`
- **Database**: `postgresql://localhost:5432/caas_dev`
- **API Documentation**: `http://localhost:3000/api/docs`

### Staging Environment  
- **Base URL**: `https://staging-api.creditaas.io`
- **Database**: `postgresql://staging-db:5432/caas`
- **API Documentation**: `https://staging-api.creditaas.io/api/docs`

### Production Environment
- **Base URL**: `https://api.creditaas.io`
- **Database**: `postgresql://prod-db:5432/caas`
- **API Documentation**: `https://api.creditaas.io/api/docs`

## Authentication & Security

### API Authentication
1. **JWT Tokens**: Required for all authenticated endpoints
2. **API Keys**: Required for provider registration and management
3. **Webhook Signatures**: HMAC-SHA256 for webhook verification

### Security Headers
```http
Authorization: Bearer <JWT_TOKEN>
X-API-Key: <API_KEY>
Content-Type: application/json
X-Request-ID: <UUID>
X-Client-Version: 1.0.0
```

## Database Schema for Providers

### Providers Table
```sql
CREATE TABLE providers (
  provider_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name VARCHAR(255) NOT NULL,
  provider_type VARCHAR(50) NOT NULL, -- 'traditional', 'defi', 'p2p'
  api_endpoint VARCHAR(500),
  webhook_url VARCHAR(500),
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive', 'pending'
  rate_structure JSONB,
  supported_products JSONB,
  compliance_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Rate Quotes Table
```sql
CREATE TABLE rate_quotes (
  quote_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES providers(provider_id),
  user_id UUID REFERENCES users(user_id),
  loan_amount DECIMAL(12,2),
  loan_term INTEGER,
  quoted_rate DECIMAL(5,2),
  expires_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Provider Plugin Simulation Examples

### 1. Traditional Bank Simulation
```javascript
// Mock Traditional Bank Provider
const mockTraditionalBank = {
  name: "First National Mock Bank",
  type: "traditional",
  baseUrl: "https://api.firstnationalmock.com/v1",
  endpoints: {
    quotes: "/loans/quotes",
    applications: "/loans/applications",
    status: "/loans/{loan_id}/status"
  },
  rateRange: { min: 3.99, max: 18.99 },
  maxLoanAmount: 100000,
  minCreditScore: 650
};
```

### 2. DeFi Protocol Simulation
```javascript
// Mock DeFi Protocol Provider
const mockDeFiProtocol = {
  name: "DecentraLend Protocol",
  type: "defi",
  baseUrl: "https://api.decentralend.io/v1",
  smartContract: "0x1234...abcd",
  collateralTypes: ["ETH", "WBTC", "USDC"],
  rateRange: { min: 2.5, max: 12.0 },
  maxLTV: 0.75 // Loan-to-Value ratio
};
```

### 3. P2P Lending Simulation
```javascript  
// Mock P2P Lending Platform
const mockP2PLender = {
  name: "PeerLend Network",
  type: "p2p",
  baseUrl: "https://api.peerlend.com/v1",
  investorPool: "active",
  rateRange: { min: 5.99, max: 24.99 },
  fundingModel: "marketplace"
};
```

## Testing Endpoints

### Health Check
```http
GET /api/health
```

### API Documentation
```http
GET /api/docs
```

### Provider Test Integration
```http
POST /api/v1/test/provider-integration
Content-Type: application/json

{
  "provider_config": {...},
  "test_scenarios": ["rate_quote", "application", "webhook"]
}
```

## Event-Driven Architecture Integration

### Kafka Topics for Provider Events
- `provider.registered`
- `provider.status.changed`
- `quote.requested`
- `quote.received`
- `application.submitted`
- `application.status.updated`
- `loan.funded`
- `payment.processed`

### Sample Event Message
```json
{
  "event_id": "uuid",
  "event_type": "quote.received",
  "timestamp": "2024-10-02T11:06:00Z",
  "source": "provider-integration-service",
  "data": {
    "provider_id": "uuid",
    "user_id": "uuid",
    "quote_details": {...}
  }
}
```

## Monitoring & Observability

### Provider Metrics Endpoints
```http
GET /api/v1/admin/providers/{provider_id}/metrics
GET /api/v1/admin/providers/{provider_id}/health
GET /api/v1/admin/providers/{provider_id}/performance
```

### System Health Dashboard
- Provider response times
- Success/failure rates  
- Quote conversion rates
- Application approval rates
- Real-time provider status

This comprehensive guide provides all the necessary API endpoints and integration patterns to simulate vendor/credit provider plugins for the Credit-as-a-Service platform. The platform's microservices architecture and event-driven design make it highly extensible for adding new credit providers.