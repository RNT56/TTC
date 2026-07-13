-- Add the bounded vendor-refresh normalizer to the existing internal worker queue.
-- This is additive: older application binaries can leave the new job kind unclaimed,
-- while the current Python worker registers and materializes it transactionally.

ALTER TABLE jobs
  DROP CONSTRAINT IF EXISTS jobs_kind_check;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_kind_check CHECK (kind IN (
    'etl.ingest-component',
    'occt.tessellate',
    'photoscan.single',
    'photoscan.multiview',
    'train.policy',
    'train.sysid-fit',
    'replay.verify',
    'codesign.evaluate',
    'bridge.config-diff',
    'bridge.telemetry-ingest',
    'bridge.supervisor-check',
    'maintenance.estimate-wear',
    'maintenance.crash-forensics',
    'maintenance.repair-sheet',
    'maintenance.fleet-summary',
    'commerce.vendor-refresh'
  ));
