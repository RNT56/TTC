import { createHash } from "node:crypto";

export const LICENSE_EXPORT_MANIFEST_FORMAT_VERSION = "1.0.0";

type JsonRecord = Record<string, unknown>;

const licenseClasses = new Set(["open", "attribution", "no-redistribution", "view-only"]);
const policies: Record<string, Set<string>> = {
  open: new Set(["full-geometry-ok"]),
  attribution: new Set(["attribution-manifest-required"]),
  "no-redistribution": new Set(["envelope-link-out", "envelope-only"]),
  "view-only": new Set(["envelope-link-out", "envelope-only"]),
};

export function fixtureLicenseFilteredGeometry(payload: unknown, payloadHash: string): JsonRecord {
  const input = record(payload, "occt.tessellate payload");
  const source = nonEmptyString(input.sourceObjectId ?? input.assetRef, "sourceObjectId or assetRef");
  const rawAssets = input.assemblyAssets === undefined
    ? [{
        assetId: source,
        componentId: input.componentId,
        license: input.license,
        envelopeMm: input.envelopeMm,
        datumPorts: input.datumPorts,
      }]
    : input.assemblyAssets;
  if (!Array.isArray(rawAssets) || rawAssets.length === 0) {
    fail("D10 export requires at least one assembly asset");
  }
  const assets = rawAssets.map((asset, index) => normalizeAsset(asset, index));
  const restricted = assets.filter((asset) => asset.fullGeometryAllowed === false);
  const attributed = assets.filter((asset) => asset.licenseClass === "attribution");
  const assemblyPolicy = restricted.length > 0
    ? "envelope-substitution"
    : attributed.length > 0
      ? "attribution-manifest-required"
      : "full-geometry-ok";
  const manifest: JsonRecord = {
    schemaVersion: LICENSE_EXPORT_MANIFEST_FORMAT_VERSION,
    artifactKind: "license-export-manifest",
    source,
    assemblyPolicy,
    fullGeometryAllowed: restricted.length === 0,
    requiresAttribution: attributed.length > 0,
    restrictedAssetCount: restricted.length,
    attributionAssetCount: attributed.length,
    assets,
    attributions: attributed.map((asset) => ({
      assetId: asset.assetId,
      componentId: asset.componentId,
      licenseId: asset.licenseId,
      licenseClass: asset.licenseClass,
      terms: asset.terms,
      sourceUrl: asset.sourceUrl,
    })),
  };
  const base = `occt:${payloadHash}`;
  const exports = restricted.length > 0
    ? {
        mesh: `${base}/derived-lod.glb`,
        step: `${base}/envelope.step`,
        threeMf: `${base}/envelope.3mf`,
        licenseManifest: `${base}/license-export-manifest.json`,
      }
    : {
        mesh: `${base}/mesh.glb`,
        step: `${base}/source.step`,
        threeMf: `${base}/print.3mf`,
        licenseManifest: `${base}/license-export-manifest.json`,
      };
  return {
    artifactKind: "geometry",
    provider: "fixture",
    tessellated: true,
    faces: 512,
    cacheKey: base,
    exports,
    licenseExport: manifest,
    licenseExportManifestSha256: createHash("sha256").update(stableJson(manifest)).digest("hex"),
    print: restricted.length > 0
      ? {
          readyForQuote: false,
          handoff: {
            mode: "source-link",
            directCheckout: false,
            reason: "restricted geometry is replaced by a fit envelope and cannot be printed",
          },
          bomSection: restricted.map((asset) => ({
            kind: "catalog-part",
            assetId: asset.assetId,
            componentId: asset.componentId,
            quantity: asset.quantity,
            geometryDisposition: "dimensioned-envelope-link-out",
            sourceUrl: asset.sourceUrl,
            licenseClass: asset.licenseClass,
          })),
        }
      : {
          readyForQuote: true,
          handoff: { mode: "quote-link", directCheckout: false },
          threeMfArtifact: {
            objectKey: exports.threeMf,
            licenseManifest: exports.licenseManifest,
          },
        },
  };
}

