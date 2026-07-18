import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export const MANAGED_SECRET_NAMES = [
  "ANTHROPIC_API_KEY",
  "AUTH_SECRET",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "DATABASE_URL",
  "FORGE_OBJECT_ACCESS_KEY_ID",
  "FORGE_OBJECT_SECRET_ACCESS_KEY",
  "FORGE_REVIEW_TOKEN",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "MODAL_TOKEN_ID",
  "MODAL_TOKEN_SECRET",
] as const;

type Environment = Record<string, string | undefined>;

function readSecret(path: string): string {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1 || stats.size > 16 * 1024) {
    throw new Error(`managed secret file ${path} is invalid`);
  }
  const raw = readFileSync(path, "utf8");
  const value = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
  if (!value || /[\0\r\n]/.test(value)) throw new Error(`managed secret file ${path} has invalid content`);
  return value;
}

export function loadManagedRuntimeSecrets(env: Environment = process.env): readonly string[] {
  const directory = env.FORGE_RUNTIME_SECRETS_DIRECTORY;
  if (!directory) return [];
  if (!isAbsolute(directory)) throw new Error("FORGE_RUNTIME_SECRETS_DIRECTORY must be absolute");
  const directoryStats = lstatSync(directory);
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    throw new Error("FORGE_RUNTIME_SECRETS_DIRECTORY must be a real directory");
  }

  const loaded: string[] = [];
  for (const name of MANAGED_SECRET_NAMES) {
    const path = join(directory, name);
    try {
      const value = readSecret(path);
      if (env[name] !== undefined) throw new Error(`managed secret ${name} has ambiguous file and environment sources`);
      env[name] = value;
      loaded.push(name);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") continue;
      throw error;
    }
  }
  env.FORGE_RUNTIME_SECRETS_SOURCE = "files";
  return loaded;
}
