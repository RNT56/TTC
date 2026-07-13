#!/usr/bin/env node
import pg from "pg";
import {
  evaluateRestoreCandidate,
  recordLegalHold,
  registerBackup,
  runPrimaryRetentionSweep,
} from "../packages/gateway/dist/dataLifecycle.js";

const { Pool } = pg;
const cliArgs = process.argv.slice(2);
if (cliArgs[0] === "--") cliArgs.shift();
const [command, ...args] = cliArgs;
const value = (flag, required = true) => {
  const index = args.indexOf(flag);
  const result = index >= 0 ? args[index + 1] : undefined;
  if (required && !result) throw new Error(`missing ${flag}`);
  return result;
};
const values = (flag) => args.flatMap((item, index) => item === flag && args[index + 1] ? [args[index + 1]] : []);
const requireAuthority = () => {
  if (process.env.FORGE_LIFECYCLE_OPERATOR_CONFIRM !== "I_UNDERSTAND_LEGAL_HOLD_AUTHORITY") {
    throw new Error("set FORGE_LIFECYCLE_OPERATOR_CONFIRM=I_UNDERSTAND_LEGAL_HOLD_AUTHORITY for authority changes");
  }
};
const parseSubject = (input) => {
  const separator = input.indexOf(":");
  if (separator < 1) throw new Error(`invalid subject ${input}; expected user:<id>, object:<id>, or audit:<id>`);
  const kind = input.slice(0, separator);
  if (!["user", "object", "audit"].includes(kind)) throw new Error(`unsupported subject kind ${kind}`);
  return { kind, id: input.slice(separator + 1) };
};

if (!command || command === "help") {
  console.log(`usage:
  data-lifecycle.mjs hold-place --hold-key K --subject user:ID --reason CODE --authority REF --jurisdiction CODE --evidence REF --expires ISO --idempotency-key K
  data-lifecycle.mjs hold-release --hold-key K --subject user:ID --reason CODE --authority REF --jurisdiction CODE --evidence REF --idempotency-key K
  data-lifecycle.mjs backup-register --provider P --external-reference REF --manifest-sha256 HEX --captured-at ISO --delete-after ISO --subject user:ID [--subject object:ID]
  data-lifecycle.mjs restore-check --backup-id ID --manifest-sha256 HEX --evidence REF
  data-lifecycle.mjs retention-sweep [--execute] --evidence REF

Hold changes require FORGE_LIFECYCLE_OPERATOR_CONFIRM=I_UNDERSTAND_LEGAL_HOLD_AUTHORITY.
Backup expiry needs a provider-specific deletion adapter; this CLI never marks a backup deleted.`);
  process.exit(0);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://forge:forge-dev-only@localhost:5432/forge",
  max: 2,
});
try {
  let result;
  if (command === "hold-place" || command === "hold-release") {
    requireAuthority();
    const subject = parseSubject(value("--subject"));
    result = await recordLegalHold(pool, {
      action: command === "hold-place" ? "place" : "release",
      holdKey: value("--hold-key"),
      subjectKind: subject.kind,
      subjectId: subject.id,
      reasonCode: value("--reason"),
      authorityReference: value("--authority"),
      jurisdiction: value("--jurisdiction"),
      evidenceReference: value("--evidence"),
      expiresAt: value("--expires", command === "hold-place"),
      idempotencyKey: value("--idempotency-key"),
    });
  } else if (command === "backup-register") {
    result = await registerBackup(pool, {
      provider: value("--provider"),
      externalReference: value("--external-reference"),
      manifestSha256: value("--manifest-sha256"),
      capturedAt: value("--captured-at"),
      deleteAfter: value("--delete-after"),
      subjects: values("--subject").map(parseSubject),
    });
  } else if (command === "restore-check") {
    result = await evaluateRestoreCandidate(pool, {
      backupId: value("--backup-id"),
      manifestSha256: value("--manifest-sha256"),
      evidenceReference: value("--evidence"),
    });
    if (result.result === "blocked") process.exitCode = 2;
  } else if (command === "retention-sweep") {
    result = await runPrimaryRetentionSweep(pool, {
      execute: args.includes("--execute"),
      evidenceReference: value("--evidence"),
    });
  } else {
    throw new Error(`unknown lifecycle command: ${command}`);
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  await pool.end();
}
