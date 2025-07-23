Credit‑as‑a‑Service (CaaS) Blueprint & Master Prompt

Parent Inspiration: sme.seftechub.com (B2B rails)
UX Benchmark: Revolut-level fluidity (zero-glitch, instant feedback loops)
Delivery Mode: Multitenant platform + Secure SDK + Shared mono-repo services
Goal: Ship a globally compliant, reusable credit infrastructure that can drop into any app.

⸻

1. “Master Prompt” Template for Your Build Agents / AI Coders

Use this as the single source of truth when instructing Claude/Cursor/Codex/etc. Replace all angle-bracket placeholders before running.

You are the lead engineer + product architect for **Credit-as-a-Service (CaaS)** under LAN Onasis/SeftecHub.

## Context
- Parent B2B infrastructure: sme.seftechub.com (APIs, KYC/KYB, payments rails).
- Target UX quality: Revolut-level polish (instant feedback, graceful errors, offline modes, biometric auth, smooth animations).
- Architecture pattern: Nx/Bun mono-repo supporting multiple apps (web, mobile, WhatsApp bot) + a reusable TypeScript SDK.
- Compliance first: KYC/KYB, AML, PCI DSS, SOC2, ISO 27001, GDPR, NDPR.
- Optional on-chain layer: Smart contracts for escrow, credit line tokenization, revenue sharing.
- Deployment: VPS + managed cloud (Supabase/Neon/Postgres), CI/CD GitHub Actions, Infrastructure as Code (Pulumi/Terraform).

## What to Build (Deliverables)
1. **Domain Model & ERD**: Customers, Businesses, Credit Applications, Offers, Underwriting Rules, Repayments, Ledgers, WebhookEvents.
2. **Service Architecture**: auth, onboarding, underwriting engine, offer engine, disbursement, repayment, collections, notifications, analytics, audit/logging.
3. **SDK (TS/JS + Swift/Kotlin stubs)**: Auth helpers (OAuth2/JWT/mTLS), typed endpoints, webhook verifier, local caching.
4. **API Layer**: REST + GraphQL, idempotent endpoints, pagination, rate limiting, audit trails, OpenAPI spec.
5. **Smart Contract Set (optional)**: Solidity/Move/Rust contracts for escrow vaults, credit NFT lines, automated repayment triggers.
6. **UI/UX Flows**: Onboarding (KYC/KYB), credit application wizard, offer acceptance, repayment dashboard, dispute center, settings.
7. **Testing & QA**: Unit, integration, contract tests, E2E (Playwright/Detox), chaos testing, performance budgets & SLOs.
8. **Security & Compliance**: RLS policies (Supabase), encryption at rest/in transit, key management, logging/monitoring, DPIA template.
9. **DevOps**: IaC, CI/CD pipelines, blue/green deploy, feature flags, rollback strategy.
10. **Docs**: README (root + each package), API docs (Redocly/Stoplight), SDK docs (typedoc), Runbooks/Playbooks.

## Non-Functional Requirements
- Latency p95 < 300ms for core endpoints in primary regions.
- 99.95% uptime target; graceful degradation (read replicas when write fails).
- Accessibility: WCAG 2.1 AA.
- Internationalization: multi-currency, locale-aware formatting, right-to-left support.
- Observability: OpenTelemetry traces, structured logs, real-time dashboards.

## Constraints / Preferences
- Languages: TypeScript (backend & SDK), React/Expo for apps, Go/Rust optional for high-perf services.
- DB: Postgres (Neon/Supabase) + Redis for caching + optional ClickHouse for analytics.
- Message bus: NATS/Redpanda or simple Postgres LISTEN/NOTIFY for MVP.
- Smart contracts: Ethereum L2 or Base; use Foundry/Hardhat; audits via Slither/MythX.

## Output Expectations
- Provide: folder tree, key file stubs, schemas, API contracts, sample code blocks, commands.
- Reference security & compliance checklists.
- Write step-by-step runbooks (dev, staging, prod).
- Respond with concise, copy-pastable chunks. No hand-wavy abstractions.

BEGIN NOW.


⸻

2. End-to-End User Story Flows (“Revolut-grade” UX)

