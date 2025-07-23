# Microservices Specification

## 📋 Overview

This document provides detailed specifications for each microservice in the Credit-as-a-Service Platform. Each service is designed following Domain-Driven Design (DDD) principles with clear boundaries, responsibilities, and interfaces.

## 🔐 API Gateway Service

### Purpose
Central entry point for all client requests, handling authentication, authorization, rate limiting, and request routing.

### Technology Stack
- **Framework**: Kong Gateway / Express Gateway
- **Language**: TypeScript (Node.js)
- **Authentication**: OAuth 2.0, OpenID Connect
- **Rate Limiting**: Redis-based token bucket
- **Load Balancing**: Round-robin with health checks

### Key Features
- JWT token validation and refresh
- Request/response transformation
- API versioning support
- WebSocket support for real-time updates
- GraphQL federation gateway

### API Endpoints

```yaml
# Authentication Endpoints
POST   /auth/login          # User login
POST   /auth/logout         # User logout
POST   /auth/refresh        # Token refresh
POST   /auth/register       # User registration
GET    /auth/profile        # Get user profile

# Service Proxy Endpoints
ANY    /api/v1/providers/*  # Provider Integration Service
ANY    /api/v1/risk/*       # Risk Assessment Service
ANY    /api/v1/compliance/* # Compliance Service
ANY    /api/v1/contracts/*  # Smart Contract Service
```

### Configuration

```typescript
interface GatewayConfig {
  cors: {
    origins: string[];
    credentials: boolean;
    maxAge: number;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests: boolean;
  };
  auth: {
    jwtSecret: string;
    tokenExpiry: string;
    refreshTokenExpiry: string;
  };
  services: {
    [serviceName: string]: {
      url: string;
      timeout: number;
      retries: number;
    };
  };
}
```

### Service Dependencies
- Redis (session management, rate limiting)
- Auth0/Keycloak (identity provider)
- Service Registry (Consul/Eureka)

---

## 🔌 Provider Integration Service

### Purpose
Manages connections to various credit providers (traditional banks, fintech APIs, DeFi protocols) with a unified interface.

### Technology Stack
- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL
- **Cache**: Redis
- **Queue**: Bull (Redis-based)

### Key Features
- Plugin-based provider architecture
- Real-time credit offer aggregation
- Provider health monitoring
- Credential vault integration
- Webhook management

### Domain Model

```typescript
// Core Entities
interface Provider {
  id: string;
  name: string;
  type: 'TRADITIONAL' | 'FINTECH' | 'DEFI';
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
  config: ProviderConfig;
  credentials: EncryptedCredentials;
  webhooks: Webhook[];
  metadata: Record<string, any>;
}

interface CreditOffer {
  id: string;
  providerId: string;
  userId: string;
  amount: BigNumber;
  currency: string;
  interestRate: number;
  term: number; // in days
  collateral?: CollateralRequirement;
  fees: Fee[];
  status: OfferStatus;
  expiresAt: Date;
}

interface ProviderAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getOffers(criteria: SearchCriteria): Promise<CreditOffer[]>;
  acceptOffer(offerId: string): Promise<AcceptanceResult>;
  getStatus(): Promise<ProviderStatus>;
}
```

### API Endpoints

```yaml
# Provider Management
GET    /providers                    # List all providers
GET    /providers/:id                # Get provider details
POST   /providers                    # Register new provider
PUT    /providers/:id                # Update provider
DELETE /providers/:id                # Remove provider
POST   /providers/:id/test           # Test provider connection

# Credit Offers
POST   /offers/search                # Search credit offers
GET    /offers/:id                   # Get offer details
POST   /offers/:id/accept            # Accept credit offer
POST   /offers/:id/reject            # Reject credit offer
GET    /offers/history               # Get offer history

# Webhooks
POST   /webhooks/:providerId         # Register webhook
DELETE /webhooks/:id                 # Remove webhook
POST   /webhooks/test                # Test webhook
```

### Provider Adapter Interface

