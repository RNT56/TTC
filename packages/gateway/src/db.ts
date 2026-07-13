import { Pool, type QueryResult } from "pg";

export interface GatewayDb {
  query<T extends object = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
  transaction?<T>(
    options: GatewayTransactionOptions,
    operation: (transaction: GatewayDb) => Promise<T>,
  ): Promise<T>;
}

interface GatewayTransactionClient extends GatewayDb {
  release(): void;
}

interface ConnectableGatewayDb extends GatewayDb {
  connect(): Promise<GatewayTransactionClient>;
}

export interface GatewayTransactionOptions {
  isolation: "repeatable read" | "serializable";
  readOnly?: boolean;
}

const DEFAULT_DATABASE_URL = "postgres://forge:forge-dev-only@localhost:5432/forge";

let pool: Pool | null = null;

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

export function gatewayDb(): GatewayDb {
  return gatewayPool();
}

export function gatewayPool(): Pool {
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

export async function withGatewayTransaction<T>(
  db: GatewayDb,
  options: GatewayTransactionOptions,
  operation: (transaction: GatewayDb) => Promise<T>,
): Promise<T> {
  if (db.transaction) return db.transaction(options, operation);

  const connect = (db as Partial<ConnectableGatewayDb>).connect;
  if (typeof connect !== "function") {
    throw Object.assign(new Error("database transaction support is required"), { statusCode: 503 });
  }

  const client = await connect.call(db);
  const mode = options.readOnly ? " READ ONLY" : "";
  let transactionStarted = false;
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${options.isolation.toUpperCase()}${mode}`);
    transactionStarted = true;
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the operation error; the pool will discard a broken client.
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function closeGatewayDb(): Promise<void> {
  if (pool !== null) {
    const current = pool;
    pool = null;
    await current.end();
  }
}
