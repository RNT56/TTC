#!/usr/bin/env node
import { loadManagedRuntimeSecrets } from "../dist/runtimeSecrets.js";

loadManagedRuntimeSecrets();
await import("./db-migrate.mjs");