2.1 Onboarding & Account Creation
	1.	User downloads/opens app → sees lightning-fast splash & onboarding carousel (skip option).
	2.	Sign up with email/phone/social → magic link/OTP; progressive profile completion.
	3.	KYC/KYB: auto OCR on IDs, selfie liveness, business doc upload. Instant feedback: “Validating…” → success state.
	4.	Consent screens (privacy, data usage) with transparent language.
	5.	Dashboard tour: highlight credit limit widget, application button, repayment calendar.

2.2 Credit Application Journey
	1.	Tap “Get Credit” → select product: line of credit, invoice financing, BNPL, working capital.
	2.	Dynamic form (prefilled from KYC data); connect bank feeds/accounting via Plaid/Mono/Okra.
	3.	Real-time underwriting engine returns pre-approval or requests extra docs.
	4.	Offers screen: multiple providers/terms, comparative visualization.
	5.	User picks an offer → e-sign agreement (DocuSign/HelloSign/Smart contract signature).
	6.	Disbursement: instant to wallet/bank; show timeline & fees.

2.3 Post-Disbursement & Repayments
	1.	Repayment schedule displayed (calendar view); push reminders, WhatsApp bot nudges.
	2.	Auto-debit setup or manual pay with multiple methods.
	3.	Early payoff incentives displayed; partial payments allowed.
	4.	Delinquency: soft reminders → escalate to collections workflow, self-serve hardship options.

2.4 Disputes & Support
	1.	In-app chat (AskBizGenie) + human handoff.
	2.	Dispute ticketing with SLA timers; attachment upload.
	3.	Transparent status tracking.

2.5 Business Admin Portal
	1.	Finance team views aggregate credit lines, repayment status, utilization.
	2.	Export CSV/Excel, connect to ERPs via SDK.
	3.	Manage user roles & permissions, API keys, webhooks.

⸻

3. Architecture & Build Structure (Mono-Repo)

caas-monorepo/
├── apps/
│   ├── web-dashboard/            # Next.js (B2B portal) / or Remix
│   ├── mobile-app/               # Expo/React Native (Revolut-like UX)
│   ├── whatsapp-bot/             # Cloud API bot service
│   └── admin-console/            # Internal ops & compliance tools
│
├── services/
│   ├── auth/                     # OAuth2, JWT, mTLS, session mgmt
│   ├── onboarding/               # KYC/KYB flows, document verification
│   ├── underwriting-engine/      # Rules engine + ML risk scoring
│   ├── offers-engine/            # Match user to providers, pricing calc
│   ├── disbursement/             # Payout orchestration, bank/wallet APIs
│   ├── repayment/                # Schedules, reminders, auto-debits
│   ├── collections/              # Delinquency workflow, hardship plans
│   ├── ledger/                   # Double-entry ledger, GL postings
│   ├── notifications/            # Email/SMS/Push/WhatsApp/Webhooks
│   ├── analytics/                # BI, dashboards, cohort analysis
│   ├── audit-logger/             # Immutable audit trail
│   └── compliance/               # Reg rules, screening, consent mgmt
│
├── packages/
│   ├── sdk-js/                   # TypeScript SDK (browser/node)
│   ├── sdk-swift/                # iOS wrapper (optional)
│   ├── sdk-kotlin/               # Android wrapper (optional)
│   ├── ui-components/            # Shared React component library
│   ├── config/                   # Shared configs/env schemas (zod)
│   ├── utils/                    # Common helpers (logging, tracing)
│   └── contracts/                # Smart contracts + ABIs + deployment scripts
│
├── infra/
│   ├── terraform/                # IaC for cloud resources
│   ├── pulumi/                   # Alternative IaC if preferred
│   ├── github-actions/           # CI/CD workflows
│   └── docker/                   # Dockerfiles, compose (optional)
│
├── docs/
│   ├── api/                      # OpenAPI/GraphQL schemas, Redoc
│   ├── runbooks/                 # Ops, incident, rollback procedures
│   └── security/                 # Threat models, DPIA, compliance checklists
│
├── scripts/                      # CLI tools, db migrations, seeders
└── README.md

