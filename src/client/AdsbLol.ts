import { createTransport, type Transport, type TransportOptions } from "../transport/http.js";
import { HttpError, ParseError, ValidationError } from "../errors/index.js";
import { buildReApiQuery, type BoxQuery, type ReApiBase, type ReApiFilter } from "./reapi.js";
import { parseTrace, type RawTrace, type Trace } from "./trace.js";
import type { Aircraft, AircraftResponse, Airport, ReceiverInfo } from "./types.js";
import {
  assertLat,
  assertLon,
  assertRadiusNm,
  assertSquawk,
  normalizeAircraftType,
  normalizeAirportIcao,
  normalizeCallsign,
  normalizeHex,
  normalizeIcaoHex,
  normalizeRegistration,
  pathSegment,
} from "./validate.js";

/**
 * Options for {@link AdsbLol}: base URL, timeouts, retries, API key, auth and hooks.
 *
 * @example
 * ```ts
 * const options: AdsbLolOptions = { timeoutMs: 5000, maxAttempts: 2 };
 * const withKey: AdsbLolOptions = { apiKey: process.env.ADSBLOL_API_KEY };
 * ```
 */
export interface AdsbLolOptions extends TransportOptions {
  /**
   * Base URL of the re-api (experimental, feeders only). Default `"https://re-api.adsb.lol"`.
   * All other options, including `apiKey`, apply to both the API and the re-api.
   */
  reApiBaseUrl?: string;
}

/**
 * Checks the minimal shape of a trace response.
 *
 * @param raw - Parsed response body.
 * @returns `true` if it has a string `icao`, a numeric `timestamp` and a `trace` array.
 */
function isRawTrace(raw: unknown): raw is RawTrace {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.icao === "string" && typeof r.timestamp === "number" && Array.isArray(r.trace);
}

const DEFAULT_REAPI_BASE_URL = "https://re-api.adsb.lol";

/** Per-call options accepted by every client method. */
export interface RequestOptions {
  /**
   * Signal to cancel the request. Cancellation is never retried and rejects with the signal's reason.
   *
   * @example
   * ```ts
   * await adsb.aircraft.military({ signal: AbortSignal.timeout(2000) });
   * ```
   */
  signal?: AbortSignal;
}

/** A circular search area around a point. */
export interface PointQuery {
  /** Latitude in degrees, -90 to 90. */
  lat: number;
  /** Longitude in degrees, -180 to 180. */
  lon: number;
  /** Search radius in nautical miles, integer from 0 to 250. */
  radiusNm: number;
}

/**
 * Client for the adsb.lol API (unofficial).
 *
 * @example
 * ```ts
 * const adsb = new AdsbLol();
 * const { ac } = await adsb.aircraft.byHex("4ca87c");
 * ```
 */
export class AdsbLol {
  readonly #transport: Transport;
  readonly #reApiTransport: Transport;

