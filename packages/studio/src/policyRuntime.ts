import type { PolicyOutput } from "./jobOutputs";
import type { DriveInput, FocusVector, PolicyObservationSnapshot } from "./sessionProtocol";

export const POLICY_TENSOR_SCHEMA = "forge-policy-tensor";
export const POLICY_TENSOR_VERSION = "1.0.0";
export const MAX_POLICY_MODEL_BYTES = 4 * 1024 * 1024;
const ALLOWED_ACTIONS = new Set(["throttle", "roll", "pitch", "yaw", "drive", "turn"]);
const ZERO_INPUT: DriveInput = { throttle: 0, pitch: 0, roll: 0, yaw: 0, drive: 0, turn: 0 };

interface PolicySnapshotSource {
  policySnapshot(target: FocusVector): Promise<PolicyObservationSnapshot>;
}

export interface PreparedPolicyArtifact {
  taskId: string;
  target: FocusVector;
  targets: PreparedPolicyTarget[];
  durationS: number;
  rateHz: number;
  inputName: string;
  inputLayout: string[];
  outputName: string;
  outputLayout: string[];
  modelBytes: Uint8Array;
  modelSha256: string;
}

export interface PreparedPolicyTarget {
  kind: "position" | "waypoint";
  xyzM: FocusVector;
  radiusM: number;
}

type OrtModule = typeof import("onnxruntime-web/wasm");
let runtimePromise: Promise<OrtModule> | null = null;

async function loadRuntime(): Promise<OrtModule> {
  runtimePromise ??= import("onnxruntime-web/wasm").then((ort) => {
    // One deterministic WASM execution lane. The ONNX chunk and runtime WASM
    // stay lazy and same-origin; no CDN or mutable provider is involved.
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    return ort;
  });
  return runtimePromise;
}

