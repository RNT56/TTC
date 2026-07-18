import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";
import { MAX_OBJECT_BYTES } from "./security.js";

export type ObjectAccessAction = "upload" | "download";

export interface ObjectStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  readTimeoutMs: number;
  deleteTimeoutMs: number;
}

export interface ObjectAccessContract {
  action: ObjectAccessAction;
  method: "GET" | "PUT";
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
  bucket: string;
  objectKey: string;
}

export interface PresignObjectInput {
  action: ObjectAccessAction;
  bucket: string;
  objectKey: string;
  contentType?: string | null;
  byteSize?: number | null;
  sha256?: string | null;
  expiresInSeconds?: number;
  now?: Date;
}

export interface StoredObjectRef {
  bucket: string;
  objectKey: string;
}

export interface StoredObjectWrite extends StoredObjectRef {
  bytes: Uint8Array;
  contentType: string;
  sha256: string;
}

export interface StoredObjectRead extends StoredObjectRef {
  byteSize: number;
  sha256: string;
  maxBytes: number;
}

export type ObjectDeletionAdapter = (objects: readonly StoredObjectRef[]) => Promise<void>;
export interface StoredObjectInspection {
  byteSize: number;
  contentType: string | null;
  sha256: string | null;
}
export type ObjectInspectionAdapter = (
  config: ObjectStorageConfig,
  object: StoredObjectRef,
) => Promise<StoredObjectInspection>;
export type ObjectWriteAdapter = (
  config: ObjectStorageConfig,
  object: StoredObjectWrite,
) => Promise<StoredObjectInspection>;
export type ObjectReadAdapter = (
  config: ObjectStorageConfig,
  object: StoredObjectRead,
) => Promise<Uint8Array>;
export type ObjectStreamAdapter = (
  config: ObjectStorageConfig,
  object: StoredObjectRead,
) => AsyncIterable<Uint8Array>;

function assertObjectKey(objectKey: string): void {
  if (!objectKey || objectKey.startsWith("/") || /(?:^|\/)\.\.(?:\/|$)|[\0\r\n]/.test(objectKey)) {
    throw new Error("object key is invalid");
  }
}

function objectStorageClient(config: ObjectStorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function normalizedSha256(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error("object SHA-256 is invalid");
  return normalized;
}

function sha256Base64(value: string): string {
  return Buffer.from(value, "hex").toString("base64");
}

export function objectStorageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ObjectStorageConfig {
  const production = env.NODE_ENV === "production";
  const config = {
    endpoint: env.FORGE_OBJECT_ENDPOINT ?? "http://localhost:9000",
    region: env.FORGE_OBJECT_REGION ?? env.AWS_REGION ?? "us-east-1",
    bucket: env.FORGE_OBJECT_BUCKET ?? "forge-artifacts",
    accessKeyId: env.FORGE_OBJECT_ACCESS_KEY_ID ?? env.AWS_ACCESS_KEY_ID ?? env.MINIO_ROOT_USER ?? "forge",
    secretAccessKey:
      env.FORGE_OBJECT_SECRET_ACCESS_KEY ?? env.AWS_SECRET_ACCESS_KEY ?? env.MINIO_ROOT_PASSWORD ?? "forge-dev-only",
    forcePathStyle: (env.FORGE_OBJECT_FORCE_PATH_STYLE ?? "1") !== "0",
    readTimeoutMs: Math.min(
      60 * 60_000,
      Math.max(30_000, Number(env.FORGE_OBJECT_READ_TIMEOUT_MS ?? 30 * 60_000) || 30 * 60_000),
    ),
    deleteTimeoutMs: Math.min(120_000, Math.max(1000, Number(env.FORGE_OBJECT_DELETE_TIMEOUT_MS ?? 15_000) || 15_000)),
  };
  let endpoint: URL;
  try {
    endpoint = new URL(config.endpoint);
  } catch {
    throw new Error("FORGE_OBJECT_ENDPOINT must be an absolute HTTP(S) URL");
  }
  if (
    !["http:", "https:"].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error("FORGE_OBJECT_ENDPOINT must be a credential-free HTTP(S) endpoint");
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket)) {
    throw new Error("FORGE_OBJECT_BUCKET must be an S3-compatible bucket name");
  }
  if (production) {
    if (!env.FORGE_OBJECT_ENDPOINT || !env.FORGE_OBJECT_BUCKET) {
      throw new Error("production object storage endpoint and bucket must be explicit");
    }
    if (
      !env.FORGE_OBJECT_ACCESS_KEY_ID ||
      !env.FORGE_OBJECT_SECRET_ACCESS_KEY ||
      config.accessKeyId === "forge" ||
      config.secretAccessKey === "forge-dev-only" ||
      config.secretAccessKey.length < 16
    ) {
      throw new Error("production object storage requires explicit non-development credentials");
    }
    if (endpoint.protocol !== "https:" && env.FORGE_OBJECT_ALLOW_INSECURE_INTERNAL !== "1") {
      throw new Error("production object storage must use HTTPS unless the internal transport exception is explicit");
    }
  }
  return config;
}

