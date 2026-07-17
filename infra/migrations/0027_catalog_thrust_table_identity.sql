-- D66: preserve versioned bench-table identity and per-point voltage authority.
-- Historical rows lacked table/prop/source metadata. Keep them readable as one
-- explicitly unattributed v1 sweep; never fabricate the missing authority.
ALTER TABLE thrust_tables
  ADD COLUMN table_id text,
  ADD COLUMN row_schema_version text,
  ADD COLUMN prop text,
  ADD COLUMN confidence numeric,
  ADD COLUMN source_url text;

UPDATE thrust_tables
   SET table_id = 'legacy-unattributed',
       row_schema_version = '1.0.0';

ALTER TABLE thrust_tables
  ALTER COLUMN table_id SET DEFAULT 'legacy-unattributed',
  ALTER COLUMN table_id SET NOT NULL,
  ALTER COLUMN row_schema_version SET DEFAULT '1.0.0',
  ALTER COLUMN row_schema_version SET NOT NULL;

ALTER TABLE thrust_tables DROP CONSTRAINT thrust_tables_pkey;
ALTER TABLE thrust_tables
  ADD PRIMARY KEY (component_id, table_id, voltage, throttle),
  ADD CONSTRAINT thrust_tables_table_id_nonempty
    CHECK (btrim(table_id) <> '' AND char_length(table_id) <= 256),
  ADD CONSTRAINT thrust_tables_row_schema_version_supported
    CHECK (row_schema_version IN ('1.0.0', '2.0.0')),
  ADD CONSTRAINT thrust_tables_values_bounded
    CHECK (
      voltage > 0 AND voltage < 'Infinity'::numeric
      AND throttle >= 0 AND throttle <= 1
      AND thrust_g >= 0 AND thrust_g < 'Infinity'::numeric
      AND current_a >= 0 AND current_a < 'Infinity'::numeric
      AND (rpm IS NULL OR (rpm >= 0 AND rpm < 'Infinity'::numeric))
    ),
  ADD CONSTRAINT thrust_tables_confidence_bounded
    CHECK (confidence IS NULL OR (confidence > 0 AND confidence <= 1)),
  ADD CONSTRAINT thrust_tables_v2_authority_complete
    CHECK (
      row_schema_version = '1.0.0'
      OR (
        table_id <> 'legacy-unattributed'
        AND prop IS NOT NULL AND btrim(prop) <> '' AND char_length(prop) <= 256
        AND confidence IS NOT NULL
        AND source_url IS NOT NULL AND source_url LIKE 'https://%'
        AND char_length(source_url) <= 2048
      )
    );