```typescript
abstract class BaseProviderAdapter implements ProviderAdapter {
  protected config: ProviderConfig;
  protected logger: Logger;
  
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract getOffers(criteria: SearchCriteria): Promise<CreditOffer[]>;
  abstract acceptOffer(offerId: string): Promise<AcceptanceResult>;
  abstract getStatus(): Promise<ProviderStatus>;
  
  // Common functionality
  protected async rateLimitCheck(): Promise<void> { }
  protected async validateResponse(response: any): Promise<void> { }
  protected async handleError(error: Error): Promise<void> { }
}

// Example: Traditional Bank Adapter
class TraditionalBankAdapter extends BaseProviderAdapter {
  async connect(): Promise<void> {
    // OAuth2 flow implementation
  }
  
  async getOffers(criteria: SearchCriteria): Promise<CreditOffer[]> {
    // SOAP/REST API call to bank
  }
}

// Example: DeFi Protocol Adapter
class DeFiProtocolAdapter extends BaseProviderAdapter {
  private web3: Web3;
  private contract: Contract;
  
  async connect(): Promise<void> {
    // Web3 connection and contract initialization
  }
  
  async getOffers(criteria: SearchCriteria): Promise<CreditOffer[]> {
    // Smart contract calls
  }
}
```

### Event Publishing

```typescript
// Events published to Kafka
interface ProviderEvents {
  'provider.connected': { providerId: string; timestamp: Date };
  'provider.disconnected': { providerId: string; reason: string };
  'offer.created': { offer: CreditOffer };
  'offer.accepted': { offerId: string; userId: string };
  'offer.expired': { offerId: string };
  'provider.error': { providerId: string; error: string };
}
```

---

## 📊 Risk Assessment Service

### Purpose
Evaluates creditworthiness using AI/ML models, analyzes on-chain and off-chain data, and provides risk scores and recommendations.

### Technology Stack
- **Framework**: FastAPI (Python) + Express (Node.js)
- **ML Framework**: TensorFlow, scikit-learn
- **Language**: Python (ML), TypeScript (API)
- **Database**: PostgreSQL + TimescaleDB
- **Feature Store**: Feast
- **Model Registry**: MLflow

### Key Features
- Multi-model risk scoring
- Real-time feature engineering
- On-chain transaction analysis
- Credit bureau integration
- Fraud detection
- Model A/B testing

### Domain Model

```python
# Risk Assessment Models
@dataclass
class RiskAssessment:
    user_id: str
    assessment_id: str
    timestamp: datetime
    scores: Dict[str, float]
    features: Dict[str, Any]
    recommendations: List[Recommendation]
    confidence: float
    model_versions: Dict[str, str]

@dataclass
class CreditScore:
    value: int  # 300-850
    factors: List[ScoreFactor]
    percentile: float
    trend: Trend

@dataclass
class RiskProfile:
    user_id: str
    profile_type: str
    risk_tolerance: float
    historical_performance: Performance
    behavioral_patterns: List[Pattern]
```

### API Endpoints

```yaml
# Risk Assessment
POST   /assess/credit                # Comprehensive credit assessment
POST   /assess/quick                 # Quick risk scoring
GET    /assess/:userId/history       # Assessment history
POST   /assess/batch                 # Batch assessments

# Credit Scoring
GET    /score/:userId                # Get credit score
POST   /score/calculate              # Calculate new score
GET    /score/:userId/factors        # Score factors
GET    /score/:userId/simulation     # Score simulation

# Risk Analytics
GET    /analytics/portfolio          # Portfolio risk analysis
POST   /analytics/stress-test        # Stress testing
GET    /analytics/metrics            # Risk metrics
```

### ML Pipeline

```python
class RiskAssessmentPipeline:
    def __init__(self):
        self.feature_extractor = FeatureExtractor()
        self.models = ModelEnsemble()
        self.post_processor = PostProcessor()
    
    async def assess(self, user_data: UserData) -> RiskAssessment:
        # Feature extraction
        features = await self.feature_extractor.extract(user_data)
        
        # Model inference
        predictions = await self.models.predict(features)
        
        # Post-processing and explanation
        assessment = await self.post_processor.process(
            predictions, 
            features
        )
        
        return assessment

class FeatureExtractor:
    async def extract(self, user_data: UserData) -> Features:
        # Traditional features
        credit_history = await self.get_credit_history(user_data)
        income_data = await self.get_income_verification(user_data)
        
        # On-chain features
        defi_activity = await self.analyze_defi_activity(user_data)
        wallet_health = await self.analyze_wallet_health(user_data)
        
        # Behavioral features
        app_usage = await self.get_app_usage_patterns(user_data)
        
        return Features.combine([
            credit_history,
            income_data,
            defi_activity,
            wallet_health,
            app_usage
        ])
```

