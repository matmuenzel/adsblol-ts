import { AdsbLol } from "../src/index.js";

/**
 * Manual live check against the real adsb.lol API. Not run in CI.
 *
 * Makes at most 5 requests (this script makes 4) with at least 2 s between them. Client retries
 * are disabled so that the budget holds. Exit code 1 if any step fails.
 */

const BASE_URL = "https://api.adsb.lol";
const USER_AGENT = "adsblol-ts live-smoke";
const MIN_GAP_MS = 2000;
const MAX_REQUESTS = 5;
const HEATHROW = { lat: 51.47, lon: -0.45, radiusNm: 10 } as const;

type Status = "OK" | "FAIL" | "SKIP";

interface Outcome {
  status: Status;
  detail: string;
}

let requestsMade = 0;

/**
 * Waits before every request except the first and enforces the request budget.
 *
 * @throws Error when the budget of {@link MAX_REQUESTS} is used up.
 */
async function beforeRequest(): Promise<void> {
  if (requestsMade >= MAX_REQUESTS) {
    throw new Error(`request budget of ${MAX_REQUESTS} exhausted`);
  }
  if (requestsMade > 0) {
    await new Promise((resolve) => setTimeout(resolve, MIN_GAP_MS));
  }
  requestsMade += 1;
}

/** Runs one step, prints its result line and returns the outcome. Errors become FAIL. */
async function runStep(name: string, step: () => Promise<Outcome>): Promise<Outcome> {
  let outcome: Outcome;
  try {
    outcome = await step();
  } catch (error) {
    outcome = { status: "FAIL", detail: error instanceof Error ? error.message : String(error) };
  }
  console.log(`${outcome.status.padEnd(4)} ${name}: ${outcome.detail}`);
  return outcome;
}

/** Returns the set of keys of an object, or an empty set for anything else. */
function keysOf(value: unknown): Set<string> {
  return typeof value === "object" && value !== null
    ? new Set(Object.keys(value))
    : new Set<string>();
}

/** Union of field names across all aircraft in an `ac` array. */
function aircraftFieldNames(ac: readonly unknown[]): Set<string> {
  const names = new Set<string>();
  for (const aircraft of ac) {
    for (const key of keysOf(aircraft)) names.add(key);
  }
  return names;
}

/** Lists the names that appear on only one side of two key sets. */
function describeDifferences(left: Set<string>, right: Set<string>): string {
  const onlyLeft = [...left].filter((key) => !right.has(key));
  const onlyRight = [...right].filter((key) => !left.has(key));
  return `only in near: [${onlyLeft.join(", ")}], only in raw: [${onlyRight.join(", ")}]`;
}

/**
 * Entry point. Runs the four steps in order and sets the exit code on failure.
 */
async function main(): Promise<void> {
  // maxAttempts 1 disables client retries, so the request budget cannot be exceeded.
  const adsb = new AdsbLol({ baseUrl: BASE_URL, userAgent: USER_AGENT, maxAttempts: 1 });
  const outcomes: Outcome[] = [];

  let nearHexes: string[] = [];
  let nearAircraft: unknown[] = [];
  let nearTopKeys = new Set<string>();

  outcomes.push(
    await runStep("near (Heathrow, 10 nm)", async () => {
      await beforeRequest();
      const res = await adsb.aircraft.near(HEATHROW);
      nearAircraft = res.ac;
      nearTopKeys = keysOf(res);
      nearHexes = res.ac.map((a) => a.hex);
      return { status: "OK", detail: `${res.ac.length} aircraft` };
    }),
  );

  outcomes.push(
    await runStep("byHex (first aircraft from near)", async () => {
      const hex = nearHexes[0];
      if (hex === undefined) {
        return { status: "SKIP", detail: "near returned no aircraft" };
      }
      await beforeRequest();
      const res = await adsb.aircraft.byHex(hex);
      const found = res.ac.some((a) => a.hex.toLowerCase() === hex.toLowerCase());
      return found
        ? { status: "OK", detail: `hex ${hex} found` }
        : { status: "FAIL", detail: `hex ${hex} not in ${res.ac.length} returned aircraft` };
    }),
  );

  outcomes.push(
    await runStep("alias /v2/lat/.../dist/... vs near", async () => {
      await beforeRequest();
      const response = await fetch(
        `${BASE_URL}/v2/lat/${HEATHROW.lat}/lon/${HEATHROW.lon}/dist/${HEATHROW.radiusNm}`,
        {
          headers: { accept: "application/json", "user-agent": USER_AGENT },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) {
        return { status: "FAIL", detail: `HTTP ${response.status}` };
      }
      const raw: unknown = await response.json();
      const rawTopKeys = keysOf(raw);
      const rawAc = typeof raw === "object" && raw !== null && "ac" in raw ? raw.ac : undefined;
      const rawAircraft = Array.isArray(rawAc) ? rawAc : [];

      // Criterion: the top-level key sets must be identical, and the aircraft field-name sets
      // must overlap by at least 80 % (Jaccard index). Aircraft come and go between the two
      // requests, so the comparison is on field names, not on individual aircraft.
      const sameTopKeys =
        rawTopKeys.size === nearTopKeys.size && [...rawTopKeys].every((k) => nearTopKeys.has(k));
      if (!sameTopKeys) {
        return {
          status: "FAIL",
          detail: `top-level keys differ: ${describeDifferences(nearTopKeys, rawTopKeys)}`,
        };
      }

      const nearFields = aircraftFieldNames(nearAircraft);
      const rawFields = aircraftFieldNames(rawAircraft);
      if (nearFields.size === 0 && rawFields.size === 0) {
        return { status: "SKIP", detail: "no aircraft on either side to compare fields" };
      }
      const union = new Set([...nearFields, ...rawFields]);
      const shared = [...nearFields].filter((k) => rawFields.has(k)).length;
      const overlap = shared / union.size;
      const detail = `top-level keys match, field overlap ${Math.round(overlap * 100)} %`;
      if (overlap >= 0.8) {
        return { status: "OK", detail };
      }
      return {
        status: "FAIL",
        detail: `${detail}; ${describeDifferences(nearFields, rawFields)}`,
      };
    }),
  );

  outcomes.push(
    await runStep("airports.get(EGLL)", async () => {
      await beforeRequest();
      const airport = await adsb.airports.get("EGLL");
      if (airport === null) {
        return { status: "FAIL", detail: "API returned no airport for EGLL" };
      }
      return airport.name === "London Heathrow Airport"
        ? { status: "OK", detail: airport.name }
        : { status: "FAIL", detail: `unexpected name "${airport.name}"` };
    }),
  );

  if (outcomes.some((o) => o.status === "FAIL")) {
    process.exitCode = 1;
  }
}

await main();
