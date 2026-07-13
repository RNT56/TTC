import { randomUUID } from "node:crypto";
import type { CurrentUser } from "./auth.js";
import { withGatewayTransaction, type GatewayDb } from "./db.js";
import type { ObjectDeletionAdapter, StoredObjectRef } from "./objectStorage.js";

export const USER_DATA_EXPORT_VERSION = "1.0.0";
export const ACCOUNT_DELETION_RECEIPT_VERSION = "1.0.0";

interface ExportDataset {
  key: string;
  sql: string;
}

const exportDatasets: readonly ExportDataset[] = [
  {
    key: "account",
    sql: `SELECT id, name, email, "emailVerified" AS "emailVerified", image
            FROM users WHERE id = $1`,
  },
  {
    key: "authenticationProviders",
    sql: `SELECT id, provider, type, "providerAccountId" AS "providerAccountId",
                 expires_at AS "expiresAt", scope, token_type AS "tokenType"
            FROM accounts WHERE "userId" = $1 ORDER BY provider, id`,
  },
  {
    key: "sessions",
    sql: `SELECT id, expires FROM sessions WHERE "userId" = $1 ORDER BY expires`,
  },
  {
    key: "creditAccounts",
    sql: `SELECT balance_credits AS "balanceCredits", updated_at AS "updatedAt"
            FROM credit_accounts WHERE user_id = $1`,
  },
  {
    key: "creditLedger",
    sql: `SELECT id, delta_credits AS "deltaCredits", reason, source_kind AS "sourceKind",
                 source_id AS "sourceId", idempotency_key AS "idempotencyKey", created_at AS "createdAt"
            FROM credit_ledger WHERE user_id = $1 ORDER BY id`,
  },
  {
    key: "usageEvents",
    sql: `SELECT id, event_kind AS "eventKind", provider, units, cost_credits AS "costCredits",
                 idempotency_key AS "idempotencyKey", created_at AS "createdAt"
            FROM usage_events WHERE user_id = $1 ORDER BY id`,
  },
  {
    key: "generatedArtifacts",
    sql: `SELECT id, artifact_id AS "artifactId", status, prompt, provider, archetype, categories,
                 seed, contract_hash AS "contractHash", prompt_hash AS "promptHash", model_id AS "modelId",
                 contract, validator_report AS "validatorReport", attempts, context, model_pins AS "modelPins",
                 visibility, source_kind AS "sourceKind", share_eligible AS "shareEligible", lineage,
                 created_at AS "createdAt"
            FROM generated_artifacts WHERE owner_user_id = $1 ORDER BY id`,
  },
  {
    key: "models",
    sql: `SELECT id, source_artifact_id AS "sourceArtifactId", status, visibility, name, archetype,
                 contract_hash AS "contractHash", contract, validator_report AS "validatorReport", lineage,
                 created_at AS "createdAt", updated_at AS "updatedAt"
            FROM model_registry WHERE owner_user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: "shareSnapshots",
    sql: `SELECT id, model_id AS "modelId", contract_hash AS "contractHash", contract,
                 validator_report AS "validatorReport", created_at AS "createdAt", revoked_at AS "revokedAt"
            FROM share_snapshots WHERE owner_user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: "objectBlobs",
    sql: `SELECT id, visibility, cache_key AS "cacheKey", bucket, object_key AS "objectKey",
                 content_type AS "contentType", byte_size AS "byteSize", sha256, metadata,
                 created_at AS "createdAt"
            FROM object_blobs WHERE owner_user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: "jobs",
    sql: `SELECT id, kind, status, provider, idempotency_key AS "idempotencyKey", input, output, error,
                 cost_credits AS "costCredits", attempts,
                 created_at AS "createdAt",
                 started_at AS "startedAt", finished_at AS "finishedAt"
            FROM jobs WHERE owner_user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: "jobEvents",
    sql: `SELECT e.id, e.job_id AS "jobId", e.event, e.payload, e.created_at AS "createdAt"
            FROM job_events e JOIN jobs j ON j.id = e.job_id
           WHERE j.owner_user_id = $1 ORDER BY e.id`,
  },
  {
    key: "photoscanArtifacts",
    sql: `SELECT id, job_id AS "jobId", source_blob_ids AS "sourceBlobIds",
                 artifact_blob_id AS "artifactBlobId", scale_axes_ports AS "scaleAxesPorts",
                 refit_primitives AS "refitPrimitives", candidate_component AS "candidateComponent",
                 validator_report AS "validatorReport", created_at AS "createdAt"
            FROM photoscan_artifacts WHERE owner_user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: "replayArtifacts",
    sql: `SELECT id, model_id AS "modelId", tape, verification, tamper_hash AS "tamperHash",
                 created_at AS "createdAt"
            FROM replay_artifacts WHERE owner_user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: "policyArtifacts",
    sql: `SELECT id, model_id AS "modelId", task_kind AS "taskKind", scorecard,
                 artifact_blob_id AS "artifactBlobId", export_gate AS "exportGate", created_at AS "createdAt"
            FROM policy_artifacts WHERE owner_user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: "courses",
    sql: `SELECT id, name, env_spec AS "envSpec", validator_report AS "validatorReport", visibility,
                 created_at AS "createdAt"
            FROM courses WHERE owner_user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: "leaderboardRuns",
    sql: `SELECT id, course_id AS "courseId", policy_id AS "policyId", replay_id AS "replayId",
                 archetype, class_key AS "classKey", score, verified, verification, created_at AS "createdAt"
            FROM leaderboard_runs WHERE user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: "marketplaceListings",
    sql: `SELECT id, model_id AS "modelId", course_id AS "courseId", listing_kind AS "listingKind",
                 status, title, license_class AS "licenseClass", export_policy AS "exportPolicy",
                 price_credits AS "priceCredits", validator_report AS "validatorReport", moderation,
                 created_at AS "createdAt", updated_at AS "updatedAt"
            FROM marketplace_listings WHERE owner_user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: "marketplaceUsageRollups",
    sql: `SELECT r.bucket_date AS "bucketDate", r.listing_id AS "listingId",
                 r.listing_kind AS "listingKind", r.views, r.equips,
                 r.quote_clicks AS "quoteClicks", r.policy_downloads AS "policyDownloads",
                 r.training_jobs AS "trainingJobs", r.credits_spent AS "creditsSpent",
                 r.updated_at AS "updatedAt"
            FROM marketplace_usage_rollups r
            JOIN marketplace_listings l ON l.id = r.listing_id
           WHERE l.owner_user_id = $1 ORDER BY r.bucket_date, r.listing_id`,
  },
  {
    key: "policySignoffs",
    sql: `SELECT id, target_kind AS "targetKind", target_id AS "targetId", jurisdiction,
                 policy_version AS "policyVersion", status, answers, created_at AS "createdAt"
            FROM policy_signoffs WHERE owner_user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: "moderationReports",
    sql: `SELECT id, target_kind AS "targetKind", target_id AS "targetId", reason, detail, status,
                 sla_due_at AS "slaDueAt", repeat_infringer_signal AS "repeatInfringerSignal",
                 created_at AS "createdAt", updated_at AS "updatedAt"
            FROM moderation_reports WHERE reporter_user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: "classroomAssignments",
    sql: `SELECT id, course_id AS "courseId", title, brief, rubric, visibility, due_at AS "dueAt",
                 created_at AS "createdAt"
            FROM classroom_assignments WHERE owner_user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: "classroomSubmissions",
    sql: `SELECT id, assignment_id AS "assignmentId", model_id AS "modelId", policy_id AS "policyId",
                 replay_id AS "replayId", contract, validator_report AS "validatorReport", scorecard,
                 grade, status, created_at AS "createdAt"
            FROM classroom_submissions WHERE student_user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: "telemetryLogs",
    sql: `SELECT id, model_id AS "modelId", source, captured_at AS "capturedAt", tape, privacy,
                 created_at AS "createdAt"
            FROM telemetry_logs WHERE owner_user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: "maintenanceRecords",
    sql: `SELECT id, model_id AS "modelId", telemetry_id AS "telemetryId", record_kind AS "recordKind",
                 severity, summary, payload, created_at AS "createdAt"
            FROM maintenance_records WHERE owner_user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: "printQuoteRequests",
    sql: `SELECT id, model_id AS "modelId", job_id AS "jobId", artifact_blob_id AS "artifactBlobId",
                 process, material, profile, quantity, status, dfm_artifact AS "dfmArtifact",
                 created_at AS "createdAt", updated_at AS "updatedAt"
            FROM print_quote_requests WHERE owner_user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: "printQuoteOffers",
    sql: `SELECT o.id, o.request_id AS "requestId", o.provider,
                 o.provider_quote_id AS "providerQuoteId", o.quote_url AS "quoteUrl",
                 o.price, o.currency, o.lead_time_days AS "leadTimeDays",
                 o.expires_at AS "expiresAt", o.terms, o.created_at AS "createdAt"
            FROM print_quote_offers o
            JOIN print_quote_requests r ON r.id = o.request_id
           WHERE r.owner_user_id = $1 ORDER BY o.created_at, o.id`,
  },
  {
    key: "generationRefusals",
    sql: `SELECT id, prompt_hash AS "promptHash", prompt_length_bucket AS "promptLengthBucket",
                 policy_version AS "policyVersion", detector_version AS "detectorVersion", categories,
                 rule_ids AS "ruleIds", surface, provider_requested AS "providerRequested", archetype,
                 created_at AS "createdAt"
            FROM generation_refusals WHERE owner_user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: "patternContributions",
    sql: `SELECT p.id, p.source_artifact_id AS "sourceArtifactId", p.source_kind AS "sourceKind",
                 p.archetype, p.consent, p.summary, p.embedding::text AS embedding,
                 p.token_vector AS "tokenVector", p.created_at AS "createdAt"
            FROM pattern_library p JOIN generated_artifacts g ON g.artifact_id = p.source_artifact_id
           WHERE g.owner_user_id = $1 ORDER BY p.created_at, p.id`,
  },
];

