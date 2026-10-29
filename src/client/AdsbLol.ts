import { createTransport, type Transport, type TransportOptions } from "../transport/http.js";
import { ValidationError } from "../errors/index.js";
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
export type AdsbLolOptions = TransportOptions;

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
    this.#transport = createTransport(options);
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
    };
    this.airports = {
      get: async (icao, o) =>
        get<Airport | null>(`/api/0/airport/${pathSegment(normalizeAirportIcao(icao), "icao")}`, o),
    };
    this.receiver = {
      me: async (o) => get("/0/me", o),
    };
  }
}
