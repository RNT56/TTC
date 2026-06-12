/* tslint:disable */
/* eslint-disable */

/**
 * The `tick` boundary call as a stateful session.
 */
export class Session {
    free(): void;
    [Symbol.dispose](): void;
    constructor(contract_json: string);
    node_names(): string[];
    /**
     * Advance and return the pose buffer (16 f32 per node, column-major).
     * v0 copies out; zero-copy views over linear memory are the P1-005
     * refinement.
     */
    step(dt: number, throttle: number, pitch: number, roll: number, yaw: number, drive: number, turn: number): Float32Array;
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
    readonly __wbg_session_free: (a: number, b: number) => void;
    readonly bake: (a: number, b: number) => [number, number, number, number];
    readonly golden: (a: number, b: number) => [number, number, number, number];
    readonly patch: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly schema: () => [number, number];
    readonly session_new: (a: number, b: number) => [number, number, number];
    readonly session_node_names: (a: number) => [number, number];
    readonly session_step: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
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
