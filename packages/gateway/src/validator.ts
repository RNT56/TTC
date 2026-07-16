// The validation service is mostly process management (plan §5.2): spawn the
// forge-validate binary — process isolation plus guaranteed bit-equality with
// CI (D17). napi-rs hot-path bindings are the OD-08 alternative, measured at P2.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface ValidateResult {
  exitCode: number;
  report: unknown | null;
  stderr: string;
}

export function validatorBin(): string {
  return (
    process.env.FORGE_VALIDATE_BIN ??
    join(process.cwd(), "..", "..", "target", "debug", "forge-validate")
  );
}

export function catalogDir(): string {
  return process.env.FORGE_CATALOG_DIR ?? join(process.cwd(), "..", "..", "catalog");
}

function catalogFlags(): string[] {
  const dir = catalogDir();
  return existsSync(dir) ? ["--catalog", dir] : [];
}

async function runSubcommand(
  subcommand: "run" | "bake" | "bom" | "env",
  contractJson: string,
  extraFlags: string[] = [],
): Promise<ValidateResult> {
  const dir = await mkdtemp(join(tmpdir(), "forge-validate-"));
  const contractPath = join(dir, "contract.json");
  const reportPath = join(dir, "report.json");
  try {
    await writeFile(contractPath, contractJson, "utf8");
    const outFlag = subcommand === "run" || subcommand === "env" ? "--report" : "--out";
    const { code, stderr } = await new Promise<{ code: number; stderr: string }>((resolve) => {
      execFile(
        validatorBin(),
        [subcommand, contractPath, outFlag, reportPath, ...catalogFlags(), ...extraFlags],
        { timeout: 30_000, maxBuffer: 1024 * 1024, killSignal: "SIGKILL" },
        (error, _stdout, stderrBuf) => {
          const code =
            error && typeof (error as NodeJS.ErrnoException).code === "string"
              ? -1 // spawn failure (binary missing)
              : ((error as { code?: number } | null)?.code ?? 0);
          resolve({ code, stderr: String(stderrBuf) });
        },
      );
    });
    let report: unknown | null = null;
    try {
      report = JSON.parse(await readFile(reportPath, "utf8"));
    } catch {
      report = null;
    }
    return { exitCode: code, report, stderr };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function runPatch(contractJson: string, patchJson: string): Promise<ValidateResult> {
  const dir = await mkdtemp(join(tmpdir(), "forge-patch-"));
  const contractPath = join(dir, "contract.json");
  const patchPath = join(dir, "patch.json");
  const outPath = join(dir, "patched.json");
  try {
    await Promise.all([
      writeFile(contractPath, contractJson, "utf8"),
      writeFile(patchPath, patchJson, "utf8"),
    ]);
    const { code, stderr } = await new Promise<{ code: number; stderr: string }>((resolve) => {
      execFile(
        validatorBin(),
        ["patch", contractPath, patchPath, "--out", outPath],
        { timeout: 30_000, maxBuffer: 1024 * 1024, killSignal: "SIGKILL" },
        (error, _stdout, stderrBuf) => {
          const code =
            error && typeof (error as NodeJS.ErrnoException).code === "string"
              ? -1
              : ((error as { code?: number } | null)?.code ?? 0);
          resolve({ code, stderr: String(stderrBuf) });
        },
      );
    });
    let report: unknown | null = null;
    try {
      report = JSON.parse(await readFile(outPath, "utf8"));
    } catch {
      report = null;
    }
    return { exitCode: code, report, stderr };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function recorderVerifyTimeoutMs(): number {
  const configured = Number(process.env.FORGE_RECORDER_VERIFY_TIMEOUT_MS ?? 30 * 60_000);
  return Math.min(60 * 60_000, Math.max(30_000, Number.isFinite(configured) ? configured : 30 * 60_000));
}

/** D54 server-side archive verifier. The caller owns the private archive
 * directory and must remove its parent after this process returns. */
export async function runRecorderArchiveVerifier(archiveDirectory: string): Promise<ValidateResult> {
  const reportPath = join(archiveDirectory, "..", "recorder-verification.json");
  const { code, stderr } = await new Promise<{ code: number; stderr: string }>((resolve) => {
    execFile(
      validatorBin(),
      ["recorder-verify", archiveDirectory, "--out", reportPath],
      { timeout: recorderVerifyTimeoutMs(), maxBuffer: 1024 * 1024, killSignal: "SIGKILL" },
      (error, _stdout, stderrBuf) => {
        const rawCode = (error as { code?: unknown } | null)?.code;
        const code = error === null ? 0 : typeof rawCode === "number" ? rawCode : -1;
        resolve({ code, stderr: String(stderrBuf) });
      },
    );
  });
  let report: unknown | null = null;
  try {
    report = JSON.parse(await readFile(reportPath, "utf8"));
  } catch {
    report = null;
  }
  return { exitCode: code, report, stderr };
}

/** D14 draft semantics: `asDraft` turns a failing verdict into `draft` —
 * the document persists as editable WITH its diagnostics; drafts can never
 * train/export/share (enforced at those surfaces as they land, P4+/P7). */
export function runValidator(contractJson: string, asDraft = false): Promise<ValidateResult> {
  return runSubcommand("run", contractJson, asDraft ? ["--as-draft"] : []);
}

/** EnvSpec gatekeeper for course/community content (P10). */
export function runEnvSpec(envJson: string, asDraft = false): Promise<ValidateResult> {
  return runSubcommand("env", envJson, asDraft ? ["--as-draft"] : []);
}

/** Server-side bake for viewer-grade clients without the WASM facade (D15). */
export function runBake(contractJson: string): Promise<ValidateResult> {
  return runSubcommand("bake", contractJson);
}

/** JSON BOM for catalog-backed procurement surfaces (P3-009). */
export function runBom(contractJson: string): Promise<ValidateResult> {
  return runSubcommand("bom", contractJson, ["--format", "json"]);
}
