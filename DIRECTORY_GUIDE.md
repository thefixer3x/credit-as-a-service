# Credit-as-a-Service Platform - Directory Guide

## 📁 Project Structure

### Root Directory
```
credit-as-a-service-platform/
├── apps/                          # Application frontends
├── services/                      # Backend microservices
├── packages/                      # Shared packages
├── docker/                        # Docker configurations
├── docs/                          # Documentation
├── package.json                   # Root package.json (workspace config)
├── bun.lockb                     # Bun lock file
├── tsconfig.json                 # TypeScript config
├── DIRECTORY_GUIDE.md            # This file
└── CLAUDE.md                     # Development notes and session context
```

## 🖥️ Applications (`apps/`)

### Web Dashboard (`apps/web/`)
- **Purpose**: Main customer-facing web application
- **Tech Stack**: Next.js 14, TypeScript, Tailwind CSS
- **Key Features**:
  - User authentication & registration
  - Loan application workflow
  - Dashboard with real-time notifications
  - Payment management
  - Document upload/management

**Key Files:**
- `src/app/` - Next.js app router pages
- `src/components/` - React components
- `src/lib/` - Utility functions and configurations
- `src/app/dashboard/page-variant-2.tsx` - Enhanced dashboard with proper Badge variants

### Admin Portal (`apps/admin/`)
- **Purpose**: Administrative interface for loan management
- **Tech Stack**: React, TypeScript, Vite
- **Key Features**:
  - Loan application review
  - User management
  - Analytics dashboard
  - Risk assessment tools

## 🔧 Backend Services (`services/`)

### Core API (`services/api/`)
- **Purpose**: Main API gateway and core business logic
- **Tech Stack**: Fastify, TypeScript, Drizzle ORM
- **Database**: PostgreSQL
- **Key Features**:
  - RESTful API endpoints
  - Authentication & authorization
  - Loan processing logic
  - User management

### Notifications Service (`services/notifications/`)
- **Purpose**: Real-time notifications and communication
- **Tech Stack**: Fastify, WebSocket, TypeScript
- **Key Features**:
  - WebSocket server (port 3010)
  - Real-time notification delivery
  - Email/SMS integration points
  - Event-driven architecture
  - Notification templates and channels

**Key Files:**
- `src/realtime/websocket-server.ts` - WebSocket management and real-time communication
- `src/services/notification-service.ts` - Core notification business logic
- `src/server.ts` - Fastify server with WebSocket support

### Document Service (`services/documents/`)
- **Purpose**: Document processing and storage
- **Tech Stack**: Node.js, TypeScript
- **Key Features**:
  - File upload/download
  - Document validation
  - OCR processing
  - Secure storage

### Risk Assessment (`services/risk-assessment/`)
- **Purpose**: Credit scoring and risk evaluation
- **Tech Stack**: Python, FastAPI
- **Key Features**:
  - Credit score calculation
  - Risk modeling
  - ML-based assessments
  - External data integration

### Payment Processing (`services/payments/`)
- **Purpose**: Payment processing and financial transactions
- **Tech Stack**: Node.js, TypeScript
- **Key Features**:
  - Payment gateway integration
  - Transaction management
  - Recurring payments
  - Financial reporting

## 📦 Shared Packages (`packages/`)

### UI Kit (`packages/ui-kit/`)
- **Purpose**: Reusable React component library
- **Tech Stack**: React, TypeScript, Tailwind CSS, Storybook
- **Key Components**:
  - Button, Card, Badge, Progress
  - NotificationCenter with real-time WebSocket integration
  - Statistics cards and dashboard components
  - 21st.dev integrated components

**Key Files:**
- `src/components/ui/` - Base UI components
- `src/components/ui/notification-center.tsx` - Real-time notification UI
- `src/hooks/useNotifications.tsx` - WebSocket notification hook
- `src/index.ts` - Component exports

### Common (`packages/common/`)
- **Purpose**: Shared utilities, types, and configurations
- **Tech Stack**: TypeScript
- **Key Features**:
  - TypeScript type definitions
  - Validation schemas (Zod)
  - Utility functions
  - Error handling middleware

**Key Files:**
- `src/types/` - Shared TypeScript types
- `src/middleware.ts` - Error handling and common middleware
- `src/utils/` - Utility functions

### Database (`packages/database/`)
- **Purpose**: Database schema and migrations
- **Tech Stack**: Drizzle ORM, PostgreSQL
- **Key Features**:
  - Database schema definitions
  - Migration scripts
  - Seed data
  - Query utilities

## 🐳 Infrastructure (`docker/`)

### Docker Configurations
- `docker-compose.yml` - Local development environment
- `Dockerfile.*` - Service-specific Docker builds
- Development and production configurations
- Database containers and networking

## 📚 Documentation (`docs/`)

### Project Documentation
- API documentation
- Component documentation (Storybook)
- Development guides
- Deployment instructions

## 🔧 Development Status

### ✅ Completed Features
- **Phase 1**: Project structure and monorepo setup
- **Phase 2**: Core authentication and user management
- **Phase 3**: Loan application workflow
- **Phase 4**: Dashboard and UI components
- **Phase 5**: Error fixes and dependency resolution
- **Real-time Notifications**: Complete WebSocket infrastructure
- **UI Kit**: Badge, Progress, NotificationCenter components
- **WebSocket Integration**: useNotifications hook and real-time updates

### 🚧 In Progress
- **Phase 6**: Advanced Features & Integration
- **Event-driven Architecture**: Expanding notification system
- **Testing**: Automated test suite development

### 📋 Upcoming Tasks
- Comprehensive logging and monitoring
- Caching layer (Redis)
- Performance optimization
- Production deployment

## 🔌 Key Integrations

### Real-time Communication
- **WebSocket Server**: `ws://localhost:3010/ws`
- **Channels**: loans, payments, system, admin
- **Features**: Auto-reconnection, heartbeat monitoring, subscription management

### External Services
- **21st.dev**: UI component library integration
- **Email/SMS**: Notification delivery channels
- **Payment Gateways**: Financial transaction processing
- **Document Storage**: Secure file management

## 🛠️ Development Commands

```bash
# Install dependencies
bun install

# Start development
bun run dev

# Build all packages
bun run build

# Run tests
bun run test

# Start notifications service
bun run notifications:dev  # Port 3010 WebSocket server
```

## 📱 Port Allocation

- **Web App**: 3000
- **Admin Portal**: 3001
- **Core API**: 3002
- **Notifications Service**: 3003 (HTTP) / 3010 (WebSocket)
- **Document Service**: 3004
- **Risk Assessment**: 3005
- **Payment Service**: 3006
- **Database**: 5432

---

**Last Updated**: Phase 6 - Real-time notifications system completed with comprehensive WebSocket infrastructure and React integration.