/**
 * Public data types returned by the client. Field names mirror the adsb.lol API
 * (readsb JSON), so they use snake_case where the API does. Field semantics follow
 * readsb's `README-json.md`.
 */

/**
 * Where the position/data of an aircraft came from (readsb `type` field).
 * Unknown values from the API are passed through as plain strings.
 */
export type AircraftSourceType =
  | "adsb_icao"
  | "adsb_icao_nt"
  | "adsr_icao"
  | "tisb_icao"
  | "adsc"
  | "mlat"
  | "other"
  | "mode_s"
  | "adsb_other"
  | "adsr_other"
  | "tisb_other"
  | "tisb_trackfile"
  | (string & {});

/** Emergency/priority status as broadcast by the aircraft. Unknown values pass through. */
export type Emergency =
  | "none"
  | "general"
  | "lifeguard"
  | "minfuel"
  | "nordo"
  | "unlawful"
  | "downed"
  | "reserved"
  | (string & {});

/**
 * ADS-B emitter category: letter set A to D followed by a digit 0 to 7
 * (for example `A3` is a large aircraft, `A7` a rotorcraft). Unknown values pass through.
 */
export type EmitterCategory =
  | "A0"
  | "A1"
  | "A2"
  | "A3"
  | "A4"
  | "A5"
  | "A6"
  | "A7"
  | "B0"
  | "B1"
  | "B2"
  | "B3"
  | "B4"
  | "B5"
  | "B6"
  | "B7"
  | "C0"
  | "C1"
  | "C2"
  | "C3"
  | "C4"
  | "C5"
  | "C6"
  | "C7"
  | "D0"
  | "D1"
  | "D2"
  | "D3"
  | "D4"
  | "D5"
  | "D6"
  | "D7"
  | (string & {});

/** Active autopilot modes. Unknown values pass through. */
export type NavMode =
  "autopilot" | "vnav" | "althold" | "approach" | "lnav" | "tcas" | (string & {});

/** Last known position of an aircraft that currently has no recent position (MLAT/TIS-B gaps). */
export interface LastPosition {
  /** Latitude in decimal degrees. */
  lat: number;
  /** Longitude in decimal degrees. */
  lon: number;
  /** Navigation Integrity Category of this position. */
  nic: number;
  /** Radius of containment in metres. */
  rc: number;
  /** Seconds since this position was last updated. */
  seen_pos: number;
}

/** One aircraft as reported by the API. All optional fields are absent when unknown. */
export interface Aircraft {
  /** ICAO 24-bit address as 6 hex digits. May start with `~` for non-ICAO addresses (for example TIS-B). */
  hex: string;
  /** Source of the most recent data for this aircraft. */
  type: AircraftSourceType;
  /**
   * Callsign or flight number, right-padded with spaces to 8 characters. May be absent.
   * Use `callsign()` to get a trimmed value.
   */
  flight?: string;
  /** Registration (tail number), for example `G-TTNN`. From the database, not broadcast. */
  r?: string;
  /** ICAO aircraft type code, for example `A320`. From the database, not broadcast. */
  t?: string;
  /**
   * Database flags, a bitfield. See `DbFlag`: 1 = military, 4 = PIA, 8 = LADD.
   * Use `isMilitary()`, `isPia()`, `isLadd()`.
   */
  dbFlags?: number;
  /** Barometric altitude in feet (relative to 1013.25 hPa), or `"ground"` when on the ground. */
  alt_baro?: number | "ground";
  /** Geometric (GNSS/INS) altitude in feet above the WGS84 ellipsoid. */
  alt_geom?: number;
  /** Ground speed in knots. */
  gs?: number;
  /** Indicated airspeed in knots. */
  ias?: number;
  /** True airspeed in knots. */
  tas?: number;
  /** Mach number. */
  mach?: number;
  /** Track over ground in degrees (0 to 359). */
  track?: number;
  /** Rate of change of track in degrees per second. */
  track_rate?: number;
  /** Track calculated by the receiver from successive positions, in degrees. */
  calc_track?: number;
  /** Roll angle in degrees, negative is left. */
  roll?: number;
  /** Magnetic heading in degrees. */
  mag_heading?: number;
  /** True heading in degrees. */
  true_heading?: number;
  /** Rate of change of barometric altitude in feet per minute. */
  baro_rate?: number;
  /** Rate of change of geometric altitude in feet per minute. */
  geom_rate?: number;
  /** Mode A squawk code as 4 octal digits, for example `7700`. */
  squawk?: string;
  /** Emergency/priority status. */
  emergency?: Emergency;
  /** Emitter category. */
  category?: EmitterCategory;
  /** Selected altitude from the Mode Control Panel / Flight Control Unit, in feet. */
  nav_altitude_mcp?: number;
  /** Selected altitude from the Flight Management System, in feet. */
  nav_altitude_fms?: number;
  /** Selected heading in degrees. */
  nav_heading?: number;
  /** Altimeter setting (QNH/QFE) in hPa. */
  nav_qnh?: number;
  /** Active autopilot modes. */
  nav_modes?: NavMode[];
  /** Latitude in decimal degrees. */
  lat?: number;
  /** Longitude in decimal degrees. */
  lon?: number;
  /** Navigation Integrity Category. */
  nic?: number;
  /** Radius of containment in metres. */
  rc?: number;
  /** Seconds since the position was last updated. */
  seen_pos?: number;
  /** ADS-B version (0, 1 or 2). */
  version?: number;
  /** Navigation Integrity Category for barometric altitude (0 or 1). */
  nic_baro?: number;
  /** Navigation Accuracy Category for position. */
  nac_p?: number;
  /** Navigation Accuracy Category for velocity. */
  nac_v?: number;
  /** Source Integrity Level. */
  sil?: number;
  /** How the SIL is defined, for example `perhour` or `persample`. */
  sil_type?: string;
  /** Geometric Vertical Accuracy. */
  gva?: number;
  /** System Design Assurance. */
  sda?: number;
  /** Flight status alert bit (1 = alert). */
  alert?: number;
  /** Flight status special position identification bit (1 = ident active). */
  spi?: number;
  /** Wind direction in degrees, calculated from ground track, heading, TAS and GS. */
  wd?: number;
  /** Wind speed in knots, calculated from ground track, heading, TAS and GS. */
  ws?: number;
  /** Outer (static) air temperature in degrees Celsius. */
  oat?: number;
  /** Total air temperature in degrees Celsius. */
  tat?: number;
  /** Timestamp (readsb internal) before which GPS was known to be OK. Semantics are not documented by the API. */
  gpsOkBefore?: number;
  /** Latitude of the last GPS-OK position in decimal degrees. Not documented by the API. */
  gpsOkLat?: number;
  /** Longitude of the last GPS-OK position in decimal degrees. Not documented by the API. */
  gpsOkLon?: number;
  /** Last known position, present when the current position is stale. */
  lastPosition?: LastPosition;
  /** Receiver-reconciled latitude estimate in decimal degrees (readsb `rr_lat`, rough position). */
  rr_lat?: number;
  /** Receiver-reconciled longitude estimate in decimal degrees (readsb `rr_lon`, rough position). */
  rr_lon?: number;
  /** Total number of Mode S messages received from this aircraft. */
  messages: number;
  /** Seconds since any message was last received from this aircraft. */
  seen: number;
  /** Recent average signal power in dBFS (always negative). */
  rssi: number;
  /** Names of fields whose values were derived from MLAT. */
  mlat: string[];
  /** Names of fields whose values were derived from TIS-B. */
  tisb: string[];
  /** Distance from the query point in nautical miles. Only present for radius and closest queries. */
  dst?: number;
  /** Bearing from the query point to the aircraft in degrees. Only present for radius and closest queries. */
  dir?: number;
}

