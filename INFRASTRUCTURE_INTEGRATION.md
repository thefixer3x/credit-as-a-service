# Infrastructure Integration Strategy

## Current SME Infrastructure (srv896342.hstgr.cloud)

**Server Details:**
- **Host**: srv896342.hstgr.cloud  
- **IP**: 168.231.74.29 (IPv4) / 2a02:4780:2d:cc43::1 (IPv6)
- **OS**: Ubuntu 22.04 LTS
- **Resources**: 1 CPU, 4GB RAM, 50GB disk, 4TB bandwidth
- **Status**: Running and operational

**Firewall Configuration:**
- ✅ SSH Access: Ports 22, 2222
- ✅ HTTP/HTTPS: Ports 80, 443 (newly added)
- ✅ Microservices: Ports 8000-8010 (newly added)

## Existing SME Services (Assumed Based on sme.seftechub.com)

### 1. **Verification & Compliance Services**
- **KYC/KYB Service**: Prembly/SourceID integration
- **Document Processing**: Upload, OCR, verification pipeline
- **AML Screening**: Sanctions list checking
- **Compliance Dashboard**: Regulatory reporting

### 2. **Payment & Banking Infrastructure**
- **Payment Gateway**: Paystack, Stripe integrations
- **Bank Transfer Rails**: Nigerian and international transfers
- **Virtual Account Management**: Account generation and management
- **Transaction Monitoring**: Real-time transaction tracking

### 3. **Core Platform Services**
- **Authentication Service**: OAuth2/JWT with refresh tokens
- **User Management**: B2B user accounts and role management
- **API Gateway**: Rate limiting, request routing, analytics
- **Webhook Infrastructure**: Event propagation and retry logic

### 4. **Data & Storage Services**
- **Database**: PostgreSQL (likely hosted)
- **File Storage**: Document and image storage
- **Redis Cache**: Session and data caching
- **Analytics**: Usage and business metrics

## CaaS Integration Strategy

### **Reuse & Extend Approach**
Instead of rebuilding existing services, our Credit-as-a-Service platform will:

#### 1. **Authentication Integration**
```typescript
// Extend existing auth with credit-specific permissions
interface CreditPermissions {
  'credit:application:create' | 'credit:application:approve' | 
  'credit:disbursement:execute' | 'credit:collection:manage'
}

// Leverage existing JWT tokens with additional claims
interface ExtendedJWTPayload extends ExistingJWTPayload {
  creditPermissions: CreditPermissions[];
  creditLimit?: number;
  riskRating?: 'low' | 'medium' | 'high';
}
```

#### 2. **KYC Data Reuse**
```typescript
// Integrate with existing KYC service
interface ExistingKYCData {
  userId: string;
  kycStatus: 'verified' | 'pending' | 'rejected';
  documents: KYCDocument[];
  verificationDate: Date;
  riskScore: number;
}

// Extend for credit-specific requirements
interface CreditKYCExtension {
  creditScore?: number;
  employmentVerification?: boolean;
  incomeVerification?: boolean;
  bankStatementAnalysis?: FinancialAnalysis;
}
```

#### 3. **Payment Rails Extension**
```typescript
// Build on existing payment infrastructure
interface CreditDisbursement extends ExistingPayment {
  creditApplicationId: string;
  disbursementMethod: 'bank_transfer' | 'virtual_account' | 'wallet';
  repaymentSchedule: RepaymentPlan;
  collateralRequirement?: CollateralInfo;
}
```

#### 4. **Webhook Event Extension**
```typescript
// Extend existing webhook events
type CreditWebhookEvents = 
  | 'credit.application.submitted'
  | 'credit.application.approved'
  | 'credit.disbursement.completed'
  | 'credit.repayment.due'
  | 'credit.repayment.missed'
  | 'credit.collection.initiated';
```

## Service Deployment Plan

### **Port Allocation Strategy**
```yaml
Existing SME Services:
  - API Gateway: :80, :443
  - Auth Service: :3000 (assumed)
  - Database: :5432 (assumed)
  - Redis: :6379 (assumed)

New CaaS Services:
  - Credit API Gateway: :8000
  - Underwriting Engine: :8001
  - Offers Engine: :8002
  - Disbursement Service: :8003
  - Repayment Service: :8004
  - Collections Service: :8005
  - Ledger Service: :8006
  - Notifications Service: :8007
  - Blockchain Orchestration: :8008
  - Analytics Service: :8009
  - Health Check Service: :8010
```

### **Database Integration**
- **Shared Database**: Extend existing PostgreSQL with CaaS tables
- **Schema Separation**: Use `caas_` prefix for all credit-related tables
- **Row-Level Security**: Ensure proper tenant isolation
- **Migration Strategy**: Incremental schema updates