export async function preparePolicyArtifact(
  output: PolicyOutput,
  activeContractHash: string,
  coreLayout: readonly string[],
  retainedModelBytes?: Uint8Array,
): Promise<PreparedPolicyArtifact> {
  assertSha256(activeContractHash, "active contract hash");
  const scorecard = output.scorecard;
  if (scorecard?.exportable !== true) throw new Error("policy scorecard is held; playback is blocked");
  if (scorecard.trainedOnEstimator !== true || scorecard.estimatorSmoke !== "passed") {
    throw new Error("policy scorecard lacks passed estimator-source evidence (D8)");
  }
  if ((scorecard.reasons?.length ?? 0) > 0) throw new Error("policy scorecard carries blocking reasons");
  const lineageHash = stringField(scorecard.lineage?.contractHash, "scorecard lineage contract hash");
  if (lineageHash !== activeContractHash) throw new Error("policy scorecard lineage does not match the active contract");

  const taskId = boundedName(output.task?.id ?? scorecard.task, "policy task ID");
  const targets = policyTargets(output);
  const versionedTask = Array.isArray(output.task?.targets) || output.task?.version !== undefined;
  if (versionedTask) {
    if (output.task?.suite !== "p7-v2" || output.task.version !== "2.0.0") {
      throw new Error("unsupported versioned policy task; expected p7-v2 2.0.0");
    }
    if (output.task.coordinateFrame !== "forge-y-up-rh-m") {
      throw new Error("policy task must use FORGE Y-up/right-handed/SI coordinates");
    }
    const taskDefinitionHash = stringField(output.task.definitionHash, "policy task definition hash").toLowerCase();
    assertSha256(taskDefinitionHash, "policy task definition hash");
    if (scorecard.task !== taskId || scorecard.taskVersion !== output.task.version) {
      throw new Error("policy scorecard does not match the versioned task");
    }
    if (scorecard.lineage?.taskDefinitionHash !== taskDefinitionHash) {
      throw new Error("policy scorecard lineage does not match the task definition");
    }
    const legacyTarget = output.task.target?.xyzM;
    if (!sameVector(legacyTarget, targets[0].xyzM)) {
      throw new Error("policy task target does not match the first declared target");
    }
  }

  const io = output.io;
  const headerHash = stringField(io?.onnxHeader?.contractHash, "ONNX header contract hash");
  if (headerHash !== activeContractHash) throw new Error("ONNX header does not match the active contract");
  if (versionedTask) {
    if (
      io?.onnxHeader?.task !== taskId
      || io.onnxHeader.taskVersion !== output.task?.version
      || io.onnxHeader.taskDefinitionHash !== output.task?.definitionHash
    ) {
      throw new Error("ONNX header does not match the versioned task authority");
    }
  }
  if (
    io?.onnxHeader?.tensorSchema !== POLICY_TENSOR_SCHEMA ||
    io.onnxHeader.tensorVersion !== POLICY_TENSOR_VERSION
  ) {
    throw new Error(`unsupported ONNX tensor schema; expected ${POLICY_TENSOR_SCHEMA}`);
  }
  const tensor = io?.tensor;
  if (tensor?.schema !== POLICY_TENSOR_SCHEMA || tensor.schemaVersion !== POLICY_TENSOR_VERSION) {
    throw new Error(`missing ${POLICY_TENSOR_SCHEMA} ${POLICY_TENSOR_VERSION} tensor contract`);
  }
  if (tensor.coordinateFrame !== "forge-y-up-rh-m") {
    throw new Error("ONNX tensor contract must use FORGE Y-up/right-handed/SI coordinates");
  }
  const inputName = boundedName(tensor.input?.name, "ONNX input name");
  const outputName = boundedName(tensor.output?.name, "ONNX output name");
  const inputLayout = stringList(tensor.input?.layout, "ONNX input layout", 1, 256);
  const outputLayout = stringList(tensor.output?.layout, "ONNX output layout", 1, 64);
  assertExactList(inputLayout, coreLayout, "ONNX input layout/core observer");
  const declaredActions = stringList(io?.actions, "policy action layout", 1, 64);
  assertExactList(outputLayout, declaredActions, "ONNX output/action layout");
  if (new Set(outputLayout).size !== outputLayout.length || outputLayout.some((name) => !ALLOWED_ACTIONS.has(name))) {
    throw new Error("ONNX action layout contains duplicate or unsupported motion targets");
  }
  assertShape(tensor.input?.shape, [1, inputLayout.length], "ONNX input shape");
  assertShape(tensor.output?.shape, [1, outputLayout.length], "ONNX output shape");
  const rateHz = finiteNumber(tensor.rateHz, "policy rate");
  if (!Number.isInteger(rateHz) || rateHz < 1 || rateHz > 50) {
    throw new Error("policy rate must be an integer from 1 through 50 Hz (D9)");
  }

  const onnx = output.onnx;
  if (onnx?.opset !== 18) throw new Error("fixture policy must declare ONNX opset 18");
  const declaredSize = finiteNumber(onnx.byteSize, "ONNX byte size");
  if (!Number.isSafeInteger(declaredSize) || declaredSize <= 0 || declaredSize > MAX_POLICY_MODEL_BYTES) {
    throw new Error(`ONNX model exceeds the ${MAX_POLICY_MODEL_BYTES}-byte playback bound`);
  }
  const modelBytes = retainedModelBytes?.slice()
    ?? decodeBase64(stringField(onnx.modelBase64, "ONNX model bytes"));
  if (modelBytes.byteLength !== declaredSize) throw new Error("ONNX model byte count does not match its header");
  const modelSha256 = stringField(onnx.sha256, "ONNX model SHA-256").toLowerCase();
  assertSha256(modelSha256, "ONNX model SHA-256");
  const actualSha256 = await sha256Hex(modelBytes);
  if (actualSha256 !== modelSha256) throw new Error("ONNX model SHA-256 mismatch");

  const horizonS = finiteNumber(output.task?.horizonS ?? 60, "policy task horizon");
  const durationS = Math.max(2, Math.min(8, horizonS / 10));
  return {
    taskId,
    target: targets[0].xyzM,
    targets,
    durationS,
    rateHz,
    inputName,
    inputLayout,
    outputName,
    outputLayout,
    modelBytes,
    modelSha256,
  };
}

export class BrowserPolicyController {
  readonly taskId: string;
  readonly durationS: number;
  readonly rateHz: number;
  readonly modelSha256: string;
  private latestInput: DriveInput = { ...ZERO_INPUT };
  private inferenceCountValue = 0;
  private nextInferenceS = 0;
  private pending = false;
  private failureValue: string | null = null;
  private disposed = false;
  private releaseStarted = false;
  private targetIndexValue = 0;
  private targetsCompletedValue = 0;
  private taskCompletedValue = false;

  private constructor(
    private readonly artifact: PreparedPolicyArtifact,
    private readonly ort: OrtModule,
    private readonly session: import("onnxruntime-web/wasm").InferenceSession,
  ) {
    this.taskId = artifact.taskId;
    this.durationS = artifact.durationS;
    this.rateHz = artifact.rateHz;
    this.modelSha256 = artifact.modelSha256;
  }

