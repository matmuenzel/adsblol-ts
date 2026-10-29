import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  HttpError,
  NetworkError,
  ParseError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from "../../src/errors/index.js";
import { createTransport, type TransportOptions } from "../../src/transport/http.js";

const BASE = "https://api.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setup(options: TransportOptions = {}) {
  const sleep = vi.fn(async () => {});
  const transport = createTransport({ baseUrl: BASE, ...options }, { sleep, random: () => 1 });
  return { transport, sleep };
}

/** Registers a handler that answers from `responses` in order (last one repeats). */
function sequence(method: "get" | "post", path: string, responses: (() => Response)[]) {
  const counter = { calls: 0 };
  server.use(
    http[method](`${BASE}${path}`, () => {
      const make = responses[Math.min(counter.calls, responses.length - 1)]!;
      counter.calls++;
      return make();
    }),
  );
  return counter;
}

const status = (code: number, init?: ResponseInit & { body?: string }) => () =>
  new HttpResponse(init?.body ?? null, { status: code, ...init });

describe("createTransport request", () => {
  it("retries a 503 and succeeds", async () => {
    const onRetry = vi.fn();
    const { transport, sleep } = setup({ hooks: { onRetry } });
    const c = sequence("get", "/x", [status(503), () => HttpResponse.json({ ok: true })]);
    await expect(transport.request({ method: "GET", path: "/x" })).resolves.toEqual({ ok: true });
    expect(c.calls).toBe(2);
    expect(sleep).toHaveBeenCalledWith(500, undefined);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]![0]).toMatchObject({ attempt: 1, delayMs: 500 });
  });

  it("does not retry a 404", async () => {
    const { transport } = setup();
    const c = sequence("get", "/x", [status(404, { body: "nope" })]);
    const err = await transport.request({ method: "GET", path: "/x" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(404);
    expect(c.calls).toBe(1);
  });

  it("honors Retry-After seconds", async () => {
    const { transport, sleep } = setup();
    sequence("get", "/x", [
      status(429, { headers: { "Retry-After": "2" } }),
      () => HttpResponse.json({}),
    ]);
    await transport.request({ method: "GET", path: "/x" });
    expect(sleep).toHaveBeenCalledWith(2000, undefined);
  });

  it("throws RateLimitError after three 429s", async () => {
    const { transport } = setup();
    const c = sequence("get", "/x", [status(429, { headers: { "Retry-After": "1" } })]);
    const err = await transport.request({ method: "GET", path: "/x" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).retryAfterMs).toBe(1000);
    expect(c.calls).toBe(3);
  });

  it("fails immediately when Retry-After exceeds maxRetryAfterMs", async () => {
    const { transport, sleep } = setup();
    const c = sequence("get", "/x", [status(429, { headers: { "Retry-After": "86400" } })]);
    await expect(transport.request({ method: "GET", path: "/x" })).rejects.toBeInstanceOf(
      RateLimitError,
    );
    expect(c.calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("keeps a text/plain 429 body in bodySnippet", async () => {
    const { transport } = setup({ maxAttempts: 1 });
    sequence("get", "/x", [
      status(429, { body: "rate limit exceeded", headers: { "Content-Type": "text/plain" } }),
    ]);
    const err = (await transport
      .request({ method: "GET", path: "/x" })
      .catch((e: unknown) => e)) as RateLimitError;
    expect(err.bodySnippet).toBe("rate limit exceeded");
  });

  it("does not retry a 400 with empty body", async () => {
    const { transport } = setup();
    const c = sequence("get", "/x", [status(400)]);
    const err = (await transport
      .request({ method: "GET", path: "/x" })
      .catch((e: unknown) => e)) as HttpError;
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(400);
    expect(c.calls).toBe(1);
  });

  it("maps 422 to ValidationError", async () => {
    const { transport } = setup();
    sequence("get", "/x", [
      () =>
        HttpResponse.json(
          { detail: [{ loc: ["path", "lat"], msg: "bad", type: "value_error" }] },
          { status: 422 },
        ),
    ]);
    const err = (await transport
      .request({ method: "GET", path: "/x" })
      .catch((e: unknown) => e)) as ValidationError;
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.issues[0]!.loc).toEqual(["path", "lat"]);
  });

  it("throws ParseError for non-JSON and empty 2xx bodies, returns null for null", async () => {
    const { transport } = setup();
    sequence("get", "/a", [status(200, { body: "not json" })]);
    sequence("get", "/b", [status(201)]);
    sequence("get", "/c", [status(200, { body: "null" })]);
    await expect(transport.request({ method: "GET", path: "/a" })).rejects.toBeInstanceOf(
      ParseError,
    );
    await expect(transport.request({ method: "GET", path: "/b" })).rejects.toBeInstanceOf(
      ParseError,
    );
    await expect(transport.request({ method: "GET", path: "/c" })).resolves.toBeNull();
  });

  it("throws NetworkError after three network failures", async () => {
    const { transport } = setup();
    const c = sequence("get", "/x", [() => HttpResponse.error()]);
    await expect(transport.request({ method: "GET", path: "/x" })).rejects.toBeInstanceOf(
      NetworkError,
    );
    expect(c.calls).toBe(3);
  });

  it("throws TimeoutError when the server is too slow", async () => {
    const { transport } = setup({ timeoutMs: 20, maxAttempts: 1 });
    server.use(
      http.get(`${BASE}/x`, async () => {
        await delay(200);
        return HttpResponse.json({});
      }),
    );
    await expect(transport.request({ method: "GET", path: "/x" })).rejects.toBeInstanceOf(
      TimeoutError,
    );
  });

  it("rejects without a request when the signal is already aborted", async () => {
    const { transport } = setup();
    const c = sequence("get", "/x", [() => HttpResponse.json({})]);
    const ac = new AbortController();
    const reason = new Error("stop");
    ac.abort(reason);
    await expect(transport.request({ method: "GET", path: "/x", signal: ac.signal })).rejects.toBe(
      reason,
    );
    expect(c.calls).toBe(0);
  });

  it("rejects without a second request when aborted during sleep", async () => {
    const ac = new AbortController();
    const reason = new Error("stop");
    const sleep = vi.fn(async (_ms: number, signal?: AbortSignal) => {
      ac.abort(reason);
      throw signal?.reason;
    });
    const transport = createTransport({ baseUrl: BASE }, { sleep, random: () => 1 });
    const c = sequence("get", "/x", [status(503)]);
    await expect(transport.request({ method: "GET", path: "/x", signal: ac.signal })).rejects.toBe(
      reason,
    );
    expect(c.calls).toBe(1);
  });

  it("does not retry a POST with retry: false", async () => {
    const { transport } = setup();
    const c = sequence("post", "/x", [status(503)]);
    await expect(
      transport.request({ method: "POST", path: "/x", body: { a: 1 }, retry: false }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(c.calls).toBe(1);
  });

  it("sends a JSON body with content type and accept headers", async () => {
    const { transport } = setup();
    let seen: { body: unknown; contentType: string | null; accept: string | null } | undefined;
    server.use(
      http.post(`${BASE}/x`, async ({ request }) => {
        seen = {
          body: await request.json(),
          contentType: request.headers.get("content-type"),
          accept: request.headers.get("accept"),
        };
        return HttpResponse.json({});
      }),
    );
    await transport.request({ method: "POST", path: "/x", body: { planes: [1] } });
    expect(seen).toEqual({
      body: { planes: [1] },
      contentType: "application/json",
      accept: "application/json",
    });
  });

  it("sends the auth header but never leaks it to hooks or errors", async () => {
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    const onRetry = vi.fn();
    const { transport } = setup({
      auth: { header: "X-Api-Key", value: "secret-123" },
      hooks: { onRequest, onResponse, onRetry },
    });
    let key: string | null = null;
    server.use(
      http.get(`${BASE}/ok`, ({ request }) => {
        key = request.headers.get("x-api-key");
        return HttpResponse.json({});
      }),
    );
    await transport.request({ method: "GET", path: "/ok" });
    expect(key).toBe("secret-123");

    sequence("get", "/boom", [status(500, { body: "oops" })]);
    const err = (await transport
      .request({ method: "GET", path: "/boom" })
      .catch((e: unknown) => e)) as Error;
    const dump = JSON.stringify([
      onRequest.mock.calls,
      onResponse.mock.calls,
      onRetry.mock.calls.map(([i]) => ({ ...i, error: String(i.error) })),
      err.message,
    ]);
    expect(dump).not.toContain("secret-123");
    expect(onRequest).toHaveBeenCalled();
    expect(onResponse).toHaveBeenCalled();
  });

  it("calls an auth function with a Request and sends what it returns", async () => {
    const auth = vi.fn((request: Request) => {
      request.headers.set("Authorization", "Bearer fn-token");
      return request;
    });
    const { transport } = setup({ auth });
    let header: string | null = null;
    server.use(
      http.get(`${BASE}/x`, ({ request }) => {
        header = request.headers.get("authorization");
        return HttpResponse.json({});
      }),
    );
    await transport.request({ method: "GET", path: "/x" });
    expect(auth.mock.calls[0]![0]).toBeInstanceOf(Request);
    expect(header).toBe("Bearer fn-token");
  });

  it("trims a trailing slash from baseUrl", async () => {
    const { transport } = setup({ baseUrl: `${BASE}/` });
    sequence("get", "/v2/x", [() => HttpResponse.json({ ok: 1 })]);
    await expect(transport.request({ method: "GET", path: "/v2/x" })).resolves.toEqual({ ok: 1 });
  });
});
