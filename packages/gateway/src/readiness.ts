import { accessSync, constants } from "node:fs";

import type { GatewayDb } from "./db.js";
import {
  objectStorageConfigFromEnv,
  probeObjectStorage,
  type ObjectStorageConfig,
} from "./objectStorage.js";
import { validatorBin } from "./validator.js";

export interface GatewayReadiness {
  ok: boolean;
  checks: {
    database: boolean;
    objectStorage: boolean;
    validator: boolean;
  };
}

export interface ReadinessDependencies {
  validatorPath?: string;
  objectConfig?: ObjectStorageConfig;
  probeObjects?: (config: ObjectStorageConfig) => Promise<void>;
}

export async function checkGatewayReadiness(
  db: GatewayDb,
  dependencies: ReadinessDependencies = {},
): Promise<GatewayReadiness> {
  const checks = { database: false, objectStorage: false, validator: false };
  try {
    accessSync(dependencies.validatorPath ?? validatorBin(), constants.X_OK);
    checks.validator = true;
  } catch {
    // A readiness response records only the bounded check state, never host paths.
  }
  try {
    await db.query("SELECT 1 AS forge_ready");
    checks.database = true;
  } catch {
    // Do not disclose database errors or credentials through the public probe.
  }
  try {
    const config = dependencies.objectConfig ?? objectStorageConfigFromEnv();
    await (dependencies.probeObjects ?? probeObjectStorage)(config);
    checks.objectStorage = true;
  } catch {
    // Do not disclose endpoints, credentials, or provider errors.
  }
  return { ok: Object.values(checks).every(Boolean), checks };
}
