import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type ObjectAccessAction = "upload" | "download";

export interface ObjectStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
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
  expiresInSeconds?: number;
  now?: Date;
}

export interface StoredObjectRef {
  bucket: string;
  objectKey: string;
}

export type ObjectDeletionAdapter = (objects: readonly StoredObjectRef[]) => Promise<void>;

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

export async function presignObjectAccess(
  config: ObjectStorageConfig,
  input: PresignObjectInput,
): Promise<ObjectAccessContract> {
  const expiresInSeconds = Math.min(Math.max(input.expiresInSeconds ?? 900, 60), 3600);
  if (!input.objectKey || input.objectKey.startsWith("/") || /(?:^|\/)\.\.(?:\/|$)|[\0\r\n]/.test(input.objectKey)) {
    throw new Error("object key is invalid");
  }
  const client = objectStorageClient(config);
  const command =
    input.action === "upload"
      ? new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
          ContentType: input.contentType ?? "application/octet-stream",
          ContentLength: input.byteSize ?? undefined,
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
        ? { "content-type": input.contentType ?? "application/octet-stream" }
        : {},
    expiresAt: new Date(now.getTime() + expiresInSeconds * 1000).toISOString(),
    bucket: input.bucket,
    objectKey: input.objectKey,
  };
}

export async function deleteStoredObjects(
  config: ObjectStorageConfig,
  objects: readonly StoredObjectRef[],
): Promise<void> {
  const unique = new Map<string, StoredObjectRef>();
  for (const object of objects) unique.set(`${object.bucket}\0${object.objectKey}`, object);
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
