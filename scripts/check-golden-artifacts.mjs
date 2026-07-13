#!/usr/bin/env node
import { checkRepository } from "./golden-artifact-policy.mjs";

try {
  const result = checkRepository();
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`golden-artifact-policy: ${error}`);
    process.exitCode = 1;
  } else if (result.protectedChanges.length === 0) {
    console.log(
      `golden-artifact-policy: ${result.registry.artifacts.length} artifact families checked; no protected changes in ${result.range}`,
    );
  } else {
    console.log(
      `golden-artifact-policy: ${result.protectedChanges.length} protected change(s) covered by ${result.parsedRecords.length} append-only record(s) in ${result.range}`,
    );
  }
} catch (error) {
  console.error(`golden-artifact-policy: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