### Risk Models

```yaml
models:
  traditional_credit_score:
    type: "gradient_boosting"
    features: ["credit_history", "income", "debt_ratio"]
    version: "v2.3.1"
    
  defi_risk_score:
    type: "neural_network"
    features: ["wallet_age", "protocol_diversity", "liquidation_history"]
    version: "v1.2.0"
    
  fraud_detection:
    type: "isolation_forest"
    features: ["transaction_patterns", "device_fingerprint", "ip_location"]
    version: "v3.0.0"
    
  ensemble_score:
    type: "weighted_average"
    models: ["traditional_credit_score", "defi_risk_score"]
    weights: [0.6, 0.4]
```

---

## ⚖️ Compliance Service

### Purpose
Ensures regulatory compliance across jurisdictions, manages KYC/AML processes, and maintains audit trails.

### Technology Stack
- **Framework**: Spring Boot (Java)
- **Language**: Java 17
- **Database**: PostgreSQL
- **Document Store**: MongoDB
- **Workflow**: Camunda BPM
- **Identity Verification**: Jumio, Onfido APIs

### Key Features
- Multi-jurisdiction compliance rules engine
- Automated KYC/AML workflows
- Sanction list screening
- Transaction monitoring
- Regulatory reporting
- Audit trail management

### Domain Model

```java
// Compliance Entities
@Entity
public class ComplianceCheck {
    @Id
    private String checkId;
    private String userId;
    private CheckType type;
    private CheckStatus status;
    private List<ComplianceRule> appliedRules;
    private List<ComplianceResult> results;
    private Map<String, Object> metadata;
    private Instant createdAt;
    private Instant completedAt;
}

@Entity
public class KYCProfile {
    @Id
    private String profileId;
    private String userId;
    private VerificationLevel level;
    private List<Document> documents;
    private IdentityVerification identity;
    private AddressVerification address;
    private RiskRating riskRating;
    private Instant verifiedAt;
    private Instant expiresAt;
}

@Entity
public class ComplianceRule {
    @Id
    private String ruleId;
    private String jurisdiction;
    private RuleType type;
    private String expression;
    private List<Action> actions;
    private boolean active;
}
```

### API Endpoints

```yaml
# KYC Management
POST   /kyc/initiate                # Start KYC process
POST   /kyc/upload-document         # Upload verification document
GET    /kyc/:userId/status          # Get KYC status
POST   /kyc/verify                  # Trigger verification
GET    /kyc/:userId/profile         # Get KYC profile

# Compliance Checks
POST   /compliance/check            # Run compliance check
GET    /compliance/check/:id        # Get check results
POST   /compliance/monitor          # Start monitoring
GET    /compliance/rules            # List compliance rules

# Reporting
GET    /reports/suspicious          # Suspicious activity reports
POST   /reports/regulatory          # Generate regulatory report
GET    /reports/audit-trail         # Get audit trail
```

### Compliance Workflow

```java
@Component
public class ComplianceWorkflow {
    @Autowired
    private RuleEngine ruleEngine;
    
    @Autowired
    private KYCService kycService;
    
    @Autowired
    private MonitoringService monitoringService;
    
    public ComplianceResult performComplianceCheck(User user, Transaction transaction) {
        // 1. Check KYC status
        KYCStatus kycStatus = kycService.checkStatus(user);
        if (!kycStatus.isValid()) {
            return ComplianceResult.rejected("KYC_REQUIRED");
        }
        
        // 2. Run rule engine
        List<RuleViolation> violations = ruleEngine.evaluate(user, transaction);
        
        // 3. Sanctions screening
        SanctionResult sanctionResult = sanctionsService.screen(user);
        
        // 4. Risk assessment
        RiskScore riskScore = riskService.calculate(user, transaction);
        
        // 5. Make decision
        return makeComplianceDecision(violations, sanctionResult, riskScore);
    }
}
```

### Rules Engine Configuration

