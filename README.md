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
  apiKey: process.env.ADSBLOL_API_KEY, // optional, sent as X-API-Key (see Auth)
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

Pass an API key with `apiKey`; the client sends it as the `X-API-Key` header:

```ts
const adsb = new AdsbLol({ apiKey: process.env.ADSBLOL_API_KEY });
```

Keys are optional today: requests without a key work. Get one at [adsb.lol/mmb](https://www.adsb.lol/mmb) (anonymous keys valid for a month, long-lived keys for feeders whose station adsb.lol can see, and keys on request for other projects). The key is only checked if you send one: an invalid key is answered with HTTP `401` and the body `invalid api key`. It is not retried and surfaces as an `HttpError`:

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

## Rate limits

The API enforces rate limits, but adsb.lol does not publish them. They are most likely dynamic and may depend on current load, so treat the values below as a snapshot, not a guarantee. They were observed once in response headers (`x-ratelimit-limit`):

- 4 requests per second
- 60 requests per minute
- 500 requests per day

adsb.lol is a free, community-run service. Please be considerate:

- Request only what you need, and do not poll more often than your use case requires.
- Cache responses where you can, especially when several users of your app ask for the same data.
- Back off when you get HTTP 429. The client already retries with backoff and honours `Retry-After`; do not wrap it in additional tight retry loops.
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
