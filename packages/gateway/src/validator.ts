// The validation service is mostly process management (plan §5.2): spawn the
// forge-validate binary — process isolation plus guaranteed bit-equality with
// CI (D17). napi-rs hot-path bindings are the OD-08 alternative, measured at P2.
import { execFile } from "node:child_process";
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

async function runSubcommand(
  subcommand: "run" | "bake",
  contractJson: string,
): Promise<ValidateResult> {
  const dir = await mkdtemp(join(tmpdir(), "forge-validate-"));
  const contractPath = join(dir, "contract.json");
  const reportPath = join(dir, "report.json");
  try {
    await writeFile(contractPath, contractJson, "utf8");
    const outFlag = subcommand === "run" ? "--report" : "--out";
    const { code, stderr } = await new Promise<{ code: number; stderr: string }>((resolve) => {
      execFile(
        validatorBin(),
        [subcommand, contractPath, outFlag, reportPath],
        { timeout: 30_000 },
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

export function runValidator(contractJson: string): Promise<ValidateResult> {
  return runSubcommand("run", contractJson);
}

/** Server-side bake for viewer-grade clients without the WASM facade (D15). */
export function runBake(contractJson: string): Promise<ValidateResult> {
  return runSubcommand("bake", contractJson);
}
