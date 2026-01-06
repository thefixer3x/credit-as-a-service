# Event Contracts

## Scope

These contracts standardize domain and integration events across services. They are used for Kafka (future) and the current in-process event bus in `services/notifications`.

## Event Envelope

All events must conform to the envelope defined in `@caas/types` (`packages/types/src/events.ts`).

Required fields:

- `id`: unique event id (UUID recommended)
- `type`: namespaced event name (dot-separated)
- `source`: producing service name (e.g., `risk-service`)
- `timestamp`: epoch milliseconds
- `version`: event schema version
- `data`: event payload

Optional fields:

- `aggregateId`, `aggregateType`
- `correlationId`, `causationId`
- `tenantId`
- `metadata`

Example:

```json
{
  "id": "2f82d7e0-2a5b-4a31-8e7d-705f45fbd0d1",
  "type": "loan.application.submitted",
  "source": "offers-service",
  "timestamp": 1726609350123,
  "version": "1.0.0",
  "correlationId": "c0a8012e-8fb0-4bdb-97c7-89f6440b0c4f",
  "aggregateId": "loan_123",
  "aggregateType": "loan",
  "data": {
    "loanId": "loan_123",
    "userId": "user_456",
    "amount": 25000,
    "status": "submitted"
  }
}
```

## Naming Conventions

- Format: `<domain>.<entity>.<action>`
- Use lowercase with dots; avoid spaces.
- Examples:
  - `loan.application.submitted`
  - `risk.assessment.completed`
  - `compliance.check.failed`
  - `payment.processed`
  - `user.registered`

## Versioning

- `version` is the event schema version.
- Increment `version` for breaking payload changes.
- Additive changes can keep the same version.

## Correlation and Causation

- `correlationId` should match `X-Request-Id` from the originating HTTP request.
- `causationId` should reference the immediate prior event when events trigger new events.

## Transport Guidance

- Kafka topic naming (recommended): `caas.domain-events`
- Message key: `aggregateId` (for ordering per aggregate)
- Consumers must ignore unknown fields for forward compatibility.
