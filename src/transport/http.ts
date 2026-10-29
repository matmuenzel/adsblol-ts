import {
  AdsbLolError,
  HttpError,
  NetworkError,
  ParseError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from "../errors/index.js";
import { computeBackoffMs, parseRetryAfter } from "./backoff.js";
import { combineSignals } from "./signal.js";

const DEFAULT_BASE_URL = "https://api.adsb.lol";
const DEFAULT_USER_AGENT = "adsblol-ts (+https://github.com/matmuenzel/adsblol-ts)";
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * How requests are authenticated. Either a fixed header (name and value) or a
 * function that receives the outgoing `Request` and returns the request to send
 * (for example with a signature header added). The header name and scheme are
 * not guessed; they are whatever you configure here.
 *
 * Security behavior:
 * - A fixed header is validated once when the transport is created. An invalid
 *   name or value throws an `AdsbLolError` with a fixed message that never
 *   contains the value.
 * - If an auth function throws, rejects or returns something that is not a
 *   `Request`, an `AdsbLolError("Auth function failed")` is thrown without a
 *   `cause`, because the original error might contain the key.
 * - While `auth` is set, requests use `redirect: "error"`, so a custom key
 *   header is never forwarded to another origin. A redirect response surfaces
 *   as a `NetworkError`.
 */
export type AuthOption =
  { header: string; value: string } | ((request: Request) => Request | Promise<Request>);

/**
 * Optional observers for requests. Payloads never contain headers or other
 * credentials. Exceptions thrown by hooks are swallowed.
 */
export interface TransportHooks {
  /** Called before each attempt. `attempt` is 1-based. */
  onRequest?(info: { method: string; url: string; attempt: number }): void;
  /** Called after each response was received (any status). `durationMs` is in milliseconds. */
  onResponse?(info: {
    method: string;
    url: string;
    status: number;
    attempt: number;
    durationMs: number;
  }): void;
  /** Called before waiting for a retry. `attempt` is the failed attempt (1-based); `delayMs` is in milliseconds. */
  onRetry?(info: {
    method: string;
    url: string;
    attempt: number;
    delayMs: number;
    error: AdsbLolError;
  }): void;
}

/** Options for the HTTP transport. All durations are in milliseconds. */
export interface TransportOptions {
  /** API base URL without a path. Default `"https://api.adsb.lol"`. A trailing slash is ignored. */
  baseUrl?: string;
  /** Custom `fetch` implementation. Default: the platform `globalThis.fetch`, resolved at call time. */
  fetch?: typeof fetch;
  /** Timeout per attempt in milliseconds. Default `10000`. */
  timeoutMs?: number;
  /** Maximum number of attempts per request, including the first. Default `3`. */
  maxAttempts?: number;
  /** Base of the exponential backoff in milliseconds. Default `500`. */
  baseDelayMs?: number;
  /** Upper bound of the backoff delay in milliseconds. Default `8000`. */
  maxDelayMs?: number;
  /**
   * Longest `Retry-After` wait in milliseconds that is honored. A larger value
   * makes the request fail immediately instead of waiting. Default `30000`.
   */
  maxRetryAfterMs?: number;
  /**
   * adsb.lol API key, sent as the `X-API-Key` header. Keys are optional today and
   * available at https://www.adsb.lol/mmb. The server answers an invalid key with
   * HTTP 401 and the body `invalid api key`, which surfaces as an `HttpError` with
   * `status === 401` (not retried). Equivalent to
   * `auth: { header: "X-API-Key", value: apiKey }`: it cannot be combined with
   * `auth`, requests use `redirect: "error"`, and the key never appears in URLs,
   * hooks, logs or error messages. `undefined` means no key.
   */
  apiKey?: string;
  /** Custom authentication for requests, for example for a proxy. Not combinable with `apiKey`. */
  auth?: AuthOption;
  /**
   * `User-Agent` header value, or `false` to omit it. Only sent when running in
   * Node.js, because browsers forbid setting it. Default
   * `"adsblol-ts (+https://github.com/matmuenzel/adsblol-ts)"`.
   */
  userAgent?: string | false;
  /** Observers for requests, responses and retries. */
  hooks?: TransportHooks;
}

/** Description of one request to send through the transport. */
export interface RequestSpec {
  /** HTTP method. */
  method: "GET" | "POST";
  /** Path starting with `/`, appended to the base URL. Must already be URL-encoded. */
  path: string;
  /** Request body; sent as JSON. */
  body?: unknown;
  /** Signal to cancel the request. Cancellation is never retried. */
  signal?: AbortSignal;
  /** Set to `false` to disable retries for this request. Default: retries enabled. */
  retry?: boolean;
}

/** Sends requests and returns parsed JSON. */
export interface Transport {
  /**
   * Sends a request, retrying transient failures, and returns the parsed JSON body.
   *
   * @throws {NetworkError} No response after all attempts.
   * @throws {TimeoutError} The attempt timeout elapsed on all attempts.
   * @throws {RateLimitError} HTTP 429 after all attempts or with an excessive `Retry-After`.
   * @throws {ValidationError} HTTP 422.
   * @throws {HttpError} Any other non-2xx status.
   * @throws {ParseError} A 2xx response without valid JSON.
   */
  request<T>(spec: RequestSpec): Promise<T>;
}

/** Replaceable dependencies, mainly for deterministic tests. */
export interface TransportDeps {
  /** Waits for `ms` milliseconds; rejects with `signal.reason` if the signal aborts. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Random source in `[0, 1]` used for backoff jitter. */
  random?: () => number;
  /** Clock returning milliseconds since the epoch. */
  now?: () => number;
}

/** Default `sleep`: timer-based, aborts with the signal's reason and cleans up after itself. */
function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Largest delay the platform timers accept, in milliseconds (2^31 - 1). */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * Checks that an option is a finite number inside the given bounds.
 *
 * @param name - Option name used in the error message.
 * @param value - Value to check (any runtime type).
 * @param rule - Bounds and flags the value must satisfy.
 * @throws {AdsbLolError} If the value is not valid. The message names the option.
 */
function assertOption(
  name: string,
  value: unknown,
  rule: { min: number; exclusiveMin?: boolean; integer?: boolean; max?: number },
): void {
  const ok =
    typeof value === "number" &&
    Number.isFinite(value) &&
    (rule.exclusiveMin ? value > rule.min : value >= rule.min) &&
    (rule.max === undefined || value <= rule.max) &&
    (!rule.integer || Number.isInteger(value));
  if (!ok) {
    const kind = rule.integer ? "an integer" : "a finite number";
    const upper = rule.max === undefined ? "" : ` and <= ${rule.max}`;
    const bound = `${rule.exclusiveMin ? ">" : ">="} ${rule.min}${upper}`;
    throw new AdsbLolError(
      `Invalid option ${name}: must be ${kind} ${bound}, got ${String(value)}`,
    );
  }
}

/**
 * Checks a fixed auth header once, without ever including the value in an error.
 *
 * @throws {AdsbLolError} With a fixed message and no `cause` if name or value is invalid.
 */
function assertAuthHeader(auth: { header: string; value: string }): void {
  try {
    new Headers().set(auth.header, auth.value);
  } catch {
    throw new AdsbLolError("Invalid auth header configuration");
  }
}

/** Header used for adsb.lol API keys. */
const API_KEY_HEADER = "X-API-Key";

/**
 * Combines `apiKey` and `auth` into one auth setting; `apiKey` is treated like a fixed
 * `X-API-Key` header.
 *
 * @throws {AdsbLolError} If both are set or `apiKey` is not a non-empty string. Messages never contain the key.
 */
function resolveAuth(options: TransportOptions): AuthOption | undefined {
  if (options.apiKey === undefined) return options.auth;
  if (options.auth) throw new AdsbLolError("Use either apiKey or auth, not both");
  if (typeof options.apiKey !== "string" || options.apiKey.trim() === "") {
    throw new AdsbLolError("Invalid apiKey: must be a non-empty string");
  }
  return { header: API_KEY_HEADER, value: options.apiKey };
}

/** True when running under Node.js, where setting `User-Agent` is allowed. */
function isNode(): boolean {
  return typeof process !== "undefined" && !!process.versions?.node;
}

/** Calls a hook and ignores anything it throws. */
function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    // Hooks must never break a request.
  }
}

