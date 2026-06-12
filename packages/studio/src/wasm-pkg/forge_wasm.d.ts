/* tslint:disable */
/* eslint-disable */

/**
 * Stateful bake handle (P1-005): meta crosses as JSON once; mesh buffers
 * cross as typed-array views over wasm linear memory — geometry never
 * round-trips through JSON. Re-bake in place via `patch` (the
 * configurator loop primitive).
 */
export class Bake {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The current (possibly patched) contract document.
     */
    contract(): string;
    /**
     * Zero-copy triangle index view for one part; same lifetime rule as
     * `positions`.
     */
    indices(part: number): Uint32Array;
    /**
     * Counts, HUD, node transforms, part table — everything but buffers.
     */
    meta(): string;
    constructor(contract_json: string);
    /**
     * Zero-copy normal view for one part (3 f32 per vertex); same
     * lifetime rule as `positions`.
     */
    normals(part: number): Float32Array;
    part_count(): number;
    /**
     * Apply a JSON-Patch to the contract and re-bake in place; returns
     * fresh meta. INCREMENTAL: parts whose (geom, pose) are untouched
     * reuse their buffers — a configurator color patch re-bakes zero
     * geometry (the ≤ 10 ms budget holds with room for 1000-part models).
     */
    patch(patch_json: string): string;
    /**
     * Zero-copy position view for one part (3 f32 per vertex). Valid only
     * until the next wasm memory growth — consume synchronously.
     */
    positions(part: number): Float32Array;
}

/**
 * The `tick` boundary call as a stateful session.
 */
export class Session {
    free(): void;
    [Symbol.dispose](): void;
    clear_jog(): void;
    /**
     * Drive-mode camera focus (x, y, z) — the driver's body position at
     * its natural viewing height.
     */
    focus(): Float64Array;
    constructor(contract_json: string);
    node_names(): string[];
    /**
     * Zero-copy pose view (16 f32 per node, column-major, `node_names`
     * order). Valid only until the next wasm memory growth — read it
     * synchronously every frame, never hold it.
     */
    pose_view(): Float32Array;
    /**
     * Teach-pendant jog (P1-013): per-node euler offset over the pose
     * layers; zeros clear the node.
     */
    set_jog(node: string, rx: number, ry: number): void;
    /**
     * Advance the fixed-step clock; returns the number of 120 Hz steps
     * executed. Read the result through `pose_view` (P1-005 zero-copy).
     */
    step(dt: number, throttle: number, pitch: number, roll: number, yaw: number, drive: number, turn: number): number;
}

export function bake(contract_json: string): string;

/**
 * Golden-number report (XT-001): must equal the native binary's output
 * byte for byte.
 */
export function golden(contract_json: string): string;

/**
 * JSON-Patch application with shape re-check (the `patch` boundary call).
 */
export function patch(contract_json: string, patch_json: string): string;

export function schema(): string;

export function validate(contract_json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_bake_free: (a: number, b: number) => void;
    readonly __wbg_session_free: (a: number, b: number) => void;
    readonly bake: (a: number, b: number) => [number, number, number, number];
    readonly bake_contract: (a: number) => [number, number];
    readonly bake_indices: (a: number, b: number) => [number, number, number];
    readonly bake_meta: (a: number) => [number, number];
    readonly bake_new: (a: number, b: number) => [number, number, number];
    readonly bake_normals: (a: number, b: number) => [number, number, number];
    readonly bake_part_count: (a: number) => number;
    readonly bake_patch: (a: number, b: number, c: number) => [number, number, number, number];
    readonly bake_positions: (a: number, b: number) => [number, number, number];
    readonly golden: (a: number, b: number) => [number, number, number, number];
    readonly patch: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly schema: () => [number, number];
    readonly session_clear_jog: (a: number) => void;
    readonly session_focus: (a: number) => [number, number];
    readonly session_new: (a: number, b: number) => [number, number, number];
    readonly session_node_names: (a: number) => [number, number];
    readonly session_pose_view: (a: number) => any;
    readonly session_set_jog: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly session_step: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
    readonly validate: (a: number, b: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
