#!/usr/bin/env node
import {
  CreateBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import {
  deleteStoredObjects,
  objectStorageConfigFromEnv,
} from "../dist/objectStorage.js";

const config = objectStorageConfigFromEnv();
const client = new S3Client({
  endpoint: config.endpoint,
  region: config.region,
  forcePathStyle: config.forcePathStyle,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
});
const key = `sec003-proof/${randomUUID()}.txt`;

try {
  try {
    await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes(error.name)
    ) {
      throw error;
    }
  }
  await client.send(
    new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: "sec003-object-delete-smoke" }),
  );
  await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  await deleteStoredObjects(config, [{ bucket: config.bucket, objectKey: key }]);
  let missing = false;
  try {
    await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  } catch (error) {
    missing =
      (error && typeof error === "object" && "$metadata" in error && error.$metadata?.httpStatusCode === 404) ||
      (error instanceof Error && error.name === "NotFound");
  }
  if (!missing) throw new Error("object survived the account-deletion storage path");
  console.log(`ok object deletion: ${config.endpoint}/${config.bucket} upload -> delete -> 404`);
} finally {
  client.destroy();
}
