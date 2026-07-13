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
  return {
    endpoint: env.FORGE_OBJECT_ENDPOINT ?? "http://localhost:9000",
    region: env.FORGE_OBJECT_REGION ?? env.AWS_REGION ?? "us-east-1",
    bucket: env.FORGE_OBJECT_BUCKET ?? "forge-artifacts",
    accessKeyId: env.FORGE_OBJECT_ACCESS_KEY_ID ?? env.AWS_ACCESS_KEY_ID ?? env.MINIO_ROOT_USER ?? "forge",
    secretAccessKey:
      env.FORGE_OBJECT_SECRET_ACCESS_KEY ?? env.AWS_SECRET_ACCESS_KEY ?? env.MINIO_ROOT_PASSWORD ?? "forge-dev-only",
    forcePathStyle: (env.FORGE_OBJECT_FORCE_PATH_STYLE ?? "1") !== "0",
    deleteTimeoutMs: Math.max(1000, Number(env.FORGE_OBJECT_DELETE_TIMEOUT_MS ?? 15_000) || 15_000),
  };
}

export async function presignObjectAccess(
  config: ObjectStorageConfig,
  input: PresignObjectInput,
): Promise<ObjectAccessContract> {
  const expiresInSeconds = Math.min(Math.max(input.expiresInSeconds ?? 900, 60), 3600);
  const client = objectStorageClient(config);
  const command =
    input.action === "upload"
      ? new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
          ContentType: input.contentType ?? "application/octet-stream",
        })
      : new GetObjectCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
        });
  const url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
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
