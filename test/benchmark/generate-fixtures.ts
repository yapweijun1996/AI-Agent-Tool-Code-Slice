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

interface BenchmarkTarget {
  name: string;
  approxBytes: number;
}

interface BenchmarkCohort {
  id: string;
  extension: string;
  directory?: string;
  block: (index: number) => string;
  prefix?: string;
  suffix?: string;
}

function javascriptBlock(i: number): string {
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

function typescriptBlock(i: number): string {
  return `export function fn${i}(a: number, b: number, c: number): number {
  const sum = a + b + c;
  return sum > 10 ? sum * 2 : sum;
}

class Helper${i} {
  compute(value: number): number {
    return value * fn${i}(1, 2, 3);
  }
}
`;
}

function tsxBlock(i: number): string {
  return `export function fn${i}(a: number, b: number, c: number): JSX.Element {
  const sum = a + b + c;
  return <span data-index="${i}">{sum}</span>;
}
`;
}

function pythonBlock(i: number): string {
  return `def fn${i}(a, b, c):
    total = a + b + c
    return total * 2 if total > 10 else total


class Helper${i}:
    def compute(self, value):
        return value * fn${i}(1, 2, 3)
`;
}

function cfmlBlock(i: number): string {
  return `function fn${i}(a, b, c) {
  var total = a + b + c;
  return total > 10 ? total * 2 : total;
}

`;
}

const targets: BenchmarkTarget[] = [
  { name: "5kb.js", approxBytes: 5_000 },
  { name: "50kb.js", approxBytes: 50_000 },
  { name: "500kb.js", approxBytes: 500_000 },
  { name: "1mb.js", approxBytes: 1_000_000 },
];

const cohorts: BenchmarkCohort[] = [
  { id: "javascript", extension: "js", block: javascriptBlock },
  { id: "typescript", extension: "ts", directory: "typescript", block: typescriptBlock },
  { id: "tsx", extension: "tsx", directory: "tsx", block: tsxBlock },
  { id: "python", extension: "py", directory: "python", block: pythonBlock },
  {
    id: "cfml",
    extension: "cfm",
    directory: "cfml",
    block: cfmlBlock,
    prefix: '<cfcomponent output="false">\n\t<cfscript>\n',
    suffix: "\t</cfscript>\n</cfcomponent>\n",
  },
];

function generateFixture(cohort: BenchmarkCohort, target: BenchmarkTarget): { content: string; blocks: number } {
  const prefix = cohort.prefix ?? "";
  const suffix = cohort.suffix ?? "";
  let body = "";
  let blocks = 0;
  while (Buffer.byteLength(prefix + body + suffix, "utf8") < target.approxBytes) {
    body += cohort.block(blocks);
    blocks += 1;
  }

  return { content: prefix + body + suffix, blocks };
}

for (const cohort of cohorts) {
  const cohortDir = path.join(outDir, cohort.directory ?? "");
  mkdirSync(cohortDir, { recursive: true });

  for (const target of targets) {
    const { content, blocks } = generateFixture(cohort, target);
    const fileName = `${target.name.slice(0, -3)}.${cohort.extension}`;
    const filePath = path.join(cohortDir, fileName);
    writeFileSync(filePath, content);
    const bytes = Buffer.byteLength(content, "utf8");
    const sha256 = createHash("sha256").update(content).digest("hex");
    console.log(`${cohort.id}/${fileName}: ${bytes} bytes, ${blocks} blocks, sha256=${sha256}`);
  }
}
