export const GHOST_OVERLAY_SCHEMA = "forge-ghost-overlay";
export const GHOST_OVERLAY_VERSION = "1.0.0";
export const GHOST_OVERLAY_SCHEMA_VERSION = `${GHOST_OVERLAY_SCHEMA}/${GHOST_OVERLAY_VERSION}`;
export const GHOST_OVERLAY_FRAME = "forge-y-up-rh-m";
export const GHOST_MAX_DURATION_S = 600;
export const GHOST_MAX_RENDER_POINTS = 6_001;
export const GHOST_PLAYBACK_HZ = 60;

export const GHOST_POINT_LAYOUT = [
  "timeS",
  "actualXM",
  "actualYM",
  "actualZM",
  "predictedXM",
  "predictedYM",
  "predictedZM",
  "divergenceM",
] as const;

export type GhostPoint = [number, number, number, number, number, number, number, number];
export type GhostSeekEntry = [number, number];

export interface GhostDivergence {
  sampleCount: number;
  maxM: number | null;
  rmsM: number | null;
  warnM: number;
  status: "tracking" | "diverged" | "missing";
}

export interface GhostReplay {
  schemaVersion: typeof GHOST_OVERLAY_SCHEMA_VERSION;
  frame: typeof GHOST_OVERLAY_FRAME;
  sourceMaturity: "controlled-synthetic" | "unverified";
  sourceSampleCount: number;
  sourceSampleRateHz: number;
  startS: number;
  endS: number;
  durationS: number;
  renderRateHz: number;
  points: GhostPoint[];
  seekIndex: GhostSeekEntry[];
  divergence: GhostDivergence;
  deviceIdentityVerified: false;
  recordedDeviceVerified: false;
  fieldSessionVerified: false;
}

export interface GhostFrame {
  timeS: number;
  actualPositionM: [number, number, number];
  predictedPositionM: [number, number, number];
  divergenceM: number;
  beforePoint: number;
  afterPoint: number;
}

export interface GhostProjection {
  width: number;
  height: number;
  padding: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  actualPolyline: string;
  predictedPolyline: string;
}

export function parseGhostReplay(value: unknown): GhostReplay {
  const source = record(value, "ghost overlay");
  requireExact(source.schemaVersion, GHOST_OVERLAY_SCHEMA_VERSION, "schemaVersion");
  requireExact(source.enabled, true, "enabled");
  requireExact(source.frame, GHOST_OVERLAY_FRAME, "frame");
  requireExact(source.divergenceMetric, "position-rmse", "divergenceMetric");
  requireStringArray(source.pointLayout, GHOST_POINT_LAYOUT, "pointLayout");
  const sourceMaturity = source.sourceMaturity;
  if (sourceMaturity !== "controlled-synthetic" && sourceMaturity !== "unverified") {
    throw new Error("ghost overlay sourceMaturity is unsupported");
  }
  requireExact(source.deviceIdentityVerified, false, "deviceIdentityVerified");
  requireExact(source.recordedDeviceVerified, false, "recordedDeviceVerified");
  requireExact(source.fieldSessionVerified, false, "fieldSessionVerified");

  const startS = finiteNumber(source.startS, "startS", 0, 1.0e12);
  const endS = finiteNumber(source.endS, "endS", startS, startS + GHOST_MAX_DURATION_S);
  const durationS = finiteNumber(source.durationS, "durationS", 0, GHOST_MAX_DURATION_S);
  if (Math.abs(endS - startS - durationS) > 1.0e-6) {
    throw new Error("ghost overlay duration does not match its time bounds");
  }
  const sourceSampleCount = integer(source.sourceSampleCount, "sourceSampleCount", 2, 100_000);
  const sourceSampleRateHz = finiteNumber(source.sourceSampleRateHz, "sourceSampleRateHz", 0, 10_000);
  const renderRateHz = finiteNumber(source.renderRateHz, "renderRateHz", 0, 1_000);
  requireExact(source.maxRenderPointCount, GHOST_MAX_RENDER_POINTS, "maxRenderPointCount");

  if (!Array.isArray(source.points) || source.points.length < 2 || source.points.length > GHOST_MAX_RENDER_POINTS) {
    throw new Error("ghost overlay points are outside the supported bound");
  }
  requireExact(source.renderPointCount, source.points.length, "renderPointCount");
  const points = source.points.map((point, index) => parsePoint(point, index));
  if (points[0][0] !== startS || points.at(-1)?.[0] !== endS) {
    throw new Error("ghost overlay endpoints do not match its time bounds");
  }
  for (let index = 1; index < points.length; index += 1) {
    if (points[index][0] <= points[index - 1][0]) {
      throw new Error("ghost overlay point time must be strictly increasing");
    }
  }
  if (sourceSampleCount < points.length) {
    throw new Error("ghost overlay cannot contain more render points than source samples");
  }
  const computedRenderRateHz = durationS > 0 ? (points.length - 1) / durationS : 0;
  if (Math.abs(computedRenderRateHz - renderRateHz) > 1.0e-6) {
    throw new Error("ghost overlay renderRateHz does not match its point/time bounds");
  }

  if (!Array.isArray(source.seekIndex) || source.seekIndex.length < 2 || source.seekIndex.length > 602) {
    throw new Error("ghost overlay seekIndex is outside the supported bound");
  }
  const seekIndex = source.seekIndex.map((entry, index) => parseSeekEntry(entry, index, points));
  if (seekIndex[0][0] !== startS || seekIndex.at(-1)?.[0] !== endS) {
    throw new Error("ghost overlay seekIndex does not span the trace");
  }
  for (let index = 1; index < seekIndex.length; index += 1) {
    if (seekIndex[index][0] <= seekIndex[index - 1][0] || seekIndex[index][1] < seekIndex[index - 1][1]) {
      throw new Error("ghost overlay seekIndex must be monotonic");
    }
    if (seekIndex[index][0] - seekIndex[index - 1][0] > 1.000001) {
      throw new Error("ghost overlay seekIndex spacing exceeds one second");
    }
  }

  return {
    schemaVersion: GHOST_OVERLAY_SCHEMA_VERSION,
    frame: GHOST_OVERLAY_FRAME,
    sourceMaturity,
    sourceSampleCount,
    sourceSampleRateHz,
    startS,
    endS,
    durationS,
    renderRateHz,
    points,
    seekIndex,
    divergence: parseDivergence(source.divergence),
    deviceIdentityVerified: false,
    recordedDeviceVerified: false,
    fieldSessionVerified: false,
  };
}

