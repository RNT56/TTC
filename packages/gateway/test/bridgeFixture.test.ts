import assert from "node:assert/strict";
import test from "node:test";

import { fixtureJobOutput } from "../src/platform.js";

test("D48 bridge fixture matches the exact cross-language v1 artifact", () => {
  const output = fixtureJobOutput("bridge.config-diff", {
    firmware: "betaflight",
    mixer: "quadx",
    rates: { failsafe_delay: 10 },
  }) as Record<string, unknown>;

  assert.deepEqual(output, {
    schemaVersion: "forge-bridge-config/1.0.0",
    artifactKind: "bridge-config",
    firmware: "betaflight",
    firmwareVersion: "2025.12",
    diffHash: "0f8173a135515f3759993e7b495e12fbf2f903e667b752bdc226d9612e4736ba",
    requiresPhysicalConfirmation: true,
    noAutoArm: true,
    lines: [
      "# FORGE generated betaflight 2025.12 config diff",
      "set failsafe_delay = 10",
      "save",
    ],
  });
});
