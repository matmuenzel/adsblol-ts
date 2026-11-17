import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse, type JsonBodyType } from "msw";
import { setupServer } from "msw/node";
import { AdsbLol } from "../../src/client/AdsbLol.js";
import { HttpError, ParseError, ValidationError } from "../../src/errors/index.js";
import { fixtures, reApiKeyRequiredBody } from "../fixtures/index.js";

const BASE = "https://api.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** Answers every GET with `body` and records the requested pathnames. */
function record(body: JsonBodyType): string[] {
  const paths: string[] = [];
  server.use(
    http.get(`${BASE}/*`, ({ request }) => {
      paths.push(new URL(request.url).pathname);
      return HttpResponse.json(body);
    }),
  );
  return paths;
}

const client = () => new AdsbLol({ baseUrl: BASE });

describe("AdsbLol aircraft", () => {
  const cases: Array<[string, (c: AdsbLol) => Promise<unknown>, string]> = [
    ["byHex", (c) => c.aircraft.byHex("4CA87C"), "/v2/hex/4ca87c"],
    ["byHex with ~", (c) => c.aircraft.byHex("~2c1a3b"), "/v2/hex/~2c1a3b"],
    ["byCallsign", (c) => c.aircraft.byCallsign("UAL958  "), "/v2/callsign/UAL958"],
    ["byRegistration", (c) => c.aircraft.byRegistration("G-KELS"), "/v2/reg/G-KELS"],
    ["byType", (c) => c.aircraft.byType("A320"), "/v2/type/A320"],
    ["bySquawk", (c) => c.aircraft.bySquawk("7700"), "/v2/sqk/7700"],
    [
      "near",
      (c) => c.aircraft.near({ lat: 51.47, lon: -0.45, radiusNm: 10 }),
      "/v2/point/51.47/-0.45/10",
    ],
    ["military", (c) => c.aircraft.military(), "/v2/mil"],
    ["pia", (c) => c.aircraft.pia(), "/v2/pia"],
    ["ladd", (c) => c.aircraft.ladd(), "/v2/ladd"],
  ];

  it.each(cases)("%s hits its path", async (_name, call, path) => {
    const paths = record(fixtures.point);
    const res = (await call(client())) as { ac: unknown[] };
    expect(paths).toEqual([path]);
    expect(Array.isArray(res.ac)).toBe(true);
  });

  it("closest returns the first aircraft", async () => {
    const paths = record(fixtures.closest);
    const ac = await client().aircraft.closest({ lat: 51.47, lon: -0.45, radiusNm: 5 });
    expect(paths).toEqual(["/v2/closest/51.47/-0.45/5"]);
    expect(ac?.hex).toBe(fixtures.closest.ac[0]!.hex);
  });

  it("closest returns null for an empty result", async () => {
    record(fixtures.empty);
    await expect(client().aircraft.closest({ lat: 0, lon: 0, radiusNm: 5 })).resolves.toBeNull();
  });

  it("encodes path parameters", async () => {
    const paths = record(fixtures.empty);
    await client().aircraft.byRegistration("A B/C");
    expect(paths).toEqual(["/v2/reg/A%20B%2FC"]);
  });

  it("rejects invalid input without sending a request", async () => {
    const paths = record(fixtures.empty);
    const c = client();
    await expect(c.aircraft.near({ lat: 51, lon: 0, radiusNm: 300 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(c.aircraft.near({ lat: NaN, lon: 0, radiusNm: 10 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(c.aircraft.closest({ lat: 0, lon: 999, radiusNm: 10 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(c.aircraft.bySquawk("7800")).rejects.toBeInstanceOf(ValidationError);
    await expect(c.aircraft.byHex("xyz")).rejects.toBeInstanceOf(ValidationError);
    expect(paths).toEqual([]);
  });

  it("rejects dot segments without sending a request", async () => {
    const paths = record(fixtures.empty);
    const c = client();
    await expect(c.aircraft.byCallsign("..")).rejects.toBeInstanceOf(ValidationError);
    await expect(c.aircraft.byRegistration(".")).rejects.toBeInstanceOf(ValidationError);
    await expect(c.aircraft.byType("..")).rejects.toBeInstanceOf(ValidationError);
    await expect(c.aircraft.byType(" .. ")).rejects.toBeInstanceOf(ValidationError);
    expect(paths).toEqual([]);
  });

  it("rejects a non-object query with a ValidationError", async () => {
    const paths = record(fixtures.empty);
    const c = client();
    await expect(c.aircraft.near(undefined as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(c.aircraft.near(null as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(c.aircraft.closest("x" as never)).rejects.toBeInstanceOf(ValidationError);
    expect(paths).toEqual([]);
  });

  it("uses the configured base URL", async () => {
    let seen = "";
    server.use(
      http.get("http://localhost:1234/v2/mil", ({ request }) => {
        seen = request.url;
        return HttpResponse.json(fixtures.mil);
      }),
    );
    await new AdsbLol({ baseUrl: "http://localhost:1234" }).aircraft.military();
    expect(seen).toBe("http://localhost:1234/v2/mil");
  });
});

describe("AdsbLol airports", () => {
  it("gets an airport with a normalized ICAO", async () => {
    const paths = record(fixtures.airportEgll);
    const airport = await client().airports.get("egll");
    expect(paths).toEqual(["/api/0/airport/EGLL"]);
    expect(airport?.name).toBe("London Heathrow Airport");
  });

  it("returns null when the API answers null", async () => {
    record(null);
    await expect(client().airports.get("ZZZZ")).resolves.toBeNull();
  });

  it("rejects an invalid ICAO without a request", async () => {
    const paths = record(null);
    await expect(client().airports.get("EG")).rejects.toBeInstanceOf(ValidationError);
    expect(paths).toEqual([]);
  });
});

describe("AdsbLol receiver", () => {
  it("fetches /0/me", async () => {
    const paths = record(fixtures.me);
    const me = await client().receiver.me();
    expect(paths).toEqual(["/0/me"]);
    expect(me).toEqual(fixtures.me);
  });
});

describe("AdsbLol request options", () => {
  it("forwards the abort signal", async () => {
    const paths = record(fixtures.empty);
    const ctrl = new AbortController();
    ctrl.abort(new Error("stop"));
    await expect(client().aircraft.military({ signal: ctrl.signal })).rejects.toThrow("stop");
    expect(paths).toEqual([]);
  });
});

describe("AdsbLol traces", () => {
  it("trace hits the full path and parses the trace", async () => {
    const paths = record(fixtures.traceFull);
    const trace = await client().aircraft.trace("486802".toUpperCase());
    expect(paths).toEqual(["/1/trace/full/486802"]);
    expect(trace?.hex).toBe(fixtures.traceFull.icao);
    expect(trace?.points.length).toBe(fixtures.traceFull.trace.length);
  });

  it("recentTrace hits the recent path", async () => {
    const paths = record(fixtures.traceRecent);
    const trace = await client().aircraft.recentTrace(" 486802 ");
    expect(paths).toEqual(["/1/trace/recent/486802"]);
    expect(trace?.points.length).toBe(fixtures.traceRecent.trace.length);
  });

  it.each(["trace", "recentTrace"] as const)("%s returns null on 404 without retry", async (m) => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/*`, () => {
        calls++;
        return new HttpResponse("<html>not found</html>", {
          status: 404,
          headers: { "content-type": "text/html" },
        });
      }),
    );
    await expect(client().aircraft[m]("000000")).resolves.toBeNull();
    expect(calls).toBe(1);
  });

  it("returns null on a 404 with an empty body", async () => {
    server.use(http.get(`${BASE}/*`, () => new HttpResponse(null, { status: 404 })));
    await expect(client().aircraft.trace("000000")).resolves.toBeNull();
  });

  it.each(["~2c1a3b", "xyz", "", "12345", "1234567"])(
    "trace rejects %j without a request",
    async (hex) => {
      const paths = record(fixtures.traceFull);
      await expect(client().aircraft.trace(hex)).rejects.toBeInstanceOf(ValidationError);
      await expect(client().aircraft.recentTrace(hex)).rejects.toBeInstanceOf(ValidationError);
      expect(paths).toEqual([]);
    },
  );

  it("retries a 500 and then succeeds", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/*`, () => {
        calls++;
        return calls === 1
          ? new HttpResponse("boom", { status: 500 })
          : HttpResponse.json(fixtures.traceRecent);
      }),
    );
    const c = new AdsbLol({ baseUrl: BASE, baseDelayMs: 1, maxDelayMs: 1 });
    const trace = await c.aircraft.recentTrace("486802");
    expect(trace?.hex).toBe("486802");
    expect(calls).toBe(2);
  });

  it.each([null, {}, [], "x", { icao: "486802", timestamp: 1, trace: "no" }])(
    "throws ParseError for a 200 with the non-trace body %j",
    async (body) => {
      record(body as JsonBodyType);
      const err = await client()
        .aircraft.trace("486802")
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).message).toBe("Unexpected trace response");
    },
  );

  it("propagates other HTTP errors", async () => {
    server.use(http.get(`${BASE}/*`, () => new HttpResponse("no", { status: 401 })));
    await expect(client().aircraft.trace("486802")).rejects.toMatchObject({ status: 401 });
  });
});

describe("AdsbLol reApi", () => {
  const RE = "https://re-api.adsb.lol";

  /** Answers every GET on `origin` with `body` and records the full request URLs. */
  function recordAt(origin: string, body: JsonBodyType): string[] {
    const urls: string[] = [];
    server.use(
      http.get(`${origin}/*`, ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(body);
      }),
    );
    return urls;
  }

  it("circle hits the re-api host while aircraft.near stays on the API host", async () => {
    const reUrls = recordAt(RE, fixtures.point);
    const apiPaths = record(fixtures.point);
    const c = client();
    const res = await c.reApi.circle({ lat: 51.47, lon: -0.45, radiusNm: 10 });
    expect(reUrls).toEqual([`${RE}/?circle=51.47,-0.45,10&jv2`]);
    expect(res.ac.length).toBe(fixtures.point.ac.length);
    await c.aircraft.near({ lat: 51.47, lon: -0.45, radiusNm: 10 });
    expect(apiPaths).toEqual(["/v2/point/51.47/-0.45/10"]);
    expect(reUrls).toHaveLength(1);
  });

  it("uses reApiBaseUrl", async () => {
    const urls = recordAt("http://localhost:1234", fixtures.point);
    const c = new AdsbLol({ baseUrl: BASE, reApiBaseUrl: "http://localhost:1234" });
    await c.reApi.all({ withPosition: true });
    expect(urls).toEqual(["http://localhost:1234/?all_with_pos&jv2"]);
  });

  it("applies filters and the other query kinds", async () => {
    const urls = recordAt(RE, fixtures.point);
    const c = client();
    await c.reApi.circle({ lat: 1, lon: 2, radiusNm: 3 }, { military: true });
    await c.reApi.box({ south: 1, north: 2, west: 3, east: 4 });
    await c.reApi.all();
    await c.reApi.findHex(["4CA87C", "485a2b"]);
    await c.reApi.findCallsign(["UAL958"]);
    await c.reApi.findRegistration(["G-KELS"]);
    await c.reApi.findType(["A320"]);
    await c.reApi.findSquawk(["7700"]);
    expect(urls.map((u) => u.slice(RE.length))).toEqual([
      "/?circle=1,2,3&filter_mil&jv2",
      "/?box=1,2,3,4&jv2",
      "/?all&jv2",
      "/?find_hex=4ca87c,485a2b&jv2",
      "/?find_callsign=UAL958&jv2",
      "/?find_reg=G-KELS&jv2",
      "/?find_type=A320&jv2",
      "/?find_squawk=7700&jv2",
    ]);
  });

  it("sends the api key and redirect=error on both hosts", async () => {
    const seen: Array<{ url: string; key: string | null; redirect: string }> = [];
    const spy = (input: Request) => {
      seen.push({
        url: input.url,
        key: input.headers.get("x-api-key"),
        redirect: input.redirect,
      });
      return Promise.resolve(Response.json(fixtures.point));
    };
    const c = new AdsbLol({
      baseUrl: BASE,
      apiKey: "sk-lol-test-key",
      fetch: spy as unknown as typeof fetch,
    });
    await c.aircraft.military();
    await c.reApi.all();
    expect(seen).toHaveLength(2);
    expect(seen[0]!.url.startsWith(BASE)).toBe(true);
    expect(seen[1]!.url.startsWith(RE)).toBe(true);
    for (const s of seen) {
      expect(s.key).toBe("sk-lol-test-key");
      expect(s.redirect).toBe("error");
    }
  });

  it("sends the key only to the override host and the main host, never to re-api.adsb.lol", async () => {
    const seen: Array<{ url: string; key: string | null }> = [];
    const spy = (input: Request) => {
      seen.push({ url: input.url, key: input.headers.get("x-api-key") });
      return Promise.resolve(Response.json(fixtures.point));
    };
    const c = new AdsbLol({
      baseUrl: BASE,
      reApiBaseUrl: "http://localhost:1234",
      apiKey: "sk-lol-test-key",
      fetch: spy as unknown as typeof fetch,
    });
    await c.aircraft.military();
    await c.reApi.all();
    expect(seen.map((s) => new URL(s.url).origin)).toEqual([BASE, "http://localhost:1234"]);
    expect(seen.some((s) => s.url.startsWith(RE))).toBe(false);
    for (const s of seen) expect(s.key).toBe("sk-lol-test-key");
  });

  it("does not pass reApiBaseUrl to the main transport", async () => {
    const paths = record(fixtures.point);
    const c = new AdsbLol({ baseUrl: BASE, reApiBaseUrl: "http://localhost:1234" });
    await c.aircraft.military();
    expect(paths).toEqual(["/v2/mil"]);
  });

  it("401 api key required surfaces as HttpError without retry or key leak", async () => {
    let calls = 0;
    server.use(
      http.get(`${RE}/*`, () => {
        calls++;
        return new HttpResponse(reApiKeyRequiredBody, {
          status: 401,
          headers: { "content-type": "text/plain" },
        });
      }),
    );
    const c = new AdsbLol({ baseUrl: BASE, apiKey: "sk-lol-test-key" });
    const err = await c.reApi.circle({ lat: 1, lon: 2, radiusNm: 3 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(401);
    expect(calls).toBe(1);
    const e = err as HttpError;
    const dump = [e.message, String(e), JSON.stringify(e), String(e.cause)].join("\n");
    expect(dump).not.toContain("sk-lol-test-key");
  });

  it("closest returns the first aircraft, or null for an empty list", async () => {
    const urls = recordAt(RE, fixtures.closest);
    const ac = await client().reApi.closest({ lat: 51.47, lon: -0.45, radiusNm: 5 });
    expect(urls).toEqual([`${RE}/?closest=51.47,-0.45,5&jv2`]);
    expect(ac?.hex).toBe(fixtures.closest.ac[0]!.hex);
    server.resetHandlers();
    recordAt(RE, fixtures.empty);
    await expect(
      client().reApi.closest({ lat: 51.47, lon: -0.45, radiusNm: 5 }),
    ).resolves.toBeNull();
  });

  it("throws ParseError when the response has no ac array", async () => {
    recordAt(RE, {});
    const err = await client()
      .reApi.closest({ lat: 51.47, lon: -0.45, radiusNm: 5 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ParseError);
    expect((err as ParseError).message).toBe("Unexpected re-api response");
    await expect(client().reApi.all()).rejects.toBeInstanceOf(ParseError);
  });

  it("findHex([]) rejects with ValidationError and makes no request", async () => {
    const urls = recordAt(RE, fixtures.point);
    await expect(client().reApi.findHex([])).rejects.toBeInstanceOf(ValidationError);
    expect(urls).toEqual([]);
  });
});