export interface UserDataExport {
  formatVersion: typeof USER_DATA_EXPORT_VERSION;
  exportedAt: string;
  subject: { userId: string };
  security: {
    excludedSecrets: readonly string[];
    objectPayloads: "download-via-authenticated-blob-access-endpoints";
  };
  objectDownloads: { blobId: string; accessEndpoint: string }[];
  data: Record<string, Record<string, unknown>[]>;
}

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

export async function exportUserData(db: GatewayDb, user: CurrentUser): Promise<UserDataExport> {
  return withGatewayTransaction(
    db,
    { isolation: "repeatable read", readOnly: true },
    async (transaction) => {
      const data: Record<string, Record<string, unknown>[]> = {};
      for (const dataset of exportDatasets) {
        const result = await transaction.query<Record<string, unknown>>(dataset.sql, [user.id]);
        data[dataset.key] = result.rows;
      }
      if ((data.account?.length ?? 0) !== 1) throw httpError(404, "account not found");
      const objectDownloads = (data.objectBlobs ?? []).flatMap((row) =>
        typeof row.id === "string"
          ? [{ blobId: row.id, accessEndpoint: `/v1/blobs/${encodeURIComponent(row.id)}/access` }]
          : [],
      );
      return {
        formatVersion: USER_DATA_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        subject: { userId: user.id },
        security: {
          excludedSecrets: [
            "OAuth access tokens",
            "OAuth refresh tokens",
            "OIDC ID tokens",
            "session tokens",
            "verification tokens",
            "provider API keys",
          ],
          objectPayloads: "download-via-authenticated-blob-access-endpoints",
        },
        objectDownloads,
        data,
      };
    },
  );
}

