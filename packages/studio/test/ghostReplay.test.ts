import assert from "node:assert/strict";
import test from "node:test";

import {
  GHOST_MAX_RENDER_POINTS,
  GHOST_OVERLAY_FRAME,
  GHOST_OVERLAY_SCHEMA_VERSION,
  GHOST_PLAYBACK_HZ,
  GHOST_POINT_LAYOUT,
  parseGhostReplay,
  projectGhostPosition,
  projectGhostReplay,
  seekGhostReplay,
  tryParseGhostReplay,
} from "../src/ghostReplay.ts";

function tenMinuteOverlay() {
  const durationS = 600;
  const renderRateHz = 10;
  const points = Array.from({ length: GHOST_MAX_RENDER_POINTS }, (_, index) => {
    const timeS = index / renderRateHz;
    const actualXM = timeS / 100;
    const phase = (timeS % 60) / 60;
    const actualZM = phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
    const divergenceM = 0.02 + Math.max(0, timeS - 480) * 0.008;
    return [timeS, actualXM, 1, actualZM, actualXM - divergenceM, 1, actualZM, divergenceM];
  });
  return {
    schemaVersion: GHOST_OVERLAY_SCHEMA_VERSION,
    enabled: true,
    disabledReason: null,
    frame: GHOST_OVERLAY_FRAME,
    pointLayout: GHOST_POINT_LAYOUT,
    divergenceMetric: "position-rmse",
    sourceMaturity: "controlled-synthetic",
    sourceSampleCount: 36_001,
    sourceSampleRateHz: 60,
    startS: 0,
    endS: durationS,
    durationS,
    renderPointCount: points.length,
    renderRateHz,
    maxRenderPointCount: GHOST_MAX_RENDER_POINTS,
    points,
    seekIndex: Array.from({ length: durationS + 1 }, (_, second) => [second, second * renderRateHz]),
    divergence: { sampleCount: 361, maxM: 0.524, rmsM: 0.5, warnM: 0.35, status: "diverged" },
    deviceIdentityVerified: false,
    recordedDeviceVerified: false,
    fieldSessionVerified: false,
  };
}

test("D57 parses, projects, and interpolates the bounded indexed overlay", () => {
  const replay = parseGhostReplay(tenMinuteOverlay());
  assert.equal(replay.durationS, 600);
  assert.equal(replay.points.length, 6_001);
  assert.equal(replay.seekIndex.length, 601);

  const frame = seekGhostReplay(replay, 540.05);
  assert.equal(frame.beforePoint, 5_400);
  assert.equal(frame.afterPoint, 5_401);
  assert.ok(Math.abs(frame.timeS - 540.05) < 1.0e-9);
  assert.ok(Math.abs(frame.divergenceM - 0.5004) < 1.0e-9);
  assert.deepEqual(seekGhostReplay(replay, -10).timeS, 0);
  assert.deepEqual(seekGhostReplay(replay, 900).timeS, 600);

  const projection = projectGhostReplay(replay);
  assert.equal(projection.actualPolyline.split(" ").length, 6_001);
  assert.equal(projection.predictedPolyline.split(" ").length, 6_001);
  const actual = projectGhostPosition(projection, frame.actualPositionM);
  const predicted = projectGhostPosition(projection, frame.predictedPositionM);
  assert.ok(actual[0] > predicted[0]);
});

test("D57 rejects version, index, physical-value, and authority substitution", () => {
  const wrongVersion = { ...tenMinuteOverlay(), schemaVersion: "forge-ghost-overlay/2.0.0" };
  assert.equal(tryParseGhostReplay(wrongVersion), null);

  const promoted = { ...tenMinuteOverlay(), recordedDeviceVerified: true };
  assert.throws(() => parseGhostReplay(promoted), /recordedDeviceVerified is unsupported/);

  const badIndex = tenMinuteOverlay();
  badIndex.seekIndex[10] = [10, 101];
  assert.throws(() => parseGhostReplay(badIndex), /does not address the preceding point/);

  const sparseIndex = tenMinuteOverlay();
  sparseIndex.seekIndex = [[0, 0], [600, 6_000]];
  assert.throws(() => parseGhostReplay(sparseIndex), /spacing exceeds one second/);

  const badPoint = tenMinuteOverlay();
  badPoint.points[20] = [...badPoint.points[20]];
  badPoint.points[20][7] += 1;
  assert.throws(() => parseGhostReplay(badPoint), /divergence is inconsistent/);
});

test("D57 indexed seek computation stays inside one 60 Hz frame budget across a ten-minute trace", () => {
  const replay = parseGhostReplay(tenMinuteOverlay());
  const frameCount = replay.durationS * GHOST_PLAYBACK_HZ + 1;
  let checksum = 0;
  const started = performance.now();
  for (let frame = 0; frame < frameCount; frame += 1) {
    checksum += seekGhostReplay(replay, frame / GHOST_PLAYBACK_HZ).divergenceM;
  }
  const elapsedMs = performance.now() - started;
  assert.ok(checksum > 0);
  assert.ok(
    elapsedMs / frameCount < 1_000 / GHOST_PLAYBACK_HZ,
    `average indexed seek ${elapsedMs / frameCount} ms exceeded the 60 Hz frame budget`,
  );
});