### **API Integration Patterns**

#### 1. **Facade Pattern for Existing Services**
```typescript
// Wrap existing SME APIs with credit-specific business logic
class CreditVerificationService {
  constructor(
    private smeKYCService: SMEKYCService,
    private creditScoringEngine: CreditScoringEngine
  ) {}

  async assessCreditworthiness(userId: string): Promise<CreditAssessment> {
    const kycData = await this.smeKYCService.getKYCData(userId);
    const creditScore = await this.creditScoringEngine.calculate(kycData);
    
    return {
      ...kycData,
      creditScore,
      recommendation: this.getCreditRecommendation(creditScore)
    };
  }
}
```

#### 2. **Event-Driven Integration**
```typescript
// Listen to existing SME events and trigger credit workflows
class CreditEventHandler {
  @EventListener('sme.kyc.verified')
  async handleKYCVerified(event: KYCVerifiedEvent) {
    // Trigger credit pre-assessment
    await this.creditAssessmentService.preAssess(event.userId);
    
    // Notify user of credit availability
    await this.notificationService.sendCreditAvailabilityNotification(event.userId);
  }

  @EventListener('sme.payment.received')
  async handlePaymentReceived(event: PaymentReceivedEvent) {
    // Check if it's a credit repayment
    const repayment = await this.repaymentService.matchPayment(event.payment);
    if (repayment) {
      await this.repaymentService.processRepayment(repayment);
    }
  }
}
```

## Deployment Strategy

### **Docker Compose Integration**
```yaml
version: '3.8'
services:
  # Existing SME services (assumed to be running)
  
  # New CaaS services
  credit-api-gateway:
    image: caas/api-gateway:latest
    ports: ["8000:8000"]
    environment:
      - SME_API_URL=http://localhost:3000
      - DATABASE_URL=postgresql://localhost:5432/sme_db
      - REDIS_URL=redis://localhost:6379

  underwriting-engine:
    image: caas/underwriting-engine:latest
    ports: ["8001:8001"]
    depends_on: [credit-api-gateway]

  # ... other services
```

### **Gradual Rollout Plan**
1. **Phase 1**: Deploy credit assessment APIs alongside existing services
2. **Phase 2**: Integrate with existing KYC/payment flows  
3. **Phase 3**: Add smart contract orchestration
4. **Phase 4**: Launch full credit marketplace

## Monitoring & Observability

### **Integration with Existing Monitoring**
- Extend existing log aggregation with credit service logs
- Add credit-specific metrics to existing dashboards
- Implement distributed tracing across SME and CaaS services
- Set up alerts for credit-specific SLAs

### **Health Checks**
```typescript
// Health check service that monitors both SME and CaaS services
interface HealthStatus {
  smeServices: {
    auth: 'healthy' | 'degraded' | 'down';
    kyc: 'healthy' | 'degraded' | 'down';
    payments: 'healthy' | 'degraded' | 'down';
  };
  caasServices: {
    underwriting: 'healthy' | 'degraded' | 'down';
    disbursement: 'healthy' | 'degraded' | 'down';
    collections: 'healthy' | 'degraded' | 'down';
  };
  dependencies: {
    database: 'healthy' | 'degraded' | 'down';
    redis: 'healthy' | 'degraded' | 'down';
    blockchain: 'healthy' | 'degraded' | 'down';
  };
}
```

## Security Considerations

### **Shared Security Model**
- **Authentication**: Reuse existing OAuth2/JWT infrastructure
- **Authorization**: Extend existing RBAC with credit permissions
- **Data Encryption**: Align with existing encryption standards
- **Audit Logging**: Integrate with existing audit trail system
- **Network Security**: Leverage existing VPC/firewall configurations

### **Credit-Specific Security**
- **PCI DSS**: Ensure payment data handling compliance
- **Financial Regulations**: Implement credit-specific audit trails
- **Smart Contract Security**: Add multi-signature controls
- **Transaction Monitoring**: Real-time fraud detection

## Next Steps

1. ✅ **Infrastructure Prepared**: Firewall rules added for CaaS services
2. 🔄 **API Discovery**: Map existing SME API endpoints and schemas
3. 📋 **Data Mapping**: Understand existing database schema
4. 🔧 **Service Integration**: Build facade services for existing APIs
5. 🚀 **Incremental Deployment**: Deploy CaaS services alongside SME infrastructure

This integration strategy ensures we leverage existing infrastructure investments while adding enterprise-grade credit capabilities seamlessly.