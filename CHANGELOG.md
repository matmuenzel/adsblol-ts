# @matmuenzel/adsblol-ts

## 0.2.0

### Minor Changes

- 2d3eea3: Add experimental `reApi` queries (circle, closest, box, all and find_*) for the feeders-only re-api; the response shape is not yet verified against a live 200 response.
- 2d3eea3: Update to the adsb.lol spec of 2026-11-16: document the published quotas in the README, add `DbFlag.Interesting` and `isInteresting()` for `dbFlags` bit 2.
- 2d3eea3: Add `aircraft.trace()` and `aircraft.recentTrace()` for the trace endpoints, and report unreadable non-2xx response bodies as the normal `HttpError` instead of a retried `NetworkError`.
- 2d3eea3: Add `parseTrace()` and the `Trace`, `TracePoint`, `RawTrace` and `RawTracePoint` types to translate readsb trace arrays into objects with unit-suffixed fields.

## 0.1.0

### Minor Changes

- f7ccf32: Initial release