export function tryParseGhostReplay(value: unknown): GhostReplay | null {
  try {
    return parseGhostReplay(value);
  } catch {
    return null;
  }
}

export function seekGhostReplay(replay: GhostReplay, requestedTimeS: number): GhostFrame {
  const timeS = Math.min(replay.endS, Math.max(replay.startS, requestedTimeS));
  let indexLow = 0;
  let indexHigh = replay.seekIndex.length - 1;
  while (indexLow < indexHigh) {
    const middle = Math.ceil((indexLow + indexHigh) / 2);
    if (replay.seekIndex[middle][0] <= timeS) indexLow = middle;
    else indexHigh = middle - 1;
  }
  const pointLow = replay.seekIndex[indexLow][1];
  const pointHigh = Math.min(
    replay.points.length - 1,
    indexLow + 1 < replay.seekIndex.length ? replay.seekIndex[indexLow + 1][1] + 1 : replay.points.length - 1,
  );
  let before = pointLow;
  let after = pointHigh;
  while (before < after) {
    const middle = Math.ceil((before + after) / 2);
    if (replay.points[middle][0] <= timeS) before = middle;
    else after = middle - 1;
  }
  after = Math.min(replay.points.length - 1, before + 1);
  const left = replay.points[before];
  const right = replay.points[after];
  const span = right[0] - left[0];
  const ratio = span > 0 ? (timeS - left[0]) / span : 0;
  return {
    timeS,
    actualPositionM: [mix(left[1], right[1], ratio), mix(left[2], right[2], ratio), mix(left[3], right[3], ratio)],
    predictedPositionM: [mix(left[4], right[4], ratio), mix(left[5], right[5], ratio), mix(left[6], right[6], ratio)],
    divergenceM: mix(left[7], right[7], ratio),
    beforePoint: before,
    afterPoint: after,
  };
}

export function projectGhostReplay(replay: GhostReplay, width = 320, height = 120, padding = 10): GhostProjection {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const point of replay.points) {
    minX = Math.min(minX, point[1], point[4]);
    maxX = Math.max(maxX, point[1], point[4]);
    minZ = Math.min(minZ, point[3], point[6]);
    maxZ = Math.max(maxZ, point[3], point[6]);
  }
  if (maxX - minX < 1.0e-9) maxX = minX + 1;
  if (maxZ - minZ < 1.0e-9) maxZ = minZ + 1;
  const projection = { width, height, padding, minX, maxX, minZ, maxZ };
  return {
    ...projection,
    actualPolyline: replay.points.map((point) => projectGhostPosition(projection, [point[1], point[2], point[3]]).join(",")).join(" "),
    predictedPolyline: replay.points
      .map((point) => projectGhostPosition(projection, [point[4], point[5], point[6]]).join(","))
      .join(" "),
  };
}

