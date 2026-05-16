import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListProjectsTool } from "./tools/list-projects.mjs";
import { registerListTreeTool } from "./tools/list-tree.mjs";
import { registerReadFileTool } from "./tools/read-file.mjs";
import { registerRunOpTool } from "./tools/run-op-tool.mjs";

export function createReadonlyMcpServer() {
  const server = new McpServer(
    {
      name: "local-project-gateway-http-mcp",
      version: "0.6.0"
    },
    {
      instructions:
        "Readonly local project gateway. Tools may list whitelisted projects, list a project tree, read files from whitelisted project roots, and run predefined read-only diagnostic operations. OAuth protects the HTTP MCP endpoint. No remote file write, delete, arbitrary shell, git pull, npm install, service install, token, ssh key, or env file access."
    }
  );

  registerListProjectsTool(server);
  registerListTreeTool(server);
  registerReadFileTool(server);
  registerRunOpTool(server);

  return server;
}
