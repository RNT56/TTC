import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { listArchiveEntries, readArchiveMember, validateArchiveEntries } from "./archive-policy.mjs";

test("archive entry policy accepts only the exact normalized allowlist", () => {
  assert.deepEqual(
    validateArchiveEntries(["bundle/", "bundle/forge-validate"], ["bundle", "bundle/forge-validate"], "native"),
    ["bundle", "bundle/forge-validate"],
  );
  assert.throws(
    () => validateArchiveEntries(["bundle", "bundle/forge-validate", "bundle/extra"], ["bundle", "bundle/forge-validate"], "native"),
    /allowlist/,
  );
  assert.throws(
    () => validateArchiveEntries(["bundle", "bundle"], ["bundle"], "native"),
    /duplicate/,
  );
});

test("archive entry policy rejects traversal, absolute, drive, and backslash paths", () => {
  for (const entry of ["../escape", "/absolute", "C:/escape", "bundle\\escape", "bundle/./file"]) {
    assert.throws(() => validateArchiveEntries([entry], ["safe"], "archive"), /unsafe archive entry/);
  }
});

test("archive inspection enforces compressed and expanded byte ceilings before use", () => {
  const temp = mkdtempSync(join(tmpdir(), "forge-archive-policy-"));
  try {
    writeFileSync(join(temp, "payload"), Buffer.alloc(2048, 7));
    const archive = join(temp, "payload.tar.gz");
    execFileSync("tar", ["-czf", archive, "payload"], { cwd: temp });
    const entries = listArchiveEntries(archive, true, 4096, "fixture");
    validateArchiveEntries(entries, ["payload"], "fixture");
    assert.throws(() => readArchiveMember(archive, "payload", true, 1024, "fixture payload"), /byte limit/);
    assert.equal(readArchiveMember(archive, "payload", true, 4096, "fixture payload").byteLength, 2048);
    assert.throws(() => listArchiveEntries(archive, true, 1, "fixture"), /archive exceeds/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