interface PurgeStep {
  key: string;
  sql: string;
}

const purgeSteps: readonly PurgeStep[] = [
  {
    key: "patternContributions",
    sql: `DELETE FROM pattern_library
           WHERE source_artifact_id IN (
             SELECT artifact_id FROM generated_artifacts WHERE owner_user_id = $1
           )`,
  },
  {
    key: "policySignoffs",
    sql: `DELETE FROM policy_signoffs WHERE owner_user_id = $1`,
  },
  {
    key: "moderationReports",
    sql: `DELETE FROM moderation_reports WHERE reporter_user_id = $1`,
  },
  {
    key: "classroomSubmissions",
    sql: `DELETE FROM classroom_submissions
           WHERE student_user_id = $1
              OR assignment_id IN (SELECT id FROM classroom_assignments WHERE owner_user_id = $1)`,
  },
  {
    key: "classroomAssignments",
    sql: `DELETE FROM classroom_assignments WHERE owner_user_id = $1`,
  },
  {
    key: "marketplaceUsageRollups",
    sql: `DELETE FROM marketplace_usage_rollups r
           USING marketplace_listings l
           WHERE r.listing_id = l.id
             AND (l.owner_user_id = $1
               OR l.model_id IN (SELECT id FROM model_registry WHERE owner_user_id = $1)
               OR l.course_id IN (SELECT id FROM courses WHERE owner_user_id = $1))`,
  },
  {
    key: "marketplaceListings",
    sql: `DELETE FROM marketplace_listings
           WHERE owner_user_id = $1
              OR model_id IN (SELECT id FROM model_registry WHERE owner_user_id = $1)
              OR course_id IN (SELECT id FROM courses WHERE owner_user_id = $1)`,
  },
  {
    key: "printQuoteOffers",
    sql: `DELETE FROM print_quote_offers o
           USING print_quote_requests r
           WHERE o.request_id = r.id
             AND (r.owner_user_id = $1
               OR r.model_id IN (SELECT id FROM model_registry WHERE owner_user_id = $1))`,
  },
  {
    key: "printQuoteRequests",
    sql: `DELETE FROM print_quote_requests
           WHERE owner_user_id = $1
              OR model_id IN (SELECT id FROM model_registry WHERE owner_user_id = $1)`,
  },
  {
    key: "leaderboardRuns",
    sql: `DELETE FROM leaderboard_runs
           WHERE user_id = $1
              OR course_id IN (SELECT id FROM courses WHERE owner_user_id = $1)`,
  },
  {
    key: "maintenanceRecords",
    sql: `DELETE FROM maintenance_records WHERE owner_user_id = $1`,
  },
  {
    key: "telemetryLogs",
    sql: `DELETE FROM telemetry_logs WHERE owner_user_id = $1`,
  },
  {
    key: "policyArtifacts",
    sql: `DELETE FROM policy_artifacts WHERE owner_user_id = $1`,
  },
  {
    key: "replayArtifacts",
    sql: `DELETE FROM replay_artifacts WHERE owner_user_id = $1`,
  },
  {
    key: "photoscanArtifacts",
    sql: `DELETE FROM photoscan_artifacts WHERE owner_user_id = $1`,
  },
  {
    key: "jobs",
    sql: `DELETE FROM jobs WHERE owner_user_id = $1`,
  },
  {
    key: "courses",
    sql: `DELETE FROM courses WHERE owner_user_id = $1`,
  },
  {
    key: "shareSnapshots",
    sql: `DELETE FROM share_snapshots WHERE owner_user_id = $1`,
  },
  {
    key: "models",
    sql: `DELETE FROM model_registry WHERE owner_user_id = $1`,
  },
  {
    key: "generatedArtifacts",
    sql: `DELETE FROM generated_artifacts WHERE owner_user_id = $1`,
  },
  {
    key: "generationRefusals",
    sql: `DELETE FROM generation_refusals WHERE owner_user_id = $1`,
  },
  {
    key: "usageEvents",
    sql: `DELETE FROM usage_events WHERE user_id = $1`,
  },
  {
    key: "creditLedger",
    sql: `DELETE FROM credit_ledger WHERE user_id = $1`,
  },
  {
    key: "creditAccounts",
    sql: `DELETE FROM credit_accounts WHERE user_id = $1`,
  },
  {
    key: "accounts",
    sql: `DELETE FROM accounts WHERE "userId" = $1`,
  },
  {
    key: "sessions",
    sql: `DELETE FROM sessions WHERE "userId" = $1`,
  },
  {
    key: "objectBlobs",
    sql: `DELETE FROM object_blobs WHERE owner_user_id = $1`,
  },
];