  /** Aircraft queries (`/v2/...`). */
  readonly aircraft: {
    /**
     * Looks up aircraft by ICAO 24-bit hex address. The value is trimmed and lowercased.
     *
     * @example
     * ```ts
     * const { ac } = await adsb.aircraft.byHex("4CA87C");
     * ```
     */
    byHex(hex: string, o?: RequestOptions): Promise<AircraftResponse>;
    /**
     * Looks up aircraft by callsign. Surrounding whitespace is trimmed.
     *
     * @example
     * ```ts
     * const { ac } = await adsb.aircraft.byCallsign("UAL958");
     * ```
     */
    byCallsign(callsign: string, o?: RequestOptions): Promise<AircraftResponse>;
    /**
     * Looks up aircraft by registration. Surrounding whitespace is trimmed.
     *
     * @example
     * ```ts
     * const { ac } = await adsb.aircraft.byRegistration("G-KELS");
     * ```
     */
    byRegistration(reg: string, o?: RequestOptions): Promise<AircraftResponse>;
    /**
     * Lists aircraft of an ICAO type designator. Surrounding whitespace is trimmed.
     *
     * @example
     * ```ts
     * const { ac } = await adsb.aircraft.byType("A320");
     * ```
     */
    byType(type: string, o?: RequestOptions): Promise<AircraftResponse>;
    /**
     * Lists aircraft squawking a code (four octal digits, 0 to 7).
     *
     * @example
     * ```ts
     * const { ac } = await adsb.aircraft.bySquawk("7700");
     * ```
     */
    bySquawk(squawk: string, o?: RequestOptions): Promise<AircraftResponse>;
    /**
     * Lists aircraft within a radius of a point. The radius is in nautical miles, maximum 250.
     *
     * @example
     * ```ts
     * const { ac } = await adsb.aircraft.near({ lat: 51.47, lon: -0.45, radiusNm: 10 });
     * ```
     */
    near(q: PointQuery, o?: RequestOptions): Promise<AircraftResponse>;
    /**
     * Returns the aircraft closest to a point within a radius, or `null` if there is none.
     * The radius is in nautical miles, maximum 250.
     *
     * @example
     * ```ts
     * const ac = await adsb.aircraft.closest({ lat: 51.47, lon: -0.45, radiusNm: 25 });
     * ```
     */
    closest(q: PointQuery, o?: RequestOptions): Promise<Aircraft | null>;
    /**
     * Lists aircraft flagged as military.
     *
     * @example
     * ```ts
     * const { ac } = await adsb.aircraft.military();
     * ```
     */
    military(o?: RequestOptions): Promise<AircraftResponse>;
    /**
     * Lists aircraft using a Privacy ICAO Address (PIA).
     *
     * @example
     * ```ts
     * const { ac } = await adsb.aircraft.pia();
     * ```
     */
    pia(o?: RequestOptions): Promise<AircraftResponse>;
    /**
     * Lists aircraft on the LADD (Limiting Aircraft Data Displayed) list.
     *
     * @example
     * ```ts
     * const { ac } = await adsb.aircraft.ladd();
     * ```
     */
    ladd(o?: RequestOptions): Promise<AircraftResponse>;
    /**
     * Gets the complete stored trace of an aircraft (`/1/trace/full/{hex}`), translated into a {@link Trace}.
     *
     * Returns `null` if the API has no trace for the address (HTTP 404). The address must be
     * six hex digits; it is trimmed and lowercased, and a `~` prefix is rejected. This endpoint
     * is metered: it counts against your quota, so avoid polling it.
     *
     * @example
     * ```ts
     * const trace = await adsb.aircraft.trace("486802");
     * const altitudeFt = trace?.points[0]?.altitudeFt;
     * ```
     */
    trace(hex: string, o?: RequestOptions): Promise<Trace | null>;
    /**
     * Gets the recent trace of an aircraft (`/1/trace/recent/{hex}`), translated into a {@link Trace}.
     *
     * Returns `null` if the API has no trace for the address (HTTP 404). The address must be
     * six hex digits; it is trimmed and lowercased, and a `~` prefix is rejected. This endpoint
     * is metered: it counts against your quota, so avoid polling it.
     *
     * @example
     * ```ts
     * const trace = await adsb.aircraft.recentTrace("486802");
     * const altitudeFt = trace?.points[0]?.altitudeFt;
     * ```
     */
    recentTrace(hex: string, o?: RequestOptions): Promise<Trace | null>;
  };

  /** Airport queries (`/api/0/airport`). */
  readonly airports: {
    /**
     * Gets an airport by ICAO code (trimmed and uppercased), or `null` if the API does not know it.
     *
     * @example
     * ```ts
     * const airport = await adsb.airports.get("EGLL");
     * ```
     */
    get(icao: string, o?: RequestOptions): Promise<Airport | null>;
  };

  /** Receiver and network information (`/0/me`). */
  readonly receiver: {
    /**
     * Gets information about the receiver and network seen from the calling IP address.
     *
     * @example
     * ```ts
     * const info = await adsb.receiver.me();
     * ```
     */
    me(o?: RequestOptions): Promise<ReceiverInfo>;
  };