```yaml
rules:
  - id: "US_AMOUNT_LIMIT"
    jurisdiction: "US"
    condition: "transaction.amount > 10000 AND user.jurisdiction == 'US'"
    action: "REQUIRE_ENHANCED_DUE_DILIGENCE"
    
  - id: "EU_MiCA_COMPLIANCE"
    jurisdiction: "EU"
    condition: "transaction.type == 'CRYPTO' AND user.jurisdiction IN EU_COUNTRIES"
    action: "APPLY_MiCA_RULES"
    
  - id: "GLOBAL_SANCTIONS"
    jurisdiction: "GLOBAL"
    condition: "user.sanctionStatus != 'CLEAR'"
    action: "BLOCK_TRANSACTION"
```

---

## 🔗 Smart Contract Orchestration Service

### Purpose
Manages interactions with blockchain smart contracts, handles transaction lifecycle, and bridges traditional systems with DeFi protocols.

### Technology Stack
- **Framework**: Hardhat + Express
- **Language**: TypeScript, Solidity
- **Blockchain**: Ethereum, Polygon, Arbitrum
- **Web3 Library**: ethers.js, web3.js
- **Queue**: RabbitMQ
- **Database**: PostgreSQL

### Key Features
- Multi-chain support
- Transaction management and retry logic
- Gas optimization
- Contract deployment automation
- Event listening and processing
- Cross-chain bridge integration

### Domain Model

```typescript
// Smart Contract Entities
interface SmartContractDeployment {
  deploymentId: string;
  contractAddress: string;
  contractType: ContractType;
  chainId: number;
  deploymentTx: string;
  abi: any[];
  bytecode: string;
  verified: boolean;
  metadata: ContractMetadata;
}

interface ContractInteraction {
  interactionId: string;
  contractAddress: string;
  method: string;
  params: any[];
  value: BigNumber;
  gas: BigNumber;
  status: TransactionStatus;
  txHash?: string;
  result?: any;
  error?: string;
}

interface DeFiPosition {
  positionId: string;
  userId: string;
  protocol: string;
  contractAddress: string;
  positionType: 'LENDING' | 'BORROWING' | 'LIQUIDITY';
  assets: Asset[];
  value: BigNumber;
  health: number;
  rewards: Reward[];
}
```

### API Endpoints

```yaml
# Contract Management
POST   /contracts/deploy             # Deploy new contract
GET    /contracts/:address           # Get contract details
POST   /contracts/:address/verify    # Verify contract source
GET    /contracts/list               # List deployed contracts

# Transactions
POST   /transactions/send            # Send transaction
GET    /transactions/:hash           # Get transaction status
POST   /transactions/estimate        # Estimate gas
GET    /transactions/history         # Transaction history

# DeFi Operations
POST   /defi/lend                   # Lend assets
POST   /defi/borrow                  # Borrow assets
POST   /defi/repay                   # Repay loan
GET    /defi/positions/:userId       # Get user positions
POST   /defi/liquidate               # Liquidate position
```

### Smart Contract Architecture

```solidity
// Main Credit Aggregator Contract
contract CreditAggregator is Ownable, Pausable, ReentrancyGuard {
    using SafeMath for uint256;
    
    struct CreditOffer {
        address provider;
        address borrower;
        uint256 amount;
        uint256 interestRate;
        uint256 duration;
        uint256 collateralAmount;
        address collateralToken;
        OfferStatus status;
    }
    
    mapping(uint256 => CreditOffer) public offers;
    mapping(address => uint256[]) public userOffers;
    mapping(address => bool) public authorizedProviders;
    
    event OfferCreated(uint256 indexed offerId, address indexed provider);
    event OfferAccepted(uint256 indexed offerId, address indexed borrower);
    event LoanRepaid(uint256 indexed offerId, uint256 amount);
    
    function createOffer(
        address _borrower,
        uint256 _amount,
        uint256 _interestRate,
        uint256 _duration,
        uint256 _collateralAmount,
        address _collateralToken
    ) external onlyAuthorizedProvider returns (uint256) {
        // Implementation
    }
    
    function acceptOffer(uint256 _offerId) external nonReentrant {
        // Implementation
    }
}
```

### Transaction Management