export async function probeObjectStorage(config: ObjectStorageConfig): Promise<void> {
  const client = objectStorageClient(config);
  try {
    await client.send(
      new HeadBucketCommand({ Bucket: config.bucket }),
      { abortSignal: AbortSignal.timeout(Math.min(config.deleteTimeoutMs, 10_000)) },
    );
  } finally {
    client.destroy();
  }
}

export async function presignObjectAccess(
  config: ObjectStorageConfig,
  input: PresignObjectInput,
): Promise<ObjectAccessContract> {
  const expiresInSeconds = Math.min(Math.max(input.expiresInSeconds ?? 900, 60), 3600);
  if (input.bucket !== config.bucket) throw new Error("object bucket is outside the configured boundary");
  assertObjectKey(input.objectKey);
  if (input.action === "upload") {
    if (!Number.isSafeInteger(input.byteSize) || Number(input.byteSize) < 0 || Number(input.byteSize) > MAX_OBJECT_BYTES) {
      throw new Error("object upload requires a bounded declared byte size");
    }
    if (
      typeof input.contentType !== "string" ||
      input.contentType.length > 160 ||
      !/^[A-Za-z0-9][A-Za-z0-9!#$&^_.+\/-]*$/.test(input.contentType)
    ) {
      throw new Error("object upload requires a valid content type");
    }
  }
  const sha256 = normalizedSha256(input.sha256);
  const client = objectStorageClient(config);
  const command =
    input.action === "upload"
      ? new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
          ContentType: input.contentType ?? "application/octet-stream",
          ContentLength: input.byteSize ?? undefined,
          ChecksumSHA256: sha256 ? sha256Base64(sha256) : undefined,
        })
      : new GetObjectCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
          ResponseContentDisposition: "attachment",
          ResponseContentType: "application/octet-stream",
        });
  let url: string;
  try {
    url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  } finally {
    client.destroy();
  }
  const now = input.now ?? new Date();
  return {
    action: input.action,
    method: input.action === "upload" ? "PUT" : "GET",
    url,
    headers:
      input.action === "upload"
        ? {
            "content-type": input.contentType ?? "application/octet-stream",
            ...(sha256 ? { "x-amz-checksum-sha256": sha256Base64(sha256) } : {}),
          }
        : {},
    expiresAt: new Date(now.getTime() + expiresInSeconds * 1000).toISOString(),
    bucket: input.bucket,
    objectKey: input.objectKey,
  };
}

export async function inspectStoredObject(
  config: ObjectStorageConfig,
  object: StoredObjectRef,
): Promise<StoredObjectInspection> {
  if (object.bucket !== config.bucket) throw new Error("object bucket is outside the configured boundary");
  assertObjectKey(object.objectKey);
  const client = objectStorageClient(config);
  try {
    const result = await client.send(
      new HeadObjectCommand({
        Bucket: object.bucket,
        Key: object.objectKey,
        ChecksumMode: "ENABLED",
      }),
      { abortSignal: AbortSignal.timeout(config.deleteTimeoutMs) },
    );
    if (!Number.isSafeInteger(result.ContentLength) || Number(result.ContentLength) < 0) {
      throw new Error("object storage returned an invalid byte length");
    }
    let sha256: string | null = null;
    if (result.ChecksumSHA256) {
      const decoded = Buffer.from(result.ChecksumSHA256, "base64");
      if (decoded.byteLength !== 32) throw new Error("object storage returned an invalid SHA-256 checksum");
      sha256 = decoded.toString("hex");
    }
    return {
      byteSize: Number(result.ContentLength),
      contentType: result.ContentType?.split(";", 1)[0]?.trim().toLowerCase() ?? null,
      sha256,
    };
  } finally {
    client.destroy();
  }
}

