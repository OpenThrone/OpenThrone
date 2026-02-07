# API v1 Compatibility Matrix

Date: 2026-02-07

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

Current v1 rollout strategy:
- v1 endpoints are compatibility wrappers while hardening is still in progress.
- Existing clients may remain on legacy paths until cutover.
- New token-auth clients should prefer `/api/v1/*`.
