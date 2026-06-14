import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type ObjectAccessAction = "upload" | "download";

export interface ObjectStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
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

export function objectStorageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ObjectStorageConfig {
  return {
    endpoint: env.FORGE_OBJECT_ENDPOINT ?? "http://localhost:9000",
    region: env.FORGE_OBJECT_REGION ?? env.AWS_REGION ?? "us-east-1",
    bucket: env.FORGE_OBJECT_BUCKET ?? "forge-artifacts",
    accessKeyId: env.FORGE_OBJECT_ACCESS_KEY_ID ?? env.AWS_ACCESS_KEY_ID ?? env.MINIO_ROOT_USER ?? "forge",
    secretAccessKey:
      env.FORGE_OBJECT_SECRET_ACCESS_KEY ?? env.AWS_SECRET_ACCESS_KEY ?? env.MINIO_ROOT_PASSWORD ?? "forge-dev-only",
    forcePathStyle: (env.FORGE_OBJECT_FORCE_PATH_STYLE ?? "1") !== "0",
  };
}

export async function presignObjectAccess(
  config: ObjectStorageConfig,
  input: PresignObjectInput,
): Promise<ObjectAccessContract> {
  const expiresInSeconds = Math.min(Math.max(input.expiresInSeconds ?? 900, 60), 3600);
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
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