  /**
   * Experimental queries against the re-api (`https://re-api.adsb.lol`), readsb's query interface.
   *
   * Feeder access requires a feeder key (`apiKey`); a feeder IP alone was observed to get
   * 401 `api key required`. The response shape follows the readsb `jv2` documentation and has
   * not yet been verified against a live 200 response. 401 texts: `api key required`,
   * `api key expired`, `invalid api key`. See https://www.adsb.lol/docs/feeders-only/re-api/.
   *
   * @example
   * ```ts
   * const adsb = new AdsbLol({ apiKey: process.env.ADSBLOL_API_KEY });
   * const { ac } = await adsb.reApi.circle({ lat: 51.47, lon: -0.45, radiusNm: 10 });
   * ```
   */
  readonly reApi: {
    /**
     * Experimental: lists aircraft within a radius of a point (radius in nautical miles, maximum 250).
     *
     * Feeder access requires a feeder key (`apiKey`); a feeder IP alone was observed to get
     * 401 `api key required`. The response shape follows the readsb `jv2` documentation and
     * has not yet been verified against a live 200 response. Auth failures surface as an
     * `HttpError` with status 401 and one of the texts `api key required`, `api key expired`
     * or `invalid api key`.
     *
     * @example
     * ```ts
     * const adsb = new AdsbLol({ apiKey: process.env.ADSBLOL_API_KEY });
     * const { ac } = await adsb.reApi.circle({ lat: 51.47, lon: -0.45, radiusNm: 10 }, { military: true });
     * ```
     */
    circle(q: PointQuery, f?: ReApiFilter, o?: RequestOptions): Promise<AircraftResponse>;
    /**
     * Experimental: returns the aircraft closest to a point within a radius in nautical miles, or `null` if there is none.
     *
     * Feeder access requires a feeder key (`apiKey`); a feeder IP alone was observed to get
     * 401 `api key required`. The response shape follows the readsb `jv2` documentation and
     * has not yet been verified against a live 200 response. Auth failures surface as an
     * `HttpError` with status 401 and one of the texts `api key required`, `api key expired`
     * or `invalid api key`.
     *
     * @example
     * ```ts
     * const ac = await adsb.reApi.closest({ lat: 51.47, lon: -0.45, radiusNm: 25 });
     * ```
     */
    closest(q: PointQuery, f?: ReApiFilter, o?: RequestOptions): Promise<Aircraft | null>;
    /**
     * Experimental: lists aircraft inside a box given in degrees (`west > east` crosses the antimeridian).
     *
     * Feeder access requires a feeder key (`apiKey`); a feeder IP alone was observed to get
     * 401 `api key required`. The response shape follows the readsb `jv2` documentation and
     * has not yet been verified against a live 200 response. Auth failures surface as an
     * `HttpError` with status 401 and one of the texts `api key required`, `api key expired`
     * or `invalid api key`.
     *
     * @example
     * ```ts
     * const { ac } = await adsb.reApi.box({ south: 50, north: 52, west: -2, east: 1 });
     * ```
     */
    box(q: BoxQuery, f?: ReApiFilter, o?: RequestOptions): Promise<AircraftResponse>;
    /**
     * Experimental: lists every aircraft the server knows about; `withPosition: true` keeps only those with a position.
     *
     * Feeder access requires a feeder key (`apiKey`); a feeder IP alone was observed to get
     * 401 `api key required`. The response shape follows the readsb `jv2` documentation and
     * has not yet been verified against a live 200 response. Auth failures surface as an
     * `HttpError` with status 401 and one of the texts `api key required`, `api key expired`
     * or `invalid api key`.
     *
     * @example
     * ```ts
     * const { ac } = await adsb.reApi.all({ withPosition: true }, { types: ["A320"] });
     * ```
     */
    all(
      q?: { withPosition?: boolean },
      f?: ReApiFilter,
      o?: RequestOptions,
    ): Promise<AircraftResponse>;
    /**
     * Experimental: looks up aircraft by 1 to 1000 ICAO hex addresses (trimmed and lowercased).
     *
     * Feeder access requires a feeder key (`apiKey`); a feeder IP alone was observed to get
     * 401 `api key required`. The response shape follows the readsb `jv2` documentation and
     * has not yet been verified against a live 200 response. Auth failures surface as an
     * `HttpError` with status 401 and one of the texts `api key required`, `api key expired`
     * or `invalid api key`.
     *
     * @example
     * ```ts
     * const { ac } = await adsb.reApi.findHex(["4ca87c", "485a2b"]);
     * ```
     */
    findHex(hexes: string[], f?: ReApiFilter, o?: RequestOptions): Promise<AircraftResponse>;
    /**
     * Experimental: looks up aircraft by 1 to 1000 callsigns.
     *
     * Feeder access requires a feeder key (`apiKey`); a feeder IP alone was observed to get
     * 401 `api key required`. The response shape follows the readsb `jv2` documentation and
     * has not yet been verified against a live 200 response. Auth failures surface as an
     * `HttpError` with status 401 and one of the texts `api key required`, `api key expired`
     * or `invalid api key`.
     *
     * @example
     * ```ts
     * const { ac } = await adsb.reApi.findCallsign(["UAL958"]);
     * ```
     */
    findCallsign(
      callsigns: string[],
      f?: ReApiFilter,
      o?: RequestOptions,
    ): Promise<AircraftResponse>;
    /**
     * Experimental: looks up aircraft by 1 to 1000 registrations.
     *
     * Feeder access requires a feeder key (`apiKey`); a feeder IP alone was observed to get
     * 401 `api key required`. The response shape follows the readsb `jv2` documentation and
     * has not yet been verified against a live 200 response. Auth failures surface as an
     * `HttpError` with status 401 and one of the texts `api key required`, `api key expired`
     * or `invalid api key`.
     *
     * @example
     * ```ts
     * const { ac } = await adsb.reApi.findRegistration(["G-KELS"]);
     * ```
     */
    findRegistration(
      regs: string[],
      f?: ReApiFilter,
      o?: RequestOptions,
    ): Promise<AircraftResponse>;
    /**
     * Experimental: looks up aircraft by 1 to 1000 ICAO type designators.
     *
     * Feeder access requires a feeder key (`apiKey`); a feeder IP alone was observed to get
     * 401 `api key required`. The response shape follows the readsb `jv2` documentation and
     * has not yet been verified against a live 200 response. Auth failures surface as an
     * `HttpError` with status 401 and one of the texts `api key required`, `api key expired`
     * or `invalid api key`.
     *
     * @example
     * ```ts
     * const { ac } = await adsb.reApi.findType(["A320"]);
     * ```
     */
    findType(types: string[], f?: ReApiFilter, o?: RequestOptions): Promise<AircraftResponse>;
    /**
     * Experimental: looks up aircraft by 1 to 1000 squawk codes (four octal digits each).
     *
     * Feeder access requires a feeder key (`apiKey`); a feeder IP alone was observed to get
     * 401 `api key required`. The response shape follows the readsb `jv2` documentation and
     * has not yet been verified against a live 200 response. Auth failures surface as an
     * `HttpError` with status 401 and one of the texts `api key required`, `api key expired`
     * or `invalid api key`.
     *
     * @example
     * ```ts
     * const { ac } = await adsb.reApi.findSquawk(["7700"]);
     * ```
     */
    findSquawk(squawks: string[], f?: ReApiFilter, o?: RequestOptions): Promise<AircraftResponse>;
  };

