import { describe, expect, it } from "vitest";
import { fixtures } from "./fixtures/index.js";

describe("fixtures", () => {
  it("loads every fixture as an object", () => {
    for (const value of Object.values(fixtures)) {
      expect(value).toBeTypeOf("object");
    }
  });

  it("point has 3 aircraft, one of them on the ground", () => {
    expect(fixtures.point.ac).toHaveLength(3);
    expect(fixtures.point.ac.some((a) => a.alt_baro === "ground")).toBe(true);
  });

  it("me has anonymized client identifiers", () => {
    expect(fixtures.me.clients.beast[0]?.ip).toBe("192.0.2.1");
    expect(fixtures.me.clients.mlat[0]?.user).toBe("example");
  });
});
