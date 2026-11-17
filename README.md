# adsblol-ts

Unofficial, zero-runtime-dependency TypeScript client for the [adsb.lol API](https://api.adsb.lol/docs).

> Unofficial, not affiliated with adsb.lol.

> [!IMPORTANT]
> **Using this API? Consider feeding.** adsb.lol is a free, community-run network that exists because people share data from their own receivers. If you use the API, please consider adding a receiver: an [adsb.im](https://adsb.im) image for a Raspberry Pi needs almost no technical skill, and an existing station only needs Beast out on port 30005 and does not touch your current setup.
> See [Sharing your data](https://www.adsb.lol/docs/get-started/introduction) to get started.

## Installation

```sh
pnpm add @matmuenzel/adsblol-ts
```

Requires Node.js 22 or later, or a runtime with `fetch`, `AbortSignal.timeout` and `AbortSignal.any` (all current browsers, Deno, Bun).

## Examples

### Aircraft near a point

```ts
import { AdsbLol, callsign, altitudeFt } from "@matmuenzel/adsblol-ts";

const adsb = new AdsbLol();

// Aircraft within 10 nautical miles of London Heathrow.
const { ac, now } = await adsb.aircraft.near({ lat: 51.47, lon: -0.45, radiusNm: 10 });

for (const aircraft of ac) {
  console.log(callsign(aircraft) ?? "(no callsign)", altitudeFt(aircraft) ?? "n/a");
}

console.log("Snapshot time:", new Date(now).toISOString());
```

### Look up one aircraft by hex address

```ts
import { AdsbLol, callsign, altitudeFt } from "@matmuenzel/adsblol-ts";

const adsb = new AdsbLol();

const { ac } = await adsb.aircraft.byHex("4ca87c");
const first = ac[0];

if (first) {
  console.log(callsign(first), altitudeFt(first));
}
```

### Look up an airport

```ts
import { AdsbLol } from "@matmuenzel/adsblol-ts";

const adsb = new AdsbLol();

// Returns null if the API does not know the ICAO code.
const airport = await adsb.airports.get("EGLL");

if (airport) {
  console.log(airport.name, airport.alt_feet);
}
```

### Traces

```ts
import { AdsbLol } from "@matmuenzel/adsblol-ts";

const adsb = new AdsbLol();

// `trace` is the full stored trace, `recentTrace` the recent part. Both return null on 404.
const trace = await adsb.aircraft.trace("486802");

if (trace) {
  for (const point of trace.points) {
    console.log(new Date(point.time), point.lat, point.lon, point.altitudeFt);
  }
}
```

Trace endpoints are metered and take a plain six-digit ICAO hex (no `~` prefix). The raw trace is a compact array format, and `parseTrace()` also reads trace files from [`adsblol/globe_history`](https://github.com/adsblol/globe_history).

### Error handling

```ts
import { AdsbLol, RateLimitError, ValidationError } from "@matmuenzel/adsblol-ts";

const adsb = new AdsbLol();

try {
  await adsb.aircraft.near({ lat: 51.47, lon: -0.45, radiusNm: 300 });
} catch (error) {
  if (error instanceof ValidationError) {
    // Rejected before any request was sent (for example radiusNm above 250).
    console.error(error.issues);
  } else if (error instanceof RateLimitError) {
    // Still rate limited after all retry attempts.
    console.warn("Rate limited. Retry after", error.retryAfterMs, "ms");
  } else {
    throw error;
  }
}
```

The client checks inputs before sending a request: latitude from -90 to 90, longitude from -180 to 180, radius as an integer from 0 to 250 nautical miles, hex addresses, squawk codes and airport codes. Invalid input throws a `ValidationError` without making a network call.

Timestamps such as `now` are Unix time in **milliseconds**. Convert them with `toDate`:

```ts
import { AdsbLol, toDate } from "@matmuenzel/adsblol-ts";

const { now } = await new AdsbLol().aircraft.military();
const snapshot: Date = toDate(now);
```

## Options

All options are optional. Durations are in milliseconds.

```ts
import { AdsbLol } from "@matmuenzel/adsblol-ts";

const adsb = new AdsbLol({
  baseUrl: "https://api.adsb.lol", // default
  timeoutMs: 5000, // per attempt, default 10000
  maxAttempts: 3, // including the first attempt, default 3
  apiKey: process.env.ADSBLOL_API_KEY, // optional, sent as x-api-key (see Auth)
});
```

Per call, you can pass an `AbortSignal` to cancel a request. Cancellation is never retried, and the call rejects with `signal.reason` (for example a `DOMException` named `AbortError`), not with an `AdsbLolError`:

```ts
import { AdsbLol } from "@matmuenzel/adsblol-ts";

const adsb = new AdsbLol();

const { ac } = await adsb.aircraft.military({ signal: AbortSignal.timeout(2000) });
```

### Retries

Requests are retried on network errors, timeouts, and HTTP `408`, `429`, `500`, `502`, `503` and `504`. Other `4xx` responses are not retried.

- Default: up to 3 attempts in total, with exponential backoff starting at 500 ms, full jitter, capped at 8000 ms (`baseDelayMs`, `maxDelayMs`).
- A `Retry-After` header from the server takes precedence over the backoff. If it asks for longer than `maxRetryAfterMs` (default 30000 ms), the request fails immediately instead of waiting.
- Set `maxAttempts: 1` to disable retries.

### Auth

Pass an API key with `apiKey`. The spec documents the key as the `x-api-key` header; the client sends it as `x-api-key` (header names are case-insensitive):

```ts
const adsb = new AdsbLol({ apiKey: process.env.ADSBLOL_API_KEY });
```

Keys are optional today: requests without a key work (500 requests per day per IP, see [Rate limits](#rate-limits)). Get one at [adsb.lol/mmb](https://www.adsb.lol/mmb) (anonymous keys valid for a month, long-lived keys for feeders whose station adsb.lol can see, and keys on request for other projects). The key is only checked if you send one: an invalid key is answered with HTTP `401` and the body `invalid api key`. It is not retried and surfaces as an `HttpError`:

```ts
import { HttpError } from "@matmuenzel/adsblol-ts";

try {
  await adsb.aircraft.military();
} catch (err) {
  if (err instanceof HttpError && err.status === 401) {
    // invalid API key
  }
}
```

`apiKey` must be a non-empty string; an empty value, or `apiKey` together with `auth`, throws an `AdsbLolError` at construction. An `undefined` value means no key.

#### Custom auth

For proxies or other setups, `auth` takes a fixed header (name and value):

```ts
const adsb = new AdsbLol({
  auth: { header: "your-header-name", value: "your-key-value" },
});
```

or a function that receives the outgoing `Request` and returns the request to send:

```ts
const adsb = new AdsbLol({
  auth: (request) => {
    const headers = new Headers(request.headers);
    headers.set("your-header-name", "your-key-value");
    return new Request(request, { headers });
  },
});
```

Keys belong on the server. Do not put them in browser bundles, URLs or logs.

When `apiKey` or `auth` is set, the client sends requests with `redirect: "error"`, so the key is never forwarded to another origin; a redirect then fails with a `NetworkError`. An invalid header configuration throws an `AdsbLolError` at construction, and a failing auth function throws `AdsbLolError("Auth function failed")`; neither message nor `cause` ever contains the key.

### Hooks

Hooks observe requests. They never receive headers or credentials, and exceptions thrown inside a hook are ignored.

```ts
import { AdsbLol } from "@matmuenzel/adsblol-ts";

const adsb = new AdsbLol({
  hooks: {
    onRequest: ({ method, url, attempt }) => {
      console.debug("request", method, url, "attempt", attempt);
    },
    onResponse: ({ status, durationMs }) => {
      console.debug("response", status, durationMs, "ms");
    },
    onRetry: ({ attempt, delayMs, error }) => {
      console.warn("retrying after attempt", attempt, "in", delayMs, "ms:", error.message);
    },
  },
});
```

## re-api (feeders, experimental)

`adsb.reApi` queries the [re-api](https://www.adsb.lol/docs/feeders-only/re-api/), readsb's query interface at `https://re-api.adsb.lol`. It is **experimental**:

- Access needs a feeder key (`apiKey`). A feeder IP alone was observed to get HTTP 401 `api key required`.
- The response shape follows the readsb `jv2` documentation and has not yet been verified against a live 200 response.
- The server answers auth problems with HTTP 401 and one of the texts `api key required`, `api key expired` or `invalid api key`. They surface as an `HttpError` with `status === 401`.
- Use `reApiBaseUrl` to point the re-api at another host. All other options, including `apiKey`, apply to both hosts.

```ts
const adsb = new AdsbLol({ apiKey: process.env.ADSBLOL_API_KEY });

const { ac } = await adsb.reApi.circle(
  { lat: 51.47, lon: -0.45, radiusNm: 10 },
  { military: true, aboveAltBaroFt: 20000, types: ["A400"] },
);
```

Methods: `circle`, `closest`, `box`, `all`, `findHex`, `findCallsign`, `findRegistration`, `findType`, `findSquawk`. Each takes an optional `ReApiFilter` as second-to-last argument.

## Rate limits

The adsb.lol API publishes its quotas in the OpenAPI spec. Each operation carries an `x-quota` value: `metered` operations count against a quota, `free` operations do not. Metered: `/v2/*` and `/1/trace/*` (and `/api/0/airport/{icao}`). Free: `/0/me`, `/0/my` and `/api/0/routeset`.

Quotas by key tier:

- no key: 500 requests per day per IP
- anonymous key (valid 30 days, no account): 500 requests per day
- adhoc key (free, request form): 1,000 requests per day
- feeder key (free, for feeding the network): 7,200 requests per day, 20 GB per month, and access to the [re-api](https://www.adsb.lol/docs/feeders-only/re-api/)
- sponsor plans: up to 360,000 requests per day, see [adsb.lol/sponsor](https://www.adsb.lol/sponsor)

Without a key, the daily window is a fixed 24-hour bucket per IP, not midnight UTC. Keyed traffic is limited per key on the tier's own windows. Over quota, the API answers with HTTP `429` and a `Retry-After` header. The client retries `429` with backoff and honours `Retry-After`, then surfaces a `RateLimitError` if the retries run out. When the daily quota is exhausted, `Retry-After` is above `maxRetryAfterMs` (default 30000 ms), so the client throws a `RateLimitError` immediately instead of waiting.

adsb.lol is a free, community-run service. Please be considerate:

- Request only what you need, and do not poll more often than your use case requires.
- Cache responses where you can, especially when several users of your app ask for the same data.
- Back off when you get HTTP 429; do not wrap the client in additional tight retry loops.
- For production use, contact the adsb.lol maintainers first.

## Browser

No CORS headers were observed in responses, even when an `Origin` header was sent. Browsers will therefore probably block direct calls to the API. Call it from a server-side proxy instead of from browser code.

## Not yet supported

- `routeset`: not offered in version 0.1. In probe requests it returned an empty response body, even for known callsigns.

## Data license

The data returned by the API is licensed under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). If you publish or redistribute data from this API, attribute it with:

> Data © adsb.lol contributors, available under the ODbL

## License

The code in this repository is released under the [MIT License](./LICENSE).
