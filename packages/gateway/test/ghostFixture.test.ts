import assert from "node:assert/strict";
import test from "node:test";

import {
  GHOST_MAX_RENDER_POINTS,
  GHOST_OVERLAY_FRAME,
  GHOST_OVERLAY_SCHEMA,
  GHOST_OVERLAY_VERSION,
  fixtureJobOutput,
} from "../src/platform.js";

test("D57 fixture emits one bounded indexed ten-minute ghost overlay without hardware authority", () => {
  const output = fixtureJobOutput("maintenance.crash-forensics", {}) as {
    artifactKind: string;
    crashDetected: boolean;
    window: { startS: number; impactS: number; endS: number };
    ghostOverlay: {
      schemaVersion: string;
      frame: string;
      sourceMaturity: string;
      sourceSampleCount: number;
      sourceSampleRateHz: number;
      durationS: number;
      renderPointCount: number;
      renderRateHz: number;
      points: number[][];
      seekIndex: number[][];
      divergence: { status: string; maxM: number };
      deviceIdentityVerified: boolean;
      recordedDeviceVerified: boolean;
      fieldSessionVerified: boolean;
    };
  };

  assert.equal(output.artifactKind, "crash-forensics");
  assert.equal(output.crashDetected, true);
  assert.deepEqual(output.window, { startS: 537, impactS: 540, endS: 543 });
  assert.equal(
    output.ghostOverlay.schemaVersion,
    `${GHOST_OVERLAY_SCHEMA}/${GHOST_OVERLAY_VERSION}`,
  );
  assert.equal(output.ghostOverlay.frame, GHOST_OVERLAY_FRAME);
  assert.equal(output.ghostOverlay.sourceMaturity, "controlled-synthetic");
  assert.equal(output.ghostOverlay.sourceSampleCount, 36_001);
  assert.equal(output.ghostOverlay.sourceSampleRateHz, 60);
  assert.equal(output.ghostOverlay.durationS, 600);
  assert.equal(output.ghostOverlay.renderPointCount, GHOST_MAX_RENDER_POINTS);
  assert.equal(output.ghostOverlay.renderRateHz, 10);
  assert.equal(output.ghostOverlay.points.length, GHOST_MAX_RENDER_POINTS);
  assert.equal(output.ghostOverlay.points[5_400][0], 540);
  assert.equal(output.ghostOverlay.points.at(-1)?.[0], 600);
  assert.deepEqual(output.ghostOverlay.seekIndex[540], [540, 5_400]);
  assert.equal(output.ghostOverlay.seekIndex.length, 601);
  assert.equal(output.ghostOverlay.divergence.status, "diverged");
  assert.ok(output.ghostOverlay.divergence.maxM > 0.35);
  assert.equal(output.ghostOverlay.deviceIdentityVerified, false);
  assert.equal(output.ghostOverlay.recordedDeviceVerified, false);
  assert.equal(output.ghostOverlay.fieldSessionVerified, false);
});