  /**
   * Creates a client.
   *
   * @param options - Transport configuration; see {@link AdsbLolOptions}.
   *
   * @example
   * ```ts
   * const adsb = new AdsbLol({ baseUrl: "https://api.adsb.lol", timeoutMs: 8000 });
   * ```
   */
  constructor(options: AdsbLolOptions = {}) {
    const { reApiBaseUrl, ...rest } = options;
    this.#transport = createTransport(rest);
    this.#reApiTransport = createTransport({
      ...rest,
      baseUrl: reApiBaseUrl ?? DEFAULT_REAPI_BASE_URL,
    });
    const get = <T>(path: string, o?: RequestOptions): Promise<T> =>
      this.#transport.request<T>({ method: "GET", path, ...(o?.signal && { signal: o.signal }) });
    const point = (q: PointQuery): string => {
      if (typeof q !== "object" || q === null) {
        const msg = "query must be an object with lat, lon and radiusNm";
        throw new ValidationError(
          msg,
          [{ loc: ["path", "query"], msg, type: "client_validation" }],
          undefined,
        );
      }
      return `${pathSegment(assertLat(q.lat), "lat")}/${pathSegment(assertLon(q.lon), "lon")}/${pathSegment(assertRadiusNm(q.radiusNm), "radiusNm")}`;
    };

    const trace = async (kind: "full" | "recent", hex: string, o?: RequestOptions) => {
      const path = `/1/trace/${kind}/${pathSegment(normalizeIcaoHex(hex), "hex")}`;
      try {
        const raw = await get<unknown>(path, o);
        if (!isRawTrace(raw)) throw new ParseError("Unexpected trace response");
        return parseTrace(raw);
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) return null;
        throw error;
      }
    };

    const reQuery = <T>(
      base: ReApiBase,
      filter: ReApiFilter | undefined,
      o: RequestOptions | undefined,
    ): Promise<T> =>
      this.#reApiTransport
        .request<T>({
          method: "GET",
          path: buildReApiQuery(base, filter),
          ...(o?.signal && { signal: o.signal }),
        })
        .then((res) => {
          // The jv2 response shape is unverified: fail with a ParseError, not a TypeError.
          if (!Array.isArray((res as { ac?: unknown } | null | undefined)?.ac)) {
            throw new ParseError("Unexpected re-api response");
          }
          return res;
        });
    const reCircle = (kind: "circle" | "closest", q: PointQuery) => {
      if (typeof q !== "object" || q === null) {
        const msg = "query must be an object with lat, lon and radiusNm";
        throw new ValidationError(
          msg,
          [{ loc: ["query", "query"], msg, type: "client_validation" }],
          undefined,
        );
      }
      return { kind, lat: q.lat, lon: q.lon, radiusNm: q.radiusNm } as const;
    };

    this.aircraft = {
      byHex: async (hex, o) => get(`/v2/hex/${pathSegment(normalizeHex(hex), "hex")}`, o),
      byCallsign: async (callsign, o) =>
        get(`/v2/callsign/${pathSegment(normalizeCallsign(callsign), "callsign")}`, o),
      byRegistration: async (reg, o) =>
        get(`/v2/reg/${pathSegment(normalizeRegistration(reg), "registration")}`, o),
      byType: async (type, o) =>
        get(`/v2/type/${pathSegment(normalizeAircraftType(type), "type")}`, o),
      bySquawk: async (squawk, o) =>
        get(`/v2/sqk/${pathSegment(assertSquawk(squawk), "squawk")}`, o),
      near: async (q, o) => get(`/v2/point/${point(q)}`, o),
      closest: async (q, o) => {
        const res = await get<AircraftResponse>(`/v2/closest/${point(q)}`, o);
        return res.ac[0] ?? null;
      },
      military: async (o) => get("/v2/mil", o),
      pia: async (o) => get("/v2/pia", o),
      ladd: async (o) => get("/v2/ladd", o),
      trace: async (hex, o) => trace("full", hex, o),
      recentTrace: async (hex, o) => trace("recent", hex, o),
    };
    this.airports = {
      get: async (icao, o) =>
        get<Airport | null>(`/api/0/airport/${pathSegment(normalizeAirportIcao(icao), "icao")}`, o),
    };
    this.receiver = {
      me: async (o) => get("/0/me", o),
    };
    this.reApi = {
      circle: async (q, f, o) => reQuery(reCircle("circle", q), f, o),
      closest: async (q, f, o) => {
        const res = await reQuery<AircraftResponse>(reCircle("closest", q), f, o);
        return res.ac[0] ?? null;
      },
      box: async (q, f, o) => reQuery({ kind: "box", box: q }, f, o),
      all: async (q, f, o) =>
        reQuery({ kind: "all", withPosition: q?.withPosition === true }, f, o),
      findHex: async (values, f, o) => reQuery({ kind: "find_hex", values }, f, o),
      findCallsign: async (values, f, o) => reQuery({ kind: "find_callsign", values }, f, o),
      findRegistration: async (values, f, o) => reQuery({ kind: "find_reg", values }, f, o),
      findType: async (values, f, o) => reQuery({ kind: "find_type", values }, f, o),
      findSquawk: async (values, f, o) => reQuery({ kind: "find_squawk", values }, f, o),
    };
  }
}
