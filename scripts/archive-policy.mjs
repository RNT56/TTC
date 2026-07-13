import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";

export const MAX_NATIVE_ARCHIVE_BYTES = 64 * 1024 * 1024;
export const MAX_NATIVE_BINARY_BYTES = 64 * 1024 * 1024;
export const MAX_NATIVE_METADATA_BYTES = 1024 * 1024;
export const MAX_WASM_ARCHIVE_BYTES = 16 * 1024 * 1024;
export const MAX_WASM_MEMBER_BYTES = 8 * 1024 * 1024;

function cleanEntry(raw) {
  const entry = raw.trim().replace(/\/$/, "");
  if (
    !entry ||
    entry.includes("\\") ||
    entry.includes("\0") ||
    entry.startsWith("/") ||
    /^[A-Za-z]:/.test(entry) ||
    entry.split("/").some((part) => part === ".." || part === ".")
  ) {
    throw new Error(`unsafe archive entry: ${JSON.stringify(raw)}`);
  }
  return entry;
}

export function validateArchiveEntries(rawEntries, allowedEntries, label) {
  if (rawEntries.length > 64) throw new Error(`${label} has too many entries`);
  const entries = rawEntries.map(cleanEntry);
  if (new Set(entries).size !== entries.length) throw new Error(`${label} contains duplicate entries`);
  const expected = [...new Set(allowedEntries.map(cleanEntry))].sort();
  const actual = [...entries].sort();
  if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
    throw new Error(`${label} entries do not match the exact allowlist`);
  }
  return entries;
}

function runTar(args, maxBuffer, label) {
  try {
    return execFileSync("tar", args, { maxBuffer });
  } catch (error) {
    if (
      error instanceof Error &&
      (("code" in error && error.code === "ENOBUFS") || /maxBuffer|stdout maxBuffer/i.test(error.message))
    ) {
      throw new Error(`${label} exceeds the byte limit`);
    }
    throw new Error(`${label} could not be inspected`);
  }
}

export function listArchiveEntries(archive, compressed, maxArchiveBytes, label) {
  if (statSync(archive).size > maxArchiveBytes) throw new Error(`${label} archive exceeds the byte limit`);
  const output = runTar(compressed ? ["-tzf", archive] : ["-tf", archive], 256 * 1024, label);
  return output.toString("utf8").split("\n").filter(Boolean);
}

export function readArchiveMember(archive, member, compressed, maxBytes, label) {
  cleanEntry(member);
  const output = runTar(
    compressed ? ["-xOzf", archive, member] : ["-xOf", archive, member],
    maxBytes + 1,
    label,
  );
  if (output.byteLength > maxBytes) throw new Error(`${label} exceeds the byte limit`);
  return output;
}
