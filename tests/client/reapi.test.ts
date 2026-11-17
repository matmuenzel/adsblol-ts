import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors/index.js";
import { buildReApiQuery, type ReApiBase, type ReApiFilter } from "../../src/client/reapi.js";

/** Asserts that building the query throws a client ValidationError located in the query. */
function expectQueryError(base: ReApiBase, filter: ReApiFilter | undefined, param: string): void {
  let err: unknown;
  try {
    buildReApiQuery(base, filter);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ValidationError);
  const ve = err as ValidationError;
  expect(ve.status).toBeUndefined();
  expect(ve.issues[0]?.loc).toEqual(["query", param]);
  expect(ve.issues[0]?.type).toBe("client_validation");
}

describe("buildReApiQuery base queries", () => {
  it("builds circle and closest", () => {
    expect(buildReApiQuery({ kind: "circle", lat: 51.47, lon: -0.45, radiusNm: 10 })).toBe(
      "/?circle=51.47,-0.45,10&jv2",
    );
    expect(buildReApiQuery({ kind: "closest", lat: 51.47, lon: -0.45, radiusNm: 10 })).toBe(
      "/?closest=51.47,-0.45,10&jv2",
    );
  });

  it("builds box, also across the antimeridian", () => {
    expect(buildReApiQuery({ kind: "box", box: { south: 51, north: 52, west: -1, east: 0 } })).toBe(
      "/?box=51,52,-1,0&jv2",
    );
    expect(
      buildReApiQuery({ kind: "box", box: { south: 10, north: 20, west: 170, east: -170 } }),
    ).toBe("/?box=10,20,170,-170&jv2");
  });

  it("builds all and all_with_pos", () => {
    expect(buildReApiQuery({ kind: "all", withPosition: false })).toBe("/?all&jv2");
    expect(buildReApiQuery({ kind: "all", withPosition: true })).toBe("/?all_with_pos&jv2");
  });

  it("builds find queries with a literal comma and normalized values", () => {
    expect(buildReApiQuery({ kind: "find_hex", values: ["4CA87C", "~2c1a3b"] })).toBe(
      "/?find_hex=4ca87c,~2c1a3b&jv2",
    );
    expect(buildReApiQuery({ kind: "find_callsign", values: [" UAL958 ", "BAW1"] })).toBe(
      "/?find_callsign=UAL958,BAW1&jv2",
    );
    expect(buildReApiQuery({ kind: "find_reg", values: ["G-KELS"] })).toBe("/?find_reg=G-KELS&jv2");
    expect(buildReApiQuery({ kind: "find_type", values: ["A320"] })).toBe("/?find_type=A320&jv2");
    expect(buildReApiQuery({ kind: "find_squawk", values: ["7700", "7600"] })).toBe(
      "/?find_squawk=7700,7600&jv2",
    );
  });

  it("percent-encodes values", () => {
    expect(buildReApiQuery({ kind: "find_callsign", values: ["A B/C"] })).toBe(
      "/?find_callsign=A%20B%2FC&jv2",
    );
  });
});

describe("buildReApiQuery filters", () => {
  it("emits filters in the fixed field order", () => {
    expect(
      buildReApiQuery(
        { kind: "all", withPosition: false },
        { military: true, belowAltBaroFt: 10000, withPosition: true },
      ),
    ).toBe("/?all&filter_with_pos&below_alt_baro=10000&filter_mil&jv2");
  });

  it("emits every filter", () => {
    expect(
      buildReApiQuery(
        { kind: "all", withPosition: false },
        {
          callsignExact: ["UAL958", "BAW1"],
          callsignPrefix: "UAL",
          squawks: ["7700"],
          types: ["A320", "B738"],
          withPosition: true,
          aboveAltBaroFt: 5000,
          belowAltBaroFt: 40000,
          military: true,
          pia: true,
          ladd: true,
        },
      ),
    ).toBe(
      "/?all&filter_callsign_exact=UAL958,BAW1&filter_callsign_prefix=UAL&filter_squawk=7700" +
        "&filter_type=A320,B738&filter_with_pos&above_alt_baro=5000&below_alt_baro=40000" +
        "&filter_mil&filter_pia&filter_ladd&jv2",
    );
  });

  it("emits nothing for false flags and empty filters", () => {
    expect(
      buildReApiQuery(
        { kind: "all", withPosition: false },
        { military: false, pia: false, ladd: false, withPosition: false },
      ),
    ).toBe("/?all&jv2");
    expect(buildReApiQuery({ kind: "all", withPosition: false }, {})).toBe("/?all&jv2");
  });

  it("accepts negative and zero altitudes", () => {
    expect(
      buildReApiQuery(
        { kind: "all", withPosition: false },
        { aboveAltBaroFt: -500, belowAltBaroFt: 0 },
      ),
    ).toBe("/?all&above_alt_baro=-500&below_alt_baro=0&jv2");
  });
});

