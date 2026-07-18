import assert from "node:assert/strict";
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadManagedRuntimeSecrets } from "../src/runtimeSecrets.js";

function fixture(name: string): string {
  const directory = join(tmpdir(), `forge-runtime-secrets-${process.pid}-${name}-${Date.now()}`);
  mkdirSync(directory, { mode: 0o700 });
  return directory;
}

test("managed runtime secrets load only from bounded regular files", () => {
  const directory = fixture("valid");
  writeFileSync(join(directory, "DATABASE_URL"), "postgres://runtime\n", { mode: 0o400 });
  writeFileSync(join(directory, "AUTH_SECRET"), "a".repeat(32), { mode: 0o400 });
  const env: Record<string, string | undefined> = { FORGE_RUNTIME_SECRETS_DIRECTORY: directory };

  assert.deepEqual(loadManagedRuntimeSecrets(env), ["AUTH_SECRET", "DATABASE_URL"]);
  assert.equal(env.AUTH_SECRET, "a".repeat(32));
  assert.equal(env.DATABASE_URL, "postgres://runtime");
  assert.equal(env.FORGE_RUNTIME_SECRETS_SOURCE, "files");
});

test("managed runtime secrets reject ambiguous environment authority", () => {
  const directory = fixture("ambiguous");
  writeFileSync(join(directory, "DATABASE_URL"), "postgres://file", { mode: 0o400 });
  assert.throws(
    () => loadManagedRuntimeSecrets({ FORGE_RUNTIME_SECRETS_DIRECTORY: directory, DATABASE_URL: "postgres://env" }),
    /ambiguous file and environment sources/,
  );
});

test("managed runtime secrets reject links and multiline content", () => {
  const linkedDirectory = fixture("link");
  const target = join(linkedDirectory, "target");
  writeFileSync(target, "postgres://target", { mode: 0o400 });
  symlinkSync(target, join(linkedDirectory, "DATABASE_URL"));
  assert.throws(
    () => loadManagedRuntimeSecrets({ FORGE_RUNTIME_SECRETS_DIRECTORY: linkedDirectory }),
    /invalid/,
  );

  const multilineDirectory = fixture("multiline");
  const path = join(multilineDirectory, "AUTH_SECRET");
  writeFileSync(path, "first\nsecond", { mode: 0o400 });
  chmodSync(path, 0o400);
  assert.throws(
    () => loadManagedRuntimeSecrets({ FORGE_RUNTIME_SECRETS_DIRECTORY: multilineDirectory }),
    /invalid content/,
  );
});
