import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SceneController } from "./sceneController";
import { ViewerScene } from "./viewerScene";
import { DEMO_MODELS, useStudio } from "./store";
import type { MaterialClass, Report } from "./types";
import {
  accessObjectBlob,
  admitRecorderArchive,
  contributeModelPattern,
  completeRecorderArchive,
  createClassroomAssignment,
  createModerationReport,
  createCourse,
  createJob,
  createListing,
  createPrintQuote,
  decideReview,
  downloadPolicyModel,
  editModel,
  gatewayUrl,
  generateContractStream,
  getJobCapabilities,
  getCredits,
  getMe,
  getPlatformGates,
  getShare,
  latestBrief25Eval,
  listClassroomAssignments,
  listClassroomSubmissions,
  listConsentPolicies,
  listConsents,
  listCourses,
  listGenerationModels,
  listJobs,
  listLeaderboardRuns,
  listLicenseLedger,
  listMaintenanceRecords,
  listListings,
  listOwnedListings,
  listModels,
  listModerationReports,
  listPhotoscanArtifacts,
  listPolicyArtifacts,
  listPrintQuotes,
  listReplayArtifacts,
  listTelemetryLogs,
  listVendorOffers,
  recordListingUsage,
  recordConsentEvent,
  refreshVendorOffers,
  saveModel,
  stageRecorderArchive,
  shareModel,
  shareTelemetryLog,
  submitLeaderboardRun,
  submitClassroomSubmission,
  uploadObjectBlob,
  updatePhotoscanAlignment,
  type AnthropicModelPin,
  type ClassroomAssignmentRecord,
  type ClassroomSubmissionRecord,
  type CourseRecord,
  type ConsentEvent,
  type ConsentPolicy,
  type ConsentPurpose,
  type ConsentSubjectKind,
  type CreditSummary,
  type GenerationArchetype,
  type GenerationAttempt,
  type GenerationProvider,
  type GenerationResponse,
  type GenerationStageEvent,
  type JobCapabilities,
  type JobRecord,
  type LeaderboardRunRecord,
  type LicenseLedgerEntry,
  type ListingRecord,
  type MaintenanceRecord,
  type MeResponse,
  type ModelRecord,
  type ModerationReportRecord,
  type RecorderArchiveMaterialization,
  type RecorderArchiveAdmission,
  type PlatformGateSignoff,
  type PhotoscanAlignmentInput,
  type PhotoscanPortInput,
  type PhotoscanArtifactRecord,
  type PolicyArtifactRecord,
  type PrintQuoteRequestRecord,
  type ReplayArtifactRecord,
  type TelemetryLogRecord,
  type VendorOfferRecord,
  listReviews,
  type ReviewExportPolicy,
  type ReviewQueueItem,
  type ReviewStatus,
} from "./gateway";
import {
  artifactKind,
  asRecord,
  controlledCodesignDisclosure,
  isKnownJobOutput,
  isPatchList,
  numberOrNull,
  type CodesignCandidate,
  type JsonPatchOp,
  type PolicyOutput,
} from "./jobOutputs";
import {
  GHOST_PLAYBACK_HZ,
  projectGhostPosition,
  projectGhostReplay,
  seekGhostReplay,
  tryParseGhostReplay,
} from "./ghostReplay";
import { decodeShareFragment, encodeShareFragment } from "./share";
import { BrowserPolicyController } from "./policyRuntime";
import {
  D12_REFERENCE_RIG_IDS,
  RECORDER_ADAPTER_PROBE_CONFIRMATION,
  RECORDER_BAUD,
  RECORDER_PHYSICAL_CONFIRMATION,
  desktopRecorderAvailable,
  getDesktopBridgeStatus,
  getRecorderStatus,
  inspectRecorderArchive,
  listDesktopSerialPorts,
  prepareRecorderArchiveUpload,
  probeDesktopRecorderAdapter,
  startDesktopCustodiedRecorder,
  startDesktopRecorder,
  stopDesktopCustodiedRecorder,
  stopDesktopRecorder,
  uploadRecorderArchiveFiles,
  type DesktopBridgeStatus,
  type DesktopSerialPort,
  type RecorderArchiveInspection,
  type RecorderAdapterProbe,
  type RecorderControlStatus,
  type RecorderCustodyProof,
  type RecorderStopReceipt,
  type RecorderUploadReceipt,
} from "./desktopRecorder";
import {
  DEPLOYMENT_LADDER_FALLBACK,
  DEPLOYMENT_LADDER_POLICY_RATE_HZ,
  DEPLOYMENT_LADDER_STAGES,
  DEPLOYMENT_LADDER_START_CONFIRMATION,
  DEPLOYMENT_LADDER_SUPERVISOR_RATE_HZ,
  advanceDeploymentLadder,
  confirmationForStage,
  desktopDeploymentLadderAvailable,
  getDeploymentLadderStatus,
  isPassingSupervisorDecision,
  resetDeploymentLadder,
  startDeploymentLadder,
  type DeploymentLadderStatus,
} from "./deploymentLadder";
import { CoreBake, CoreSession, corePatch, coreValidate } from "./wasm";
import type { Slot } from "./contract.gen";

function selectContractReport(localReport: Report, serverReport?: Report | null): Report {
  if (!serverReport) return localReport;
  const sameContract =
    localReport.contractHash.length > 0 && serverReport.contractHash === localReport.contractHash;
  const sameValidatorBoundary =
    serverReport.reportVersion === localReport.reportVersion &&
    serverReport.schemaVersion === localReport.schemaVersion &&
    serverReport.validatorVersion === localReport.validatorVersion;
  return sameContract && sameValidatorBoundary ? serverReport : localReport;
}

const panel: React.CSSProperties = {
  position: "absolute",
  background: "rgba(13,15,18,0.88)",
  border: "1px solid #2a2f38",
  borderRadius: 6,
  padding: "10px 12px",
  fontSize: 12,
  lineHeight: 1.5,
};

const DT = 1 / 120;
interface PolicyPlaybackState {
  controller: BrowserPolicyController;
  elapsedS: number;
}
/** configurator palette (P1-014) — patch-applied through the live handle */
const SWATCHES = [
  "#d8dde3",
  "#8fa3bf",
  "#39c8ff",
  "#e6a23c",
  "#7dd87d",
  "#1d222c",
  "#6e4a3a",
  "#3a4a6e",
];
const MATERIAL_CLASSES: MaterialClass[] = ["gloss", "metal", "satin", "matte", "rubber"];

interface ConfiguratorContract {
  slots: Slot[];
  lockfile: Record<string, string>;
}

function configuratorContract(contractJson: string | null): ConfiguratorContract {
  if (!contractJson) return { slots: [], lockfile: {} };
  try {
    const parsed = JSON.parse(contractJson) as { slots?: unknown; lockfile?: unknown };
    const slots = Array.isArray(parsed.slots) ? (parsed.slots as Slot[]) : [];
    const lockfile =
      parsed.lockfile && typeof parsed.lockfile === "object" && !Array.isArray(parsed.lockfile)
        ? (parsed.lockfile as Record<string, string>)
        : {};
    return { slots, lockfile };
  } catch {
    return { slots: [], lockfile: {} };
  }
}

function variantConsequence(
  variant: Slot["variants"][number],
  lockfile: Record<string, string>,
): string {
  if (variant.componentRef) {
    const pin = lockfile[variant.componentRef];
    return pin
      ? `${variant.componentRef} → ${pin}; validator, simulation, and BOM will recompute`
      : `${variant.componentRef}; requires lockfile resolution before admission`;
  }
  const count = variant.parts?.length ?? 0;
  return `${count} inline part${count === 1 ? "" : "s"}; geometry, mass, validation, simulation, and BOM will recompute`;
}
const REVIEW_EXPORT_POLICIES: ReviewExportPolicy[] = [
  "full-geometry-ok",
  "attribution-manifest-required",
  "envelope-link-out",
  "envelope-only",
  "bom-only",
  "assembly-policy-derived",
];
const GENERATION_ARCHETYPES: GenerationArchetype[] = [
  "multirotor",
  "quadruped",
  "rover",
  "arm",
  "biped",
  "fixedwing",
];
const ANTHROPIC_KEY_STORAGE_KEY = "forge.studio.anthropicKey";
const MUTED = "#7d899b";

interface BrowserSupport {
  tier: "full-studio" | "viewer-grade";
  surface: "desktop" | "chromium" | "non-chromium" | "mobile";
  summary: string;
}

