import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors/index.js";
import {
  assertLat,
  assertLon,
  assertRadiusNm,
  assertSquawk,
  normalizeAircraftType,
  normalizeAirportIcao,
  normalizeCallsign,
  normalizeHex,
  normalizeRegistration,
  pathSegment,
} from "../../src/client/validate.js";

/** Runs `fn` and returns the thrown value, or fails the test if nothing was thrown. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("expected function to throw");
}

/** Asserts that `fn` throws a ValidationError for `param` with status undefined. */
function expectValidationError(fn: () => unknown, param: string): void {
  const err = thrownBy(fn);
  expect(err).toBeInstanceOf(ValidationError);
  const validationError = err as ValidationError;
  expect(validationError.status).toBeUndefined();
  expect(validationError.issues).toHaveLength(1);
  expect(validationError.issues[0]).toEqual({
    loc: ["path", param],
    msg: expect.any(String),
    type: "client_validation",
  });
}

describe("assertLat", () => {
  it.each([90, -90, 0, 51.4706])("accepts %s", (lat) => {
    expect(assertLat(lat)).toBe(lat);
  });

  it.each([
    90.0001,
    -90.0001,
    NaN,
    Infinity,
    -Infinity,
    "51" as unknown as number,
    null as unknown as number,
  ])("rejects %s with a ValidationError for lat", (lat) => {
    expectValidationError(() => assertLat(lat), "lat");
  });
});

describe("assertLon", () => {
  it.each([180, -180, 0, 8.5706])("accepts %s", (lon) => {
    expect(assertLon(lon)).toBe(lon);
  });

  it.each([
    180.0001,
    -180.0001,
    NaN,
    Infinity,
    -Infinity,
    "8" as unknown as number,
    undefined as unknown as number,
  ])("rejects %s with a ValidationError for lon", (lon) => {
    expectValidationError(() => assertLon(lon), "lon");
  });
});

describe("assertRadiusNm", () => {
  it.each([0, 250, 10])("accepts %s", (radiusNm) => {
    expect(assertRadiusNm(radiusNm)).toBe(radiusNm);
  });

  it.each([250.5, 10.5, 0.1, -1, 251, NaN, "5" as unknown as number])(
    "rejects %s with a ValidationError for radiusNm",
    (radiusNm) => {
      expectValidationError(() => assertRadiusNm(radiusNm), "radiusNm");
    },
  );
});

describe("normalizeHex", () => {
  it("trims and lowercases a plain hex code", () => {
    expect(normalizeHex(" 4CA87C ")).toBe("4ca87c");
  });

  it("keeps the leading tilde of a non-ICAO address", () => {
    expect(normalizeHex("~2C1A3B")).toBe("~2c1a3b");
  });

  it.each(["4ca87", "4ca87g", "", "~4ca87", "4ca87c0"])("rejects %j", (hex) => {
    expectValidationError(() => normalizeHex(hex), "hex");
  });

  it("rejects a non-string runtime value", () => {
    expectValidationError(() => normalizeHex(42 as unknown as string), "hex");
  });
});

describe("assertSquawk", () => {
  it("accepts a valid squawk", () => {
    expect(assertSquawk("7700")).toBe("7700");
  });

  it.each(["7800", "770", "abcd", "00000"])("rejects %j", (squawk) => {
    expectValidationError(() => assertSquawk(squawk), "squawk");
  });

  it("rejects a non-string runtime value", () => {
    expectValidationError(() => assertSquawk(7700 as unknown as string), "squawk");
  });
});

describe("normalizeCallsign", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeCallsign("UAL958  ")).toBe("UAL958");
  });

  it("rejects a blank value", () => {
    expectValidationError(() => normalizeCallsign("   "), "callsign");
  });

  it("rejects a non-string runtime value", () => {
    expectValidationError(() => normalizeCallsign(null as unknown as string), "callsign");
  });
});

describe("normalizeRegistration", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeRegistration(" G-KELS ")).toBe("G-KELS");
  });

  it("rejects a blank value", () => {
    expectValidationError(() => normalizeRegistration(""), "registration");
  });
});

describe("normalizeAircraftType", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeAircraftType(" A320 ")).toBe("A320");
  });

  it("rejects a blank value", () => {
    expectValidationError(() => normalizeAircraftType("  "), "type");
  });
});

describe("normalizeAirportIcao", () => {
  it("trims and uppercases a valid ICAO code", () => {
    expect(normalizeAirportIcao(" egll ")).toBe("EGLL");
    expect(normalizeAirportIcao("egll")).toBe("EGLL");
  });

  it.each(["EGL", "EGLLL", "EG-L", ""])("rejects %j", (icao) => {
    expectValidationError(() => normalizeAirportIcao(icao), "icao");
  });
});

describe("pathSegment", () => {
  it("returns a plain registration unchanged", () => {
    expect(pathSegment("G-KELS")).toBe("G-KELS");
  });

  it("percent-encodes spaces and slashes", () => {
    expect(pathSegment("A B/C")).toBe("A%20B%2FC");
  });

  it("stringifies numbers before encoding", () => {
    expect(pathSegment(1234)).toBe("1234");
  });
});