/** Response of the aircraft list endpoints. */
export interface AircraftResponse {
  /** Aircraft matching the query. */
  ac: Aircraft[];
  /** Server message, for example `No error`. */
  msg: string;
  /** Time the data was generated, in milliseconds since the Unix epoch. */
  now: number;
  /** Cache time of the data, in milliseconds since the Unix epoch. */
  ctime: number;
  /** Processing time, in milliseconds since the Unix epoch (observed as 0). */
  ptime: number;
  /** Number of aircraft in `ac`. */
  total: number;
}

/** Airport record. */
export interface Airport {
  /** Elevation in feet. */
  alt_feet: number;
  /** Elevation in metres. */
  alt_meters: number;
  /** ISO 3166-1 alpha-2 country code. */
  countryiso2: string;
  /** IATA code, for example `LHR`. */
  iata: string;
  /** ICAO code, for example `EGLL`. */
  icao: string;
  /** Latitude in decimal degrees. */
  lat: number;
  /** City or area the airport serves. */
  location: string;
  /** Longitude in decimal degrees. */
  lon: number;
  /** Full airport name. */
  name: string;
}

/** A feeder connected via Beast. */
export interface BeastClient {
  /** URL of the feeder's adsb.lol "my" page. */
  adsblol_my_url: string;
  /** Seconds the client has been connected. */
  connected_seconds: number;
  /** IP address of the client (as reported by the API). */
  ip: string;
  /** Data rate in kilobits per second. */
  kbps: number;
  /** Mode S messages received per second. */
  messages_per_second: number;
  /** Latency in milliseconds. */
  ms: number;
  /** Total number of positions received. */
  positions: number;
  /** Positions received per second. */
  positions_per_second: number;
  /** Feeder UUID (possibly truncated by the API). */
  uuid: string;
}

/** A feeder connected for MLAT. */
export interface MlatClient {
  /** Seconds until a bad clock sync times out. */
  bad_sync_timeout: number;
  /** Connection description (client software and transport). */
  connection: string;
  /** Percentage of outlier measurements. */
  outlier_percent: number;
  /** Number of MLAT peers. */
  peer_count: number;
  /** Whether the feeder hides its location. */
  privacy: boolean;
  /** Feeder name. */
  user: string;
  /** Feeder UUID (possibly truncated by the API). */
  uuid: string;
}

/** Information about the receivers sending from the caller's IP. */
export interface ReceiverInfo {
  /** Message of the day entries. Shape not observed. */
  _motd: unknown[];
  /** Clients connected from the caller's IP. */
  clients: {
    /** Beast feeders. */
    beast: BeastClient[];
    /** MLAT feeders. */
    mlat: MlatClient[];
  };
  /** Network-wide counters. */
  global: {
    /** Number of aircraft currently tracked. */
    aircraft: number;
    /** Number of Beast clients. */
    beast: number;
    /** Number of MLAT clients. */
    mlat: number;
  };
}
