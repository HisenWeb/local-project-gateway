import { createHttpMcpApp } from "./src/http-app.mjs";
import { loadOAuthClients } from "./src/oauth.mjs";
import { config } from "./src/config.mjs";

await loadOAuthClients();

const app = createHttpMcpApp();

app.listen(config.host, config.port, () => {
  console.log(`local-project-gateway HTTP MCP listening on http://${config.host}:${config.port}${config.mcpPath}`);
  console.log(`public MCP resource: ${config.mcpResourceUrl}`);
  console.log(`OAuth enabled: ${config.oauthEnabled}`);
});
