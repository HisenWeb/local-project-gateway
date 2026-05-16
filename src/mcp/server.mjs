import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListProjectsTool } from "./tools/list-projects.mjs";
import { registerListTreeTool } from "./tools/list-tree.mjs";
import { registerReadFileTool } from "./tools/read-file.mjs";
import { registerReadImageTool } from "./tools/read-image.mjs";
import { registerRunOpTool } from "./tools/run-op-tool.mjs";
import { registerOcRunTool } from "./tools/oc-run-tool.mjs";
import { registerOcGetTool } from "./tools/oc-get-tool.mjs";

export function createReadonlyMcpServer() {
  const server = new McpServer(
    {
      name: "local-project-gateway-http-mcp",
      version: "0.8.0"
    },
    {
      instructions:
        "Local project gateway. Tools may list whitelisted projects, list a project tree, read files and images from whitelisted project roots, run predefined read-only diagnostic operations, and start controlled non-interactive OpenCode jobs in whitelisted project roots. OAuth protects the HTTP MCP endpoint. No remote file write/delete API, arbitrary shell, caller-supplied command/args/cwd, automatic git commit/push, npm install, service install, token, ssh key, or env file access."
    }
  );

  registerListProjectsTool(server);
  registerListTreeTool(server);
  registerReadFileTool(server);
  registerReadImageTool(server);
  registerRunOpTool(server);
  registerOcRunTool(server);
  registerOcGetTool(server);

  return server;
}