/** Builds the error for a non-2xx response. */
function statusError(
  status: number,
  url: string,
  text: string,
  retryAfterMs: number | undefined,
): AdsbLolError {
  if (status === 429) return new RateLimitError(url, text, retryAfterMs);
  if (status === 422) {
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // Keep the raw text.
    }
    return ValidationError.fromResponseBody(body, status);
  }
  return new HttpError(status, url, text);
}

/** Outcome of one attempt that did not produce a result. */
interface Failure {
  error: AdsbLolError;
  retryable: boolean;
  /** Wait requested by the server, in milliseconds. */
  retryAfterMs?: number;
}

/**
 * Creates a transport with timeouts, retries, `Retry-After` handling, auth and hooks.
 *
 * @param options - Transport configuration; see {@link TransportOptions}.
 * @param deps - Replaceable `sleep`, `random` and `now`, for tests.
 * @returns A {@link Transport}.
 */
export function createTransport(
  options: TransportOptions = {},
  deps: TransportDeps = {},
): Transport {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const doFetch = options.fetch ?? ((input: Request) => globalThis.fetch(input));
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxAttempts = options.maxAttempts ?? 3;
  const backoff = {
    baseDelayMs: options.baseDelayMs ?? 500,
    maxDelayMs: options.maxDelayMs ?? 8000,
  };
  const maxRetryAfterMs = options.maxRetryAfterMs ?? 30_000;
  assertOption("timeoutMs", timeoutMs, { min: 0, exclusiveMin: true, max: MAX_TIMER_MS });
  assertOption("maxAttempts", maxAttempts, { min: 1, integer: true });
  assertOption("baseDelayMs", backoff.baseDelayMs, { min: 0 });
  assertOption("maxDelayMs", backoff.maxDelayMs, { min: 0 });
  assertOption("maxRetryAfterMs", maxRetryAfterMs, { min: 0 });
  const auth = resolveAuth(options);
  if (auth && typeof auth === "object") assertAuthHeader(auth);
  const userAgent = options.userAgent === undefined ? DEFAULT_USER_AGENT : options.userAgent;
  const hooks = options.hooks ?? {};
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;
  const now = deps.now ?? Date.now;

  async function buildRequest(spec: RequestSpec, url: string, signal: AbortSignal | undefined) {
    const headers = new Headers({ Accept: "application/json" });
    if (userAgent !== false && isNode()) headers.set("User-Agent", userAgent);
    let body: string | undefined;
    if (spec.body !== undefined) {
      body = JSON.stringify(spec.body);
      headers.set("Content-Type", "application/json");
    }
    if (auth && typeof auth === "object") {
      headers.set(auth.header, auth.value);
    }
    const init: RequestInit = { method: spec.method, headers, body };
    if (signal) init.signal = signal;
    // Never follow redirects with credentials: a custom key header would be forwarded cross-origin.
    if (auth) init.redirect = "error";
    let request = new Request(url, init);
    if (typeof auth === "function") {
      try {
        const result: unknown = await auth(request);
        if (!(result instanceof Request)) throw new Error("not a Request");
        request = result.redirect === "error" ? result : new Request(result, { redirect: "error" });
      } catch {
        // Fixed message and no cause: the original error may contain the key.
        throw new AdsbLolError("Auth function failed");
      }
    }
    return request;
  }

  async function attempt<T>(
    spec: RequestSpec,
    url: string,
    attemptNo: number,
  ): Promise<{ ok: true; value: T } | { ok: false; failure: Failure }> {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = combineSignals([spec.signal, timeoutSignal]);
    const request = await buildRequest(spec, url, signal);

    safely(() => hooks.onRequest?.({ method: spec.method, url, attempt: attemptNo }));
    const started = now();
    let status: number;
    let text: string;
    let retryAfterHeader: string | null;
    try {
      const response = await doFetch(request);
      status = response.status;
      retryAfterHeader = response.headers.get("retry-after");
      safely(() =>
        hooks.onResponse?.({
          method: spec.method,
          url,
          status,
          attempt: attemptNo,
          durationMs: now() - started,
        }),
      );
      text = await response.text();
    } catch (cause) {
      if (spec.signal?.aborted) throw spec.signal.reason;
      if (timeoutSignal.aborted) {
        return {
          ok: false,
          failure: {
            error: new TimeoutError(`Request timed out after ${timeoutMs} ms`, { cause }),
            retryable: true,
          },
        };
      }
      return {
        ok: false,
        failure: { error: new NetworkError("Network request failed", { cause }), retryable: true },
      };
    }

    if (status >= 200 && status < 300) {
      try {
        return { ok: true, value: JSON.parse(text) as T };
      } catch (cause) {
        throw new ParseError(`Response body is not valid JSON (HTTP ${status})`, { cause });
      }
    }
    const retryAfterMs = parseRetryAfter(retryAfterHeader, now());
    return {
      ok: false,
      failure: {
        error: statusError(status, url, text, retryAfterMs),
        retryable: RETRYABLE_STATUSES.has(status),
        retryAfterMs,
      },
    };
  }

  return {
    async request<T>(spec: RequestSpec): Promise<T> {
      const url = baseUrl + spec.path;
      const attempts = spec.retry === false ? 1 : maxAttempts;
      for (let attemptNo = 1; ; attemptNo++) {
        if (spec.signal?.aborted) throw spec.signal.reason;
        const result = await attempt<T>(spec, url, attemptNo);
        if (result.ok) return result.value;

        const { error, retryable, retryAfterMs } = result.failure;
        if (!retryable || attemptNo >= attempts) throw error;
        if (retryAfterMs !== undefined && retryAfterMs > maxRetryAfterMs) throw error;

        const delayMs = retryAfterMs ?? computeBackoffMs(attemptNo - 1, backoff, random);
        safely(() =>
          hooks.onRetry?.({ method: spec.method, url, attempt: attemptNo, delayMs, error }),
        );
        await sleep(delayMs, spec.signal);
      }
    },
  };
}
