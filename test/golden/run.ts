import { evaluateGoldenCases, loadGoldenCases } from "./evaluator.js";

const cases = loadGoldenCases();
const result = await evaluateGoldenCases(cases);

if (result.failures.length > 0) {
  console.error(`Golden Eval failed: ${result.passed}/${result.total} case(s) passed.`);
  for (const failure of result.failures) {
    console.error(`- ${failure.id} (${failure.file}): ${failure.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Golden Eval passed: ${result.total} case(s).`);
}
