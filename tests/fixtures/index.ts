import { readFileSync } from "node:fs";

/** Minimal shape of a v2 aircraft list response (point, closest, mil, pia, ladd). */
export interface V2ListFixture {
  ac: Array<Record<string, unknown>>;
  total: number;
  now: number;
}

/** Minimal shape of the `/0/me` response. */
export interface MeFixture {
  _motd: unknown[];
  clients: {
    beast: Array<Record<string, unknown>>;
    mlat: Array<Record<string, unknown>>;
  };
  global: Record<string, number>;
}

/** Airport record from `/api/0/airport/{icao}`. */
export type AirportFixture = Record<string, unknown>;

/** Raw readsb trace from `/1/trace/{full,recent}/{icao_hex}`. */
export interface TraceFixture {
  icao: string;
  timestamp: number;
  trace: unknown[][];
  [key: string]: unknown;
}

function load<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), "utf8")) as T;
}

function loadText(name: string): string {
  return readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
}

export const fixtures = {
  point: load<V2ListFixture>("v2-point.json"),
  closest: load<V2ListFixture>("v2-closest.json"),
  empty: load<V2ListFixture>("v2-empty.json"),
  mil: load<V2ListFixture>("v2-mil.json"),
  pia: load<V2ListFixture>("v2-pia.json"),
  ladd: load<V2ListFixture>("v2-ladd.json"),
  airportEgll: load<AirportFixture>("airport-egll.json"),
  me: load<MeFixture>("me.json"),
  traceRecent: load<TraceFixture>("trace-recent.json"),
  traceFull: load<TraceFixture>("trace-full.json"),
};

/** Body of the 401 response for an invalid `X-API-Key` (text/plain, not JSON). */
export const invalidApiKeyBody = loadText("v2-invalid-api-key.txt");

/** Body of the re-api 401 without a key from a non-accepted source (text/plain, not JSON). */
export const reApiKeyRequiredBody = loadText("reapi-api-key-required.txt");
