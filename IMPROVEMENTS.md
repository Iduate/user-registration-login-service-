# Improvements: Performance, Security, and Cost

This document outlines practical improvements and trade‑offs for the Lambda-based auth service.

## Performance
- Cold starts
  - Bundle with esbuild to tree-shake AWS SDK v3 and third-party libs; target node20, minify, keepNames=false.
  - Prefer one handler file per function to reduce bundle size.
  - Use Lambda Power Tuning to find optimal memory/time trade‑off (often 256–512 MB).
  - Enable provisioned concurrency only for consistent low-latency paths (e.g., login during business hours) to balance cost.
- Connection reuse & SDK
  - Reuse AWS SDK v3 clients across invocations (declared outside handler).
  - Avoid re-fetching secrets on every invocation by caching in memory with TTL.
- DynamoDB access patterns
  - Single-table model: USER#email + PROFILE for O(1) read/writes.
  - For refresh tokens, key by USER#email + REFRESH#tokenId with TTL for automatic expiry.
  - Use ProjectionExpression to limit returned attributes.
  - Consider a GSI if you later introduce alternate lookup keys.
- Caching
  - Cache JWT secret (Secrets Manager) for a few minutes in memory.
  - Optionally cache negative lookups (e.g., non-existent user) for very high traffic scenarios (careful with security implications).

## Security
- Secrets management
  - Store JWT secret in Secrets Manager and rotate periodically; enforce tight IAM on GetSecretValue.
  - If using KMS CMK for envelope encryption of secrets or for JWT signing via KMS HMAC keys, control key usage with conditions.
- Token model & rotation
  - Access token short TTL (<= 15m). Refresh token rotation on every use; revoke old ones immediately.
  - Store refresh tokens hashed (SHA‑256) and compare with constant-time equality.
  - Support server-side revocation by deleting token record or by maintaining a per-user “revokedBefore” watermark.
- Additional hardening
  - IP/device fingerprinting for refresh token binding (store hash of fingerprint with token record; verify on rotation).
  - Rate limiting & WAF: API Gateway throttling (RPS + burst); AWS WAF for brute-force and credential-stuffing signatures.
  - Audit logging: include requestId/correlationId; write security-relevant events (register/login/failed attempts/refresh) with structured fields.
  - PII minimization: avoid logging names; if email is logged, consider redaction or hashing in production.
  - Password policy: enforce length and character classes; deny common passwords; check HaveIBeenPwned as an optional enhancement.
- Session management
  - Consider rotating access token on privilege changes; include auth_time and jti in tokens for traceability.

## Cost
- DynamoDB
  - Start with On-Demand (PAY_PER_REQUEST) for simplicity; switch to provisioned with autoscaling if traffic is predictable.
  - TTL on refresh tokens to reduce storage and cost.
- Lambda
  - Optimize memory to hit lower duration while not over-provisioning; measure with Power Tuning.
  - Provisioned Concurrency only if latency SLO requires it.
- API Gateway vs ALB
  - HTTP API Gateway is cheapest for simple JSON APIs; use REST API only when you need advanced features.
  - ALB can be cost-effective for very high throughput, but loses some API Gateway features.
- CloudWatch Logs
  - Set log retention (e.g., 30–90 days) instead of infinite retention.
  - Avoid verbose logs in hot paths; use structured logs and coarse-grained metrics.

## Operational Enhancements
- Observability
  - Adopt the Embedded Metric Format (EMF) library or CloudWatch Metric Filters for dashboards/alarms (login failures, 5xx, p95 latency).
- SLOs & Alarms
  - Create alarms on 5xx rate, auth failures spike, and DynamoDB throttles.
- CI/CD
  - Lint, type-check, test on PR; deploy with SAM/CodeBuild or CDK Pipelines.
