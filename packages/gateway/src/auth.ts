import { Auth, type AuthConfig } from "@auth/core";
import GitHub from "@auth/core/providers/github";
import PostgresAdapter from "@auth/pg-adapter";
import type { FastifyReply, FastifyRequest } from "fastify";
import { gatewayPool, type GatewayDb } from "./db.js";

const DEV_AUTH_SECRET = "forge-dev-auth-secret-change-me";
const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface CurrentUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

function serviceError(message: string, statusCode = 503): Error {
  return Object.assign(new Error(message), { statusCode });
}

function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production";
}

export function configuredPublicOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = env.AUTH_URL?.trim() || env.FORGE_PUBLIC_ORIGIN?.trim();
  if (!configured) return null;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw serviceError("AUTH_URL or FORGE_PUBLIC_ORIGIN must be an absolute origin");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "") ||
    !["http:", "https:"].includes(url.protocol)
  ) {
    throw serviceError("AUTH_URL or FORGE_PUBLIC_ORIGIN must be a credential-free origin");
  }
  if (isProduction(env) && url.protocol !== "https:") {
    throw serviceError("production public origin must use HTTPS");
  }
  return url.origin;
}

export function assertAuthConfiguration(env: NodeJS.ProcessEnv = process.env): void {
  const production = isProduction(env);
  const origin = configuredPublicOrigin(env);
  const secret = env.AUTH_SECRET?.trim();
  if (production && origin === null) throw serviceError("production public origin is not configured");
  if (production && (!secret || secret === DEV_AUTH_SECRET || secret.length < 32)) {
    throw serviceError("production AUTH_SECRET must be an explicit value of at least 32 characters");
  }
  const githubId = Boolean(env.GITHUB_CLIENT_ID?.trim());
  const githubSecret = Boolean(env.GITHUB_CLIENT_SECRET?.trim());
  if (githubId !== githubSecret) throw serviceError("GitHub OAuth client ID and secret must be configured together");
  if (production && env.FORGE_DEV_AUTH === "1") {
    throw serviceError("FORGE_DEV_AUTH is forbidden in production");
  }
}

function authOrigin(): string {
  return configuredPublicOrigin() ?? "http://localhost:8080";
}

export function pinnedAuthRequestUrl(rawUrl: string, origin: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl, origin);
  } catch {
    throw serviceError("authentication request URL is invalid", 400);
  }
  const pinned = new URL(origin);
  pinned.pathname = parsed.pathname;
  pinned.search = parsed.search;
  return pinned;
}

export function githubAuthConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim());
}

function authConfig(): AuthConfig {
  assertAuthConfiguration();
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
    // The Request URL and Host header are rebuilt from the configured origin below;
    // no caller-controlled forwarded host reaches Auth.js.
    trustHost: true,
    secret: process.env.AUTH_SECRET?.trim() || DEV_AUTH_SECRET,
    providers,
    session: { strategy: "database" },
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
  const origin = authOrigin();
  const url = pinnedAuthRequestUrl(request.raw.url ?? request.url, origin);
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (["host", "x-forwarded-host", "x-forwarded-proto", "forwarded"].includes(key.toLowerCase())) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, String(value));
    }
  }
  headers.set("host", new URL(origin).host);
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
  return process.env.NODE_ENV !== "production" &&
    (process.env.FORGE_DEV_AUTH === "1" || process.env.NODE_ENV === "test");
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
    try {
      const value = decodeURIComponent(rest.join("="));
      return value.length <= 4096 ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function requestRateLimitIdentity(request: FastifyRequest): string {
  // This hook runs before authentication. Caller-supplied session cookies or
  // development headers are not identities until they have been verified, so using
  // them here would let a client rotate fake values to reset its bucket.
  return `ip:${request.ip}`;
}

function localDevelopmentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export function assertTrustedRequestOrigin(request: FastifyRequest): void {
  const rawOrigin = request.headers.origin;
  const origin = typeof rawOrigin === "string" ? rawOrigin : null;
  const configured = configuredPublicOrigin();
  if (origin !== null) {
    let normalized: string;
    try {
      normalized = new URL(origin).origin;
    } catch {
      throw serviceError("request origin is invalid", 403);
    }
    const allowed = configured !== null
      ? normalized === configured
      : !isProduction() && localDevelopmentOrigin(normalized);
    if (!allowed) throw serviceError("request origin is not allowed", 403);
  }
  if (
    isProduction() &&
    !SAFE_METHODS.has(request.method) &&
    cookieValue(request.headers.cookie, SESSION_COOKIE_NAMES) !== null &&
    origin === null
  ) {
    throw serviceError("cookie-authenticated state changes require an Origin header", 403);
  }
}

export async function getCurrentUser(
  request: FastifyRequest,
  db: GatewayDb,
): Promise<CurrentUser | null> {
  const headerUserId = request.headers["x-forge-user-id"];
  if (headerAuthEnabled() && typeof headerUserId === "string" && headerUserId.trim()) {
    const id = headerUserId.trim();
    if (id.length > 200 || !/^[A-Za-z0-9._:@-]+$/.test(id)) {
      throw serviceError("development user ID is invalid", 400);
    }
    const user: CurrentUser = {
      id,
      name:
        typeof request.headers["x-forge-user-name"] === "string"
          ? request.headers["x-forge-user-name"].slice(0, 200)
          : null,
      email:
        typeof request.headers["x-forge-user-email"] === "string"
          ? request.headers["x-forge-user-email"].slice(0, 320)
          : null,
      image: null,
    };
    return ensureHeaderUser(db, user);
  }

  const token = cookieValue(request.headers.cookie, SESSION_COOKIE_NAMES);
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
