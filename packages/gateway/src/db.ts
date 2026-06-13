import { Pool, type QueryResult } from "pg";

export interface GatewayDb {
  query<T extends object = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

const DEFAULT_DATABASE_URL = "postgres://forge:forge-dev-only@localhost:5432/forge";

let pool: Pool | null = null;

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

export function gatewayDb(): GatewayDb {
  if (pool === null) {
    pool = new Pool({
      connectionString: databaseUrl(),
      connectionTimeoutMillis: Number(process.env.FORGE_DB_CONNECT_TIMEOUT_MS ?? 1000),
      idleTimeoutMillis: 5000,
      max: 5,
    });
  }
  return pool;
}

export async function closeGatewayDb(): Promise<void> {
  if (pool !== null) {
    const current = pool;
    pool = null;
    await current.end();
  }
}
