#!/usr/bin/env node
/**
 * Deterministically generates the benchmark cohort fixtures named in
 * docs/PERFORMANCE_BENCHMARK.md ("Inputs": ~5 KB / ~50 KB / ~500 KB / ~1 MB).
 * Re-running this script reproduces byte-identical output (same content,
 * same sha256) — no randomness, no timestamps in the generated source.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "..", "fixtures", "benchmark");
mkdirSync(outDir, { recursive: true });

function functionBlock(i: number): string {
  return `export function fn${i}(a, b, c) {
  const sum = a + b + c;
  if (sum > 10) {
    return sum * 2;
  }
  return sum;
}

class Helper${i} {
  constructor(value) {
    this.value = value;
  }

  compute() {
    return this.value * fn${i}(1, 2, 3);
  }
}
`;
}

const targets: Array<{ name: string; approxBytes: number }> = [
  { name: "5kb.js", approxBytes: 5_000 },
  { name: "50kb.js", approxBytes: 50_000 },
  { name: "500kb.js", approxBytes: 500_000 },
];

for (const target of targets) {
  let content = "";
  let i = 0;
  while (Buffer.byteLength(content, "utf8") < target.approxBytes) {
    content += functionBlock(i);
    i++;
  }
  const filePath = path.join(outDir, target.name);
  writeFileSync(filePath, content);
  const sha256 = createHash("sha256").update(content).digest("hex");
  console.log(`${target.name}: ${Buffer.byteLength(content, "utf8")} bytes, ${i} functions, sha256=${sha256}`);
}
