import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const srcRoot = join(process.cwd(), "src");
const checkedFiles = [
  "state/poll_univ3.ts",
];

for (const relativePath of checkedFiles) {
  const source = readFileSync(join(srcRoot, relativePath), "utf8");
  assert.doesNotMatch(
    source,
    /from\s+["']\.\/index(?:\.ts)?["']/,
    `${relativePath} should import peer modules directly instead of loading its own barrel`,
  );
}

console.log("Import boundary checks passed.");
