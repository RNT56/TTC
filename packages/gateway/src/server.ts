// FORGE gateway — thin, typed, boring (plan §6). Routes are schema-validated
// (TypeBox); heavy work goes to the queue or the validator binary; compute
// workers have no public surface.
import { Type } from "@sinclair/typebox";
import Fastify, { type FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { gatewayDb, type GatewayDb } from "./db.js";
import {
  listReviewQueue,
  recordReviewDecision,
  type ReviewDecision,
  type ReviewStatus,
} from "./reviewQueue.js";
import { runBake, runBom, runValidator, validatorBin } from "./validator.js";

export interface ServerOptions {
  db?: GatewayDb;
}

const reviewStatusSchema = Type.Union([
  Type.Literal("needs_review"),
  Type.Literal("approved"),
  Type.Literal("rejected"),
]);

const reviewDecisionSchema = Type.Union([Type.Literal("approved"), Type.Literal("rejected")]);

function unavailable(error: unknown): { error: string; detail: string } {
  const detail = error instanceof Error ? error.message : String(error);
  return { error: "catalog database unavailable", detail: detail.slice(0, 500) };
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const db = options.db ?? {
    query: (text, params) => gatewayDb().query(text, params),
  } satisfies GatewayDb;

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

  app.get(
    "/v1/reviews",
    {
      schema: {
        querystring: Type.Object(
          {
            status: Type.Optional(reviewStatusSchema),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const query = request.query as { status?: ReviewStatus; limit?: number };
      try {
        const items = await listReviewQueue(db, query.status ?? "needs_review", query.limit ?? 50);
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
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: number };
      const { status, reviewer } = request.body as { status: ReviewDecision; reviewer?: string };
      try {
        const item = await recordReviewDecision(db, id, status, reviewer ?? null);
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
