import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse, type JsonBodyType } from "msw";
import { setupServer } from "msw/node";
import { AdsbLol } from "../../src/client/AdsbLol.js";
import { ValidationError } from "../../src/errors/index.js";
import { fixtures } from "../fixtures/index.js";

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
