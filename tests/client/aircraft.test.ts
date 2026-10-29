import { describe, expect, it } from "vitest";
import {
  DbFlag,
  altitudeFt,
  callsign,
  isLadd,
  isMilitary,
  isOnGround,
  isPia,
  toDate,
} from "../../src/client/aircraft.js";
import type { Aircraft } from "../../src/client/types.js";
import { fixtures } from "../fixtures/index.js";

const point = fixtures.point.ac as unknown as Aircraft[];
const [airborne, grounded, noFlight] = point as [Aircraft, Aircraft, Aircraft];

describe("DbFlag", () => {
  it("has the observed bit values", () => {
    expect(DbFlag).toEqual({ Military: 1, Pia: 4, Ladd: 8 });
  });
});

describe("callsign", () => {
  it("trims the padded flight", () => {
    expect(callsign(airborne)).toBe("BAW548");
  });
  it("returns undefined for blank or missing flight", () => {
    expect(callsign({ ...airborne, flight: "        " })).toBeUndefined();
    expect(callsign(noFlight)).toBeUndefined();
  });
});

describe("altitude and ground", () => {
  it("handles the ground aircraft", () => {
    expect(isOnGround(grounded)).toBe(true);
    expect(altitudeFt(grounded)).toBeUndefined();
  });
  it("handles the airborne aircraft", () => {
    expect(isOnGround(airborne)).toBe(false);
    expect(altitudeFt(airborne)).toBe(airborne.alt_baro);
  });
  it("returns undefined for a missing altitude", () => {
    expect(altitudeFt({})).toBeUndefined();
    // guards against unexpected nulls from the server
    expect(altitudeFt({ alt_baro: null } as never)).toBeUndefined();
  });
});

describe("dbFlags helpers", () => {
  it("detect military, ladd and pia", () => {
    const mil = fixtures.mil.ac as unknown as Aircraft[];
    const ladd = fixtures.ladd.ac as unknown as Aircraft[];
    const pia = fixtures.pia.ac as unknown as Aircraft[];
    expect(mil.length).toBeGreaterThan(0);
    expect(ladd.length).toBeGreaterThan(0);
    expect(pia.length).toBeGreaterThan(0);
    expect(mil.every(isMilitary)).toBe(true);
    expect(ladd.every(isLadd)).toBe(true);
    expect(pia.every(isPia)).toBe(true);
  });
  it("are all false for a plain aircraft", () => {
    expect(isMilitary(airborne)).toBe(false);
    expect(isPia(airborne)).toBe(false);
    expect(isLadd(airborne)).toBe(false);
  });
});

describe("toDate", () => {
  it("converts milliseconds since epoch", () => {
    expect(toDate(fixtures.point.now).getUTCFullYear()).toBe(2026);
  });
});
