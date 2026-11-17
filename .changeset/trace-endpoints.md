---
"@matmuenzel/adsblol-ts": minor
---

Add `aircraft.trace()` and `aircraft.recentTrace()` for the trace endpoints, and report unreadable non-2xx response bodies as the normal `HttpError` instead of a retried `NetworkError`.
