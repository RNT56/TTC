#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const { Client } = pg;
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://forge:forge-dev-only@localhost:5432/forge";

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};

const canonical = (value) => JSON.stringify(stable(value));

const readJsonDir = (dir) =>
  readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(readFileSync(join(dir, file), "utf8")));

const components = readJsonDir("catalog/components");
const rigs = readJsonDir("catalog/reference-rigs");

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

for (const row of components) {
  await client.query(
    `INSERT INTO licenses (id, class, terms, source_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE
     SET class = EXCLUDED.class, terms = EXCLUDED.terms, source_url = EXCLUDED.source_url`,
    [row.license.id, row.license.class, row.license.terms, row.license.sourceUrl],
  );

  const latest = row.revisions[row.revisions.length - 1].version;
  await client.query(
    `INSERT INTO components (
       id, brand, model, rev, category, dims, mass_g, elec, mech, ports,
       license_id, source, confidence
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9::jsonb, '[]'::jsonb, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE
     SET brand = EXCLUDED.brand,
         model = EXCLUDED.model,
         rev = EXCLUDED.rev,
         category = EXCLUDED.category,
         dims = EXCLUDED.dims,
         mass_g = EXCLUDED.mass_g,
         elec = EXCLUDED.elec,
         mech = EXCLUDED.mech,
         license_id = EXCLUDED.license_id,
         source = EXCLUDED.source,
         confidence = EXCLUDED.confidence`,
    [
      row.id,
      row.brand,
      row.model,
      latest,
      row.category,
      JSON.stringify(row.dims ?? {}),
      row.massG,
      JSON.stringify(row.elec ?? {}),
      JSON.stringify(row.mech ?? {}),
      row.license.id,
      row.source,
      row.confidence,
    ],
  );

  for (const rev of row.revisions) {
    const snapshot = { ...row, rev: rev.version };
    const existing = await client.query(
      "SELECT snapshot FROM component_revisions WHERE component_id = $1 AND version = $2",
      [row.id, rev.version],
    );
    if (existing.rowCount > 0) {
      if (canonical(existing.rows[0].snapshot) !== canonical(snapshot)) {
        throw new Error(`${row.id}@${rev.version}: immutable revision snapshot changed`);
      }
    } else {
      await client.query(
        `INSERT INTO component_revisions (component_id, version, snapshot)
         VALUES ($1, $2, $3::jsonb)`,
        [row.id, rev.version, JSON.stringify(snapshot)],
      );
    }
  }

  await client.query("DELETE FROM thrust_tables WHERE component_id = $1", [row.id]);
  for (const table of row.thrustTables ?? []) {
    for (const point of table.points) {
      await client.query(
        `INSERT INTO thrust_tables (component_id, voltage, throttle, thrust_g, current_a)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (component_id, voltage, throttle) DO UPDATE
         SET thrust_g = EXCLUDED.thrust_g, current_a = EXCLUDED.current_a`,
        [row.id, table.voltage, point.throttle, point.thrustG, point.currentA],
      );
    }
  }

  for (const price of row.prices) {
    await client.query(
      `INSERT INTO prices (component_id, vendor, sku, price, currency, url, fetched_at, region, purchasable)
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9)
       ON CONFLICT (component_id, vendor, fetched_at) DO UPDATE
       SET sku = EXCLUDED.sku,
           price = EXCLUDED.price,
           currency = EXCLUDED.currency,
           url = EXCLUDED.url,
           region = EXCLUDED.region,
           purchasable = EXCLUDED.purchasable`,
      [
        row.id,
        price.vendor,
        price.sku,
        price.amount,
        price.currency,
        price.url,
        price.fetchedAt,
        price.region,
        price.purchasable,
      ],
    );
  }

  for (const [field, citation] of Object.entries(row.citations ?? {})) {
    for (const source of citation.sources ?? []) {
      await client.query(
        `INSERT INTO provenance (artifact_id, field, source_url, extractor, confidence, value, note)
         VALUES ($1, $2, $3, 'file-catalog', $4, $5, $6)
         ON CONFLICT (artifact_id, field, source_url) DO UPDATE
         SET confidence = EXCLUDED.confidence,
             value = EXCLUDED.value,
             note = EXCLUDED.note`,
        [row.id, field, source, row.confidence, citation.value, citation.note ?? null],
      );
    }
  }

  if (row.confidence < 1 || row.review) {
    await client.query(
      `INSERT INTO review_queue (artifact_id, artifact_kind, reason, confidence, payload)
       VALUES ($1, 'component', $2, $3, $4::jsonb)
       ON CONFLICT (artifact_id, reason, status) DO UPDATE
       SET confidence = EXCLUDED.confidence, payload = EXCLUDED.payload`,
      [row.id, row.review ?? "confidence below 1.0", row.confidence, JSON.stringify(row)],
    );
  }
}

for (const rig of rigs) {
  await client.query(
    `INSERT INTO reference_rigs (id, name, class, purpose, decision_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE
     SET name = EXCLUDED.name,
         class = EXCLUDED.class,
         purpose = EXCLUDED.purpose,
         decision_id = EXCLUDED.decision_id`,
    [rig.id, rig.name, rig.class, rig.purpose, rig.decisionId],
  );
  await client.query("DELETE FROM reference_rig_items WHERE rig_id = $1", [rig.id]);
  for (const item of rig.items) {
    await client.query(
      `INSERT INTO reference_rig_items
       (rig_id, role, component_id, revision, quantity, required)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [rig.id, item.role, item.componentId, item.revision, item.quantity, item.required],
    );
  }
  await client.query(
    `INSERT INTO review_queue (artifact_id, artifact_kind, reason, confidence, payload)
     VALUES ($1, 'reference-rig', 'reference rig owner verification required', 0.8, $2::jsonb)
     ON CONFLICT (artifact_id, reason, status) DO UPDATE
     SET payload = EXCLUDED.payload`,
    [rig.id, JSON.stringify(rig)],
  );
}

console.log(`seeded ${components.length} components and ${rigs.length} reference rigs`);
await client.end();
