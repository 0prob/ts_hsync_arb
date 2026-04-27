import path from "node:path";
import { pathToFileURL } from "node:url";

const script = process.argv[2];

if (!script) {
  console.error("Usage: node --import=tsx scripts/run_ts_test.mjs <script.ts>");
  process.exit(1);
}

try {
  await import(pathToFileURL(path.resolve(script)).href);
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
