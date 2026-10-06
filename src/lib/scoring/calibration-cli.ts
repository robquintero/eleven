/** Offline only. node --conditions=react-server --experimental-strip-types
 * src/lib/scoring/calibration-cli.ts /path/to/read-only-snapshot.json
 * No env file, database client, provider imports or write operations. */
import { readFile } from "node:fs/promises";
import { calibrateStoredPerformances, type CalibrationSnapshot } from "./calibration.ts";
const path = process.argv[2];
if (!path) throw new Error("Provide an existing read-only football snapshot JSON path");
console.log(JSON.stringify(calibrateStoredPerformances(JSON.parse(await readFile(path, "utf8")) as CalibrationSnapshot), null, 2));