function normalizeAsset(value: unknown, index: number): JsonRecord {
  const asset = record(value, `assemblyAssets[${index}]`);
  const assetId = nonEmptyString(asset.assetId, `assemblyAssets[${index}].assetId`);
  const license = record(asset.license, `${assetId} D10 license record`);
  const licenseId = nonEmptyString(license.id, `${assetId} license.id`);
  const licenseClass = nonEmptyString(license.class, `${assetId} license.class`);
  if (!licenseClasses.has(licenseClass)) fail(`${assetId} has unsupported license class '${licenseClass}'`);
  const terms = nonEmptyString(license.terms, `${assetId} license.terms`);
  const sourceUrl = httpsUrl(license.sourceUrl, `${assetId} license.sourceUrl`);
  const exportPolicy = nonEmptyString(license.exportPolicy, `${assetId} license.exportPolicy`);
  if (!policies[licenseClass]?.has(exportPolicy)) {
    fail(`${assetId} export policy '${exportPolicy}' contradicts license class '${licenseClass}'`);
  }
  const fullGeometryAllowed = licenseClass === "open" || licenseClass === "attribution";
  const componentId = optionalString(asset.componentId, `${assetId} componentId`);
  const quantity = asset.quantity ?? 1;
  if (!Number.isInteger(quantity) || Number(quantity) < 1) fail(`${assetId} quantity must be a positive integer`);
  const normalized: JsonRecord = {
    assetId,
    componentId,
    quantity,
    licenseId,
    licenseClass,
    terms,
    sourceUrl,
    exportPolicy,
    exportDisposition: licenseClass === "attribution"
      ? "full-geometry-with-attribution"
      : fullGeometryAllowed
        ? "full-geometry"
        : "dimensioned-envelope-link-out",
    fullGeometryAllowed,
  };
  if (!fullGeometryAllowed) {
    if (componentId === null) fail(`restricted asset ${assetId} requires componentId for BOM link-out`);
    normalized.envelopeMm = envelope(asset.envelopeMm, assetId);
    normalized.datumPorts = datumPorts(asset.datumPorts, assetId);
  }
  return normalized;
}

function envelope(value: unknown, assetId: string): JsonRecord {
  const raw = record(value, `restricted asset ${assetId} envelopeMm`);
  const aliases: Record<string, string[]> = {
    xMm: ["xMm", "widthMm"],
    yMm: ["yMm", "heightMm"],
    zMm: ["zMm", "depthMm", "lengthMm"],
  };
  const normalized: JsonRecord = {};
  for (const [name, names] of Object.entries(aliases)) {
    const candidate = names.find((alias) => alias in raw);
    const number = candidate === undefined ? Number.NaN : Number(raw[candidate]);
    if (!Number.isFinite(number) || number <= 0) {
      fail(`restricted asset ${assetId} requires positive envelopeMm.${name}`);
    }
    normalized[name] = number;
  }
  return normalized;
}

function datumPorts(value: unknown, assetId: string): JsonRecord[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`restricted asset ${assetId} requires at least one datum port`);
  }
  return value.map((portValue, index) => {
    const port = record(portValue, `${assetId} datumPorts[${index}]`);
    const frame = port.frame;
    if (
      !Array.isArray(frame)
      || frame.length !== 2
      || frame.some((vector) => !Array.isArray(vector) || vector.length !== 3 || vector.some((item) => !Number.isFinite(item)))
    ) {
      fail(`${assetId} datumPorts[${index}].frame must be two finite 3-vectors`);
    }
    return {
      id: nonEmptyString(port.id, `${assetId} datumPorts[${index}].id`),
      type: nonEmptyString(port.type, `${assetId} datumPorts[${index}].type`),
      frame,
    };
  });
}

function record(value: unknown, field: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${field} must be an object`);
  return value as JsonRecord;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(`${field} must be a non-empty string`);
  return value.trim();
}

function optionalString(value: unknown, field: string): string | null {
  return value === undefined || value === null ? null : nonEmptyString(value, field);
}

function httpsUrl(value: unknown, field: string): string {
  const text = nonEmptyString(value, field);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    fail(`${field} must be an HTTPS URL without credentials`);
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    fail(`${field} must be an HTTPS URL without credentials`);
  }
  return text;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const object = value as JsonRecord;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fail(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 400 });
}
