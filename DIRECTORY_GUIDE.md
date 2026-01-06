# Credit-as-a-Service Platform - Directory Guide

## Project Structure

### Root Directory
```
credit-as-a-service-platform/
├── apps/                          # Application frontends
├── services/                      # Backend microservices
├── packages/                      # Shared packages
├── libs/                          # Shared libraries
├── tests/                         # Test suites
├── docs/                          # Documentation
├── package.json                   # Root package.json (workspace config)
├── bun.lock                       # Bun lock file
├── tsconfig.json                  # TypeScript config
├── turbo.json                     # Turborepo configuration
├── DIRECTORY_GUIDE.md             # This file
├── CLAUDE.md                      # Development notes and session context
└── build_guide.md                 # Master blueprint document
```

## Applications (`apps/`)

### Web Dashboard (`apps/web/`)
- **Package**: `@caas/web`
- **Purpose**: Main customer-facing web application
- **Tech Stack**: Next.js 14, TypeScript, Tailwind CSS
- **Port**: 3000
- **Key Features**:
  - User authentication & registration
  - Credit application workflow
  - Dashboard with real-time notifications
  - Payment management

### Admin Console (`apps/admin/`)
- **Package**: `@caas/admin-console`
- **Purpose**: Enterprise administrative interface
- **Tech Stack**: Next.js 14, TypeScript
- **Port**: 3001
- **Key Features**:
  - Loan application review
  - User management
  - Analytics dashboard
  - Risk assessment tools

### Credit Provider Dashboard (`apps/credit-provider-dashboard/`)
- **Package**: `@caas/credit-provider-dashboard`
- **Purpose**: Dashboard for credit providers
- **Tech Stack**: Next.js 14, TypeScript
- **Port**: 3009
- **Key Features**:
  - Provider analytics
  - Lead management
  - Revenue tracking

### API App (`apps/api/`)
- **Purpose**: API server application
- **Tech Stack**: Fastify, TypeScript

### Admin Console (Legacy) (`apps/admin-console/`)
- **Purpose**: Legacy admin console placeholder

## Backend Services (`services/`)

### Core Services

| Service | Package | Purpose |
|---------|---------|---------|
| `api-gateway` | `@caas/api-gateway` | Main API gateway, routing, rate limiting |
| `auth` | `@caas/auth` | OAuth2, JWT, session management |
| `database` | `@caas/database` | Database schema, migrations |

### Credit Processing Services

| Service | Package | Purpose |
|---------|---------|---------|
| `underwriting` | `@caas/underwriting` | Risk scoring, credit assessment |
| `offers` | `@caas/offers` | Match users to providers, pricing |
| `disbursement` | `@caas/disbursement` | Payout orchestration |
| `repayment` | `@caas/repayment-service` | Schedules, reminders, auto-debits |
| `collections` | `@caas/collections` | Delinquency workflow |
| `credit-providers` | `@caas/credit-providers` | Provider integrations |

### Platform Services

| Service | Package | Purpose |
|---------|---------|---------|
| `notifications` | `@caas/notifications` | Email/SMS/Push/WebSocket notifications |
| `ledger` | `@caas/ledger` | Double-entry ledger, GL postings |
| `analytics-service` | `@caas/analytics-service` | BI, dashboards, cohort analysis |
| `compliance-service` | `@caas/compliance-service` | Reg rules, screening, consent |
| `risk-service` | `@caas/risk-service` | Risk modeling, assessments |
| `monitoring` | `@caas/monitoring-service` | Health checks, metrics |
| `onboarding` | `@caas/onboarding` | KYC/KYB flows |

### Integration Services

| Service | Package | Purpose |
|---------|---------|---------|
| `sme-integration` | `@caas/sme-integration` | SME platform integration |
| `graphql-gateway` | `@caas/graphql-gateway` | GraphQL API layer |
| `kafka-service` | `@caas/kafka-service` | Message queue service |
| `provider-service` | `@caas/provider-service` | Provider management |
| `admin-provider-management` | `@caas/admin-provider-management` | Admin provider workflows |
| `blockchain-orchestration` | `@caas/blockchain-orchestration` | Smart contract integration |

## Shared Packages (`packages/`)

| Package | Name | Purpose |
|---------|------|---------|
| `common` | `@caas/common` | Shared utilities, types, middleware |
| `config` | `@caas/config` | Shared configs, env schemas (Zod) |
| `types` | `@caas/types` | TypeScript type definitions |
| `sdk` | `@caas/sdk` | TypeScript SDK for API clients |
| `ui-kit` | `@caas/ui-kit` | React component library |
| `contracts` | `@caas/contracts` | Smart contracts + ABIs |
| `ui` | - | UI components (placeholder) |
| `shared` | - | Shared code (placeholder) |

## Libraries (`libs/`)

| Library | Name | Purpose |
|---------|------|---------|
| `cache` | `@caas/cache` | Redis caching utilities |

## Testing (`tests/`)

```
tests/
├── unit/              # Unit tests (no database required)
├── integration/       # Integration tests (requires PostgreSQL)
├── e2e/               # End-to-end tests (Playwright)
├── fixtures/          # Test fixtures
├── mocks/             # Mock implementations
├── setup/             # Test configuration
└── vitest.config.ts   # Vitest configuration
```

### Running Tests
```bash
# Unit tests only (no database needed)
cd tests && bun run test:unit

# Integration tests (requires PostgreSQL on port 5433)
cd tests && bun run test:integration

# E2E tests (requires full stack)
cd tests && bun run test:e2e
```

## Development Commands

```bash
# Install dependencies
bun install

# Start development (all apps)
bun run dev

# Build all packages
bun run build

# Build specific package
bun run build --filter=@caas/web

# Run tests
bun run test

# Lint
bun run lint

# Type check
bun run typecheck
```

## Port Allocation

| Service | HTTP Port | WebSocket Port |
|---------|-----------|----------------|
| Web App | 3000 | - |
| Admin Console | 3001 | - |
| Core API | 3002 | - |
| Notifications | 3003 | 3010 |
| Document Service | 3004 | - |
| Risk Assessment | 3005 | - |
| Payment Service | 3006 | - |
| Credit Provider Dashboard | 3009 | - |
| Database (PostgreSQL) | 5432 | - |
| Test Database | 5433 | - |
| Redis | 6379 | - |
| Test Redis | 6380 | - |

## Development Status

### Completed
- Project structure and monorepo setup
- Core authentication and user management
- Loan/credit application workflow
- Dashboard and UI components
- Real-time notifications infrastructure
- Underwriting engine
- Disbursement orchestration
- Repayment service
- Admin provider management service

### In Progress
- Vercel deployment stabilization
- Integration testing infrastructure
- Performance optimization

### Upcoming
- Mobile app (Expo/React Native)
- WhatsApp bot integration
- Smart contract deployment
- Production monitoring

## Integration Points

### External Services
- **Verification**: Prembly, SourceID (KYC/KYB)
- **Payments**: Paystack (NG), Stripe/PayPal (Intl)
- **Open Banking**: Mono, Okra, Plaid
- **Messaging**: Twilio/WhatsApp Cloud API, SendGrid

### Real-time Communication
- **WebSocket Server**: `ws://localhost:3010/ws`
- **Channels**: loans, payments, system, admin

---

**Last Updated**: January 2026