Tech Choices:
	•	Monorepo Tooling: Nx or Turborepo (Bun-compatible).
	•	Package Mgmt: Bun or PNPM.
	•	Type Safety: Zod or Valibot for runtime validation.
	•	API Docs: OpenAPI + Redocly; GraphQL schema printed.
	•	Testing: Vitest/Jest, Playwright, Pact (consumer-driven contracts).
	•	Observability: OpenTelemetry, Logflare/ELK, Sentry.

⸻

4. Data & Domain Modeling

Core Entities
	•	User / BusinessProfile (KYB, roles, permissions)
	•	CreditApplication (status, requested_amount, purpose, docs)
	•	UnderwritingRule / Scorecard (rules JSON, ML model refs)
	•	CreditOffer (provider_id, apr, fees, term, currency)
	•	Agreement / Contract (signed_at, version, hash)
	•	Disbursement (method, tx_id, ledger_refs)
	•	RepaymentSchedule (due_dates, amounts, status)
	•	PaymentTransaction (success/fail, retry, channel)
	•	LedgerEntry (double-entry: debit/credit, account, amount)
	•	WebhookEvent (type, payload, delivery_status)
	•	AuditLog (actor, action, resource_id, diff)

Example Table Snippet (SQL)

CREATE TABLE credit_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  business_id UUID REFERENCES businesses(id),
  amount_requested NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  purpose TEXT,
  status TEXT CHECK (status IN ('draft','submitted','under_review','approved','rejected','disbursed')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


⸻

5. API Design (REST + GraphQL Examples)

REST (OpenAPI snippet)

paths:
  /v1/credit-applications:
    post:
      summary: Create credit application
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreditApplicationCreate' }
      responses:
        '201': { description: Created, schema: { $ref: '#/components/schemas/CreditApplication' } }

GraphQL

type CreditApplication {
  id: ID!
  amountRequested: Float!
  currency: String!
  status: CreditApplicationStatus!
  offers: [CreditOffer!]
}

type Mutation {
  createCreditApplication(input: CreateCreditApplicationInput!): CreditApplication!
}

Webhooks
	•	credit.offer.created
	•	credit.disbursed
	•	repayment.due
	•	repayment.missed
	•	agreement.signed

Include HMAC signatures, idempotency keys.

⸻

6. SDK Requirements

Features
	•	Auth helpers (exchange API key → JWT, refresh tokens)
	•	Typed client: client.creditApplications.create({...})
	•	Webhook verifier & local dev tunnel helper
	•	Retry/backoff, circuit breaker
	•	Offline queue (mobile)
	•	Event emitter for realtime updates (WebSocket/SSE)

Structure

// packages/sdk-js/src/index.ts
export class CaaSClient {
  constructor(config: ClientConfig) {}
  creditApplications = new CreditApplicationsAPI(this.http);
  offers = new OffersAPI(this.http);
  repayments = new RepaymentsAPI(this.http);
  webhooks = new WebhookVerifier(config.secret);
}


⸻

7. Smart Contract Layer (Optional but Future-Proof)

Use Cases
	•	Escrow Vaults: Hold disbursed funds until conditions met.
	•	Credit Line NFTs: Tokenize credit limit, transferable to other lenders.
	•	Automated Repayment Triggers: On-chain oracles initiate penalty or interest accrual.

Stack
	•	Solidity + Foundry/Hardhat
	•	Upgradeable contracts (OpenZeppelin proxies) if needed
	•	Oracles via Chainlink
	•	Audit with Slither, Echidna fuzzing

Contract Skeleton

contract CreditLineNFT is ERC721 {
    struct Terms {uint256 limit; uint256 apr; uint256 maturity; address owner;}
    mapping(uint256 => Terms) public creditTerms;
    function mintCreditLine(address to, Terms calldata t) external returns (uint256 tokenId) {}
}


⸻

8. Compliance, Risk & Security Checklist
	•	KYC/KYB: Integrate Prembly/SourceID (already in your stack).
	•	AML/CTF: Sanctions screening (OFAC, EU), transaction monitoring rules.
	•	Data Privacy: GDPR/NDPR data maps, consent logging, data minimization.
	•	PCI DSS: If storing cards; otherwise use tokenized vault (Stripe/Paystack).
	•	SOC2/ISO 27001: Policies, controls, continuous monitoring.
	•	Encryption: TLS 1.3 everywhere, AES-256 at rest, rotate keys.
	•	RLS & ABAC: Row-level security in Postgres/Supabase, attribute-based access control.
	•	Secrets Management: Vault/Supabase Secrets, rotate automatically.
	•	Audit & Traceability: Immutable logs, signed ledger entries, SIEM alerts.

⸻

9. DevOps & Delivery Pipeline
	1.	Branch Strategy: trunk-based with feature flags.
	2.	CI: Lint, typecheck, unit tests, build artifacts, contract tests.
	3.	CD: Staging deploy on merge, prod deploy on tag. Canary releases.
	4.	Infra: Terraform modules for DB, buckets, queues; Pulumi for app stacks.
	5.	Monitoring & Alerts: Uptime checks, synthetic transactions, PagerDuty.

⸻

10. Execution Roadmap (Phased)

Phase	Focus	Key Deliverables
0	Discovery & Spec	Master prompt, ERD, compliance matrix
1	Core APIs & DB	Auth, onboarding, credit apps, offers
2	Underwriting & Disbursement	Rules engine MVP, payout rails
3	Repayments & Collections	Schedules, reminders, auto-debits
4	SDK & Integrations	JS SDK v1, webhook infra, partner docs
5	Mobile/Web UX Polish	Revolut-like interactions, offline support
6	Smart Contracts (opt.)	Escrow/NFT lines, audits
7	Scale & Optimize	Caching, sharding, observability, QA hardening


⸻

11. QA, Testing & Observability Strategy
	•	Unit Tests: >80% coverage of domain logic.
	•	Contract Tests: Pact between frontend/SDK and backend.
	•	E2E: Playwright (web), Detox (mobile), WhatsApp bot test harness.
	•	Load/Stress: k6/Gatling; define performance budgets.
	•	Chaos Testing: Inject failures in staging (latency, DB down).
	•	Observability: OpenTelemetry traces tied to user/session IDs (privacy-safe).

⸻

12. Documentation & Handover
	•	Root README: quickstart, repo map, conventions.
	•	/docs/api: OpenAPI/GraphQL schema, examples.
	•	/docs/runbooks: Incident response, on-call guide, rollback steps.
	•	/docs/security: Threat model, DPIA, key rotation SOP.
	•	Changelog & ADRs (architecture decision records).

⸻

13. Reusability & White-Labeling
	•	Theming system (Tailwind tokens, config-driven).
	•	Multi-tenant DB schema (tenant_id column or schemas per tenant).
	•	Feature flags per tenant (LaunchDarkly/Unleash or in-house).
	•	SDK config allows custom endpoints, branding hooks, i18n.

⸻

14. Integration Points (Existing & Planned)
	•	Verification: Prembly, SourceID.
	•	Payments: Paystack (NG), Stripe/PayPal/Wise (Intl), Flutterwave.
	•	Open Banking: Mono, Okra, Plaid.
	•	Messaging: Twilio/WhatsApp Cloud API, Sendgrid/Mailgun.
	•	Analytics: PostHog/Amplitude, ClickHouse/Metabase BI.

⸻

15. Final Checklist Before “Go”
	•	Master prompt updated with all latest decisions
	•	ERD reviewed & signed off
	•	Security & compliance gap analysis done
	•	SDK published (npm private/public)
	•	Docs hosted (API + Dev portal)
	•	Monitoring dashboards live, alerting tested
	•	DR/BCP playbook rehearsed

⸻

Next Steps for You
	1.	Fill placeholders in the Master Prompt and run it in your preferred build agent.
	2.	Decide blockchain vs off-chain first release.
	3.	Lock core compliance scope per region (NG, UK, EU, US).
	4.	Kick off Phase 0–2 simultaneously with a small team (spec + core API).
	5.	Loop me in for code reviews, threat modeling, and UX polishing.

⸻

Remember: Think “platform-first”. Every feature should be a reusable service or package. Minimize one-off hacks. Build once, expose many times.