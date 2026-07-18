import { buildServer } from "./server.js";
import { assertDeploymentBootstrap } from "./deployment.js";
import { closeGatewayDb } from "./db.js";
import { loadManagedRuntimeSecrets } from "./runtimeSecrets.js";
import { createStdoutObservationSink } from "./observability.js";

loadManagedRuntimeSecrets();
assertDeploymentBootstrap();
const port = Number(process.env.PORT ?? 8080);
const app = buildServer({ observationSink: createStdoutObservationSink() });
let stopping = false;
async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => {
    console.error(`forge-gateway ${signal} shutdown exceeded 25 seconds`);
    process.exit(1);
  }, 25_000);
  deadline.unref();
  try {
    await app.close();
    await closeGatewayDb();
    clearTimeout(deadline);
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
process.once("SIGTERM", () => void stop("SIGTERM"));
process.once("SIGINT", () => void stop("SIGINT"));
app
  .listen({ port, host: "0.0.0.0" })
  .then(() => console.log(`forge-gateway listening on :${port}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
