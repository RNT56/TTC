// FORGE gateway — thin, typed, boring (plan §6). Routes are schema-validated
// (TypeBox); heavy work goes to the queue or the validator binary; compute
// workers have no public surface.
import { Type } from "@sinclair/typebox";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { gatewayDb, type GatewayDb } from "./db.js";
import {
  ANTHROPIC_MODEL_PINS,
  buildGenerationContext,
  runGeneration,
  type AnthropicTransport,
  type GenerationArchetype,
  type GenerationMaterials,
  type GenerationProvider,
  type GenerationRequest,
  type GenerationValidator,
  type SynthesisAdapter,
} from "./generation.js";
import {
  listReviewQueue,
  recordReviewDecision,
  type ReviewDecision,
  type ReviewExportPolicy,
  type ReviewStatus,
} from "./reviewQueue.js";
import { runBake, runBom, runValidator, validatorBin } from "./validator.js";

export interface ServerOptions {
  db?: GatewayDb;
  reviewToken?: string | null;
  generationMaterials?: GenerationMaterials;
  generationAdapter?: SynthesisAdapter;
  generationValidator?: GenerationValidator;
  anthropicTransport?: AnthropicTransport;
  anthropicBaseUrl?: string;
}

const reviewStatusSchema = Type.Union([
  Type.Literal("needs_review"),
  Type.Literal("approved"),
  Type.Literal("rejected"),
]);

const reviewDecisionSchema = Type.Union([Type.Literal("approved"), Type.Literal("rejected")]);
const generationArchetypeSchema = Type.Union([
  Type.Literal("biped"),
  Type.Literal("multirotor"),
  Type.Literal("rover"),
  Type.Literal("arm"),
  Type.Literal("quadruped"),
  Type.Literal("fixedwing"),
]);
const generationProviderSchema = Type.Union([
  Type.Literal("template"),
  Type.Literal("anthropic"),
]);
const reviewExportPolicySchema = Type.Union([
  Type.Literal("full-geometry-ok"),
  Type.Literal("attribution-manifest-required"),
  Type.Literal("envelope-link-out"),
  Type.Literal("envelope-only"),
  Type.Literal("bom-only"),
  Type.Literal("blocked"),
  Type.Literal("assembly-policy-derived"),
]);

function unavailable(error: unknown): { error: string; detail: string } {
  const detail = error instanceof Error ? error.message : String(error);
  return { error: "catalog database unavailable", detail: detail.slice(0, 500) };
}

function reviewAuthorized(request: FastifyRequest, reviewToken: string | null): boolean {
  if (!reviewToken) return true;
  return request.headers.authorization === `Bearer ${reviewToken}`;
}