  static async create(
    output: PolicyOutput,
    activeContractHash: string,
    source: PolicySnapshotSource,
    retainedModelBytes?: Uint8Array,
  ): Promise<BrowserPolicyController> {
    const declaredTargets = policyTargets(output);
    const initialSnapshot = await source.policySnapshot(declaredTargets[0].xyzM);
    const artifact = await preparePolicyArtifact(
      output,
      activeContractHash,
      initialSnapshot.layout,
      retainedModelBytes,
    );
    const ort = await loadRuntime();
    const session = await ort.InferenceSession.create(artifact.modelBytes.slice(), {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    try {
      assertExactList([...session.inputNames], [artifact.inputName], "runtime ONNX input names");
      assertExactList([...session.outputNames], [artifact.outputName], "runtime ONNX output names");
      const controller = new BrowserPolicyController(artifact, ort, session);
      await controller.processSnapshot(initialSnapshot, source);
      controller.nextInferenceS = 1 / controller.rateHz;
      return controller;
    } catch (error) {
      await session.release();
      throw error;
    }
  }

  get input(): DriveInput {
    return { ...this.latestInput };
  }

  get target(): FocusVector {
    return [...this.artifact.targets[this.targetIndexValue].xyzM];
  }

  get targetIndex(): number {
    return this.targetIndexValue;
  }

  get targetCount(): number {
    return this.artifact.targets.length;
  }

  get targetsCompleted(): number {
    return this.targetsCompletedValue;
  }

  get taskCompleted(): boolean {
    return this.taskCompletedValue;
  }

  get inferenceCount(): number {
    return this.inferenceCountValue;
  }

  get failure(): string | null {
    return this.failureValue;
  }

  schedule(elapsedS: number, source: PolicySnapshotSource): void {
    if (
      this.disposed
      || this.pending
      || this.failureValue
      || this.taskCompletedValue
      || elapsedS + 1e-9 < this.nextInferenceS
    ) return;
    this.nextInferenceS = elapsedS + 1 / this.rateHz;
    this.pending = true;
    void source
      .policySnapshot(this.target)
      .then((snapshot) => (this.disposed ? undefined : this.processSnapshot(snapshot, source)))
      .catch((error: unknown) => {
        if (this.disposed) return;
        this.latestInput = { ...ZERO_INPUT };
        this.failureValue = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        this.pending = false;
        if (this.disposed) this.releaseRuntime();
      });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.latestInput = { ...ZERO_INPUT };
    if (!this.pending) this.releaseRuntime();
  }

  private async infer(snapshot: PolicyObservationSnapshot): Promise<void> {
    assertExactList(snapshot.layout, this.artifact.inputLayout, "runtime core observation layout");
    if (snapshot.observations.length !== this.artifact.inputLayout.length) {
      throw new Error("runtime core observation count changed");
    }
    if (!snapshot.observations.every(Number.isFinite)) throw new Error("runtime core observation is non-finite");
    const input = new this.ort.Tensor(
      "float32",
      Float32Array.from(snapshot.observations),
      [1, this.artifact.inputLayout.length],
    );
    let output: import("onnxruntime-web/wasm").Tensor | null = null;
    try {
      const results = await this.session.run({ [this.artifact.inputName]: input });
      const candidate = results[this.artifact.outputName];
      if (!(candidate instanceof this.ort.Tensor)) throw new Error("ONNX runtime omitted the declared action tensor");
      output = candidate;
      assertShape([...candidate.dims], [1, this.artifact.outputLayout.length], "runtime ONNX output shape");
      if (candidate.type !== "float32") throw new Error("runtime ONNX output must be float32");
      const data = await candidate.getData();
      const values = Array.from(data as Float32Array, Number);
      if (values.length !== this.artifact.outputLayout.length || !values.every(Number.isFinite)) {
        throw new Error("runtime ONNX action tensor is malformed or non-finite");
      }
      if (values.some((value) => value < -1.000001 || value > 1.000001)) {
        throw new Error("runtime ONNX action exceeds normalized motion bounds");
      }
      const next = { ...ZERO_INPUT };
      for (let index = 0; index < values.length; index += 1) {
        const action = this.artifact.outputLayout[index] as keyof DriveInput;
        next[action] = Math.max(-1, Math.min(1, values[index]));
      }
      this.latestInput = next;
      this.inferenceCountValue += 1;
    } finally {
      input.dispose();
      output?.dispose();
    }
  }

  private async processSnapshot(
    snapshot: PolicyObservationSnapshot,
    source: PolicySnapshotSource,
  ): Promise<void> {
    let current = snapshot;
    while (!this.disposed && this.currentTargetReached(current)) {
      this.targetsCompletedValue += 1;
      if (this.targetsCompletedValue >= this.artifact.targets.length) {
        this.taskCompletedValue = true;
        this.latestInput = { ...ZERO_INPUT };
        return;
      }
      this.targetIndexValue += 1;
      current = await source.policySnapshot(this.target);
    }
    if (!this.disposed) await this.infer(current);
  }

  private currentTargetReached(snapshot: PolicyObservationSnapshot): boolean {
    const target = this.artifact.targets[this.targetIndexValue];
    if (target.kind !== "waypoint") return false;
    assertExactList(snapshot.layout, this.artifact.inputLayout, "runtime core observation layout");
    if (snapshot.observations.length !== this.artifact.inputLayout.length) {
      throw new Error("runtime core observation count changed");
    }
    if (!snapshot.observations.every(Number.isFinite)) throw new Error("runtime core observation is non-finite");
    const indices = [
      this.artifact.inputLayout.indexOf("target.error.bodyXM"),
      this.artifact.inputLayout.indexOf("target.error.bodyYM"),
      this.artifact.inputLayout.indexOf("target.error.bodyZM"),
    ];
    if (indices.some((index) => index < 0)) throw new Error("runtime tensor omits estimator target error");
    const errorM = Math.hypot(...indices.map((index) => snapshot.observations[index]));
    return errorM <= target.radiusM;
  }

  private releaseRuntime(): void {
    if (this.releaseStarted) return;
    this.releaseStarted = true;
    void this.session.release();
  }
}

function policyTargets(output: PolicyOutput): PreparedPolicyTarget[] {
  const declared = output.task?.targets;
  if (declared !== undefined) {
    if (!Array.isArray(declared) || declared.length < 1 || declared.length > 32) {
      throw new Error("versioned policy task requires between one and 32 targets");
    }
    const targets = declared.map((target, targetIndex): PreparedPolicyTarget => {
      const kind = target?.kind;
      if (kind !== "position" && kind !== "waypoint") {
        throw new Error(`policy target ${targetIndex} has an unsupported kind`);
      }
      const xyzM = focusVector(target.xyzM, `policy target ${targetIndex}`);
      const radiusM = finiteNumber(target.radiusM, `policy target ${targetIndex} radius`);
      if (radiusM < 0.01 || radiusM > 100) {
        throw new Error(`policy target ${targetIndex} radius is outside its supported bound`);
      }
      return { kind, xyzM, radiusM };
    });
    if (output.task?.id === "waypoint-chain" && targets.some((target) => target.kind !== "waypoint")) {
      throw new Error("waypoint-chain policy targets must all be waypoints");
    }
    if (output.task?.id === "hover-hold" && (targets.length !== 1 || targets[0].kind !== "position")) {
      throw new Error("hover-hold policy task requires one position target");
    }
    return targets;
  }
  return [{ kind: "position", xyzM: focusVector(output.task?.target?.xyzM, "policy target"), radiusM: 0.25 }];
}

function focusVector(value: unknown, label: string): FocusVector {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${label} requires one three-axis SI world target`);
  }
  const vector = value.map((axis, index) => finiteNumber(axis, `${label} axis ${index}`)) as FocusVector;
  if (vector.some((axis) => Math.abs(axis) > 1_000)) throw new Error(`${label} exceeds the 1 km playback bound`);
  return vector;
}

function sameVector(value: unknown, expected: FocusVector): boolean {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => typeof entry === "number" && entry === expected[index]);
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 8 * 1024 * 1024) {
    throw new Error(`${label} is missing or out of bounds`);
  }
  return value;
}

function boundedName(value: unknown, label: string): string {
  const name = stringField(value, label);
  if (name.length > 128 || !/^[A-Za-z][A-Za-z0-9_.-]*$/.test(name)) throw new Error(`${label} is invalid`);
  return name;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function stringList(value: unknown, label: string, min: number, max: number): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`${label} is missing or out of bounds`);
  return value.map((entry, index) => boundedName(entry, `${label}[${index}]`));
}

function assertShape(actual: unknown, expected: readonly number[], label: string): void {
  if (!Array.isArray(actual) || actual.length !== expected.length) throw new Error(`${label} does not match`);
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) throw new Error(`${label} does not match`);
  }
}

function assertExactList(actual: readonly string[], expected: readonly string[], label: string): void {
  if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
    throw new Error(`${label} mismatch`);
  }
}

function assertSha256(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error(`${label} must be a 64-character hexadecimal digest`);
}

function decodeBase64(value: string): Uint8Array {
  if (value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("ONNX model bytes are not strict base64");
  }
  const binary = atob(value);
  if (binary.length > MAX_POLICY_MODEL_BYTES) throw new Error(`ONNX model exceeds the ${MAX_POLICY_MODEL_BYTES}-byte playback bound`);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto SHA-256 is required for policy playback");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
