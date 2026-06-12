// FORGE gateway — thin, typed, boring (plan §6). Routes are schema-validated
// (TypeBox); heavy work goes to the queue or the validator binary; compute
// workers have no public surface.
import { Type } from "@sinclair/typebox";
import Fastify, { type FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { runBake, runValidator, validatorBin } from "./validator.js";

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });

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
          { contract: Type.Unknown() },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const { contract } = request.body as { contract: unknown };
      const json = typeof contract === "string" ? contract : JSON.stringify(contract);
      const result = await runValidator(json);
      if (result.exitCode === -1 || result.report === null) {
        return reply.status(503).send({
          error: "validator unavailable",
          detail: result.stderr.slice(0, 500),
        });
      }
      const verdict = (result.report as { verdict?: string }).verdict;
      // Admission gate: the sovereign validator's verdict drives the status.
      return reply.status(verdict === "admitted" ? 200 : 422).send(result.report);
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