function generationApiKeyHeader(request: FastifyRequest): string | undefined {
  const value = request.headers["x-forge-anthropic-key"];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const db = options.db ?? {
    query: (text, params) => gatewayDb().query(text, params),
  } satisfies GatewayDb;
  const reviewToken = options.reviewToken ?? process.env.FORGE_REVIEW_TOKEN ?? null;

  app.get("/healthz", async () => ({
    ok: true,
    service: "forge-gateway",
    validatorBin: validatorBin(),
    validatorPresent: existsSync(validatorBin()),
  }));

  app.post(
    "/v1/validate",
    {
      schema: {
        body: Type.Object(
          { contract: Type.Unknown(), asDraft: Type.Optional(Type.Boolean()) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const { contract, asDraft } = request.body as { contract: unknown; asDraft?: boolean };
      const json = typeof contract === "string" ? contract : JSON.stringify(contract);
      const result = await runValidator(json, asDraft ?? false);
      if (result.exitCode === -1 || result.report === null) {
        return reply.status(503).send({
          error: "validator unavailable",
          detail: result.stderr.slice(0, 500),
        });
      }
      const verdict = (result.report as { verdict?: string }).verdict;
      // Admission gate: the sovereign validator's verdict drives the status.
      // A draft is a SUCCESSFUL save-as-draft (D14): the document persists as
      // editable with its diagnostics, but can never train/export/share —
      // enforced at those surfaces as they land (P4+/P7).
      return reply.status(verdict === "rejected" ? 422 : 200).send(result.report);
    },
  );

  app.post(
    "/v1/bake",
    {
      schema: {
        body: Type.Object({ contract: Type.Unknown() }, { additionalProperties: false }),
      },
    },
    async (request, reply) => {
      const { contract } = request.body as { contract: unknown };
      const json = typeof contract === "string" ? contract : JSON.stringify(contract);
      const result = await runBake(json);
      if (result.exitCode === -1 || result.report === null) {
        return reply.status(result.exitCode === -1 ? 503 : 422).send({
          error: "bake failed",
          detail: result.stderr.slice(0, 500),
        });
      }
      return reply.send(result.report);
    },
  );

  app.post(
    "/v1/bom",
    {
      schema: {
        body: Type.Object({ contract: Type.Unknown() }, { additionalProperties: false }),
      },
    },
    async (request, reply) => {
      const { contract } = request.body as { contract: unknown };
      const json = typeof contract === "string" ? contract : JSON.stringify(contract);
      const result = await runBom(json);
      if (result.exitCode === -1 || result.report === null) {
        return reply.status(result.exitCode === -1 ? 503 : 422).send({
          error: "bom failed",
          detail: result.stderr.slice(0, 500),
        });
      }
      return reply.send(result.report);
    },
  );

  app.post(
    "/v1/generate/context",
    {
      schema: {
        body: Type.Object(
          {
            prompt: Type.String({ minLength: 1, maxLength: 4000 }),
            archetype: Type.Optional(generationArchetypeSchema),
            categories: Type.Optional(
              Type.Array(Type.String({ minLength: 1, maxLength: 80 }), { maxItems: 16 }),
            ),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
            includePrefixText: Type.Optional(Type.Boolean()),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const body = request.body as {
        prompt: string;
        archetype?: GenerationArchetype;
        categories?: string[];
        limit?: number;
        includePrefixText?: boolean;
      };
      try {
        const context = await buildGenerationContext(db, body, options.generationMaterials);
        return reply.send(context);
      } catch (error) {
        return reply.status(503).send(unavailable(error));
      }
    },
  );

  app.get("/v1/generate/models", async () => ({
    models: ANTHROPIC_MODEL_PINS,
  }));

  app.post(
    "/v1/generate",
    {
      schema: {
        body: Type.Object(
          {
            prompt: Type.String({ minLength: 1, maxLength: 4000 }),
            archetype: Type.Optional(generationArchetypeSchema),
            categories: Type.Optional(
              Type.Array(Type.String({ minLength: 1, maxLength: 80 }), { maxItems: 16 }),
            ),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
            includePrefixText: Type.Optional(Type.Boolean()),
            provider: Type.Optional(generationProviderSchema),
            seed: Type.Optional(Type.Integer({ minimum: 0 })),
            maxRepairIterations: Type.Optional(Type.Integer({ minimum: 0, maximum: 3 })),
            anthropicApiKey: Type.Optional(Type.String({ minLength: 1, maxLength: 4096 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const body = request.body as GenerationRequest;
        const result = await runGeneration(db, {
          ...body,
          provider: (body.provider ?? "template") as GenerationProvider,
          anthropicApiKey: generationApiKeyHeader(request) ?? body.anthropicApiKey,
        }, {
          materials: options.generationMaterials,
          adapter: options.generationAdapter,
          anthropicTransport: options.anthropicTransport,
          anthropicBaseUrl: options.anthropicBaseUrl,
          validator: options.generationValidator,
        });
        return reply.status(result.verdict === "blocked" ? 409 : 200).send(result);
      } catch (error) {
        return reply.status(503).send(unavailable(error));
      }
    },
  );

  app.get(
    "/v1/reviews",
    {
      schema: {
        querystring: Type.Object(
          {
            status: Type.Optional(reviewStatusSchema),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
            exportPolicy: Type.Optional(reviewExportPolicySchema),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      if (!reviewAuthorized(request, reviewToken)) {
        return reply.status(401).send({ error: "review auth required" });
      }
      const query = request.query as {
        status?: ReviewStatus;
        limit?: number;
        exportPolicy?: ReviewExportPolicy;
      };
      try {
        const items = await listReviewQueue(
          db,
          query.status ?? "needs_review",
          query.limit ?? 50,
          query.exportPolicy,
        );
        return reply.send({ items });
      } catch (error) {
        return reply.status(503).send(unavailable(error));
      }
    },
  );

  app.patch(
    "/v1/reviews/:id",
    {
      schema: {
        params: Type.Object({ id: Type.Integer({ minimum: 1 }) }),
        body: Type.Object(
          {
            status: reviewDecisionSchema,
            reviewer: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
            reviewNote: Type.Optional(Type.String({ maxLength: 2000 })),
            exportPolicy: Type.Optional(reviewExportPolicySchema),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      if (!reviewAuthorized(request, reviewToken)) {
        return reply.status(401).send({ error: "review auth required" });
      }
      const { id } = request.params as { id: number };
      const { status, reviewer, reviewNote, exportPolicy } = request.body as {
        status: ReviewDecision;
        reviewer?: string;
        reviewNote?: string;
        exportPolicy?: ReviewExportPolicy;
      };
      try {
        const item = await recordReviewDecision(db, id, {
          status,
          reviewer: reviewer ?? null,
          reviewNote: reviewNote ?? null,
          exportPolicy: exportPolicy ?? null,
        });
        if (item === null) {
          return reply.status(404).send({ error: "review item not found or already closed" });
        }
        return reply.send(item);
      } catch (error) {
        return reply.status(503).send(unavailable(error));
      }
    },
  );

  // the schemars-emitted JSON Schema — the single source all clients derive
  // from (D16); served for tooling and the generation prompt prefix (P4).
  app.get("/v1/schema", async (_request, reply) => {
    const schema = await new Promise<string | null>((resolve) => {
      execFile(validatorBin(), ["schema"], { timeout: 15_000, maxBuffer: 8 * 1024 * 1024 },
        (error, stdout) => resolve(error ? null : String(stdout)));
    });
    if (schema === null) {
      return reply.status(503).send({ error: "validator unavailable" });
    }
    return reply.type("application/schema+json").send(schema);
  });

  return app;
}
