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
    'maintenance.fleet-summary'
  ));
