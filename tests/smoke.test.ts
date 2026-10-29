import { expect, it } from "vitest";
import * as lib from "../src/index.js";

it("exports the public API", () => {
  const keys = Object.keys(lib);
  expect(keys).toContain("AdsbLol");
  expect(keys).toContain("HttpError");
  expect(keys).toContain("isOnGround");
});

it("does not export internal validators", () => {
  const keys = Object.keys(lib);
  for (const name of [
    "assertLat",
    "assertLon",
    "assertRadiusNm",
    "normalizeHex",
    "assertSquawk",
    "normalizeCallsign",
    "normalizeRegistration",
    "normalizeAircraftType",
    "normalizeAirportIcao",
    "pathSegment",
  ]) {
    expect(keys).not.toContain(name);
  }
});
