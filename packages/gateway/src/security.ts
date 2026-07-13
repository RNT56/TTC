import { createHash, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
export const DEFAULT_HTTP_RESPONSE_BYTES = 2 * 1024 * 1024;
export const DEFAULT_JSON_BYTES = 512 * 1024;
export const DEFAULT_JSON_DEPTH = 16;
export const DEFAULT_JSON_NODES = 20_000;
export const DEFAULT_REQUEST_BODY_BYTES = 1024 * 1024;
export const MAX_OBJECT_BYTES = 2 * 1024 * 1024 * 1024;

export type JsonLimits = {
  maxBytes?: number;
  maxDepth?: number;
  maxNodes?: number;
  maxArrayItems?: number;
  maxObjectKeys?: number;
  maxStringBytes?: number;
};

export type EndpointPolicy = {
  allowedHosts?: readonly string[];
  allowPrivate?: boolean;
  errorStatusCode?: 400 | 503;
};

type AddressAnswer = { address: string };

export type BoundedFetchOptions = EndpointPolicy & {
  timeoutMs?: number;
  maxResponseBytes?: number;
  label: string;
  fetchImpl?: typeof fetch;
  resolveHost?: (hostname: string) => Promise<readonly AddressAnswer[]>;
};

export type RateLimitClass = "auth" | "generation" | "job" | "object" | "public";

export type RateLimitPolicy = {
  windowMs: number;
  limits: Record<RateLimitClass, number>;
};

export const DEFAULT_RATE_LIMIT_POLICY: RateLimitPolicy = {
  windowMs: 60_000,
  limits: {
    auth: 30,
    generation: 20,
    job: 60,
    object: 120,
    public: 300,
  },
};

type RateBucket = { count: number; resetsAt: number };

function httpError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertBoundedJson(value: unknown, label: string, limits: JsonLimits = {}): void {
  const maxBytes = limits.maxBytes ?? DEFAULT_JSON_BYTES;
  const maxDepth = limits.maxDepth ?? DEFAULT_JSON_DEPTH;
  const maxNodes = limits.maxNodes ?? DEFAULT_JSON_NODES;
  const maxArrayItems = limits.maxArrayItems ?? 10_000;
  const maxObjectKeys = limits.maxObjectKeys ?? 2_000;
  const maxStringBytes = limits.maxStringBytes ?? 128 * 1024;
  let nodes = 0;
  const active = new Set<object>();

  const visit = (entry: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > maxNodes) throw httpError(`${label} exceeds the node limit`, 400);
    if (depth > maxDepth) throw httpError(`${label} exceeds the nesting limit`, 400);
    if (typeof entry === "string") {
      if (byteLength(entry) > maxStringBytes) throw httpError(`${label} contains an oversized string`, 400);
      return;
    }
    if (entry === null || typeof entry === "boolean") return;
    if (typeof entry === "number") {
      if (!Number.isFinite(entry)) throw httpError(`${label} contains a non-finite number`, 400);
      return;
    }
    if (typeof entry !== "object") throw httpError(`${label} contains a non-JSON value`, 400);
    if (active.has(entry)) throw httpError(`${label} contains a reference cycle`, 400);
    active.add(entry);
    try {
      if (Array.isArray(entry)) {
        if (entry.length > maxArrayItems) throw httpError(`${label} exceeds the array limit`, 400);
        for (const item of entry) visit(item, depth + 1);
        return;
      }
      if (!isPlainObject(entry)) throw httpError(`${label} contains a non-JSON object`, 400);
      const keys = Object.keys(entry);
      if (keys.length > maxObjectKeys) throw httpError(`${label} exceeds the object-key limit`, 400);
      for (const key of keys) {
        if (["__proto__", "constructor", "prototype"].includes(key)) {
          throw httpError(`${label} contains a forbidden object key`, 400);
        }
        visit((entry as Record<string, unknown>)[key], depth + 1);
      }
    } finally {
      active.delete(entry);
    }
  };

  visit(value, 0);
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw httpError(`${label} is not JSON serializable`, 400);
  }
  if (encoded === undefined) throw httpError(`${label} is not JSON serializable`, 400);
  if (byteLength(encoded) > maxBytes) throw httpError(`${label} exceeds the byte limit`, 400);
}

function ipv4Private(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = octets as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && octets[2] === 100) ||
    (a === 203 && b === 0 && octets[2] === 113) ||
    a >= 224
  );
}

function mappedIpv4(address: string): string | null {
  const dotted = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)?.[1];
  if (dotted) return dotted;
  const hex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hex) return null;
  const high = Number.parseInt(hex[1] ?? "", 16);
  const low = Number.parseInt(hex[2] ?? "", 16);
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;
}

function ipv6Private(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0] ?? "";
  const mapped = mappedIpv4(normalized);
  if (mapped) return ipv4Private(mapped);
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("64:ff9b:") ||
    normalized.startsWith("2001:2:") ||
    normalized.startsWith("2001:db8:") ||
    normalized === "2001:db8::"
  );
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return ipv4Private(address);
  if (family === 6) return ipv6Private(address);
  return true;
}

