// FORGE gateway — thin, typed, boring (plan §6). Routes are schema-validated
// (TypeBox); heavy work goes to the queue or the validator binary; compute
// workers have no public surface.
import { Type } from "@sinclair/typebox";
import Fastify, { type FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { runValidator, validatorBin } from "./validator.js";

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

  return app;
}
