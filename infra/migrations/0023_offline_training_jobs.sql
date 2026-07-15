-- Admit the source-bound offline behavior-cloning and PPO fine-tune job kind.
-- Older application binaries leave this additive queue kind unclaimed. The current
-- gateway only enqueues it after active training-reuse consent and server-side
-- telemetry/model ownership checks.

ALTER TABLE jobs
  DROP CONSTRAINT IF EXISTS jobs_kind_check;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_kind_check CHECK (kind IN (
    'etl.ingest-component',
    'occt.tessellate',
    'photoscan.single',
    'photoscan.multiview',
    'train.policy',
    'train.offline-bc',
    'train.sysid-fit',
    'replay.verify',
    'codesign.evaluate',
    'bridge.config-diff',
    'bridge.telemetry-ingest',
    'bridge.supervisor-check',
    'commerce.vendor-refresh',
    'maintenance.estimate-wear',
    'maintenance.crash-forensics',
    'maintenance.repair-sheet',
    'maintenance.fleet-summary'
  ));
