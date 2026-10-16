# API v1 Compatibility Matrix

These routes delegate to the corresponding legacy handlers in `src/pages/api/v1/`. They inherit the handler’s validation, authentication, feature flags, and response behavior. A versioned path alone does not grant token authentication.

| Legacy Route | v1 Route | Notes |
| --- | --- | --- |
| `/api/attack/[id]` | `/api/v1/attack/[id]` | Wrapper route, same handler |
| `/api/spy/[id]` | `/api/v1/spy/[id]` | Wrapper route, same handler |
| `/api/account/reset` | `/api/v1/account/reset` | Wrapper route, same handler |
| `/api/account/verify` | `/api/v1/account/verify` | Wrapper route, same handler |
| `/api/bank/deposit` | `/api/v1/bank/deposit` | Wrapper route, same handler |
| `/api/bank/withdraw` | `/api/v1/bank/withdraw` | Wrapper route, same handler |
| `/api/alliances/bank/deposit` | `/api/v1/alliances/bank/deposit` | Wrapper route, same handler |
| `/api/alliances/bank/withdraw` | `/api/v1/alliances/bank/withdraw` | Wrapper route, same handler |

Inspect [v1 routes](../src/pages/api/v1) and [API guards](../src/middleware/apiGuard.ts) for supported methods and authentication; this table lists selected wrappers, not every endpoint.
