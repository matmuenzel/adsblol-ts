import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { diffSpecs } from "./spec-diff.js";

const SPEC_URL = "https://api.adsb.lol/api/openapi.json";
const SNAPSHOT_PATH = fileURLToPath(new URL("../spec/openapi.json", import.meta.url));

/** Compares the live spec with the stored snapshot. Exits with 1 if they differ. */
async function main(): Promise<void> {
  const [snapshot, response] = await Promise.all([
    readFile(SNAPSHOT_PATH, "utf8").then((text): unknown => JSON.parse(text)),
    fetch(SPEC_URL, { headers: { accept: "application/json" } }),
  ]);
  if (!response.ok) {
    throw new Error(`Fetching ${SPEC_URL} failed with HTTP ${response.status}`);
  }
  const live: unknown = await response.json();
  const diff = diffSpecs(snapshot, live);

  console.log(JSON.stringify(diff, null, 2));
  if (diff.changed) {
    console.log("Spec drift detected. Run `pnpm spec:update` to refresh the snapshot.");
    process.exitCode = 1;
  } else {
    console.log("No spec drift.");
  }
}

await main();
