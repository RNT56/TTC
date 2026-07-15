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
  durationS: number;
  rateHz: number;
  inputName: string;
  inputLayout: string[];
  outputName: string;
  outputLayout: string[];
  modelBytes: Uint8Array;
  modelSha256: string;
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

  const io = output.io;
  const headerHash = stringField(io?.onnxHeader?.contractHash, "ONNX header contract hash");
  if (headerHash !== activeContractHash) throw new Error("ONNX header does not match the active contract");
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

  const targetValues = output.task?.target?.xyzM;
  if (!Array.isArray(targetValues) || targetValues.length !== 3) {
    throw new Error("policy task requires one three-axis SI world target");
  }
  const target = targetValues.map((value, axis) => finiteNumber(value, `policy target axis ${axis}`)) as FocusVector;
  if (target.some((value) => Math.abs(value) > 1_000)) throw new Error("policy target exceeds the 1 km playback bound");

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
    taskId: output.task?.id ?? scorecard.task ?? "policy",
    target,
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
  readonly target: FocusVector;
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

  private constructor(
    private readonly artifact: PreparedPolicyArtifact,
    private readonly ort: OrtModule,
    private readonly session: import("onnxruntime-web/wasm").InferenceSession,
  ) {
    this.taskId = artifact.taskId;
    this.target = artifact.target;
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
    const targetValues = output.task?.target?.xyzM;
    if (!Array.isArray(targetValues) || targetValues.length !== 3) {
      throw new Error("policy task requires one three-axis SI world target");
    }
    const target = targetValues.map((value, axis) => finiteNumber(value, `policy target axis ${axis}`)) as FocusVector;
    const initialSnapshot = await source.policySnapshot(target);
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
      await controller.infer(initialSnapshot);
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

  get inferenceCount(): number {
    return this.inferenceCountValue;
  }

  get failure(): string | null {
    return this.failureValue;
  }

  schedule(elapsedS: number, source: PolicySnapshotSource): void {
    if (this.disposed || this.pending || this.failureValue || elapsedS + 1e-9 < this.nextInferenceS) return;
    this.nextInferenceS = elapsedS + 1 / this.rateHz;
    this.pending = true;
    void source
      .policySnapshot(this.target)
      .then((snapshot) => (this.disposed ? undefined : this.infer(snapshot)))
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

  private releaseRuntime(): void {
    if (this.releaseStarted) return;
    this.releaseStarted = true;
    void this.session.release();
  }
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
