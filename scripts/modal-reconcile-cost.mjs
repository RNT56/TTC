#!/usr/bin/env node
import pg from "pg";

const { Pool } = pg;

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || index + 1 >= process.argv.length) {
    throw new Error(`--${name} is required`);
  }
  return process.argv[index + 1];
}

const callId = argument("call-id");
const billingReportId = argument("billing-report-id");
const costText = argument("cost-usd");
if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,199}$/.test(callId)) {
  throw new Error("--call-id is invalid");
}
if (
  billingReportId.length < 1
  || billingReportId.length > 200
  || billingReportId.trim() !== billingReportId
  || /[\u0000-\u001f\u007f]/.test(billingReportId)
) {
  throw new Error("--billing-report-id is invalid");
}
if (!/^(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,6})?$/.test(costText)) {
  throw new Error("--cost-usd must be a non-negative decimal with at most six fractional digits");
}
const costUsd = Number(costText);
if (!Number.isFinite(costUsd) || costUsd > 1_000_000) {
  throw new Error("--cost-usd exceeds the operator reconciliation ceiling");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
    ?? "postgres://forge:forge-dev-only@localhost:5432/forge",
  max: 1,
});
const client = await pool.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  const selected = await client.query(
    `SELECT j.id AS job_id, j.provider_cost_usd AS job_cost,
            j.provider_billing_report_id AS job_report,
            j.provider_cost_reconciled_at AS job_reconciled_at,
            c.provider_cost_usd AS call_cost, c.billing_report_id AS call_report,
            c.cost_reconciled_at AS call_reconciled_at,
            (SELECT e.id FROM job_events e
              WHERE e.job_id = j.id AND e.event = 'provider-cost-reconciled'
              ORDER BY e.id DESC LIMIT 1) AS event_id
       FROM job_provider_calls c
       JOIN jobs j ON j.id = c.job_id
      WHERE c.call_id = $1 AND c.provider = 'modal' AND j.provider = 'modal'
      FOR UPDATE OF j, c`,
    [callId],
  );
  const row = selected.rows[0];
  if (!row) throw new Error("Modal provider call was not found");
  const hasExisting = row.job_reconciled_at != null || row.call_reconciled_at != null;
  if (hasExisting) {
    const same = row.job_report === billingReportId
      && row.call_report === billingReportId
      && Number(row.job_cost) === costUsd
      && Number(row.call_cost) === costUsd
      && row.job_reconciled_at != null
      && row.call_reconciled_at != null
      && row.event_id != null;
    if (!same) throw new Error("Modal provider call already has different reconciled cost authority");
  } else {
    await client.query(
      `UPDATE jobs
          SET provider_cost_usd = $2::numeric,
              provider_billing_report_id = $3,
              provider_cost_reconciled_at = now()
        WHERE id = $1`,
      [row.job_id, costText, billingReportId],
    );
    await client.query(
      `UPDATE job_provider_calls
          SET provider_cost_usd = $2::numeric,
              billing_report_id = $3,
              cost_reconciled_at = now()
        WHERE call_id = $1`,
      [callId, costText, billingReportId],
    );
    const event = await client.query(
      `INSERT INTO job_events (job_id, event, payload)
       VALUES ($1, 'provider-cost-reconciled', $2::jsonb)
       RETURNING id`,
      [
        row.job_id,
        JSON.stringify({
          provider: "modal",
          functionCallId: callId,
          billingReportId,
          providerCostUsd: costUsd,
        }),
      ],
    );
    row.event_id = event.rows[0].id;
  }
  await client.query("COMMIT");
  console.log(JSON.stringify({
    schemaVersion: "forge-modal-cost-reconciliation/1.0.0",
    jobId: row.job_id,
    functionCallId: callId,
    billingReportId,
    providerCostUsd: costUsd,
    jobEventId: String(row.event_id),
    idempotentReplay: hasExisting,
  }));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