export async function putStoredObject(
  config: ObjectStorageConfig,
  object: StoredObjectWrite,
): Promise<StoredObjectInspection> {
  if (object.bucket !== config.bucket) throw new Error("object bucket is outside the configured boundary");
  assertObjectKey(object.objectKey);
  const bytes = Buffer.from(object.bytes);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_OBJECT_BYTES) {
    throw new Error("object bytes are outside the supported range");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9!#$&^_.+\/-]{0,159}$/.test(object.contentType)) {
    throw new Error("object content type is invalid");
  }
  const declaredSha256 = normalizedSha256(object.sha256);
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (declaredSha256 !== actualSha256) throw new Error("object bytes do not match their SHA-256 declaration");

  const client = objectStorageClient(config);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: object.bucket,
        Key: object.objectKey,
        Body: bytes,
        ContentType: object.contentType,
        ContentLength: bytes.byteLength,
        ChecksumSHA256: sha256Base64(actualSha256),
      }),
      { abortSignal: AbortSignal.timeout(config.deleteTimeoutMs) },
    );
    return {
      byteSize: bytes.byteLength,
      contentType: object.contentType.toLowerCase(),
      sha256: actualSha256,
    };
  } finally {
    client.destroy();
  }
}

export async function* streamStoredObject(
  config: ObjectStorageConfig,
  object: StoredObjectRead,
): AsyncGenerator<Uint8Array> {
  if (object.bucket !== config.bucket) throw new Error("object bucket is outside the configured boundary");
  assertObjectKey(object.objectKey);
  if (
    !Number.isSafeInteger(object.byteSize)
    || object.byteSize <= 0
    || !Number.isSafeInteger(object.maxBytes)
    || object.maxBytes <= 0
    || object.byteSize > object.maxBytes
    || object.maxBytes > MAX_OBJECT_BYTES
  ) {
    throw new Error("object download size is outside the supported range");
  }
  const declaredSha256 = normalizedSha256(object.sha256);
  const client = objectStorageClient(config);
  try {
    const result = await client.send(
      new GetObjectCommand({ Bucket: object.bucket, Key: object.objectKey }),
      { abortSignal: AbortSignal.timeout(config.readTimeoutMs) },
    );
    const body = result.Body as AsyncIterable<Uint8Array> | undefined;
    if (!body || typeof body[Symbol.asyncIterator] !== "function") {
      throw new Error("object storage returned a non-streaming body");
    }
    const hasher = createHash("sha256");
    let total = 0;
    for await (const chunk of body) {
      const bytes = Buffer.from(chunk);
      total += bytes.byteLength;
      if (total > object.maxBytes || total > object.byteSize) {
        throw new Error("object storage exceeded the declared download size");
      }
      hasher.update(bytes);
      yield bytes;
    }
    if (total !== object.byteSize) throw new Error("object storage returned a partial download");
    const actualSha256 = hasher.digest("hex");
    if (actualSha256 !== declaredSha256) throw new Error("object storage returned a checksum mismatch");
  } finally {
    client.destroy();
  }
}

export async function readStoredObject(
  config: ObjectStorageConfig,
  object: StoredObjectRead,
): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of streamStoredObject(config, object)) {
    const bytes = Buffer.from(chunk);
    chunks.push(bytes);
    total += bytes.byteLength;
  }
  return Buffer.concat(chunks, total);
}

export async function deleteStoredObjects(
  config: ObjectStorageConfig,
  objects: readonly StoredObjectRef[],
): Promise<void> {
  const unique = new Map<string, StoredObjectRef>();
  for (const object of objects) {
    if (object.bucket !== config.bucket) throw new Error("object bucket is outside the configured boundary");
    assertObjectKey(object.objectKey);
    unique.set(`${object.bucket}\0${object.objectKey}`, object);
  }
  const byBucket = new Map<string, string[]>();
  for (const object of unique.values()) {
    const keys = byBucket.get(object.bucket) ?? [];
    keys.push(object.objectKey);
    byBucket.set(object.bucket, keys);
  }

  const client = objectStorageClient(config);
  try {
    for (const [bucket, keys] of byBucket) {
      for (let start = 0; start < keys.length; start += 1000) {
        const chunk = keys.slice(start, start + 1000);
        const result = await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: false },
          }),
          { abortSignal: AbortSignal.timeout(config.deleteTimeoutMs) },
        );
        if ((result.Errors?.length ?? 0) > 0) {
          const codes = [...new Set(result.Errors?.map((error) => error.Code ?? "unknown") ?? [])];
          throw Object.assign(
            new Error(`object storage rejected ${result.Errors?.length ?? 0} deletion(s): ${codes.join(", ")}`),
            { statusCode: 503 },
          );
        }
      }
    }
  } finally {
    client.destroy();
  }
}
