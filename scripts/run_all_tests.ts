import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const scriptsDir = path.resolve(import.meta.dirname);

const entries = await readdir(scriptsDir, { withFileTypes: true });
const testFiles = entries
  .filter((entry) => entry.isFile() && /^test_.*\.ts$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();

for (const file of testFiles) {
  await import(pathToFileURL(path.join(scriptsDir, file)).href);
}
