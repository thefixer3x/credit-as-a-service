# Service API Standards (Fastify Hybrid)

## Scope

These standards apply to all HTTP services in `services/` and `apps/api`. Fastify is the default runtime, and endpoints should be consistent across services to keep the gateway, SDKs, and clients predictable.

## Base URL and Versioning

- Base path: `/api/v1/<service>`
- Breaking changes increment the major version: `/api/v2/<service>`
- Minor, backward-compatible changes stay in the same version.

## Required Endpoints

- `GET /health` (liveness, no dependencies)
- `GET /ready` (readiness, includes critical deps)
- `GET /metrics` (Prometheus or OpenTelemetry exporter)
- `GET /version` (build metadata: version, commit, build time)
- `GET /docs` (Swagger UI)
- `GET /openapi.json` (OpenAPI document)

## Required Headers

- `X-Request-Id`: generated if missing; returned in responses
- `X-Correlation-Id`: propagated across service calls
- `X-Tenant-Id`: required for multi-tenant routes
- `X-Idempotency-Key`: required for POST/PUT that create or trigger side effects
- `Authorization`: bearer token when auth is required
- `Content-Type`: `application/json`

## Response Envelope

Use the shared schema from `@caas/types` (`apiResponseSchema`) for all JSON responses.

```json
{
  "success": true,
  "data": {
    "id": "loan_123"
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "7b4dd9b7-7fcf-4c7e-9245-91d00f9d6cf7"
  }
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "amount must be greater than 0",
    "details": {
      "field": "amount"
    }
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "7b4dd9b7-7fcf-4c7e-9245-91d00f9d6cf7"
  }
}
```

## Pagination

List endpoints should support:

- `page` (default `1`)
- `limit` (default `20`, max `100`)
- `sortBy`
- `sortOrder` (`asc` or `desc`)

Paginated responses must include `meta.pagination`.

## Error Codes

Use consistent error codes across services:

- `INVALID_ARGUMENT`
- `UNAUTHENTICATED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `RATE_LIMITED`
- `INTERNAL`
- `UNAVAILABLE`
- `TIMEOUT`

## Observability

- Propagate `X-Request-Id` and `X-Correlation-Id` in logs and traces.
- Include `service`, `route`, and `statusCode` in structured logs.