describe("buildReApiQuery validation", () => {
  const all: ReApiBase = { kind: "all", withPosition: false };

  it("rejects empty lists and lists over 1000 values", () => {
    expectQueryError({ kind: "find_hex", values: [] }, undefined, "values");
    const many = Array.from({ length: 1001 }, () => "4ca87c");
    expectQueryError({ kind: "find_hex", values: many }, undefined, "values");
    expect(
      buildReApiQuery({ kind: "find_hex", values: many.slice(0, 1000) }).startsWith("/?find_hex="),
    ).toBe(true);
  });

  it("rejects non-array lists", () => {
    expectQueryError(
      { kind: "find_hex", values: "4ca87c" as unknown as string[] },
      undefined,
      "values",
    );
  });

  it("rejects separators and empty values", () => {
    expectQueryError({ kind: "find_callsign", values: ["A,B"] }, undefined, "callsign");
    expectQueryError({ kind: "find_callsign", values: ["A&B"] }, undefined, "callsign");
    expectQueryError({ kind: "find_callsign", values: ["A=B"] }, undefined, "callsign");
    expectQueryError({ kind: "find_reg", values: ["A#B"] }, undefined, "registration");
    expectQueryError({ kind: "find_callsign", values: [""] }, undefined, "callsign");
    expectQueryError({ kind: "find_type", values: ["  "] }, undefined, "type");
  });

  it("applies the per-kind validators with query location", () => {
    expectQueryError({ kind: "find_hex", values: ["xyz"] }, undefined, "hex");
    expectQueryError({ kind: "find_squawk", values: ["7800"] }, undefined, "squawk");
  });

  it("validates circle coordinates and radius", () => {
    expectQueryError({ kind: "circle", lat: 91, lon: 0, radiusNm: 1 }, undefined, "lat");
    expectQueryError({ kind: "closest", lat: 0, lon: 181, radiusNm: 1 }, undefined, "lon");
    expectQueryError({ kind: "circle", lat: 0, lon: 0, radiusNm: 251 }, undefined, "radiusNm");
    expectQueryError({ kind: "circle", lat: 0, lon: 0, radiusNm: -1 }, undefined, "radiusNm");
  });

  it("validates box bounds", () => {
    expectQueryError(
      { kind: "box", box: { south: 52, north: 51, west: 0, east: 1 } },
      undefined,
      "south",
    );
    expectQueryError(
      { kind: "box", box: { south: -91, north: 51, west: 0, east: 1 } },
      undefined,
      "south",
    );
    expectQueryError(
      { kind: "box", box: { south: 1, north: 2, west: 0, east: 181 } },
      undefined,
      "east",
    );
    expectQueryError(
      { kind: "box", box: { south: 1, north: 2, west: Number.NaN, east: 1 } },
      undefined,
      "west",
    );
  });

  it("rejects holes in sparse lists", () => {
    const sparse = new Array<string>(3);
    expect(() => buildReApiQuery({ kind: "find_hex", values: sparse })).toThrow(ValidationError);
  });

  it("requires whole feet for altitude filters", () => {
    expectQueryError(all, { belowAltBaroFt: 1.5 }, "belowAltBaroFt");
    expectQueryError(all, { aboveAltBaroFt: 1e21 }, "aboveAltBaroFt");
  });

  it("validates filters", () => {
    expectQueryError(all, { belowAltBaroFt: Number.POSITIVE_INFINITY }, "belowAltBaroFt");
    expectQueryError(all, { aboveAltBaroFt: Number.NaN }, "aboveAltBaroFt");
    expectQueryError(all, { callsignPrefix: "" }, "callsignPrefix");
    expectQueryError(all, { callsignPrefix: "A,B" }, "callsignPrefix");
    expectQueryError(all, { callsignExact: [] }, "callsignExact");
    expectQueryError(all, { squawks: ["9999"] }, "squawk");
    expectQueryError(all, { types: ["A,B"] }, "type");
  });
});