```typescript
class TransactionManager {
  private web3: Web3;
  private nonceManager: NonceManager;
  private gasOracle: GasOracle;
  
  async sendTransaction(
    contract: Contract,
    method: string,
    params: any[],
    options: TransactionOptions
  ): Promise<TransactionResult> {
    try {
      // 1. Prepare transaction
      const tx = await this.prepareTransaction(contract, method, params);
      
      // 2. Estimate gas
      const gasEstimate = await this.estimateGas(tx);
      
      // 3. Get optimal gas price
      const gasPrice = await this.gasOracle.getGasPrice(options.speed);
      
      // 4. Sign and send
      const signedTx = await this.signTransaction(tx, gasPrice);
      const receipt = await this.web3.eth.sendSignedTransaction(signedTx);
      
      // 5. Wait for confirmations
      await this.waitForConfirmations(receipt.transactionHash, options.confirmations);
      
      return {
        success: true,
        txHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed,
        events: this.parseEvents(receipt.logs)
      };
    } catch (error) {
      return this.handleTransactionError(error);
    }
  }
}
```

### Event Processing

```typescript
class EventProcessor {
  private eventEmitter: EventEmitter;
  private contractListeners: Map<string, Contract>;
  
  async listenToContract(address: string, abi: any[]): Promise<void> {
    const contract = new ethers.Contract(address, abi, this.provider);
    
    // Listen to all events
    contract.on("*", (event) => {
      this.processEvent(address, event);
    });
    
    this.contractListeners.set(address, contract);
  }
  
  private async processEvent(address: string, event: Event): Promise<void> {
    // 1. Parse event
    const parsedEvent = this.parseEvent(event);
    
    // 2. Store in database
    await this.storeEvent(parsedEvent);
    
    // 3. Publish to message queue
    await this.publishEvent(parsedEvent);
    
    // 4. Trigger business logic
    await this.handleBusinessLogic(parsedEvent);
  }
}
```

---

## 🔄 Service Communication Patterns

### Synchronous Communication
- REST APIs for request-response patterns
- GraphQL for flexible querying
- gRPC for internal service communication

### Asynchronous Communication
- Kafka for event streaming
- RabbitMQ for task queues
- WebSockets for real-time updates

### Service Mesh Configuration

```yaml
# Istio Service Mesh Configuration
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: credit-platform-services
spec:
  hosts:
  - api-gateway
  - provider-service
  - risk-service
  - compliance-service
  - smart-contract-service
  http:
  - match:
    - uri:
        prefix: "/api/v1"
    route:
    - destination:
        host: api-gateway
        port:
          number: 3000
      weight: 100
    timeout: 30s
    retries:
      attempts: 3
      perTryTimeout: 10s
```

## 📊 Monitoring and Observability

### Metrics Collection
```yaml
# Prometheus metrics
- service_request_duration_seconds
- service_request_total
- service_error_rate
- database_connection_pool_size
- kafka_consumer_lag
- smart_contract_gas_used
```

### Distributed Tracing
```typescript
// OpenTelemetry integration
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('credit-platform');

async function processRequest(req: Request): Promise<Response> {
  const span = tracer.startSpan('process-credit-request');
  
  try {
    span.setAttributes({
      'user.id': req.userId,
      'request.type': req.type,
      'request.amount': req.amount
    });
    
    const result = await businessLogic(req);
    span.setStatus({ code: SpanStatusCode.OK });
    
    return result;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    span.end();
  }
}
```

## 🔒 Security Considerations

### Service-to-Service Authentication
- mTLS for internal communication
- Service accounts with RBAC
- API keys rotation

### Data Encryption
- TLS 1.3 for data in transit
- AES-256 for data at rest
- Hardware Security Modules (HSM) for key management

### Security Headers
```typescript
// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));
```

## 📈 Performance Requirements

### SLA Requirements
- API Gateway: 99.9% uptime, <100ms latency
- Provider Integration: 99.5% uptime, <500ms latency
- Risk Assessment: 99.5% uptime, <2s for full assessment
- Compliance: 99.9% uptime, <1s for rule evaluation
- Smart Contracts: 99.5% uptime, <30s for transaction confirmation

### Scaling Strategy
- Horizontal pod autoscaling based on CPU/memory
- Database read replicas for query scaling
- Redis cluster for cache scaling
- Kafka partitioning for event stream scaling