export interface AccountDeletionReceipt {
  formatVersion: typeof ACCOUNT_DELETION_RECEIPT_VERSION;
  deletionId: string;
  deletedAt: string;
  primaryDataDeleted: true;
  objectPayloadsDeleted: true;
  backupLifecycle: "not-covered-primary-only-see-SEC-005";
  counts: Record<string, number>;
}

export async function deleteUserData(
  db: GatewayDb,
  user: CurrentUser,
  deleteObjects: ObjectDeletionAdapter,
): Promise<AccountDeletionReceipt> {
  return withGatewayTransaction(db, { isolation: "serializable" }, async (transaction) => {
    const account = await transaction.query<{ id: string; email: string | null }>(
      `SELECT id, email FROM users WHERE id = $1 FOR UPDATE`,
      [user.id],
    );
    const row = account.rows[0];
    if (!row) throw httpError(404, "account not found");

    const blobs = await transaction.query<StoredObjectRef>(
      `SELECT bucket, object_key AS "objectKey"
         FROM object_blobs
        WHERE owner_user_id = $1
        ORDER BY bucket, object_key`,
      [user.id],
    );

    const counts: Record<string, number> = {};
    for (const step of purgeSteps) {
      const result = await transaction.query(step.sql, [user.id]);
      counts[step.key] = result.rowCount ?? 0;
    }
    if (row.email) {
      const tokens = await transaction.query(`DELETE FROM verification_token WHERE identifier = $1`, [row.email]);
      counts.verificationTokens = tokens.rowCount ?? 0;
    } else {
      counts.verificationTokens = 0;
    }

    await deleteObjects(blobs.rows);

    const deletedAccount = await transaction.query(`DELETE FROM users WHERE id = $1`, [user.id]);
    if (deletedAccount.rowCount !== 1) throw httpError(409, "account changed during deletion");
    counts.users = 1;

    return {
      formatVersion: ACCOUNT_DELETION_RECEIPT_VERSION,
      deletionId: `del-${randomUUID()}`,
      deletedAt: new Date().toISOString(),
      primaryDataDeleted: true,
      objectPayloadsDeleted: true,
      backupLifecycle: "not-covered-primary-only-see-SEC-005",
      counts,
    };
  });
}
