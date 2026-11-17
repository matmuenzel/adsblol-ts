import { describe, expect, it } from "vitest";
import { parseTrace } from "../../src/client/trace.js";
import type { RawTrace, RawTracePoint } from "../../src/client/trace.js";
import { fixtures } from "../fixtures/index.js";

const recent = fixtures.traceRecent as unknown as RawTrace;
const full = fixtures.traceFull as unknown as RawTrace;

function synthetic(points: RawTracePoint[]): RawTrace {
  return { icao: "abcdef", timestamp: 1000.5, trace: points };
}

describe("parseTrace", () => {
  it("translates every point of the recent fixture", () => {
    const trace = parseTrace(recent);
    expect(trace.hex).toBe(recent.icao);
    expect(trace.points).toHaveLength(recent.trace.length);
    const first = trace.points[0]!;
    expect(first.time).toBe(Math.round((recent.timestamp + recent.trace[0]![0]) * 1000));
    expect(first.lat).toBe(recent.trace[0]![1]);
    expect(first.lon).toBe(recent.trace[0]![2]);
    expect(trace.startTime).toBe(Math.round(recent.timestamp * 1000));
  });

  it("translates the full fixture", () => {
    expect(parseTrace(full).points).toHaveLength(full.trace.length);
  });

  it("maps header fields and leaves absent ones undefined", () => {
    const trace = parseTrace({
      icao: "abcdef",
      timestamp: 1,
      trace: [],
      r: "G-TEST",
      t: "A320",
      desc: "AIRBUS A-320",
      ownOp: "Test Air",
      year: "2010",
      version: "readsb 3.16.15",
      dbFlags: 1,
    });
    expect(trace).toMatchObject({
      hex: "abcdef",
      registration: "G-TEST",
      type: "A320",
      description: "AIRBUS A-320",
      ownerOperator: "Test Air",
      year: "2010",
      version: "readsb 3.16.15",
      dbFlags: 1,
      points: [],
    });
    const bare = parseTrace(synthetic([]));
    expect(bare.registration).toBeUndefined();
    expect(bare.version).toBeUndefined();
    expect(bare.dbFlags).toBeUndefined();
  });

  it("decodes each flag bit", () => {
    const p = parseTrace(synthetic([[0, 1, 2, 1000, 100, 90, 0b1011, 0]])).points[0]!;
    expect(p.stale).toBe(true);
    expect(p.newLeg).toBe(true);
    expect(p.geometricVerticalRate).toBe(false);
    expect(p.geometricAltitude).toBe(true);
    const q = parseTrace(synthetic([[0, 1, 2, 1000, 100, 90, 4, 0]])).points[0]!;
    expect([q.stale, q.newLeg, q.geometricVerticalRate, q.geometricAltitude]).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });

  it("handles 8-entry points with nulls", () => {
    const p = parseTrace(synthetic([[0, 1, 2, null, null, null, 0, null]])).points[0]!;
    expect(p.altitudeFt).toBeUndefined();
    expect(p.groundSpeedKt).toBeUndefined();
    expect(p.trackDeg).toBeUndefined();
    expect(p.verticalRateFpm).toBeUndefined();
    expect(p.details).toBeUndefined();
    expect(p.source).toBeUndefined();
    expect(p.geomAltitudeFt).toBeUndefined();
    expect(p.iasKt).toBeUndefined();
    expect(p.rollDeg).toBeUndefined();
  });

  it("keeps ground altitude", () => {
    const p = parseTrace(synthetic([[0, 1, 2, "ground", 5, 10, 0, 0]])).points[0]!;
    expect(p.altitudeFt).toBe("ground");
  });

  it("maps extended fields, copies details and accepts unknown sources", () => {
    const details = { flight: "TEST123 ", squawk: "1234" };
    const raw = synthetic([
      [0, 1, 2, 1000, 100, 90, 0, 64, details, "adsb_icao", 1100, 70, 250, -2.5],
      [1, 1, 2, 1000, 100, 90, 0, 0, null, "some_future_source"],
    ]);
    const [a, b] = parseTrace(raw).points;
    expect(a!.source).toBe("adsb_icao");
    expect(a!.verticalRateFpm).toBe(64);
    expect(a!.geomAltitudeFt).toBe(1100);
    expect(a!.geomVerticalRateFpm).toBe(70);
    expect(a!.iasKt).toBe(250);
    expect(a!.rollDeg).toBe(-2.5);
    expect(a!.details).toEqual(details);
    expect(a!.details).not.toBe(details);
    expect(b!.source).toBe("some_future_source");
    expect(b!.details).toBeUndefined();
  });
});