export function parseExternalHttpsUrl(raw: string, label: string, policy: EndpointPolicy = {}): URL {
  const statusCode = policy.errorStatusCode ?? 503;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw httpError(`${label} must be an absolute HTTPS URL`, statusCode);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw httpError(`${label} must be credential-free HTTPS without a fragment`, statusCode);
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw httpError(`${label} resolves to a private host`, statusCode);
  }
  if (!policy.allowPrivate && isIP(hostname) !== 0 && isPrivateAddress(hostname)) {
    throw httpError(`${label} resolves to a private address`, statusCode);
  }
  if (policy.allowedHosts?.length) {
    const allowed = new Set(policy.allowedHosts.map((host) => host.toLowerCase().replace(/\.$/, "")));
    if (!allowed.has(hostname)) throw httpError(`${label} host is not allowlisted`, statusCode);
  }
  return url;
}

export async function assertPublicEndpointResolution(
  url: URL,
  label: string,
  allowPrivate = false,
  resolveHost: (hostname: string) => Promise<readonly AddressAnswer[]> = (hostname) =>
    lookup(hostname, { all: true, verbatim: true }),
): Promise<void> {
  if (allowPrivate) return;
  let answers: readonly AddressAnswer[];
  try {
    answers = await resolveHost(url.hostname);
  } catch {
    throw httpError(`${label} host resolution failed`, 503);
  }
  if (answers.length === 0 || answers.some((answer) => isPrivateAddress(answer.address))) {
    throw httpError(`${label} resolves to a private or unavailable address`, 503);
  }
}

async function readBoundedBody(response: Response, maxBytes: number, label: string): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw httpError(`${label} response exceeds the byte limit`, 503);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function fetchBoundedJson(
  rawUrl: string,
  init: RequestInit,
  options: BoundedFetchOptions,
): Promise<{ response: Response; value: unknown }> {
  const url = parseExternalHttpsUrl(rawUrl, options.label, options);
  await assertPublicEndpointResolution(url, options.label, options.allowPrivate, options.resolveHost);
  const timeoutMs = Math.max(1_000, Math.min(options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS, 120_000));
  const maxBytes = Math.max(1_024, Math.min(options.maxResponseBytes ?? DEFAULT_HTTP_RESPONSE_BYTES, 8 * 1024 * 1024));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, { ...init, redirect: "manual", signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw httpError(`${options.label} timed out`, 503);
    throw httpError(`${options.label} request failed`, 503);
  } finally {
    clearTimeout(timeout);
  }
  if (response.status >= 300 && response.status < 400) {
    throw httpError(`${options.label} redirects are not allowed`, 503);
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw httpError(`${options.label} response exceeds the byte limit`, 503);
  }
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (response.ok && contentType !== "application/json" && !contentType.endsWith("+json")) {
    throw httpError(`${options.label} returned an unsupported content type`, 503);
  }
  const text = await readBoundedBody(response, maxBytes, options.label);
  if (!response.ok) throw httpError(`${options.label} failed (${response.status})`, 503);
  try {
    const value = JSON.parse(text) as unknown;
    assertBoundedJson(value, `${options.label} response`, { maxBytes });
    return { response, value };
  } catch {
    throw httpError(`${options.label} returned invalid JSON`, 503);
  }
}

export function secretFingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/\b(?:sk|key|token)-[A-Za-z0-9._-]{8,}\b/gi, "[redacted]")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/(api[_ -]?key|secret|password)(\s*[=:]\s*)[^\s,;]+/gi, "$1$2[redacted]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, "$1[redacted]@");
}

export class InMemoryRateLimiter {
  readonly #buckets = new Map<string, RateBucket>();

  constructor(
    private readonly policy: RateLimitPolicy,
    private readonly now: () => number = Date.now,
    private readonly maxBuckets = 20_000,
  ) {
    if (!Number.isFinite(policy.windowMs) || policy.windowMs < 1_000 || policy.windowMs > 86_400_000) {
      throw new Error("rate-limit window must be between 1 second and 24 hours");
    }
    for (const [kind, limit] of Object.entries(policy.limits)) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 1_000_000) {
        throw new Error(`invalid ${kind} rate limit`);
      }
    }
  }

  consume(kind: RateLimitClass, identity: string): { limit: number; remaining: number; retryAfterSeconds: number } {
    const limit = this.policy.limits[kind];
    const now = this.now();
    const key = `${kind}:${secretFingerprint(identity)}`;
    const current = this.#buckets.get(key);
    const bucket = !current || current.resetsAt <= now
      ? { count: 0, resetsAt: now + this.policy.windowMs }
      : current;
    bucket.count += 1;
    this.#buckets.set(key, bucket);
    if (this.#buckets.size > this.maxBuckets) {
      for (const [bucketKey, value] of this.#buckets) {
        if (value.resetsAt <= now) this.#buckets.delete(bucketKey);
      }
      while (this.#buckets.size > this.maxBuckets) {
        const oldest = this.#buckets.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        this.#buckets.delete(oldest);
      }
    }
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetsAt - now) / 1_000));
    if (bucket.count > limit) throw Object.assign(httpError("rate limit exceeded", 429), {
      limit,
      remaining: 0,
      retryAfterSeconds,
    });
    return { limit, remaining: Math.max(0, limit - bucket.count), retryAfterSeconds };
  }
}
