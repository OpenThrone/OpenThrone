# Redis Rate Limit Implementation Plan

Date: 2026-02-07  
Status: planned  
Scope: replace in-memory API limiter backing store with Redis-backed storage while preserving current profiles and guard behavior.

## Goals
- Preserve existing `withApiGuard` rate-limit profiles and endpoint behavior.
- Make rate limiting consistent across multiple app instances.
- Keep deployment rollback-safe with a feature flag and staged rollout.

## Non-Goals
- No changes to auth semantics, permission checks, or API response shapes.
- No unrelated caching strategy changes.

## Phase 1: Design and Config
- Define env contract:
  - `OT_RATE_LIMIT_BACKEND=memory|redis`
  - `OT_REDIS_URL`
  - `OT_REDIS_TLS=true|false` (if needed by host)
  - optional prefix: `OT_RATE_LIMIT_PREFIX`
- Add backend selector in limiter initialization (default `memory`).
- Keep memory implementation as first-class fallback path.

## Phase 2: Redis Store Implementation
- Add Redis adapter for current limiter key model and TTL semantics.
- Ensure atomic increment + TTL behavior.
- Namespace keys by environment/app to avoid collisions.
- Add defensive error handling:
  - fail-open behavior with audit log if Redis temporarily unavailable
  - optional circuit-breaker cooldown to avoid hot-loop retries

## Phase 3: Test Coverage
- Unit tests for Redis key increment/expiry behavior.
- Integration tests for:
  - per-profile limits (`auth`, `attack`, `spy`, `bank`, `admin`, etc.)
  - idempotency + rate limit interaction order
  - fallback to memory when Redis disabled/unavailable

## Phase 4: Rollout
- Deploy with backend still set to `memory`.
- Enable Redis in staging:
  - validate 429 rates, latency, and error logs
- Enable Redis in production behind env toggle.
- Monitor for 24-48h:
  - limiter errors
  - unexpected 429 spikes
  - auth/attack mutation failure rates

## Phase 5: Completion Criteria
- Redis mode stable in production with no critical regressions.
- Memory fallback path validated and documented.
- Docs updated:
  - runtime env variables
  - operational runbook
  - rollback procedure (`OT_RATE_LIMIT_BACKEND=memory`)

## Risks and Mitigations
- Redis outage causing broad request impact:
  - Mitigation: fail-open + memory fallback toggle.
- Misconfigured TTL causing aggressive/weak limiting:
  - Mitigation: profile-by-profile staging verification and metrics.
- Key cardinality growth:
  - Mitigation: strict key schema and TTL enforcement.

