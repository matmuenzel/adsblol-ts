/**
 * Error classes thrown by the adsblol-ts client.
 *
 * Every error extends {@link AdsbLolError}, so callers can catch all client
 * failures with a single `instanceof AdsbLolError` check. The `name` of each
 * instance equals its concrete class name.
 */

/** Maximum number of response body characters kept in {@link HttpError.bodySnippet}. */
const BODY_SNIPPET_MAX_LENGTH = 500;

/**
 * Base class for all errors thrown by the client.
 */
export class AdsbLolError extends Error {
  /**
   * @param message - Short, human-readable description of the failure.
   * @param options - Optional `cause` with the underlying error.
   */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AdsbLolError";
  }
}

/**
 * The API answered with a non-success HTTP status.
 */
export class HttpError extends AdsbLolError {
  /** HTTP status code of the response, e.g. `404` or `500`. */
  status: number;
  /** Request URL that produced the error. Never contains API keys. */
  url: string;
  /** First 500 characters of the response body. Empty if the body was empty. */
  bodySnippet: string;

  /**
   * @param status - HTTP status code of the response.
   * @param url - Request URL (without secrets).
   * @param body - Full response body text; only the first 500 characters are kept.
   * @param options - Optional `cause` with the underlying error.
   */
  constructor(status: number, url: string, body: string, options?: { cause?: unknown }) {
    super(`HTTP ${status} for ${url}`, options);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
    this.bodySnippet = body.slice(0, BODY_SNIPPET_MAX_LENGTH);
  }
}

/**
 * The API answered with HTTP 429 (Too Many Requests).
 */
export class RateLimitError extends HttpError {
  /**
   * Milliseconds to wait before retrying, taken from the `Retry-After` header.
   * `undefined` if the server sent no usable hint.
   */
  retryAfterMs: number | undefined;

  /**
   * @param url - Request URL (without secrets).
   * @param body - Full response body text; only the first 500 characters are kept.
   * @param retryAfterMs - Wait time in milliseconds before retrying, or `undefined`.
   * @param options - Optional `cause` with the underlying error.
   */
  constructor(
    url: string,
    body: string,
    retryAfterMs: number | undefined,
    options?: { cause?: unknown },
  ) {
    super(429, url, body, options);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * One problem reported by the API for a request parameter or body field.
 */
export interface ValidationIssue {
  /** Path to the offending value, e.g. `["path", "lat"]`. Empty if unknown. */
  loc: (string | number)[];
  /** Human-readable description of the problem. */
  msg: string;
  /** Machine-readable error type from the API, e.g. `less_than_equal`, or `unknown`. */
  type: string;
}

/**
 * The request was rejected as invalid, either by client-side validation or
 * by the API (HTTP 422).
 */
export class ValidationError extends AdsbLolError {
  /** All problems found. Contains at least one entry. */
  issues: ValidationIssue[];
  /** HTTP status code if the error came from an API response, otherwise `undefined`. */
  status: number | undefined;

  /**
   * @param message - Short summary of the failure.
   * @param issues - Individual problems that caused the failure.
   * @param status - HTTP status code if the API returned it, otherwise `undefined`.
   * @param options - Optional `cause` with the underlying error.
   */
  constructor(
    message: string,
    issues: ValidationIssue[],
    status: number | undefined,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ValidationError";
    this.issues = issues;
    this.status = status;
  }

  /**
   * Builds a ValidationError from an API response body.
   *
   * Reads `detail[]` from an `HTTPValidationError` body. If the body has a
   * different shape, a single issue with type `unknown` is created from the
   * body text instead.
   *
   * @param body - Parsed response body (any JSON value, or raw text).
   * @param status - HTTP status code of the response, usually `422`.
   * @returns A ValidationError whose `issues` holds the API problems.
   */
  static fromResponseBody(body: unknown, status: number): ValidationError {
    const issues = parseIssues(body);
    return new ValidationError(summarize(issues), issues, status);
  }
}

/**
 * A network-level failure: DNS, connection reset, TLS error and similar.
 * No HTTP response was received.
 */
export class NetworkError extends AdsbLolError {
  /**
   * @param message - Short description of the failure.
   * @param options - Optional `cause` with the underlying error.
   */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NetworkError";
  }
}

/**
 * The request did not complete within the configured timeout.
 */
export class TimeoutError extends AdsbLolError {
  /**
   * @param message - Short description of the failure, including the timeout if known.
   * @param options - Optional `cause` with the underlying error.
   */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TimeoutError";
  }
}

/**
 * The API answered successfully, but the response body could not be parsed
 * or did not match the expected shape.
 */
export class ParseError extends AdsbLolError {
  /**
   * @param message - Short description of the failure.
   * @param options - Optional `cause` with the underlying error.
   */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ParseError";
  }
}

/** Extracts issues from a response body, falling back to one `unknown` issue. */
function parseIssues(body: unknown): ValidationIssue[] {
  if (isRecord(body) && Array.isArray(body.detail) && body.detail.length > 0) {
    return body.detail.map(toIssue);
  }
  return [{ loc: [], msg: bodyText(body), type: "unknown" }];
}

/** Converts one entry of `detail[]` into a ValidationIssue. */
function toIssue(entry: unknown): ValidationIssue {
  if (!isRecord(entry)) {
    return { loc: [], msg: bodyText(entry), type: "unknown" };
  }
  const loc = Array.isArray(entry.loc)
    ? entry.loc.filter(
        (part): part is string | number => typeof part === "string" || typeof part === "number",
      )
    : [];
  const msg = typeof entry.msg === "string" ? entry.msg : bodyText(entry);
  const type = typeof entry.type === "string" ? entry.type : "unknown";
  return { loc, msg, type };
}

/** Builds the error message from issues: `loc: msg; loc: msg`. */
function summarize(issues: ValidationIssue[]): string {
  const parts = issues.map((issue) =>
    issue.loc.length > 0 ? `${issue.loc.join(".")}: ${issue.msg}` : issue.msg,
  );
  return `Invalid request: ${parts.join("; ")}`;
}

/** Returns a string form of an arbitrary body value for use as a message. */
function bodyText(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Type guard for plain-object-like values. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
