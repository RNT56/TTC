import { buildServer } from "./server.js";
import { assertDeploymentBootstrap } from "./deployment.js";

assertDeploymentBootstrap();
const port = Number(process.env.PORT ?? 8080);
const app = buildServer();
app
  .listen({ port, host: "0.0.0.0" })
  .then(() => console.log(`forge-gateway listening on :${port}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
