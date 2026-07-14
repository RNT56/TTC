export const PARITY_ISOLATION_HEADERS = Object.freeze({
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
});

export const PARITY_EVIDENCE_SCHEMA = "forge-parity-gallery.v1";

const GIT_REVISION = /^[0-9a-f]{40}$/;

export function assessParitySourceEvidence(evidence, { requireClean = false } = {}) {
  const failures = [];
  if (evidence?.schema !== PARITY_EVIDENCE_SCHEMA) {
    failures.push(
      `evidence schema is ${JSON.stringify(evidence?.schema)}, expected ${JSON.stringify(PARITY_EVIDENCE_SCHEMA)}`,
    );
  }
  if (!GIT_REVISION.test(evidence?.sourceRevision ?? "")) {
    failures.push("declared source revision is not a lowercase 40-character Git SHA");
  }
  if (!GIT_REVISION.test(evidence?.checkoutRevision ?? "")) {
    failures.push("checked-out revision is not a lowercase 40-character Git SHA");
  }
  if (
    GIT_REVISION.test(evidence?.sourceRevision ?? "") &&
    GIT_REVISION.test(evidence?.checkoutRevision ?? "") &&
    evidence.sourceRevision !== evidence.checkoutRevision
  ) {
    failures.push(
      `declared source revision ${evidence.sourceRevision} does not match checkout ${evidence.checkoutRevision}`,
    );
  }
  if (typeof evidence?.worktreeDirty !== "boolean") {
    failures.push("worktree dirty state is unavailable");
  } else if (requireClean && evidence.worktreeDirty) {
    failures.push("authoritative parity evidence requires a clean worktree");
  }
  return failures.length === 0
    ? { ready: true, failures: [] }
    : { ready: false, failures };
}

function qualityFailures(quality, expectedTier) {
  if (!quality || typeof quality !== "object") return ["scene quality is unavailable"];
  const failures = [];
  if (quality.tier !== expectedTier) {
    failures.push(`scene tier is ${JSON.stringify(quality.tier)}, expected ${JSON.stringify(expectedTier)}`);
  }
  if (quality.renderer !== "webgl") {
    failures.push(`scene renderer is ${JSON.stringify(quality.renderer)}, expected \"webgl\"`);
  }
  if (quality.advancedEffectsInitialized !== true) {
    failures.push("advanced WebGL effects were not initialized");
  }
  return failures;
}

export function assessParityPreflight(diagnostics) {
  const configurationFailures = [];
  if (diagnostics?.crossOriginIsolated !== true) {
    configurationFailures.push("document is not cross-origin isolated");
  }
  if (diagnostics?.sharedArrayBuffer !== true) {
    configurationFailures.push("SharedArrayBuffer is unavailable");
  }
  if (diagnostics?.support?.tier !== "full-studio") {
    configurationFailures.push(
      `support tier is ${JSON.stringify(diagnostics?.support?.tier)}, expected \"full-studio\"`,
    );
  }
  if (diagnostics?.support?.surface !== "chromium") {
    configurationFailures.push(
      `support surface is ${JSON.stringify(diagnostics?.support?.surface)}, expected \"chromium\"`,
    );
  }
  if (configurationFailures.length > 0) {
    return {
      ready: false,
      category: "configuration",
      retryable: false,
      failures: configurationFailures,
    };
  }

  const rendererFailures = [];
  if (diagnostics?.hookAvailable !== true) rendererFailures.push("parity hook is unavailable");
  if (diagnostics?.loaded !== true) rendererFailures.push("Studio artifact did not finish loading");
  rendererFailures.push(...qualityFailures(diagnostics?.quality, "high"));
  if ((diagnostics?.pageErrors?.length ?? 0) > 0) {
    rendererFailures.push(`page errors: ${diagnostics.pageErrors.join(" | ")}`);
  }
  if (diagnostics?.waitError) rendererFailures.push(`readiness wait failed: ${diagnostics.waitError}`);
  return rendererFailures.length === 0
    ? { ready: true, category: "ready", retryable: false, failures: [] }
    : { ready: false, category: "renderer-initialization", retryable: true, failures: rendererFailures };
}

export function assessParityCapture(quality) {
  const failures = qualityFailures(quality, "low");
  return failures.length === 0
    ? { ready: true, failures: [] }
    : { ready: false, failures };
}

export function formatParityFailure(prefix, assessment, diagnostics) {
  return `${prefix}: ${assessment.failures.join("; ")}\n${JSON.stringify(diagnostics, null, 2)}`;
}