function detectBrowserSupport(): BrowserSupport {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { tier: "viewer-grade", surface: "non-chromium", summary: "viewer capability pending" };
  }
  const desktop = "__TAURI_INTERNALS__" in window;
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const chromium = /(?:Chrome|Chromium|Edg|OPR)\//.test(ua);
  const isolated =
    typeof SharedArrayBuffer !== "undefined" &&
    (globalThis as typeof globalThis & { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  if (desktop) {
    return { tier: "full-studio", surface: "desktop", summary: "full Studio · Desktop power surface" };
  }
  if (chromium && !mobile && isolated) {
    return { tier: "full-studio", surface: "chromium", summary: "full Studio · isolated desktop Chromium" };
  }
  return {
    tier: "viewer-grade",
    surface: mobile ? "mobile" : "non-chromium",
    summary: "viewer grade · schematic view, orbit, equip, explode, blueprint, and local validation",
  };
}

function readSessionValue(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SceneController | null>(null);
  const sessionRef = useRef<CoreSession | null>(null);
  /** long-lived bake handle — the patch → re-bake loop (P1-005/P1-014) */
  const bakeRef = useRef<CoreBake | null>(null);
  const stepOnceRef = useRef(false);
  const policyPlaybackRef = useRef<PolicyPlaybackState | null>(null);
  const jogDrag = useRef<{ node: string; rx: number; ry: number } | null>(null);
  const jogTotals = useRef(new Map<string, { rx: number; ry: number }>());
  const s = useStudio();
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("needs_review");
  const [reviews, setReviews] = useState<ReviewQueueItem[]>([]);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [reviewExportPolicies, setReviewExportPolicies] = useState<Record<number, ReviewExportPolicy>>({});
  const [generationProvider, setGenerationProvider] = useState<GenerationProvider>("template");
  const [generationPrompt, setGenerationPrompt] = useState(
    "5 inch freestyle quad with a long-range battery option, under 650 g",
  );
  const [generationArchetype, setGenerationArchetype] = useState<GenerationArchetype | "">("multirotor");
  const [generationCategories, setGenerationCategories] = useState("motor, prop, battery, frame");
  const [generationLimit, setGenerationLimit] = useState(8);
  const [generationMaxRepairs, setGenerationMaxRepairs] = useState(3);
  const [generationSeed, setGenerationSeed] = useState(0);
  const [anthropicKey, setAnthropicKey] = useState(() => readSessionValue(ANTHROPIC_KEY_STORAGE_KEY));
  const [generationBusy, setGenerationBusy] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationResult, setGenerationResult] = useState<GenerationResponse | null>(null);
  const [generationLoadMessage, setGenerationLoadMessage] = useState<string | null>(null);
  const [generationModels, setGenerationModels] = useState<AnthropicModelPin[]>([]);
  const [generationModelsError, setGenerationModelsError] = useState<string | null>(null);
  const [generationStages, setGenerationStages] = useState<GenerationStageEvent[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [consentPolicies, setConsentPolicies] = useState<ConsentPolicy[]>([]);
  const [consents, setConsents] = useState<ConsentEvent[]>([]);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentMessage, setConsentMessage] = useState<string | null>(null);
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [modelError, setModelError] = useState<string | null>(null);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [loadedModelContractHash, setLoadedModelContractHash] = useState<string | null>(null);
  const [modelBusy, setModelBusy] = useState(false);
  const [editPrompt, setEditPrompt] = useState("make it blue and 15% longer");
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [jobCapabilities, setJobCapabilities] = useState<JobCapabilities | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [policyPlaybackMessage, setPolicyPlaybackMessage] = useState<string | null>(null);
  const [photoscanArtifacts, setPhotoscanArtifacts] = useState<PhotoscanArtifactRecord[]>([]);
  const [policyArtifacts, setPolicyArtifacts] = useState<PolicyArtifactRecord[]>([]);
  const [replayArtifacts, setReplayArtifacts] = useState<ReplayArtifactRecord[]>([]);
  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryLogRecord[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [artifactBusy, setArtifactBusy] = useState(false);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [artifactMessage, setArtifactMessage] = useState<string | null>(null);
  const [scanImageRefs, setScanImageRefs] = useState<string[]>([]);
  const [scanUploadBusy, setScanUploadBusy] = useState(false);
  const [scanUploadMessage, setScanUploadMessage] = useState<string | null>(null);
  const [credits, setCredits] = useState<CreditSummary | null>(null);
  const [licenseLedger, setLicenseLedger] = useState<LicenseLedgerEntry[]>([]);
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [courseName, setCourseName] = useState("Fixture slalom");
  const [courseVisibility, setCourseVisibility] = useState<CourseVisibility>("unlisted");
  const [courseEnvJson, setCourseEnvJson] = useState(() => JSON.stringify(fixtureEnvSpec(), null, 2));
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [leaderboardRuns, setLeaderboardRuns] = useState<LeaderboardRunRecord[]>([]);
  const [leaderboardArchetypeFilter, setLeaderboardArchetypeFilter] = useState("all");
  const [leaderboardClassFilter, setLeaderboardClassFilter] = useState("all");
  const [leaderboardStatusFilter, setLeaderboardStatusFilter] = useState<LeaderboardStatusFilter>("all");
  const [listings, setListings] = useState<ListingRecord[]>([]);
  const [platformGates, setPlatformGates] = useState<PlatformGateSignoff[]>([]);
  const [vendorOffers, setVendorOffers] = useState<VendorOfferRecord[]>([]);
  const [printQuotes, setPrintQuotes] = useState<PrintQuoteRequestRecord[]>([]);
  const [classroomAssignments, setClassroomAssignments] = useState<ClassroomAssignmentRecord[]>([]);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [classroomSubmissions, setClassroomSubmissions] = useState<ClassroomSubmissionRecord[]>([]);
  const [moderationReports, setModerationReports] = useState<ModerationReportRecord[]>([]);
  const [platformBusy, setPlatformBusy] = useState(false);
  const [platformError, setPlatformError] = useState<string | null>(null);
  const [platformMessage, setPlatformMessage] = useState<string | null>(null);
  const [briefEval, setBriefEval] = useState<unknown | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const reducedMotionRef = useRef(reducedMotion);
  const [viewerAnnouncement, setViewerAnnouncement] = useState(
    "Interactive viewer ready. Use arrow keys to orbit, Page Up or Page Down to zoom, E to explode, and B for blueprint.",
  );

  const refreshReviews = useCallback(async (status: ReviewStatus) => {
    setReviewBusy(true);
    setReviewError(null);
    try {
      setReviews(await listReviews(status));
    } catch (error) {
      setReviews([]);
      setReviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setReviewBusy(false);
    }
  }, []);

  const setReviewFilter = useCallback((status: ReviewStatus) => {
    setReviewStatus(status);
    void refreshReviews(status);
  }, [refreshReviews]);

  const refreshAccount = useCallback(async () => {
    try {
      setMe(await getMe());
    } catch (error) {
      setMe({
        authenticated: false,
        user: null,
      });
      setModelError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const refreshConsents = useCallback(async () => {
    try {
      const [policies, current] = await Promise.all([
        listConsentPolicies(),
        listConsents().catch(() => []),
      ]);
      setConsentPolicies(policies);
      setConsents(current);
    } catch (error) {
      setConsentPolicies([]);
      setConsents([]);
      setConsentMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const refreshModels = useCallback(async () => {
    setModelError(null);
    try {
      const next = await listModels();
      setModels(next);
      setActiveModelId((current) => current ?? next[0]?.id ?? null);
    } catch (error) {
      setModels([]);
      setModelError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    setJobsError(null);
    try {
      const [jobRows, capabilities] = await Promise.all([listJobs(), getJobCapabilities().catch(() => null)]);
      setJobs(jobRows);
      setJobCapabilities(capabilities);
    } catch (error) {
      setJobs([]);
      setJobCapabilities(null);
      setJobsError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const refreshArtifacts = useCallback(async () => {
    setArtifactBusy(true);
    setArtifactError(null);
    try {
      const [scans, policies, replays, telemetry, maintenance] = await Promise.all([
        listPhotoscanArtifacts(),
        listPolicyArtifacts(),
        listReplayArtifacts(),
        listTelemetryLogs(),
        listMaintenanceRecords(),
      ]);
      setPhotoscanArtifacts(scans);
      setPolicyArtifacts(policies);
      setReplayArtifacts(replays);
      setTelemetryLogs(telemetry);
      setMaintenanceRecords(maintenance);
    } catch (error) {
      setPhotoscanArtifacts([]);
      setPolicyArtifacts([]);
      setReplayArtifacts([]);
      setTelemetryLogs([]);
      setMaintenanceRecords([]);
      setArtifactError(error instanceof Error ? error.message : String(error));
    } finally {
      setArtifactBusy(false);
    }
  }, []);

  const openArtifactBlob = useCallback(async (blobId: string | null) => {
    if (!blobId) return;
    setArtifactMessage(null);
    setArtifactError(null);
    try {
      const { access } = await accessObjectBlob(blobId, "download");
      const opened = window.open(access.url, "_blank", "noopener,noreferrer");
      if (!opened) window.location.assign(access.url);
      setArtifactMessage(`${access.objectKey} · expires ${new Date(access.expiresAt).toLocaleTimeString()}`);
    } catch (error) {
      setArtifactError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const alignPhotoscanArtifact = useCallback(
    async (artifactId: string, input?: PhotoscanAlignmentInput) => {
      setArtifactBusy(true);
      setArtifactMessage(null);
      setArtifactError(null);
      try {
        const payload = input ?? {
          knownDimensionMm: 150,
          axis: "z",
          ports: [{ id: "motor-mount", kind: "mount", axis: "z", role: "component-port" }],
          note: "Studio owner alignment pass",
        };
        const { artifact } = await updatePhotoscanAlignment(artifactId, payload);
        await refreshArtifacts();
        const alignment = asRecord(artifact.scaleAxesPorts);
        const dimension =
          typeof alignment?.knownDimensionMm === "number" ? alignment.knownDimensionMm : payload.knownDimensionMm;
        const axis = typeof alignment?.axis === "string" ? alignment.axis : payload.axis;
        const ports = Array.isArray(alignment?.ports) ? alignment.ports.length : payload.ports?.length ?? 0;
        setArtifactMessage(`aligned ${artifact.id} · ${dimension ?? "scale"} mm · ${axis ?? "axis"}-axis · ${ports} ports`);
      } catch (error) {
        setArtifactError(error instanceof Error ? error.message : String(error));
      } finally {
        setArtifactBusy(false);
      }
    },
    [refreshArtifacts],
  );

  const refreshLeaderboard = useCallback(async (courseId: string | null) => {
    if (!courseId) {
      setLeaderboardRuns([]);
      return;
    }
    setLeaderboardRuns(await listLeaderboardRuns(courseId));
  }, []);

  const refreshClassroomSubmissions = useCallback(async (assignmentId: string | null) => {
    if (!assignmentId) {
      setClassroomSubmissions([]);
      return;
    }
    setClassroomSubmissions(await listClassroomSubmissions(assignmentId));
  }, []);

  const refreshPlatform = useCallback(async () => {
    setPlatformBusy(true);
    setPlatformError(null);
    try {
      const [
        courseRows,
        publicListingRows,
        ownedListingRows,
        assignmentRows,
        reportRows,
        creditSummary,
        licenseRows,
        gateRows,
        vendorRows,
        printQuoteRows,
      ] = await Promise.all([
        listCourses(),
        listListings(),
        listOwnedListings(),
        listClassroomAssignments(),
        listModerationReports().catch(() => []),
        getCredits().catch(() => null),
        listLicenseLedger().catch(() => []),
        getPlatformGates().catch(() => []),
        listVendorOffers().catch(() => []),
        listPrintQuotes().catch(() => []),
      ]);
      const listingRows = [
        ...new Map([...publicListingRows, ...ownedListingRows].map((listing) => [listing.id, listing])).values(),
      ];
      setCourses(courseRows);
      setListings(listingRows);
      setClassroomAssignments(assignmentRows);
      setModerationReports(reportRows);
      setCredits(creditSummary);
      setLicenseLedger(licenseRows);
      setPlatformGates(gateRows);
      setVendorOffers(vendorRows);
      setPrintQuotes(printQuoteRows);
      const requestedCourseId = readCourseIdParam();
      const requestedCourse = requestedCourseId && courseRows.some((course) => course.id === requestedCourseId);
      const currentCourse = activeCourseId && courseRows.some((course) => course.id === activeCourseId);
      const courseId = requestedCourse ? requestedCourseId : currentCourse ? activeCourseId : courseRows[0]?.id ?? null;
      setActiveCourseId(courseId);
      const assignmentId = activeAssignmentId ?? assignmentRows[0]?.id ?? null;
      setActiveAssignmentId(assignmentId);
      await refreshLeaderboard(courseId);
      await refreshClassroomSubmissions(assignmentId);
    } catch (error) {
      setCourses([]);
      setListings([]);
      setClassroomAssignments([]);
      setClassroomSubmissions([]);
      setModerationReports([]);
      setLicenseLedger([]);
      setPlatformGates([]);
      setVendorOffers([]);
      setPrintQuotes([]);
      setLeaderboardRuns([]);
      setPlatformError(error instanceof Error ? error.message : String(error));
    } finally {
      setPlatformBusy(false);
    }
  }, [activeAssignmentId, activeCourseId, refreshClassroomSubmissions, refreshLeaderboard]);

  const refreshBriefEval = useCallback(async () => {
    try {
      const result = await latestBrief25Eval();
      setBriefEval(result.eval);
    } catch {
      setBriefEval(null);
    }
  }, []);

  const recordDecision = useCallback(async (id: number, decision: "approved" | "rejected") => {
    setReviewBusy(true);
    setReviewError(null);
    try {
      const current = reviews.find((candidate) => candidate.id === id);
      const note = reviewNotes[id]?.trim();
      const exportPolicy =
        decision === "rejected"
          ? "blocked"
          : reviewExportPolicies[id] ?? defaultReviewExportPolicy(current);
      const item = await decideReview(id, decision, {
        reviewer: "owner",
        reviewNote: note || undefined,
        exportPolicy,
      });
      setReviews((current) =>
        reviewStatus === "needs_review"
          ? current.filter((candidate) => candidate.id !== id)
          : current.map((candidate) => (candidate.id === id ? item : candidate)),
      );
      setReviewNotes((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setReviewExportPolicies((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setReviewBusy(false);
    }
  }, [reviewExportPolicies, reviewNotes, reviewStatus, reviews]);

  /** Load a contract end to end: bake handle + scene + session + report. */
  const loadContract = useCallback(async (
    contract: string,
    reportOverride?: Report | null,
    modelContractHash: string | null = null,
  ) => {
    policyPlaybackRef.current?.controller.dispose();
    policyPlaybackRef.current = null;
    setPolicyPlaybackMessage(null);
    setLoadedModelContractHash(null);
    const handle = await CoreBake.create(contract);
    bakeRef.current?.dispose();
    bakeRef.current = handle;
    const artifact = handle.artifact();
    sceneRef.current?.load(artifact);
    sessionRef.current?.dispose();
    sessionRef.current = null;
    jogTotals.current.clear();
    try {
      sessionRef.current = await CoreSession.create(contract);
    } catch {
      sessionRef.current = null; // archetypes without a v0 driver stay static
    }
    // The browser facade deliberately has no platform catalog. Always run it to
    // bind the report to the exact contract and runtime boundary, then retain a
    // catalog-aware gateway report only when those identities match exactly.
    const localReport = await coreValidate(contract);
    const report = selectContractReport(localReport, reportOverride);
    useStudio.getState().setLoaded(artifact, report, contract);
    useStudio.getState().setSelected(null);
    setLoadedModelContractHash(modelContractHash);
  }, []);

  const loadDemo = useCallback(
    async (id: string) => {
      // fetch only the CONTRACT; bake + validate happen in-browser through
      // the wasm core — the same bits CI runs (D17), no payload duplication
      const contract = await fetch(`/demo/${id}.forge.json`).then((r) => r.text());
      await loadContract(contract);
    },
    [loadContract],
  );

  const runGenerate = useCallback(async () => {
    const prompt = generationPrompt.trim();
    if (!prompt) {
      setGenerationError("prompt is required");
      return;
    }
    if (generationProvider === "anthropic" && !anthropicKey.trim()) {
      setGenerationError("Anthropic provider requires a BYO key");
      return;
    }
    setGenerationBusy(true);
    setGenerationError(null);
    setGenerationLoadMessage(null);
    setGenerationStages([]);
    try {
      const categories = parseCategories(generationCategories);
      const request = {
        prompt,
        provider: generationProvider,
        ...(generationArchetype ? { archetype: generationArchetype } : {}),
        ...(categories.length > 0 ? { categories } : {}),
        limit: boundedInt(generationLimit, 1, 20),
        maxRepairIterations: boundedInt(generationMaxRepairs, 0, 3),
        seed: boundedInt(generationSeed, 0, Number.MAX_SAFE_INTEGER),
      };
      const result = await generateContractStream(
        request,
        {
          onStage: (event) => setGenerationStages((current) => [...current.slice(-10), event]),
        },
        { anthropicApiKey: generationProvider === "anthropic" ? anthropicKey : undefined },
      );
      setGenerationResult(result);
      if (result.registeredModel) {
        setActiveModelId(result.registeredModel.id);
        void refreshModels();
      }
      if ((result.verdict === "admitted" || result.verdict === "draft") && result.contract !== null) {
        try {
          await loadContract(
            JSON.stringify(result.contract),
            result.report,
            result.registeredModel?.contractHash ?? null,
          );
          setGenerationLoadMessage(
            result.verdict === "draft" ? "draft loaded into scene" : "contract loaded into scene",
          );
        } catch (error) {
          setGenerationLoadMessage(
            `load failed · ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : String(error));
    } finally {
      setGenerationBusy(false);
    }
  }, [
    anthropicKey,
    generationArchetype,
    generationCategories,
    generationLimit,
    generationMaxRepairs,
    generationPrompt,
    generationProvider,
    generationSeed,
    loadContract,
    refreshModels,
  ]);

  /** Configurator (P1-014): JSON-Patch the live handle, re-bake in place —
   * explode, camera, drive state and selection all survive the rebuild. */
  const applyPatch = useCallback(async (ops: { op: string; path: string; value?: unknown }[]) => {
    const handle = bakeRef.current;
    const scene = sceneRef.current;
    if (!handle || !scene) return;
    const st = useStudio.getState();
    const selected = st.selected;
    const before = st.artifact?.hud;
    setLoadedModelContractHash(null);
    const artifact = handle.patch(JSON.stringify(ops));
    // consequence diff (D5): show what the change DID to the derived numbers
    const after = artifact.hud;
    if (before && after) {
      const deltas: string[] = [];
      const d = (k: string, a?: number, b?: number, unit = "", digits = 1) => {
        if (a !== undefined && b !== undefined && Math.abs(b - a) > 1e-9) {
          deltas.push(`${k} ${a.toFixed(digits)} → ${b.toFixed(digits)}${unit}`);
        }
      };
      d("AUW", before.auwG, after.auwG, " g", 0);
      d("TWR", before.twr, after.twr);
      d("hover", before.hoverThrottle && before.hoverThrottle * 100,
        after.hoverThrottle && after.hoverThrottle * 100, " %", 0);
      st.setLastDiff(deltas.length ? deltas.join(" · ") : null);
    }
    const contract = handle.contract();
    scene.load(artifact);
    // the validator is sovereign: every patched document is re-judged
    const report = await coreValidate(contract);
    st.setLoaded(artifact, report, contract);
    // session follows the patched contract; jog offsets re-apply
    sessionRef.current?.dispose();
    try {
      sessionRef.current = await CoreSession.create(contract);
      for (const [node, j] of jogTotals.current) {
        sessionRef.current.setJog(node, j.rx, j.ry);
      }
    } catch {
      sessionRef.current = null;
    }
    if (selected) {
      const part =
        artifact.baked.parts.find((candidate) => candidate.source_path === selected.sourcePath) ??
        artifact.baked.parts.find((candidate) => candidate.node === selected.node);
      if (part) {
        scene.setSelected(part.part_index);
        st.setSelected({
          partIndex: part.part_index,
          sourcePath: part.source_path,
          node: part.node,
          material: part.material,
          color: part.color,
        });
      } else {
        scene.setSelected(null);
        st.setSelected(null);
      }
    }
  }, []);

  // boot
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    void (async () => {
    const browserSupport = detectBrowserSupport();
    const scene: SceneController = browserSupport.tier === "viewer-grade"
      ? new ViewerScene(canvas)
      : new (await import("./scene")).StudioScene(canvas, "high");
    if (disposed) {
      scene.dispose();
      return;
    }
    // Viewer-grade engines intentionally use the dependency-light Canvas2D
    // schematic. The full Three.js/WebGL bundle is loaded only for full Studio;
    // contract, bake, simulation, and validator truth are unchanged.
    if (browserSupport.tier === "viewer-grade") {
      useStudio.getState().setTier("low");
    }
    scene.setReducedMotion(reducedMotionRef.current);
    sceneRef.current = scene;
    const onResize = () =>
      scene.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize);

    // the core tick drives poses when Drive is on (truth in core, D16)
    let fpsAccum = 0;
    let fpsCount = 0;
    let coreAccum = 0;
    let slowFor = 0; // XC-22 auto-degrader: sustained-slow timer
    scene.onFrame = (dt) => {
      const st = useStudio.getState();
      fpsAccum += dt;
      fpsCount += 1;
      if (st.driving && sessionRef.current) {
        const stepDt = st.paused ? (stepOnceRef.current ? DT : 0) : dt;
        stepOnceRef.current = false;
        // gamepad (P1-013 input): left stick = strafe/forward, right stick =
        // yaw/throttle; deadzone 0.08; sliders stay the fallback
        let sticks = {
          throttle: st.throttle,
          pitch: 0,
          roll: 0,
          yaw: 0,
          drive: st.drive,
          turn: 0,
        };
        const pad = navigator.getGamepads?.()[0];
        if (pad) {
          const dz = (v: number) => (Math.abs(v) > 0.08 ? v : 0);
          const [lx, ly, rx, ry] = [dz(pad.axes[0] ?? 0), dz(pad.axes[1] ?? 0), dz(pad.axes[2] ?? 0), dz(pad.axes[3] ?? 0)];
          if (lx || ly || rx || ry) {
            sticks = {
              throttle: -ry,
              pitch: -ly,
              roll: lx,
              yaw: rx,
              drive: -ly,
              turn: rx,
            };
          }
        }
        const playback = policyPlaybackRef.current;
        if (playback) {
          playback.elapsedS += stepDt;
          playback.controller.schedule(playback.elapsedS, sessionRef.current);
          sticks = playback.controller.input;
          if (playback.controller.failure) {
            const failure = playback.controller.failure;
            playback.controller.dispose();
            policyPlaybackRef.current = null;
            setPolicyPlaybackMessage(`policy playback refused · ${failure}`);
            st.setDriving(false);
            sticks = { throttle: 0, pitch: 0, roll: 0, yaw: 0, drive: 0, turn: 0 };
          } else if (playback.elapsedS >= playback.controller.durationS) {
            const count = playback.controller.inferenceCount;
            const taskId = playback.controller.taskId;
            playback.controller.dispose();
            policyPlaybackRef.current = null;
            setPolicyPlaybackMessage(
              `played ${taskId} · ONNX Runtime Web/WASM · ${count} inferences`,
            );
            st.setDriving(false);
            sticks = { throttle: 0, pitch: 0, roll: 0, yaw: 0, drive: 0, turn: 0 };
          }
        }
        const t0 = performance.now();
        if (stepDt > 0) {
          sessionRef.current.step(stepDt, sticks);
        }
        // zero-copy view, consumed synchronously (P1-005)
        scene.setPose(sessionRef.current.nodeNames, sessionRef.current.poseView());
        coreAccum += performance.now() - t0;
        // follow camera (P1-013): orbit target eases toward the driver
        if (!st.paused && !reducedMotionRef.current) scene.followFocus(sessionRef.current.focus(), dt);
      }
      if (fpsAccum >= 0.5) {
        const stats = scene.stats();
        const fps = Math.round(fpsCount / fpsAccum);
        const corePerf = sessionRef.current?.drainPerf();
        st.setPerf({
          fps,
          frameMs: stats.frameMs,
          drawCalls: stats.drawCalls,
          coreMs: corePerf ? corePerf.coreMs / Math.max(1, fpsCount) : coreAccum / fpsCount,
          uiMs: 0,
          workerMs: corePerf?.workerMs ?? 0,
          workerSamples: corePerf?.workerSamples ?? 0,
          rapierMs: 0,
          rapierSamples: 0,
          sessionMode: corePerf?.mode ?? null,
          poseSource: st.poseSource,
          workerPending: corePerf?.pending ?? false,
          rapierPending: false,
        });
        // XC-22 degradation ladder: only ever steps DOWN; raising is manual
        slowFor = fps < 45 ? slowFor + fpsAccum : 0;
        if (slowFor > 3 && st.tier !== "low") {
          const next = st.tier === "high" ? "medium" : "low";
          st.setTier(next);
          scene.setTier(next);
          slowFor = 0;
        }
        fpsAccum = 0;
        fpsCount = 0;
        coreAccum = 0;
      }
    };
    scene.start();
    void (async () => {
      const shareId = new URLSearchParams(window.location.search).get("share");
      if (shareId) {
        try {
          const { share } = await getShare(shareId);
          await loadContract(JSON.stringify(share.contract), share.validatorReport);
          setShareUrl(window.location.href);
          return;
        } catch {
          /* failed server share → try fragment/demo */
        }
      }
      // a share link carries the whole contract in the fragment (re-judged
      // locally on arrival — never trusted)
      const shared = await decodeShareFragment(window.location.hash);
      if (shared) {
        try {
          await loadContract(shared);
          return;
        } catch {
          /* malformed share → fall through to the demo */
        }
      }
      await loadDemo(useStudio.getState().modelId);
    })();

    // parity-gallery / automation hook (P1-015): deterministic captures
    (window as unknown as Record<string, unknown>).__forgeParity = {
      load: (id: string) => loadDemo(id),
      setCamera: (p: {
        yaw: number;
        el: number;
        dist: number;
        target: [number, number, number];
        fovDeg?: number;
      }) => scene.setCameraPose(p),
      setGrid: (visible: boolean) => scene.setGridVisible(visible),
      setShadows: (visible: boolean) => scene.setShadowsVisible(visible),
      setBlueprint: (on: boolean) => scene.setBlueprint(on),
      setExplode: (t: number) => scene.setExplode(t),
      select: (partIndex: number | null) => scene.setSelected(partIndex),
      setTier: (t: "high" | "medium" | "low") => scene.setTier(t),
      stats: () => scene.stats(),
      camera: () => scene.cameraState(),
      quality: () => scene.qualityState(),
      loaded: () => Boolean(useStudio.getState().artifact),
    };

    cleanup = () => {
      window.removeEventListener("resize", onResize);
      policyPlaybackRef.current?.controller.dispose();
      policyPlaybackRef.current = null;
      sessionRef.current?.dispose();
      sessionRef.current = null;
      bakeRef.current?.dispose();
      bakeRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
    })();
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [loadDemo]);

  // drag & drop a .forge.json → in-browser validate + bake (same bits as CI, D17)
  useEffect(() => {
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const text = await file.text();
      const report = await coreValidate(text);
      if (report.verdict === "admitted") {
        await loadContract(text);
      } else {
        const st = useStudio.getState();
        if (st.artifact) st.setLoaded(st.artifact, report, st.contractJson);
      }
    };
    const onDrag = (e: DragEvent) => e.preventDefault();
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragover", onDrag);
    return () => {
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragover", onDrag);
    };
  }, [loadContract]);

  useEffect(() => {
    sceneRef.current?.setExplode(s.explode);
  }, [s.explode, s.artifact]);
  useEffect(() => {
    sceneRef.current?.setBlueprint(s.blueprint);
  }, [s.blueprint]);

  useEffect(() => {
    void refreshReviews("needs_review");
  }, [refreshReviews]);

  useEffect(() => {
    try {
      if (anthropicKey) {
        window.sessionStorage.setItem(ANTHROPIC_KEY_STORAGE_KEY, anthropicKey);
      } else {
        window.sessionStorage.removeItem(ANTHROPIC_KEY_STORAGE_KEY);
      }
    } catch {
      /* storage can be blocked; local state still works for the session */
    }
  }, [anthropicKey]);

  useEffect(() => {
    let alive = true;
    void listGenerationModels()
      .then((models) => {
        if (!alive) return;
        setGenerationModels(models);
        setGenerationModelsError(null);
      })
      .catch((error) => {
        if (!alive) return;
        setGenerationModels([]);
        setGenerationModelsError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    void refreshAccount();
    void refreshModels();
    void refreshJobs();
    void refreshArtifacts();
    void refreshConsents();
    void refreshPlatform();
    void refreshBriefEval();
  }, [refreshAccount, refreshArtifacts, refreshBriefEval, refreshConsents, refreshJobs, refreshModels, refreshPlatform]);

  useEffect(() => {
    if (!jobs.some((job) => job.status === "queued" || job.status === "running")) return;
    const timer = window.setInterval(() => {
      void Promise.all([refreshJobs(), refreshArtifacts()]);
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [jobs, refreshArtifacts, refreshJobs]);

  const selectCourse = useCallback((courseId: string | null) => {
    setActiveCourseId(courseId);
    if (courseId) replaceCourseUrl(courseId);
    void refreshLeaderboard(courseId);
  }, [refreshLeaderboard]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      reducedMotionRef.current = query.matches;
      setReducedMotion(query.matches);
      sceneRef.current?.setReducedMotion(query.matches);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (jogDrag.current) return; // a jog drag ate this gesture
    const rect = e.currentTarget.getBoundingClientRect();
    const pick = sceneRef.current?.pick(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    s.setSelected(pick ?? null);
  };

  const onCanvasKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const scene = sceneRef.current;
    if (!scene) return;
    let message: string | null = null;
    switch (event.key) {
      case "ArrowLeft":
        scene.nudgeCamera(-0.12, 0);
        message = "Orbited left";
        break;
      case "ArrowRight":
        scene.nudgeCamera(0.12, 0);
        message = "Orbited right";
        break;
      case "ArrowUp":
        scene.nudgeCamera(0, 0.1);
        message = "Orbited up";
        break;
      case "ArrowDown":
        scene.nudgeCamera(0, -0.1);
        message = "Orbited down";
        break;
      case "PageUp":
        scene.nudgeCamera(0, 0, 0.88);
        message = "Zoomed in";
        break;
      case "PageDown":
        scene.nudgeCamera(0, 0, 1.14);
        message = "Zoomed out";
        break;
      case "e":
      case "E": {
        const next = Math.max(0, Math.min(1, s.explode + (event.shiftKey ? -0.1 : 0.1)));
        s.setExplode(next);
        message = `Explode ${Math.round(next * 100)} percent`;
        break;
      }
      case "b":
      case "B":
        s.setBlueprint(!s.blueprint);
        message = `Blueprint ${s.blueprint ? "off" : "on"}`;
        break;
      default:
        return;
    }
    event.preventDefault();
    setViewerAnnouncement(message);
  };

  // teach-pendant jog (P1-013): drag the selected node, X→yaw, Y→pitch
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = useStudio.getState();
    if (!st.jogging || !st.selected || !sessionRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    sceneRef.current?.setControlsEnabled(false);
    const node = st.selected.node;
    const j = jogTotals.current.get(node) ?? { rx: 0, ry: 0 };
    jogDrag.current = { node, ...j };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = jogDrag.current;
    if (!drag || !sessionRef.current) return;
    drag.ry += e.movementX * 0.008;
    drag.rx += e.movementY * 0.008;
    jogTotals.current.set(drag.node, { rx: drag.rx, ry: drag.ry });
    sessionRef.current.setJog(drag.node, drag.rx, drag.ry);
  };
  const onPointerUp = () => {
    if (!jogDrag.current) return;
    // let the click handler see the drag before clearing it
    setTimeout(() => {
      jogDrag.current = null;
    }, 0);
    sceneRef.current?.setControlsEnabled(true);
  };

  const clearJog = () => {
    jogTotals.current.clear();
    sessionRef.current?.clearJog();
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard needs a user gesture/permission; visible URL still updates */
    }
  };

  const copyActiveCourseUrl = async () => {
    if (!activeCourseId) return;
    const url = courseUrlFor(activeCourseId);
    replaceCourseUrl(activeCourseId);
    setPlatformMessage(`course URL copied · ${activeCourseId}`);
    await copyText(url);
  };

  const saveCurrentModel = async () => {
    const contract = useStudio.getState().contractJson;
    if (!contract) return;
    setModelBusy(true);
    setModelError(null);
    try {
      const { model } = await saveModel(JSON.parse(contract), true);
      setActiveModelId(model.id);
      setLoadedModelContractHash(model.contractHash);
      await refreshModels();
    } catch (error) {
      setModelError(error instanceof Error ? error.message : String(error));
    } finally {
      setModelBusy(false);
    }
  };

  const selectActiveModel = async (modelId: string) => {
    setActiveModelId(modelId || null);
    const model = models.find((candidate) => candidate.id === modelId);
    if (!model) return;
    setModelBusy(true);
    setModelError(null);
    try {
      await loadContract(JSON.stringify(model.contract), model.validatorReport, model.contractHash);
      setShareUrl(null);
    } catch (error) {
      setModelError(error instanceof Error ? error.message : String(error));
    } finally {
      setModelBusy(false);
    }
  };

  const saveCodesignCandidate = useCallback(async (candidate: CodesignCandidate) => {
    if (!isPatchList(candidate.patch)) return;
    const contract = useStudio.getState().contractJson;
    if (!contract) {
      setModelError("load a base contract before saving a co-design point");
      return;
    }
    setModelBusy(true);
    setModelError(null);
    try {
      const patched = await corePatch(contract, JSON.stringify(candidate.patch));
      const { model, report } = await saveModel(JSON.parse(patched), false);
      setActiveModelId(model.id);
      await loadContract(JSON.stringify(model.contract), report, model.contractHash);
      await refreshModels();
    } catch (error) {
      setModelError(error instanceof Error ? error.message : String(error));
    } finally {
      setModelBusy(false);
    }
  }, [loadContract, refreshModels]);

  const editActiveModel = async () => {
    if (!activeModelId || !editPrompt.trim()) return;
    setModelBusy(true);
    setEditMessage(null);
    setModelError(null);
    try {
      const result = await editModel(activeModelId, editPrompt.trim());
      setActiveModelId(result.model.id);
      await loadContract(
        JSON.stringify(result.model.contract),
        result.report,
        result.model.contractHash,
      );
      setEditMessage(`edited in ${result.elapsedMs} ms`);
      await refreshModels();
    } catch (error) {
      setEditMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setModelBusy(false);
    }
  };

  const uploadScanFiles = async (files: FileList | null) => {
    const selected = Array.from(files ?? []).slice(0, 8);
    if (selected.length === 0) return;
    setScanUploadBusy(true);
    setScanUploadMessage(null);
    setJobsError(null);
    try {
      const uploaded = [];
      for (const file of selected) {
        const result = await uploadObjectBlob(file, "photoscan-source");
        uploaded.push(result.blob.id);
      }
      setScanImageRefs(uploaded);
      setScanUploadMessage(`${uploaded.length} image${uploaded.length === 1 ? "" : "s"} uploaded`);
    } catch (error) {
      setJobsError(error instanceof Error ? error.message : String(error));
    } finally {
      setScanUploadBusy(false);
    }
  };

  const runFixtureJob = async (kind: string) => {
    setJobsError(null);
    if (kind === "photoscan.single" && scanImageRefs.length < 1) {
      setJobsError("upload one owned photo, then grant photoscan processing consent");
      return;
    }
    if (kind === "photoscan.multiview" && scanImageRefs.length < 2) {
      setJobsError("upload at least two owned photos, then grant processing consent for each");
      return;
    }
    if (kind === "train.policy" && !activeModelId) {
      setJobsError("policy training requires an owned admitted model");
      return;
    }
    const common = {
      ...(activeModelId
        ? { modelId: activeModelId }
        : { contractHash: s.report?.contractHash }),
      sourceObjectId: "fixture://asset",
    };
    const singleImages = scanImageRefs.slice(0, 1).map((id) => `obj:${id}`);
    const multiImages = scanImageRefs.map((id) => `obj:${id}`);
    const payloadByKind: Record<string, unknown> = {
      "photoscan.single": { ...common, images: singleImages, sourceBlobIds: scanImageRefs.slice(0, 1) },
      "photoscan.multiview": { ...common, images: multiImages, sourceBlobIds: scanImageRefs, scale: 1.0 },
      "train.policy": { ...common, task: "hover-hold", seed: 7 },
      "train.sysid-fit": {
        ...common,
        nominalVoltageV: 16.8,
        samples: [
          { t: 0, voltageV: 16.8, currentA: 0 },
          { t: 2, voltageV: 15.7, currentA: 22 },
          { t: 4, voltageV: 15.5, currentA: 24 },
        ],
      },
      "replay.verify": { ...common, tape: { frames: [{ t: 0 }, { t: 1 / 60 }] } },
      "codesign.evaluate": common,
      "bridge.config-diff": { firmware: "betaflight", mixer: "quadx", rates: { failsafe_delay: 10 } },
      "bridge.telemetry-ingest": {
        ...common,
        samples: [
          { t: 1, positionM: [0, 0, 0], accelG: 1.1 },
          { t: 0, positionM: [0, 0, 0], accelG: 1.0 },
        ],
      },
      "bridge.supervisor-check": {
        config: { geofenceRadiusM: 5, maxAttitudeRad: 0.8, maxRateRadS: 6, minBatteryV: 13.2 },
        state: { positionM: [0, 0, 0], attitudeRad: [0, 0, 0], rateRadS: [0, 0, 0], batteryV: 14.8 },
      },
      "maintenance.estimate-wear": {
        nominalVoltageV: 16.8,
        capacityMah: 1500,
        samples: [
          { t: 0, voltageV: 16.8, currentA: 0, throttle: 0, accelG: 1 },
          { t: 60, voltageV: 15.8, currentA: 20, throttle: 0.5, accelG: 2 },
        ],
      },
      "maintenance.crash-forensics": {
        samples: [
          { t: 0, accelG: 1 },
          { t: 10, accelG: 12 },
        ],
      },
      "maintenance.repair-sheet": {
        damagedNodes: ["root"],
        vendorSkus: { frame: "FRAME-SKU" },
        parts: [{ node: "root", comp: "frame", explode: { t0: 0.8 } }],
      },
      "maintenance.fleet-summary": { vehicles: [{ id: "demo", packCycles: 81 }] },
    };
    try {
      const liveTraining = kind === "train.policy"
        && jobCapabilities?.providers.local.configured === true
        && jobCapabilities.live.sb3.configured === true;
      await createJob(kind, payloadByKind[kind] ?? common, {
        provider: liveTraining ? "local" : "fixture",
        idempotencyKey: globalThis.crypto.randomUUID(),
      });
      await refreshJobs();
      await refreshArtifacts();
    } catch (error) {
      setJobsError(error instanceof Error ? error.message : String(error));
    }
  };

  const changeConsent = async (
    purpose: ConsentPurpose,
    subjectKind: ConsentSubjectKind,
    subjectIds: string[],
    action: "grant" | "withdraw",
  ) => {
    const policy = consentPolicies.find((candidate) => candidate.purpose === purpose);
    if (!policy || subjectIds.length === 0) return;
    setConsentBusy(true);
    setConsentMessage(null);
    try {
      for (const subjectId of subjectIds) {
        await recordConsentEvent({
          purpose,
          subjectKind,
          subjectId,
          policyVersion: policy.policyVersion,
          noticeHash: policy.noticeHash,
          action,
          locale: navigator.language,
          idempotencyKey: `${purpose}:${subjectId}:${action}:${crypto.randomUUID()}`,
        });
      }
      setConsentMessage(`${action === "grant" ? "granted" : "withdrew"} ${purpose}`);
      await Promise.all([refreshConsents(), refreshJobs(), refreshArtifacts(), refreshPlatform()]);
    } catch (error) {
      setConsentMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setConsentBusy(false);
    }
  };

  const shareFirstTelemetry = async () => {
    const telemetryId = telemetryLogs[0]?.id;
    if (!telemetryId) return;
    setConsentBusy(true);
    try {
      await shareTelemetryLog(telemetryId);
      setConsentMessage(`shared telemetry ${telemetryId}`);
      await refreshArtifacts();
    } catch (error) {
      setConsentMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setConsentBusy(false);
    }
  };

  const contributeActivePattern = async () => {
    if (!activeModelId) return;
    setConsentBusy(true);
    try {
      const result = await contributeModelPattern(activeModelId, ["serviceable modular assembly"]);
      setConsentMessage(`contributed pattern ${result.contribution.id}`);
    } catch (error) {
      setConsentMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setConsentBusy(false);
    }
  };

  const trainFromFirstTelemetry = async () => {
    const telemetryId = telemetryLogs[0]?.id;
    if (!telemetryId) return;
    if (!activeModelId) {
      setConsentMessage("consented training requires an owned admitted model");
      return;
    }
    setConsentBusy(true);
    try {
      const liveTraining = jobCapabilities?.providers.local.configured === true
        && jobCapabilities.live.sb3.configured === true;
      await createJob("train.policy", {
        modelId: activeModelId,
        task: "hover-hold",
        seed: 7,
        telemetryLogIds: [telemetryId],
      }, {
        provider: liveTraining ? "local" : "fixture",
        idempotencyKey: globalThis.crypto.randomUUID(),
      });
      setConsentMessage(
        `${liveTraining ? "queued local" : "completed fixture"} consented training reuse for ${telemetryId}`,
      );
      await Promise.all([refreshJobs(), refreshArtifacts()]);
    } catch (error) {
      setConsentMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setConsentBusy(false);
    }
  };

  const startPolicyPlayback = useCallback((output: PolicyOutput, artifactId?: string) => {
    void (async () => {
      const session = sessionRef.current;
      const contractHash = loadedModelContractHash ?? useStudio.getState().report?.contractHash;
      if (!session || !contractHash) {
        setPolicyPlaybackMessage("policy playback requires a loaded, validated driveable contract");
        return;
      }
      policyPlaybackRef.current?.controller.dispose();
      policyPlaybackRef.current = null;
      setPolicyPlaybackMessage("verifying policy bytes, lineage, tensor contract, and ONNX Runtime Web/WASM");
      try {
        const retainedModelBytes = output.onnx?.modelBase64
          ? undefined
          : await downloadPolicyModel(
              artifactId ?? output.delivery?.policyArtifactId ?? "",
              { byteSize: output.onnx?.byteSize, sha256: output.onnx?.sha256 },
            );
        const controller = await BrowserPolicyController.create(
          output,
          contractHash,
          session,
          retainedModelBytes,
        );
        if (session !== sessionRef.current) {
          controller.dispose();
          throw new Error("active contract changed while the policy runtime was loading");
        }
        policyPlaybackRef.current = { controller, elapsedS: 0 };
        const st = useStudio.getState();
        st.setDriving(true);
        st.setPaused(false);
        setPolicyPlaybackMessage(
          `playing ${controller.taskId} · ONNX Runtime Web/WASM · ${controller.inferenceCount} inference`,
        );
      } catch (error) {
        setPolicyPlaybackMessage(
          `policy playback refused · ${error instanceof Error ? error.message : String(error)}`,
        );
        useStudio.getState().setDriving(false);
      }
    })();
  }, [loadedModelContractHash]);

  const publishFixtureCourse = async () => {
    setPlatformBusy(true);
    setPlatformError(null);
    setPlatformMessage(null);
    try {
      const envSpec = JSON.parse(courseEnvJson) as unknown;
      if (!courseName.trim()) throw new Error("course name is required");
      const result = await createCourse({
        name: courseName.trim(),
        visibility: courseVisibility,
        envSpec,
      });
      setActiveCourseId(result.id);
      setCourseEnvJson(JSON.stringify(envSpec, null, 2));
      const report = asRecord(result.validatorReport);
      setPlatformMessage(`course ${result.id} · ${typeof report?.verdict === "string" ? report.verdict : "validated"}`);
      await refreshPlatform();
    } catch (error) {
      const message = error instanceof SyntaxError ? `EnvSpec JSON: ${error.message}` : error instanceof Error ? error.message : String(error);
      setPlatformError(message);
    } finally {
      setPlatformBusy(false);
    }
  };

  const submitFixtureLeaderboardRun = async () => {
    if (!activeCourseId) return;
    setPlatformBusy(true);
    setPlatformError(null);
    setPlatformMessage(null);
    try {
      const result = await submitLeaderboardRun({
        courseId: activeCourseId,
        score: 88.4,
        tape: { frames: [{ t: 0 }, { t: 1 / 60 }, { t: 2 / 60 }] },
      });
      setPlatformMessage(`run ${result.id} · ${result.verified ? "verified" : "held"}`);
      await refreshLeaderboard(activeCourseId);
    } catch (error) {
      setPlatformError(error instanceof Error ? error.message : String(error));
    } finally {
      setPlatformBusy(false);
    }
  };

  const publishFixtureAssignment = async () => {
    setPlatformBusy(true);
    setPlatformError(null);
    setPlatformMessage(null);
    try {
      const result = await createClassroomAssignment({
        title: "Admit a safe mini quad",
        brief: "Submit a validator-admitted model and a scorecard above the course threshold.",
        courseId: activeCourseId ?? undefined,
        visibility: "unlisted",
        rubric: { maxErrors: 0, minScore: 0.8, minSuccessRate: 0.8 },
      });
      setActiveAssignmentId(result.id);
      setPlatformMessage(`assignment ${result.id}`);
      await refreshPlatform();
    } catch (error) {
      setPlatformError(error instanceof Error ? error.message : String(error));
    } finally {
      setPlatformBusy(false);
    }
  };

  const submitFixtureAssignment = async () => {
    if (!activeAssignmentId) return;
    setPlatformBusy(true);
    setPlatformError(null);
    setPlatformMessage(null);
    try {
      const contractJson = useStudio.getState().contractJson;
      const result = await submitClassroomSubmission(activeAssignmentId, {
        ...(activeModelId ? { modelId: activeModelId } : contractJson ? { contract: JSON.parse(contractJson) } : {}),
        scorecard: { successRate: 0.92 },
      });
      const grade = asRecord(result.grade);
      setPlatformMessage(`submission ${result.id} · ${grade?.pass === true ? "pass" : "held"}`);
      await refreshClassroomSubmissions(activeAssignmentId);
    } catch (error) {
      setPlatformError(error instanceof Error ? error.message : String(error));
    } finally {
      setPlatformBusy(false);
    }
  };

  const reportFixtureModeration = async () => {
    setPlatformBusy(true);
    setPlatformError(null);
    setPlatformMessage(null);
    try {
      const target = listings[0]
        ? { targetKind: "listing" as const, targetId: listings[0].id }
        : activeModelId
          ? { targetKind: "model" as const, targetId: activeModelId }
          : activeCourseId
            ? { targetKind: "course" as const, targetId: activeCourseId }
            : { targetKind: "model" as const, targetId: "local-fixture" };
      const result = await createModerationReport({
        ...target,
        reason: "safety",
        detail: "local moderation fixture",
      });
      setPlatformMessage(`report ${result.id} · ${result.repeatInfringerSignal ? "repeat" : result.status}`);
      setModerationReports(await listModerationReports());
    } catch (error) {
      setPlatformError(error instanceof Error ? error.message : String(error));
    } finally {
      setPlatformBusy(false);
    }
  };

  const submitModelListing = async () => {
    if (!activeModelId) return;
    setPlatformBusy(true);
    setPlatformError(null);
    setPlatformMessage(null);
    try {
      const model = models.find((candidate) => candidate.id === activeModelId);
      const result = await createListing({
        modelId: activeModelId,
        title: model?.name ?? "FORGE model",
        listingKind: "model",
        priceCredits: 0,
      });
      setPlatformMessage(`listing ${result.id} · ${result.status}`);
      await refreshPlatform();
    } catch (error) {
      setPlatformError(error instanceof Error ? error.message : String(error));
    } finally {
      setPlatformBusy(false);
    }
  };

  const submitPolicyListing = async () => {
    if (!activeModelId) return;
    setPlatformBusy(true);
    setPlatformError(null);
    setPlatformMessage(null);
    try {
      const model = models.find((candidate) => candidate.id === activeModelId);
      const result = await createListing({
        modelId: activeModelId,
        title: `${model?.name ?? "FORGE model"} skill`,
        listingKind: "policy",
        priceCredits: 0,
        policySignoff: { accepted: true, jurisdiction: "US/EU", useCase: "simulation-only local fixture" },
      });
      setPlatformMessage(`policy listing ${result.id} · ${result.status}`);
      await refreshPlatform();
    } catch (error) {
      setPlatformError(error instanceof Error ? error.message : String(error));
    } finally {
      setPlatformBusy(false);
    }
  };

  const refreshVendorLinks = async () => {
    setPlatformBusy(true);
    setPlatformError(null);
    setPlatformMessage(null);
    try {
      const componentIds = vendorComponentIds(maintenanceRecords);
      const useWorker = jobCapabilities?.live.vendorRefresh.configured === true;
      const result = await refreshVendorOffers({
        componentIds,
        execution: useWorker ? "worker" : "sandbox",
        idempotencyKey: useWorker ? globalThis.crypto.randomUUID() : undefined,
      });
      if ("job" in result) {
        setPlatformMessage(`vendor refresh ${result.job.id} queued through normalized worker`);
        await refreshPlatform();
        return;
      }
      setVendorOffers(result.offers);
      setPlatformMessage(`vendor links ${result.offers.length} · quote/link handoff only`);
      setVendorOffers(await listVendorOffers());
    } catch (error) {
      setPlatformError(error instanceof Error ? error.message : String(error));
    } finally {
      setPlatformBusy(false);
    }
  };

  const requestPrintQuoteLink = async () => {
    setPlatformBusy(true);
    setPlatformError(null);
    setPlatformMessage(null);
    try {
      const artifact = photoscanArtifacts.find((candidate) => candidate.artifactBlobId);
      if (!artifact?.artifactBlobId) {
        throw new Error("print quote handoff requires a photoscan artifact blob");
      }
      const result = await createPrintQuote({
        artifactBlobId: artifact.artifactBlobId,
        modelId: activeModelId ?? undefined,
        process: "mjf",
        material: "pa12",
        quantity: 1,
        dfmArtifact: {
          source: "studio",
          photoscanArtifactId: artifact.id,
          checkout: "off-platform",
          noDirectPayment: true,
        },
      });
      setPrintQuotes([result.quote, ...printQuotes.filter((quote) => quote.id !== result.quote.id)].slice(0, 10));
      setPlatformMessage(`print quote ${result.quote.id} · off-platform checkout`);
    } catch (error) {
      setPlatformError(error instanceof Error ? error.message : String(error));
    } finally {
      setPlatformBusy(false);
    }
  };

  const recordMarketplaceUsage = async (
    listing: ListingRecord,
    event: MarketplaceUsageEvent,
  ) => {
    setPlatformBusy(true);
    setPlatformError(null);
    setPlatformMessage(null);
    try {
      await recordListingUsage(listing.id, {
        event,
        listingKind: marketplaceListingKind(listing.kind),
        ...(event === "equip" && listing.priceCredits > 0 ? { creditsSpent: listing.priceCredits } : {}),
      });
      setPlatformMessage(`${event} recorded · ${listing.id}`);
    } catch (error) {
      setPlatformError(error instanceof Error ? error.message : String(error));
    } finally {
      setPlatformBusy(false);
    }
  };

  const share = async () => {
    const st = useStudio.getState();
    const contract = st.contractJson;
    if (!contract || st.report?.verdict !== "admitted") return;
    if (activeModelId) {
      setModelError(null);
      try {
        const result = await shareModel(activeModelId);
        const url = `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(result.share.id)}`;
        setShareUrl(url);
        window.history.replaceState(null, "", `?share=${encodeURIComponent(result.share.id)}`);
        await copyText(url);
        return;
      } catch (error) {
        setModelError(error instanceof Error ? error.message : String(error));
      }
    }
    const fragment = await encodeShareFragment(contract);
    const url = `${window.location.origin}${window.location.pathname}#${fragment}`;
    setShareUrl(url);
    window.history.replaceState(null, "", `#${fragment}`);
    await copyText(url);
  };

  const hud = s.artifact?.hud;
  const isMultirotor = hud?.twr !== undefined;
  const narrow = viewportWidth < 760;
  const generationStatus = generationBusy
    ? "running"
    : generationError
      ? "error"
      : generationResult?.verdict ?? "idle";
  const synthesisPin = generationModels.find((model) => model.role === "synthesis");
  const repairPin = generationModels.find((model) => model.role === "repair");
  const shareDisabled = !s.contractJson || s.report?.verdict !== "admitted";
  const configurator = configuratorContract(s.contractJson);
  const browserSupport = detectBrowserSupport();
  return (
    <>
      <a className="skip-link" href="#studio-controls">Skip to Studio controls</a>
      <main
        id="studio-workspace"
        data-testid="studio-workspace"
        data-layout={narrow ? "narrow" : "wide"}
        style={{ position: "relative", width: "100vw", height: "100vh" }}
      >
      <canvas
        ref={canvasRef}
        data-testid="studio-viewer"
        data-renderer={browserSupport.tier === "viewer-grade" ? "schematic-2d" : "webgl"}
        role="region"
        aria-roledescription={browserSupport.tier === "viewer-grade"
          ? "interactive robot schematic"
          : "interactive 3D robot viewer"}
        aria-label="Interactive robot assembly viewer"
        aria-describedby="viewer-keyboard-help"
        tabIndex={0}
        onClick={onCanvasClick}
        onKeyDown={onCanvasKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      <p id="viewer-keyboard-help" className="sr-only">
        Use arrow keys to orbit, Page Up and Page Down to zoom, E and Shift E to change explode,
        and B to toggle blueprint.
      </p>
      <div className="sr-only" role="status" aria-live="polite" data-testid="viewer-announcement">
        {viewerAnnouncement}
      </div>

      <div
        id="studio-controls"
        role="region"
        aria-labelledby="studio-title"
        tabIndex={-1}
        style={{
          ...panel,
          top: 12,
          left: 12,
          width: 360,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: narrow ? "42vh" : "calc(100vh - 24px)",
          overflow: "auto",
        }}
      >
        <h1 id="studio-title" style={{ color: "#8fa3bf", margin: "0 0 6px", fontSize: 14 }}>
          ForgedTTC Studio
        </h1>
        <div
          data-testid="browser-support"
          data-tier={browserSupport.tier}
          data-surface={browserSupport.surface}
          data-reduced-motion={String(reducedMotion)}
          role="status"
          style={{ color: MUTED, marginBottom: 6 }}
        >
          {browserSupport.summary}{reducedMotion ? " · reduced motion" : ""}
        </div>
        <select
          data-testid="demo-model"
          aria-label="demo model"
          value={s.modelId}
          onChange={(e) => {
            s.setModelId(e.target.value);
            void loadDemo(e.target.value);
          }}
          style={{ width: "100%", background: "#16181c", color: "#cfd6df", border: "1px solid #2a2f38" }}
        >
          {DEMO_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <div style={{ color: MUTED, marginTop: 4 }}>
          {s.artifact
            ? `${s.artifact.counts.parts} parts · ${s.artifact.counts.faces} faces`
            : "loading…"}
        </div>
        <div data-testid="studio-help" style={{ color: MUTED }}>drop a .forge.json to validate in-browser</div>
        <button
          data-testid="share-model"
          onClick={() => void share()}
          disabled={shareDisabled}
          title={shareDisabled ? "only admitted contracts can be shared" : "copy share URL"}
          style={{ ...btn, marginTop: 6, opacity: shareDisabled ? 0.55 : 1 }}
        >
          share
        </button>
        {shareUrl && <div data-testid="share-url" role="status" style={{ color: MUTED, wordBreak: "break-word" }}>{shareUrl}</div>}

        {configurator.slots.length > 0 && (
          <details data-testid="variant-configurator" style={{ borderTop: "1px solid #2a2f38", marginTop: 10, paddingTop: 8 }}>
            <summary style={{ color: "#8fa3bf", cursor: "pointer" }}>
              equipped variants ({configurator.slots.length})
            </summary>
            {configurator.slots.map((slot, slotIndex) => (
              <div key={slot.id} style={{ marginTop: 8 }}>
                <div style={{ color: "#cfd6df" }}>{slot.label}</div>
                <div style={{ color: "#7d899b" }}>{slot.mountNodes.join(", ") || "no mount"}</div>
                <div style={{ display: "grid", gap: 5, marginTop: 5 }}>
                  {slot.variants.map((variant) => {
                    const equipped = slot.equippedVariantId === variant.id;
                    return (
                      <button
                        key={variant.id}
                        data-testid={`variant-${slot.id}-${variant.id}`}
                        aria-pressed={equipped}
                        onClick={() =>
                          void applyPatch([
                            {
                              op: slot.equippedVariantId == null ? "add" : "replace",
                              path: `/slots/${slotIndex}/equippedVariantId`,
                              value: variant.id,
                            },
                          ])
                        }
                        disabled={equipped}
                        style={{
                          ...btn,
                          padding: "6px 7px",
                          textAlign: "left",
                          borderColor: equipped ? "#39c8ff" : "#2a2f38",
                          background: equipped ? "rgba(57,200,255,0.1)" : "#16181c",
                          opacity: 1,
                        }}
                      >
                        <span style={{ display: "block", color: equipped ? "#39c8ff" : "#cfd6df" }}>
                          {equipped ? "equipped · " : ""}{variant.name ?? variant.id}
                        </span>
                        <span style={{ display: "block", color: "#7d899b", whiteSpace: "normal" }}>
                          {variantConsequence(variant, configurator.lockfile)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </details>
        )}

        <div data-testid="account-panel" style={{ borderTop: "1px solid #2a2f38", marginTop: 10, paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#8fa3bf", flex: 1 }}>account</span>
            {me?.authenticated ? (
              <a href={gatewayUrl("/auth/signout")} style={linkStyle}>
                sign out
              </a>
            ) : (
              <a href={gatewayUrl("/auth/signin/github")} style={linkStyle}>
                GitHub
              </a>
            )}
            <button data-testid="account-refresh" onClick={() => void refreshAccount()} style={btn}>
              refresh
            </button>
          </div>
          <div data-testid="account-identity" style={{ color: "#7d899b", wordBreak: "break-word" }}>
            {me?.authenticated ? me.user?.email ?? me.user?.name ?? me.user?.id : "not signed in"}
          </div>
          {modelError && <div data-testid="model-error" style={{ color: "#e6a23c", wordBreak: "break-word" }}>{modelError}</div>}
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button data-testid="model-save" onClick={() => void saveCurrentModel()} disabled={modelBusy || !s.contractJson} style={btn}>
              save
            </button>
            <button
              onClick={() => void refreshModels()}
              disabled={modelBusy}
              style={btn}
            >
              models
            </button>
          </div>
          {models.length > 0 && (
            <select
              data-testid="model-select"
              aria-label="saved model"
              value={activeModelId ?? ""}
              disabled={modelBusy}
              onChange={(event) => void selectActiveModel(event.target.value)}
              style={{ ...selectStyle, width: "100%", marginTop: 6 }}
            >
              {models.map((model) => (
                <option key={model.id} value={model.id} data-contract-hash={model.contractHash}>
                  {model.name} · {model.status}
                </option>
              ))}
            </select>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input
              data-testid="model-edit-prompt"
              aria-label="model edit instruction"
              value={editPrompt}
              onChange={(event) => setEditPrompt(event.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button data-testid="model-edit-run" onClick={() => void editActiveModel()} disabled={modelBusy || !activeModelId} style={btn}>
              edit
            </button>
          </div>
          {editMessage && <div data-testid="model-edit-status" style={{ color: editMessage.includes("ms") ? "#7dd87d" : "#e6a23c" }}>{editMessage}</div>}
        </div>

        <label style={{ display: "block", marginTop: 8 }}>
          explode
          <input
            type="range" min={0} max={1} step={0.001} value={s.explode}
            onChange={(e) => s.setExplode(Number(e.target.value))}
            style={{ width: "100%", display: "block" }}
          />
        </label>
        <label style={{ display: "block", marginTop: 6, color: "#7d899b" }}>
          quality{" "}
          <select
            value={s.tier}
            disabled={browserSupport.tier === "viewer-grade"}
            onChange={(e) => {
              const t = e.target.value as "high" | "medium" | "low";
              s.setTier(t);
              sceneRef.current?.setTier(t);
            }}
            style={{ background: "#16181c", color: "#cfd6df", border: "1px solid #2a2f38" }}
          >
            <option value="high">high (AO)</option>
            <option value="medium">medium (AO ½res)</option>
            <option value="low">low (AO off)</option>
          </select>
        </label>
        <label style={{ display: "inline-flex", gap: 6, marginTop: 6 }}>
          <input type="checkbox" checked={s.blueprint} onChange={(e) => s.setBlueprint(e.target.checked)} />
          blueprint
        </label>
        <label style={{ display: "inline-flex", gap: 6, marginLeft: 12 }}>
          <input type="checkbox" checked={s.driving} onChange={(e) => s.setDriving(e.target.checked)} />
          drive (core tick)
        </label>
        {s.driving && (
          <>
            <label style={{ display: "block", marginTop: 6 }}>
              {isMultirotor ? "throttle" : "drive"}
              <input
                type="range" min={0} max={1} step={0.01}
                value={isMultirotor ? s.throttle : s.drive}
                onChange={(e) =>
                  isMultirotor ? s.setThrottle(Number(e.target.value)) : s.setDrive(Number(e.target.value))
                }
                style={{ width: "100%", display: "block" }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
              <label style={{ display: "inline-flex", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={s.paused}
                  onChange={(e) => s.setPaused(e.target.checked)}
                />
                pause
              </label>
              {s.paused && (
                <button onClick={() => (stepOnceRef.current = true)} style={btn}>
                  step ⏯ 1/120 s
                </button>
              )}
              <label style={{ display: "inline-flex", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={s.jogging}
                  onChange={(e) => s.setJogging(e.target.checked)}
                />
                jog
              </label>
              {s.jogging && (
                <button onClick={clearJog} style={btn}>
                  zero
                </button>
              )}
            </div>
            {s.jogging && (
              <div style={{ color: "#7d899b", marginTop: 4 }}>
                {s.selected ? `drag to jog ${s.selected.node}` : "select a part to jog its node"}
              </div>
            )}
          </>
        )}

        <div data-testid="generation-panel" style={{ borderTop: "1px solid #2a2f38", marginTop: 10, paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#8fa3bf", flex: 1 }}>generation</span>
            <GenerationStatusBadge status={generationStatus} />
            <button
              data-testid="generation-run"
              onClick={() => void runGenerate()}
              disabled={generationBusy || !generationPrompt.trim()}
              style={{ ...btn, opacity: generationBusy || !generationPrompt.trim() ? 0.55 : 1 }}
            >
              generate
            </button>
          </div>
          <textarea
            data-testid="generation-prompt"
            aria-label="generation brief"
            value={generationPrompt}
            onChange={(event) => setGenerationPrompt(event.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="brief"
            style={textareaStyle}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
            <label style={fieldLabel}>
              provider
              <select
                data-testid="generation-provider"
                value={generationProvider}
                onChange={(event) => setGenerationProvider(event.target.value as GenerationProvider)}
                style={{ ...selectStyle, width: "100%" }}
              >
                <option value="template">template</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </label>
            <label style={fieldLabel}>
              archetype
              <select
                data-testid="generation-archetype"
                value={generationArchetype}
                onChange={(event) => setGenerationArchetype(event.target.value as GenerationArchetype | "")}
                style={{ ...selectStyle, width: "100%" }}
              >
                <option value="">auto</option>
                {GENERATION_ARCHETYPES.map((archetype) => (
                  <option key={archetype} value={archetype}>
                    {archetype}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ ...fieldLabel, gridColumn: "1 / -1" }}>
              categories
              <input
                data-testid="generation-categories"
                value={generationCategories}
                onChange={(event) => setGenerationCategories(event.target.value)}
                placeholder="motor, prop, battery"
                style={inputStyle}
              />
            </label>
            <label style={fieldLabel}>
              limit
              <input
                data-testid="generation-limit"
                type="number"
                min={1}
                max={20}
                value={generationLimit}
                onChange={(event) => setGenerationLimit(Number(event.target.value))}
                style={inputStyle}
              />
            </label>
            <label style={fieldLabel}>
              repairs
              <input
                data-testid="generation-repairs"
                type="number"
                min={0}
                max={3}
                value={generationMaxRepairs}
                onChange={(event) => setGenerationMaxRepairs(Number(event.target.value))}
                style={inputStyle}
              />
            </label>
            <label style={fieldLabel}>
              seed
              <input
                data-testid="generation-seed"
                type="number"
                min={0}
                value={generationSeed}
                onChange={(event) => setGenerationSeed(Number(event.target.value))}
                style={inputStyle}
              />
            </label>
            {generationProvider === "anthropic" && (
              <label style={fieldLabel}>
                BYO key
                <input
                  data-testid="generation-anthropic-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={anthropicKey}
                  onChange={(event) => setAnthropicKey(event.target.value)}
                  placeholder="sk-ant-..."
                  style={inputStyle}
                />
              </label>
            )}
          </div>
          <div style={{ color: "#7d899b", marginTop: 5, wordBreak: "break-word" }}>
            {generationProvider === "anthropic"
              ? generationModelsError
                ? `models unavailable · ${generationModelsError}`
                : synthesisPin && repairPin
                  ? `synth ${synthesisPin.modelId} · repair ${repairPin.modelId}`
                  : "models loading…"
              : "template provider · approved catalog context still required"}
          </div>
          {generationError && (
            <div style={{ color: "#e66", marginTop: 5, wordBreak: "break-word" }}>
              gateway · {generationError}
            </div>
          )}
          {generationLoadMessage && (
            <div
              style={{
                color: generationLoadMessage.startsWith("load failed") ? "#e6a23c" : "#7dd87d",
                marginTop: 5,
                wordBreak: "break-word",
              }}
            >
              {generationLoadMessage}
            </div>
          )}
          {generationStages.length > 0 && (
            <div style={{ marginTop: 5, color: "#7d899b" }}>
              {generationStages.slice(-5).map((stage, index) => (
                <div key={`${String(stage.stage ?? "stage")}-${index}`}>
                  {String(stage.stage ?? "stage")}
                  {typeof stage.verdict === "string" ? ` · ${stage.verdict}` : ""}
                </div>
              ))}
            </div>
          )}
          {generationResult && (
            <div style={{ marginTop: 6 }}>
              <div style={{ color: "#7d899b" }}>
                {generationResult.context.retrievedComponents.length} approved rows ·{" "}
                {generationResult.context.retrievedPatterns.length} patterns · prefix{" "}
                {generationResult.context.promptPrefix.hash.slice(0, 8)}
              </div>
              {generationResult.registeredModel && (
                <div style={{ color: "#7dd87d" }}>model {generationResult.registeredModel.id}</div>
              )}
              {generationResult.blockedReasons.length > 0 && (
                <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                  {generationResult.blockedReasons.map((reason) => (
                    <li key={reason} style={{ color: "#e6a23c" }}>
                      {reason}
                    </li>
                  ))}
                </ul>
              )}
              <GenerationAttemptList attempts={generationResult.attempts} />
            </div>
          )}
        </div>

        <div data-testid="ops-panel" style={{ borderTop: "1px solid #2a2f38", marginTop: 10, paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#8fa3bf", flex: 1 }}>jobs</span>
            <button onClick={() => void refreshJobs()} style={btn}>
              refresh
            </button>
          </div>
          <CapabilitySummary capabilities={jobCapabilities} />
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
            <label style={{ ...btn, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              images
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={scanUploadBusy}
                onChange={(event) => void uploadScanFiles(event.currentTarget.files)}
                style={{ display: "none" }}
              />
            </label>
            <span style={{ color: scanUploadBusy ? "#e6a23c" : "#7d899b", flex: 1 }}>
              {scanUploadBusy ? "uploading" : scanUploadMessage ?? `${scanImageRefs.length} uploaded`}
            </span>
            {scanImageRefs.length > 0 && (
              <button
                onClick={() => {
                  setScanImageRefs([]);
                  setScanUploadMessage(null);
                }}
                style={btn}
              >
                clear
              </button>
            )}
          </div>
          <ConsentPanel
            policies={consentPolicies}
            events={consents}
            userId={me?.user?.id ?? null}
            scanBlobIds={scanImageRefs}
            modelId={activeModelId}
            telemetryId={telemetryLogs[0]?.id ?? null}
            busy={consentBusy}
            message={consentMessage}
            onChange={(purpose, subjectKind, subjectIds, action) =>
              void changeConsent(purpose, subjectKind, subjectIds, action)
            }
            onShareTelemetry={() => void shareFirstTelemetry()}
            onContributePattern={() => void contributeActivePattern()}
            onTrainReuse={() => void trainFromFirstTelemetry()}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
            {[
              ["photoscan.single", "scan"],
              ["photoscan.multiview", "scan x3"],
              ["train.policy", "train"],
              ["train.sysid-fit", "sysid"],
              ["replay.verify", "replay"],
              ["codesign.evaluate", "co-design"],
              ["bridge.config-diff", "config"],
              ["bridge.telemetry-ingest", "telemetry"],
              ["bridge.supervisor-check", "supervise"],
              ["maintenance.estimate-wear", "wear"],
              ["maintenance.crash-forensics", "crash"],
              ["maintenance.repair-sheet", "repair"],
              ["maintenance.fleet-summary", "fleet"],
            ].map(([kind, label]) => (
              <button data-testid={`job-run-${kind}`} key={kind} onClick={() => void runFixtureJob(kind)} style={btn}>
                {label}
              </button>
            ))}
          </div>
          {jobsError && <div style={{ color: "#e6a23c", marginTop: 5 }}>{jobsError}</div>}
          {policyPlaybackMessage && (
            <div data-testid="policy-playback-status" style={{ color: "#7d899b", marginTop: 5 }}>
              {policyPlaybackMessage}
            </div>
          )}
          {jobs.slice(0, 5).map((job) => (
            <div data-testid={`job-row-${job.kind}`} key={job.id} style={{ borderTop: "1px solid #242a33", marginTop: 5, paddingTop: 5 }}>
              <div style={{ color: verdictColor(job.status === "succeeded" ? "admitted" : "draft") }}>
                {job.kind} · {job.status}
              </div>
              <div style={{ color: "#7d899b" }}>{job.provider} · {job.id}</div>
              <JobDetails
                job={job}
                onApplyPatch={(ops) => void applyPatch(ops)}
                onSaveCandidate={(candidate) => void saveCodesignCandidate(candidate)}
                onPlayPolicy={startPolicyPlayback}
              />
            </div>
          ))}
          <ArtifactRegistry
            photoscanArtifacts={photoscanArtifacts}
            policyArtifacts={policyArtifacts}
            replayArtifacts={replayArtifacts}
            telemetryLogs={telemetryLogs}
            maintenanceRecords={maintenanceRecords}
            vendorOffers={vendorOffers}
            printQuotes={printQuotes}
            busy={artifactBusy}
            error={artifactError}
            message={artifactMessage}
            onRefresh={() => void refreshArtifacts()}
            onOpenBlob={(blobId) => void openArtifactBlob(blobId)}
            onAlignPhotoscan={(artifactId, input) => void alignPhotoscanArtifact(artifactId, input)}
            onPlayPolicy={startPolicyPlayback}
          />
          <RecorderArchiveImportPanel
            report={s.report}
            authenticated={me?.authenticated === true}
            activeModelId={activeModelId}
          />
          <DeploymentLadderPanel
            report={s.report}
            activeModelId={activeModelId}
            policyArtifacts={policyArtifacts}
            jobs={jobs}
          />
          <PlatformPanel
            credits={credits}
            courses={courses}
            courseName={courseName}
            courseVisibility={courseVisibility}
            courseEnvJson={courseEnvJson}
            activeCourseId={activeCourseId}
            courseShareUrl={activeCourseId ? courseUrlFor(activeCourseId) : null}
            leaderboardRuns={leaderboardRuns}
            leaderboardArchetypeFilter={leaderboardArchetypeFilter}
            leaderboardClassFilter={leaderboardClassFilter}
            leaderboardStatusFilter={leaderboardStatusFilter}
            listings={listings}
            licenseLedger={licenseLedger}
            platformGates={platformGates}
            vendorOffers={vendorOffers}
            printQuotes={printQuotes}
            classroomAssignments={classroomAssignments}
            activeAssignmentId={activeAssignmentId}
            classroomSubmissions={classroomSubmissions}
            moderationReports={moderationReports}
            busy={platformBusy}
            error={platformError}
            message={platformMessage}
            activeModelId={activeModelId}
            hasSubmissionContract={Boolean(s.contractJson)}
            onRefresh={() => void refreshPlatform()}
            onCourseNameChange={setCourseName}
            onCourseVisibilityChange={setCourseVisibility}
            onCourseEnvJsonChange={setCourseEnvJson}
            onCourseChange={selectCourse}
            onCopyCourseUrl={() => void copyActiveCourseUrl()}
            onLeaderboardArchetypeFilter={setLeaderboardArchetypeFilter}
            onLeaderboardClassFilter={setLeaderboardClassFilter}
            onLeaderboardStatusFilter={setLeaderboardStatusFilter}
            onAssignmentChange={(assignmentId) => {
              setActiveAssignmentId(assignmentId);
              void refreshClassroomSubmissions(assignmentId);
            }}
            onCreateCourse={() => void publishFixtureCourse()}
            onSubmitRun={() => void submitFixtureLeaderboardRun()}
            onCreateListing={() => void submitModelListing()}
            onCreatePolicyListing={() => void submitPolicyListing()}
            onCreateAssignment={() => void publishFixtureAssignment()}
            onSubmitAssignment={() => void submitFixtureAssignment()}
            onReport={() => void reportFixtureModeration()}
            onRefreshVendorLinks={() => void refreshVendorLinks()}
            onRequestPrintQuote={() => void requestPrintQuoteLink()}
            onRecordListingUsage={(listing, event) => void recordMarketplaceUsage(listing, event)}
          />
          <div style={{ borderTop: "1px solid #242a33", marginTop: 6, paddingTop: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "#8fa3bf", flex: 1 }}>Brief-25</span>
              <button onClick={() => void refreshBriefEval()} style={btn}>
                refresh
              </button>
            </div>
            <BriefEvalSummary value={briefEval} />
          </div>
        </div>

        <div data-testid="review-panel" style={{ borderTop: "1px solid #2a2f38", marginTop: 10, paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#8fa3bf", flex: 1 }}>catalog review</span>
            <select
              data-testid="review-status-filter"
              aria-label="catalog review status"
              value={reviewStatus}
              onChange={(e) => setReviewFilter(e.target.value as ReviewStatus)}
              style={selectStyle}
            >
              <option value="needs_review">pending</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
            </select>
            <button onClick={() => void refreshReviews(reviewStatus)} disabled={reviewBusy} style={btn}>
              refresh
            </button>
          </div>
          <div
            style={{
              marginTop: 6,
              maxHeight: 220,
              overflow: "auto",
              scrollbarWidth: "thin",
            }}
          >
            {reviewError ? (
              <div style={{ color: "#e6a23c" }}>gateway · {reviewError}</div>
            ) : reviewBusy && reviews.length === 0 ? (
              <div style={{ color: "#7d899b" }}>loading…</div>
            ) : reviews.length === 0 ? (
              <div style={{ color: "#7d899b" }}>0 rows</div>
            ) : (
              reviews.map((item) => (
                <ReviewItem
                  key={item.id}
                  item={item}
                  busy={reviewBusy}
                  reviewNote={reviewNotes[item.id] ?? ""}
                  exportPolicy={reviewExportPolicies[item.id] ?? defaultReviewExportPolicy(item)}
                  onNoteChange={(value) =>
                    setReviewNotes((current) => ({ ...current, [item.id]: value }))
                  }
                  onExportPolicyChange={(value) =>
                    setReviewExportPolicies((current) => ({ ...current, [item.id]: value }))
                  }
                  onApprove={() => void recordDecision(item.id, "approved")}
                  onReject={() => void recordDecision(item.id, "rejected")}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {hud && (
        <div
          style={{
            ...panel,
            ...(narrow
              ? { top: "calc(42vh + 24px)", left: 12, right: 12 }
              : { top: 12, right: 12, minWidth: 220 }),
          }}
        >
          <div style={{ color: "#8fa3bf", marginBottom: 4 }}>HUD — derived, never decorative</div>
          <Row k="AUW" v={`${hud.auwG.toFixed(0)} g`} />
          {hud.twr !== undefined && <Row k="TWR" v={hud.twr.toFixed(2)} />}
          {hud.hoverThrottle !== undefined && (
            <Row k="hover" v={`${(hud.hoverThrottle * 100).toFixed(0)} %`} />
          )}
          {hud.hoverCurrentA !== undefined && <Row k="I @ hover" v={`${hud.hoverCurrentA.toFixed(1)} A`} />}
          {hud.enduranceMin !== undefined && <Row k="endurance" v={`${hud.enduranceMin.toFixed(1)} min`} />}
          <details style={{ marginTop: 6, color: "#7d899b" }}>
            <summary>assumptions ({hud.assumptions.length})</summary>
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              {hud.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {s.selected && (
        <div style={{ ...panel, top: 220, right: 12, minWidth: 200 }}>
          <div style={{ color: "#8fa3bf" }}>selection</div>
          <Row k="part" v={`#${s.selected.partIndex}`} />
          <Row k="source" v={s.selected.sourcePath} />
          <Row k="node" v={s.selected.node} />
          <Row k="material" v={s.selected.material} />
          <Row k="color" v={s.selected.color} />
          {s.lastDiff && (
            <div style={{ color: "#e6a23c", marginTop: 4 }}>Δ {s.lastDiff}</div>
          )}
          {/* configurator (P1-014): patch → re-bake in place via the handle */}
          <div style={{ color: "#8fa3bf", marginTop: 8 }}>configure (patch + re-bake)</div>
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            {SWATCHES.map((c) => (
              <button
                key={c}
                title={c}
                onClick={() =>
                  void applyPatch([
                    { op: "replace", path: `${s.selected!.sourcePath}/color`, value: c },
                  ])
                }
                style={{
                  width: 28,
                  height: 28,
                  background: c,
                  border: c === s.selected!.color ? "2px solid #fff" : "1px solid #2a2f38",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
          <select
            aria-label="selected part material"
            value={s.selected.material}
            onChange={(e) =>
              void applyPatch([
                { op: "replace", path: `${s.selected!.sourcePath}/material`, value: e.target.value },
              ])
            }
            style={{
              width: "100%",
              marginTop: 6,
              background: "#16181c",
              color: "#cfd6df",
              border: "1px solid #2a2f38",
            }}
          >
            {MATERIAL_CLASSES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}

      {s.report && (
        <div
          data-testid="validator-report"
          data-contract-hash={s.report.contractHash}
          data-model-contract-hash={loadedModelContractHash ?? ""}
          role="status"
          aria-live="polite"
          style={{
            ...panel,
            bottom: 12,
            left: narrow ? 12 : 388,
            right: narrow ? 12 : undefined,
            maxWidth: narrow ? undefined : 460,
            maxHeight: 200,
            overflow: "auto",
          }}
        >
          <div style={{ color: s.report.verdict === "admitted" ? "#7dd87d" : "#e6a23c" }}>
            forge-validate {s.report.validatorVersion} · {s.report.target} → {s.report.verdict.toUpperCase()}
          </div>
          {s.report.results.length === 0 ? (
            <div style={{ color: "#7d899b" }}>0 errors · 0 warnings — gatekeeper clean</div>
          ) : (
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              {[...s.report.results]
                .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1))
                .slice(0, 8)
                .map((d, i) => (
                  <li key={i} style={{ color: d.severity === "error" ? "#e66" : "#e6a23c" }}>
                    {d.check} — {d.message}
                  </li>
                ))}
              {s.report.results.length > 8 && (
                <li style={{ color: "#7d899b" }}>… +{s.report.results.length - 8} more</li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* perf overlay (P1-017): budgets are binding — render ≤ 6 ms · core
          tick ≤ 1.5 ms · ≤ 40 draw calls/model (architecture §7) */}
      <div
        style={{
          ...panel,
          bottom: 12,
          right: 12,
          color: "#7d899b",
          textAlign: "right",
          display: narrow ? "none" : undefined,
        }}
      >
        <div>{s.perf.fps} fps</div>
        <div>render {s.perf.frameMs.toFixed(1)} ms · core {s.perf.coreMs.toFixed(2)} ms</div>
        <div>{s.perf.drawCalls} draw calls</div>
      </div>
      </main>
    </>
  );
}

const btn: React.CSSProperties = {
  background: "#16181c",
  color: "#cfd6df",
  border: "1px solid #2a2f38",
  borderRadius: 4,
  fontSize: 11,
  minHeight: 28,
  padding: "4px 8px",
  cursor: "pointer",
};

const jobDetailStyle: React.CSSProperties = {
  marginTop: 4,
  color: "#cfd6df",
  minWidth: 0,
};

const artifactRowStyle: React.CSSProperties = {
  borderTop: "1px solid #242a33",
  marginTop: 5,
  paddingTop: 5,
  minWidth: 0,
};

const dangerBtn: React.CSSProperties = {
  ...btn,
  color: "#f0b0a8",
};

const linkStyle: React.CSSProperties = {
  color: "#39c8ff",
  textDecoration: "none",
};

const selectStyle: React.CSSProperties = {
  background: "#16181c",
  color: "#cfd6df",
  border: "1px solid #2a2f38",
  borderRadius: 4,
  fontSize: 11,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#16181c",
  color: "#cfd6df",
  border: "1px solid #2a2f38",
  borderRadius: 4,
  fontSize: 11,
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  display: "block",
  marginTop: 6,
  resize: "vertical",
  minHeight: 58,
};

const fieldLabel: React.CSSProperties = {
  display: "block",
  color: "#7d899b",
};

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <span style={{ color: "#7d899b" }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

type GenerationStatus = GenerationResponse["verdict"] | "idle" | "running" | "error";

function GenerationStatusBadge({ status }: { status: GenerationStatus }) {
  return (
    <span
      data-testid="generation-status"
      style={{
        color: verdictColor(status),
        border: `1px solid ${verdictColor(status)}`,
        borderRadius: 4,
        padding: "0 5px",
        fontSize: 10,
        lineHeight: "16px",
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

function GenerationAttemptList({ attempts }: { attempts: GenerationAttempt[] }) {
  if (attempts.length === 0) {
    return <div style={{ color: "#7d899b", marginTop: 4 }}>0 attempts</div>;
  }
  return (
    <div style={{ marginTop: 5, maxHeight: 170, overflow: "auto", scrollbarWidth: "thin" }}>
      {attempts.map((attempt) => {
        const usage = formatUsage(attempt.usage);
        return (
          <details
            key={`${attempt.index}-${attempt.contractHash}`}
            open={attempt.index === attempts.length - 1 || attempt.diagnostics.length > 0}
            style={{ borderTop: "1px solid #242a33", padding: "5px 0" }}
          >
            <summary style={{ color: verdictColor(attempt.verdict), cursor: "pointer" }}>
              #{attempt.index + 1} {attempt.phase} · {attempt.verdict}
            </summary>
            <div style={{ color: "#7d899b", wordBreak: "break-word" }}>
              {attempt.modelId} · {attempt.contractHash.slice(0, 10)}
              {attempt.stopReason ? ` · ${attempt.stopReason}` : ""}
            </div>
            {usage && <div style={{ color: "#7d899b" }}>{usage}</div>}
            {attempt.diagnostics.length === 0 ? (
              <div style={{ color: "#7d899b" }}>0 diagnostics</div>
            ) : (
              <ul style={{ margin: "3px 0 0 16px", padding: 0 }}>
                {attempt.diagnostics.slice(0, 4).map((diagnostic, index) => (
                  <li
                    key={`${diagnostic.check ?? "diagnostic"}-${index}`}
                    style={{ color: diagnostic.severity === "error" ? "#e66" : "#e6a23c" }}
                  >
                    {diagnostic.check ?? "diagnostic"} — {diagnostic.message ?? diagnostic.severity ?? "reported"}
                  </li>
                ))}
                {attempt.diagnostics.length > 4 && (
                  <li style={{ color: "#7d899b" }}>… +{attempt.diagnostics.length - 4} more</li>
                )}
              </ul>
            )}
          </details>
        );
      })}
    </div>
  );
}

function BriefEvalSummary({ value }: { value: unknown | null }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return <div style={{ color: "#7d899b" }}>no stored run</div>;
  }
  const artifact = value as {
    summary?: {
      finalVerdictCounts?: { admitted?: number; draft?: number; rejected?: number; blocked?: number };
      qualityGate?: { pass?: boolean; admittedWithoutHumanRepairActual?: number; admittedWithoutHumanRepairTarget?: number };
    };
    completedAt?: string;
  };
  const counts = artifact.summary?.finalVerdictCounts;
  const gate = artifact.summary?.qualityGate;
  return (
    <div style={{ color: gate?.pass ? "#7dd87d" : "#e6a23c", marginTop: 4 }}>
      {counts
        ? `${counts.admitted ?? 0} admitted · ${counts.draft ?? 0} draft · ${counts.rejected ?? 0} rejected`
        : "stored run"}
      {gate ? ` · gate ${gate.admittedWithoutHumanRepairActual ?? 0}/${gate.admittedWithoutHumanRepairTarget ?? 20}` : ""}
      {artifact.completedAt ? <div style={{ color: "#7d899b" }}>{artifact.completedAt}</div> : null}
    </div>
  );
}

function ConsentPanel({
  policies,
  events,
  userId,
  scanBlobIds,
  modelId,
  telemetryId,
  busy,
  message,
  onChange,
  onShareTelemetry,
  onContributePattern,
  onTrainReuse,
}: {
  policies: ConsentPolicy[];
  events: ConsentEvent[];
  userId: string | null;
  scanBlobIds: string[];
  modelId: string | null;
  telemetryId: string | null;
  busy: boolean;
  message: string | null;
  onChange: (
    purpose: ConsentPurpose,
    subjectKind: ConsentSubjectKind,
    subjectIds: string[],
    action: "grant" | "withdraw",
  ) => void;
  onShareTelemetry: () => void;
  onContributePattern: () => void;
  onTrainReuse: () => void;
}) {
  const targets: Record<ConsentPurpose, string[]> = {
    "photoscan.processing": scanBlobIds,
    "telemetry.sharing": telemetryId ? [telemetryId] : [],
    "pattern.contribution": modelId ? [modelId] : [],
    "leaderboard.publication": userId ? [userId] : [],
    "training.reuse": telemetryId ? [telemetryId] : [],
  };
  const actionFor = (purpose: ConsentPurpose) => {
    if (purpose === "telemetry.sharing") return onShareTelemetry;
    if (purpose === "pattern.contribution") return onContributePattern;
    if (purpose === "training.reuse") return onTrainReuse;
    return null;
  };
  const actionLabel = (purpose: ConsentPurpose) => {
    if (purpose === "telemetry.sharing") return "share log";
    if (purpose === "pattern.contribution") return "contribute";
    if (purpose === "training.reuse") return "train from log";
    return null;
  };
  return (
    <details style={{ ...artifactRowStyle, marginTop: 6 }}>
      <summary style={{ color: "#8fa3bf", cursor: "pointer" }}>privacy authority · {events.filter((event) => event.active).length} active</summary>
      <div style={{ color: "#7d899b", marginTop: 5 }}>
        Each purpose is independent. Granting scan processing never grants sharing, contribution, leaderboard publication, or training reuse.
      </div>
      {policies.map((policy) => {
        const subjectIds = targets[policy.purpose];
        const active = subjectIds.length > 0 && subjectIds.every((subjectId) =>
          events.some((event) => event.purpose === policy.purpose && event.subjectId === subjectId && event.active),
        );
        const action = actionFor(policy.purpose);
        const label = actionLabel(policy.purpose);
        return (
          <div key={policy.purpose} style={{ borderTop: "1px solid #242a33", marginTop: 6, paddingTop: 6 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ color: active ? "#7dd87d" : "#cfd6df", flex: 1 }}>
                {policy.purpose} · {active ? "granted" : "not granted"}
              </span>
              <button
                onClick={() => onChange(policy.purpose, policy.subjectKind, subjectIds, active ? "withdraw" : "grant")}
                disabled={busy || subjectIds.length === 0}
                style={btn}
              >
                {active ? "withdraw" : "grant"}
              </button>
              {active && action && label ? (
                <button onClick={action} disabled={busy} style={btn}>{label}</button>
              ) : null}
            </div>
            <div style={{ color: "#7d899b" }}>
              v{policy.policyVersion} · {subjectIds.length > 0 ? `${subjectIds.length} owned subject${subjectIds.length === 1 ? "" : "s"}` : "no current subject"}
            </div>
            <div style={{ color: "#7d899b" }}>{policy.notice}</div>
          </div>
        );
      })}
      {message ? <div style={{ color: "#8fa3bf", marginTop: 6 }}>{message}</div> : null}
    </details>
  );
}

function ArtifactRegistry({
  photoscanArtifacts,
  policyArtifacts,
  replayArtifacts,
  telemetryLogs,
  maintenanceRecords,
  vendorOffers,
  printQuotes,
  busy,
  error,
  message,
  onRefresh,
  onOpenBlob,
  onAlignPhotoscan,
  onPlayPolicy,
}: {
  photoscanArtifacts: PhotoscanArtifactRecord[];
  policyArtifacts: PolicyArtifactRecord[];
  replayArtifacts: ReplayArtifactRecord[];
  telemetryLogs: TelemetryLogRecord[];
  maintenanceRecords: MaintenanceRecord[];
  vendorOffers: VendorOfferRecord[];
  printQuotes: PrintQuoteRequestRecord[];
  busy: boolean;
  error: string | null;
  message: string | null;
  onRefresh: () => void;
  onOpenBlob: (blobId: string | null) => void;
  onAlignPhotoscan: (artifactId: string, input: PhotoscanAlignmentInput) => void;
  onPlayPolicy: (output: PolicyOutput, artifactId?: string) => void;
}) {
  return (
    <div style={{ borderTop: "1px solid #242a33", marginTop: 6, paddingTop: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: "#8fa3bf", flex: 1 }}>artifacts</span>
        <button onClick={onRefresh} disabled={busy} style={btn}>
          refresh
        </button>
      </div>
      {error ? <div style={{ color: "#e6a23c", marginTop: 4 }}>gateway · {error}</div> : null}
      {message ? <div style={{ color: "#7d899b", marginTop: 4, wordBreak: "break-word" }}>{message}</div> : null}
      {busy &&
      photoscanArtifacts.length === 0 &&
      policyArtifacts.length === 0 &&
      replayArtifacts.length === 0 &&
      telemetryLogs.length === 0 &&
      maintenanceRecords.length === 0 ? (
        <div style={{ color: "#7d899b", marginTop: 4 }}>loading…</div>
      ) : photoscanArtifacts.length === 0 &&
        policyArtifacts.length === 0 &&
        replayArtifacts.length === 0 &&
        telemetryLogs.length === 0 &&
        maintenanceRecords.length === 0 ? (
        <div style={{ color: "#7d899b", marginTop: 4 }}>0 materialized outputs</div>
      ) : null}
      {photoscanArtifacts.slice(0, 3).map((artifact) => (
        <PhotoscanArtifactRow
          key={artifact.id}
          artifact={artifact}
          onOpenBlob={onOpenBlob}
          onAlign={onAlignPhotoscan}
        />
      ))}
      {policyArtifacts.slice(0, 3).map((artifact) => (
        <PolicyArtifactRow
          key={artifact.id}
          artifact={artifact}
          onOpenBlob={onOpenBlob}
          onPlay={onPlayPolicy}
        />
      ))}
      {replayArtifacts.slice(0, 2).map((artifact) => (
        <ReplayArtifactRow key={artifact.id} artifact={artifact} />
      ))}
      {telemetryLogs.slice(0, 2).map((log) => (
        <TelemetryLogRow key={log.id} log={log} />
      ))}
      <MaintenanceDashboard
        records={maintenanceRecords}
        vendorOffers={vendorOffers}
        printQuotes={printQuotes}
      />
      {maintenanceRecords.slice(0, 3).map((record) => (
        <MaintenanceRecordRow key={record.id} record={record} />
      ))}
    </div>
  );
}

function DeploymentLadderPanel({
  report,
  activeModelId,
  policyArtifacts,
  jobs,
}: {
  report: Report | null;
  activeModelId: string | null;
  policyArtifacts: PolicyArtifactRecord[];
  jobs: JobRecord[];
}) {
  const available = desktopDeploymentLadderAvailable();
  const [status, setStatus] = useState<DeploymentLadderStatus | null>(null);
  const [referenceRigId, setReferenceRigId] = useState<(typeof D12_REFERENCE_RIG_IDS)[number]>(
    D12_REFERENCE_RIG_IDS[1],
  );
  const [startConfirmed, setStartConfirmed] = useState(false);
  const [transitionConfirmed, setTransitionConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const policy = policyArtifacts.find((candidate) =>
    candidate.modelId === activeModelId && candidate.exportGate === "exportable",
  ) ?? null;
  const supervisorJob = jobs.find((candidate) =>
    candidate.kind === "bridge.supervisor-check"
    && candidate.status === "succeeded"
    && isPassingSupervisorDecision(candidate.output),
  ) ?? null;

  const refresh = useCallback(async () => {
    if (!available) return;
    setBusy(true);
    setError(null);
    try {
      const next = await getDeploymentLadderStatus();
      setStatus(next);
      if (next.referenceRigId === D12_REFERENCE_RIG_IDS[0]
        || next.referenceRigId === D12_REFERENCE_RIG_IDS[1]) {
        setReferenceRigId(next.referenceRigId);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [available]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!report || report.verdict !== "admitted"
        || !/^[0-9a-f]{64}$/.test(report.contractHash)
        || !/^[0-9a-f]{64}$/.test(report.lockfileHash)) {
        throw new Error("an active admitted report with exact contract and lockfile hashes is required");
      }
      if (!activeModelId) throw new Error("select the admitted model for this ladder rehearsal");
      if (!policy) throw new Error("an exportable policy artifact bound to the selected model is required");
      if (!supervisorJob) throw new Error("run one passing D9-bound supervisor check first");
      if (!startConfirmed) throw new Error("acknowledge the exact rehearsal-only start statement");
      const next = await startDeploymentLadder({
        sessionId: `ladder-${Date.now()}`,
        referenceRigId,
        modelId: activeModelId,
        contractHash: report.contractHash,
        lockfileHash: report.lockfileHash,
        policyArtifactId: policy.id,
        policyExportGate: "exportable",
        supervisorJobId: supervisorJob.id,
        supervisorDecision: "policy-advisory",
        supervisorAllowPolicy: true,
        policyRateHz: DEPLOYMENT_LADDER_POLICY_RATE_HZ,
        supervisorRateHz: DEPLOYMENT_LADDER_SUPERVISOR_RATE_HZ,
        firmwareRateLoopUntouched: true,
        missedInferenceFallback: DEPLOYMENT_LADDER_FALLBACK,
        physicalConfirmation: DEPLOYMENT_LADDER_START_CONFIRMATION,
      });
      setStatus(next);
      setStartConfirmed(false);
      setMessage("SITL rehearsal acknowledged; hardware execution and deployment evidence remain locked");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [activeModelId, policy, referenceRigId, report, startConfirmed, supervisorJob]);

  const advance = useCallback(async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!status || status.state === "inactive" || status.sessionId === null
        || status.currentStage === null || status.nextStage === null || status.nextStage === "sitl") {
        throw new Error("no advanceable ladder rehearsal is active");
      }
      if (!transitionConfirmed) {
        throw new Error(`complete the exact ${status.nextStage} physical-confirmation interaction`);
      }
      const next = await advanceDeploymentLadder(status, {
        sessionId: status.sessionId,
        fromStage: status.currentStage,
        toStage: status.nextStage,
        physicalConfirmation: confirmationForStage(status.nextStage),
      });
      setStatus(next);
      setTransitionConfirmed(false);
      setMessage(
        `${next.currentStage ?? "next"} rehearsal acknowledged; this is not deployment or physical-evidence verification`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [status, transitionConfirmed]);

  const reset = useCallback(async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!status) throw new Error("no ladder rehearsal is available to end");
      setStatus(await resetDeploymentLadder(status));
      setTransitionConfirmed(false);
      setMessage("ladder rehearsal ended; no hardware authority was granted");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [status]);

  const inactive = status?.state === "inactive";
  const reportReady = report?.verdict === "admitted"
    && /^[0-9a-f]{64}$/.test(report.contractHash)
    && /^[0-9a-f]{64}$/.test(report.lockfileHash);
  const canStart = available && inactive === true && reportReady && activeModelId !== null
    && policy !== null && supervisorJob !== null && startConfirmed && !busy;
  const canAdvance = available && status?.state === "rehearsing" && status.nextStage !== null
    && status.nextStage !== "sitl" && transitionConfirmed && !busy;

  return (
    <details style={{ borderTop: "1px solid #242a33", marginTop: 6, paddingTop: 6 }}>
      <summary style={{ color: "#8fa3bf", cursor: "pointer" }}>Deployment ladder · rehearsal only</summary>
      <div style={{ color: "#7d899b", marginTop: 5 }}>
        SITL → HITL → constrained → free is shell-owned and cannot be skipped. This local UX
        rehearsal issues no hardware command, verifies no physical evidence, never auto-arms, and
        cannot authorize deployment or external beta.
      </div>
      <div data-testid="deployment-ladder-rates" style={{ color: "#7d899b", marginTop: 5 }}>
        policy advisory {DEPLOYMENT_LADDER_POLICY_RATE_HZ} Hz · supervisor authority {DEPLOYMENT_LADDER_SUPERVISOR_RATE_HZ} Hz ·
        FC rate loop untouched · missed inference → {DEPLOYMENT_LADDER_FALLBACK}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 5, marginTop: 7 }}>
        {DEPLOYMENT_LADDER_STAGES.map((stage) => {
          const acknowledged = status?.acknowledgedStages.includes(stage.id) === true;
          const current = status?.currentStage === stage.id;
          return (
            <div
              data-testid={`deployment-ladder-stage-${stage.id}`}
              key={stage.id}
              style={{ border: `1px solid ${current ? "#74c69d" : "#2a2f38"}`, padding: 6 }}
            >
              <div style={{ color: current ? "#74c69d" : acknowledged ? "#8fa3bf" : "#7d899b" }}>
                {stage.label} · {current ? "current rehearsal" : acknowledged ? "acknowledged" : "locked"}
              </div>
              <div style={{ color: "#687789", marginTop: 3 }}>{stage.requires.join(" · ")}</div>
            </div>
          );
        })}
      </div>
      <div data-testid="deployment-ladder-authority" style={{ color: "#e6a23c", marginTop: 6 }}>
        local UX rehearsal · deployment evidence off · physical-evidence verification off · hardware execution locked
      </div>
      {!available ? (
        <div style={{ color: "#e6a23c", marginTop: 5 }}>
          FORGE Desktop is required for shell-owned rehearsal state; browser hardware transitions remain locked.
        </div>
      ) : (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button data-testid="deployment-ladder-refresh" onClick={() => void refresh()} disabled={busy} style={btn}>
              {busy ? "checking…" : "refresh"}
            </button>
            <span data-testid="deployment-ladder-status" style={{ color: "#7d899b" }}>
              {status?.state ?? "unavailable"}{status?.currentStage ? ` · ${status.currentStage}` : ""}
            </span>
          </div>
          {inactive ? (
            <>
              <select
                data-testid="deployment-ladder-rig"
                aria-label="deployment ladder reference rig"
                value={referenceRigId}
                onChange={(event) => setReferenceRigId(event.currentTarget.value as (typeof D12_REFERENCE_RIG_IDS)[number])}
                disabled={busy}
                style={{ ...inputStyle, marginTop: 6 }}
              >
                {D12_REFERENCE_RIG_IDS.map((rig) => <option key={rig} value={rig}>{rig}</option>)}
              </select>
              <label style={{ display: "block", color: "#7d899b", marginTop: 6 }}>
                <input
                  data-testid="deployment-ladder-start-confirmation"
                  type="checkbox"
                  checked={startConfirmed}
                  onChange={(event) => setStartConfirmed(event.currentTarget.checked)}
                />{" "}{DEPLOYMENT_LADDER_START_CONFIRMATION}
              </label>
              <div style={{ color: policy && supervisorJob && reportReady ? "#7d899b" : "#e6a23c", marginTop: 5 }}>
                {reportReady ? "admitted report" : "admitted report missing"} · {policy ? `exportable policy ${policy.id}` : "exportable policy missing"} ·
                {supervisorJob ? ` passing supervisor ${supervisorJob.id}` : " passing supervisor missing"}
              </div>
              <button data-testid="deployment-ladder-start" onClick={() => void start()} disabled={!canStart} style={{ ...btn, marginTop: 6 }}>
                acknowledge SITL rehearsal
              </button>
            </>
          ) : status ? (
            <>
              {status.nextStage && status.nextStage !== "sitl" ? (
                <label style={{ display: "block", color: "#7d899b", marginTop: 6 }}>
                  <input
                    data-testid="deployment-ladder-transition-confirmation"
                    type="checkbox"
                    checked={transitionConfirmed}
                    onChange={(event) => setTransitionConfirmed(event.currentTarget.checked)}
                  />{" "}{confirmationForStage(status.nextStage)}
                </label>
              ) : null}
              {status.state === "rehearsing" ? (
                <button data-testid="deployment-ladder-advance" onClick={() => void advance()} disabled={!canAdvance} style={{ ...btn, marginTop: 6 }}>
                  rehearse transition to {status.nextStage}
                </button>
              ) : null}
              <button data-testid="deployment-ladder-reset" onClick={() => void reset()} disabled={busy} style={{ ...btn, marginTop: 6, marginLeft: 6 }}>
                end rehearsal
              </button>
            </>
          ) : null}
        </div>
      )}
      {error ? <div data-testid="deployment-ladder-error" style={{ color: "#e6a23c", marginTop: 5 }}>{error}</div> : null}
      {message ? <div data-testid="deployment-ladder-message" style={{ color: "#7d899b", marginTop: 5 }}>{message}</div> : null}
    </details>
  );
}

function RecorderArchiveImportPanel({
  report,
  authenticated,
  activeModelId,
}: {
  report: Report | null;
  authenticated: boolean;
  activeModelId: string | null;
}) {
  const available = desktopRecorderAvailable();
  const [bridgeStatus, setBridgeStatus] = useState<DesktopBridgeStatus | null>(null);
  const [serialPorts, setSerialPorts] = useState<DesktopSerialPort[]>([]);
  const [recorderStatus, setRecorderStatus] = useState<RecorderControlStatus | null>(null);
  const [artifactId, setArtifactId] = useState(() => `recorder-${Date.now()}`);
  const [outputDir, setOutputDir] = useState("");
  const [sampleRateHz, setSampleRateHz] = useState("120");
  const [referenceRigId, setReferenceRigId] = useState<(typeof D12_REFERENCE_RIG_IDS)[number]>(
    D12_REFERENCE_RIG_IDS[1],
  );
  const [port, setPort] = useState("");
  const [captureConsent, setCaptureConsent] = useState(false);
  const [custodyEnabled, setCustodyEnabled] = useState(false);
  const [custodyIdentityPort, setCustodyIdentityPort] = useState("");
  const [custodyAuthorizationPath, setCustodyAuthorizationPath] = useState("");
  const [custodyProofPath, setCustodyProofPath] = useState("");
  const [custodyAuthorizationId, setCustodyAuthorizationId] = useState("");
  const [custodyStartPropsOff, setCustodyStartPropsOff] = useState(false);
  const [custodyStopPropsOff, setCustodyStopPropsOff] = useState(false);
  const [custodyProof, setCustodyProof] = useState<RecorderCustodyProof | null>(null);
  const [adapterPropsOff, setAdapterPropsOff] = useState(false);
  const [adapterProbe, setAdapterProbe] = useState<RecorderAdapterProbe | null>(null);
  const [adapterProbeBusy, setAdapterProbeBusy] = useState(false);
  const [adapterProbeError, setAdapterProbeError] = useState<string | null>(null);
  const [controlBusy, setControlBusy] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);
  const [controlMessage, setControlMessage] = useState<string | null>(null);
  const [stopReceipt, setStopReceipt] = useState<RecorderStopReceipt | null>(null);
  const [archivePath, setArchivePath] = useState("");
  const [inspection, setInspection] = useState<RecorderArchiveInspection | null>(null);
  const [inspectionBusy, setInspectionBusy] = useState(false);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [materializationBusy, setMaterializationBusy] = useState(false);
  const [materializationError, setMaterializationError] = useState<string | null>(null);
  const [uploadReceipt, setUploadReceipt] = useState<RecorderUploadReceipt | null>(null);
  const [materialization, setMaterialization] = useState<RecorderArchiveMaterialization | null>(null);
  const [admissionBusy, setAdmissionBusy] = useState(false);
  const [admissionError, setAdmissionError] = useState<string | null>(null);
  const [admission, setAdmission] = useState<RecorderArchiveAdmission | null>(null);

  const refreshControls = useCallback(async () => {
    if (!available) return;
    setControlBusy(true);
    setControlError(null);
    try {
      const [bridge, status] = await Promise.all([
        getDesktopBridgeStatus(),
        getRecorderStatus(),
      ]);
      const ports = bridge.enabled ? await listDesktopSerialPorts() : [];
      setBridgeStatus(bridge);
      setRecorderStatus(status);
      setSerialPorts(ports);
      if (status.state !== "inactive") {
        setArtifactId(status.artifactId ?? "");
        setOutputDir(status.archivePath ?? "");
        if (status.referenceRigId) setReferenceRigId(status.referenceRigId);
        if (status.sampleRateHz !== null) setSampleRateHz(String(status.sampleRateHz));
      }
      setPort((current) => ports.some((candidate) => candidate.name === current)
        ? current
        : ports[0]?.name ?? "");
      setCustodyIdentityPort((current) => ports.some((candidate) => candidate.name === current)
        ? current
        : ports[1]?.name ?? ports[0]?.name ?? "");
    } catch (cause) {
      setControlError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setControlBusy(false);
    }
  }, [available]);

  useEffect(() => {
    void refreshControls();
  }, [refreshControls]);

  useEffect(() => {
    setAdapterProbe(null);
    setAdapterProbeError(null);
    setAdapterPropsOff(false);
  }, [port, referenceRigId]);

  useEffect(() => {
    if (custodyIdentityPort === port) {
      setCustodyIdentityPort(serialPorts.find((candidate) => candidate.name !== port)?.name ?? "");
    }
    setCustodyStartPropsOff(false);
  }, [custodyIdentityPort, port, serialPorts]);

  useEffect(() => {
    if (recorderStatus?.state !== "inactive" || bridgeStatus?.enabled !== true) {
      setAdapterProbe(null);
      setAdapterProbeError(null);
      setAdapterPropsOff(false);
    }
  }, [bridgeStatus?.enabled, recorderStatus?.state]);

  const probeAdapter = useCallback(async () => {
    setAdapterProbeBusy(true);
    setAdapterProbeError(null);
    setAdapterProbe(null);
    try {
      if (referenceRigId !== D12_REFERENCE_RIG_IDS[0]) {
        throw new Error("Betaflight MSP adapter v1 is limited to the D12 reference quad");
      }
      const probe = await probeDesktopRecorderAdapter({
        port,
        baud: RECORDER_BAUD,
        referenceRigId,
        physicalConfirmation: RECORDER_ADAPTER_PROBE_CONFIRMATION,
      });
      setAdapterProbe(probe);
      setAdapterPropsOff(false);
    } catch (cause) {
      setAdapterProbeError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAdapterProbeBusy(false);
    }
  }, [port, referenceRigId]);

  const startRecorder = useCallback(async () => {
    setControlBusy(true);
    setControlError(null);
    setControlMessage(null);
    setStopReceipt(null);
    setCustodyProof(null);
    try {
      if (!report || report.verdict !== "admitted") {
        throw new Error("an active admitted validator report is required before recording");
      }
      if (custodyEnabled && !custodyStartPropsOff) {
        throw new Error("confirm props-off custody start before opening the identity port");
      }
      const recorderRequest = {
        artifactId,
        outputDir,
        sampleRateHz: Number(sampleRateHz),
        referenceRigId,
        physicalConfirmation: RECORDER_PHYSICAL_CONFIRMATION,
        port,
        baud: RECORDER_BAUD,
        contractHash: report.contractHash,
        lockfileHash: report.lockfileHash,
        environment: {},
        seed: report.seed,
      } as const;
      const status = custodyEnabled
        ? await startDesktopCustodiedRecorder({
          recorder: recorderRequest,
          modelId: activeModelId ?? "",
          identityPort: custodyIdentityPort,
          identityBaud: RECORDER_BAUD,
          identityPhysicalConfirmation: RECORDER_ADAPTER_PROBE_CONFIRMATION,
          authorizationPath: custodyAuthorizationPath,
          custodyProofPath,
        })
        : await startDesktopRecorder(recorderRequest);
      setRecorderStatus(status);
      setCaptureConsent(false);
      setCustodyStartPropsOff(false);
      setControlMessage(
        `${custodyEnabled ? "signed custody active for" : "recording"} ${status.artifactId ?? artifactId} into ${status.archivePath ?? outputDir}`,
      );
    } catch (cause) {
      setControlError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setControlBusy(false);
    }
  }, [
    activeModelId,
    artifactId,
    custodyAuthorizationPath,
    custodyEnabled,
    custodyIdentityPort,
    custodyProofPath,
    custodyStartPropsOff,
    outputDir,
    port,
    referenceRigId,
    report,
    sampleRateHz,
  ]);

  const stopRecorder = useCallback(async () => {
    setControlBusy(true);
    setControlError(null);
    setControlMessage(null);
    try {
      if (!recorderStatus || recorderStatus.state === "inactive") {
        throw new Error("no active Desktop recorder is available to stop");
      }
      if (custodyEnabled) {
        if (!custodyStopPropsOff) {
          throw new Error("confirm props-off custody stop before the post-capture identity probe");
        }
        if (!activeModelId) throw new Error("select the signed admitted model before custody stop");
        const proof = await stopDesktopCustodiedRecorder(
          recorderStatus,
          activeModelId,
          {
            authorizationId: custodyAuthorizationId.trim(),
            physicalConfirmation: RECORDER_ADAPTER_PROBE_CONFIRMATION,
          },
        );
        setCustodyProof(proof);
        setCustodyStopPropsOff(false);
        setControlMessage(
          `custody continuity verified for ${proof.artifactId}; acceptance-authority signature only, recorded-device authority remains off`,
        );
      } else {
        const receipt = await stopDesktopRecorder(recorderStatus);
        setStopReceipt(receipt);
        setControlMessage(`capture complete: ${receipt.frameCount} frames over ${receipt.durationS.toFixed(3)} s`);
      }
      setRecorderStatus(await getRecorderStatus());
      setArchivePath(outputDir);
    } catch (cause) {
      setControlError(cause instanceof Error ? cause.message : String(cause));
      try {
        setRecorderStatus(await getRecorderStatus());
      } catch {
        setRecorderStatus(null);
      }
    } finally {
      setControlBusy(false);
    }
  }, [
    activeModelId,
    custodyAuthorizationId,
    custodyEnabled,
    custodyStopPropsOff,
    outputDir,
    recorderStatus,
  ]);

  const inspectArchive = useCallback(async () => {
    setInspectionBusy(true);
    setInspectionError(null);
    setInspection(null);
    setMaterialization(null);
    setAdmission(null);
    setAdmissionError(null);
    setUploadReceipt(null);
    try {
      const verified = await inspectRecorderArchive(archivePath);
      setInspection(verified);
      setArchivePath(verified.archivePath);
    } catch (cause) {
      setInspectionError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setInspectionBusy(false);
    }
  }, [archivePath]);

  const materializeArchive = useCallback(async () => {
    setMaterializationBusy(true);
    setMaterializationError(null);
    setMaterialization(null);
    setAdmission(null);
    setAdmissionError(null);
    setUploadReceipt(null);
    try {
      if (!inspection || inspection.archivePath !== archivePath.trim()) {
        throw new Error("verify the selected recorder archive before materialization");
      }
      if (!authenticated) throw new Error("sign in before materializing a private recorder archive");
      const plan = await prepareRecorderArchiveUpload(archivePath);
      if (plan.artifactId !== inspection.artifactId
        || plan.contractHash !== inspection.contractHash
        || plan.lockfileHash !== inspection.lockfileHash
        || plan.sourcePortSha256 !== inspection.sourcePortSha256
        || plan.frameCount !== inspection.frameCount) {
        throw new Error("recorder upload plan changed after archive inspection");
      }
      const staged = await stageRecorderArchive(plan);
      const receipt = await uploadRecorderArchiveFiles(
        archivePath,
        plan,
        staged.uploads.map(({ name, blob, upload }) => ({
          name,
          method: upload.method as "PUT",
          url: upload.url,
          headers: upload.headers,
          byteSize: blob.byteSize ?? 0,
          sha256: blob.sha256 ?? "",
        })),
      );
      setUploadReceipt(receipt);
      setMaterialization(await completeRecorderArchive(staged.materialization.id));
    } catch (cause) {
      setMaterializationError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setMaterializationBusy(false);
    }
  }, [archivePath, authenticated, inspection]);

  const admitArchive = useCallback(async () => {
    setAdmissionBusy(true);
    setAdmissionError(null);
    setAdmission(null);
    try {
      if (!materialization || materialization.status !== "materialized") {
        throw new Error("materialize and verify the five private objects before telemetry admission");
      }
      if (!activeModelId) throw new Error("select the admitted model bound to this recorder archive");
      setAdmission(await admitRecorderArchive(materialization, activeModelId));
    } catch (cause) {
      setAdmissionError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAdmissionBusy(false);
    }
  }, [activeModelId, materialization]);

  const reportReady = report?.verdict === "admitted"
    && /^[0-9a-f]{64}$/.test(report.contractHash)
    && /^[0-9a-f]{64}$/.test(report.lockfileHash)
    && Number.isSafeInteger(report.seed)
    && report.seed >= 0;
  const recorderInactive = recorderStatus?.state === "inactive";
  const custodyStartReady = !custodyEnabled || (
    referenceRigId === D12_REFERENCE_RIG_IDS[0]
    && activeModelId !== null
    && serialPorts.some((candidate) => candidate.name === custodyIdentityPort)
    && custodyIdentityPort !== port
    && custodyAuthorizationPath.trim().length > 0
    && custodyProofPath.trim().length > 0
    && /^[A-Za-z0-9._-]{1,128}$/.test(custodyAuthorizationId.trim())
    && custodyStartPropsOff
  );
  const canStart = available
    && bridgeStatus?.enabled === true
    && recorderInactive
    && !adapterProbeBusy
    && reportReady
    && serialPorts.some((candidate) => candidate.name === port)
    && artifactId.trim().length > 0
    && outputDir.trim().length > 0
    && captureConsent
    && custodyStartReady;
  const canStop = available && recorderStatus !== null && recorderStatus.state !== "inactive"
    && (!custodyEnabled || (
      custodyStopPropsOff
      && activeModelId !== null
      && /^[A-Za-z0-9._-]{1,128}$/.test(custodyAuthorizationId.trim())
    ));
  const canProbeAdapter = available
    && bridgeStatus?.enabled === true
    && recorderInactive
    && referenceRigId === D12_REFERENCE_RIG_IDS[0]
    && serialPorts.some((candidate) => candidate.name === port)
    && adapterPropsOff
    && !controlBusy
    && !adapterProbeBusy;
  const canMaterialize = available && authenticated && inspection !== null
    && inspection.archivePath === archivePath.trim() && !inspectionBusy && !materializationBusy;
  const canAdmit = authenticated && activeModelId !== null && materialization?.status === "materialized"
    && materialization.gatewayObjectIntegrityVerified && !admissionBusy && admission === null;

  return (
    <details style={{ borderTop: "1px solid #242a33", marginTop: 6, paddingTop: 6 }}>
      <summary style={{ color: "#8fa3bf", cursor: "pointer" }}>Desktop recorder controls & archive import</summary>
      <div style={{ color: "#7d899b", marginTop: 5 }}>
        Shell-owned capture continues while the webview is inactive. It requires D12 lab gates,
        one OS-enumerated 115200-baud port, an admitted contract, and per-log consent. No auto-arm,
        device identity, field, sharing, or training authority is granted.
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
        <button
          data-testid="recorder-control-refresh"
          onClick={() => void refreshControls()}
          disabled={!available || controlBusy}
          style={btn}
        >
          {controlBusy ? "checking…" : "refresh status"}
        </button>
        <span data-testid="recorder-control-status" style={{ color: recorderStatus?.state === "recording" ? "#74c69d" : "#7d899b" }}>
          {recorderStatus?.state ?? "unavailable"}
        </span>
      </div>
      {bridgeStatus ? (
        <div style={{ color: bridgeStatus.enabled ? "#74c69d" : "#e6a23c", marginTop: 5 }}>
          hardware bridge {bridgeStatus.enabled ? "enabled" : "disabled"} · {bridgeStatus.reason} · no auto-arm
        </div>
      ) : null}
      {recorderStatus?.state === "finished" ? (
        <div style={{ color: "#e6a23c", marginTop: 5 }}>
          The recorder thread ended. Stop to collect its receipt or fail-closed error before starting another capture.
        </div>
      ) : null}
      {recorderStatus?.state !== "inactive" && recorderStatus ? (
        <div style={{ color: "#7d899b", marginTop: 5, wordBreak: "break-word" }}>
          {recorderStatus.artifactId} · {recorderStatus.referenceRigId} · {recorderStatus.sampleRateHz} Hz ·
          contract {recorderStatus.contractHash} · private · training reuse off · device and field verification off
        </div>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 6, marginTop: 6 }}>
        <input
          aria-label="Recorder artifact ID"
          value={artifactId}
          onChange={(event) => setArtifactId(event.currentTarget.value)}
          disabled={!available || controlBusy || adapterProbeBusy || !recorderInactive}
          style={inputStyle}
        />
        <input
          aria-label="Recorder output directory"
          value={outputDir}
          onChange={(event) => setOutputDir(event.currentTarget.value)}
          placeholder="/absolute/new/archive-path"
          disabled={!available || controlBusy || !recorderInactive}
          style={inputStyle}
        />
        <select
          aria-label="Recorder reference rig"
          value={referenceRigId}
          onChange={(event) => {
            const selected = event.currentTarget.value;
            if ((D12_REFERENCE_RIG_IDS as readonly string[]).includes(selected)) {
              setReferenceRigId(selected as (typeof D12_REFERENCE_RIG_IDS)[number]);
            }
          }}
          disabled={!available || controlBusy || adapterProbeBusy || !recorderInactive}
          style={selectStyle}
        >
          {D12_REFERENCE_RIG_IDS.map((rigId) => <option key={rigId} value={rigId}>{rigId}</option>)}
        </select>
        <select
          aria-label="Recorder serial port"
          value={port}
          onChange={(event) => setPort(event.currentTarget.value)}
          disabled={!available || controlBusy || adapterProbeBusy || !recorderInactive || !bridgeStatus?.enabled}
          style={selectStyle}
        >
          <option value="">select OS-enumerated port</option>
          {serialPorts.map((candidate) => (
            <option key={candidate.name} value={candidate.name}>{candidate.name} · {candidate.kind}</option>
          ))}
        </select>
        <input
          aria-label="Recorder sample rate in hertz"
          type="number"
          min={1}
          max={1_000}
          step={1}
          value={sampleRateHz}
          onChange={(event) => setSampleRateHz(event.currentTarget.value)}
          disabled={!available || controlBusy || !recorderInactive}
          style={inputStyle}
        />
        <div style={{ color: reportReady ? "#74c69d" : "#e6a23c", alignSelf: "center", wordBreak: "break-word" }}>
          {reportReady
            ? `admitted contract ${report?.contractHash.slice(0, 12)}… · seed ${report?.seed}`
            : "load an admitted contract with current lockfile evidence"}
        </div>
      </div>
      <label style={{ display: "flex", gap: 6, alignItems: "flex-start", color: "#c5ccd6", marginTop: 7 }}>
        <input
          type="checkbox"
          checked={adapterPropsOff}
          onChange={(event) => setAdapterPropsOff(event.currentTarget.checked)}
          disabled={!available || controlBusy || adapterProbeBusy || !recorderInactive}
        />
        <span>
          I confirm propellers are removed for a read-only Betaflight MSP identity probe. This observes a stable
          protocol/board/hashed UID only; it is not cryptographic device attestation or archive provenance.
        </span>
      </label>
      <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
        <button
          data-testid="recorder-adapter-probe"
          onClick={() => void probeAdapter()}
          disabled={!canProbeAdapter}
          style={btn}
        >
          {adapterProbeBusy ? "probing…" : "probe read-only adapter"}
        </button>
        <span style={{ color: referenceRigId === D12_REFERENCE_RIG_IDS[0] ? "#7d899b" : "#e6a23c" }}>
          {referenceRigId === D12_REFERENCE_RIG_IDS[0]
            ? "requires Betaflight 2025.12 / MSP API 1.47 / KAKUTEH7"
            : "select the D12 reference quad for MSP adapter v1"}
        </span>
      </div>
      {adapterProbeError ? (
        <div data-testid="recorder-adapter-probe-error" style={{ color: "#e6a23c", marginTop: 5 }}>
          {adapterProbeError}
        </div>
      ) : null}
      {adapterProbe ? (
        <div data-testid="recorder-adapter-probe-result" style={{ color: "#7d899b", marginTop: 5, wordBreak: "break-word" }}>
          read-only protocol verified · {adapterProbe.firmwareVersion} · {adapterProbe.targetName}/
          {adapterProbe.boardIdentifier} · stable hashed UID {adapterProbe.deviceUidSha256} · transcript
          {" "}{adapterProbe.transcriptSha256} · cryptographic attestation off · recorded-device off · field off
        </div>
      ) : null}
      <label style={{ display: "flex", gap: 6, alignItems: "flex-start", color: "#c5ccd6", marginTop: 8 }}>
        <input
          data-testid="recorder-custody-enabled"
          type="checkbox"
          checked={custodyEnabled}
          onChange={(event) => {
            setCustodyEnabled(event.currentTarget.checked);
            setCustodyProof(null);
            if (event.currentTarget.checked && recorderInactive) {
              setReferenceRigId(D12_REFERENCE_RIG_IDS[0]);
            }
          }}
          disabled={!available || controlBusy}
        />
        <span>
          Signed controlled-lab custody. The deployment trust root and protected revision stay native;
          Studio receives hashes and continuity only, never a signing key or raw signature.
        </span>
      </label>
      {custodyEnabled ? (
        <div data-testid="recorder-custody-controls" style={{ border: "1px solid #2a2f38", padding: 7, marginTop: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 6 }}>
            <select
              aria-label="Recorder custody identity port"
              value={custodyIdentityPort}
              onChange={(event) => setCustodyIdentityPort(event.currentTarget.value)}
              disabled={!available || controlBusy || adapterProbeBusy || !bridgeStatus?.enabled}
              style={selectStyle}
            >
              <option value="">select distinct identity port</option>
              {serialPorts.map((candidate) => (
                <option key={candidate.name} value={candidate.name}>{candidate.name} · {candidate.kind}</option>
              ))}
            </select>
            <input
              aria-label="Recorder custody authorization path"
              value={custodyAuthorizationPath}
              onChange={(event) => setCustodyAuthorizationPath(event.currentTarget.value)}
              placeholder="/absolute/path/authorization.json"
              disabled={!available || controlBusy}
              style={inputStyle}
            />
            <input
              aria-label="Recorder custody proof path"
              value={custodyProofPath}
              onChange={(event) => setCustodyProofPath(event.currentTarget.value)}
              placeholder="/absolute/path/outside-archive/proof.json"
              disabled={!available || controlBusy}
              style={inputStyle}
            />
            <input
              aria-label="Recorder custody authorization ID"
              value={custodyAuthorizationId}
              onChange={(event) => setCustodyAuthorizationId(event.currentTarget.value)}
              placeholder="signed authorization ID"
              disabled={!available || controlBusy}
              style={inputStyle}
            />
          </div>
          {recorderInactive ? (
            <label style={{ display: "flex", gap: 6, alignItems: "flex-start", color: "#c5ccd6", marginTop: 7 }}>
              <input
                type="checkbox"
                checked={custodyStartPropsOff}
                onChange={(event) => setCustodyStartPropsOff(event.currentTarget.checked)}
                disabled={!available || controlBusy}
              />
              <span>Props are removed for the signed start identity observation before telemetry opens.</span>
            </label>
          ) : (
            <label style={{ display: "flex", gap: 6, alignItems: "flex-start", color: "#c5ccd6", marginTop: 7 }}>
              <input
                type="checkbox"
                checked={custodyStopPropsOff}
                onChange={(event) => setCustodyStopPropsOff(event.currentTarget.checked)}
                disabled={!available || controlBusy}
              />
              <span>Props are removed for the post-clean-stop identity observation and create-new proof.</span>
            </label>
          )}
          <div style={{ color: activeModelId ? "#7d899b" : "#e6a23c", marginTop: 5, wordBreak: "break-word" }}>
            {activeModelId
              ? `signed model binding ${activeModelId} · acceptance authority, not device signature`
              : "select the exact admitted model required by the signed authorization"}
          </div>
        </div>
      ) : null}
      <label style={{ display: "flex", gap: 6, alignItems: "flex-start", color: "#c5ccd6", marginTop: 7 }}>
        <input
          type="checkbox"
          checked={captureConsent}
          onChange={(event) => setCaptureConsent(event.currentTarget.checked)}
          disabled={!available || controlBusy || !recorderInactive}
        />
        <span>I consent to record this telemetry log. This grants local capture only, not sharing or training reuse.</span>
      </label>
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button
          data-testid="recorder-control-start"
          onClick={() => void startRecorder()}
          disabled={!canStart || controlBusy}
          style={btn}
        >
          {custodyEnabled ? "start signed custody capture" : "start recording"}
        </button>
        <button
          data-testid="recorder-control-stop"
          onClick={() => void stopRecorder()}
          disabled={!canStop || controlBusy}
          style={btn}
        >
          {custodyEnabled ? "stop, verify & write custody proof" : "stop & finalize"}
        </button>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <input
          aria-label="Recorder archive path"
          value={archivePath}
          onChange={(event) => setArchivePath(event.currentTarget.value)}
          placeholder="/absolute/path/to/recorder-archive"
          disabled={!available || inspectionBusy}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          data-testid="recorder-archive-inspect"
          onClick={() => void inspectArchive()}
          disabled={!available || inspectionBusy || archivePath.trim().length === 0}
          style={btn}
        >
          {inspectionBusy ? "verifying…" : "verify archive"}
        </button>
      </div>
      {!available ? (
        <div style={{ color: "#7d899b", marginTop: 5 }}>
          Open this workspace in FORGE Desktop to control recording or inspect a filesystem archive.
        </div>
      ) : null}
      {controlError ? <div style={{ color: "#e6a23c", marginTop: 5 }}>{controlError}</div> : null}
      {controlMessage ? <div style={{ color: "#74c69d", marginTop: 5, wordBreak: "break-word" }}>{controlMessage}</div> : null}
      {stopReceipt ? (
        <div data-testid="recorder-stop-receipt" style={{ color: "#7d899b", marginTop: 5, wordBreak: "break-word" }}>
          receipt {stopReceipt.schemaVersion} · replay {stopReceipt.replayFileSha256} · private · training reuse off · device attestation off
        </div>
      ) : null}
      {custodyProof ? (
        <div data-testid="recorder-custody-proof" style={{ color: "#74c69d", marginTop: 5, wordBreak: "break-word" }}>
          custody {custodyProof.schemaVersion} · authorization {custodyProof.authorizationId} · trust bundle
          {" "}{custodyProof.trustBundleSha256} · authorization bytes {custodyProof.authorizationSha256} · identity continuity verified · receipt
          {" "}{custodyProof.recorderReceiptSha256} · acceptance-authority signature verified · cryptographic
          device attestation off · recorded-device/field/sharing/training authority off · no auto-arm
        </div>
      ) : null}
      {inspectionError ? <div style={{ color: "#e6a23c", marginTop: 5 }}>{inspectionError}</div> : null}
      {inspection ? (
        <div data-testid="recorder-archive-inspection" style={{ marginTop: 6 }}>
          <div style={{ color: "#74c69d" }}>
            verified · {inspection.artifactId} · {inspection.frameCount} frames · {inspection.durationS.toFixed(3)} s
          </div>
          <div style={{ color: "#7d899b", wordBreak: "break-word" }}>
            {inspection.referenceRigId} · {inspection.captureMaturity} · replay {inspection.replayPath}
          </div>
          <div style={{ color: "#7d899b", wordBreak: "break-word" }}>
            contract {inspection.contractHash} · source port hash {inspection.sourcePortSha256}
          </div>
          <div style={{ color: "#7d899b" }}>
            private · training reuse off · device attestation off · field verification off · no auto-arm
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
            <button
              data-testid="recorder-archive-materialize"
              onClick={() => void materializeArchive()}
              disabled={!canMaterialize}
              style={btn}
            >
              {materializationBusy ? "materializing…" : "materialize private archive"}
            </button>
            <span style={{ color: authenticated ? "#7d899b" : "#e6a23c" }}>
              {authenticated
                ? "five checksum-bound private objects; no sharing or training authority"
                : "sign in to create private object materialization"}
            </span>
          </div>
        </div>
      ) : null}
      {materializationError ? (
        <div data-testid="recorder-materialization-error" style={{ color: "#e6a23c", marginTop: 5 }}>
          {materializationError}
        </div>
      ) : null}
      {uploadReceipt ? (
        <div data-testid="recorder-upload-receipt" style={{ color: "#7d899b", marginTop: 5 }}>
          Desktop streamed {uploadReceipt.uploadedFileCount} files / {uploadReceipt.uploadedByteSize} bytes ·
          gateway integrity pending at upload receipt
        </div>
      ) : null}
      {materialization ? (
        <div style={{ marginTop: 5 }}>
          <div data-testid="recorder-materialization" style={{ color: "#74c69d", wordBreak: "break-word" }}>
            private objects verified · {materialization.id} · gateway object integrity on · archive semantics off ·
            device/field verification off · sharing/training off · no auto-arm
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
            <button
              data-testid="recorder-archive-admit"
              onClick={() => void admitArchive()}
              disabled={!canAdmit}
              style={btn}
            >
              {admissionBusy ? "verifying server archive…" : "verify archive & admit telemetry"}
            </button>
            <span style={{ color: activeModelId ? "#7d899b" : "#e6a23c" }}>
              {activeModelId
                ? `selected model ${activeModelId}; object-backed telemetry only`
                : "select the exact admitted model before server verification"}
            </span>
          </div>
        </div>
      ) : null}
      {admissionError ? (
        <div data-testid="recorder-admission-error" style={{ color: "#e6a23c", marginTop: 5 }}>
          {admissionError}
        </div>
      ) : null}
      {admission ? (
        <div data-testid="recorder-admission" style={{ color: "#74c69d", marginTop: 5, wordBreak: "break-word" }}>
          archive semantics verified · telemetry {admission.telemetryLogId} · {admission.frameCount} frames ·
          object-backed · device/field verification off · sharing/training off · no auto-arm
        </div>
      ) : null}
    </details>
  );
}

const photoscanAxes = ["x", "y", "z"] as const;
type PhotoscanAxis = (typeof photoscanAxes)[number];

interface PhotoscanPortDraft {
  id: string;
  kind: string;
  axis: PhotoscanAxis;
  role: string;
}

function isPhotoscanAxis(value: unknown): value is PhotoscanAxis {
  return value === "x" || value === "y" || value === "z";
}

function photoscanDimensionText(alignment: Record<string, unknown> | null | undefined): string {
  return typeof alignment?.knownDimensionMm === "number" ? String(Math.round(alignment.knownDimensionMm)) : "150";
}

function photoscanAxis(alignment: Record<string, unknown> | null | undefined): PhotoscanAxis {
  return isPhotoscanAxis(alignment?.axis) ? alignment.axis : "z";
}

function photoscanPorts(alignment: Record<string, unknown> | null | undefined, axis: PhotoscanAxis): PhotoscanPortDraft[] {
  const rawPorts = Array.isArray(alignment?.ports) ? alignment.ports : [];
  return rawPorts.slice(0, 64).map((raw, index) => {
    const port = asRecord(raw);
    return {
      id: typeof port?.id === "string" && port.id.trim() ? port.id : `port-${index + 1}`,
      kind: typeof port?.kind === "string" && port.kind.trim() ? port.kind : "mount",
      axis: isPhotoscanAxis(port?.axis) ? port.axis : axis,
      role: typeof port?.role === "string" && port.role.trim() ? port.role : "component-port",
    };
  });
}

function sanitizePhotoscanPorts(ports: PhotoscanPortDraft[]): PhotoscanPortInput[] {
  return ports
    .map((port, index) => ({
      id: port.id.trim() || `port-${index + 1}`,
      kind: port.kind.trim() || "mount",
      axis: port.axis,
      role: port.role.trim() || "component-port",
    }))
    .slice(0, 64);
}

function PhotoscanArtifactRow({
  artifact,
  onOpenBlob,
  onAlign,
}: {
  artifact: PhotoscanArtifactRecord;
  onOpenBlob: (blobId: string | null) => void;
  onAlign: (artifactId: string, input: PhotoscanAlignmentInput) => void;
}) {
  const candidate = asRecord(artifact.candidateComponent);
  const acceptance = asRecord(asRecord(artifact.validatorReport)?.acceptance);
  const alignment = asRecord(artifact.scaleAxesPorts);
  const alignmentKey = JSON.stringify(alignment ?? {});
  const initialAxis = photoscanAxis(alignment);
  const [dimensionDraft, setDimensionDraft] = useState(() => photoscanDimensionText(alignment));
  const [axisDraft, setAxisDraft] = useState<PhotoscanAxis>(() => initialAxis);
  const [portDrafts, setPortDrafts] = useState<PhotoscanPortDraft[]>(() => photoscanPorts(alignment, initialAxis));
  const [draftError, setDraftError] = useState<string | null>(null);
  useEffect(() => {
    const nextAxis = photoscanAxis(alignment);
    setDimensionDraft(photoscanDimensionText(alignment));
    setAxisDraft(nextAxis);
    setPortDrafts(photoscanPorts(alignment, nextAxis));
    setDraftError(null);
  }, [artifact.id, alignmentKey]);

  const refits = Array.isArray(artifact.refitPrimitives) ? artifact.refitPrimitives.length : null;
  const portCount = Array.isArray(alignment?.ports) ? alignment.ports.length : null;
  const knownDimension =
    typeof alignment?.knownDimensionMm === "number" ? `${alignment.knownDimensionMm.toFixed(0)} mm` : undefined;
  const axis = typeof alignment?.axis === "string" ? alignment.axis : alignment?.axesLocked === true ? "locked" : undefined;
  const label =
    [candidate?.brand, candidate?.model].filter((value): value is string => typeof value === "string").join(" ") ||
    (typeof candidate?.id === "string" ? candidate.id : artifact.id);
  const addPort = () => {
    setPortDrafts((ports) =>
      ports.length >= 64
        ? ports
        : [
            ...ports,
            {
              id: `port-${ports.length + 1}`,
              kind: "mount",
              axis: axisDraft,
              role: "component-port",
            },
          ],
    );
  };
  const updatePort = (index: number, patch: Partial<PhotoscanPortDraft>) => {
    setPortDrafts((ports) => ports.map((port, current) => (current === index ? { ...port, ...patch } : port)));
  };
  const removePort = (index: number) => {
    setPortDrafts((ports) => ports.filter((_, current) => current !== index));
  };
  const saveAlignment = () => {
    const knownDimensionMm = Number(dimensionDraft);
    if (!Number.isFinite(knownDimensionMm) || knownDimensionMm <= 0) {
      setDraftError("scale must be > 0");
      return;
    }
    setDraftError(null);
    onAlign(artifact.id, {
      knownDimensionMm,
      axis: axisDraft,
      ports: sanitizePhotoscanPorts(portDrafts),
      note: "Studio alignment editor",
    });
  };
  return (
    <div style={artifactRowStyle}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: "#cfd6df", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
          scan · {label}
        </span>
        <button disabled={!artifact.artifactBlobId} onClick={() => onOpenBlob(artifact.artifactBlobId)} style={btn}>
          blob
        </button>
      </div>
      <MiniRows
        rows={[
          ["created", shortTime(artifact.createdAt)],
          ["sources", artifact.sourceBlobIds.length],
          ["refit", refits === null ? undefined : `${refits} primitives`],
          ["D13", acceptance?.pass === true ? "pass" : acceptance?.pass === false ? "review" : undefined],
          ["scale", knownDimension ?? (alignment?.scaleLocked === true ? "locked" : undefined)],
          ["axis", axis],
          ["ports", portCount === null ? (alignment?.portsMarked === true ? "marked" : undefined) : portCount],
        ]}
      />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 58px 44px", gap: 4, marginTop: 5 }}>
        <label>
          <span style={fieldLabel}>scale mm</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={dimensionDraft}
            onChange={(event) => setDimensionDraft(event.target.value)}
            style={inputStyle}
          />
        </label>
        <label>
          <span style={fieldLabel}>axis</span>
          <select
            value={axisDraft}
            aria-label="alignment axis"
            onChange={(event) => setAxisDraft(event.target.value as PhotoscanAxis)}
            style={{ ...selectStyle, width: "100%" }}
          >
            {photoscanAxes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={saveAlignment}
          style={{ ...btn, alignSelf: "end", height: 21 }}
          aria-label={`save alignment ${artifact.id}`}
        >
          save
        </button>
      </div>
      {portDrafts.length ? (
        <div style={{ display: "grid", gap: 4, marginTop: 5 }}>
          {portDrafts.map((port, index) => (
            <div
              key={`port-${index}`}
              style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 70px 48px 24px", gap: 4 }}
            >
              <input
                aria-label={`port ${index + 1}`}
                value={port.id}
                onChange={(event) => updatePort(index, { id: event.target.value })}
                style={inputStyle}
              />
              <input
                aria-label={`port ${index + 1} kind`}
                value={port.kind}
                onChange={(event) => updatePort(index, { kind: event.target.value })}
                style={inputStyle}
              />
              <select
                value={port.axis}
                aria-label={`port ${index + 1} axis`}
                onChange={(event) => updatePort(index, { axis: event.target.value as PhotoscanAxis })}
                style={{ ...selectStyle, width: "100%" }}
              >
                {photoscanAxes.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <button onClick={() => removePort(index)} style={btn} aria-label={`remove ${port.id}`}>
                -
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 4, marginTop: 5, alignItems: "center" }}>
        <button
          onClick={addPort}
          disabled={portDrafts.length >= 64}
          style={btn}
          aria-label={`add port ${artifact.id}`}
        >
          + port
        </button>
        {draftError ? <span style={{ color: "#e6a23c" }}>{draftError}</span> : null}
      </div>
    </div>
  );
}

function PolicyArtifactRow({
  artifact,
  onOpenBlob,
  onPlay,
}: {
  artifact: PolicyArtifactRecord;
  onOpenBlob: (blobId: string | null) => void;
  onPlay: (output: PolicyOutput, artifactId?: string) => void;
}) {
  const scorecard = asRecord(artifact.scorecard);
  const success = numberOrNull(scorecard?.successRate);
  const policyOutput = isKnownJobOutput(artifact.policyMetadata)
    && artifact.policyMetadata.artifactKind === "policy"
    ? artifact.policyMetadata
    : null;
  return (
    <div style={artifactRowStyle}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: artifact.exportGate === "exportable" ? "#7dd87d" : "#e6a23c", flex: 1 }}>
          policy · {artifact.taskKind}
        </span>
        <button
          data-testid={`policy-artifact-play-${artifact.id}`}
          disabled={!policyOutput || artifact.exportGate !== "exportable"}
          onClick={() => policyOutput && onPlay(policyOutput, artifact.id)}
          style={btn}
        >
          play
        </button>
        <button disabled={!artifact.artifactBlobId} onClick={() => onOpenBlob(artifact.artifactBlobId)} style={btn}>
          onnx
        </button>
      </div>
      <MiniRows
        rows={[
          ["created", shortTime(artifact.createdAt)],
          ["success", success === null ? undefined : formatPercent(success)],
          ["energy", typeof scorecard?.energyWh === "number" ? `${scorecard.energyWh.toFixed(1)} Wh` : undefined],
          ["gate", artifact.exportGate],
        ]}
      />
    </div>
  );
}

function ReplayArtifactRow({ artifact }: { artifact: ReplayArtifactRecord }) {
  const verification = asRecord(artifact.verification);
  return (
    <div style={artifactRowStyle}>
      <div style={{ color: verification?.verified === true ? "#7dd87d" : "#e6a23c" }}>
        replay · {verification?.verified === true ? "verified" : "held"}
      </div>
      <MiniRows
        rows={[
          ["created", shortTime(artifact.createdAt)],
          ["frames", verification?.frameCount],
          ["duration", typeof verification?.durationS === "number" ? `${verification.durationS.toFixed(2)} s` : undefined],
          ["hash", artifact.tamperHash],
          ["reject", verification?.rejectReason],
        ]}
      />
    </div>
  );
}

function TelemetryLogRow({ log }: { log: TelemetryLogRecord }) {
  const tape = asRecord(log.tape);
  const frames = Array.isArray(tape?.frames) ? tape.frames.length : undefined;
  return (
    <div style={artifactRowStyle}>
      <div style={{ color: "#cfd6df" }}>telemetry · {log.source}</div>
      <MiniRows
        rows={[
          ["captured", shortTime(log.capturedAt)],
          ["frames", frames],
          ["model", log.modelId],
        ]}
      />
    </div>
  );
}

function MaintenanceDashboard({
  records,
  vendorOffers,
  printQuotes,
}: {
  records: MaintenanceRecord[];
  vendorOffers: VendorOfferRecord[];
  printQuotes: PrintQuoteRequestRecord[];
}) {
  if (records.length === 0) return null;
  const fleetRecord = records.find((record) => maintenanceKind(record) === "fleet-summary") ?? null;
  const fleet = asRecord(fleetRecord?.payload);
  const wearRecords = records.filter((record) => maintenanceKind(record) === "wear-estimate" || record.kind === "wear");
  const crashRecords = records.filter((record) => maintenanceKind(record) === "crash-forensics");
  const repairRecords = records.filter((record) => maintenanceKind(record) === "repair-sheet");
  const repairSteps = repairRecords.flatMap((record) => repairStepsFor(record).map((step) => ({ record, step })));
  const nextActions = [
    ...fleetActions(fleet),
    ...repairSteps
      .filter(({ step }) => typeof step.reorderSku === "string" && step.reorderSku.trim())
      .map(({ step }) => ({
        vehicleId: typeof step.node === "string" ? step.node : "repair",
        action: `reorder ${step.reorderSku}`,
      })),
  ].slice(0, 6);
  const warningCount = records.filter((record) => record.severity === "warn" || record.severity === "critical").length;
  const repairStepCount = repairSteps.length;
  const reorderCount = repairSteps.filter(({ step }) => typeof step.reorderSku === "string" && step.reorderSku.trim()).length;
  const fallbackDue = wearRecords.filter((record) => {
    const payload = asRecord(record.payload);
    const packCycles = numberOrNull(payload?.packCycles);
    const rIntMohm = numberOrNull(payload?.rIntMohm);
    return (packCycles !== null && packCycles >= 80) || (rIntMohm !== null && rIntMohm >= 120);
  }).length;

  return (
    <div data-testid="maintenance-dashboard" style={artifactRowStyle}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: "#8fa3bf", flex: 1 }}>fleet dashboard</span>
        <span style={{ color: warningCount > 0 ? "#e6a23c" : "#7dd87d" }}>
          {warningCount > 0 ? `${warningCount} review` : "clear"}
        </span>
      </div>
      <MiniRows
        rows={[
          ["vehicles", numberOrNull(fleet?.vehicleCount) ?? uniqueModelCount(records)],
          ["service due", numberOrNull(fleet?.serviceDueCount) ?? fallbackDue],
          ["critical", numberOrNull(fleet?.criticalCount) ?? records.filter((record) => record.severity === "critical").length],
          ["crashes", crashRecords.length],
          ["repair steps", repairStepCount],
          ["reorders", reorderCount],
        ]}
      />
      {nextActions.length > 0 ? (
        <div style={{ display: "grid", gap: 4, marginTop: 5 }}>
          {nextActions.map((action, index) => (
            <div
              key={`${action.vehicleId}-${action.action}-${index}`}
              style={{ display: "grid", gridTemplateColumns: "72px minmax(0, 1fr)", gap: 8 }}
            >
              <span style={{ color: "#7d899b" }}>{action.vehicleId ?? "vehicle"}</span>
              <span style={{ color: "#cfd6df", overflow: "hidden", textOverflow: "ellipsis" }}>{action.action ?? "review"}</span>
            </div>
          ))}
        </div>
      ) : null}
      {wearRecords.length > 0 ? <WearSummary records={wearRecords} /> : null}
      {crashRecords.length > 0 ? <CrashScrubber records={crashRecords} /> : null}
      {repairSteps.length > 0 ? (
        <RepairSummary rows={repairSteps} vendorOffers={vendorOffers} printQuotes={printQuotes} />
      ) : null}
    </div>
  );
}

function WearSummary({ records }: { records: MaintenanceRecord[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4, marginTop: 6 }}>
      {records.slice(0, 3).map((record) => {
        const payload = asRecord(record.payload);
        const packCycles = numberOrNull(payload?.packCycles);
        const motorHours = numberOrNull(payload?.motorHours);
        const rIntMohm = numberOrNull(payload?.rIntMohm);
        const warnings = Array.isArray(payload?.warnings) ? payload.warnings.length : 0;
        return (
          <div key={record.id} style={{ border: "1px solid #242a33", padding: "4px 5px", minWidth: 0 }}>
            <div style={{ color: warnings > 0 || record.severity !== "info" ? "#e6a23c" : "#cfd6df" }}>
              wear · {record.modelId ?? "fleet"}
            </div>
            <MiniRows
              rows={[
                ["packs", packCycles === null ? undefined : packCycles.toFixed(2)],
                ["motor", motorHours === null ? undefined : `${motorHours.toFixed(2)} h`],
                ["Rint", rIntMohm === null ? undefined : `${rIntMohm.toFixed(1)} mOhm`],
              ]}
            />
          </div>
        );
      })}
    </div>
  );
}

function CrashScrubber({ records }: { records: MaintenanceRecord[] }) {
  const [selectedId, setSelectedId] = useState(records[0]?.id ?? "");
  const active = records.find((record) => record.id === selectedId) ?? records[0] ?? null;
  const window = crashWindow(active);
  const payload = asRecord(active?.payload);
  const replay = useMemo(() => tryParseGhostReplay(payload?.ghostOverlay), [payload?.ghostOverlay]);
  const projection = useMemo(() => (replay ? projectGhostReplay(replay) : null), [replay]);
  const impactS = window?.impactS ?? replay?.startS ?? 0;
  const [scrubS, setScrubS] = useState(impactS);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!records.some((record) => record.id === selectedId)) {
      setSelectedId(records[0]?.id ?? "");
    }
  }, [records, selectedId]);
  useEffect(() => {
    const nextWindow = crashWindow(active);
    const nextPayload = asRecord(active?.payload);
    const nextReplay = tryParseGhostReplay(nextPayload?.ghostOverlay);
    setScrubS(nextWindow?.impactS ?? nextReplay?.startS ?? nextWindow?.startS ?? 0);
    setPlaying(false);
  }, [active?.id, active?.payload]);
  useEffect(() => {
    if (!playing || !replay) return undefined;
    let animationFrame = 0;
    let previousMs: number | null = null;
    const tick = (nowMs: number) => {
      if (previousMs !== null) {
        const elapsedS = Math.min(0.1, Math.max(0, (nowMs - previousMs) / 1_000));
        setScrubS((current) => {
          const next = Math.min(replay.endS, current + elapsedS);
          if (next >= replay.endS) setPlaying(false);
          return next;
        });
      }
      previousMs = nowMs;
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [playing, replay]);
  if (!active || (!window && !replay)) return null;
  const rangeStartS = replay?.startS ?? window?.startS ?? 0;
  const rangeEndS = replay?.endS ?? window?.endS ?? rangeStartS;
  const frame = replay ? seekGhostReplay(replay, scrubS) : null;
  const actualDot = frame && projection ? projectGhostPosition(projection, frame.actualPositionM) : null;
  const predictedDot = frame && projection ? projectGhostPosition(projection, frame.predictedPositionM) : null;
  const phase = window
    ? Math.abs(scrubS - window.impactS) < 1 / GHOST_PLAYBACK_HZ
      ? "impact"
      : scrubS < window.impactS
        ? "pre-impact"
        : "post-impact"
    : "no impact";
  const divergenceStatus = replay?.divergence.status ?? "unavailable";
  return (
    <div data-testid="ghost-replay" style={{ borderTop: "1px solid #242a33", marginTop: 6, paddingTop: 5 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ color: "#8fa3bf", flex: 1 }}>ghost replay</span>
        {records.length > 1 ? (
          <select value={active.id} onChange={(event) => setSelectedId(event.target.value)} style={selectStyle}>
            {records.map((record) => (
              <option key={record.id} value={record.id}>
                {shortTime(record.createdAt)}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {replay && projection && frame && actualDot && predictedDot ? (
        <svg
          data-testid="ghost-overlay-plot"
          role="img"
          aria-label="Top-down X Z telemetry and twin prediction paths"
          viewBox={`0 0 ${projection.width} ${projection.height}`}
          style={{ width: "100%", height: 120, marginTop: 5, border: "1px solid #242a33", background: "#0d1015" }}
        >
          <polyline points={projection.actualPolyline} fill="none" stroke="#39c8ff" strokeWidth="1.5" opacity="0.8" />
          <polyline points={projection.predictedPolyline} fill="none" stroke="#e6a23c" strokeWidth="1.2" opacity="0.75" />
          <line
            x1={actualDot[0]}
            y1={actualDot[1]}
            x2={predictedDot[0]}
            y2={predictedDot[1]}
            stroke={frame.divergenceM >= replay.divergence.warnM ? "#e66" : "#7dd87d"}
            strokeWidth="1.2"
          />
          <circle cx={actualDot[0]} cy={actualDot[1]} r="3.5" fill="#39c8ff" />
          <circle cx={predictedDot[0]} cy={predictedDot[1]} r="3.5" fill="#e6a23c" />
          <text x="10" y="16" fill="#39c8ff" fontSize="9">observed</text>
          <text x="66" y="16" fill="#e6a23c" fontSize="9">twin ghost</text>
          <text x="260" y="112" fill="#7d899b" fontSize="8">X/Z · Y-up SI</text>
        </svg>
      ) : (
        <div style={{ color: "#e6a23c", marginTop: 5 }}>indexed overlay unavailable · summary only</div>
      )}
      <input
        data-testid="ghost-scrubber-range"
        aria-label="Ghost replay time"
        type="range"
        min={rangeStartS}
        max={rangeEndS}
        step={1 / GHOST_PLAYBACK_HZ}
        value={scrubS}
        onChange={(event) => {
          setPlaying(false);
          setScrubS(Number(event.target.value));
        }}
        style={{ width: "100%", marginTop: 5 }}
      />
      {replay ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 5, marginTop: 3 }}>
          <button
            data-testid="ghost-step-back"
            aria-label="Step ghost replay backward one frame"
            style={{ ...btn, minHeight: 32 }}
            onClick={() => {
              setPlaying(false);
              setScrubS((current) => Math.max(replay.startS, current - 1 / GHOST_PLAYBACK_HZ));
            }}
          >
            −1 frame
          </button>
          <button
            data-testid="ghost-play-toggle"
            aria-label={playing ? "Pause ghost replay" : "Play ghost replay"}
            style={{ ...btn, minHeight: 32 }}
            onClick={() => {
              if (!playing && scrubS >= replay.endS) setScrubS(replay.startS);
              setPlaying((current) => !current);
            }}
          >
            {playing ? "pause" : "play · 60 Hz"}
          </button>
          <button
            data-testid="ghost-step-forward"
            aria-label="Step ghost replay forward one frame"
            style={{ ...btn, minHeight: 32 }}
            onClick={() => {
              setPlaying(false);
              setScrubS((current) => Math.min(replay.endS, current + 1 / GHOST_PLAYBACK_HZ));
            }}
          >
            +1 frame
          </button>
        </div>
      ) : null}
      <MiniRows
        rows={[
          ["time", `${scrubS.toFixed(2)} s · ${phase}`],
          ["trace", replay ? `${(replay.durationS / 60).toFixed(2)} min · ${replay.points.length} points` : undefined],
          ["source", replay ? `${replay.sourceMaturity} · ${replay.sourceSampleRateHz.toFixed(0)} Hz` : undefined],
          ["window", window ? `${window.startS.toFixed(2)}-${window.endS.toFixed(2)} s` : "none"],
          ["impact", window ? `${window.impactS.toFixed(2)} s` : "none"],
          ["divergence", frame ? `${frame.divergenceM.toFixed(3)} m · ${divergenceStatus}` : divergenceStatus],
          ["authority", replay ? "not device · not field" : "unverified"],
          ["severity", active.severity],
        ]}
      />
    </div>
  );
}

function RepairSummary({
  rows,
  vendorOffers,
  printQuotes,
}: {
  rows: { record: MaintenanceRecord; step: RepairStep }[];
  vendorOffers: VendorOfferRecord[];
  printQuotes: PrintQuoteRequestRecord[];
}) {
  const printHandoff = printQuoteForRepairRows(rows, printQuotes);
  const printOffer = printHandoff?.offers[0] ?? null;
  return (
    <div style={{ borderTop: "1px solid #242a33", marginTop: 6, paddingTop: 5 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: "#8fa3bf", flex: 1 }}>repair sheet</span>
        {printOffer ? (
          <a href={printOffer.quoteUrl} target="_blank" rel="noreferrer" style={{ ...linkStyle, fontSize: 11 }}>
            print handoff
          </a>
        ) : null}
      </div>
      {printHandoff ? (
        <MiniRows
          rows={[
            ["print", `${printHandoff.process}/${printHandoff.material}`],
            ["provider", printOffer?.provider],
            ["payment", "off-platform"],
          ]}
        />
      ) : null}
      {rows.slice(0, 5).map(({ record, step }, index) => {
        const vendorOffer = vendorOfferForStep(step, vendorOffers);
        return (
          <div
            key={`${record.id}-${step.order ?? index}`}
            style={{ display: "grid", gridTemplateColumns: "22px minmax(0, 1fr) auto", gap: 6, marginTop: 3 }}
          >
            <span style={{ color: "#7d899b" }}>{step.order ?? index + 1}</span>
            <span style={{ color: "#cfd6df", overflow: "hidden", textOverflow: "ellipsis" }}>
              {step.action ?? "inspect"}{step.reorderSku ? ` · ${step.reorderSku}` : ""}
            </span>
            {vendorOffer ? (
              <a href={vendorOffer.url} target="_blank" rel="noreferrer" style={{ ...linkStyle, fontSize: 11 }}>
                {priceText(vendorOffer.price, vendorOffer.currency) ?? vendorOffer.vendor}
              </a>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

interface RepairStep {
  order?: number;
  node?: string;
  partIndex?: number;
  action?: string;
  reorderSku?: string | null;
}

function repairStepsFor(record: MaintenanceRecord): RepairStep[] {
  const payload = asRecord(record.payload);
  const steps = Array.isArray(payload?.steps) ? payload.steps : [];
  const out: RepairStep[] = [];
  for (const raw of steps) {
    const step = asRecord(raw);
    if (!step) continue;
    const order = numberOrNull(step.order);
    const partIndex = numberOrNull(step.partIndex);
    out.push({
      ...(order === null ? {} : { order }),
      ...(typeof step.node === "string" ? { node: step.node } : {}),
      ...(partIndex === null ? {} : { partIndex }),
      ...(typeof step.action === "string" ? { action: step.action } : {}),
      reorderSku: typeof step.reorderSku === "string" ? step.reorderSku : null,
    });
  }
  return out;
}

function vendorOfferForStep(step: RepairStep, offers: VendorOfferRecord[]): VendorOfferRecord | null {
  const reorderSku = normalizedKey(step.reorderSku);
  if (!reorderSku) return null;
  return (
    offers.find((offer) => normalizedKey(offer.sku) === reorderSku || normalizedKey(offer.componentId) === reorderSku) ??
    null
  );
}

function printQuoteForRepairRows(
  rows: { record: MaintenanceRecord; step: RepairStep }[],
  quotes: PrintQuoteRequestRecord[],
): PrintQuoteRequestRecord | null {
  const modelIds = new Set(
    rows.map(({ record }) => record.modelId).filter((id): id is string => typeof id === "string"),
  );
  return (
    quotes.find((quote) => quote.offers.length > 0 && quote.modelId !== null && modelIds.has(quote.modelId)) ??
    quotes.find((quote) => quote.offers.length > 0) ??
    null
  );
}

function normalizedKey(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function fleetActions(payload: Record<string, unknown> | null): { vehicleId?: string; action?: string }[] {
  const actions = Array.isArray(payload?.nextActions) ? payload.nextActions : [];
  return actions.slice(0, 10).map((raw) => {
    const action = asRecord(raw);
    return {
      vehicleId: typeof action?.vehicleId === "string" ? action.vehicleId : undefined,
      action: typeof action?.action === "string" ? action.action : undefined,
    };
  });
}

function crashWindow(record: MaintenanceRecord | null): { startS: number; impactS: number; endS: number } | null {
  const payload = asRecord(record?.payload);
  const rawWindow = asRecord(payload?.window);
  const startS = numberOrNull(rawWindow?.startS);
  const impactS = numberOrNull(rawWindow?.impactS);
  const endS = numberOrNull(rawWindow?.endS);
  if (startS === null || impactS === null || endS === null || endS <= startS) return null;
  return { startS, impactS, endS };
}

function maintenanceKind(record: MaintenanceRecord): string {
  const payload = asRecord(record.payload);
  return typeof payload?.artifactKind === "string" ? payload.artifactKind : record.kind;
}

function uniqueModelCount(records: MaintenanceRecord[]): number {
  const ids = new Set(records.map((record) => record.modelId).filter((id): id is string => typeof id === "string"));
  return ids.size || (records.length > 0 ? 1 : 0);
}

function MaintenanceRecordRow({ record }: { record: MaintenanceRecord }) {
  return (
    <div style={artifactRowStyle}>
      <div style={{ color: record.severity === "critical" ? "#e66" : record.severity === "warn" ? "#e6a23c" : "#cfd6df" }}>
        maintenance · {record.kind}
      </div>
      <MiniRows
        rows={[
          ["created", shortTime(record.createdAt)],
          ["severity", record.severity],
          ["summary", record.summary],
        ]}
      />
    </div>
  );
}

function CapabilitySummary({ capabilities }: { capabilities: JobCapabilities | null }) {
  if (!capabilities) {
    return <div style={{ color: "#7d899b", marginTop: 5 }}>capabilities unavailable</div>;
  }
  const liveReady = Object.entries(capabilities.live)
    .filter(([, state]) => state.configured)
    .map(([key]) => key)
    .join(", ");
  return (
    <div style={{ marginTop: 5 }}>
      <MiniRows
        rows={[
          ["providers", Object.entries(capabilities.providers).map(([key, state]) => `${key}:${state.enabled ? state.mode : "off"}`).join(", ")],
          ["live", liveReady || "keyless fixture only"],
          ["hardware", capabilities.hardware.labMode ? "D12 lab mode" : "blocked"],
          ["no auto arm", capabilities.hardware.noAutoArm ? "yes" : "no"],
        ]}
      />
    </div>
  );
}

type MarketplaceListingKind = "model" | "course" | "skill" | "component" | "policy";

function marketplaceListingKind(value: string): MarketplaceListingKind {
  return value === "course" || value === "skill" || value === "component" || value === "policy" ? value : "model";
}

function vendorComponentIds(records: MaintenanceRecord[]): string[] {
  const ids = new Set<string>();
  for (const record of records) {
    const payload = asRecord(record.payload);
    const vendorSkus = asRecord(payload?.vendorSkus);
    if (vendorSkus) {
      for (const value of Object.values(vendorSkus)) {
        if (typeof value === "string" && value.trim()) ids.add(value.trim());
      }
    }
    const steps = Array.isArray(payload?.steps) ? payload.steps : [];
    for (const rawStep of steps) {
      const step = asRecord(rawStep);
      const sku = step?.sku ?? step?.vendorSku ?? step?.componentId;
      if (typeof sku === "string" && sku.trim()) ids.add(sku.trim());
    }
  }
  if (ids.size === 0) ids.add("FRAME-SKU");
  return [...ids].slice(0, 10);
}

function gateSummary(gates: PlatformGateSignoff[]): string {
  if (gates.length === 0) return "unknown";
  const accepted = gates.filter((gate) => gate.status === "accepted" && gate.revokedAt === null).length;
  return `${accepted}/${gates.length} accepted`;
}

function priceText(price: number | null, currency: string | null): string | undefined {
  if (price === null) return undefined;
  return `${price.toFixed(2)} ${currency ?? "USD"}`;
}

function PlatformPanel({
  credits,
  courses,
  courseName,
  courseVisibility,
  courseEnvJson,
  activeCourseId,
  courseShareUrl,
  leaderboardRuns,
  leaderboardArchetypeFilter,
  leaderboardClassFilter,
  leaderboardStatusFilter,
  listings,
  licenseLedger,
  platformGates,
  vendorOffers,
  printQuotes,
  classroomAssignments,
  activeAssignmentId,
  classroomSubmissions,
  moderationReports,
  busy,
  error,
  message,
  activeModelId,
  hasSubmissionContract,
  onRefresh,
  onCourseNameChange,
  onCourseVisibilityChange,
  onCourseEnvJsonChange,
  onCourseChange,
  onCopyCourseUrl,
  onLeaderboardArchetypeFilter,
  onLeaderboardClassFilter,
  onLeaderboardStatusFilter,
  onAssignmentChange,
  onCreateCourse,
  onSubmitRun,
  onCreateListing,
  onCreatePolicyListing,
  onCreateAssignment,
  onSubmitAssignment,
  onReport,
  onRefreshVendorLinks,
  onRequestPrintQuote,
  onRecordListingUsage,
}: {
  credits: CreditSummary | null;
  courses: CourseRecord[];
  courseName: string;
  courseVisibility: CourseVisibility;
  courseEnvJson: string;
  activeCourseId: string | null;
  courseShareUrl: string | null;
  leaderboardRuns: LeaderboardRunRecord[];
  leaderboardArchetypeFilter: string;
  leaderboardClassFilter: string;
  leaderboardStatusFilter: LeaderboardStatusFilter;
  listings: ListingRecord[];
  licenseLedger: LicenseLedgerEntry[];
  platformGates: PlatformGateSignoff[];
  vendorOffers: VendorOfferRecord[];
  printQuotes: PrintQuoteRequestRecord[];
  classroomAssignments: ClassroomAssignmentRecord[];
  activeAssignmentId: string | null;
  classroomSubmissions: ClassroomSubmissionRecord[];
  moderationReports: ModerationReportRecord[];
  busy: boolean;
  error: string | null;
  message: string | null;
  activeModelId: string | null;
  hasSubmissionContract: boolean;
  onRefresh: () => void;
  onCourseNameChange: (value: string) => void;
  onCourseVisibilityChange: (value: CourseVisibility) => void;
  onCourseEnvJsonChange: (value: string) => void;
  onCourseChange: (courseId: string | null) => void;
  onCopyCourseUrl: () => void;
  onLeaderboardArchetypeFilter: (value: string) => void;
  onLeaderboardClassFilter: (value: string) => void;
  onLeaderboardStatusFilter: (value: LeaderboardStatusFilter) => void;
  onAssignmentChange: (assignmentId: string | null) => void;
  onCreateCourse: () => void;
  onSubmitRun: () => void;
  onCreateListing: () => void;
  onCreatePolicyListing: () => void;
  onCreateAssignment: () => void;
  onSubmitAssignment: () => void;
  onReport: () => void;
  onRefreshVendorLinks: () => void;
  onRequestPrintQuote: () => void;
  onRecordListingUsage: (listing: ListingRecord, event: MarketplaceUsageEvent) => void;
}) {
  const activeCourse = courses.find((course) => course.id === activeCourseId) ?? null;
  const [listingKindFilter, setListingKindFilter] = useState<MarketplaceListingKind | "all">("all");
  const [listingStatusFilter, setListingStatusFilter] = useState<string>("all");
  const listingKinds = uniqueListingKinds(listings);
  const listingStatuses = uniqueListingStatuses(listings);
  const curatedListings = listings.filter((listing) => {
    const kindMatch = listingKindFilter === "all" || marketplaceListingKind(listing.kind) === listingKindFilter;
    const statusMatch = listingStatusFilter === "all" || listing.status === listingStatusFilter;
    return kindMatch && statusMatch;
  });
  return (
    <div data-testid="platform-panel" style={{ borderTop: "1px solid #242a33", marginTop: 6, paddingTop: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: "#8fa3bf", flex: 1 }}>platform</span>
        <button onClick={onRefresh} disabled={busy} style={btn}>
          refresh
        </button>
      </div>
      <MiniRows
        rows={[
          ["credits", credits ? credits.balanceCredits : "auth required"],
          ["credit ledger", credits?.ledger.length],
          ["license ledger", licenseLedger.length],
          ["gates", gateSummary(platformGates)],
          ["capability", "usage beta · no seller payouts"],
          ["vendor links", vendorOffers.length],
          ["print quotes", printQuotes.length],
        ]}
      />
      {error ? <div data-testid="platform-error" style={{ color: "#e6a23c", marginTop: 4, wordBreak: "break-word" }}>{error}</div> : null}
      {message ? <div data-testid="platform-message" style={{ color: "#7d899b", marginTop: 4, wordBreak: "break-word" }}>{message}</div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 6 }}>
        <button data-testid="course-create" onClick={onCreateCourse} disabled={busy} style={btn}>
          course
        </button>
        <button onClick={onSubmitRun} disabled={busy || !activeCourseId} style={btn}>
          score
        </button>
        <button data-testid="listing-create" onClick={onCreateListing} disabled={busy || !activeModelId} style={btn}>
          list
        </button>
        <button onClick={onCreatePolicyListing} disabled={busy || !activeModelId} style={btn}>
          skill
        </button>
        <button onClick={onCreateAssignment} disabled={busy} style={btn}>
          assign
        </button>
        <button onClick={onSubmitAssignment} disabled={busy || !activeAssignmentId || (!activeModelId && !hasSubmissionContract)} style={btn}>
          submit
        </button>
        <button onClick={onReport} disabled={busy} style={btn}>
          report
        </button>
        <button onClick={onRefreshVendorLinks} disabled={busy} style={btn}>
          vendors
        </button>
        <button onClick={onRequestPrintQuote} disabled={busy} style={btn}>
          quote
        </button>
        <button
          onClick={() => listings[0] && onRecordListingUsage(listings[0], "view")}
          disabled={busy || listings.length === 0}
          style={btn}
        >
          usage
        </button>
      </div>
      <div style={artifactRowStyle}>
        <div style={{ color: "#8fa3bf" }}>course editor</div>
        <input
          data-testid="course-name"
          aria-label="course name"
          value={courseName}
          onChange={(event) => onCourseNameChange(event.target.value)}
          placeholder="Course name"
          style={{ ...inputStyle, marginTop: 5 }}
        />
        <select
          data-testid="course-visibility"
          aria-label="course visibility"
          value={courseVisibility}
          onChange={(event) => onCourseVisibilityChange(toCourseVisibility(event.target.value))}
          style={{ ...selectStyle, width: "100%", marginTop: 5 }}
        >
          {COURSE_VISIBILITIES.map((visibility) => (
            <option key={visibility} value={visibility}>
              {visibility}
            </option>
          ))}
        </select>
        <textarea
          data-testid="course-env"
          aria-label="course environment specification"
          value={courseEnvJson}
          onChange={(event) => onCourseEnvJsonChange(event.target.value)}
          spellCheck={false}
          style={{ ...textareaStyle, minHeight: 92, marginTop: 5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        />
      </div>
      {platformGates.slice(0, 3).map((gate) => (
        <div key={gate.gateKey} style={artifactRowStyle}>
          <div style={{ color: gate.status === "accepted" && gate.revokedAt === null ? "#7dd87d" : "#e6a23c" }}>
            gate · {gate.gateKey}
          </div>
          <MiniRows
            rows={[
              ["status", gate.revokedAt ? "revoked" : gate.status],
              ["policy", gate.policyVersion],
              ["jurisdiction", gate.jurisdiction],
              ["reviewer", gate.reviewer],
            ]}
          />
        </div>
      ))}
      {courses.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 4, marginTop: 6 }}>
          <select
            data-testid="course-select"
            value={activeCourseId ?? ""}
            onChange={(event) => onCourseChange(event.target.value || null)}
            style={{ ...selectStyle, width: "100%" }}
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} · {course.visibility}
              </option>
            ))}
          </select>
          <button onClick={onCopyCourseUrl} disabled={!activeCourseId} style={btn}>
            url
          </button>
        </div>
      ) : (
        <div style={{ color: "#7d899b", marginTop: 4 }}>0 courses</div>
      )}
      {courseShareUrl ? <div style={{ color: "#7d899b", marginTop: 4, wordBreak: "break-word" }}>{courseShareUrl}</div> : null}
      <LeaderboardBoard
        course={activeCourse}
        runs={leaderboardRuns}
        archetypeFilter={leaderboardArchetypeFilter}
        classFilter={leaderboardClassFilter}
        statusFilter={leaderboardStatusFilter}
        onArchetypeFilter={onLeaderboardArchetypeFilter}
        onClassFilter={onLeaderboardClassFilter}
        onStatusFilter={onLeaderboardStatusFilter}
      />
      {classroomAssignments.length > 0 ? (
        <select
          aria-label="classroom assignment"
          value={activeAssignmentId ?? ""}
          onChange={(event) => onAssignmentChange(event.target.value || null)}
          style={{ ...selectStyle, width: "100%", marginTop: 6 }}
        >
          {classroomAssignments.map((assignment) => (
            <option key={assignment.id} value={assignment.id}>
              {assignment.title} · {assignment.visibility}
            </option>
          ))}
        </select>
      ) : (
        <div style={{ color: "#7d899b", marginTop: 4 }}>0 assignments</div>
      )}
      {classroomSubmissions.slice(0, 3).map((submission) => {
        const grade = asRecord(submission.grade);
        return (
          <div key={submission.id} style={artifactRowStyle}>
            <div style={{ color: grade?.pass === true ? "#7dd87d" : "#e6a23c" }}>
              submission · {grade?.pass === true ? "pass" : "held"}
            </div>
            <MiniRows
              rows={[
                ["created", shortTime(submission.createdAt)],
                ["score", typeof grade?.score === "number" ? grade.score.toFixed(2) : undefined],
                ["status", submission.status],
              ]}
            />
          </div>
        );
      })}
      {listings.length > 0 ? (
        <MarketplaceBoard
          listings={curatedListings}
          kindOptions={listingKinds}
          statusOptions={listingStatuses}
          kindFilter={listingKindFilter}
          statusFilter={listingStatusFilter}
          onKindFilter={setListingKindFilter}
          onStatusFilter={setListingStatusFilter}
          onUsage={onRecordListingUsage}
        />
      ) : (
        <div style={{ color: "#7d899b", marginTop: 4 }}>0 listed marketplace items</div>
      )}
      {licenseLedger.length > 0 ? (
        licenseLedger.slice(0, 3).map((entry) => (
          <div key={entry.id} style={artifactRowStyle}>
            <div style={{ color: entry.blockedExportCount > 0 ? "#e6a23c" : "#cfd6df" }}>
              license · {entry.class}
            </div>
            <MiniRows
              rows={[
                ["id", entry.id],
                ["components", entry.componentCount],
                ["priced", entry.pricedComponentCount],
                ["cited", entry.citedComponentCount],
                ["approved", entry.approvedReviewCount],
                ["pending", entry.pendingReviewCount],
                ["blocked", entry.blockedExportCount],
                ["policies", Object.entries(entry.exportPolicies).map(([key, count]) => `${key}:${count}`).join(", ")],
              ]}
            />
          </div>
        ))
      ) : (
        <div style={{ color: "#7d899b", marginTop: 4 }}>0 license ledger rows</div>
      )}
      {vendorOffers.slice(0, 3).map((offer) => (
        <div key={offer.id} style={artifactRowStyle}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ color: "#cfd6df", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
              vendor · {offer.vendor}
            </span>
            <a href={offer.url} target="_blank" rel="noreferrer" style={{ ...linkStyle, fontSize: 11 }}>
              open
            </a>
          </div>
          <MiniRows
            rows={[
              ["component", offer.componentId],
              ["sku", offer.sku],
              ["price", priceText(offer.price, offer.currency)],
              ["source", offer.source],
            ]}
          />
        </div>
      ))}
      {printQuotes.slice(0, 3).map((quote) => {
        const offer = quote.offers[0];
        return (
          <div key={quote.id} style={artifactRowStyle}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "#cfd6df", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                print · {quote.process}/{quote.material}
              </span>
              {offer ? (
                <a href={offer.quoteUrl} target="_blank" rel="noreferrer" style={{ ...linkStyle, fontSize: 11 }}>
                  quote
                </a>
              ) : null}
            </div>
            <MiniRows
              rows={[
                ["status", quote.status],
                ["qty", quote.quantity],
                ["provider", offer?.provider],
                ["payment", "off-platform"],
              ]}
            />
          </div>
        );
      })}
      {moderationReports.slice(0, 3).map((report) => (
        <div key={report.id} style={artifactRowStyle}>
          <div style={{ color: report.repeatInfringerSignal ? "#e6a23c" : "#cfd6df" }}>
            report · {report.reason}
          </div>
          <MiniRows
            rows={[
              ["target", `${report.targetKind}:${report.targetId}`],
              ["status", report.status],
              ["SLA", shortTime(report.slaDueAt)],
            ]}
          />
        </div>
      ))}
    </div>
  );
}

type CourseVisibility = CourseRecord["visibility"];
const COURSE_VISIBILITIES: CourseVisibility[] = ["private", "unlisted", "public"];

type MarketplaceUsageEvent = "view" | "equip" | "quote-click" | "policy-download" | "training-job";

function MarketplaceBoard({
  listings,
  kindOptions,
  statusOptions,
  kindFilter,
  statusFilter,
  onKindFilter,
  onStatusFilter,
  onUsage,
}: {
  listings: ListingRecord[];
  kindOptions: (MarketplaceListingKind | "all")[];
  statusOptions: string[];
  kindFilter: MarketplaceListingKind | "all";
  statusFilter: string;
  onKindFilter: (value: MarketplaceListingKind | "all") => void;
  onStatusFilter: (value: string) => void;
  onUsage: (listing: ListingRecord, event: MarketplaceUsageEvent) => void;
}) {
  return (
    <div data-testid="marketplace-board" style={artifactRowStyle}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: "#8fa3bf", flex: 1 }}>marketplace</span>
        <span style={{ color: "#7d899b" }}>{listings.length} shown</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 5 }}>
        <select
          value={kindFilter}
          onChange={(event) => onKindFilter(toMarketplaceKindFilter(event.target.value))}
          style={{ ...selectStyle, width: "100%" }}
          aria-label="marketplace kind"
        >
          {kindOptions.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => onStatusFilter(event.target.value)}
          style={{ ...selectStyle, width: "100%" }}
          aria-label="marketplace status"
        >
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
      {listings.length === 0 ? (
        <div style={{ color: "#7d899b", marginTop: 4 }}>0 matching listings</div>
      ) : (
        listings.slice(0, 5).map((listing) => {
          const primary = marketplacePrimaryAction(listing);
          return (
            <div data-testid={`listing-row-${listing.id}`} key={listing.id} style={{ borderTop: "1px solid #242a33", marginTop: 5, paddingTop: 5 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: 4, alignItems: "center" }}>
                <span style={{ color: "#cfd6df", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {listing.title}
                </span>
                <button onClick={() => onUsage(listing, "view")} style={btn}>
                  view
                </button>
                <button onClick={() => onUsage(listing, primary.event)} style={btn}>
                  {primary.label}
                </button>
              </div>
              <MiniRows
                rows={[
                  ["kind", listing.kind],
                  ["status", listing.status],
                  ["price", `${listing.priceCredits} credits`],
                  ["license", listing.licenseClass ?? "attached"],
                  ["policy", listing.exportPolicy],
                  ["economics", "usage beta"],
                ]}
              />
            </div>
          );
        })
      )}
    </div>
  );
}

function marketplacePrimaryAction(listing: ListingRecord): { event: MarketplaceUsageEvent; label: string } {
  const kind = marketplaceListingKind(listing.kind);
  if (kind === "policy" || kind === "skill") return { event: "policy-download", label: "policy" };
  if (kind === "component") return { event: "quote-click", label: "quote" };
  if (kind === "course") return { event: "training-job", label: "train" };
  return { event: "equip", label: "equip" };
}

function uniqueListingKinds(listings: ListingRecord[]): (MarketplaceListingKind | "all")[] {
  return ["all", ...new Set(listings.map((listing) => marketplaceListingKind(listing.kind)))];
}

function uniqueListingStatuses(listings: ListingRecord[]): string[] {
  return ["all", ...new Set(listings.map((listing) => listing.status).filter((status) => status.trim()))];
}

function toMarketplaceKindFilter(value: string): MarketplaceListingKind | "all" {
  return value === "all" ? "all" : marketplaceListingKind(value);
}

function toCourseVisibility(value: string): CourseVisibility {
  return value === "private" || value === "public" ? value : "unlisted";
}

type LeaderboardStatusFilter = "all" | "verified" | "held";

interface LeaderboardBoardRow {
  run: LeaderboardRunRecord;
  rank: number;
  archetype: string;
  className: string;
  frameCount: number | null;
  durationS: number | null;
  tamperHash: string | null;
  rejectReason: string | null;
  clientClaim: boolean | null;
}

function LeaderboardBoard({
  course,
  runs,
  archetypeFilter,
  classFilter,
  statusFilter,
  onArchetypeFilter,
  onClassFilter,
  onStatusFilter,
}: {
  course: CourseRecord | null;
  runs: LeaderboardRunRecord[];
  archetypeFilter: string;
  classFilter: string;
  statusFilter: LeaderboardStatusFilter;
  onArchetypeFilter: (value: string) => void;
  onClassFilter: (value: string) => void;
  onStatusFilter: (value: LeaderboardStatusFilter) => void;
}) {
  const rows = runs.map((run, index) => leaderboardRow(run, index, course));
  const archetypes = uniqueOptions([...courseArchetypes(course), ...rows.map((row) => row.archetype)]);
  const classes = uniqueOptions(rows.map((row) => row.className));
  const visibleRows = rows.filter((row) => {
    if (archetypeFilter !== "all" && row.archetype !== archetypeFilter) return false;
    if (classFilter !== "all" && row.className !== classFilter) return false;
    if (statusFilter === "verified" && !row.run.verified) return false;
    if (statusFilter === "held" && row.run.verified) return false;
    return true;
  });
  const verifiedCount = rows.filter((row) => row.run.verified).length;
  const courseTasks = courseTaskLabels(course);
  const courseReport = asRecord(course?.validatorReport);

  return (
    <div style={artifactRowStyle}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: "#8fa3bf", flex: 1 }}>leaderboard</span>
        <span style={{ color: "#7d899b" }}>
          {verifiedCount}/{rows.length} verified
        </span>
      </div>
      <MiniRows
        rows={[
          ["course", course?.name],
          ["tasks", courseTasks.length ? courseTasks.join(", ") : undefined],
          ["archetypes", archetypes.length ? archetypes.join(", ") : undefined],
          ["env", typeof courseReport?.verdict === "string" ? courseReport.verdict : undefined],
        ]}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginTop: 6 }}>
        <select
          aria-label="leaderboard archetype"
          value={archetypeFilter}
          onChange={(event) => onArchetypeFilter(event.target.value)}
          style={{ ...selectStyle, width: "100%" }}
        >
          <option value="all">all archetypes</option>
          {archetypes.map((archetype) => (
            <option key={archetype} value={archetype}>
              {archetype}
            </option>
          ))}
        </select>
        <select
          aria-label="leaderboard class"
          value={classFilter}
          onChange={(event) => onClassFilter(event.target.value)}
          style={{ ...selectStyle, width: "100%" }}
        >
          <option value="all">all classes</option>
          {classes.map((className) => (
            <option key={className} value={className}>
              {className}
            </option>
          ))}
        </select>
        <select
          aria-label="leaderboard verification status"
          value={statusFilter}
          onChange={(event) => onStatusFilter(toLeaderboardStatusFilter(event.target.value))}
          style={{ ...selectStyle, width: "100%" }}
        >
          <option value="all">all runs</option>
          <option value="verified">verified</option>
          <option value="held">held</option>
        </select>
      </div>
      {visibleRows.length === 0 ? (
        <div style={{ color: "#7d899b", marginTop: 4 }}>{rows.length === 0 ? "0 runs" : "0 runs match filters"}</div>
      ) : (
        visibleRows.slice(0, 8).map((row) => (
          <div key={row.run.id} style={artifactRowStyle}>
            <div style={{ color: row.run.verified ? "#7dd87d" : "#e6a23c" }}>
              #{row.rank} · score {row.run.score.toFixed(1)} · {row.run.verified ? "verified" : "held"}
            </div>
            <MiniRows
              rows={[
                ["archetype", row.archetype],
                ["class", row.className],
                ["frames", row.frameCount],
                ["duration", row.durationS === null ? undefined : `${row.durationS.toFixed(2)} s`],
                ["claim", row.clientClaim === null ? undefined : row.clientClaim ? "verified" : "not verified"],
                ["hash", shortHash(row.tamperHash)],
                ["reject", row.rejectReason],
                ["created", shortTime(row.run.createdAt)],
              ]}
            />
          </div>
        ))
      )}
    </div>
  );
}

function leaderboardRow(run: LeaderboardRunRecord, index: number, course: CourseRecord | null): LeaderboardBoardRow {
  const verification = asRecord(run.verification);
  const header = asRecord(verification?.header);
  const courseTypes = courseArchetypes(course);
  return {
    run,
    rank: index + 1,
    archetype:
      firstString(header?.archetype, header?.modelArchetype, header?.contractArchetype, verification?.archetype) ??
      (courseTypes.length === 1 ? courseTypes[0] : "unspecified"),
    className: firstString(header?.class, header?.modelClass, header?.boardClass, verification?.class) ?? "unspecified",
    frameCount: numberOrNull(verification?.frameCount),
    durationS: numberOrNull(verification?.durationS),
    tamperHash: typeof verification?.tamperHash === "string" ? verification.tamperHash : null,
    rejectReason: typeof verification?.rejectReason === "string" ? verification.rejectReason : null,
    clientClaim: typeof verification?.clientClaim === "boolean" ? verification.clientClaim : null,
  };
}

function courseArchetypes(course: CourseRecord | null): string[] {
  const spec = asRecord(course?.envSpec);
  if (!spec) return [];
  const values: string[] = [];
  appendStringOrArray(values, spec.archetypeFilter);
  if (Array.isArray(spec.spawns)) {
    for (const spawn of spec.spawns) {
      appendStringOrArray(values, asRecord(spawn)?.archetypeFilter);
    }
  }
  return uniqueOptions(values);
}

function courseTaskLabels(course: CourseRecord | null): string[] {
  const spec = asRecord(course?.envSpec);
  if (!spec) return [];
  const values: string[] = [];
  appendStringOrArray(values, spec.tasks);
  if (typeof spec.kind === "string") values.push(spec.kind);
  return uniqueOptions(values);
}

function appendStringOrArray(out: string[], value: unknown) {
  if (typeof value === "string" && value.trim()) {
    out.push(value.trim());
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) out.push(item.trim());
    }
  }
}

function uniqueOptions(values: string[]): string[] {
  return [...new Set(values.filter((value) => value))].sort((a, b) => a.localeCompare(b));
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function toLeaderboardStatusFilter(value: string): LeaderboardStatusFilter {
  return value === "verified" || value === "held" ? value : "all";
}

function shortHash(value: string | null): string | undefined {
  return value ? value.slice(0, 12) : undefined;
}

function JobDetails({
  job,
  onApplyPatch,
  onSaveCandidate,
  onPlayPolicy,
}: {
  job: JobRecord;
  onApplyPatch: (ops: JsonPatchOp[]) => void;
  onSaveCandidate: (candidate: CodesignCandidate) => void;
  onPlayPolicy: (output: PolicyOutput, artifactId?: string) => void;
}) {
  if (job.error) {
    return <div style={{ color: "#e66" }}>{job.error}</div>;
  }
  const output = job.output;
  if (!output) {
    return <div style={{ color: "#7d899b" }}>no output yet</div>;
  }
  if (!isKnownJobOutput(output)) {
    return <JsonPreview value={output} />;
  }
  switch (output.artifactKind) {
    case "photoscan": {
      const acceptance = output.acceptance;
      return (
        <div style={jobDetailStyle}>
          <MiniRows
            rows={[
              ["D13", acceptance?.pass ? "pass" : "review"],
              ["coverage", formatMaybePercent(acceptance?.fitCoveragePct, 0)],
              ["Hausdorff", formatMaybePercent(acceptance?.hausdorffPct, 2)],
              ["cache", output.objectCache?.key],
              ["candidate", output.candidateComponent?.id ?? formatConfidence(output.candidateComponent?.confidence)],
            ]}
          />
          {output.primitiveRefit?.length ? (
            <div style={{ color: "#7d899b" }}>
              refit {output.primitiveRefit.map((row) => `${row.kind ?? "primitive"} ${formatConfidence(row.confidence)}`).join(" · ")}
            </div>
          ) : null}
        </div>
      );
    }
    case "policy": {
      const scorecard = output.scorecard;
      const success = numberOrNull(scorecard?.successRate ?? scorecard?.returnMean);
      return (
        <div style={jobDetailStyle}>
          <MiniRows
            rows={[
              ["task", output.task?.id ?? scorecard?.task],
              ["success", success === null ? undefined : formatPercent(success)],
              ["energy", scorecard?.energyWh === undefined ? undefined : `${scorecard.energyWh.toFixed(1)} Wh`],
              ["export", scorecard?.exportable === undefined ? scorecard?.exportGate : scorecard.exportable ? "allowed" : "blocked"],
              ["onnx", output.onnx?.path ?? output.onnx?.cacheKey],
            ]}
          />
          {scorecard?.robustness ? <RobustnessGrid values={scorecard.robustness} /> : null}
          <div style={{ color: "#7d899b" }}>
            {(output.io?.observations?.length ?? 0)} obs · {(output.io?.actions?.length ?? 0)} actions
          </div>
          <button
            data-testid="policy-play"
            disabled={scorecard?.exportable !== true}
            onClick={() => onPlayPolicy(output, output.delivery?.policyArtifactId)}
            style={{ ...btn, marginTop: 4 }}
          >
            play
          </button>
          {scorecard?.reasons?.length ? (
            <div style={{ color: "#e6a23c" }}>{scorecard.reasons.join(" · ")}</div>
          ) : null}
        </div>
      );
    }
    case "codesign": {
      const controlled = controlledCodesignDisclosure(output);
      const controlledClaimed = output.schemaVersion !== undefined;
      const tier0Label = controlled
        ? `${controlled.tier0MaxMs.toFixed(1)}/${controlled.tier0BudgetMs.toFixed(0)} ms`
        : undefined;
      return (
        <div style={jobDetailStyle}>
          <div style={{ color: "#7d899b" }}>
            {(output.pareto?.length ?? 0)} Pareto · {(output.candidates?.length ?? 0)} candidates
          </div>
          {controlled ? (
            <div data-testid="codesign-maturity" style={{ color: "#7dd87d" }}>
              controlled engine smoke · native + Rapier + MuJoCo
              {tier0Label ? ` · tier 0 ${tier0Label}` : ""}
            </div>
          ) : controlledClaimed ? (
            <div data-testid="codesign-maturity" style={{ color: "#e66" }}>
              controlled engine evidence refused · version, engine, tier, lineage, or nonclaim drift
            </div>
          ) : null}
          {controlled ? (
            <div style={{ color: "#e6a23c" }}>
              tier 3 held · no CMA-ES/Optuna overnight run · no trained finalist/build/field claim
            </div>
          ) : null}
          <ParetoPlot candidates={output.pareto ?? output.candidates ?? []} />
          {(output.pareto ?? output.candidates ?? []).slice(0, 5).map((candidate) => (
            <div key={candidate.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 6, alignItems: "center" }}>
              <span style={{ color: candidate.admitted ? "#7dd87d" : "#e6a23c", overflow: "hidden", textOverflow: "ellipsis" }}>
                {candidate.id} · {candidate.tier ?? "tier"} · {formatMetrics(candidate.metrics)}
              </span>
              <button
                disabled={(controlledClaimed && !controlled) || !isPatchList(candidate.patch)}
                onClick={() => candidate.patch && onApplyPatch(candidate.patch)}
                style={btn}
              >
                apply
              </button>
              <button
                disabled={(controlledClaimed && !controlled) || !candidate.admitted || !isPatchList(candidate.patch)}
                onClick={() => onSaveCandidate(candidate)}
                style={btn}
              >
                save
              </button>
            </div>
          ))}
        </div>
      );
    }
    case "replay":
    case "telemetry-replay":
      return (
        <div style={jobDetailStyle}>
          <MiniRows
            rows={[
              ["verified", output.verified === undefined ? undefined : output.verified ? "yes" : "no"],
              ["frames", output.frameCount],
              ["duration", output.durationS === undefined ? undefined : `${output.durationS.toFixed(2)} s`],
              ["hash", output.tamperHash ?? output.tapeHash],
              ["reject", output.rejectReason ?? undefined],
            ]}
          />
        </div>
      );
    case "bridge-config":
      return (
        <div style={jobDetailStyle}>
          <MiniRows rows={[["schema", output.schemaVersion], ["firmware", `${output.firmware} ${output.firmwareVersion ?? "unverified"}`], ["confirm", output.requiresPhysicalConfirmation ? "required" : "no"], ["auto-arm", output.noAutoArm ? "forbidden" : "unverified"], ["hash", output.diffHash]]} />
          {output.lines?.length ? <CodeLines lines={output.lines.slice(0, 4)} /> : null}
        </div>
      );
    case "supervisor-decision":
      return (
        <div style={jobDetailStyle}>
          <MiniRows
            rows={[
              ["command", output.command],
              ["policy", output.allowPolicy ? "allowed" : "held"],
              ["rates", `${output.rateHz?.policyAdvisory ?? 50}/${output.rateHz?.supervisor ?? 200} Hz`],
            ]}
          />
          {output.reasons?.length ? <div style={{ color: "#e6a23c" }}>{output.reasons.join(" · ")}</div> : null}
        </div>
      );
    case "wear-estimate":
      return (
        <div style={jobDetailStyle}>
          <MiniRows
            rows={[
              ["motor", output.motorHours === undefined ? undefined : `${output.motorHours.toFixed(2)} h`],
              ["packs", output.packCycles === undefined ? undefined : output.packCycles.toFixed(2)],
              ["Rint", output.rIntMohm == null ? undefined : `${output.rIntMohm.toFixed(1)} mOhm`],
            ]}
          />
          {output.warnings?.length ? <div style={{ color: "#e6a23c" }}>{output.warnings.join(" · ")}</div> : null}
        </div>
      );
    case "crash-forensics":
      return (
        <div style={jobDetailStyle}>
          <MiniRows
            rows={[
              ["crash", output.crashDetected ? "detected" : "no"],
              ["window", output.window ? `${output.window.startS ?? 0}-${output.window.endS ?? 0} s` : "none"],
              ["impact", output.window?.impactS === undefined ? undefined : `${output.window.impactS} s`],
              ["ghost", output.ghostOverlay?.enabled ? output.ghostOverlay.divergenceMetric ?? "enabled" : "off"],
            ]}
          />
        </div>
      );
    case "repair-sheet":
      return (
        <div style={jobDetailStyle}>
          <MiniRows rows={[["steps", output.steps?.length ?? 0], ["reorder", output.reorderCount ?? 0]]} />
          {output.steps?.slice(0, 3).map((step) => (
            <div key={`${step.order}-${step.partIndex}`} style={{ color: "#7d899b" }}>
              {step.order}. {step.action ?? "inspect"} {step.reorderSku ? `· ${step.reorderSku}` : ""}
            </div>
          ))}
        </div>
      );
    case "fleet-summary":
      return (
        <div style={jobDetailStyle}>
          <MiniRows rows={[["vehicles", output.vehicleCount ?? 0], ["critical", output.criticalCount ?? 0], ["due", output.serviceDueCount ?? 0]]} />
          {output.nextActions?.slice(0, 3).map((action) => (
            <div key={`${action.vehicleId}-${action.action}`} style={{ color: "#7d899b" }}>
              {action.vehicleId ?? "vehicle"} · {action.action ?? "review"}
            </div>
          ))}
        </div>
      );
    case "sysid":
      return (
        <div style={jobDetailStyle}>
          <MiniRows
            rows={[
              ["samples", output.sampleCount],
              ["accepted", output.fit?.accepted ? "yes" : "no"],
              ["Rint", output.fit?.rIntMohm == null ? undefined : `${output.fit.rIntMohm.toFixed(1)} mOhm`],
              ["patches", output.simPatch?.length ?? 0],
              ["reject", output.rejectReason ?? undefined],
            ]}
          />
        </div>
      );
  }
}

function MiniRows({ rows }: { rows: [string, unknown][] }) {
  return (
    <div>
      {rows
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([key, value]) => (
          <div key={key} style={{ display: "grid", gridTemplateColumns: "72px minmax(0, 1fr)", gap: 8 }}>
            <span style={{ color: "#7d899b" }}>{key}</span>
            <span style={{ color: "#cfd6df", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{String(value)}</span>
          </div>
        ))}
    </div>
  );
}

function RobustnessGrid({ values }: { values: Record<string, number> }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4, marginTop: 3 }}>
      {Object.entries(values).map(([key, value]) => (
        <div key={key} style={{ border: "1px solid #242a33", padding: "2px 4px", color: value >= 0.8 ? "#7dd87d" : "#e6a23c" }}>
          {key} {formatPercent(value)}
        </div>
      ))}
    </div>
  );
}

function ParetoPlot({ candidates }: { candidates: { id: string; metrics?: { massG?: number; enduranceMin?: number; score?: number } }[] }) {
  if (candidates.length === 0) return null;
  const masses = candidates.map((c) => c.metrics?.massG).filter((v): v is number => typeof v === "number");
  const endurance = candidates.map((c) => c.metrics?.enduranceMin).filter((v): v is number => typeof v === "number");
  if (masses.length === 0 || endurance.length === 0) return null;
  const minMass = Math.min(...masses);
  const maxMass = Math.max(...masses);
  const minEndurance = Math.min(...endurance);
  const maxEndurance = Math.max(...endurance);
  const scale = (value: number, min: number, max: number, size: number) =>
    max - min < 1e-9 ? size / 2 : ((value - min) / (max - min)) * size;
  return (
    <svg width="100%" height="54" viewBox="0 0 160 54" role="img" aria-label="Pareto front" style={{ display: "block", margin: "4px 0" }}>
      <line x1="14" y1="44" x2="154" y2="44" stroke="#2a2f38" />
      <line x1="14" y1="4" x2="14" y2="44" stroke="#2a2f38" />
      {candidates.map((candidate, index) => {
        const mass = candidate.metrics?.massG ?? minMass;
        const end = candidate.metrics?.enduranceMin ?? minEndurance;
        const x = 14 + scale(mass, minMass, maxMass, 132);
        const y = 44 - scale(end, minEndurance, maxEndurance, 34);
        return <circle key={candidate.id} cx={x} cy={y} r="3.5" fill={index === 0 ? "#39c8ff" : "#7dd87d"} />;
      })}
    </svg>
  );
}

function CodeLines({ lines }: { lines: string[] }) {
  return (
    <pre style={{ margin: "3px 0 0", color: "#8fa3bf", whiteSpace: "pre-wrap", fontSize: 11 }}>
      {lines.join("\n")}
    </pre>
  );
}

function JsonPreview({ value }: { value: unknown }) {
  return (
    <details style={jobDetailStyle}>
      <summary style={{ color: "#7d899b", cursor: "pointer" }}>{artifactKind(value) ?? "json"} output</summary>
      <pre style={{ margin: 0, color: "#8fa3bf", whiteSpace: "pre-wrap", maxHeight: 110, overflow: "auto" }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatMaybePercent(value: unknown, digits: number): string | undefined {
  return typeof value === "number" ? `${value.toFixed(digits)}%` : undefined;
}

function formatConfidence(value: unknown): string {
  return typeof value === "number" ? formatPercent(value) : "n/a";
}

function formatMetrics(metrics: unknown): string {
  const record = asRecord(metrics);
  if (!record) return "metrics pending";
  const parts = [
    typeof record.score === "number" ? `score ${record.score.toFixed(2)}` : null,
    typeof record.massG === "number" ? `${record.massG.toFixed(0)} g` : null,
    typeof record.enduranceMin === "number" ? `${record.enduranceMin.toFixed(1)} min` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "metrics pending";
}

function shortTime(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : value;
}

function fixtureEnvSpec(): unknown {
  return {
    schemaVersion: "1.0.0",
    id: "fixture-slalom",
    name: "Fixture slalom",
    version: "1.0.0",
    kind: "slalom",
    boundsM: [20, 6, 20],
    terrain: { kind: "flat" },
    tasks: ["gate-slalom"],
    spawns: [{ id: "start", pose: { p: [0, 0, 0] }, archetypeFilter: ["multirotor"] }],
    gates: [{ id: "g1", pose: { p: [4, 1, 0] }, widthM: 1.2, heightM: 0.8 }],
    win: { gateOrder: ["g1"], timeLimitS: 30, contactPenalties: true },
  };
}

function readCourseIdParam(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("course");
  return value && value.trim() ? value : null;
}

function courseUrlFor(courseId: string): string {
  if (typeof window === "undefined") return `?course=${encodeURIComponent(courseId)}`;
  const url = new URL(window.location.href);
  url.searchParams.set("course", courseId);
  url.hash = "";
  return url.toString();
}

function replaceCourseUrl(courseId: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("course", courseId);
  url.hash = "";
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

function verdictColor(verdict: string): string {
  switch (verdict) {
    case "admitted":
      return "#7dd87d";
    case "draft":
    case "blocked":
      return "#e6a23c";
    case "rejected":
    case "error":
      return "#e66";
    case "running":
      return "#39c8ff";
    default:
      return "#7d899b";
  }
}

function formatUsage(usage: unknown): string | null {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const record = usage as Record<string, unknown>;
  const input = record.input_tokens;
  const output = record.output_tokens;
  if (typeof input === "number" && typeof output === "number") {
    return `${input} in · ${output} out tokens`;
  }
  const parts = Object.entries(record)
    .filter((entry): entry is [string, string | number] =>
      typeof entry[1] === "string" || typeof entry[1] === "number",
    )
    .slice(0, 3)
    .map(([key, value]) => `${key} ${value}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function parseCategories(value: string): string[] {
  return [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))].sort();
}

function boundedInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function ReviewItem({
  item,
  busy,
  reviewNote,
  exportPolicy,
  onNoteChange,
  onExportPolicyChange,
  onApprove,
  onReject,
}: {
  item: ReviewQueueItem;
  busy: boolean;
  reviewNote: string;
  exportPolicy: ReviewExportPolicy;
  onNoteChange: (value: string) => void;
  onExportPolicyChange: (value: ReviewExportPolicy) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const label = reviewLabel(item);
  return (
    <div data-testid={`review-item-${item.id}`} style={{ borderTop: "1px solid #242a33", padding: "7px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ color: "#cfd6df", wordBreak: "break-word" }}>{label}</span>
        <span style={{ color: item.confidence < 0.8 ? "#e6a23c" : "#7dd87d" }}>
          {Math.round(item.confidence * 100)}%
        </span>
      </div>
      <div style={{ color: "#7d899b", wordBreak: "break-word" }}>
        {item.artifactKind} · {item.reason}
      </div>
      <div style={{ color: "#7d899b", wordBreak: "break-word" }}>{item.artifactId}</div>
      {item.status === "needs_review" ? (
        <>
          <select
            data-testid={`review-policy-${item.id}`}
            value={exportPolicy}
            onChange={(event) => onExportPolicyChange(event.target.value as ReviewExportPolicy)}
            style={{ ...selectStyle, width: "100%", marginTop: 5 }}
          >
            {REVIEW_EXPORT_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {policy}
              </option>
            ))}
          </select>
          <textarea
            data-testid={`review-note-${item.id}`}
            value={reviewNote}
            onChange={(event) => onNoteChange(event.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="review note"
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: 5,
              resize: "vertical",
              background: "#16181c",
              color: "#cfd6df",
              border: "1px solid #2a2f38",
              borderRadius: 4,
              fontSize: 11,
            }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
            <button data-testid={`review-approve-${item.id}`} onClick={onApprove} disabled={busy} style={btn}>
              approve
            </button>
            <button data-testid={`review-reject-${item.id}`} onClick={onReject} disabled={busy} style={dangerBtn}>
              reject
            </button>
          </div>
        </>
      ) : (
        <div style={{ color: "#7d899b", marginTop: 5 }}>
          {item.status}
          {item.reviewer ? ` · ${item.reviewer}` : ""}
          {item.exportPolicy ? ` · ${item.exportPolicy}` : ""}
          {item.reviewNote ? <div style={{ wordBreak: "break-word" }}>{item.reviewNote}</div> : null}
        </div>
      )}
    </div>
  );
}

function defaultReviewExportPolicy(item?: ReviewQueueItem): ReviewExportPolicy {
  if (item?.payload && typeof item.payload === "object") {
    const payload = item.payload as { license?: { exportPolicy?: unknown } };
    const policy = payload.license?.exportPolicy;
    if (typeof policy === "string" && REVIEW_EXPORT_POLICIES.includes(policy as ReviewExportPolicy)) {
      return policy as ReviewExportPolicy;
    }
  }
  return item?.artifactKind === "reference-rig" ? "assembly-policy-derived" : "envelope-link-out";
}

function reviewLabel(item: ReviewQueueItem): string {
  if (item.payload && typeof item.payload === "object") {
    const payload = item.payload as {
      brand?: unknown;
      model?: unknown;
      name?: unknown;
      id?: unknown;
    };
    if (typeof payload.name === "string") return payload.name;
    if (typeof payload.brand === "string" && typeof payload.model === "string") {
      return `${payload.brand} ${payload.model}`;
    }
    if (typeof payload.id === "string") return payload.id;
  }
  return item.artifactId;
}