export function projectGhostPosition(
  projection: Pick<GhostProjection, "width" | "height" | "padding" | "minX" | "maxX" | "minZ" | "maxZ">,
  positionM: [number, number, number],
): [number, number] {
  const x = projection.padding + ((positionM[0] - projection.minX) / (projection.maxX - projection.minX)) * (projection.width - 2 * projection.padding);
  const y = projection.height - projection.padding - ((positionM[2] - projection.minZ) / (projection.maxZ - projection.minZ)) * (projection.height - 2 * projection.padding);
  return [Number(x.toFixed(3)), Number(y.toFixed(3))];
}

function parsePoint(value: unknown, index: number): GhostPoint {
  if (!Array.isArray(value) || value.length !== GHOST_POINT_LAYOUT.length) {
    throw new Error(`ghost overlay point ${index} has the wrong layout`);
  }
  const point = value.map((item, itemIndex) => finiteNumber(item, `points[${index}][${itemIndex}]`, itemIndex === 0 ? 0 : -1.0e6, itemIndex === 0 ? 1.0e12 : 1.0e6)) as GhostPoint;
  if (point[7] < 0) throw new Error(`ghost overlay point ${index} has negative divergence`);
  const computed = Math.hypot(point[1] - point[4], point[2] - point[5], point[3] - point[6]);
  if (Math.abs(computed - point[7]) > 2.0e-5) {
    throw new Error(`ghost overlay point ${index} divergence is inconsistent`);
  }
  return point;
}

function parseSeekEntry(value: unknown, index: number, points: GhostPoint[]): GhostSeekEntry {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`ghost overlay seekIndex entry ${index} has the wrong layout`);
  }
  const timeS = finiteNumber(value[0], `seekIndex[${index}][0]`, points[0][0], points.at(-1)?.[0] ?? points[0][0]);
  const pointIndex = integer(value[1], `seekIndex[${index}][1]`, 0, points.length - 1);
  if (points[pointIndex][0] > timeS || (pointIndex + 1 < points.length && points[pointIndex + 1][0] <= timeS)) {
    throw new Error(`ghost overlay seekIndex entry ${index} does not address the preceding point`);
  }
  return [timeS, pointIndex];
}

function parseDivergence(value: unknown): GhostDivergence {
  const source = record(value, "ghost divergence");
  const statusValue = source.status;
  if (statusValue !== "tracking" && statusValue !== "diverged" && statusValue !== "missing") {
    throw new Error("ghost divergence status is unsupported");
  }
  const status: GhostDivergence["status"] = statusValue;
  const nullable = (item: unknown, label: string): number | null =>
    item === null ? null : finiteNumber(item, label, 0, 1.0e6);
  const divergence = {
    sampleCount: integer(source.sampleCount, "divergence.sampleCount", 0, 100_000),
    maxM: nullable(source.maxM, "divergence.maxM"),
    rmsM: nullable(source.rmsM, "divergence.rmsM"),
    warnM: finiteNumber(source.warnM, "divergence.warnM", 0, 1.0e6),
    status,
  };
  if (status === "missing" ? divergence.maxM !== null || divergence.rmsM !== null : divergence.maxM === null || divergence.rmsM === null) {
    throw new Error("ghost divergence values do not match status");
  }
  if (divergence.maxM !== null && divergence.rmsM !== null) {
    if (divergence.rmsM > divergence.maxM + 1.0e-6) {
      throw new Error("ghost divergence RMS exceeds its maximum");
    }
    if (
      (status === "diverged" && divergence.maxM < divergence.warnM)
      || (status === "tracking" && divergence.maxM >= divergence.warnM)
    ) {
      throw new Error("ghost divergence status does not match its threshold");
    }
  }
  return divergence;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`ghost overlay ${label} is outside the supported bound`);
  }
  return value;
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  const parsed = finiteNumber(value, label, minimum, maximum);
  if (!Number.isInteger(parsed)) throw new Error(`ghost overlay ${label} must be an integer`);
  return parsed;
}

function requireExact(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`ghost overlay ${label} is unsupported`);
}

function requireStringArray(actual: unknown, expected: readonly string[], label: string): void {
  if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((item, index) => item !== expected[index])) {
    throw new Error(`ghost overlay ${label} is unsupported`);
  }
}

function mix(left: number, right: number, ratio: number): number {
  return left + (right - left) * ratio;
}
