import { Auth, skipCSRFCheck, type AuthConfig } from "@auth/core";
import GitHub from "@auth/core/providers/github";
import PostgresAdapter from "@auth/pg-adapter";
import type { FastifyReply, FastifyRequest } from "fastify";
import { gatewayPool, type GatewayDb } from "./db.js";

export interface CurrentUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

function authOrigin(request: FastifyRequest): string {
  const configured = process.env.AUTH_URL ?? process.env.FORGE_PUBLIC_ORIGIN;
  if (configured?.trim()) return configured.replace(/\/$/, "");
  const host = request.headers["x-forwarded-host"] ?? request.headers.host ?? "localhost:8080";
  const proto = request.headers["x-forwarded-proto"] ?? "http";
  return `${Array.isArray(proto) ? proto[0] : proto}://${Array.isArray(host) ? host[0] : host}`;
}

export function githubAuthConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim());
}

function authConfig(): AuthConfig {
  const providers = githubAuthConfigured()
    ? [
        GitHub({
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
        }),
      ]
    : [];
  return {
    adapter: PostgresAdapter(gatewayPool()),
    basePath: "/auth",
    trustHost: true,
    secret: process.env.AUTH_SECRET ?? "forge-dev-auth-secret-change-me",
    providers,
    session: { strategy: "database" },
    skipCSRFCheck,
  };
}

function authRequestBody(request: FastifyRequest): BodyInit | undefined {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  if (typeof request.body === "string") return request.body;
  if (request.body === undefined || request.body === null) return undefined;
  return JSON.stringify(request.body);
}

export async function handleAuthRequest(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const url = new URL(request.raw.url ?? request.url, authOrigin(request));
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, String(value));
    }
  }
  const authResponse = await Auth(
    new Request(url, {
      method: request.method,
      headers,
      body: authRequestBody(request),
    }),
    authConfig(),
  );

  reply.status(authResponse.status);
  const responseHeaders = authResponse.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = responseHeaders.getSetCookie?.() ?? [];
  responseHeaders.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") reply.header(key, value);
  });
  for (const cookie of setCookies) reply.header("set-cookie", cookie);
  if (setCookies.length === 0) {
    const cookie = authResponse.headers.get("set-cookie");
    if (cookie) reply.header("set-cookie", cookie);
  }
  return reply.send(Buffer.from(await authResponse.arrayBuffer()));
}

function headerAuthEnabled(): boolean {
  return process.env.FORGE_DEV_AUTH === "1" || process.env.NODE_ENV === "test";
}

async function ensureHeaderUser(db: GatewayDb, user: CurrentUser): Promise<CurrentUser> {
  const result = user.email
    ? await db.query<{
        id: string;
        name: string | null;
        email: string | null;
        image: string | null;
      }>(
        `WITH by_id AS (
           UPDATE users
              SET name = $2,
                  email = COALESCE($3, users.email),
                  image = $4
            WHERE id = $1
            RETURNING id, name, email, image
         ),
         inserted AS (
           INSERT INTO users (id, name, email, image)
           SELECT $1, $2, $3, $4
            WHERE NOT EXISTS (SELECT 1 FROM by_id)
           ON CONFLICT (email) DO UPDATE
             SET name = EXCLUDED.name,
                 image = EXCLUDED.image
           RETURNING id, name, email, image
         )
         SELECT id, name, email, image FROM by_id
         UNION ALL
         SELECT id, name, email, image FROM inserted
         LIMIT 1`,
        [user.id, user.name, user.email, user.image],
      )
    : await db.query<{
        id: string;
        name: string | null;
        email: string | null;
        image: string | null;
      }>(
        `INSERT INTO users (id, name, email, image)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             image = EXCLUDED.image
         RETURNING id, name, email, image`,
        [user.id, user.name, user.email, user.image],
      );
  const ensured = result.rows[0] ?? user;
  await db.query(
    `INSERT INTO credit_accounts (user_id, balance_credits)
     VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [ensured.id],
  );
  return ensured;
}

function cookieValue(cookieHeader: string | undefined, names: string[]): string | null {
  if (!cookieHeader) return null;
  for (const chunk of cookieHeader.split(";")) {
    const [rawName, ...rest] = chunk.trim().split("=");
    if (!rawName || !names.includes(rawName)) continue;
    return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function getCurrentUser(
  request: FastifyRequest,
  db: GatewayDb,
): Promise<CurrentUser | null> {
  const headerUserId = request.headers["x-forge-user-id"];
  if (headerAuthEnabled() && typeof headerUserId === "string" && headerUserId.trim()) {
    const user: CurrentUser = {
      id: headerUserId.trim(),
      name:
        typeof request.headers["x-forge-user-name"] === "string"
          ? request.headers["x-forge-user-name"]
          : null,
      email:
        typeof request.headers["x-forge-user-email"] === "string"
          ? request.headers["x-forge-user-email"]
          : null,
      image: null,
    };
    return ensureHeaderUser(db, user);
  }

  const token = cookieValue(request.headers.cookie, [
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
  ]);
  if (token === null) return null;

  const result = await db.query<{
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  }>(
    `SELECT u.id, u.name, u.email, u.image
       FROM sessions s
       JOIN users u ON u.id = s."userId"
      WHERE s."sessionToken" = $1
        AND s.expires > now()
      LIMIT 1`,
    [token],
  );
  return result.rows[0] ?? null;
}

export async function requireUser(request: FastifyRequest, db: GatewayDb): Promise<CurrentUser> {
  const user = await getCurrentUser(request, db);
  if (user === null) {
    const error = new Error("authentication required");
    (error as Error & { statusCode?: number }).statusCode = 401;
    throw error;
  }
  return user;
}
