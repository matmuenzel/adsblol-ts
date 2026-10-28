import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SPEC_URL = "https://api.adsb.lol/api/openapi.json";
const SNAPSHOT_PATH = fileURLToPath(new URL("../spec/openapi.json", import.meta.url));

/** Downloads the live OpenAPI spec and stores it as the snapshot in `spec/openapi.json`. */
async function main(): Promise<void> {
  const response = await fetch(SPEC_URL, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Fetching ${SPEC_URL} failed with HTTP ${response.status}`);
  }
  const spec: unknown = await response.json();
  await writeFile(SNAPSHOT_PATH, JSON.stringify(spec, null, 2) + "\n");
  console.log(`Wrote ${SNAPSHOT_PATH}`);
}

await main();
